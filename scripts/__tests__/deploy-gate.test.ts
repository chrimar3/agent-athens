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

describe('push-gate — pipeline must not push a ref HEAD does not equal (seam guards)', () => {
  // THE BREACH THIS GUARDS: `git commit` lands on whatever HEAD is, while
  // `git push origin <name>` pushes the LOCAL ref of that name — a valid
  // refspec even when HEAD is elsewhere. 2026-07 incident: repo left on a
  // feature branch for 3 days → daily commits landed there while a STALE
  // local main was pushed, exit 0, "Pipeline outputs pushed to git" logged
  // every time. The gate compares resolved SHAs (HEAD vs refs/heads/main),
  // not branch names — robust to detached HEAD and this repo's worktrees.
  const daily = readFileSync(join(PROJECT_ROOT, 'scripts/daily-automated.sh'), 'utf-8');

  test('PRODUCTION_BRANCH constant is declared (single source for the pushed refspec)', () => {
    expect(daily).toContain('PRODUCTION_BRANCH="main"');
  });

  test('gate sits BETWEEN the artifact commit and the push inside run_deploy', () => {
    const runDeployStart = daily.indexOf('run_deploy()');
    expect(runDeployStart).toBeGreaterThan(-1);
    const body = daily.slice(runDeployStart);
    const commitIdx = body.indexOf('chore: daily pipeline update');
    const gateIdx = body.indexOf('[push-gate]');
    const pushIdx = body.indexOf('git push origin');
    expect(commitIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeLessThan(gateIdx);
    expect(gateIdx).toBeLessThan(pushIdx);
  });

  test('gate compares resolved SHAs, fails closed, and REFUSES loudly (weaken-guard tokens)', () => {
    const runDeployBody = daily.slice(daily.indexOf('run_deploy()'));
    expect(runDeployBody).toContain('git rev-parse HEAD');
    expect(runDeployBody).toContain('refs/heads/$PRODUCTION_BRANCH');
    expect(runDeployBody).toContain('"$head_sha" != "$branch_sha"');
    // Unresolvable SHA must refuse, not push (fail closed):
    expect(runDeployBody).toContain('-z "$head_sha"');
    expect(runDeployBody).toContain('-z "$branch_sha"');
    expect(runDeployBody).toContain('[push-gate] REFUSED');
  });

  test('the push goes through the shared constant — no literal `git push origin main` can bypass the gate', () => {
    expect(daily).not.toContain('git push origin main');
    expect(daily).toContain('git push origin "$PRODUCTION_BRANCH"');
  });
});

describe('push-gate — behavior (real gate block extracted from the script, run in fixture repos)', () => {
  // The seam guards above pin TOKENS; a token-preserving mutant (e.g. a line
  // that overwrites head_sha after resolution) would pass them while pushing
  // the stale ref anyway. These tests execute the ACTUAL gate block — sliced
  // verbatim out of daily-automated.sh between the push-gate markers — inside
  // throwaway repos, so behavior is pinned, not just spelling.
  const PUSH_GATE_BEGIN = '# push-gate:begin';
  const PUSH_GATE_END = '# push-gate:end';

  let repos: string[] = [];
  afterAll(() => { for (const r of repos) rmSync(r, { recursive: true, force: true }); });

  function extractGateBlock(): string {
    const daily = readFileSync(join(PROJECT_ROOT, 'scripts/daily-automated.sh'), 'utf-8');
    const begin = daily.indexOf(PUSH_GATE_BEGIN);
    const end = daily.indexOf(PUSH_GATE_END);
    if (begin === -1 || end === -1 || end <= begin) {
      throw new Error('push-gate markers missing from daily-automated.sh — extraction contract broken');
    }
    return daily.slice(begin, end);
  }

  /**
   * Fixture repo + bare "origin". Branch name passed EXPLICITLY via
   * `git init -b` — mkFixtureRepo() above deliberately does not set one, and
   * inheriting the machine's init.defaultBranch would make these vacuous.
   */
  function mkPushFixture(branch: string): { dir: string; remote: string } {
    const dir = mkdtempSync(join(tmpdir(), 'push-gate-'));
    const remote = mkdtempSync(join(tmpdir(), 'push-gate-remote-'));
    repos.push(dir, remote);
    sh(remote, ['git', 'init', '-q', '--bare']);
    sh(dir, ['git', 'init', '-q', '-b', branch]);
    sh(dir, ['git', 'config', 'user.email', 't@t']);
    sh(dir, ['git', 'config', 'user.name', 't']);
    writeFileSync(join(dir, 'f.txt'), 'a\n');
    sh(dir, ['git', 'add', 'f.txt']);
    sh(dir, ['git', 'commit', '-q', '-m', 'baseline']);
    sh(dir, ['git', 'remote', 'add', 'origin', remote]);
    sh(dir, ['git', 'push', '-q', 'origin', branch]);
    return { dir, remote };
  }

  function commitChange(dir: string, content: string): void {
    writeFileSync(join(dir, 'f.txt'), content);
    sh(dir, ['git', 'add', 'f.txt']);
    sh(dir, ['git', 'commit', '-q', '-m', 'change']);
  }

  function remoteMainSha(remote: string): string {
    return sh(remote, ['git', 'rev-parse', 'refs/heads/main']).out.trim();
  }

  /** Run the extracted gate block in the fixture with stubbed log helpers. */
  function runPushGate(dir: string) {
    const harness = [
      '#!/bin/bash',
      'PRODUCTION_BRANCH="main"',
      `LOG_FILE="${join(dir, 'push-gate.log')}"`,
      'log(){ echo "$1"; }',
      'log_error(){ echo "ERROR: $1" >&2; }',
      'gate(){',
      extractGateBlock(),
      '}',
      'gate',
    ].join('\n');
    const f = join(dir, 'gate-harness.sh');
    writeFileSync(f, harness);
    return sh(dir, ['bash', f]);
  }

  test('gate block markers exist in the script (extraction contract)', () => {
    expect(() => extractGateBlock()).not.toThrow();
    expect(extractGateBlock().length).toBeGreaterThan(0);
  });

  test('THE INCIDENT: HEAD on a feature branch, local main stale → loud REFUSED, no push, remote untouched', () => {
    const { dir, remote } = mkPushFixture('main');
    const staleMain = remoteMainSha(remote);
    sh(dir, ['git', 'checkout', '-q', '-b', 'feature/wip']);
    commitChange(dir, 'b\n');
    // Fixture precondition — it must actually exercise the mismatch:
    expect(headSha(dir)).not.toBe(staleMain);

    const res = runPushGate(dir);
    expect(res.err).toContain('[push-gate] REFUSED');
    expect(res.out + res.err).not.toContain('Pipeline outputs pushed to git');
    expect(remoteMainSha(remote)).toBe(staleMain); // stale ref NOT pushed
  });

  test('detached HEAD on a new commit (worktree-style state) → REFUSED, does not crash, remote untouched', () => {
    const { dir, remote } = mkPushFixture('main');
    const staleMain = remoteMainSha(remote);
    sh(dir, ['git', 'checkout', '-q', '--detach']);
    commitChange(dir, 'c\n');
    expect(headSha(dir)).not.toBe(staleMain);

    const res = runPushGate(dir);
    expect(res.err).toContain('[push-gate] REFUSED');
    expect(remoteMainSha(remote)).toBe(staleMain);
  });

  test('detached HEAD parked exactly at main tip → SHAs equal, push proceeds (a NAME compare would false-refuse here)', () => {
    const { dir } = mkPushFixture('main');
    sh(dir, ['git', 'checkout', '-q', '--detach', 'main']);
    expect(sh(dir, ['git', 'rev-parse', '--abbrev-ref', 'HEAD']).out.trim()).toBe('HEAD'); // precondition: name compare would see "HEAD" != "main"
    const res = runPushGate(dir);
    expect(res.out).toContain('Pipeline outputs pushed to git');
    expect(res.err).not.toContain('[push-gate] REFUSED');
  });

  test('HEAD on main with the fresh commit → pushes, success logged, remote main advances', () => {
    const { dir, remote } = mkPushFixture('main');
    commitChange(dir, 'd\n');
    const newSha = headSha(dir);
    expect(remoteMainSha(remote)).not.toBe(newSha); // precondition: remote is behind

    const res = runPushGate(dir);
    expect(res.out).toContain('Pipeline outputs pushed to git');
    expect(res.err).not.toContain('[push-gate] REFUSED');
    expect(remoteMainSha(remote)).toBe(newSha);
  });

  test('refs/heads/main does not exist at all → FAIL CLOSED (REFUSED), not a push of garbage', () => {
    const { dir } = mkPushFixture('feature/only'); // repo has NO main branch
    expect(sh(dir, ['git', 'rev-parse', '--verify', 'refs/heads/main']).code).not.toBe(0); // precondition
    const res = runPushGate(dir);
    expect(res.err).toContain('[push-gate] REFUSED');
    expect(res.out + res.err).not.toContain('Pipeline outputs pushed to git');
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
