/**
 * S165 one-time backfill: upgrade existing athinorama sub-floor thumbnails.
 *
 * Two scoped phases:
 *   (1) image_url  — rewrite ALL athinorama ImagesDatabase thumbnails (250x300 /
 *       300x380 / any sub-1200) → 1200x1440. Cheap string rewrite; upgrades the
 *       ON-PAGE hero/card surface (which reads image_url) for every athinorama
 *       event, and zeroes the global sub-floor count.
 *   (2) image_local — re-download + re-optimize ONLY the displayed upcoming set
 *       (verified_athens/pass_through, not past). This refreshes the self-hosted
 *       webp that the GEO surfaces (og:image / twitter:image / JSON-LD image)
 *       read, at the raised MAX_WIDTH=1200. Scoped so we don't re-fetch ~11k
 *       past/hidden athinorama rows that never get built.
 *
 * Upgrade-only: never strips/nulls a row. Dry-run by default; pass --apply to write.
 *
 * Usage:
 *   bun run scripts/upgrade-athinorama-images.ts            # dry-run (counts only)
 *   bun run scripts/upgrade-athinorama-images.ts --apply    # write + re-download
 */
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { upgradeAthinoramaImage } from '../src/utils/athinorama-image';
import { processEventImage } from '../src/images/image-pipeline';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const apply = process.argv.includes('--apply');

const SUBFLOOR =
  `source = 'athinorama.gr'
   AND image_url LIKE '%/Content/ImagesDatabase/p/%'
   AND image_url NOT LIKE '%/p/1200x1440/%'`;

const DISPLAYED_UPCOMING =
  `location_status IN ('verified_athens','pass_through')
   AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')`;

async function main() {
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');

  // ---- Phase 1: image_url rewrite (all athinorama sub-floor) ----
  const phase1 = db
    .query<{ id: string; image_url: string }, []>(
      `SELECT id, image_url FROM events WHERE ${SUBFLOOR}`
    )
    .all();
  console.log(`📊 Phase 1 (image_url): ${phase1.length} athinorama sub-floor rows`);

  const update = db.query('UPDATE events SET image_url = $url WHERE id = $id');
  let rewritten = 0;
  for (const row of phase1) {
    const upgraded = upgradeAthinoramaImage(row.image_url);
    if (upgraded === row.image_url) continue;
    rewritten++;
    if (apply) update.run({ $url: upgraded, $id: row.id });
    else if (rewritten <= 2) console.log(`   e.g. ${row.image_url}\n      → ${upgraded}`);
  }
  console.log(apply ? `   ✅ image_url upgraded: ${rewritten}` : `   🔎 would upgrade: ${rewritten}`);

  // ---- Phase 2: image_local regen (displayed upcoming only) ----
  // After phase 1, displayed rows already carry the 1200x1440 image_url; in dry-run
  // they still carry the old one, so upgrade in-memory for the count/fetch.
  const phase2 = db
    .query<{ id: string; image_url: string; source: string }, []>(
      `SELECT id, image_url, source FROM events
       WHERE source = 'athinorama.gr'
         AND image_url LIKE '%/Content/ImagesDatabase/p/%'
         AND ${DISPLAYED_UPCOMING}`
    )
    .all();
  console.log(`📊 Phase 2 (image_local): ${phase2.length} displayed upcoming rows to re-download`);

  if (!apply) {
    console.log(`🔎 Dry-run complete. Re-run with --apply to write + re-download.`);
    db.close();
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const row of phase2) {
    const url = upgradeAthinoramaImage(row.image_url);
    const result = await processEventImage(row.id, url, row.source, db);
    if (result) {
      ok++;
      if (ok % 20 === 0) console.log(`   …${ok}/${phase2.length} re-downloaded`);
    } else {
      fail++;
      console.log(`   ❌ ${row.id} re-download failed`);
    }
  }
  console.log(`   ✅ image_local regenerated: ${ok} | failed: ${fail}`);

  db.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
