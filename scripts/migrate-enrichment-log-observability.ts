#!/usr/bin/env bun
/**
 * Enrichment Log Observability Migration (Session 98)
 *
 * Adds two columns to enrichment_log:
 *   - saved_to_events BOOLEAN (NULL when event deleted, 1/0 otherwise)
 *   - run_id TEXT (NULL for historical rows; forward-only)
 *
 * Why:
 *   S90-lesson-round-three. auto-enrich.sh reports subprocess exit codes as
 *   batch success/failure, but claude -p exits non-zero on stream-idle even
 *   when its saves committed cleanly. The fix requires recording save-state
 *   at the save site (not at a downstream proxy) and a run-unique id to
 *   correlate wrapper observations with per-run DB writes.
 *
 *   session_id is left untouched: scripts/rollback-batch.ts filters on it for
 *   a destructive operation. Adding a new column is the clean answer.
 *
 * Backfill semantics:
 *   - saved_to_events: TRIM-tolerant equality between events.full_description_en
 *     and enrichment_log.description_after for rows where the event still exists.
 *     Rows for deleted events stay NULL (ambiguous historical; no reconstruction).
 *   - run_id: always NULL. Forward-only. Reconstructing "which rows were this
 *     run" from timestamps is the exact proxy we're replacing.
 *
 * Safe to run multiple times (idempotent via PRAGMA table_info check).
 *
 * Usage:
 *   bun run scripts/migrate-enrichment-log-observability.ts --dry-run
 *   bun run scripts/migrate-enrichment-log-observability.ts
 */

import Database from 'bun:sqlite';

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = 'data/events.db';

interface ProjectedCountRow {
  projected_state: 'would_null' | 'would_true' | 'would_false';
  ct: number;
}

interface ActualCountRow {
  saved_to_events: number | null;
  ct: number;
}

function main(): void {
  console.log(`\n=== Enrichment Log Observability Migration ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  try {
    addColumns(db);

    if (DRY_RUN) {
      previewBackfill(db);
    } else {
      backfillSavedToEvents(db);
      verifyPostMigration(db);
    }

    console.log(`\n=== Migration ${DRY_RUN ? 'would complete' : 'complete'} ===\n`);
  } finally {
    db.close();
  }
}

function addColumns(db: Database): void {
  console.log('1. Adding columns to enrichment_log...');

  const columns = db.prepare('PRAGMA table_info(enrichment_log)').all() as { name: string }[];
  const existing = new Set(columns.map(c => c.name));

  const newCols: Array<{ name: string; type: string; default: string }> = [
    { name: 'saved_to_events', type: 'BOOLEAN', default: 'NULL' },
    { name: 'run_id',          type: 'TEXT',    default: 'NULL' },
  ];

  let added = 0;
  for (const col of newCols) {
    if (existing.has(col.name)) {
      console.log(`   [skip] ${col.name} already exists`);
      continue;
    }
    if (!DRY_RUN) {
      db.run(`ALTER TABLE enrichment_log ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default}`);
    }
    console.log(`   [${DRY_RUN ? 'would add' : 'added'}] ${col.name} ${col.type} DEFAULT ${col.default}`);
    added++;
  }

  console.log(`   ${added} column(s) ${DRY_RUN ? 'would be' : ''} added\n`);
}

function previewBackfill(db: Database): void {
  console.log('2. Previewing saved_to_events backfill (TRIM-tolerant)...');

  // Project what the backfill would produce without touching the DB.
  // Three buckets:
  //   - would_null: event row does not exist (deleted or never existed)
  //   - would_true: TRIM-equal on both sides
  //   - would_false: event exists, descriptions do not match (including events
  //                  with NULL full_description_en — genuine divergence)
  const rows = db.prepare(`
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM events e WHERE e.id = el.event_id)
          THEN 'would_null'
        WHEN TRIM(COALESCE((SELECT full_description_en FROM events WHERE id = el.event_id), ''))
           = TRIM(COALESCE(el.description_after, ''))
          THEN 'would_true'
        ELSE 'would_false'
      END AS projected_state,
      COUNT(*) AS ct
    FROM enrichment_log el
    GROUP BY projected_state
    ORDER BY projected_state;
  `).all() as ProjectedCountRow[];

  const total = rows.reduce((s, r) => s + r.ct, 0);
  console.log(`   Total enrichment_log rows: ${total}`);
  for (const r of rows) {
    const pct = ((r.ct / total) * 100).toFixed(1);
    console.log(`   ${r.projected_state.padEnd(14)} ${String(r.ct).padStart(5)}  (${pct}%)`);
  }

  console.log('\n   Expected (from Path C classification):');
  console.log('   - would_true:  ~493  (saved_match sum across length buckets)');
  console.log('   - would_null:  ~940  (deleted events tail)');
  console.log('   - would_false: ~200  (divergent_other + past_but_exists with NULL desc)');
  console.log('\n   Deviation >10% from expected = stop and investigate before applying.\n');
}

function backfillSavedToEvents(db: Database): void {
  console.log('2. Backfilling saved_to_events (TRIM-tolerant)...');

  // Use a transaction so a partial failure doesn't leave a half-backfilled state.
  db.run('BEGIN');
  try {
    // Correlated-subquery form works across SQLite versions and produces
    // the same result as UPDATE FROM.
    const result = db.run(`
      UPDATE enrichment_log
         SET saved_to_events = (
           SELECT CASE
             WHEN TRIM(COALESCE(e.full_description_en, ''))
                = TRIM(COALESCE(enrichment_log.description_after, ''))
             THEN 1
             ELSE 0
           END
           FROM events e
           WHERE e.id = enrichment_log.event_id
         )
       WHERE EXISTS (
         SELECT 1 FROM events e WHERE e.id = enrichment_log.event_id
       );
    `);
    db.run('COMMIT');
    console.log(`   Backfilled ${result.changes} rows\n`);
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

function verifyPostMigration(db: Database): void {
  console.log('3. Verifying post-migration state...');

  const cols = db.prepare('PRAGMA table_info(enrichment_log)').all() as { name: string; type: string }[];
  for (const col of ['saved_to_events', 'run_id']) {
    const found = cols.find(c => c.name === col);
    console.log(`   enrichment_log.${col}: ${found ? `present (${found.type})` : 'MISSING'}`);
  }

  const counts = db.prepare(`
    SELECT saved_to_events, COUNT(*) AS ct
    FROM enrichment_log
    GROUP BY saved_to_events
    ORDER BY saved_to_events;
  `).all() as ActualCountRow[];

  const total = counts.reduce((s, r) => s + r.ct, 0);
  console.log(`\n   Total rows: ${total}`);
  for (const r of counts) {
    const label = r.saved_to_events === null ? 'NULL' : r.saved_to_events === 1 ? 'TRUE' : 'FALSE';
    const pct = ((r.ct / total) * 100).toFixed(1);
    console.log(`   saved_to_events=${label.padEnd(5)} ${String(r.ct).padStart(5)}  (${pct}%)`);
  }

  const runIdAll = db.prepare(`
    SELECT COUNT(*) AS ct FROM enrichment_log WHERE run_id IS NULL;
  `).get() as { ct: number };
  console.log(`\n   run_id IS NULL: ${runIdAll.ct}/${total} (expected: all historical rows NULL)`);
}

main();
