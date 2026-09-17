/**
 * Sleep-safety seam guards for scripts/daily-automated.sh (2026-09-13).
 *
 * Root cause pinned here: the pipeline runs on a laptop that idle-sleeps after
 * 1 minute on battery. pmset's log for 2026-09-13 shows Deep Idle sleep from
 * 18:06 to 22:12 with ~5 s maintenance wakes every ~15 min; every deploy
 * failure timestamp that day lands exactly on a wake: git "timeout" 18:30:54,
 * watchdog kill 18:49:54, 36 state polls crawling one per wake until 22:14.
 * The deploy watchdog had copied the S89 wall-clock pattern (`date +%s`
 * deadline), whose purpose is to fire even across system sleep — right for a
 * hung Claude CLI, wrong for a network upload that is merely suspended: it
 * killed the CLI at wake and orphaned the Netlify deploy in `state=uploading`
 * (09-03, 09-04, 09-05, 09-13; the only successes, 09-06 and 09-08, ran while
 * the Mac was awake).
 *
 * These are source-text pins (the script runs main() at load, so it cannot be
 * sourced in a test); each was mutation-verified: revert the guarded line and
 * exactly one test here fails.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const SCRIPT = readFileSync(join(import.meta.dir, '..', 'scripts', 'daily-automated.sh'), 'utf-8');

function between(text: string, begin: string, end: string): string {
  const a = text.indexOf(begin);
  const b = text.indexOf(end, a);
  if (a === -1 || b === -1) throw new Error(`markers not found: ${begin} … ${end}`);
  return text.slice(a, b);
}

describe('deploy watchdog measures AWAKE time, not wall-clock', () => {
  test('the watchdog block is delimited by deploy-watchdog markers', () => {
    expect(SCRIPT).toContain('# deploy-watchdog:begin');
    expect(SCRIPT).toContain('# deploy-watchdog:end');
  });

  test('it counts kernel-paused sleep ticks (which do not advance during system sleep)', () => {
    const block = between(SCRIPT, '# deploy-watchdog:begin', '# deploy-watchdog:end');
    // A `date +%s` deadline is exactly the S89 pattern that kills a suspended
    // upload at wake. It must not come back here.
    expect(block).not.toMatch(/date \+%s/);
    expect(block).toMatch(/AWAKE_TICKS/);
    expect(block).toMatch(/sleep 15/);
  });

  test('a CLI that ignores TERM is escalated to kill -9', () => {
    // The parent `wait`s on the CLI pid. A single TERM the CLI chooses to
    // ignore leaves that wait blocking forever, so the watchdog "timeout"
    // never actually ends the run — the escalation is what makes it a timeout.
    const block = between(SCRIPT, '# deploy-watchdog:begin', '# deploy-watchdog:end');
    expect(block).toMatch(/kill -9 "\$NETLIFY_PID"/);
    // Escalation, not replacement: TERM is still sent first, and the grace
    // window is counted in awake ticks (same reason as AWAKE_TICKS above).
    const term = block.indexOf('kill "$NETLIFY_PID"');
    expect(term).toBeGreaterThan(-1);
    expect(block.indexOf('kill -9 "$NETLIFY_PID"')).toBeGreaterThan(term);
    expect(block.slice(term)).toMatch(/sleep 5\b/);
  });

  test('the S89 wall-clock pattern is still used where it belongs (the enrichment batch watchdog in auto-enrich.sh)', () => {
    // Guards against "fixing" the wrong watchdog: a genuinely hung Claude CLI
    // must still die across sleep.
    const autoEnrich = readFileSync(join(import.meta.dir, '..', 'scripts', 'auto-enrich.sh'), 'utf-8');
    expect(autoEnrich).toMatch(/date \+%s/);
  });
});

/**
 * Behavioural pin for the escalation: the REAL watchdog block is extracted
 * between its markers and executed with three substitutions only — the netlify
 * CLI becomes a child that ignores TERM (or one that honours it), the two
 * awake-tick sleeps shrink from 15 s / 5 s to 0.2 s / 0.1 s, and `local` is
 * dropped because the block runs outside a function. Everything else — the
 * tick arithmetic, the TERM, the grace loop, the kill -9 — is the script's own
 * text, so a mutant that makes the KILL unreachable or stretches the grace
 * window to hours turns into a spawn timeout here instead of a green suite.
 */
