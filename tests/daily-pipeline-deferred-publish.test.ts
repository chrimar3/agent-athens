/**
 * scripts/daily-automated.sh — the pipeline-data artifact commit, deferred
 * publish and `publish` mode.
 *
 * Artifact commit (security loop round 3): the allowlisted data artifacts are
 * committed to refs/heads/pipeline-data with git plumbing (temporary
 * GIT_INDEX_FILE, hash-object, update-index, write-tree, commit-tree,
 * update-ref). HEAD, main, the real index and the working tree never change,
 * and the only ref the pipeline pushes is pipeline-data. main therefore needs
 * no ruleset bypass for the pipeline's token.
 *
 * Deferred publish (AA_DEFER_PUBLISH=1): a producing run (freshness/full)
 * runs the deploy gate's local predicate (--local-only) and the artifact
 * commit, then STOPS before anything that needs the GitHub or Netlify
 * credentials and leaves .pipeline-publish-ready (headSha, builtSha,
 * distHash, pipelineDataSha, createdAt). `publish` mode ships that build: no
 * ingest/scrape/enrich/generate; re-verifies (marker vs stamp, the full deploy
 * gate incl. the origin gate, published-artifact gate), pushes pipeline-data,
 * deploys, verifies state=ready, records cadence, prints ONE stable
 * `PUBLISH-RESULT deploy_id=… dist_hash=… state=ready` line on stdout (parsed
 * by the host wrapper) and removes the marker.
 *
 * Origin gate: lives in scripts/deploy-gate.sh (its own suite in
 * scripts/__tests__/deploy-gate.test.ts). Most whole-script tests here stub
 * the gate; the `real gate` tests run the real one against the bare origin.
 *
 * Whole-script tests run a copy of the real script in a throwaway repo with a
 * bare "origin". The only textual change is the hard-coded launchd PATH line
 * (it would put /usr/bin ahead of the stubs). bun, netlify, the sqlite CLI,
 * gh and sleep are stubs; git is the real binary behind a wrapper that
 * records push/fetch. Nothing touches data/events.db.
 */
import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync, copyFileSync, symlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';

const ROOT = join(import.meta.dir, '..');
const SCRIPT_PATH = join(ROOT, 'scripts', 'daily-automated.sh');
const SCRIPT = readFileSync(SCRIPT_PATH, 'utf-8');
const REAL_GATE = join(ROOT, 'scripts', 'deploy-gate.sh');
const PATH_LINE = /^export PATH="\/Users\/chrism\/[^\n]*\n/m;
const REAL_GIT = spawnSync('which', ['git'], { encoding: 'utf-8' }).stdout.trim();
const REAL_SLEEP = spawnSync('which', ['sleep'], { encoding: 'utf-8' }).stdout.trim();
const DIST_HASH = 'ab'.repeat(32);
const ALLOWLIST = ['data/build-completeness.json', 'data/event-set-hashes.json', 'data/scoreboard.json'];
const PD_MSG = /^chore: daily pipeline update \d{4}-\d{2}-\d{2}$/;

