/**
 * scripts/daily-automated.sh — pipeline lock acquisition (liveness before age).
 *
 * The lock block used to test AGE FIRST: a lock older than LOCK_MAX_AGE (7 h)
 * was force-removed before anyone asked whether its owner was still alive. On
 * this laptop that is a real loss, not a theoretical one — the machine idle-
 * sleeps, so a legitimately running pipeline can be SUSPENDED past 7 h of wall
 * clock while its process is very much alive (same sleep-vs-wall-clock class as
 * the deploy watchdog, see tests/daily-pipeline-sleep-safety.test.ts). The next
 * invocation would steal the lock and run a second pipeline concurrently.
 *
 * The block is extracted VERBATIM from the script text (between `# lock:begin`
 * and `# lock:end`) and executed under bash in a throwaway directory with
 * LOCK_FILE pointing at a temp file — never the project directory, never
 * data/events.db.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, utimesSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync, spawn } from 'child_process';

const ROOT = join(import.meta.dir, '..');
const SCRIPT_PATH = join(ROOT, 'scripts', 'daily-automated.sh');
const daily = readFileSync(SCRIPT_PATH, 'utf-8');

const BEGIN = '# lock:begin';
const END = '# lock:end';

/** Sentinel exit code for "the block fell through" (i.e. it did NOT exit itself). */
const FELL_THROUGH = 7;

function extractLockBlock(): string {
  const start = daily.indexOf(BEGIN);
  const end = daily.indexOf(END);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  // Skip the rest of the marker line: it carries a comment, and slicing past
  // the `#` alone would hand bash the comment text as a command.
  const bodyStart = daily.indexOf('\n', start) + 1;
  expect(bodyStart).toBeGreaterThan(0);
  expect(bodyStart).toBeLessThan(end);
  return daily.slice(bodyStart, end);
}

interface Run { status: number | null; stderr: string; log: string; lockExists: boolean }

/**
 * Run the lock block with LOCK_FILE seeded to `pidContent` and its mtime aged
 * `ageSeconds` into the past. log/log_error are stubbed to a file so the test
 * can read what the pipeline would have logged.
 */
function runLockBlock(dir: string, pidContent: string, ageSeconds: number, env: Record<string, string> = {}): Run {
  const lockFile = join(dir, '.pipeline-full.lock');
  const logFile = join(dir, 'pipeline.log');
  writeFileSync(lockFile, pidContent);
  const when = Math.floor(Date.now() / 1000) - ageSeconds;
  utimesSync(lockFile, when, when);

  const harness = [
    'set -u',
    `PROJECT_DIR=${JSON.stringify(dir)}`,
    'PIPELINE_MODE=full',
    `LOG_FILE=${JSON.stringify(logFile)}`,
    `LOCK_FILE=${JSON.stringify(lockFile)}`,
    'LOCK_MAX_AGE=25200',
    'log() { echo "[LOG] $*" >> "$LOG_FILE"; }',
    'log_error() { echo "[ERROR] $*" >> "$LOG_FILE"; }',
    extractLockBlock(),
    `exit ${FELL_THROUGH}`,
  ].join('\n');

  const r = spawnSync('bash', ['-c', harness], { cwd: dir, encoding: 'utf-8', env: { ...process.env, ...env } });
  return {
    status: r.status,
    stderr: r.stderr,
    log: existsSync(logFile) ? readFileSync(logFile, 'utf-8') : '',
    lockExists: existsSync(lockFile),
  };
}

