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
import { readFileSync } from 'fs';
import { join } from 'path';

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

  test('the S89 wall-clock pattern is still used where it belongs (the enrichment batch watchdog in auto-enrich.sh)', () => {
    // Guards against "fixing" the wrong watchdog: a genuinely hung Claude CLI
    // must still die across sleep.
    const autoEnrich = readFileSync(join(import.meta.dir, '..', 'scripts', 'auto-enrich.sh'), 'utf-8');
    expect(autoEnrich).toMatch(/date \+%s/);
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
