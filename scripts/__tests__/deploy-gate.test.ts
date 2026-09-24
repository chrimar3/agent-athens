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
 * commits its allowlisted artifacts to the separate `pipeline-data` branch
 * (git plumbing; HEAD and main never move).
 * Phase 2 (structural dist/ separation) is a separate arc.
 *
 * ORIGIN GATE (security loop round 3): the gate also refuses unless HEAD is
 * origin/main or an ancestor of it (reviewed and merged code only; no local
 * commits at all). It lives in deploy-gate.sh so EVERY forward deploy path
 * enforces it: the pipeline's run_deploy, `bun run deploy` (package.json) and
 * scripts/redeploy.sh. Fixture repos therefore get a bare "origin".
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'bun';
import { computeDistHash } from '../../src/utils/build-provenance';

const PROJECT_ROOT = join(import.meta.dir, '../..');
const GATE = join(PROJECT_ROOT, 'scripts/deploy-gate.sh');
const REDEPLOY = join(PROJECT_ROOT, 'scripts/redeploy.sh');

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

function sh(cwd: string, cmd: string[], env?: Record<string, string>): { code: number; out: string; err: string } {
  const p = spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe', env: env ? { ...process.env, ...env } : undefined });
  return {
    code: p.exitCode ?? -1,
    out: new TextDecoder().decode(p.stdout),
    err: new TextDecoder().decode(p.stderr),
  };
}

function exe(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

/** Simulates "reviewed and merged": publish the local HEAD as origin's main. */
function mergeUpstream(dir: string): void {
  const r = sh(dir, ['git', 'push', '-q', '--force', 'origin', 'HEAD:refs/heads/main']);
  if (r.code !== 0) throw new Error(`push to fixture origin failed: ${r.err}`);
}

/** Minimal fixture repo with source scope + gate config + a committed baseline,
 *  and a bare "origin" whose main is that baseline. */
function mkFixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-gate-'));
  const origin = mkdtempSync(join(tmpdir(), 'deploy-gate-origin-'));
  tmpDirs.push(origin);
  sh(origin, ['git', 'init', '-q', '--bare']);
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
  sh(dir, ['git', 'remote', 'add', 'origin', origin]);
  mergeUpstream(dir);
  return dir;
}

function originOf(dir: string): string {
  return sh(dir, ['git', 'remote', 'get-url', 'origin']).out.trim();
}

function headSha(dir: string): string {
  return sh(dir, ['git', 'rev-parse', 'HEAD']).out.trim();
}

/** Stamp as the build does: sha + sourceDirty + the dist/ content hash at stamp time. */
function stamp(dir: string, sha: string, sourceDirty = 0, distHash?: string): void {
  const hash = distHash ?? computeDistHash(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist/.build-provenance'), `sha=${sha}\nsourceDirty=${sourceDirty}\ndistHash=${hash}\n`);
}

function runGate(dir: string, ...args: string[]) {
  return sh(dir, ['bash', GATE, ...args]);
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

  test('dist/ changed AFTER the stamp (content edit) → refuses, names the dist hash', () => {
    const r = fixture();
    writeFileSync(join(r, 'dist/index.html'), '<p>built</p>\n');
    stamp(r, headSha(r));
    expect(runGate(r).code).toBe(0); // precondition: the untouched build passes
    writeFileSync(join(r, 'dist/index.html'), '<p>edited after build</p>\n');
    const res = runGate(r);
    expect(res.code).not.toBe(0);
    expect((res.err + res.out).toLowerCase()).toContain('dist hash');
  });

  test('a file ADDED to dist/ after the stamp → refuses', () => {
    const r = fixture();
    writeFileSync(join(r, 'dist/index.html'), '<p>built</p>\n');
    stamp(r, headSha(r));
    writeFileSync(join(r, 'dist/extra.html'), '<p>planted</p>\n');
    expect(runGate(r).code).not.toBe(0);
  });

  test('stamp without distHash (pre-hash build) → refuses, FAIL CLOSED', () => {
    const r = fixture();
    writeFileSync(join(r, 'dist/.build-provenance'), `sha=${headSha(r)}\nsourceDirty=0\n`);
    const res = runGate(r);
    expect(res.code).not.toBe(0);
    expect(res.err + res.out).toContain('distHash');
  });

  test('stamp sha is an ANCESTOR of HEAD (artifact-only commit on top) → refused by default', () => {
    const r = fixture();
    stamp(r, headSha(r));
    writeFileSync(join(r, 'data/artifact.json'), '{"n":2}\n');
    sh(r, ['git', 'commit', '-qam', 'chore: daily pipeline update 2026-09-23']);
    expect(runGate(r).code).not.toBe(0);
  });

  test('--allow-descendant: ancestor stamp + no source-scope change since → exit 0 (reviewed data commit merged on top)', () => {
    const r = fixture();
    stamp(r, headSha(r));
    writeFileSync(join(r, 'data/artifact.json'), '{"n":2}\n');
    sh(r, ['git', 'commit', '-qam', 'docs: data refresh']);
    mergeUpstream(r);
    const res = runGate(r, '--allow-descendant');
    expect(res.code).toBe(0);
  });

  test('--allow-descendant: a SOURCE change committed after the stamp → refuses', () => {
    const r = fixture();
    stamp(r, headSha(r));
    writeFileSync(join(r, 'src/app.ts'), 'export const x = 42;\n');
    sh(r, ['git', 'commit', '-qam', 'chore: daily pipeline update 2026-09-23']);
    mergeUpstream(r); // even reviewed: dist/ was not built from this source
    const res = runGate(r, '--allow-descendant');
    expect(res.code).not.toBe(0);
    expect((res.err + res.out).toLowerCase()).toContain('source');
  });

  test('--allow-descendant: stamp sha NOT an ancestor of HEAD → refuses', () => {
    const r = fixture();
    stamp(r, '0'.repeat(40));
    expect(runGate(r, '--allow-descendant').code).not.toBe(0);
  });

  test('--allow-descendant: stamp on a SIBLING commit (real sha, same source) → refuses — descendant means ancestor', () => {
    const r = fixture();
    const base = headSha(r);
    writeFileSync(join(r, 'data/artifact.json'), '{"side":1}\n');
    sh(r, ['git', 'commit', '-qam', 'side']);
    const side = headSha(r);
    sh(r, ['git', 'reset', '-q', '--hard', base]);
    writeFileSync(join(r, 'data/artifact.json'), '{"main":1}\n');
    sh(r, ['git', 'commit', '-qam', 'main']);
    stamp(r, side);
    const res = runGate(r, '--allow-descendant');
    expect(res.code).not.toBe(0);
    expect(res.err + res.out).toContain('not an ancestor');
  });

  test('unknown gate argument → refuses (a typo must not silently change the predicate)', () => {
    const r = fixture();
    stamp(r, headSha(r));
    expect(runGate(r, '--allow-anything').code).not.toBe(0);
  });
});

