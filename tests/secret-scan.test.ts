/**
 * tests/secret-scan.test.ts — the `secret-scan` check (security loop round 3).
 *
 * The allowlist in .github/gitleaks.toml decides what gitleaks may skip. If the
 * scan read that file from the checkout, a PR could widen the allowlist in the
 * same diff that adds a secret and still get a green check (path-guard flags
 * the file, but the secret-scan result itself would be clean). So
 * .github/scripts/secret-scan.sh reads the config the way path-guard reads its
 * globs — from the DEFAULT branch for pull requests and scheduled runs, and
 * from the commit BEFORE the push for pushes to main (the pipeline pushes to
 * main directly, so a direct push must not widen its own allowlist either).
 * It also neutralises the two other in-repo suppressions gitleaks honours: a
 * `.gitleaksignore` file and inline `gitleaks:allow` comments.
 *
 * Real git repos in a temp dir (an "origin" and a clone with a PR branch); a
 * fake gitleaks records its argv and the config it was handed. No network.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, '.github', 'scripts', 'secret-scan.sh');

const MAIN_CFG = 'title = "main"\n[extend]\nuseDefault = true\n';
const PR_CFG = 'title = "widened-by-pr"\n[extend]\nuseDefault = true\n[[allowlists]]\npaths = [\'\'\'.*\'\'\']\n';

let work: string;
beforeAll(() => { work = mkdtempSync(join(tmpdir(), 'aa-secret-scan-')); });
afterAll(() => { rmSync(work, { recursive: true, force: true }); });

let seq = 0;

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(['git', ...args], {
    cwd, stdout: 'pipe', stderr: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${new TextDecoder().decode(r.stderr)}`);
  return new TextDecoder().decode(r.stdout).trim();
}

/** origin (main: MAIN_CFG) → clone with a `pr` branch that widens the config,
 *  plus a second commit on main so push ranges have a "before". */
function repos(opts: { mainHasConfig?: boolean } = {}) {
  const dir = join(work, `r-${seq++}`);
  const origin = join(dir, 'origin');
  const clone = join(dir, 'clone');
  mkdirSync(join(origin, '.github'), { recursive: true });
  git(origin, 'init', '-q', '-b', 'main');
  if (opts.mainHasConfig !== false) writeFileSync(join(origin, '.github', 'gitleaks.toml'), MAIN_CFG);
  writeFileSync(join(origin, 'README.md'), 'x\n');
  git(origin, 'add', '-A');
  git(origin, 'commit', '-q', '-m', 'base');
  const before = git(origin, 'rev-parse', 'HEAD');
  git(dir, 'clone', '-q', origin, clone);
  git(clone, 'checkout', '-q', '-b', 'pr');
  mkdirSync(join(clone, '.github'), { recursive: true });
  writeFileSync(join(clone, '.github', 'gitleaks.toml'), PR_CFG);
  writeFileSync(join(clone, '.gitleaksignore'), 'abc123:secret.txt:generic-api-key:1\n');
  git(clone, 'add', '-A');
  git(clone, 'commit', '-q', '-m', 'pr widens allowlist');
  const head = git(clone, 'rev-parse', 'HEAD');

  const bin = join(dir, 'fake-gitleaks');
  const log = join(dir, 'gl-calls.log');
  writeFileSync(bin, `#!/bin/bash
printf '%s\\n' "$*" >> "${log}"
prev=""
for a in "$@"; do
  if [ "$prev" = "--config" ]; then cp "$a" "${dir}/config-seen.toml"; fi
  if [ "$prev" = "--gitleaks-ignore-path" ]; then ls -A "$a" > "${dir}/ignore-dir-listing.txt"; fi
  prev="$a"
done
[ -f "${dir}/fail" ] && { echo "leaks found: 1" >&2; exit 1; }
exit 0
`);
  chmodSync(bin, 0o755);
  return { dir, clone, before, head, bin, log };
}

function run(cwd: string, env: Record<string, string>) {
  const r = Bun.spawnSync(['bash', SCRIPT], {
    cwd, stdout: 'pipe', stderr: 'pipe',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env },
  });
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  return { code: r.exitCode, out: dec(r.stdout), err: dec(r.stderr) };
}

const calls = (log: string) => (existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter(Boolean) : []);

