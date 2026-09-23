#!/usr/bin/env bun
/**
 * One-off correction: megaron.gr rows carry a hardcoded 20:30 start that the
 * listing page never stated (the scraper defaulted it until 2026-09-22). The
 * daily upsert never rewrites start_date and COALESCE-keeps time_doors, so the
 * invented clock survives re-scrapes; this strips it. Afterwards run
 *   bun run scripts/enrich-time.ts --source megaron.gr --limit 300
 * to fill the real time from each detail page.
 *
 * Usage:
 *   bun run scripts/fix-megaron-default-times.ts           # dry run (default)
 *   bun run scripts/fix-megaron-default-times.ts --apply
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const WHERE = `source = 'megaron.gr' AND start_date LIKE '%T20:30:00%'`;

export function resetMegaronDefaultTimes(db: Database, opts: { apply: boolean }): number {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${WHERE}`).get() as { n: number };
  if (!opts.apply || n === 0) return n;

  db.prepare(`
    UPDATE events
    SET start_date = substr(start_date, 1, 10),
        time_doors = CASE WHEN time_doors = '20:30' THEN NULL ELSE time_doors END,
        time_source = CASE WHEN time_source = 'scraped_listing' THEN NULL ELSE time_source END
    WHERE ${WHERE}
  `).run();
  return n;
}

if (import.meta.main) {
  const apply = process.argv.includes('--apply');
  const dbPath = join(import.meta.dir, '../data/events.db');
  try {
    const db = new Database(dbPath);
    const n = db.transaction(() => resetMegaronDefaultTimes(db, { apply }))();
    db.close();
    console.log(apply
      ? `✅ Reset ${n} megaron.gr rows to date-only. Next: bun run scripts/enrich-time.ts --source megaron.gr --limit 300`
      : `🔍 Dry run: ${n} megaron.gr rows carry the default 20:30. Re-run with --apply to reset them.`);
  } catch (error) {
    console.error(`❌ Could not reset megaron times in ${dbPath}: ${error}`);
    console.error('   Check the database is not locked by the daily pipeline, then retry.');
    process.exit(1);
  }
}
