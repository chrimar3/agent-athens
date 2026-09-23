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
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'path-guard.yml', 'security.yml']));
  });

  for (const { file, wf } of workflows) {
    test(`${file}: workflow-level permissions are exactly contents: read`, () => {
      expect(wf.permissions).toEqual({ contents: 'read' });
    });

    test(`${file}: no job is granted a write scope, except path-guard's comment/label`, () => {
      for (const [name, job] of Object.entries(wf.jobs)) {
        for (const [scope, level] of Object.entries(job.permissions ?? {})) {
          if (level !== 'write') continue;
          const allowed = file === 'path-guard.yml' && name === 'path-guard' && ['pull-requests', 'issues'].includes(scope);
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
      for (const p of a.paths ?? []) expect(p).toMatch(/^\^data\/[a-z-]+\/.*\\\.html/);
    }
  });

  test('dependency-audit runs bun audit', () => {
    const runs = (sec.wf.jobs['dependency-audit']?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('bun audit');
  });
});

describe('.github/dependabot.yml', () => {
  const p = join(ROOT, '.github', 'dependabot.yml');
  const cfg = existsSync(p) ? parseYaml(readFileSync(p, 'utf-8')) : { updates: [] };
  const updates = (cfg.updates ?? []) as Array<{ 'package-ecosystem': string; schedule?: { interval?: string }; groups?: object }>;

  test('covers the package lockfile and the actions, weekly and grouped', () => {
    const ecos = updates.map((u) => u['package-ecosystem']);
    expect(ecos).toContain('github-actions');
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
