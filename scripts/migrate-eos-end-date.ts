#!/usr/bin/env bun
/**
 * Migration S-F2a: backfill events.end_date from run-end description prose
 * ("Εως YYYY-MM-DD" — written by the athinorama scraper before the capture fix),
 * and clean descriptions per GEO ruling G5 (omit, never "").
 *
 * Selection is parser-driven, not LIKE-driven: every row with empty end_date and
 * a non-empty description is offered to parseRunEndDate(); the token itself
 * lives in config/parsing-tokens.json. This avoids both hardcoding the Greek
 * literal and the (A AND B) OR C precedence trap flagged in plan review.
 *
 * Also applies the operator-approved global G5 normalization:
 *   UPDATE events SET description = NULL WHERE description = ''
 *
 * Usage:
 *   bun run scripts/migrate-eos-end-date.ts --dry-run    # spike gate, no writes
 *   bun run scripts/migrate-eos-end-date.ts --execute
 *
 * Excluded classes (end<start, invalid date) are logged to
 * logs/eos-backfill-anomalies.log and skipped — they are residual-spec material,
 * not blockers. Post-verify invariants exit 1 on failure.
 */

import Database from 'bun:sqlite';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { parseRunEndDate } from '../src/utils/run-end-token';

const PARSING_TOKENS = JSON.parse(
  readFileSync(join(import.meta.dir, '../config/parsing-tokens.json'), 'utf-8')
).runEndTokens?.el ?? [];
const TOKEN_VISIBILITY_RE = new RegExp(
  PARSING_TOKENS.map((t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'u'
);

const DB_PATH = join(import.meta.dir, '../data/events.db');
const ANOMALY_LOG_PATH = join(import.meta.dir, '../logs/eos-backfill-anomalies.log');

const mode = process.argv.includes('--execute') ? 'execute'
            : process.argv.includes('--dry-run') ? 'dry-run'
            : null;

if (!mode) {
  console.error('Usage: bun run scripts/migrate-eos-end-date.ts [--dry-run | --execute]');
  process.exit(2);
}

console.log('📅 Εως → end_date Backfill Migration (S-F2a)');
console.log('=============================================');
console.log(`Mode: ${mode === 'execute' ? 'EXECUTE (changes will be applied)' : 'DRY RUN (no changes)'}`);
console.log('');

const db = new Database(DB_PATH);

type Row = { id: string; description: string; start_date: string; source: string };
const candidates = db.prepare(`
  SELECT id, description, start_date, source FROM events
  WHERE (end_date IS NULL OR end_date = '')
    AND description IS NOT NULL AND description != ''
`).all() as Row[];

const emptyDescCount = (db.prepare(
  `SELECT COUNT(*) AS c FROM events WHERE description = ''`
).get() as { c: number }).c;

console.log(`📊 Candidates (empty end_date, non-empty description): ${candidates.length}`);
console.log(`📊 Empty-string descriptions (global G5 normalization): ${emptyDescCount}`);
console.log('');

interface PlannedUpdate { id: string; endDate: string; cleanedDescription: string | null; before: string; source: string }
const updates: PlannedUpdate[] = [];
const anomalies: Array<{ id: string; reason: string; description: string; start_date: string }> = [];
let noToken = 0;

for (const row of candidates) {
  const parsed = parseRunEndDate(row.description, row.start_date);
  if (parsed) {
    updates.push({
      id: row.id,
      endDate: parsed.endDate,
      cleanedDescription: parsed.cleanedDescription,
      before: row.description,
      source: row.source,
    });
    continue;
  }
  // Distinguish "no token at all" (normal description — silently skip) from
  // "token present but unparseable/invalid window" (anomaly — log for residual).
  const tokenOnly = parseRunEndDate(row.description); // without start-date window check
  if (tokenOnly) {
    anomalies.push({ id: row.id, reason: 'end<start', description: row.description, start_date: row.start_date });
  } else if (TOKEN_VISIBILITY_RE.test(row.description) && /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/.test(row.description)) {
    // Heuristic visibility net for the residual spec; matching here does NOT
    // gate any write (writes are parser-decided only).
    anomalies.push({ id: row.id, reason: 'token-present-unparsed', description: row.description.slice(0, 80), start_date: row.start_date });
  } else {
    noToken++;
  }
}

console.log(`📝 Plan: ${updates.length} rows → end_date backfill (+ description clean)`);
console.log(`   Skipped (no run-end token): ${noToken}`);
console.log(`   Anomalies (excluded, logged): ${anomalies.length}`);
console.log('');

// Spike sample (Guard 2): 20 rows spanning the date range.
const sorted = [...updates].sort((a, b) => a.endDate.localeCompare(b.endDate));
const step = Math.max(1, Math.floor(sorted.length / 20));
const sample = sorted.filter((_, i) => i % step === 0).slice(0, 20);
console.log(`🔬 Spike sample (${sample.length} rows spanning end-date range):`);
for (const u of sample) {
  const verdict = u.endDate >= '2020-01-01' && u.endDate <= '2028-12-31' ? 'OK' : 'SUSPECT';
  console.log(`   ${u.id.slice(0, 12)} | "${u.before.slice(0, 24)}" → end_date=${u.endDate} desc=${u.cleanedDescription === null ? 'NULL' : JSON.stringify(u.cleanedDescription.slice(0, 30))} | ${verdict}`);
}
console.log('');

if (anomalies.length > 0) {
  if (!existsSync(dirname(ANOMALY_LOG_PATH))) mkdirSync(dirname(ANOMALY_LOG_PATH), { recursive: true });
  const stamp = new Date().toISOString();
  for (const a of anomalies) {
    appendFileSync(ANOMALY_LOG_PATH, `${stamp} ${a.id} ${a.reason} start=${a.start_date} ${JSON.stringify(a.description)}\n`);
  }
  console.log(`⚠️  ${anomalies.length} anomalies logged to ${ANOMALY_LOG_PATH} (excluded from migration).`);
  for (const a of anomalies.slice(0, 5)) console.log(`    ${a.id.slice(0, 12)} ${a.reason}: ${JSON.stringify(a.description.slice(0, 60))}`);
  console.log('');
}

if (mode === 'dry-run') {
  console.log('✋ DRY RUN — no changes applied. Verify the spike sample, then re-run with --execute.');
  process.exit(0);
}

console.log('🔧 Applying migration in a transaction...');
const updateStmt = db.prepare(`
  UPDATE events SET end_date = $end_date, description = $description, updated_at = datetime('now')
  WHERE id = $id AND (end_date IS NULL OR end_date = '')
`);
const nullifyEmpty = db.prepare(`UPDATE events SET description = NULL WHERE description = ''`);

let applied = 0;
let emptied = 0;
try {
  db.transaction(() => {
    for (const u of updates) {
      const r = updateStmt.run({ $id: u.id, $end_date: u.endDate, $description: u.cleanedDescription });
      applied += r.changes;
    }
    emptied = nullifyEmpty.run().changes;
  })();
} catch (err) {
  console.error('❌ Transaction failed (rolled back):', err);
  process.exit(1);
}

console.log(`   ✅ end_date backfilled: ${applied}`);
console.log(`   ✅ '' descriptions → NULL: ${emptied}`);
console.log('');

// ── Post-verify invariants (exit 1 on any failure) ─────────────────────────
let failed = false;

// 1. No remaining empty-end_date row parses as a run-end token.
const remaining = db.prepare(`
  SELECT id, description, start_date FROM events
  WHERE (end_date IS NULL OR end_date = '') AND description IS NOT NULL AND description != ''
`).all() as Row[];
const stillParseable = remaining.filter(r => parseRunEndDate(r.description, r.start_date)).length;
if (stillParseable > 0) { console.error(`❌ Invariant 1 failed: ${stillParseable} parseable rows remain un-backfilled.`); failed = true; }
else console.log('✅ Invariant 1: zero parseable run-end rows remain with empty end_date.');

// 2. No end_date precedes start_date (date-only comparison).
const inverted = (db.prepare(`
  SELECT COUNT(*) AS c FROM events
  WHERE end_date IS NOT NULL AND end_date != ''
    AND date(substr(end_date,1,10)) < date(substr(start_date,1,10))
`).get() as { c: number }).c;
if (inverted > 0) { console.error(`❌ Invariant 2 failed: ${inverted} rows with end_date < start_date.`); failed = true; }
else console.log('✅ Invariant 2: no end_date < start_date.');

// 3. G5: no empty-string descriptions anywhere.
const stillEmpty = (db.prepare(`SELECT COUNT(*) AS c FROM events WHERE description = ''`).get() as { c: number }).c;
if (stillEmpty > 0) { console.error(`❌ Invariant 3 failed: ${stillEmpty} description='' rows remain.`); failed = true; }
else console.log('✅ Invariant 3: zero empty-string descriptions.');

if (failed) process.exit(1);
console.log('');
console.log('✅ Migration complete.');
db.close();
