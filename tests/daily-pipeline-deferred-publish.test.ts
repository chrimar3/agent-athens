/**
 * scripts/daily-automated.sh — deferred publish, `publish` mode and the
 * origin gate.
 *
 * Deferred publish (AA_DEFER_PUBLISH=1): a producing run (freshness/full)
 * runs the deploy gate and the allowlisted artifact commit exactly as before,
 * then STOPS before anything that needs the GitHub or Netlify credentials and
 * leaves .pipeline-publish-ready. `publish` mode ships that build: it runs no
 * ingest/scrape/enrich/generate, re-verifies (marker vs stamp, deploy gate
 * with --allow-descendant, published-artifact gate), then goes through the
 * origin gate, push gate, Netlify deploy + state=ready check and cadence
 * record, and removes the marker.
 *
 * Origin gate: every commit in origin/main..HEAD must be a pipeline artifact
 * commit (single parent, the pipeline's message, this checkout's identity,
 * PIPELINE_ALLOWLIST paths only), else no push and no deploy.
 *
 * Whole-script tests run a copy of the real script in a throwaway repo with a
 * bare "origin". The only textual change is the hard-coded launchd PATH line
 * (it would put /usr/bin ahead of the stubs). bun, netlify, the sqlite CLI,
 * gh and sleep are stubs; git is the real binary behind a wrapper that
 * records push/fetch. deploy-gate.sh is stubbed here (it has its own suite in
 * scripts/__tests__/deploy-gate.test.ts). Nothing touches data/events.db.
 */
import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..');
const SCRIPT_PATH = join(ROOT, 'scripts', 'daily-automated.sh');
const SCRIPT = readFileSync(SCRIPT_PATH, 'utf-8');
const PATH_LINE = /^export PATH="\/Users\/chrism\/[^\n]*\n/m;
const REAL_GIT = spawnSync('which', ['git'], { encoding: 'utf-8' }).stdout.trim();
const REAL_SLEEP = spawnSync('which', ['sleep'], { encoding: 'utf-8' }).stdout.trim();
const DIST_HASH = 'ab'.repeat(32);

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