const cleanup: string[] = [];
afterAll(() => { for (const d of cleanup) rmSync(d, { recursive: true, force: true }); });

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(d);
  return d;
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(REAL_GIT, args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function gitMaybe(cwd: string, ...args: string[]): string {
  const r = spawnSync(REAL_GIT, args, { cwd, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function exe(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

interface Project { dir: string; remote: string; calls: string }

/** realGate: run the REAL scripts/deploy-gate.sh (origin gate included)
 *  against the bare origin instead of the recording stub. */
function mkProject(opts: { realGate?: boolean } = {}): Project {
  const dir = tmp('aa-publish-');
  const remote = tmp('aa-publish-origin-');
  const calls = join(dir, 'calls.log');
  for (const d of ['scripts', 'data', 'fake-bin', '.netlify', 'src', 'config']) mkdirSync(join(dir, d));

  const patched = SCRIPT.replace(PATH_LINE, 'export PATH="$PATH"\n');
  if (patched === SCRIPT) throw new Error('launchd PATH line not found — harness contract broken');
  exe(join(dir, 'scripts/daily-automated.sh'), patched);
  if (opts.realGate) {
    copyFileSync(REAL_GATE, join(dir, 'scripts/deploy-gate.sh'));
    copyFileSync(join(ROOT, 'config/deploy-gate-scope.json'), join(dir, 'config/deploy-gate-scope.json'));
  } else {
    exe(join(dir, 'scripts/deploy-gate.sh'), '#!/bin/bash\necho "deploy-gate $*" >> "$TEST_CALLS"\nexit "${GATE_RC:-0}"\n');
  }
  exe(join(dir, 'scripts/assert-events-db-healthy.sh'), '#!/bin/bash\nexit 0\n');
  exe(join(dir, 'scripts/backup-events-db.sh'), '#!/bin/bash\nexit 0\n');
  writeFileSync(join(dir, 'package.json'), '{}\n');
  writeFileSync(join(dir, '.gitignore'), 'dist/\nlogs/\n.netlify/\nfake-bin/\ncalls.log\n.pipeline-*\n');
  for (const f of ALLOWLIST) writeFileSync(join(dir, f), '{}\n');
  writeFileSync(join(dir, 'src/app.ts'), 'export const x = 1;\n');
  writeFileSync(join(dir, '.netlify/state.json'), '{"siteId":"site-1"}\n');

  const bin = join(dir, 'fake-bin');
  exe(join(bin, 'bun'), `#!/bin/bash
echo "bun $*" >> "$TEST_CALLS"
if [[ "$1 $2" == "run build" ]]; then
  mkdir -p dist && echo "<p>page</p>" > dist/index.html
  printf 'sha=%s\\nsourceDirty=0\\ndistHash=%s\\nbuiltAt=x\\n' "$(git rev-parse HEAD)" "${DIST_HASH}" > dist/.build-provenance
fi
if [[ "$1" == */build-provenance.ts && "$2" == dist-hash ]]; then echo "${DIST_HASH}"; fi
if [[ "$2" == "scripts/assemble-scoreboard.ts" ]]; then echo "{\\"run\\":\\"$RANDOM$RANDOM\\"}" > data/scoreboard.json; fi
if [[ "$2" == "scripts/check-published-artifacts.ts" ]]; then exit "\${ARTIFACT_RC:-0}"; fi
exit 0
`);
  exe(join(bin, 'sqlite3'), '#!/bin/bash\necho 0\n');
  exe(join(bin, 'node'), '#!/bin/bash\necho v0\n');
  exe(join(bin, 'gh'), '#!/bin/bash\nexit 99\n');
  exe(join(bin, 'sleep'), `#!/bin/bash\nexec "${REAL_SLEEP}" 0.05\n`);
  exe(join(bin, 'netlify'), `#!/bin/bash
echo "netlify $*" >> "$TEST_CALLS"
case "$1" in
  --version) echo "netlify-cli/test" ;;
  deploy) ls -a | grep '^\\.pipeline-' | sed 's/^/present /' >> "$TEST_CALLS"; printf '{"deploy_id":"%s"}\\n' "\${DEPLOY_ID_OUT:-5f1e2d3c4b5a69788796a5b4}" ;;
  api) if [[ "$2" == getSiteDeploy ]]; then echo '{"state":"ready"}'; else echo '[]'; fi ;;
esac
exit 0
`);
  exe(join(bin, 'git'), `#!/bin/bash
for a in "$@"; do case "$a" in push) echo "git push: $*" >> "$TEST_CALLS" ;; fetch) echo "git fetch" >> "$TEST_CALLS" ;; esac; done
exec "${REAL_GIT}" "$@"
`);

  git(remote, 'init', '-q', '--bare');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'pipeline@test');
  git(dir, 'config', 'user.name', 'pipeline');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'baseline');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  return { dir, remote, calls };
}

interface Run { status: number | null; calls: string; log: string; stdout: string; stderr: string }

function runPipeline(p: Project, mode: string, env: Record<string, string> = {}): Run {
  writeFileSync(p.calls, '');
  const base: Record<string, string> = { ...(process.env as Record<string, string>) };
  delete base.AA_DEFER_PUBLISH;
  const r = spawnSync('bash', [join(p.dir, 'scripts/daily-automated.sh'), mode], {
    cwd: p.dir,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...base, PATH: `${join(p.dir, 'fake-bin')}:${process.env.PATH}`, TEST_CALLS: p.calls, AA_CAFFEINATED: '1', FETCH_TIMEOUT: '30', ...env },
  });
  const logDir = join(p.dir, 'logs');
  const log = existsSync(logDir)
    ? readdirSync(logDir).filter(f => f.startsWith('pipeline-')).map(f => readFileSync(join(logDir, f), 'utf-8')).join('\n')
    : '';
  return { status: r.status, calls: readFileSync(p.calls, 'utf-8'), log, stdout: r.stdout, stderr: r.stderr };
}

const marker = (p: Project) => join(p.dir, '.pipeline-publish-ready');
const remoteMain = (p: Project) => git(p.remote, 'rev-parse', 'refs/heads/main');
const remotePd = (p: Project) => gitMaybe(p.remote, 'rev-parse', '--verify', '-q', 'refs/heads/pipeline-data');
const localPd = (p: Project) => gitMaybe(p.dir, 'rev-parse', '--verify', '-q', 'refs/heads/pipeline-data');
const head = (p: Project) => git(p.dir, 'rev-parse', 'HEAD');
const cadence = (p: Project) => {
  const f = join(p.dir, 'logs/deploy-cadence.log');
  return existsSync(f) ? readFileSync(f, 'utf-8') : '';
};
/** Everything the artifact commit must NOT change. */
const snapshot = (p: Project) => ({
  head: head(p),
  main: git(p.dir, 'rev-parse', 'refs/heads/main'),
  symbolic: gitMaybe(p.dir, 'symbolic-ref', '-q', 'HEAD'),
  status: git(p.dir, '--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=all'), // must not refresh the index it measures
  index: createHash('sha256').update(readFileSync(join(p.dir, '.git/index'))).digest('hex'),
});
const pdTree = (p: Project, rev = 'refs/heads/pipeline-data') => git(p.dir, 'ls-tree', '-r', '--name-only', rev).split('\n').filter(Boolean);
const publishResultLines = (r: Run) => r.stdout.split('\n').filter(l => l.includes('PUBLISH-RESULT'));

describe('artifact commit → refs/heads/pipeline-data (plumbing; HEAD, main, index and working tree untouched)', () => {
  test('baseline run: pipeline-data commit + push of ONLY pipeline-data; main untouched everywhere', () => {
    const p = mkProject();
    const mainBefore = remoteMain(p);
    const headBefore = head(p);
    const r = runPipeline(p, 'freshness');
    expect(r.status).toBe(0);
    // HEAD / local main / remote main never move:
    expect(head(p)).toBe(headBefore);
    expect(git(p.dir, 'rev-parse', 'refs/heads/main')).toBe(headBefore);
    expect(remoteMain(p)).toBe(mainBefore);
    // The artifact commit is a root commit on pipeline-data holding only the allowlist:
    const pd = localPd(p);
    expect(pd).toMatch(/^[0-9a-f]{40}$/);
    expect(git(p.dir, 'log', '-1', '--format=%s', pd)).toMatch(PD_MSG);
    expect(git(p.dir, 'rev-list', '--parents', '-n', '1', pd).split(' ').length).toBe(1);
    expect(pdTree(p).sort()).toEqual([...ALLOWLIST].sort());
    expect(git(p.dir, 'show', `${pd}:data/scoreboard.json`)).toBe(readFileSync(join(p.dir, 'data/scoreboard.json'), 'utf-8').trim());
    // Pushed: only the pipeline-data refspec.
    expect(remotePd(p)).toBe(pd);
    const pushes = r.calls.split('\n').filter(l => l.startsWith('git ') && l.includes(' push '));
    expect(pushes.length).toBe(1);
    expect(pushes[0]).toContain('push origin refs/heads/pipeline-data:refs/heads/pipeline-data');
    expect(r.calls).not.toMatch(/push origin main/);
    expect(r.calls).toContain('deploy-gate \n');              // full gate (origin gate included)
    expect(r.calls).toContain('netlify deploy --prod --no-build --dir=dist');
    expect(cadence(p)).toContain('deploy-success');
    expect(existsSync(marker(p))).toBe(false);
    expect(r.calls).toContain('bun run scripts/ping-indexnow.ts');
    expect(publishResultLines(r)).toEqual([]);                 // only publish mode prints it
  });

  test('WIP staged by a developer stays staged and uncommitted; untracked files stay untracked', () => {
    const p = mkProject();
    writeFileSync(join(p.dir, 'src/wip.ts'), 'export const wip = 1;\n');
    git(p.dir, 'add', 'src/wip.ts');
    writeFileSync(join(p.dir, 'notes.txt'), 'untracked\n');
    const headBefore = head(p);
    const r = runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    expect(r.status).toBe(0);
    expect(localPd(p)).toMatch(/^[0-9a-f]{40}$/);
    const after = snapshot(p);
    expect(after.head).toBe(headBefore);
    expect(after.symbolic).toBe('refs/heads/main');
    expect(after.status).toContain('A  src/wip.ts');
    expect(after.status).toContain('?? notes.txt');
    expect(pdTree(p)).not.toContain('src/wip.ts');
    expect(pdTree(p)).not.toContain('notes.txt');
    expect(git(p.dir, 'diff', '--cached', '--name-only')).toBe('src/wip.ts');
  });

  test('HEAD, main, the real index bytes and the working tree are unchanged by the commit step', () => {
    const p = mkProject();
    const before = snapshot(p);
    const r = runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    expect(r.status).toBe(0);
    const after = snapshot(p);
    expect(after.head).toBe(before.head);
    expect(after.main).toBe(before.main);
    expect(after.symbolic).toBe(before.symbolic);
    expect(after.index).toBe(before.index);
    // The only working-tree change is the scoreboard the run itself regenerates:
    expect(after.status).toBe('M data/scoreboard.json');
  });

  test('a second run builds on the first: parent = local pipeline-data; both reach origin', () => {
    const p = mkProject();
    expect(runPipeline(p, 'freshness').status).toBe(0);
    const first = localPd(p);
    expect(runPipeline(p, 'freshness').status).toBe(0);
    const second = localPd(p);
    expect(second).not.toBe(first);
    expect(git(p.dir, 'rev-parse', `${second}^`)).toBe(first);
    expect(remotePd(p)).toBe(second);
  });

  test('parent falls back to origin/pipeline-data when the local branch is missing', () => {
    const p = mkProject();
    expect(runPipeline(p, 'freshness').status).toBe(0);
    const first = localPd(p);
    git(p.dir, 'update-ref', '-d', 'refs/heads/pipeline-data');
    expect(runPipeline(p, 'freshness').status).toBe(0);
    expect(git(p.dir, 'rev-parse', `${localPd(p)}^`)).toBe(first);
    expect(remotePd(p)).toBe(localPd(p));
  });

  test('a symlinked artefact is never committed (it would read a file outside the repo)', () => {
    const p = mkProject();
    rmSync(join(p.dir, 'data/event-set-hashes.json'));
    symlinkSync('/etc/hostname', join(p.dir, 'data/event-set-hashes.json'));
    const r = runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    expect(r.status).toBe(0);
    expect(pdTree(p)).not.toContain('data/event-set-hashes.json');
    expect(r.log).toContain('[staging] could not stage data/event-set-hashes.json');
  });
});

describe('producing runs (freshness)', () => {
  test('AA_DEFER_PUBLISH=1: local gate + pipeline-data commit + marker; never fetches, pushes or deploys', () => {
    const p = mkProject();
    const before = remoteMain(p);
    const r = runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    expect(r.status).toBe(0);
    expect(r.calls).toContain('deploy-gate --local-only\n');  // local predicate only; publish runs the origin gate
    expect(r.calls).not.toContain('netlify');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('git fetch');
    expect(r.calls).not.toContain('ping-indexnow');            // nothing new is live yet
    expect(r.calls).not.toContain('gsc-submit-sitemaps');
    expect(remoteMain(p)).toBe(before);
    expect(remotePd(p)).toBe('');
    expect(head(p)).toBe(before);
    expect(cadence(p)).toBe('');
    const m = JSON.parse(readFileSync(marker(p), 'utf-8'));
    expect(m.headSha).toBe(head(p));
    expect(m.builtSha).toBe(head(p));                           // HEAD no longer moves after the build
    expect(m.pipelineDataSha).toBe(localPd(p));
    expect(git(p.dir, 'log', '-1', '--format=%s', m.pipelineDataSha)).toMatch(PD_MSG);
    expect(m.distHash).toBe(DIST_HASH);
    expect(m.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(r.log).toContain('[publish] DEFERRED');
  });

  test('AA_DEFER_PUBLISH=1 but the deploy gate refuses → no marker, no artifact commit, run fails', () => {
    const p = mkProject();
    const r = runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1', GATE_RC: '1' });
    expect(r.status).toBe(1);
    expect(existsSync(marker(p))).toBe(false);
    expect(localPd(p)).toBe('');
    expect(r.calls).not.toContain('netlify');
  });

  test('real gate: baseline run passes the origin gate (HEAD == origin/main) and ships', () => {
    const p = mkProject({ realGate: true });
    const r = runPipeline(p, 'freshness');
    expect(r.status).toBe(0);
    expect(r.log).toContain('deploy-gate: PASS');
    expect(r.calls).toContain('git fetch');
    expect(r.calls).toContain('netlify deploy');
    expect(remotePd(p)).toBe(localPd(p));
  });

  test('THE THREAT (real gate): an unreviewed local commit refuses push AND deploy, naming the commit', () => {
    const p = mkProject({ realGate: true });
    writeFileSync(join(p.dir, 'src/app.ts'), 'export const x = 2;\n');
    git(p.dir, 'commit', '-qam', 'local tweak');
    const bad = head(p).slice(0, 12);
    const before = remoteMain(p);
    const r = runPipeline(p, 'freshness');
    expect(r.status).toBe(1);
    expect(r.calls).toContain('git fetch');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('netlify deploy');
    expect(r.log).toContain('[origin-gate] REFUSED');
    expect(r.log).toContain(bad);
    expect(remoteMain(p)).toBe(before);
    expect(remotePd(p)).toBe('');
    expect(cadence(p)).toBe('');
  });

  test('real gate: a local commit that mimics the OLD pipeline artifact commit on main is refused too', () => {
    const p = mkProject({ realGate: true });
    writeFileSync(join(p.dir, 'data/scoreboard.json'), '{"x":1}\n');
    git(p.dir, 'commit', '-qam', 'chore: daily pipeline update 2026-09-23');
    const r = runPipeline(p, 'freshness');
    expect(r.status).toBe(1);
    expect(r.log).toContain('[origin-gate] REFUSED');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('netlify deploy');
  });
});

describe('publish mode', () => {
  test('refuses with exit 3 when no marker exists; gates, pushes and deploys nothing', () => {
    const p = mkProject();
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(3);
    expect(r.log).toContain('no deferred build waiting');
    expect(r.calls).not.toContain('deploy-gate');
    expect(r.calls).not.toContain('netlify');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('bun run build');
    expect(publishResultLines(r)).toEqual([]);
  });

  test('ships the deferred build: re-gates, pushes ONLY pipeline-data, deploys, records cadence, removes marker', () => {
    const p = mkProject();
    expect(runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' }).status).toBe(0);
    const m = JSON.parse(readFileSync(marker(p), 'utf-8'));
    const mainBefore = remoteMain(p);
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(0);
    // No producing work at all:
    for (const phase of ['ingest-emails', 'scrape-all', 'run build', 'auto-enrich', 'enrich-', 'backup-events-db']) {
      expect(r.calls).not.toContain(phase);
    }
    expect(r.calls).toContain('deploy-gate --allow-descendant\n');
    expect(r.calls).toContain('bun run scripts/check-published-artifacts.ts dist');
    expect(r.calls).toContain('push origin refs/heads/pipeline-data:refs/heads/pipeline-data');
    expect(r.calls).not.toMatch(/push origin main/);
    expect(r.calls).toContain('netlify deploy --prod --no-build --dir=dist');
    expect(r.calls).toContain('present .pipeline-publish.lock');   // its own lock
    expect(r.calls).toContain('netlify api getSiteDeploy');         // state=ready verification
    expect(remotePd(p)).toBe(m.pipelineDataSha);
    expect(remoteMain(p)).toBe(mainBefore);
    expect(cadence(p)).toContain('deploy-success');
    expect(existsSync(marker(p))).toBe(false);
    expect(existsSync(join(p.dir, '.pipeline-publish.lock'))).toBe(false);
    expect(r.calls).toContain('bun run scripts/ping-indexnow.ts');
    // Order: verification before any network side effect.
    const idx = (s: string) => r.calls.indexOf(s);
    expect(idx('deploy-gate')).toBeLessThan(idx('check-published-artifacts'));
    expect(idx('check-published-artifacts')).toBeLessThan(idx('git push'));
    expect(idx('git push')).toBeLessThan(idx('netlify deploy'));
  });

  test('prints exactly ONE stable PUBLISH-RESULT line on stdout after state=ready (host wrapper contract)', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(0);
    const lines = publishResultLines(r);
    expect(lines).toEqual([`PUBLISH-RESULT deploy_id=5f1e2d3c4b5a69788796a5b4 dist_hash=${DIST_HASH} state=ready`]);
    expect(lines[0]).toMatch(/^PUBLISH-RESULT deploy_id=[A-Za-z0-9]+ dist_hash=[0-9a-f]{64} state=ready$/);
    expect(r.log).not.toContain('PUBLISH-RESULT');
  });

  test('no PUBLISH-RESULT line when the deploy id is not a plain token (line-injection guard)', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const r = runPipeline(p, 'publish', { DEPLOY_ID_OUT: 'x y PUBLISH-RESULT deploy_id=evil' });
    expect(publishResultLines(r)).toEqual([]);
  });

  test('refuses when dist/ was rebuilt after the deferred run (marker ≠ stamp); marker kept', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const stampPath = join(p.dir, 'dist/.build-provenance');
    writeFileSync(stampPath, readFileSync(stampPath, 'utf-8').replace(DIST_HASH, 'cd'.repeat(32)));
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(1);
    expect(r.log).toContain('does not match dist/.build-provenance');
    expect(r.calls).not.toContain('netlify');
    expect(r.calls).not.toContain('git push');
    expect(existsSync(marker(p))).toBe(true);
  });

  test('refuses when the published-artifact gate fails; marker kept', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const r = runPipeline(p, 'publish', { ARTIFACT_RC: '1' });
    expect(r.status).toBe(1);
    expect(r.log).toContain('published-artifact gate failed');
    expect(r.calls).not.toContain('netlify');
    expect(r.calls).not.toContain('git push');
    expect(existsSync(marker(p))).toBe(true);
  });

  test('refuses when the deploy gate refuses; marker kept', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const r = runPipeline(p, 'publish', { GATE_RC: '1' });
    expect(r.status).toBe(1);
    expect(r.calls).not.toContain('netlify');
    expect(r.calls).not.toContain('check-published-artifacts');
    expect(r.calls).not.toContain('git push');
    expect(existsSync(marker(p))).toBe(true);
  });

  test('refuses (real gate) when unreviewed code was committed on top of the deferred build', () => {
    const p = mkProject({ realGate: true });
    expect(runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' }).status).toBe(0);
    writeFileSync(join(p.dir, 'data/other.json'), '{}\n');
    git(p.dir, 'add', 'data/other.json');
    git(p.dir, 'commit', '-q', '-m', 'chore: daily pipeline update 2026-09-23'); // pipeline-looking, data-only
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(1);
    expect(r.log).toContain('[origin-gate] REFUSED');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('netlify deploy');
    expect(existsSync(marker(p))).toBe(true);
  });

  test('TAMPER: pipeline-data rewritten after the deferred run to carry code → nothing pushed or deployed; marker kept', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const m = JSON.parse(readFileSync(marker(p), 'utf-8'));
    // Adds src/evil.ts on top of the pipeline-data tip and rewrites the marker to match.
    const env = { ...process.env, GIT_INDEX_FILE: join(tmp('aa-idx-'), 'index') };
    spawnSync(REAL_GIT, ['read-tree', m.pipelineDataSha], { cwd: p.dir, env });
    const blob = spawnSync('bash', ['-c', 'printf "export {}\\n" | git hash-object -w --stdin'], { cwd: p.dir, encoding: 'utf-8' }).stdout.trim();
    spawnSync(REAL_GIT, ['update-index', '--add', '--cacheinfo', `100644,${blob},src/evil.ts`], { cwd: p.dir, env });
    const tree = spawnSync(REAL_GIT, ['write-tree'], { cwd: p.dir, env, encoding: 'utf-8' }).stdout.trim();
    const bad = git(p.dir, 'commit-tree', tree, '-p', m.pipelineDataSha, '-m', 'chore: daily pipeline update 2026-09-23');
    git(p.dir, 'update-ref', 'refs/heads/pipeline-data', bad);
    writeFileSync(marker(p), JSON.stringify({ ...m, pipelineDataSha: bad }) + '\n');
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(1);
    expect(r.log).toContain('[push-gate] REFUSED');
    expect(r.log).toContain('src/evil.ts');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('netlify deploy');
    expect(remotePd(p)).toBe('');
    expect(existsSync(marker(p))).toBe(true);
  });

  test('a marker with a malformed pipelineDataSha → refused before any gate', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const m = JSON.parse(readFileSync(marker(p), 'utf-8'));
    writeFileSync(marker(p), JSON.stringify({ ...m, pipelineDataSha: 'refs/heads/main' }) + '\n');
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(1);
    expect(r.calls).not.toContain('deploy-gate');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('netlify');
  });

  test('AA_DEFER_PUBLISH is ignored in publish mode (it never defers itself)', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const r = runPipeline(p, 'publish', { AA_DEFER_PUBLISH: '1' });
    expect(r.status).toBe(0);
    expect(r.calls).toContain('netlify deploy');
    expect(r.calls).not.toContain('--local-only');
  });
});

