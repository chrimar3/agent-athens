/**
 * Clean-tree deploy gate (Option 3, Phase 1 — 2026-07-07).
 *
 * THE BREACH THIS GUARDS: dist/ is both build output and live deploy source;
 * `netlify deploy --dir=dist` ships whatever is on disk. On 2026-07-06 23:17Z
 * a local verification `bun run build` from an uncommitted tree (carrying the
 * stashed dedup-301 strand) was auto-deployed to production — a ruling-
 * violating wave shipped with zero committed code behind it.
 *
 * THE CORRESPONDENCE PREDICATE: a deploy may proceed ONLY when
 *   (1) dist/.build-provenance exists and records sourceDirty=0,
 *   (2) its sha equals current HEAD,
 *   (3) the SOURCE scope (config/deploy-gate-scope.json) has no uncommitted
 *       or untracked changes.
 * Any other state → exit nonzero, naming the failed condition, no deploy.
 *
 * Guard shape (same as the effectiveEnd seam-guard and prod-DB guard): these
 * tests FAIL if the gate is removed from either deploy path or weakened, so
 * the protection cannot silently rot.
 *
 * Scope boundary (deliberate, documented): data/, docs/, specs/, .claude/ are
 * NOT in the clean scope — the daily pipeline mutates data/* by design and
 * commits its two allowlisted artifacts AFTER the gate runs (gate sits at the
 * top of run_deploy, before that commit, so strict sha equality holds).
 * Phase 2 (structural dist/ separation) is a separate arc.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'bun';

const PROJECT_ROOT = join(import.meta.dir, '../..');
const GATE = join(PROJECT_ROOT, 'scripts/deploy-gate.sh');

function sh(cwd: string, cmd: string[]): { code: number; out: string; err: string } {
  const p = spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  return {
    code: p.exitCode ?? -1,
    out: new TextDecoder().decode(p.stdout),
    err: new TextDecoder().decode(p.stderr),
  };
}

/** Minimal fixture repo with source scope + gate config + a committed baseline. */
function mkFixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-gate-'));
  sh(dir, ['git', 'init', '-q']);
  sh(dir, ['git', 'config', 'user.email', 't@t']);
  sh(dir, ['git', 'config', 'user.name', 't']);
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'config'));
  mkdirSync(join(dir, 'data'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'src/app.ts'), 'export const x = 1;\n');
  writeFileSync(join(dir, 'data/artifact.json'), '{"n":1}\n');
  writeFileSync(
    join(dir, 'config/deploy-gate-scope.json'),
    JSON.stringify({ sourceScope: ['src', 'config', 'scripts', 'package.json', 'tsconfig.json'] }),
  );
  writeFileSync(join(dir, '.gitignore'), 'dist/\n');
  sh(dir, ['git', 'add', '-A']);
  sh(dir, ['git', 'commit', '-q', '-m', 'baseline']);
  return dir;
}

function headSha(dir: string): string {
  return sh(dir, ['git', 'rev-parse', 'HEAD']).out.trim();
}

function stamp(dir: string, sha: string, sourceDirty = 0): void {
  writeFileSync(join(dir, 'dist/.build-provenance'), `sha=${sha}\nsourceDirty=${sourceDirty}\n`);
}

function runGate(dir: string) {
  return sh(dir, ['bash', GATE]);
}

describe('deploy-gate.sh — correspondence predicate (functional, fixture repos)', () => {
  let repos: string[] = [];
  afterAll(() => { for (const r of repos) rmSync(r, { recursive: true, force: true }); });
  const fixture = () => { const r = mkFixtureRepo(); repos.push(r); return r; };

  test('clean source + provenance==HEAD → exit 0 (deploy proceeds)', () => {
    const r = fixture();
    stamp(r, headSha(r));
    const res = runGate(r);
    expect(res.code).toBe(0);
  });

  test('missing provenance stamp → refuses, FAIL CLOSED, names the condition', () => {
    const r = fixture(); // no stamp written
    const res = runGate(r);
    expect(res.code).not.toBe(0);
    expect(res.err + res.out).toContain('build-provenance');
  });

  test('provenance sha != HEAD → refuses, names the mismatch', () => {
    const r = fixture();
    stamp(r, '0'.repeat(40));
    const res = runGate(r);
    expect(res.code).not.toBe(0);
    expect((res.err + res.out).toLowerCase()).toContain('head');
  });

  test('uncommitted change to tracked source → refuses, names unclean source', () => {
    const r = fixture();
    stamp(r, headSha(r));
    writeFileSync(join(r, 'src/app.ts'), 'export const x = 2;\n');
    const res = runGate(r);
    expect(res.code).not.toBe(0);
    expect((res.err + res.out).toLowerCase()).toContain('source');
  });

  test('UNTRACKED file inside source scope → refuses (the strand carried an untracked test file)', () => {
    const r = fixture();
    stamp(r, headSha(r));
    writeFileSync(join(r, 'src/new-strand.ts'), 'export const wip = true;\n');
    const res = runGate(r);
    expect(res.code).not.toBe(0);
  });

  test('dirty NON-source path (data/) does NOT block — the daily pipeline mutates data/ by design', () => {
    const r = fixture();
    stamp(r, headSha(r));
    writeFileSync(join(r, 'data/artifact.json'), '{"n":2}\n');
    const res = runGate(r);
    expect(res.code).toBe(0);
  });

  test('stamp records sourceDirty=1 (built from a dirty source tree) → refuses even on clean tree', () => {
    // Loophole this closes: build from dirty tree, then revert the edits —
    // tree is clean and sha matches, but dist was built from code != HEAD.
    const r = fixture();
    stamp(r, headSha(r), 1);
    const res = runGate(r);
    expect(res.code).not.toBe(0);
    expect((res.err + res.out).toLowerCase()).toContain('dirty');
  });

  test('missing scope config → refuses, FAIL CLOSED (no silent ungated deploy)', () => {
    const r = fixture();
    stamp(r, headSha(r));
    rmSync(join(r, 'config/deploy-gate-scope.json'));
    sh(r, ['git', 'add', '-A']);
    sh(r, ['git', 'commit', '-q', '-m', 'drop config']);
    stamp(r, headSha(r));
    const res = runGate(r);
    expect(res.code).not.toBe(0);
  });
});

