#!/usr/bin/env bun
/**
 * Download and optimize event images for self-hosting.
 *
 * Usage:
 *   bun run scripts/download-images.ts [--source=athinorama] [--limit=50] [--force]
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { processEventImage } from '../src/images/image-pipeline';

const DB_PATH = join(import.meta.dir, '../data/events.db');

// Parse CLI args
const args = process.argv.slice(2);
const sourceFilter = args.find(a => a.startsWith('--source='))?.split('=')[1];
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? parseInt(limitArg, 10) : undefined;
const force = args.includes('--force');

// Concurrency control
const CONCURRENCY = 5;

/** Rows worth downloading. Exclusions (2026-08-11, the 0/481 daily-retry loop):
 *  - /lmnts/events/ URLs are permanently dead (502/404 — fix-athinorama-images.ts:5);
 *    retrying them every run made the summary read "Downloaded: 0 | Failed: 481".
 *  - merged_into rows are phantom losers with no live page — no image needed. */
export function selectImageRows(
  db: Database,
  opts: { force?: boolean; sourceFilter?: string | null; limit?: number | null },
): Array<{ id: string; image_url: string; source: string }> {
  const conditions = [
    'image_url IS NOT NULL',
    "image_url NOT LIKE '%/lmnts/events/%'",
    'merged_into IS NULL',
  ];
  const params: Record<string, string> = {};
  if (!opts.force) conditions.push('image_local IS NULL');
  if (opts.sourceFilter) {
    conditions.push('source = $source');
    params.$source = opts.sourceFilter;
  }
  let query = `SELECT id, image_url, source FROM events WHERE ${conditions.join(' AND ')} ORDER BY start_date DESC`;
  if (opts.limit) query += ` LIMIT ${opts.limit}`;
  return db.prepare(query).all(params) as Array<{ id: string; image_url: string; source: string }>;
}

async function main() {
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');

  // Idempotent migration: add image_local column if missing
  const columns = db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
  const existingCols = new Set(columns.map(c => c.name));
  if (!existingCols.has('image_local')) {
    db.run("ALTER TABLE events ADD COLUMN image_local TEXT");
    console.log('✅ Added image_local column to events table');
  }

  const rows = selectImageRows(db, { force, sourceFilter, limit });

  console.log(`📸 Found ${rows.length} events to process${sourceFilter ? ` (source: ${sourceFilter})` : ''}${force ? ' (force re-download)' : ''}`);
  if (rows.length === 0) {
    db.close();
    return;
  }

  let downloaded = 0;
  let failed = 0;
  const skipped = 0;

  // Simple semaphore for concurrency control
  const queue = [...rows];
  const total = rows.length;

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const row = queue.shift()!;
      const idx = total - queue.length;

      const result = await processEventImage(row.id, row.image_url, row.source, db);

      if (result) {
        downloaded++;
        const filePath = join(import.meta.dir, '../data/images', `${row.id}.webp`);
        try {
          const file = Bun.file(filePath);
          const size = file.size;
          const sizeKB = Math.round(size / 1024);
          console.log(`  [${idx}/${total}] ✅ ${row.id} from ${row.source} (${sizeKB}KB)`);
        } catch {
          console.log(`  [${idx}/${total}] ✅ ${row.id} from ${row.source}`);
        }
      } else {
        failed++;
        console.log(`  [${idx}/${total}] ❌ ${row.id} from ${row.source}`);
      }
    }
  }

  // Launch concurrent workers
  const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => processNext());
  await Promise.all(workers);

  db.close();

  console.log(`\n📊 Summary: Downloaded: ${downloaded} | Failed: ${failed} | Skipped: ${skipped}`);
}

// import.meta.main guard (2026-08-11): importing this module (tests import
// selectImageRows) must never trigger downloads — same class as the
// health-check main-on-import bug the prod-db-guard caught.
if (import.meta.main) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