describe('deploy-gate.sh — origin gate (only reviewed code ships; fixture repo + bare origin)', () => {
  const REAL_GIT = sh(PROJECT_ROOT, ['which', 'git']).out.trim();
  const REAL_SLEEP = sh(PROJECT_ROOT, ['which', 'sleep']).out.trim();
  let repos: string[] = [];
  afterAll(() => { for (const r of repos) rmSync(r, { recursive: true, force: true }); });
  const fixture = () => { const r = mkFixtureRepo(); repos.push(r); return r; };

  /** fake-bin: fast `sleep`, failing `gh`, a git wrapper that records fetches
   *  (optionally replacing the fetch with `fetchBody`). Lives outside the repo
   *  so it never dirties the source scope. */
  function fakeBin(dir: string, fetchBody = ''): string {
    const bin = mkdtempSync(join(tmpdir(), 'deploy-gate-bin-'));
    tmpDirs.push(bin);
    exe(join(bin, 'sleep'), `#!/bin/bash\nexec "${REAL_SLEEP}" 0.05\n`);
    exe(join(bin, 'gh'), '#!/bin/bash\nexit 99\n');
    exe(join(bin, 'git'), `#!/bin/bash
for a in "$@"; do [[ "$a" == fetch ]] && { echo fetch >> "${join(bin, 'fetches')}"; ${fetchBody} }; done
exec "${REAL_GIT}" "$@"
`);
    return bin;
  }
  const gateWith = (r: string, bin: string, ...args: string[]) =>
    sh(r, ['bash', GATE, ...args], { PATH: `${bin}:${process.env.PATH}`, FETCH_TIMEOUT: '30' });
  const fetched = (bin: string) => existsSync(join(bin, 'fetches'));

  test('HEAD == origin/main → PASS, after fetching the remote tip', () => {
    const r = fixture();
    stamp(r, headSha(r));
    const bin = fakeBin(r);
    const res = gateWith(r, bin);
    expect(res.code).toBe(0);
    expect(fetched(bin)).toBe(true);
    expect(res.out).toContain('origin/main');
  });

  test('HEAD is an older reviewed commit (ancestor of origin/main) → PASS', () => {
    const r = fixture();
    writeFileSync(join(r, 'src/app.ts'), 'export const x = 5;\n');
    sh(r, ['git', 'commit', '-qam', 'feat: newer reviewed change']);
    mergeUpstream(r);
    sh(r, ['git', 'reset', '-q', '--hard', 'HEAD~1']);
    stamp(r, headSha(r));
    expect(gateWith(r, fakeBin(r)).code).toBe(0);
  });

  test('THE THREAT: a clean, stamped local commit that is not on origin/main → REFUSED, naming it', () => {
    const r = fixture();
    writeFileSync(join(r, 'src/app.ts'), 'export const x = 666;\n');
    sh(r, ['git', 'commit', '-qam', 'local tweak']);
    stamp(r, headSha(r));
    const res = gateWith(r, fakeBin(r));
    expect(res.code).toBe(1);
    expect(res.err).toContain('[origin-gate] REFUSED');
    expect(res.err).toContain(headSha(r).slice(0, 12));
  });

  test('THE THREAT, via git replace (round 5): a planted refs/replace entry cannot make an unreviewed HEAD look like an ancestor of origin/main', () => {
    // origin/main moves to a reviewed commit R; locally HEAD is an unreviewed
    // sibling L. A compromised run that can write .git/refs plants
    // refs/replace/<R> → R' (R's tree, parent L). Git honouring replace refs
    // then reports L as an ancestor of R, while the remote holds the real R.
    const r = fixture();
    writeFileSync(join(r, 'src/app.ts'), 'export const x = 5;\n');
    sh(r, ['git', 'commit', '-qam', 'feat: reviewed']);
    mergeUpstream(r);
    const reviewed = headSha(r);
    sh(r, ['git', 'reset', '-q', '--hard', 'HEAD~1']);
    writeFileSync(join(r, 'src/app.ts'), 'export const x = 666;\n');
    sh(r, ['git', 'commit', '-qam', 'local tweak']);
    const local = headSha(r);
    const fake = sh(r, ['git', 'commit-tree', `${reviewed}^{tree}`, '-p', local, '-m', 'feat: reviewed']).out.trim();
    expect(sh(r, ['git', 'replace', reviewed, fake]).code).toBe(0);
    // Precondition: with replace refs honoured, git itself is fooled.
    expect(sh(r, ['git', 'merge-base', '--is-ancestor', local, reviewed]).code).toBe(0);
    stamp(r, local);
    const res = gateWith(r, fakeBin(r));
    expect(res.code).toBe(1);
    expect(res.err).toContain('[origin-gate] REFUSED');
    expect(res.err).toContain(local.slice(0, 12));
  });

  test('the old pipeline artifact-commit exception is gone: a data-only local commit with the pipeline message → REFUSED', () => {
    const r = fixture();
    writeFileSync(join(r, 'data/artifact.json'), '{"n":7}\n');
    sh(r, ['git', 'commit', '-qam', 'chore: daily pipeline update 2026-09-23']);
    stamp(r, headSha(r));
    const res = gateWith(r, fakeBin(r));
    expect(res.code).toBe(1);
    expect(res.err).toContain('[origin-gate] REFUSED');
  });

  test('uses the FETCHED remote tip: code merged upstream passes even if the local tracking ref is stale', () => {
    const r = fixture();
    const stale = headSha(r);
    writeFileSync(join(r, 'src/app.ts'), 'export const x = 9;\n');
    sh(r, ['git', 'commit', '-qam', 'feat: reviewed']);
    mergeUpstream(r);
    sh(r, ['git', 'update-ref', 'refs/remotes/origin/main', stale]);
    stamp(r, headSha(r));
    expect(gateWith(r, fakeBin(r)).code).toBe(0);
  });

  test('origin unreachable → REFUSED (fail closed)', () => {
    const r = fixture();
    stamp(r, headSha(r));
    rmSync(originOf(r), { recursive: true, force: true });
    const res = gateWith(r, fakeBin(r));
    expect(res.code).toBe(1);
    expect(res.err).toContain('[origin-gate] REFUSED');
    expect(res.err).toContain('fetching origin/main failed');
  });

  test('hung fetch is killed by the awake-time bound → REFUSED', () => {
    const r = fixture();
    stamp(r, headSha(r));
    const bin = fakeBin(r, `exec python3 -c 'import signal, time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(30)';`);
    const t0 = Date.now();
    const res = gateWith(r, bin);
    expect(res.code).toBe(1);
    expect(res.err).toContain('timed out after 30s');
    expect(Date.now() - t0).toBeLessThan(8_000);
  });

  test('--local-only runs the local predicate WITHOUT the origin gate (no fetch) and says it authorises no deploy', () => {
    const r = fixture();
    writeFileSync(join(r, 'data/artifact.json'), '{"n":8}\n');
    sh(r, ['git', 'commit', '-qam', 'local data']);
    stamp(r, headSha(r));
    const bin = fakeBin(r);
    const res = gateWith(r, bin, '--local-only');
    expect(res.code).toBe(0);
    expect(fetched(bin)).toBe(false);
    expect(res.out).toContain('NOT a deploy authorisation');
  });

  test('--local-only still enforces the local predicate', () => {
    const r = fixture();
    stamp(r, headSha(r), 1);
    expect(gateWith(r, fakeBin(r), '--local-only').code).not.toBe(0);
  });

  test('--local-only cannot be combined with --allow-descendant', () => {
    const r = fixture();
    stamp(r, headSha(r));
    expect(gateWith(r, fakeBin(r), '--local-only', '--allow-descendant').code).not.toBe(0);
  });

  test('`bun run deploy` (package.json) refuses a local unreviewed commit — netlify is never invoked', () => {
    // Security loop round 4: the manual path is scripts/redeploy.sh (quarantine
    // refusal, full gate, artifact gate, state=ready check), never a bare netlify call.
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    const cmd: string = pkg.scripts.deploy;
    expect(cmd).toBe('bash scripts/redeploy.sh');
    const r = fixture();
    mkdirSync(join(r, 'scripts'));
    copyFileSync(REDEPLOY, join(r, 'scripts/redeploy.sh'));
    writeFileSync(join(r, 'scripts/deploy-gate.sh'), `#!/bin/bash\nexec bash "${GATE}" "$@"\n`);
    writeFileSync(join(r, 'scripts/check-published-artifacts.ts'), 'process.exit(0);\n');
    sh(r, ['git', 'add', '-A']);
    sh(r, ['git', 'commit', '-q', '-m', 'add scripts']);
    mergeUpstream(r);
    mkdirSync(join(r, '.netlify'));
    writeFileSync(join(r, '.netlify/state.json'), '{"siteId":"s1"}\n');
    const bin = fakeBin(r);
    const state = mkdtempSync(join(tmpdir(), 'deploy-cmd-state-'));
    tmpDirs.push(state);
    const sentinel = join(bin, 'netlify-called');
    exe(join(bin, 'netlify'), `#!/bin/bash
echo "$*" >> "${sentinel}"
case "$1" in
  deploy) echo '{"deploy_id":"d1"}' ;;
  api) echo '{"state":"ready"}' ;;
esac
`);
    const run = () => sh(r, ['bash', '-c', cmd], { PATH: `${bin}:${process.env.PATH}`, AA_STATE_DIR: state });

    writeFileSync(join(r, 'src/app.ts'), 'export const x = 13;\n');
    sh(r, ['git', 'commit', '-qam', 'unreviewed']);
    stamp(r, headSha(r));
    const res = run();
    expect(res.code).toBe(2);
    expect(res.err).toContain('[origin-gate] REFUSED');
    expect(existsSync(sentinel)).toBe(false);

    mergeUpstream(r); // precondition: the same command deploys once the commit is reviewed
    const ok = run();
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('[redeploy] verified ready deploy_id=d1');
    const netlifyCalls = readFileSync(sentinel, 'utf-8');
    expect(netlifyCalls).toContain('deploy --prod --no-build --dir=dist');
    expect(netlifyCalls).toContain('api getSiteDeploy');
  });
});

