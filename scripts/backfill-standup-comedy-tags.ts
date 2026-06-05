/**
 * S175 — Stand-up tag backfill (dated data correction, 2026-06-05).
 *
 * Adds the structured "Stand-up-comedy" tag to VERIFIED stand-up rows so the
 * comedy-format detector (src/utils/comedy-format.ts) derives
 * @type: ComedyEvent at build time. The EventType column is NEVER touched —
 * @type derivation is layered above it (locked S175 ruling, tag≠type guard).
 *
 * Curation: anchor IDs verified against titles/descriptions in the
 * 2026-06-05 corpus audit (specs/comedy-type-cleanup-brief.md). Same-title
 * siblings inherit the anchor's classification. The detector keys on
 * structured tokens only, so this tag IS the signal — which is why the
 * candidate set is human-curated, not heuristic.
 *
 * Usage:
 *   bun run scripts/backfill-standup-comedy-tags.ts            # dry-run (default)
 *   bun run scripts/backfill-standup-comedy-tags.ts --apply    # write
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const APPLY = process.argv.includes('--apply');
const DB_PATH = join(import.meta.dir, '..', 'data', 'events.db');
const TAG = 'Stand-up-comedy';
const STANDUP_TOKEN = /\bstand[- ]?up\b/i;

// Anchor id-prefixes → classification. Same-title siblings inherit.
// named-headliner: single identifiable act with verified registry entry
//                  (config/performer-sameAs.json) → emits performer.
// club-night:      rotating lineup / unverified performer → ComedyEvent
//                  WITHOUT performer (omit > wrong value).
const ANCHORS: Record<string, 'named-headliner' | 'club-night'> = {
  '92682a33': 'named-headliner', // Kevin Bridges - Here if you need me
  '260fc9b4': 'named-headliner', // The Superior Comedy Tour - Mario Adrion
  '32334794': 'named-headliner', // Dara Ó Briain
  '5e8e6c4d': 'named-headliner', // Gabriel "Fluffy" Iglesias: The 1976 Tour
  'ec42e494': 'named-headliner', // Sooshi Mango in Athens (PerformingGroup)
  'ddeebb02': 'club-night',      // Athens English Comedy Club
  'e79f3f64': 'club-night',      // Στάξε το φαρμάκι σου | Snap - Athens Queer Comedy Club
  '074415dc': 'club-night',      // Ξαφνικό stand up στου Φιλοπάππου
  '68930d49': 'club-night',      // Δεν θα πεθάνουμε κιόλας (performer unverified → no entry)
};

// Explicitly excluded — NEVER tag. Reviewed 2026-06-05.
const EXCLUDED_TITLES = new Map<string, string>([
  ['Το πάρτι της ζωής μου',
   'Eleni Rantou one-woman show: description explicitly says "not stand-up and not quite a play" — stays TheaterEvent (648708ce)'],
]);

const db = new Database(DB_PATH);

// Resolve anchor titles, then expand to all same-title rows.
const anchorRows = db.prepare(
  `SELECT id, title FROM events WHERE ${Object.keys(ANCHORS).map(() => 'id LIKE ?').join(' OR ')}`
).all(...Object.keys(ANCHORS).map(p => `${p}%`)) as { id: string; title: string }[];

const titleClass = new Map<string, 'named-headliner' | 'club-night'>();
for (const row of anchorRows) {
  const prefix = row.id.substring(0, 8);
  titleClass.set(row.title, ANCHORS[prefix]);
}

if (titleClass.size !== Object.keys(ANCHORS).length) {
  console.error(`✗ Anchor resolution mismatch: expected ${Object.keys(ANCHORS).length} titles, got ${titleClass.size}.`);
  console.error('  Resolved:', [...titleClass.keys()]);
  process.exit(1);
}

// Guard: an excluded title must never appear in the candidate classification.
for (const title of titleClass.keys()) {
  if (EXCLUDED_TITLES.has(title)) {
    console.error(`✗ Excluded title leaked into candidates: ${title}`);
    process.exit(1);
  }
}

const candidates = db.prepare(
  `SELECT id, type, title, tags, date(start_date) AS day FROM events
   WHERE title IN (${[...titleClass.keys()].map(() => '?').join(',')})
   ORDER BY title, start_date`
).all(...titleClass.keys()) as { id: string; type: string; title: string; tags: string | null; day: string }[];

const counters = { scanned: 0, would_tag: 0, tagged: 0, skipped_already_signaled: 0 };
const updateStmt = db.prepare(`UPDATE events SET tags = ?, updated_at = ? WHERE id = ?`);

console.log(`${APPLY ? '=== APPLY ===' : '=== DRY RUN (no writes) ==='}`);
console.log(`Candidates: ${candidates.length} rows across ${titleClass.size} titles\n`);

const apply = db.transaction(() => {
  for (const row of candidates) {
    counters.scanned++;
    const tags: string[] = JSON.parse(row.tags || '[]');
    const cls = titleClass.get(row.title)!;
    const alreadySignaled = STANDUP_TOKEN.test(row.title) || tags.some(t => STANDUP_TOKEN.test(t));

    if (alreadySignaled) {
      counters.skipped_already_signaled++;
      console.log(`  = ${row.id.substring(0, 8)} [${cls}] ${row.type.padEnd(7)} ${row.day} already-signaled  ${row.title.substring(0, 50)}`);
      continue;
    }

    if (APPLY) {
      tags.push(TAG);
      updateStmt.run(JSON.stringify(tags), new Date().toISOString(), row.id);
      counters.tagged++;
      console.log(`  + ${row.id.substring(0, 8)} [${cls}] ${row.type.padEnd(7)} ${row.day} tagged            ${row.title.substring(0, 50)}`);
    } else {
      counters.would_tag++;
      console.log(`  ~ ${row.id.substring(0, 8)} [${cls}] ${row.type.padEnd(7)} ${row.day} WOULD tag         ${row.title.substring(0, 50)}`);
    }
  }
});
apply();

console.log(`\nExcluded (never tagged):`);
for (const [title, reason] of EXCLUDED_TITLES) console.log(`  ✗ ${title} — ${reason}`);

console.log(`\nCounters:`, counters);
db.close();