function runWatchdogBlock(ignoreTerm: boolean): { cliExit: string; log: string; status: number | null; elapsedMs: number } {
  const start = SCRIPT.indexOf('# deploy-watchdog:begin');
  const end = SCRIPT.indexOf('# deploy-watchdog:end');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  let block = SCRIPT.slice(SCRIPT.indexOf('\n', start) + 1, end);
  const cli = ignoreTerm ? `bash -c 'trap "" TERM; sleep 60' >"$deploy_tmp" 2>>"$LOG_FILE" &` : `sleep 60 >"$deploy_tmp" 2>>"$LOG_FILE" &`;
  const before = block;
  block = block.replace(/netlify deploy[\s\S]*?>>"\$LOG_FILE" &/, cli);
  expect(block).not.toBe(before); // the CLI line was found and replaced
  expect(block).toMatch(/sleep 15$/m);
  expect(block).toMatch(/sleep 5$/m);
  block = block.replace(/sleep 15$/m, 'sleep 0.2').replace(/sleep 5$/m, 'sleep 0.1').replace(/\blocal /g, '');
  const dir = mkdtempSync(join(tmpdir(), 'aa-watchdog-'));
  const logFile = join(dir, 'pipeline.log');
  const harness = [
    'set -u',
    `LOG_FILE=${JSON.stringify(logFile)}`,
    `deploy_tmp=${JSON.stringify(join(dir, 'deploy.json'))}`,
    'DEPLOY_TIMEOUT=1',
    block,
    'cli_exit=0',
    'wait "$NETLIFY_PID" || cli_exit=$?',
    'echo "cli_exit=$cli_exit"',
  ].join('\n');
  const t0 = Date.now();
  const r = spawnSync('bash', ['-c', harness], { encoding: 'utf-8', timeout: 20_000 });
  const elapsedMs = Date.now() - t0;
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf-8') : '';
  rmSync(dir, { recursive: true, force: true });
  return { cliExit: (r.stdout.match(/cli_exit=(\d+)/) ?? [])[1] ?? '', log, status: r.status, elapsedMs };
}

describe('deploy watchdog — the escalation actually terminates a TERM-ignoring CLI (executed, not spelled)', () => {
  test('a child that ignores TERM is killed with -9 and `wait` returns 137 within seconds', () => {
    const r = runWatchdogBlock(true);
    expect(r.status).toBe(0);              // the harness itself finished (no spawn timeout)
    expect(r.cliExit).toBe('137');
    expect(r.log).toContain('watchdog killed CLI');
    expect(r.log).toContain('escalating to kill -9');
    expect(r.elapsedMs).toBeLessThan(15_000);
  });

  test('a child that honours TERM ends at the TERM and is never escalated', () => {
    const r = runWatchdogBlock(false);
    expect(r.status).toBe(0);
    expect(r.cliExit).toBe('143');
    expect(r.log).toContain('watchdog killed CLI');
    expect(r.log).not.toContain('escalating');
  });
});

describe('full/freshness runs hold an idle-sleep assertion for their whole duration', () => {
  test('main() re-execs under caffeinate -i once, skipping enrichment mode', () => {
    const main = SCRIPT.slice(SCRIPT.indexOf('\nmain() {'));
    const reexec = between(main, '# caffeinate:begin', '# caffeinate:end');
    expect(reexec).toMatch(/exec caffeinate -i/);
    // Recursion guard: the re-exec'd child must not re-exec again.
    expect(reexec).toMatch(/AA_CAFFEINATED/);
    // Enrichment-mode runs fire 6×/day; holding the assertion for them would
    // drain a battery for no deploy benefit — only the deploying modes opt in.
    expect(reexec).toMatch(/PIPELINE_MODE/);
    expect(reexec).toMatch(/enrichment/);
  });
});