describe('daily-automated.sh lock block — liveness beats age', () => {
  let tmp: string;
  let caseNo = 0;
  const children: number[] = [];
  /**
   * A live process whose command line is this pipeline: production is
   * `/bin/bash /Users/…/scripts/daily-automated.sh full` (launchd) or the same
   * under caffeinate, so the block recognises its owner by `ps -o command=`.
   */
  const spawnFakePipeline = (dir: string): number => {
    const script = join(dir, 'daily-automated.sh');
    writeFileSync(script, 'sleep 300\n');
    const child = spawn('bash', [script], { detached: true, stdio: 'ignore' });
    child.unref();
    children.push(child.pid!);
    return child.pid!;
  };
  /** A live process that is NOT the pipeline — what a recycled PID number looks like. */
  const spawnStranger = (): number => {
    const child = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' });
    child.unref();
    children.push(child.pid!);
    return child.pid!;
  };
  const caseDir = () => { const d = join(tmp, `c${++caseNo}`); mkdirSync(d); return d; };

  beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), 'daily-lock-')); });
  afterAll(() => {
    // detached: each child leads its own process group, so -pid reaps the
    // fake pipeline's `sleep` grandchild too (a bare pid kill orphaned it).
    for (const pid of children) { try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ } }
    rmSync(tmp, { recursive: true, force: true });
  });

  test('fixture precondition: the age used is genuinely older than LOCK_MAX_AGE', () => {
    // 8 h > the script's 7 h. If LOCK_MAX_AGE ever grows past 8 h these tests
    // stop exercising the stale path — fail loudly rather than pass vacuously.
    expect(daily).toContain('LOCK_MAX_AGE=25200');
    expect(8 * 3600).toBeGreaterThan(25200);
  });

  test('a LIVE owner keeps its lock even when the lock is older than LOCK_MAX_AGE', () => {
    const dir = caseDir();
    const pid = spawnFakePipeline(dir);
    expect(spawnSync('kill', ['-0', String(pid)]).status).toBe(0); // fixture precondition: alive
    const r = runLockBlock(dir, `${pid}\n`, 8 * 3600);
    expect(r.status).toBe(0);              // exited cleanly, did not fall through
    expect(r.log).toContain('already running');
    expect(r.log).toContain(`PID=${pid}`);
    expect(r.lockExists).toBe(true);       // the suspended run still owns it
    expect(r.stderr).toBe('');
  });

  test('a DEAD owner loses its lock (old mtime)', () => {
    const dir = caseDir();
    // A PID that does not exist: allocate one, reap it, then confirm it is gone.
    const dead = spawnSync('bash', ['-c', 'echo $$'], { encoding: 'utf-8' }).stdout.trim();
    expect(dead).toMatch(/^\d+$/);
    expect(spawnSync('kill', ['-0', dead]).status).not.toBe(0);
    const r = runLockBlock(dir, `${dead}\n`, 8 * 3600);
    expect(r.status).toBe(FELL_THROUGH);   // proceeds to acquire the lock
    expect(r.log).toContain('Dead');
    expect(r.lockExists).toBe(false);
  });

  test('a lock with NO readable PID and a FRESH mtime is left alone', () => {
    // Nothing to ask kill -0 about, and the lock is young: assume a live run
    // that has not written its PID yet rather than stealing the lock.
    const r = runLockBlock(caseDir(), '', 60);
    expect(r.status).toBe(0);
    expect(r.lockExists).toBe(true);
  });

  test('a LIVE owner is kept even at 49 h (a suspended run over a weekend is still the owner — age is not identity)', () => {
    const dir = caseDir();
    const pid = spawnFakePipeline(dir);
    const r = runLockBlock(dir, `${pid}\n`, 49 * 3600);
    expect(r.status).toBe(0);
    expect(r.lockExists).toBe(true);
  });

  test('a LIVE PID that is NOT this pipeline (a recycled PID number) loses the lock', () => {
    const dir = caseDir();
    const pid = spawnStranger();
    expect(spawnSync('kill', ['-0', String(pid)]).status).toBe(0); // alive
    const r = runLockBlock(dir, `${pid}\n`, 60);                 // and fresh: only identity can decide
    expect(r.status).toBe(FELL_THROUGH);
    expect(r.log).toContain('recycled');
    expect(r.lockExists).toBe(false);
  });

  test('the age read is portable: works with a GNU-style stat that has no -f (the ci check runs this block on ubuntu)', () => {
    // A stat shim that rejects BSD `-f` and answers only GNU `-c%Y`.
    const dir = caseDir();
    const shim = join(dir, 'bin');
    mkdirSync(shim);
    writeFileSync(join(shim, 'stat'), [
      '#!/bin/bash',
      'if [ "$1" = "-c%Y" ]; then perl -e \'print((stat($ARGV[0]))[9])\' "$2"; exit 0; fi',
      'echo "stat: illegal option" >&2; exit 1',
    ].join('\n'));
    chmodSync(join(shim, 'stat'), 0o755);
    const env = { PATH: `${shim}:${process.env.PATH}` };
    mkdirSync(join(dir, 's')); mkdirSync(join(dir, 'f'));
    const stale = runLockBlock(join(dir, 's'), '', 8 * 3600, env);
    expect(stale.stderr).toBe('');
    expect(stale.status).toBe(FELL_THROUGH);
    expect(stale.log).toContain('Stale');
    const fresh = runLockBlock(join(dir, 'f'), '', 60, env);
    expect(fresh.stderr).toBe('');
    expect(fresh.status).toBe(0);
  });

  test('nothing between the LOCK_FILE assignment and the pinned block pre-empts it (the pre-fix age-first removal cannot hide above the marker)', () => {
    const assign = daily.indexOf('LOCK_FILE="$PROJECT_DIR/.pipeline-');
    const begin = daily.indexOf(BEGIN);
    expect(assign).toBeGreaterThan(-1);
    expect(begin).toBeGreaterThan(assign);
    expect(daily.slice(assign, begin)).not.toMatch(/rm -f|LOCK_AGE|stat /);
    // And every removal of the lock lives inside the pinned block or the EXIT trap.
    const block = extractLockBlock();
    const inBlock = (block.match(/rm -f "\$LOCK_FILE"/g) ?? []).length;
    const inFile = (daily.match(/rm -f "\$LOCK_FILE"/g) ?? []).length;
    expect(inBlock).toBeGreaterThan(0);
    expect(inFile).toBe(inBlock + 1); // + the `trap 'rm -f "$LOCK_FILE"' EXIT`
  });

  test('a lock with NO readable PID and a STALE mtime is removed', () => {
    const r = runLockBlock(caseDir(), '', 8 * 3600);
    expect(r.status).toBe(FELL_THROUGH);
    expect(r.log).toContain('Stale');
    expect(r.lockExists).toBe(false);
  });
});