describe('run_deploy seams', () => {
  const body = SCRIPT.slice(SCRIPT.indexOf('\nrun_deploy() {'), SCRIPT.indexOf('\n}\n', SCRIPT.indexOf('\nrun_deploy() {')));

  test('the origin gate moved into deploy-gate.sh: no local-commit exception remains in the pipeline', () => {
    expect(SCRIPT).not.toContain('verify_origin_ancestry');
    expect(SCRIPT).not.toContain('# origin-gate:begin');
    expect(readFileSync(REAL_GATE, 'utf-8')).toContain('# origin-gate:begin');
  });

  test('--local-only is passed ONLY on the deferred (non-deploying) path; publish passes --allow-descendant', () => {
    expect(body.match(/--local-only/g)?.length).toBe(1);
    const local = body.indexOf('--local-only');
    expect(body.slice(Math.max(0, local - 400), local)).toContain('AA_DEFER_PUBLISH');
    expect(body).toContain('gate_args=(--allow-descendant)');
  });

  test('deferral returns after the artifact commit and before the push gate and the deploy', () => {
    const commit = body.indexOf('commit_pipeline_data');
    const defer = body.indexOf('write_publish_marker');
    const push = body.indexOf('# push-gate:begin');
    const deploy = body.indexOf('netlify deploy --prod');
    expect(commit).toBeGreaterThan(-1);
    expect(defer).toBeGreaterThan(commit);
    expect(push).toBeGreaterThan(defer);
    expect(deploy).toBeGreaterThan(push);
    expect(body.slice(defer, push)).toContain('return 0');
  });

  test('mode list accepts publish and it gets a per-mode lock', () => {
    expect(SCRIPT).toContain('full|freshness|enrichment|publish) PIPELINE_MODE="$arg"');
    expect(SCRIPT).toContain('LOCK_FILE="$PROJECT_DIR/.pipeline-${PIPELINE_MODE}.lock"');
  });

  test('header documents that main needs no ruleset bypass for the pipeline token', () => {
    const header = SCRIPT.slice(0, SCRIPT.indexOf('set -o pipefail'));
    expect(header).toContain('pipeline-data');
    expect(header).toMatch(/main needs no bypass/i);
  });
});

// ---------------------------------------------------------------------------
// scripts/check-published-artifacts.ts — standalone artifact gate
// ---------------------------------------------------------------------------

describe('check-published-artifacts CLI', () => {
  const cli = join(ROOT, 'scripts/check-published-artifacts.ts');
  const run = (dist: string) => spawnSync('bun', ['run', cli, dist], { encoding: 'utf-8' });

  test('clean dist → exit 0', () => {
    const d = tmp('aa-artifacts-');
    writeFileSync(join(d, 'index.html'), '<html><body><p>Concert tonight</p></body></html>');
    const r = run(d);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PASS — 1 pages');
  });

  test('a page with pipeline artefacts → exit 1 naming the page', () => {
    const d = tmp('aa-artifacts-');
    mkdirSync(join(d, 'events'));
    writeFileSync(join(d, 'events/x.html'), '<html><body><p>[PLACEHOLDER] text</p></body></html>');
    const r = run(d);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('events/x.html');
  });

  test('missing dist → exit 2', () => {
    expect(run(join(tmp('aa-artifacts-'), 'nope')).status).toBe(2);
  });
});
