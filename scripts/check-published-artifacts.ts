#!/usr/bin/env bun
/**
 * Standalone run of the build's published-artifact invariant over an existing
 * dist/ (same validator src/generate-site.ts calls before stamping). Used by
 * `scripts/daily-automated.sh publish` to re-check a deferred build right
 * before it is deployed.
 *
 * Usage: bun run scripts/check-published-artifacts.ts [distDir]   (default: dist)
 * Exit: 0 clean · 1 violations found · 2 dist/ missing or unreadable
 */

import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { validatePublishedArtifacts } from '../src/validators/published-artifacts';

const distDir = resolve(process.argv[2] ?? 'dist');

if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
  console.error(`check-published-artifacts: FAILED — ${distDir} is not a directory — try: build first (bun run build)`);
  process.exit(2);
}

let report;
try {
  report = validatePublishedArtifacts(distDir);
} catch (e) {
  console.error(`check-published-artifacts: FAILED — could not scan ${distDir}: ${(e as Error).message} — try: rebuild (bun run build)`);
  process.exit(2);
}

if (report.failures.length > 0) {
  console.error(`check-published-artifacts: FAILED — ${report.failures.length} page(s) carry pipeline artefacts`);
  for (const f of report.failures.slice(0, 15)) console.error(`   ${f.file}: ${f.issues.join('; ')}`);
  console.error('try: fix at the source (see src/validators/published-artifacts.ts), rebuild, then publish again');
  process.exit(1);
}

console.log(`check-published-artifacts: PASS — ${report.scanned} pages clean`);
