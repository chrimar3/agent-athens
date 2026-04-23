#!/usr/bin/env bun
/**
 * Migration: Normalize events.start_date and events.end_date to canonical
 * naive-local format (Europe/Athens implied; no offset suffix, no millisecond
 * fraction).
 *
 * Format mapping:
 *   - date-only (YYYY-MM-DD)                                 → passthrough
 *   - naive-ts (YYYY-MM-DDTHH:MM:SS, optional .sss fraction) → strip fraction
 *   - tz-aware (YYYY-MM-DDTHH:MM:SS[.sss](Z|+-HH:MM))        → strip suffix
 *   - other                                                   → leave; log anomaly
 *
 * Usage:
 *   bun run scripts/migrate-date-format.ts --dry-run
 *   bun run scripts/migrate-date-format.ts --execute
 *
 * Exits non-zero if the anomaly bucket is non-empty. Gate G2 in the session plan.
 */

import Database from 'bun:sqlite';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { classifyDateFormat, normalizeDateField } from '../src/utils/date-format';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const ANOMALY_LOG_PATH = join(import.meta.dir, '../logs/date-migration-anomalies.log');

const mode = process.argv.includes('--execute') ? 'execute'
            : process.argv.includes('--dry-run') ? 'dry-run'
            : null;

if (!mode) {
  console.error('Usage: bun run scripts/migrate-date-format.ts [--dry-run | --execute]');
  process.exit(2);
}

console.log('🕒 Date Format Migration');
console.log('========================');
console.log(`Mode: ${mode === 'execute' ? 'EXECUTE (changes will be applied)' : 'DRY RUN (no changes)'}`);
console.log('');

const db = new Database(DB_PATH);

type Row = { id: string; start_date: string | null; end_date: string | null };
const rows = db.prepare('SELECT id, start_date, end_date FROM events').all() as Row[];

console.log(`📊 Scanning ${rows.length} rows...`);
console.log('');

// Compute per-column distribution
interface Distribution {
  'date-only': number;
  'naive-ts': number;
  'tz-aware': number;
  'malformed': number;
  'null': number;
}
const blank = (): Distribution => ({ 'date-only': 0, 'naive-ts': 0, 'tz-aware': 0, 'malformed': 0, 'null': 0 });

const preStart = blank();
const preEnd = blank();
const changes: Array<{ id: string; col: 'start_date' | 'end_date'; before: string; after: string }> = [];
const anomalies: Array<{ id: string; col: 'start_date' | 'end_date'; value: string }> = [];

for (const row of rows) {
  for (const col of ['start_date', 'end_date'] as const) {
    const value = row[col];
    if (value === null || value === undefined) {
      (col === 'start_date' ? preStart : preEnd)['null']++;
      continue;
    }
    const fmt = classifyDateFormat(value);
    (col === 'start_date' ? preStart : preEnd)[fmt]++;

    if (fmt === 'malformed') {
      anomalies.push({ id: row.id, col, value });
      continue;
    }

    // normalizeDateField only rewrites when the on-disk form differs from canonical.
    const canonical = normalizeDateField(value);
    if (canonical !== value) {
      changes.push({ id: row.id, col, before: value, after: canonical });
    }
  }
}

function printDistribution(label: string, d: Distribution): void {
  const total = d['date-only'] + d['naive-ts'] + d['tz-aware'] + d['malformed'] + d['null'];
  console.log(`  ${label}  (total ${total})`);
  console.log(`    date-only : ${d['date-only']}`);
  console.log(`    naive-ts  : ${d['naive-ts']}`);
  console.log(`    tz-aware  : ${d['tz-aware']}`);
  console.log(`    malformed : ${d['malformed']}`);
  console.log(`    null      : ${d['null']}`);
}

console.log('📐 Current format distribution:');
printDistribution('start_date', preStart);
printDistribution('end_date  ', preEnd);
console.log('');

console.log(`📝 Migration plan: ${changes.length} row-columns will be updated.`);
if (changes.length > 0) {
  const sample = changes.slice(0, 5);
  console.log('  Sample changes:');
  for (const c of sample) {
    console.log(`    ${c.id}.${c.col}: ${c.before}  →  ${c.after}`);
  }
  if (changes.length > sample.length) {
    console.log(`    ... and ${changes.length - sample.length} more.`);
  }
}
console.log('');

if (anomalies.length > 0) {
  console.log(`⚠️  ${anomalies.length} malformed value(s) detected — logging and SKIPPING.`);
  if (!existsSync(dirname(ANOMALY_LOG_PATH))) {
    mkdirSync(dirname(ANOMALY_LOG_PATH), { recursive: true });
  }
  const stamp = new Date().toISOString();
  for (const a of anomalies) {
    const line = `${stamp} ${a.id} ${a.col} ${JSON.stringify(a.value)}\n`;
    appendFileSync(ANOMALY_LOG_PATH, line);
    if (anomalies.indexOf(a) < 10) {
      console.log(`    ${a.id}.${a.col}: ${JSON.stringify(a.value)}`);
    }
  }
  console.log(`  Full log: ${ANOMALY_LOG_PATH}`);
  console.log('');
}

if (mode === 'dry-run') {
  console.log('✋ DRY RUN — no changes applied. Re-run with --execute to migrate.');
  if (anomalies.length > 0) {
    console.log('   Gate G2: anomaly bucket is non-empty. Resolve before --execute.');
    process.exit(1);
  }
  process.exit(0);
}

// --execute path: Gate G2 enforcement. Refuse to run if anomalies present.
if (anomalies.length > 0) {
  console.error(`❌ Refusing to execute: ${anomalies.length} malformed rows present. See ${ANOMALY_LOG_PATH}.`);
  process.exit(1);
}

console.log('🔧 Applying migration in a transaction...');
const updateStart = db.prepare('UPDATE events SET start_date = $after WHERE id = $id AND start_date = $before');
const updateEnd = db.prepare('UPDATE events SET end_date = $after WHERE id = $id AND end_date = $before');

let appliedStart = 0;
let appliedEnd = 0;

try {
  db.transaction(() => {
    for (const c of changes) {
      const stmt = c.col === 'start_date' ? updateStart : updateEnd;
      const result = stmt.run({ $id: c.id, $after: c.after, $before: c.before });
      if (result.changes === 1) {
        if (c.col === 'start_date') appliedStart++;
        else appliedEnd++;
      }
    }
  })();
} catch (err) {
  console.error('❌ Transaction failed:', err);
  process.exit(1);
}

console.log(`   ✅ start_date updates: ${appliedStart}`);
console.log(`   ✅ end_date   updates: ${appliedEnd}`);
console.log('');

// Post-verification: no tz-aware values remain.
const postTz = db.prepare(`
  SELECT COUNT(*) as count FROM events
  WHERE start_date LIKE '%+%' OR start_date LIKE '%-__:__' OR start_date LIKE '%Z'
     OR end_date   LIKE '%+%' OR end_date   LIKE '%-__:__' OR end_date   LIKE '%Z'
`).get() as { count: number };

if (postTz.count > 0) {
  console.error(`❌ Post-migration invariant failed: ${postTz.count} rows still carry tz-aware markers.`);
  process.exit(1);
}

console.log('✅ Migration complete. All start_date / end_date values are canonical (naive-local or date-only).');
db.close();