describe('deploy-gate — seam guards (fail if the gate is removed from a call site)', () => {
  const daily = readFileSync(join(PROJECT_ROOT, 'scripts/daily-automated.sh'), 'utf-8');
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));

  test('run_deploy invokes deploy-gate.sh BEFORE the netlify deploy call', () => {
    const runDeployStart = daily.indexOf('run_deploy()');
    expect(runDeployStart).toBeGreaterThan(-1);
    const body = daily.slice(runDeployStart);
    const gateIdx = body.indexOf('deploy-gate.sh');
    const netlifyIdx = body.indexOf('netlify deploy --prod');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(netlifyIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(netlifyIdx);
  });

  test('manual path: package.json "deploy" runs the gate before netlify deploy, with --no-build', () => {
    const script: string = pkg.scripts.deploy;
    expect(script).toContain('deploy-gate.sh');
    expect(script).toContain('--no-build');
    expect(script.indexOf('deploy-gate.sh')).toBeLessThan(script.indexOf('netlify deploy'));
  });

  test('rollback stays UNGATED — the gate checks, it never invokes netlify (emergency egress preserved)', () => {
    // The gate must never execute any netlify command (deploy OR rollback) —
    // it is a pure precondition check invoked by the deploy paths. Rollback
    // therefore cannot be intercepted by it.
    const gate = readFileSync(GATE, 'utf-8');
    expect(gate).not.toMatch(/^\s*netlify\s/m);
  });

  test('build entrypoint stamps provenance (generate-site wires writeBuildProvenance)', () => {
    const gen = readFileSync(join(PROJECT_ROOT, 'src/generate-site.ts'), 'utf-8');
    expect(gen).toContain('writeBuildProvenance');
  });

  test('gate checks all three conditions (weaken-guard: tokens present in gate script)', () => {
    const gate = readFileSync(GATE, 'utf-8');
    expect(gate).toContain('.build-provenance');
    expect(gate).toContain('status --porcelain');
    expect(gate).toContain('sourceDirty');
    expect(gate).toContain('rev-parse HEAD');
  });
});

describe('build-provenance stamper (unit, fixture repos)', () => {
  let repos: string[] = [];
  afterAll(() => { for (const r of repos) rmSync(r, { recursive: true, force: true }); });

  test('writes sha=HEAD and sourceDirty=0 on a clean source tree; =1 when source is dirty', async () => {
    const { writeBuildProvenance } = await import('../../src/utils/build-provenance');
    const r = mkFixtureRepo(); repos.push(r);

    writeBuildProvenance(join(r, 'dist'), r);
    let content = readFileSync(join(r, 'dist/.build-provenance'), 'utf-8');
    expect(content).toContain(`sha=${headSha(r)}`);
    expect(content).toContain('sourceDirty=0');

    writeFileSync(join(r, 'src/app.ts'), 'export const x = 3;\n');
    writeBuildProvenance(join(r, 'dist'), r);
    content = readFileSync(join(r, 'dist/.build-provenance'), 'utf-8');
    expect(content).toContain('sourceDirty=1');
  });

  test('non-source dirt (data/) does not set sourceDirty', async () => {
    const { writeBuildProvenance } = await import('../../src/utils/build-provenance');
    const r = mkFixtureRepo(); repos.push(r);
    writeFileSync(join(r, 'data/artifact.json'), '{"n":9}\n');
    writeBuildProvenance(join(r, 'dist'), r);
    expect(readFileSync(join(r, 'dist/.build-provenance'), 'utf-8')).toContain('sourceDirty=0');
  });
});
