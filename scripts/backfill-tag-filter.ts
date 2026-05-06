#!/usr/bin/env bun
/**
 * Backfill: Strip entity-name tags from existing events (S2 taxonomy hygiene)
 *
 * Loads every event with non-empty tags, applies the same filterEntityTags()
 * the runtime now uses at the DB write barrier, and writes back only when the
 * array changed. Idempotent (test 17 confirms).
 *
 * Usage:
 *   bun run scripts/backfill-tag-filter.ts --dry-run   # preview counts + 10 sample diffs
 *   bun run scripts/backfill-tag-filter.ts             # actual run
 *
 * Stop conditions (per s2 plan):
 *   - If >50% of tagged rows would change, print warning and exit before writing.
 */

import Database from 'bun:sqlite';
import { filterEntityTags, loadDefaultExclusionSet } from '../src/utils/tag-filter';

const DB_PATH = 'data/events.db';
const SAFETY_RATIO = 0.5; // abort if >50% of tagged rows would change

interface EventRow {
  id: string;
  tags: string;
}

interface DiffSample {
  id: string;
  before: string[];
  after: string[];
  dropped: string[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

function main() {
  const { dryRun } = parseArgs();
  const exclusion = loadDefaultExclusionSet();
  const db = new Database(DB_PATH);

  const rows = db
    .prepare(
      `SELECT id, tags FROM events
       WHERE tags IS NOT NULL AND tags != '' AND tags != '[]'`,
    )
    .all() as EventRow[];

  const totalTagged = rows.length;
  const samples: DiffSample[] = [];
  const changed: { id: string; filtered: string[] }[] = [];
  let parseFailures = 0;

  for (const row of rows) {
    let original: unknown;
    try {
      original = JSON.parse(row.tags);
    } catch {
      parseFailures++;
      continue;
    }
    if (!Array.isArray(original)) continue;

    const before = original as string[];
    const after = filterEntityTags(before, exclusion);
    if (after.length === before.length) continue;

    const droppedSet = new Set(after.map((t) => t.toLowerCase()));
    const dropped = before.filter((t) => !droppedSet.has(t.toLowerCase()));

    if (samples.length < 10) {
      samples.push({ id: row.id, before, after, dropped });
    }
    changed.push({ id: row.id, filtered: after });
  }

  const ratio = totalTagged > 0 ? changed.length / totalTagged : 0;

  console.log('Backfill: entity-tag filter\n');
  console.log(`Tagged rows scanned: ${totalTagged}`);
  console.log(`Rows that would change: ${changed.length} (${(ratio * 100).toFixed(1)}%)`);
  if (parseFailures > 0) {
    console.log(`Parse failures (skipped): ${parseFailures}`);
  }

  if (samples.length > 0) {
    console.log('\nSample diffs (first 10):');
    for (const s of samples) {
      console.log(`  ${s.id}`);
      console.log(`    before: ${JSON.stringify(s.before)}`);
      console.log(`    after:  ${JSON.stringify(s.after)}`);
      console.log(`    dropped: ${JSON.stringify(s.dropped)}`);
    }
  }

  if (ratio > SAFETY_RATIO) {
    console.error(
      `\nABORT: ${(ratio * 100).toFixed(1)}% of tagged rows would change (limit ${SAFETY_RATIO * 100}%).`,
    );
    console.error('Sample 20 diffs and confirm the filter is correct before re-running.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--dry-run: no writes performed.');
    db.close();
    return;
  }

  if (changed.length === 0) {
    console.log('\nNo changes to apply.');
    db.close();
    return;
  }

  const update = db.prepare('UPDATE events SET tags = ? WHERE id = ?');
  const tx = db.transaction((items: { id: string; filtered: string[] }[]) => {
    for (const item of items) {
      const value = item.filtered.length > 0 ? JSON.stringify(item.filtered) : null;
      update.run(value, item.id);
    }
  });
  tx(changed);

  console.log(`\nWrote ${changed.length} updates.`);
  db.close();
}

main();