describe('secret-scan.sh — the config comes from outside the change under scan', () => {
  test('a PR that widens .github/gitleaks.toml is scanned with the DEFAULT branch\'s config', () => {
    const { dir, clone, before, head, bin, log } = repos();
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'pull_request', PR_BASE: before, PR_HEAD: head, CONFIG_REF: 'main' });
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, 'config-seen.toml'), 'utf-8')).toBe(MAIN_CFG);
    const c = calls(log);
    expect(c).toHaveLength(1);
    expect(c[0]).toContain(`--log-opts=${before}..${head}`);
    expect(c[0]).not.toContain('--config .github/gitleaks.toml');
    expect(r.out).toContain('config from origin/main');
  });

  test('a push is scanned with the config as it was BEFORE the push', () => {
    const { dir, clone, before, head, bin } = repos();
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'push', PUSH_BEFORE: before, PUSH_AFTER: head, CONFIG_REF: 'main' });
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, 'config-seen.toml'), 'utf-8')).toBe(MAIN_CFG);
  });

  test('a scheduled run scans the full history with the default branch\'s config', () => {
    const { dir, clone, bin, log } = repos();
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'schedule', CONFIG_REF: 'main' });
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, 'config-seen.toml'), 'utf-8')).toBe(MAIN_CFG);
    expect(calls(log)[0]).not.toContain('--log-opts');
  });

  test('a push that creates the branch (all-zero before) falls back to the default branch\'s config and a full scan', () => {
    const { dir, clone, head, bin, log } = repos();
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'push', PUSH_BEFORE: '0000000000000000000000000000000000000000', PUSH_AFTER: head, CONFIG_REF: 'main' });
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, 'config-seen.toml'), 'utf-8')).toBe(MAIN_CFG);
    expect(calls(log)[0]).not.toContain('--log-opts');
  });
});

describe('secret-scan.sh — in-repo suppressions are neutralised', () => {
  test('gitleaks:allow comments are ignored and the repo\'s .gitleaksignore is not read', () => {
    const { dir, clone, before, head, bin, log } = repos();
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'pull_request', PR_BASE: before, PR_HEAD: head, CONFIG_REF: 'main' });
    expect(r.code).toBe(0);
    const c = calls(log)[0];
    expect(c).toContain('--ignore-gitleaks-allow');
    expect(c).toContain('--redact');
    expect(c).toMatch(/--gitleaks-ignore-path \S+/);
    // The directory handed to gitleaks holds no .gitleaksignore (the PR's one is at the repo root).
    expect(existsSync(join(clone, '.gitleaksignore'))).toBe(true);
    expect(readFileSync(join(dir, 'ignore-dir-listing.txt'), 'utf-8')).not.toContain('.gitleaksignore');
  });
});

describe('secret-scan.sh — fails closed, and never falls back to the checked-out config', () => {
  test('gitleaks reporting a leak → non-zero exit', () => {
    const { dir, clone, before, head, bin } = repos();
    writeFileSync(join(dir, 'fail'), '');
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'pull_request', PR_BASE: before, PR_HEAD: head, CONFIG_REF: 'main' });
    expect(r.code).not.toBe(0);
  });

  test('no config on the default branch (the PR that first adds it) → default rules with NO allowlist, never the PR\'s copy', () => {
    const { dir, clone, before, head, bin } = repos({ mainHasConfig: false });
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'pull_request', PR_BASE: before, PR_HEAD: head, CONFIG_REF: 'main' });
    expect(r.code).toBe(0);
    const seen = readFileSync(join(dir, 'config-seen.toml'), 'utf-8');
    expect(seen).toContain('useDefault = true');
    expect(seen).not.toContain('allowlists');
    expect(seen).not.toContain('widened-by-pr');
    expect(r.out).toContain('no allowlist');
  });

  test('a default branch that cannot be found → REFUSED, gitleaks never runs', () => {
    const { clone, before, head, bin, log } = repos();
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'pull_request', PR_BASE: before, PR_HEAD: head, CONFIG_REF: 'no-such-branch' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
    expect(calls(log)).toHaveLength(0);
  });

  test('missing CONFIG_REF or GITLEAKS_BIN → REFUSED', () => {
    const { clone, before, head, bin, log } = repos();
    for (const env of [{ GITLEAKS_BIN: bin, CONFIG_REF: '' }, { GITLEAKS_BIN: '', CONFIG_REF: 'main' }]) {
      const r = run(clone, { EVENT: 'pull_request', PR_BASE: before, PR_HEAD: head, ...env });
      expect(r.code).toBe(1);
      expect(r.err).toContain('REFUSED');
    }
    expect(calls(log)).toHaveLength(0);
  });

  test('a pull_request event without base/head SHAs → REFUSED (never a silent full-history pass-through)', () => {
    const { clone, bin } = repos();
    const r = run(clone, { GITLEAKS_BIN: bin, EVENT: 'pull_request', PR_BASE: '', PR_HEAD: '', CONFIG_REF: 'main' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
  });
});
