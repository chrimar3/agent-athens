// Guards the pipeline container's isolation (docker/). A regression here
// re-exposes the Mac to code that handles scraped pages, emails and AI
// enrichment sessions.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse } from 'yaml';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const compose = parse(read('docker/compose.yaml'));
const svc = compose.services.pipeline;

describe('docker/compose.yaml hardening', () => {
  test('non-root, read-only, no capabilities, no privilege escalation', () => {
    expect(String(svc.user)).not.toMatch(/^(0|root)(:|$)/);
    expect(svc.read_only).toBe(true);
    expect(svc.cap_drop).toContain('ALL');
    expect(svc.cap_add).toBeUndefined();
    expect(svc.security_opt).toContain('no-new-privileges:true');
    expect(svc.privileged).toBeFalsy();
    expect(svc.init).toBe(true);
  });

  test('publishes no ports and does not share the host network', () => {
    expect(svc.ports).toBeUndefined();
    expect(svc.network_mode).toBeUndefined();
  });

  test('receives no shared env file (aa-run.sh passes tokens per job)', () => {
    expect(svc.env_file).toBeUndefined();
  });

  test('mounts only the repo and the read-only secrets folder — never the backups', () => {
    const targets = svc.volumes.map((v: string | { target: string }) => (typeof v === 'string' ? v : v.target));
    expect(targets.sort()).toEqual([
      '/home/pwuser/.config/agentathens',
      '/workspace',
      '/workspace/node_modules',
    ]);
    const secrets = svc.volumes.find((v: { target?: string }) => v.target === '/home/pwuser/.config/agentathens');
    expect(secrets.read_only).toBe(true);
    for (const v of svc.volumes) {
      if (typeof v === 'string') continue;
      expect(v.source).not.toMatch(/^(~|\$\{?HOME\}?|\/)$/);
    }
  });

  test('home directory is a fresh tmpfs every run', () => {
    expect(svc.tmpfs.some((t: string) => t.startsWith('/home/pwuser:'))).toBe(true);
  });
});

describe('docker/Dockerfile', () => {
  const dockerfile = read('docker/Dockerfile');
  test('base image pinned by digest', () => {
    expect(dockerfile).toMatch(/ARG BASE_IMAGE=\S+@sha256:[0-9a-f]{64}/);
  });
  test('final user is not root', () => {
    const users = [...dockerfile.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
    expect(users.at(-1)).toBeDefined();
    expect(users.at(-1)).not.toMatch(/^(0|root)$/);
  });
  test('build context is an allowlist that never includes .env or data', () => {
    const ignore = read('docker/Dockerfile.dockerignore').split('\n').filter((l) => l && !l.startsWith('#'));
    expect(ignore[0]).toBe('*');
    expect(ignore.some((l) => /^!.*(\.env|data\/|\.git)/.test(l))).toBe(false);
  });
});

describe('docker/aa-run.sh least privilege', () => {
  const wrapper = read('docker/aa-run.sh');
  const policy = (name: string) => wrapper.split('\n').find((l) => l.trim().startsWith(`${name})`)) ?? '';

  test('enrichment gets only the Claude token, no secrets folder, no .env, read-only .git', () => {
    const line = policy('enrichment');
    expect(line).toContain('TOKENS="CLAUDE_CODE_OAUTH_TOKEN"');
    expect(line).toContain('SECRETS=no');
    expect(line).toContain('DOTENV=no');
    expect(line).toContain('GITRW=no');
  });

  test('the scrape run holds no publishing token; the publish run sees no secrets or .env', () => {
    expect(policy('scrape')).not.toMatch(/GH_TOKEN|NETLIFY_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN/);
    for (const name of ['enrichment', 'visibility', 'site', 'test|shell']) {
      expect(policy(name)).not.toMatch(/GH_TOKEN|NETLIFY_AUTH_TOKEN/);
    }
    expect(policy('publish')).toContain('SECRETS=no');
    expect(policy('publish')).toContain('DOTENV=no');
  });

  test('freshness defers publishing to a separate run when the pipeline supports it', () => {
    expect(wrapper).toMatch(/export AA_DEFER_PUBLISH=1[\s\S]*run_container scrape[\s\S]*run_container publish/);
  });

  test('the token file lives outside every folder a container mounts', () => {
    expect(wrapper).toContain('ENV_FILE="${AA_ENV_FILE:-$STATE_DIR/docker.env}"');
    expect(wrapper).toContain('STATE_DIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}"');
    expect(wrapper).toContain('inside "$ENV_FILE" "$REPO" || inside "$ENV_FILE" "$SECRETS_DIR"');
  });

  test('code paths, .git/config and .git/hooks are mounted read-only', () => {
    const codePaths = (wrapper.match(/CODE_PATHS="([^"]*)"/) ?? ['', ''])[1].split(/\s+/);
    for (const p of ['scripts', 'src', 'config', 'docker', '.claude', '.github', 'package.json', 'bun.lock', 'bunfig.toml']) {
      expect(codePaths).toContain(p);
    }
    expect(wrapper).toContain('$REPO/$p:/workspace/$p:ro');
    expect(wrapper).toContain('.git/config:/workspace/.git/config:ro');
    expect(wrapper).toContain('.git/hooks:/workspace/.git/hooks:ro');
    expect(wrapper).toContain('$REPO/.git:/workspace/.git:ro');
  });

  test('every .env* file is masked for runs without DOTENV', () => {
    expect(wrapper).toContain('for f in "$REPO"/.env*');
  });

  test('env file is parsed, never sourced', () => {
    expect(wrapper).not.toMatch(/^\s*(source|\.)\s+"?\$\{?ENV_FILE/m);
  });

  test('help succeeds and unknown jobs are refused', () => {
    expect(Bun.spawnSync(['bash', join(ROOT, 'docker/aa-run.sh'), 'help']).exitCode).toBe(0);
    expect(Bun.spawnSync(['bash', join(ROOT, 'docker/aa-run.sh'), 'bogus-job']).exitCode).toBe(2);
  });
});

describe('docker/stat-bsd-compat.sh', () => {
  test.skipIf(process.platform !== 'linux')('translates BSD stat forms to GNU', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-stat-'));
    const file = join(dir, 'f');
    writeFileSync(file, 'hello');
    const run = (...args: string[]) =>
      new TextDecoder().decode(Bun.spawnSync(['bash', join(ROOT, 'docker/stat-bsd-compat.sh'), ...args]).stdout).trim();
    const gnu = (fmt: string) => new TextDecoder().decode(Bun.spawnSync(['/usr/bin/stat', '-c', fmt, file]).stdout).trim();
    expect(run('-f', '%m', file)).toBe(gnu('%Y'));
    expect(run('-f%z', file)).toBe('5');
    expect(Bun.spawnSync(['bash', join(ROOT, 'docker/stat-bsd-compat.sh'), '-f', '%Sm', file]).exitCode).toBe(1);
  });
});