describe('redeploy.sh — quarantine, gates, then deploy', () => {
  interface RP { dir: string; calls: string; state: string; home: string }
  /** Temp project: copy of redeploy.sh, stub deploy-gate.sh, stub bun + netlify. */
  function mkRedeployProject(): RP {
    const dir = mkdtempSync(join(tmpdir(), 'redeploy-'));
    tmpDirs.push(dir);
    for (const d of ['scripts', 'fake-bin', '.netlify', 'state', 'home']) mkdirSync(join(dir, d));
    copyFileSync(REDEPLOY, join(dir, 'scripts/redeploy.sh'));
    const calls = join(dir, 'calls.log');
    writeFileSync(calls, '');
    exe(join(dir, 'scripts/deploy-gate.sh'), `#!/bin/bash\necho "deploy-gate $*" >> "${calls}"\nexit "\${GATE_RC:-0}"\n`);
    exe(join(dir, 'fake-bin/bun'), `#!/bin/bash\necho "bun $*" >> "${calls}"\nexit "\${ARTIFACT_RC:-0}"\n`);
    exe(join(dir, 'fake-bin/netlify'), `#!/bin/bash
echo "netlify $*" >> "${calls}"
case "$1" in
  deploy) echo '{"deploy_id":"d1"}' ;;
  api) echo '{"state":"ready"}' ;;
esac
`);
    writeFileSync(join(dir, '.netlify/state.json'), '{"siteId":"s1"}\n');
    return { dir, calls, state: join(dir, 'state'), home: join(dir, 'home') };
  }
  const run = (p: RP, env: Record<string, string> = {}) => {
    const r = sh(p.dir, ['bash', join(p.dir, 'scripts/redeploy.sh')], {
      PATH: `${join(p.dir, 'fake-bin')}:${process.env.PATH}`, AA_STATE_DIR: p.state, HOME: p.home, ...env,
    });
    return { ...r, calls: readFileSync(p.calls, 'utf-8') };
  };

  test('refuses while the quarantine marker exists — no gate, no artifact check, no netlify', () => {
    const p = mkRedeployProject();
    writeFileSync(join(p.state, 'QUARANTINE'), 'quarantined\n');
    const r = run(p);
    expect(r.code).toBe(6);
    expect(r.err).toContain('QUARANTINE');
    expect(r.calls).toBe('');
  });

  test('default marker path is $HOME/.config/agentathens-docker/QUARANTINE when AA_STATE_DIR is unset', () => {
    const p = mkRedeployProject();
    mkdirSync(join(p.home, '.config/agentathens-docker'), { recursive: true });
    writeFileSync(join(p.home, '.config/agentathens-docker/QUARANTINE'), 'q\n');
    const env = { ...process.env, PATH: `${join(p.dir, 'fake-bin')}:${process.env.PATH}`, HOME: p.home } as Record<string, string>;
    delete env.AA_STATE_DIR;
    const r = spawnSync(['bash', join(p.dir, 'scripts/redeploy.sh')], { cwd: p.dir, env, stdout: 'pipe', stderr: 'pipe' });
    expect(r.exitCode).toBe(6);
    expect(readFileSync(p.calls, 'utf-8')).toBe('');
  });

  test('runs the published-artifact gate on dist/ and refuses when it fails — nothing deployed', () => {
    const p = mkRedeployProject();
    const r = run(p, { ARTIFACT_RC: '1' });
    expect(r.code).toBe(7);
    expect(r.calls).toContain('bun run scripts/check-published-artifacts.ts dist');
    expect(r.calls).not.toContain('netlify deploy');
  });

  test('deploy-gate refusal → nothing deployed', () => {
    const p = mkRedeployProject();
    const r = run(p, { GATE_RC: '1' });
    expect(r.code).toBe(2);
    expect(r.calls).not.toContain('netlify');
    expect(r.calls).not.toContain('check-published-artifacts');
  });

  test('happy path order: full deploy gate (no --local-only) → artifact gate → netlify deploy → state=ready', () => {
    const p = mkRedeployProject();
    const r = run(p);
    expect(r.code).toBe(0);
    const idx = (s: string) => r.calls.indexOf(s);
    expect(r.calls).toContain('deploy-gate \n');
    expect(idx('deploy-gate')).toBeLessThan(idx('check-published-artifacts'));
    expect(idx('check-published-artifacts')).toBeLessThan(idx('netlify deploy'));
    expect(idx('netlify deploy')).toBeLessThan(idx('netlify api getSiteDeploy'));
  });

  test('with the REAL gate: a local unreviewed commit is refused by the origin gate — netlify never runs', () => {
    const r = mkFixtureRepo();
    tmpDirs.push(r);
    mkdirSync(join(r, 'scripts'));
    copyFileSync(REDEPLOY, join(r, 'scripts/redeploy.sh'));
    writeFileSync(join(r, 'scripts/deploy-gate.sh'), `#!/bin/bash\nexec bash "${GATE}" "$@"\n`);
    sh(r, ['git', 'add', '-A']);
    sh(r, ['git', 'commit', '-q', '-m', 'add scripts']);
    mergeUpstream(r);
    writeFileSync(join(r, 'src/app.ts'), 'export const x = 77;\n');
    sh(r, ['git', 'commit', '-qam', 'unreviewed']);
    stamp(r, headSha(r));
    const bin = mkdtempSync(join(tmpdir(), 'redeploy-bin-'));
    const state = mkdtempSync(join(tmpdir(), 'redeploy-state-'));
    tmpDirs.push(bin, state);
    const sentinel = join(bin, 'netlify-called');
    exe(join(bin, 'netlify'), `#!/bin/bash\necho "$*" >> "${sentinel}"\n`);
    const res = sh(r, ['bash', join(r, 'scripts/redeploy.sh')], { PATH: `${bin}:${process.env.PATH}`, AA_STATE_DIR: state });
    expect(res.code).toBe(2);
    expect(res.err).toContain('[origin-gate] REFUSED');
    expect(existsSync(sentinel)).toBe(false);
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

  test('manual path: package.json "deploy" is scripts/redeploy.sh and nothing else (no direct netlify call)', () => {
    const script: string = pkg.scripts.deploy;
    expect(script).toBe('bash scripts/redeploy.sh');
    expect(script).not.toContain('netlify');
  });

  test('redeploy.sh runs the FULL gate (origin gate included), the artifact gate and the quarantine check before netlify', () => {
    const rd = readFileSync(REDEPLOY, 'utf-8');
    expect(rd).toContain('bash scripts/deploy-gate.sh ||');
    expect(rd).not.toContain('--local-only');
    expect(rd).toContain('check-published-artifacts.ts dist');
    expect(rd).toContain('QUARANTINE');
    const deploy = rd.indexOf('netlify deploy --prod');
    for (const t of ['QUARANTINE', 'deploy-gate.sh', 'check-published-artifacts.ts']) expect(rd.indexOf(t)).toBeLessThan(deploy);
  });

  test('redeploy.sh documents that it (and `bun run deploy`) needs the host Netlify login, unlike the watchdog restore (round 5)', () => {
    const header = readFileSync(REDEPLOY, 'utf-8').split('\nset -o pipefail')[0];
    expect(header).toContain('host Netlify login');
    expect(header).toContain('bun run deploy');
    expect(header).toContain('docker/aa-run.sh restore');
  });

  test('the origin gate lives in deploy-gate.sh (weaken-guard tokens)', () => {
    const gate = readFileSync(GATE, 'utf-8');
    expect(gate).toContain('readonly PRODUCTION_BRANCH="main"');
    expect(gate).toContain('# origin-gate:begin');
    expect(gate).toContain('merge-base --is-ancestor "$HEAD_SHA" "$og_tip"');
    expect(gate).toContain('GIT_TERMINAL_PROMPT=0');
    expect(gate).toContain('run_awake_bounded');
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

  test('source scope covers everything `netlify deploy` reads besides dist/ (netlify/, netlify.toml, static/, bunfig.toml)', () => {
    const scope: string[] = JSON.parse(readFileSync(join(PROJECT_ROOT, 'config/deploy-gate-scope.json'), 'utf-8')).sourceScope;
    for (const p of ['src', 'config', 'scripts', 'package.json', 'tsconfig.json', 'netlify', 'netlify.toml', 'static', 'bunfig.toml']) {
      expect(scope).toContain(p);
    }
  });

  test('gate verifies the dist/ content hash recorded in the stamp (weaken-guard)', () => {
    const gate = readFileSync(GATE, 'utf-8');
    expect(gate).toContain('distHash');
  });

  test('replace refs are off (GIT_NO_REPLACE_OBJECTS=1) before the first git call in every deploy-path script (round 5)', () => {
    for (const rel of ['scripts/deploy-gate.sh', 'scripts/daily-automated.sh', 'scripts/redeploy.sh']) {
      const lines = readFileSync(join(PROJECT_ROOT, rel), 'utf-8').split('\n');
      const exportAt = lines.findIndex((l) => l === 'export GIT_NO_REPLACE_OBJECTS=1');
      expect(exportAt).toBeGreaterThan(-1);
      const firstGit = lines.findIndex((l) => !/^\s*#/.test(l) && /(^|[^\w.$/-])git\s+[-a-z]/.test(l));
      if (firstGit !== -1) expect(exportAt).toBeLessThan(firstGit);
      // Top level, not inside a function: nothing may run before it.
      const firstFn = lines.findIndex((l) => /^[a-z_]+\(\)\s*\{/.test(l));
      if (firstFn !== -1) expect(exportAt).toBeLessThan(firstFn);
    }
  });

  test('gate checks all three conditions (weaken-guard: tokens present in gate script)', () => {
    const gate = readFileSync(GATE, 'utf-8');
    expect(gate).toContain('.build-provenance');
    expect(gate).toContain('status --porcelain');
    expect(gate).toContain('sourceDirty');
    expect(gate).toContain('rev-parse HEAD');
  });
});

describe('push-gate — the pipeline pushes ONLY refs/heads/pipeline-data, never main (seam guards)', () => {
  // HISTORY: the gate once compared HEAD with refs/heads/main before `git push
  // origin main` (2026-07 incident: a stale local main was pushed while HEAD
  // sat on a feature branch). Security loop round 3 moved the artifact commit
  // off main entirely: it is built with git plumbing on refs/heads/pipeline-data
  // and only that ref is pushed, so the pipeline's token needs no bypass of
  // main's PR rule. The gate now states "the ref we push IS the artifact commit
  // this run recorded, and its content is allowlisted data only".
  const daily = readFileSync(join(PROJECT_ROOT, 'scripts/daily-automated.sh'), 'utf-8');
  const runDeployBody = daily.slice(daily.indexOf('run_deploy()'));

  test('PIPELINE_DATA_BRANCH constant is declared; nothing in the script pushes main', () => {
    expect(daily).toContain('readonly PIPELINE_DATA_BRANCH="pipeline-data"');
    expect(daily).not.toContain('git push origin main');
    expect(daily).not.toContain('PRODUCTION_BRANCH');
    const pushes = daily.match(/\bpush origin [^\n]*/g) ?? [];
    expect(pushes.length).toBe(1);
    expect(pushes[0]).toContain('push origin "refs/heads/$PIPELINE_DATA_BRANCH:refs/heads/$PIPELINE_DATA_BRANCH"');
  });

  test('gate sits BETWEEN the artifact commit and the push inside run_deploy', () => {
    const commitIdx = runDeployBody.indexOf('commit_pipeline_data');
    const gateIdx = runDeployBody.indexOf('[push-gate]');
    const pushIdx = runDeployBody.indexOf('push origin');
    expect(commitIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(commitIdx);
    expect(pushIdx).toBeGreaterThan(gateIdx);
  });

  test('gate compares resolved SHAs, fails closed, checks content and REFUSES loudly (weaken-guard tokens)', () => {
    expect(runDeployBody).toContain('"$pd_sha" != "$pd_expected"');
    expect(runDeployBody).toContain('-z "$pd_expected"');
    expect(runDeployBody).toContain('-z "$pd_sha"');
    expect(runDeployBody).toContain('check_pipeline_data_commits "$pd_sha"');
    expect(runDeployBody).toContain('[push-gate] REFUSED');
  });

  test('the artifact commit never uses the porcelain commit/add (they would move HEAD or the real index)', () => {
    const body = runDeployBody.slice(0, runDeployBody.indexOf('\n}\n'));
    expect(body).not.toMatch(/\bgit commit\b/);
    expect(body).not.toMatch(/\bgit add\b/);
    const fn = daily.slice(daily.indexOf('commit_pipeline_data() {'));
    expect(fn).toContain('GIT_INDEX_FILE=');
    expect(fn).toContain('git commit-tree');
    expect(fn).toContain('git update-ref');
  });
});

describe('push-gate — behavior (real blocks extracted from the script, run in fixture repos)', () => {
  // Executes the ACTUAL push-gate block and the pipeline-data content gate —
  // sliced verbatim out of daily-automated.sh between their markers — inside
  // throwaway repos with a bare origin.
  const PUSH_GATE_BEGIN = '# push-gate:begin';
  const PUSH_GATE_END = '# push-gate:end';
  const PD_GATE_BEGIN = '# pipeline-data-gate:begin';
  const PD_GATE_END = '# pipeline-data-gate:end';
  const MSG = 'chore: daily pipeline update 2026-09-23';

  let repos: string[] = [];
  afterAll(() => { for (const r of repos) rmSync(r, { recursive: true, force: true }); });

  function extract(begin: string, end: string): string {
    const daily = readFileSync(join(PROJECT_ROOT, 'scripts/daily-automated.sh'), 'utf-8');
    const b = daily.indexOf(begin);
    const e = daily.indexOf(end);
    if (b === -1 || e === -1 || e <= b) throw new Error(`markers ${begin} … ${end} missing from daily-automated.sh — extraction contract broken`);
    if (daily.indexOf(begin, b + 1) !== -1 || daily.indexOf(end, e + 1) !== -1) throw new Error(`duplicate markers ${begin}`);
    return daily.slice(daily.indexOf('\n', b) + 1, e);
  }

  /** Repo on main (pushed) plus a local pipeline-data branch whose root commit
   *  holds only data/a.json — built with plumbing so HEAD stays on main. */
  function mkPushFixture(): { dir: string; remote: string; pd: string } {
    const dir = mkdtempSync(join(tmpdir(), 'push-gate-'));
    const remote = mkdtempSync(join(tmpdir(), 'push-gate-remote-'));
    repos.push(dir, remote);
    sh(remote, ['git', 'init', '-q', '--bare']);
    sh(dir, ['git', 'init', '-q', '-b', 'main']);
    sh(dir, ['git', 'config', 'user.email', 't@t']);
    sh(dir, ['git', 'config', 'user.name', 't']);
    sh(dir, ['git', 'config', 'commit.gpgsign', 'false']);
    writeFileSync(join(dir, 'f.txt'), 'a\n');
    sh(dir, ['git', 'add', 'f.txt']);
    sh(dir, ['git', 'commit', '-q', '-m', 'baseline']);
    sh(dir, ['git', 'remote', 'add', 'origin', remote]);
    sh(dir, ['git', 'push', '-q', 'origin', 'main']);
    const pd = pdCommit(dir, { 'data/a.json': '{"n":1}\n' });
    return { dir, remote, pd };
  }

  /** Plumbing commit on refs/heads/pipeline-data with exactly `files`. */
  function pdCommit(dir: string, files: Record<string, string>, msg = MSG, parents: string[] = []): string {
    const idx = join(mkdtempSync(join(tmpdir(), 'pd-idx-')), 'index');
    const env = { GIT_INDEX_FILE: idx };
    sh(dir, ['git', 'read-tree', '--empty'], env);
    for (const [path, body] of Object.entries(files)) {
      const src = join(dir, '.pd-src');
      writeFileSync(src, body);
      const blob = sh(dir, ['git', 'hash-object', '-w', src]).out.trim();
      rmSync(src);
      sh(dir, ['git', 'update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], env);
    }
    const tree = sh(dir, ['git', 'write-tree'], env).out.trim();
    const pArgs = parents.flatMap((p) => ['-p', p]);
    const c = sh(dir, ['git', 'commit-tree', tree, ...pArgs, '-m', msg]).out.trim();
    sh(dir, ['git', 'update-ref', 'refs/heads/pipeline-data', c]);
    return c;
  }

  const refOf = (repo: string, ref: string) => sh(repo, ['git', 'rev-parse', '--verify', '-q', ref]).out.trim();

  /** Run the extracted blocks with stubbed log helpers. `expected` = the sha
   *  the run recorded (pd_expected). */
  function runPushGate(dir: string, expected: string, fakePush?: string, allowlist = ['data/a.json', 'data/b.json']) {
    const realGit = sh(dir, ['which', 'git']).out.trim();
    const bin = mkdtempSync(join(tmpdir(), 'push-gate-bin-'));
    repos.push(bin);
    if (fakePush) {
      writeFileSync(join(bin, 'git'), `#!/bin/bash
if [[ " $* " == *" push "* ]]; then
  echo "prompt=$GIT_TERMINAL_PROMPT args=$*" > "${join(bin, 'push-call')}"
  ${fakePush}
fi
exec "${realGit}" "$@"
`, { mode: 0o755 });
    }
    writeFileSync(join(bin, 'sleep'), '#!/bin/bash\nexec /bin/sleep 0.05\n', { mode: 0o755 });
    writeFileSync(join(bin, 'gh'), '#!/bin/bash\nexit 99\n', { mode: 0o755 });
    const harness = [
      '#!/bin/bash',
      'PIPELINE_DATA_BRANCH="pipeline-data"',
      `PIPELINE_ALLOWLIST=(${allowlist.map((a) => `"${a}"`).join(' ')})`,
      `export PATH="${bin}:$PATH"`,
      'PUSH_TIMEOUT=30',
      `LOG_FILE="${join(bin, 'push-gate.log')}"`,
      'log(){ echo "$1"; }',
      'log_error(){ echo "ERROR: $1" >&2; }',
      extract(PD_GATE_BEGIN, PD_GATE_END), // defines pd_tree_only_allowlisted + check_pipeline_data_commits
      'gate(){',
      `local pd_expected="${expected}"`,
      extract(PUSH_GATE_BEGIN, PUSH_GATE_END),
      '}',
      'gate || { echo "stopped-before-deploy rc=$?"; exit 0; }',
      'echo continued-to-deploy',
    ].join('\n');
    const f = join(bin, 'gate-harness.sh');
    writeFileSync(f, harness);
    const p = spawnSync(['/bin/bash', f], { cwd: dir, stdout: 'pipe', stderr: 'pipe', timeout: 4000, killSignal: 'SIGKILL' });
    const call = existsSync(join(bin, 'push-call')) ? readFileSync(join(bin, 'push-call'), 'utf8') : '';
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString(), call };
  }

  test('push is non-interactive, uses the gh credential helper and names ONLY the pipeline-data refspec', () => {
    const { dir, pd } = mkPushFixture();
    const res = runPushGate(dir, pd, 'exit 0');
    expect(res.code).toBe(0);
    expect(res.call).toContain('prompt=0 ');
    expect(res.call).toContain('-c credential.helper=!gh auth git-credential push origin refs/heads/pipeline-data:refs/heads/pipeline-data');
  });

  test('fast auth failure logs an error and continues to deploy', () => {
    const { dir, pd } = mkPushFixture();
    const res = runPushGate(dir, pd, 'echo "fatal: authentication failed" >&2; exit 128');
    expect(res.code).toBe(0);
    expect(res.err).toContain('ERROR: Git push failed');
    expect(res.err).toContain('non-interactive auth/transport failure (exit 128)');
    expect(res.out).toContain('continued-to-deploy');
    expect(res.out).not.toContain('Pipeline outputs pushed');
  });

  for (const ignoreTerm of [false, true]) {
    test(`hung push is killed within awake tick budget (ignore TERM=${ignoreTerm})`, () => {
      const { dir, remote, pd } = mkPushFixture();
      const started = performance.now();
      const bin = mkdtempSync(join(tmpdir(), 'push-pid-'));
      repos.push(bin);
      const res = runPushGate(dir, pd, `exec python3 -c 'import os, signal, time; open("${join(bin, 'push-pid')}", "w").write(str(os.getpid())); ${ignoreTerm ? 'signal.signal(signal.SIGTERM, signal.SIG_IGN);' : ''} time.sleep(1.5)'`);
      expect(res.code).toBe(0);
      expect(res.err).toContain('ERROR: Git push failed');
      expect(performance.now() - started).toBeLessThan(1500); // 2 deadline + 4 grace ticks at 50 ms each, plus fixture git calls
      expect(res.err).toContain('timeout after 30s of awake time');
      expect(res.out).toContain('continued-to-deploy');
      expect(res.out).not.toContain('Pipeline outputs pushed');
      expect(refOf(remote, 'refs/heads/pipeline-data')).toBe('');
      const pid = Number(readFileSync(join(bin, 'push-pid'), 'utf8'));
      expect(() => process.kill(pid, 0)).toThrow();
    });
  }

  test('gate block markers exist in the script (extraction contract)', () => {
    expect(extract(PUSH_GATE_BEGIN, PUSH_GATE_END).length).toBeGreaterThan(0);
    expect(extract(PD_GATE_BEGIN, PD_GATE_END).length).toBeGreaterThan(0);
  });

  test('pushes pipeline-data; remote main, local HEAD and the working tree are untouched', () => {
    const { dir, remote, pd } = mkPushFixture();
    const mainBefore = refOf(remote, 'refs/heads/main');
    const headBefore = refOf(dir, 'HEAD');
    const res = runPushGate(dir, pd);
    expect(res.out).toContain('Pipeline outputs pushed to git');
    expect(res.err).not.toContain('[push-gate] REFUSED');
    expect(refOf(remote, 'refs/heads/pipeline-data')).toBe(pd);
    expect(refOf(remote, 'refs/heads/main')).toBe(mainBefore);
    expect(refOf(dir, 'HEAD')).toBe(headBefore);
    expect(sh(dir, ['git', 'status', '--porcelain']).out).toBe('');
  });

  test('pipeline-data moved after the run recorded it (sha != recorded) → REFUSED, nothing pushed, continues to deploy', () => {
    const { dir, remote, pd } = mkPushFixture();
    pdCommit(dir, { 'data/a.json': '{"n":2}\n' }, MSG, [pd]);
    const res = runPushGate(dir, pd);
    expect(res.err).toContain('[push-gate] REFUSED');
    expect(res.out).toContain('continued-to-deploy');
    expect(refOf(remote, 'refs/heads/pipeline-data')).toBe('');
  });

  test('nothing recorded, or the ref missing → FAIL CLOSED (REFUSED), not a push of garbage', () => {
    const { dir, remote } = mkPushFixture();
    expect(runPushGate(dir, '').err).toContain('[push-gate] REFUSED');
    sh(dir, ['git', 'update-ref', '-d', 'refs/heads/pipeline-data']);
    expect(runPushGate(dir, 'f'.repeat(40)).err).toContain('[push-gate] REFUSED');
    expect(refOf(remote, 'refs/heads/pipeline-data')).toBe('');
  });

  test('TAMPER: a pipeline-data commit carrying a non-allowlisted path → REFUSED and the run stops before deploy', () => {
    const { dir, remote, pd } = mkPushFixture();
    const bad = pdCommit(dir, { 'data/a.json': '{"n":3}\n', 'src/evil.ts': 'export {};\n' }, MSG, [pd]);
    const res = runPushGate(dir, bad);
    expect(res.err).toContain('[push-gate] REFUSED');
    expect(res.err).toContain('src/evil.ts');
    expect(res.out).toContain('stopped-before-deploy');
    expect(res.out).not.toContain('continued-to-deploy');
    expect(refOf(remote, 'refs/heads/pipeline-data')).toBe('');
  });

  test('TAMPER: wrong message, merge commit, or a symlink entry → REFUSED', () => {
    for (const make of [
      (dir: string, pd: string) => pdCommit(dir, { 'data/a.json': '{"n":4}\n' }, 'update data', [pd]),
      (dir: string, pd: string) => {
        const side = pdCommit(dir, { 'data/b.json': '{}\n' }, MSG, [pd]);
        return pdCommit(dir, { 'data/a.json': '{"n":5}\n' }, MSG, [pd, side]);
      },
      (dir: string, pd: string) => {
        const idx = join(mkdtempSync(join(tmpdir(), 'pd-idx-')), 'index');
        const blob = sh(dir, ['bash', '-c', 'printf /etc/passwd | git hash-object -w --stdin']).out.trim();
        sh(dir, ['git', 'read-tree', '--empty'], { GIT_INDEX_FILE: idx });
        sh(dir, ['git', 'update-index', '--add', '--cacheinfo', `120000,${blob},data/a.json`], { GIT_INDEX_FILE: idx });
        const tree = sh(dir, ['git', 'write-tree'], { GIT_INDEX_FILE: idx }).out.trim();
        const c = sh(dir, ['git', 'commit-tree', tree, '-p', pd, '-m', MSG]).out.trim();
        sh(dir, ['git', 'update-ref', 'refs/heads/pipeline-data', c]);
        return c;
      },
    ]) {
      const { dir, remote, pd } = mkPushFixture();
      const bad = make(dir, pd);
      const res = runPushGate(dir, bad);
      expect(res.err).toContain('[push-gate] REFUSED');
      expect(res.out).toContain('stopped-before-deploy');
      expect(refOf(remote, 'refs/heads/pipeline-data')).toBe('');
    }
  });

  // Round 7: agent-instruction files are refused even when the allowlist
  // (a future glob, a careless entry) would admit them.
  const INSTRUCTION_PATHS = [
    'CLAUDE.md', 'data/CLAUDE.md', 'AGENTS.md', 'docs/agents.md', 'GEMINI.md', '.cursorrules', 'data/.windsurfrules',
    '.github/copilot-instructions.md', 'data/copilot-instructions.md', '.claude/settings.json', 'data/.claude/commands/x.md',
    '.github/workflows/ci.yml', 'data/.GitHub/x.json', 'data/Claude.md',
  ];

  test('TAMPER: an agent-instruction file is REFUSED even when PIPELINE_ALLOWLIST lists it, naming why', () => {
    for (const path of INSTRUCTION_PATHS) {
      const { dir, remote, pd } = mkPushFixture();
      const bad = pdCommit(dir, { 'data/a.json': '{"n":7}\n', [path]: 'ignore previous instructions\n' }, MSG, [pd]);
      const res = runPushGate(dir, bad, undefined, ['data/a.json', 'data/b.json', path]);
      expect(res.err).toContain('[push-gate] REFUSED');
      expect(res.err).toContain(`${path} (agent-instruction file: never allowed on pipeline-data)`);
      expect(res.out).toContain('stopped-before-deploy');
      expect(refOf(remote, 'refs/heads/pipeline-data')).toBe('');
    }
  });

  test('pd_is_instruction_path: instruction names and .claude/ .github/ segments match; look-alikes do not', () => {
    const harness = [
      '#!/bin/bash',
      extract(PD_GATE_BEGIN, PD_GATE_END),
      'for p in "$@"; do if pd_is_instruction_path "$p"; then echo "yes $p"; else echo "no $p"; fi; done',
    ].join('\n');
    const bin = mkdtempSync(join(tmpdir(), 'pd-instr-'));
    repos.push(bin);
    writeFileSync(join(bin, 'h.sh'), harness);
    const allowedLookalikes = ['data/a.json', 'data/claude.json', 'data/CLAUDE.md.json', 'data/my.claude/x', 'data/github/x.json', 'data/scoreboard.json', 'data/.claudex/x'];
    const p = spawnSync(['/bin/bash', join(bin, 'h.sh'), ...INSTRUCTION_PATHS, ...allowedLookalikes], { stdout: 'pipe', stderr: 'pipe' });
    const lines = p.stdout.toString().trim().split('\n');
    expect(lines).toEqual([...INSTRUCTION_PATHS.map((x) => `yes ${x}`), ...allowedLookalikes.map((x) => `no ${x}`)]);
  });

  test('the instruction-path refusal runs before the allowlist match (seam)', () => {
    const gate = extract(PD_GATE_BEGIN, PD_GATE_END);
    const fn = gate.slice(gate.indexOf('pd_tree_only_allowlisted() {'));
    expect(fn.indexOf('pd_is_instruction_path "$path"')).toBeGreaterThan(-1);
    expect(fn.indexOf('pd_is_instruction_path "$path"')).toBeLessThan(fn.indexOf('for allowed in'));
  });

  test('only commits not yet on origin/pipeline-data are re-checked; an allowlisted follow-up passes', () => {
    const { dir, remote, pd } = mkPushFixture();
    expect(runPushGate(dir, pd).out).toContain('Pipeline outputs pushed to git');
    const next = pdCommit(dir, { 'data/a.json': '{"n":6}\n', 'data/b.json': '{}\n' }, MSG, [pd]);
    const res = runPushGate(dir, next);
    expect(res.out).toContain('Pipeline outputs pushed to git');
    expect(refOf(remote, 'refs/heads/pipeline-data')).toBe(next);
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

  test('records distHash = computeDistHash(dist) and the hash excludes the stamp itself', async () => {
    const { writeBuildProvenance } = await import('../../src/utils/build-provenance');
    const r = mkFixtureRepo(); repos.push(r);
    writeFileSync(join(r, 'dist/a.html'), 'A');
    const before = computeDistHash(join(r, 'dist'));
    writeBuildProvenance(join(r, 'dist'), r);
    const content = readFileSync(join(r, 'dist/.build-provenance'), 'utf-8');
    expect(content).toMatch(/^distHash=[0-9a-f]{64}$/m);
    expect(content).toContain(`distHash=${before}`);
    expect(computeDistHash(join(r, 'dist'))).toBe(before); // stamp present, hash unchanged
  });

  test('computeDistHash: deterministic, sensitive to bytes, paths and additions', () => {
    const r = mkFixtureRepo(); repos.push(r);
    const d = join(r, 'dist');
    mkdirSync(join(d, 'sub'));
    writeFileSync(join(d, 'sub/b.html'), 'B');
    writeFileSync(join(d, 'a.html'), 'A');
    const h1 = computeDistHash(d);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(computeDistHash(d)).toBe(h1);
    writeFileSync(join(d, 'a.html'), 'A2');
    const h2 = computeDistHash(d);
    expect(h2).not.toBe(h1);
    writeFileSync(join(d, 'a.html'), 'A');
    expect(computeDistHash(d)).toBe(h1);
    rmSync(join(d, 'a.html'));
    writeFileSync(join(d, 'c.html'), 'A'); // same bytes, different path
    expect(computeDistHash(d)).not.toBe(h1);
  });

  test('non-source dirt (data/) does not set sourceDirty', async () => {
    const { writeBuildProvenance } = await import('../../src/utils/build-provenance');
    const r = mkFixtureRepo(); repos.push(r);
    writeFileSync(join(r, 'data/artifact.json'), '{"n":9}\n');
    writeBuildProvenance(join(r, 'dist'), r);
    expect(readFileSync(join(r, 'dist/.build-provenance'), 'utf-8')).toContain('sourceDirty=0');
  });
});