function exe(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

interface Project { dir: string; remote: string; calls: string }

function mkProject(): Project {
  const dir = tmp('aa-publish-');
  const remote = tmp('aa-publish-origin-');
  const calls = join(dir, 'calls.log');
  for (const d of ['scripts', 'data', 'fake-bin', '.netlify', 'src']) mkdirSync(join(dir, d));

  const patched = SCRIPT.replace(PATH_LINE, 'export PATH="$PATH"\n');
  if (patched === SCRIPT) throw new Error('launchd PATH line not found — harness contract broken');
  exe(join(dir, 'scripts/daily-automated.sh'), patched);
  exe(join(dir, 'scripts/deploy-gate.sh'), '#!/bin/bash\necho "deploy-gate $*" >> "$TEST_CALLS"\nexit "${GATE_RC:-0}"\n');
  exe(join(dir, 'scripts/assert-events-db-healthy.sh'), '#!/bin/bash\nexit 0\n');
  exe(join(dir, 'scripts/backup-events-db.sh'), '#!/bin/bash\nexit 0\n');
  writeFileSync(join(dir, 'package.json'), '{}\n');
  writeFileSync(join(dir, '.gitignore'), 'dist/\nlogs/\n.netlify/\nfake-bin/\ncalls.log\n.pipeline-*\n');
  for (const f of ['event-set-hashes.json', 'build-completeness.json', 'scoreboard.json']) {
    writeFileSync(join(dir, 'data', f), '{}\n');
  }
  writeFileSync(join(dir, 'src/app.ts'), 'export const x = 1;\n');
  writeFileSync(join(dir, '.netlify/state.json'), '{"siteId":"site-1"}\n');

  const bin = join(dir, 'fake-bin');
  exe(join(bin, 'bun'), `#!/bin/bash
echo "bun $*" >> "$TEST_CALLS"
if [[ "$1 $2" == "run build" ]]; then
  mkdir -p dist && echo "<p>page</p>" > dist/index.html
  printf 'sha=%s\\nsourceDirty=0\\ndistHash=%s\\nbuiltAt=x\\n' "$(git rev-parse HEAD)" "${DIST_HASH}" > dist/.build-provenance
fi
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
  deploy) ls -a | grep '^\\.pipeline-' | sed 's/^/present /' >> "$TEST_CALLS"; echo '{"deploy_id":"dep-1"}' ;;
  api) if [[ "$2" == getSiteDeploy ]]; then echo '{"state":"ready"}'; else echo '[]'; fi ;;
esac
exit 0
`);
  exe(join(bin, 'git'), `#!/bin/bash
for a in "$@"; do case "$a" in push|fetch) echo "git $a" >> "$TEST_CALLS" ;; esac; done
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

interface Run { status: number | null; calls: string; log: string; stderr: string }

function runPipeline(p: Project, mode: string, env: Record<string, string> = {}): Run {
  writeFileSync(p.calls, '');
  const base: Record<string, string> = { ...(process.env as Record<string, string>) };
  delete base.AA_DEFER_PUBLISH;
  const r = spawnSync('bash', [join(p.dir, 'scripts/daily-automated.sh'), mode], {
    cwd: p.dir,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...base, PATH: `${join(p.dir, 'fake-bin')}:${process.env.PATH}`, TEST_CALLS: p.calls, AA_CAFFEINATED: '1', ...env },
  });
  const logDir = join(p.dir, 'logs');
  const log = existsSync(logDir)
    ? readdirSync(logDir).filter(f => f.startsWith('pipeline-')).map(f => readFileSync(join(logDir, f), 'utf-8')).join('\n')
    : '';
  return { status: r.status, calls: readFileSync(p.calls, 'utf-8'), log, stderr: r.stderr };
}

const marker = (p: Project) => join(p.dir, '.pipeline-publish-ready');
const remoteMain = (p: Project) => git(p.remote, 'rev-parse', 'refs/heads/main');
const head = (p: Project) => git(p.dir, 'rev-parse', 'HEAD');
const cadence = (p: Project) => {
  const f = join(p.dir, 'logs/deploy-cadence.log');
  return existsSync(f) ? readFileSync(f, 'utf-8') : '';
};

describe('producing runs (freshness)', () => {
  test('baseline, no AA_DEFER_PUBLISH: commit → origin gate → push → deploy, no marker', () => {
    const p = mkProject();
    const r = runPipeline(p, 'freshness');
    expect(r.status).toBe(0);
    expect(git(p.dir, 'log', '-1', '--format=%s')).toMatch(/^chore: daily pipeline update \d{4}-\d{2}-\d{2}$/);
    expect(r.calls).toContain('deploy-gate \n');
    expect(r.calls).toContain('git fetch');
    expect(r.calls).toContain('git push');
    expect(r.calls).toContain('netlify deploy --prod --no-build --dir=dist');
    expect(r.log).toContain('[origin-gate] PASS — 1 local commit(s)');
    expect(remoteMain(p)).toBe(head(p));
    expect(cadence(p)).toContain('deploy-success');
    expect(existsSync(marker(p))).toBe(false);
    expect(r.calls).toContain('bun run scripts/ping-indexnow.ts');
  });

  test('AA_DEFER_PUBLISH=1: gate + artifact commit + marker; never fetches, pushes or deploys', () => {
    const p = mkProject();
    const before = remoteMain(p);
    const r = runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    expect(r.status).toBe(0);
    expect(r.calls).toContain('deploy-gate \n');              // gate ran, default predicate
    expect(r.calls).not.toContain('netlify');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('git fetch');
    expect(r.calls).not.toContain('ping-indexnow');            // nothing new is live yet
    expect(r.calls).not.toContain('gsc-submit-sitemaps');
    expect(git(p.dir, 'log', '-1', '--format=%s')).toMatch(/^chore: daily pipeline update /);
    expect(remoteMain(p)).toBe(before);
    expect(cadence(p)).toBe('');
    const m = JSON.parse(readFileSync(marker(p), 'utf-8'));
    expect(m.headSha).toBe(head(p));
    expect(m.builtSha).toBe(git(p.dir, 'rev-parse', 'HEAD~1'));
    expect(m.distHash).toBe(DIST_HASH);
    expect(m.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(r.log).toContain('[publish] DEFERRED');
  });

  test('AA_DEFER_PUBLISH=1 but the deploy gate refuses → no marker, run fails', () => {
    const p = mkProject();
    const r = runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1', GATE_RC: '1' });
    expect(r.status).toBe(1);
    expect(existsSync(marker(p))).toBe(false);
    expect(r.calls).not.toContain('netlify');
  });

  test('THE THREAT: an unreviewed local commit refuses push AND deploy, naming the commit', () => {
    const p = mkProject();
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
    expect(r.log).toContain('touches src/app.ts');
    expect(remoteMain(p)).toBe(before);
    expect(cadence(p)).toBe('');
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
  });

  test('ships the deferred build: re-gates, pushes, deploys, records cadence, removes marker', () => {
    const p = mkProject();
    expect(runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' }).status).toBe(0);
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(0);
    // No producing work at all:
    for (const phase of ['ingest-emails', 'scrape-all', 'run build', 'auto-enrich', 'enrich-', 'backup-events-db']) {
      expect(r.calls).not.toContain(phase);
    }
    expect(r.calls).toContain('deploy-gate --allow-descendant');
    expect(r.calls).toContain('bun run scripts/check-published-artifacts.ts dist');
    expect(r.calls).toContain('git fetch');
    expect(r.calls).toContain('git push');
    expect(r.calls).toContain('netlify deploy --prod --no-build --dir=dist');
    expect(r.calls).toContain('present .pipeline-publish.lock');   // its own lock
    expect(r.calls).toContain('netlify api getSiteDeploy');         // state=ready verification
    expect(remoteMain(p)).toBe(head(p));
    expect(cadence(p)).toContain('deploy-success');
    expect(existsSync(marker(p))).toBe(false);
    expect(existsSync(join(p.dir, '.pipeline-publish.lock'))).toBe(false);
    expect(r.calls).toContain('bun run scripts/ping-indexnow.ts');
    // Order: verification before any network side effect.
    const idx = (s: string) => r.calls.indexOf(s);
    expect(idx('deploy-gate')).toBeLessThan(idx('git fetch'));
    expect(idx('check-published-artifacts')).toBeLessThan(idx('git fetch'));
    expect(idx('git fetch')).toBeLessThan(idx('git push'));
    expect(idx('git push')).toBeLessThan(idx('netlify deploy'));
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
    expect(existsSync(marker(p))).toBe(true);
  });

  test('refuses when unreviewed code was committed on top of the deferred build', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    writeFileSync(join(p.dir, 'src/evil.ts'), 'export {};\n');
    git(p.dir, 'add', 'src/evil.ts');
    git(p.dir, 'commit', '-q', '-m', 'chore: daily pipeline update 2026-09-23'); // pipeline-looking message
    const r = runPipeline(p, 'publish');
    expect(r.status).toBe(1);
    expect(r.log).toContain('touches src/evil.ts');
    expect(r.calls).not.toContain('git push');
    expect(r.calls).not.toContain('netlify deploy');
    expect(existsSync(marker(p))).toBe(true);
  });

  test('AA_DEFER_PUBLISH is ignored in publish mode (it never defers itself)', () => {
    const p = mkProject();
    runPipeline(p, 'freshness', { AA_DEFER_PUBLISH: '1' });
    const r = runPipeline(p, 'publish', { AA_DEFER_PUBLISH: '1' });
    expect(r.status).toBe(0);
    expect(r.calls).toContain('netlify deploy');
  });
});

// ---------------------------------------------------------------------------
// Origin gate — the REAL block, extracted between its markers and executed.
// ---------------------------------------------------------------------------

function block(begin: string, end: string): string {
  const a = SCRIPT.indexOf(begin);
  const b = SCRIPT.indexOf(end);
  if (a === -1 || b === -1 || b <= a) throw new Error(`markers missing: ${begin} … ${end}`);
  if (SCRIPT.indexOf(begin, a + 1) !== -1 || SCRIPT.indexOf(end, b + 1) !== -1) throw new Error(`duplicate markers: ${begin}`);
  return SCRIPT.slice(SCRIPT.indexOf('\n', a) + 1, b);
}

const ALLOW = ['data/a.json', 'data/b.json'];

function mkGateRepo(): { dir: string; remote: string } {
  const dir = tmp('aa-origin-gate-');
  const remote = tmp('aa-origin-gate-remote-');
  git(remote, 'init', '-q', '--bare');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'pipeline@test');
  git(dir, 'config', 'user.name', 'pipeline');
  git(dir, 'config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'data'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'data/a.json'), '{}\n');
  writeFileSync(join(dir, 'data/b.json'), '{}\n');
  writeFileSync(join(dir, 'src/app.ts'), 'export const x = 1;\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'baseline');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  return { dir, remote };
}

function commitFile(dir: string, path: string, msg = 'chore: daily pipeline update 2026-09-23', extra: string[] = []): string {
  writeFileSync(join(dir, path), `${Math.random()}\n`);
  git(dir, 'add', path);
  git(dir, ...extra, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
}

function runOriginGate(dir: string, opts: { fakeGit?: string; timeout?: number } = {}) {
  const bin = join(dir, '.bin');
  mkdirSync(bin, { recursive: true });
  exe(join(bin, 'sleep'), `#!/bin/bash\nexec "${REAL_SLEEP}" 0.05\n`);
  exe(join(bin, 'gh'), '#!/bin/bash\nexit 99\n');
  if (opts.fakeGit) exe(join(bin, 'git'), `#!/bin/bash\n${opts.fakeGit}\nexec "${REAL_GIT}" "$@"\n`);
  const harness = [
    `export PATH="${bin}:$PATH"`,
    'PRODUCTION_BRANCH="main"',
    `LOG_FILE="${join(dir, '.gate.log')}"`,
    `FETCH_TIMEOUT=${opts.timeout ?? 30}`,
    'log(){ echo "LOG $1"; }',
    'log_error(){ echo "ERR $1" >&2; }',
    `PIPELINE_ALLOWLIST=(${ALLOW.map(a => `"${a}"`).join(' ')})`,
    block('# awake-bounded:begin', '# awake-bounded:end'),
    'og(){',
    block('# origin-gate:begin', '# origin-gate:end'),
    '}',
    'og; echo "rc=$?"',
  ].join('\n');
  const t0 = Date.now();
  const r = spawnSync('bash', ['-c', harness], { cwd: dir, encoding: 'utf-8', timeout: 20_000 });
  return { rc: (r.stdout.match(/rc=(\d+)/) ?? [])[1], out: r.stdout, err: r.stderr, ms: Date.now() - t0 };
}

describe('origin gate (extracted block, real git, bare origin)', () => {
  test('nothing ahead of origin/main → pass', () => {
    const { dir } = mkGateRepo();
    const r = runOriginGate(dir);
    expect(r.rc).toBe('0');
    expect(r.out).toContain('PASS — 0 local commit(s)');
  });

  test('pipeline artifact commits only → pass', () => {
    const { dir } = mkGateRepo();
    commitFile(dir, 'data/a.json');
    commitFile(dir, 'data/b.json');
    const r = runOriginGate(dir);
    expect(r.rc).toBe('0');
    expect(r.out).toContain('PASS — 2 local commit(s)');
  });

  test('a commit touching a non-allowlisted path (pipeline message) → refuse, naming commit and path', () => {
    const { dir } = mkGateRepo();
    commitFile(dir, 'data/a.json');
    const bad = commitFile(dir, 'src/app.ts');
    commitFile(dir, 'data/b.json');
    const r = runOriginGate(dir);
    expect(r.rc).toBe('1');
    expect(r.err).toContain('[origin-gate] REFUSED');
    expect(r.err).toContain(bad.slice(0, 12));
    expect(r.err).toContain('touches src/app.ts');
  });

  test('allowlisted path + extra path in the same commit → refuse', () => {
    const { dir } = mkGateRepo();
    writeFileSync(join(dir, 'data/a.json'), '1\n');
    writeFileSync(join(dir, 'data/other.json'), '1\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'chore: daily pipeline update 2026-09-23');
    const r = runOriginGate(dir);
    expect(r.rc).toBe('1');
    expect(r.err).toContain('touches data/other.json');
  });

  test('allowlisted path but a different message → refuse', () => {
    const { dir } = mkGateRepo();
    commitFile(dir, 'data/a.json', 'update data');
    const r = runOriginGate(dir);
    expect(r.rc).toBe('1');
    expect(r.err).toContain("message is not the pipeline's");
  });

  test('pipeline message with a trailing body line → refuse', () => {
    const { dir } = mkGateRepo();
    commitFile(dir, 'data/a.json', 'chore: daily pipeline update 2026-09-23\n\nsneaky body');
    expect(runOriginGate(dir).rc).toBe('1');
  });

  test('allowlisted path + pipeline message but another author → refuse', () => {
    const { dir } = mkGateRepo();
    commitFile(dir, 'data/a.json', undefined, ['-c', 'user.email=someone@else']);
    const r = runOriginGate(dir);
    expect(r.rc).toBe('1');
    expect(r.err).toContain('author <someone@else>');
  });

  test('a merge commit → refuse', () => {
    const { dir } = mkGateRepo();
    git(dir, 'checkout', '-q', '-b', 'side');
    commitFile(dir, 'data/b.json');
    git(dir, 'checkout', '-q', 'main');
    commitFile(dir, 'data/a.json');
    git(dir, 'merge', '-q', '--no-edit', '-m', 'chore: daily pipeline update 2026-09-23', 'side');
    const r = runOriginGate(dir);
    expect(r.rc).toBe('1');
    expect(r.err).toContain('not a single-parent commit');
  });

  test('uses the FETCHED remote tip: code merged upstream is reviewed even if the local tracking ref is stale', () => {
    const { dir } = mkGateRepo();
    const stale = git(dir, 'rev-parse', 'HEAD');
    commitFile(dir, 'src/app.ts', 'feat: reviewed change');
    git(dir, 'push', '-q', 'origin', 'main');                          // merged upstream
    git(dir, 'update-ref', 'refs/remotes/origin/main', stale);        // tracking ref left behind
    commitFile(dir, 'data/a.json');
    const r = runOriginGate(dir);
    expect(r.rc).toBe('0');
  });

  test('fetch failure → refuse (fail closed)', () => {
    const { dir, remote } = mkGateRepo();
    rmSync(remote, { recursive: true, force: true });
    const r = runOriginGate(dir);
    expect(r.rc).toBe('1');
    expect(r.err).toContain('fetching origin/main failed');
  });

  test('hung fetch is killed by the awake-time bound → refuse', () => {
    const { dir } = mkGateRepo();
    const r = runOriginGate(dir, {
      timeout: 30,
      fakeGit: `for a in "$@"; do [[ "$a" == fetch ]] && exec python3 -c 'import signal, time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(30)'; done`,
    });
    expect(r.rc).toBe('1');
    expect(r.err).toContain('timed out after 30s');
    expect(r.ms).toBeLessThan(5_000);
  });

  test('fetch is non-interactive and bounded (seam tokens)', () => {
    const og = block('# origin-gate:begin', '# origin-gate:end');
    expect(og).toContain('GIT_TERMINAL_PROMPT=0');
    expect(og).toContain('run_awake_bounded');
  });
});

describe('run_deploy seams', () => {
  const body = SCRIPT.slice(SCRIPT.indexOf('\nrun_deploy() {'), SCRIPT.indexOf('\n}\n', SCRIPT.indexOf('\nrun_deploy() {')));

  test('origin gate sits after the artifact commit and before the push and the Netlify deploy', () => {
    const commit = body.indexOf('chore: daily pipeline update');
    const og = body.indexOf('verify_origin_ancestry');
    const push = body.indexOf('# push-gate:begin');
    const deploy = body.indexOf('netlify deploy --prod');
    expect(commit).toBeGreaterThan(-1);
    expect(og).toBeGreaterThan(commit);
    expect(push).toBeGreaterThan(og);
    expect(deploy).toBeGreaterThan(push);
  });

  test('deferral returns before the origin gate, the push and the deploy', () => {
    const defer = body.indexOf('AA_DEFER_PUBLISH');
    expect(defer).toBeGreaterThan(-1);
    expect(defer).toBeLessThan(body.indexOf('verify_origin_ancestry'));
    expect(body.slice(defer, body.indexOf('verify_origin_ancestry'))).toContain('return 0');
  });

  test('mode list accepts publish and it gets a per-mode lock', () => {
    expect(SCRIPT).toContain('full|freshness|enrichment|publish) PIPELINE_MODE="$arg"');
    expect(SCRIPT).toContain('LOCK_FILE="$PROJECT_DIR/.pipeline-${PIPELINE_MODE}.lock"');
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
