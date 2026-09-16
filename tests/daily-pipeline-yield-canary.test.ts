/**
 * Seam guards: the yield canary (issue #1) is actually invoked by the daily
 * pipeline. scripts/daily-automated.sh runs main() at load, so these are
 * source-text pins on the script, in the style of the scoreboard seam guards.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const SCRIPT = readFileSync(join(import.meta.dir, '..', 'scripts', 'daily-automated.sh'), 'utf-8');

describe('daily-automated.sh runs the yield canary once per freshness cycle', () => {
  test('run_yield_canary exists, is DRY_RUN-aware, invokes the script, and is non-fatal', () => {
    const start = SCRIPT.indexOf('\nrun_yield_canary() {');
    expect(start).toBeGreaterThan(-1);
    const body = SCRIPT.slice(start, SCRIPT.indexOf('\n}', start));
    expect(body).toMatch(/DRY_RUN/);
    expect(body).toMatch(/bun run scripts\/yield-canary\.ts/);
    // Exit 2 = a source tripped (the issue is the signal), anything else = the
    // canary could not run. Neither may abort the pipeline: every path returns 0.
    expect(body).toMatch(/return 0\s*# Non-fatal/);
    expect(body).not.toMatch(/return 1/);
  });

  test('main() calls it right after run_scrape and before run_quality, inside the non-enrichment block', () => {
    const main = SCRIPT.slice(SCRIPT.indexOf('\nmain() {'));
    const scrape = main.indexOf('\n        run_scrape\n');
    const canary = main.indexOf('\n        run_yield_canary\n');
    const quality = main.indexOf('\n        run_quality\n');
    expect(scrape).toBeGreaterThan(-1);
    expect(canary).toBeGreaterThan(scrape);
    expect(quality).toBeGreaterThan(canary);
    // Exactly one call: a second one would file duplicate-attempt noise daily.
    expect(main.split('run_yield_canary').length - 1).toBe(1);
  });
});
