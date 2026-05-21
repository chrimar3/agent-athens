#!/usr/bin/env bun

/**
 * Test-count snapshot.
 *
 * Runs `bun test`, parses the trailing summary, writes data/test-summary.json.
 * /proof reads this artifact at build time so the test count it cites is grounded
 * in a real run — not a memory anchor that drifts (e.g. the "1,410+" anchor was
 * stale by ~970 when recon caught it on 2026-05-21).
 *
 * Lifecycle: committed to git, regenerated PRE-DEPLOY (not pre-build). Full suite
 * is ~50s and would wreck the build budget. /proof displays the `ranAt` timestamp
 * so the figure is honest-as-of-snapshot rather than falsely live.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { DateTime } from 'luxon';

const PROJECT_DIR = join(import.meta.dir, '..');
const OUT_PATH = join(PROJECT_DIR, 'data/test-summary.json');

async function main() {
  console.log('Running bun test...');

  const proc = Bun.spawn(['bun', 'test'], {
    cwd: PROJECT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdoutText, stderrText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  const combined = stdoutText + '\n' + stderrText;

  const passMatch  = combined.match(/(\d+)\s+pass\b/);
  const skipMatch  = combined.match(/(\d+)\s+skip\b/);
  const failMatch  = combined.match(/(\d+)\s+fail\b/);
  const expMatch   = combined.match(/(\d+)\s+expect\(\)\s+calls/);
  const filesMatch = combined.match(/across\s+(\d+)\s+files/);

  if (!passMatch || !skipMatch || !failMatch || !expMatch || !filesMatch) {
    console.error('❌ Could not parse bun test summary. Last 500 chars:');
    console.error(combined.slice(-500));
    process.exit(1);
  }

  const summary = {
    pass: Number(passMatch[1]),
    skip: Number(skipMatch[1]),
    fail: Number(failMatch[1]),
    expects: Number(expMatch[1]),
    files: Number(filesMatch[1]),
    ranAt: DateTime.now().setZone('Europe/Athens').toISO(),
  };

  writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2) + '\n');
  console.log(`✓ Wrote ${OUT_PATH}`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
