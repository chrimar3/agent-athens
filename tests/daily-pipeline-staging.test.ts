/**
 * scripts/daily-automated.sh — run_deploy staging (GitHub issue #5).
 *
 * `git add -- a b missing` is fatal (exit 128, "pathspec did not match") and
 * stages NOTHING, so one absent allowlist entry silently dropped every
 * artefact from that day's commit. The fix stages per path and logs each
 * failure. The staging block is extracted VERBATIM from the script text
 * (between `# staging:begin` / `# staging:end`) and executed under bash in a
 * throwaway git repo — never the project repo, never data/events.db.
 *
 * Security loop round 3: the artifact commit moved to refs/heads/pipeline-data
 * and is built with git plumbing, so the block now stages into a TEMPORARY
 * index ($pd_index via GIT_INDEX_FILE) with hash-object + update-index. These
 * tests were adapted deliberately: they read the temporary index, and they
 * also pin that the REAL index is never touched.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '..');
const SCRIPT_PATH = join(ROOT, 'scripts', 'daily-automated.sh');
const daily = readFileSync(SCRIPT_PATH, 'utf-8');

const BEGIN = '# staging:begin';
const END = '# staging:end';
const OLD_SINGLE_CALL = 'git add -- "${PIPELINE_ALLOWLIST[@]}"';

function extractStagingBlock(): string {
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

/** Fresh git repo with ONE committed file that has an unstaged modification. */
function makeRepo(dir: string): void {
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'tracked.json'), '{"v":1}\n');
  git('add', '--', 'tracked.json');
  git('commit', '-q', '-m', 'seed');
  writeFileSync(join(dir, 'tracked.json'), '{"v":2}\n');
}

/**
 * Run `body` as run_deploy would see it: PIPELINE_ALLOWLIST holds one path that
 * exists nowhere (untracked AND absent — the exact hazard window from the
 * issue) followed by one tracked path; log/log_error are stubbed to append to a
 * file so the test can read what the pipeline would have logged.
 *
 * The missing entry MUST come FIRST. The invariant under test is that the loop
 * CONTINUES past a failing pathspec and still stages what follows; with the
 * missing entry last, a loop that aborts on first failure (`… || { …; break; }`)
 * stages the tracked path anyway and the pin passes vacuously.
 */
function runInRepo(dir: string, body: string): { status: number | null; stderr: string; log: string; staged: string[]; realStaged: string[] } {
  const logFile = join(dir, 'pipeline.log');
  const pdIndex = join(dir, '.git', 'pd-test-index');
  const harness = [
    'set -u',
    `LOG_FILE=${JSON.stringify(logFile)}`,
    'log() { echo "[LOG] $*" >> "$LOG_FILE"; }',
    'log_error() { echo "[ERROR] $*" >> "$LOG_FILE"; }',
    'PIPELINE_ALLOWLIST=("missing.json" "tracked.json")',
    // run_deploy's commit_pipeline_data seeds the temporary index from the
    // parent pipeline-data tree; HEAD's tree stands in for it here.
    `pd_index=${JSON.stringify(pdIndex)}`,
    'pd_blob=""',
    'GIT_INDEX_FILE="$pd_index" git read-tree HEAD',
    body,
    'exit 0',
  ].join('\n');
  const r = spawnSync('bash', ['-c', harness], { cwd: dir, encoding: 'utf-8' });
  const diffCached = (env: Record<string, string>) =>
    spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: dir, encoding: 'utf-8', env: { ...process.env, ...env } })
      .stdout.split('\n').filter(Boolean);
  const staged = existsSync(pdIndex) ? diffCached({ GIT_INDEX_FILE: pdIndex }) : [];
  const realStaged = diffCached({});
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf-8') : '';
  return { status: r.status, stderr: r.stderr, log, staged, realStaged };
}

describe('daily-automated.sh staging block — per-path git add (issue #5)', () => {
  let tmp: string;
  beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), 'daily-staging-')); });
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  test('fixture precondition: the OLD single-call form stages nothing when one pathspec is missing', () => {
    // If git ever stops treating a missing pathspec as fatal, this test can no
    // longer distinguish the fix from the bug — fail loudly rather than pass
    // vacuously.
    const dir = join(tmp, 'old-form');
    require('fs').mkdirSync(dir);
    makeRepo(dir);
    const r = runInRepo(dir, OLD_SINGLE_CALL);
    expect(r.realStaged).toEqual([]);
  });

  test('stages the tracked path into the TEMPORARY index and logs the missing one (continuing)', () => {
    const dir = join(tmp, 'new-form');
    require('fs').mkdirSync(dir);
    makeRepo(dir);
    const block = extractStagingBlock();
    const r = runInRepo(dir, block);
    expect(r.status).toBe(0);
    expect(r.staged).toEqual(['tracked.json']);
    expect(r.realStaged).toEqual([]);          // the real index is never touched
    expect(r.log).toContain('[staging] could not stage missing.json');
    // Nothing from git leaks to the terminal; diagnostics go to LOG_FILE.
    expect(r.stderr).toBe('');
  });

  test('source pin: the single-call form is gone from the staging block', () => {
    const block = extractStagingBlock();
    expect(block).not.toContain(OLD_SINGLE_CALL);
    // The failure must go through log_error (tees to stderr → launchd-stderr.log),
    // not log: a swallowed staging failure is the silent outage issue #5 is about.
    expect(block).toMatch(/\|\| log_error "\[staging\] could not stage \$f/);
    expect(block).toContain('for f in "${PIPELINE_ALLOWLIST[@]}"');
    // Plumbing into the temporary index only — never the porcelain add.
    expect(block).toContain('GIT_INDEX_FILE="$pd_index" git update-index');
    expect(block).not.toMatch(/\bgit add\b/);
  });
});

describe('daily-automated.sh seam guards — staging block placement and allowlist', () => {
  test('staging block sits after the allowlist and before the tree guard', () => {
    const allowlist = daily.indexOf('local PIPELINE_ALLOWLIST=(');
    const begin = daily.indexOf(BEGIN);
    const end = daily.indexOf(END);
    const guard = daily.indexOf('pd_tree_only_allowlisted "$pd_tree"');
    expect(allowlist).toBeGreaterThan(-1);
    expect(begin).toBeGreaterThan(allowlist);
    expect(end).toBeGreaterThan(begin);
    expect(guard).toBeGreaterThan(end);
    // The markers appear exactly once each.
    expect(daily.indexOf(BEGIN, begin + 1)).toBe(-1);
    expect(daily.indexOf(END, end + 1)).toBe(-1);
  });

  test('the three allowlist entries are unchanged', () => {
    const start = daily.indexOf('local PIPELINE_ALLOWLIST=(');
    const end = daily.indexOf(')', start);
    const entries = daily.slice(start, end).match(/"[^"]+"/g);
    expect(entries).toEqual([
      '"data/event-set-hashes.json"',
      '"data/build-completeness.json"',
      '"data/scoreboard.json"',
    ]);
  });

  test('the single-call form appears nowhere in the script', () => {
    expect(daily).not.toContain(OLD_SINGLE_CALL);
  });
});
