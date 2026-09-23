/**
 * tests/workflow-security.test.ts — GitHub Actions and repository hygiene.
 *
 * The workflows run on pull requests from anyone, so these pins keep the
 * properties that make that safe:
 *   - every workflow starts from a read-only token; write scopes are granted
 *     per job, and only the path-guard job gets any;
 *   - every action is pinned to a full commit SHA (a moved tag cannot change
 *     what runs), with the version in a trailing comment for Dependabot;
 *   - no pull_request_target job checks out PR code, and no `run:` block
 *     interpolates event data directly (script injection);
 *   - the required `ci` job runs the src/ tests as well as tests/;
 *   - secret scanning and a dependency audit exist, Dependabot covers the
 *     lockfile and the actions, and CODEOWNERS routes every path to the owner.
 * Security loop round 2: ci also runs on push to main; path-guard re-runs when
 * a PR is edited (base retargeted) and reads its globs from the default branch;
 * CodeQL (javascript-typescript) is the only other job with a write scope
 * (security-events, to upload results); a weekly read-only job checks the main
 * branch ruleset; the audit is blocking with a documented ignore list; and
 * Dependabot covers the container definition in /docker.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const ROOT = join(import.meta.dir, '..');
const WF_DIR = join(ROOT, '.github', 'workflows');
const OWNER = '@chrimar3';

type Step = { uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { permissions?: Record<string, string>; steps?: Step[] };
type Workflow = { permissions?: Record<string, string>; jobs: Record<string, Job>; [k: string]: unknown };

const files = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
const workflows = files.map((f) => {
  const raw = readFileSync(join(WF_DIR, f), 'utf-8');
  return { file: f, raw, wf: parseYaml(raw) as Workflow };
});

function triggers(wf: Workflow): string[] {
  // YAML 1.1 parsers fold a bare `on:` key to boolean true; accept either.
  const on = (wf.on ?? wf[true as unknown as string]) as unknown;
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on as string[];
  return Object.keys((on ?? {}) as Record<string, unknown>);
}

describe('workflows — token scope', () => {
  test('precondition: the expected workflows exist', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'path-guard.yml', 'security.yml', 'codeql.yml', 'repo-settings.yml']));
  });

  for (const { file, wf } of workflows) {
    test(`${file}: workflow-level permissions are exactly contents: read`, () => {
      expect(wf.permissions).toEqual({ contents: 'read' });
    });

    test(`${file}: no job is granted a write scope, except path-guard's comment/label and CodeQL's result upload`, () => {
      for (const [name, job] of Object.entries(wf.jobs)) {
        for (const [scope, level] of Object.entries(job.permissions ?? {})) {
          if (level !== 'write') continue;
          const allowed =
            (file === 'path-guard.yml' && name === 'path-guard' && ['pull-requests', 'issues'].includes(scope)) ||
            (file === 'codeql.yml' && name === 'analyze' && scope === 'security-events');
          expect(`${file}:${name}:${scope}=${level} allowed=${allowed}`).toContain('allowed=true');
        }
      }
    });
  }
});

describe('workflows — pinned actions', () => {
  for (const { file, raw, wf } of workflows) {
    test(`${file}: every action is pinned to a full commit SHA with a version comment`, () => {
      const uses = Object.values(wf.jobs).flatMap((j) => (j.steps ?? []).map((s) => s.uses).filter(Boolean)) as string[];
      expect(uses.length).toBeGreaterThan(0);
      for (const u of uses) {
        if (u.startsWith('./')) continue; // local action: versioned with the repo
        expect(u).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}$/);
        const line = raw.split('\n').find((l) => l.includes(u));
        expect(line).toMatch(/#\s*v\d+(\.\d+)*\s*$/);
      }
    });
  }
});

describe('workflows — untrusted input', () => {
  for (const { file, wf } of workflows) {
    test(`${file}: pull_request_target never checks out PR code`, () => {
      if (!triggers(wf).includes('pull_request_target')) return;
      for (const job of Object.values(wf.jobs)) {
        for (const s of job.steps ?? []) {
          if (!s.uses?.startsWith('actions/checkout')) continue;
          const ref = s.with?.ref;
          expect(ref === undefined || String(ref).includes('base.')).toBe(true);
          expect(String(s.with?.['persist-credentials'])).toBe('false');
        }
      }
    });

    test(`${file}: no run block interpolates event or input data directly`, () => {
      for (const job of Object.values(wf.jobs)) {
        for (const s of job.steps ?? []) {
          if (typeof s.run !== 'string') continue;
          // Pass such values through env: and quote the shell variable instead.
          expect(s.run).not.toMatch(/\$\{\{\s*(github\.event|github\.head_ref|inputs\.)/);
        }
      }
    });

    test(`${file}: every checkout leaves no token behind`, () => {
      for (const job of Object.values(wf.jobs)) {
        for (const s of job.steps ?? []) {
          if (!s.uses?.startsWith('actions/checkout')) continue;
          expect(String(s.with?.['persist-credentials'])).toBe('false');
        }
      }
    });
  }
});

describe('ci.yml — the required ci job', () => {
  const ci = workflows.find((w) => w.file === 'ci.yml')!;
  const runs = (ci.wf.jobs.ci?.steps ?? []).map((s) => s.run ?? '').join('\n');

  test('job is named ci and installs from the frozen lockfile', () => {
    expect(Object.keys(ci.wf.jobs)).toContain('ci');
    expect(runs).toContain('bun install --frozen-lockfile');
  });

  test('runs the src/ tests as well as tests/ and the guard seams', () => {
    expect(runs).toMatch(/find[^\n]*\btests\b[^\n]*\bsrc\b/);
    expect(runs).toContain('scripts/__tests__/deploy-gate.test.ts');
    expect(runs).toContain('bun test');
  });

  test('typechecks', () => {
    expect(runs).toContain('bun run typecheck');
  });

  test('runs on pull requests AND on pushes to main (the pipeline pushes to main directly)', () => {
    const on = (ci.wf.on ?? ci.wf[true as unknown as string]) as Record<string, { branches?: string[] } | null>;
    expect(Object.keys(on)).toContain('pull_request');
    expect(on.push?.branches).toEqual(['main']);
  });
});

describe('path-guard.yml — base changes and the glob source', () => {
  const pg = workflows.find((w) => w.file === 'path-guard.yml')!;
  const on = (pg.wf.on ?? pg.wf[true as unknown as string]) as Record<string, { types?: string[] }>;

  test('re-runs when a PR is opened, pushed to, reopened or edited (a retargeted base fires `edited`)', () => {
    expect([...(on.pull_request_target?.types ?? [])].sort()).toEqual(['edited', 'opened', 'reopened', 'synchronize']);
  });

  test('reads the protected globs from the default branch, not the PR base or head', () => {
    const step = (pg.wf.jobs['path-guard'].steps ?? []).find((s) => (s.run ?? '').includes('path-guard.sh'))!;
    expect(step.env?.GLOBS_REF).toBe('${{ github.event.repository.default_branch }}');
    const script = readFileSync(join(ROOT, '.github', 'scripts', 'path-guard.sh'), 'utf-8');
    expect(script).toContain('contents/.github/path-guard.json?ref=$GLOBS_REF');
    expect(script).not.toContain('contents/.github/path-guard.json?ref=$BASE');
  });
});

describe('codeql.yml — SAST', () => {
  const cq = workflows.find((w) => w.file === 'codeql.yml')!;
  const job = cq.wf.jobs.analyze;
  const uses = (job.steps ?? []).map((s) => s.uses ?? '');

  test('analyzes javascript-typescript with the pinned codeql-action init/analyze pair', () => {
    const init = (job.steps ?? []).find((s) => (s.uses ?? '').startsWith('github/codeql-action/init@'));
    expect(init?.with?.languages).toBe('javascript-typescript');
    expect(uses.some((u) => u.startsWith('github/codeql-action/analyze@'))).toBe(true);
    const sha = (u: string) => u.split('@')[1];
    expect(sha(uses.find((u) => u.startsWith('github/codeql-action/init@'))!)).toBe(sha(uses.find((u) => u.startsWith('github/codeql-action/analyze@'))!));
  });

  test('least privilege: contents read plus security-events write, nothing else', () => {
    expect(job.permissions).toEqual({ contents: 'read', 'security-events': 'write' });
  });

  test('runs on PRs, on pushes to main and weekly', () => {
    const on = (cq.wf.on ?? cq.wf[true as unknown as string]) as Record<string, unknown>;
    expect(Object.keys(on)).toEqual(expect.arrayContaining(['pull_request', 'push', 'schedule']));
  });
});

describe('repo-settings.yml — the weekly ruleset check', () => {
  const rs = workflows.find((w) => w.file === 'repo-settings.yml')!;

  test('is scheduled, read-only, and runs the unit-tested checker against main with the job token', () => {
    const on = (rs.wf.on ?? rs.wf[true as unknown as string]) as Record<string, unknown>;
    expect(Object.keys(on)).toContain('schedule');
    for (const job of Object.values(rs.wf.jobs)) expect(job.permissions ?? { contents: 'read' }).toEqual({ contents: 'read' });
    const steps = Object.values(rs.wf.jobs).flatMap((j) => j.steps ?? []);
    const run = steps.find((s) => (s.run ?? '').includes('check-branch-rules.sh'));
    expect(run).toBeDefined();
    expect(run!.env?.GH_TOKEN).toBe('${{ github.token }}');
    expect(run!.env?.BRANCH).toBe('main');
  });
});

describe('security.yml — secret scan and dependency audit', () => {
  const sec = workflows.find((w) => w.file === 'security.yml')!;

  test('secret-scan runs a checksum-verified, version-pinned gitleaks with the repo allowlist', () => {
    const steps = sec.wf.jobs['secret-scan']?.steps ?? [];
    const all = steps.map((s) => `${s.run ?? ''}\n${JSON.stringify(s.env ?? {})}`).join('\n');
    expect(all).toMatch(/GITLEAKS_VERSION[^\n]*\d+\.\d+\.\d+/);
    expect(all).toMatch(/GITLEAKS_SHA256[^\n]*[0-9a-f]{64}/);
    expect(all).toContain('sha256sum -c');
    expect(all).toContain('--config .github/gitleaks.toml');
    expect(existsSync(join(ROOT, '.github', 'gitleaks.toml'))).toBe(true);
  });

  test('the gitleaks allowlist covers scraped HTML only', () => {
    const cfg = Bun.TOML.parse(readFileSync(join(ROOT, '.github', 'gitleaks.toml'), 'utf-8')) as {
      extend?: { useDefault?: boolean };
      allowlists?: Array<{ paths?: string[]; regexes?: string[]; commits?: string[] }>;
    };
    expect(cfg.extend?.useDefault).toBe(true);
    for (const a of cfg.allowlists ?? []) {
      expect(a.regexes ?? []).toEqual([]);
      expect(a.commits ?? []).toEqual([]);
      for (const p of a.paths ?? []) expect(p).toMatch(/^\^(data\/[a-z-]+|tests\/fixtures)\/.*\\\.html/);
    }
  });

  test('the allowlist covers the scraped test fixtures (a third-party page with its site\'s own browser key)', () => {
    const cfg = Bun.TOML.parse(readFileSync(join(ROOT, '.github', 'gitleaks.toml'), 'utf-8')) as { allowlists?: Array<{ paths?: string[] }> };
    const paths = (cfg.allowlists ?? []).flatMap((a) => a.paths ?? []).map((p) => new RegExp(p));
    expect(paths.some((re) => re.test('tests/fixtures/cometogether-listing.html'))).toBe(true);
    expect(paths.some((re) => re.test('tests/fixtures/sub/dir/x.ts'))).toBe(false);
  });

  test('dependency-audit is blocking: it runs the ignore-list-aware audit script and never continues on error', () => {
    const job = sec.wf.jobs['dependency-audit'] as Job & { 'continue-on-error'?: unknown };
    const runs = (job.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('bash .github/scripts/dependency-audit.sh');
    expect(job['continue-on-error']).toBeUndefined();
    for (const s of job.steps ?? []) expect((s as { 'continue-on-error'?: unknown })['continue-on-error']).toBeUndefined();
    const script = readFileSync(join(ROOT, '.github', 'scripts', 'dependency-audit.sh'), 'utf-8');
    expect(script).toContain('--audit-level=high');
    expect(existsSync(join(ROOT, '.github', 'audit-ignore.json'))).toBe(true);
  });
});

describe('.github/dependabot.yml', () => {
  const p = join(ROOT, '.github', 'dependabot.yml');
  const cfg = existsSync(p) ? parseYaml(readFileSync(p, 'utf-8')) : { updates: [] };
  const updates = (cfg.updates ?? []) as Array<{ 'package-ecosystem': string; schedule?: { interval?: string }; groups?: object }>;

  test('covers the package lockfile, the actions and the container definition, weekly and grouped', () => {
    const ecos = updates.map((u) => u['package-ecosystem']);
    expect(ecos).toContain('github-actions');
    const docker = (updates as Array<{ 'package-ecosystem': string; directory?: string }>).find((u) => u['package-ecosystem'] === 'docker');
    expect(docker?.directory).toBe('/docker');
    expect(ecos.some((e) => e === 'bun' || e === 'npm')).toBe(true);
    for (const u of updates) {
      expect(u.schedule?.interval).toBe('weekly');
      expect(u.groups && Object.keys(u.groups).length > 0).toBe(true);
    }
  });
});

describe('.github/CODEOWNERS', () => {
  const p = join(ROOT, '.github', 'CODEOWNERS');
  const lines = existsSync(p)
    ? readFileSync(p, 'utf-8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];
  const rules = lines.map((l) => { const [pattern, ...owners] = l.split(/\s+/); return { pattern, owners }; });

  test('the first rule assigns everything to the owner', () => {
    expect(rules[0]).toEqual({ pattern: '*', owners: [OWNER] });
  });

  test('every rule includes the owner (a later rule must not drop the owner)', () => {
    for (const r of rules) expect(r.owners).toContain(OWNER);
  });

  test('the guard and publishing paths have explicit rules', () => {
    const patterns = rules.map((r) => r.pattern);
    for (const p of ['/.github/', '/.claude/', '/scripts/hooks/', '/netlify/', '/netlify.toml', '/package.json', '/bun.lock', '/scripts/daily-automated.sh', '/scripts/deploy-gate.sh']) {
      expect(patterns).toContain(p);
    }
  });
});
