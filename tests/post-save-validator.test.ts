import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  findUrlSiblingGroups,
  electSurvivor,
  collapseGroups,
  extractProposedDate,
} from '../scripts/post-save-validator';

// Fixture: the Βάκχες shape — one production, three per-scrape-day rows
// sharing the athinorama slug, one of them enriched; plus an unrelated event
// and an already-merged pair. Preconditions asserted: the sibling rows
// genuinely share a slug; the merged row is genuinely pre-merged.
function fixtureDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE events (
    id TEXT PRIMARY KEY, title TEXT, url TEXT, source TEXT,
    start_date TEXT, end_date TEXT, type TEXT,
    full_description TEXT, created_at TEXT, merged_into TEXT, merged_at TEXT, updated_at TEXT)`);
  db.run(`CREATE TABLE dedup_merges (id INTEGER PRIMARY KEY AUTOINCREMENT,
    winner_id TEXT NOT NULL, loser_id TEXT NOT NULL, confidence REAL NOT NULL,
    match_layer TEXT NOT NULL, match_reason TEXT, fields_merged TEXT,
    loser_snapshot TEXT, merged_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const ins = db.prepare(
    `INSERT INTO events (id,title,url,source,start_date,type,full_description,created_at,merged_into) VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  const URL = 'https://www.athinorama.gr/theatre/performance/bakxes-10091044/';
  ins.run('bak-1', 'Βάκχες', URL, 'athinorama.gr', '2026-08-09', 'theater', null, '2026-08-09T08:00:00', null);
  ins.run('bak-2', 'Βάκχες', URL, 'athinorama.gr', '2026-08-10', 'theater', 'A genuinely enriched description, comfortably past the fifty-character enrichment floor used across the project.', '2026-08-10T08:00:00', null);
  ins.run('bak-3', 'Βάκχες', URL, 'athinorama.gr', '2026-08-11', 'theater', null, '2026-08-11T08:00:00', null);
  ins.run('solo', 'Άλλο έργο', 'https://www.athinorama.gr/theatre/performance/allo-10099999/', 'athinorama.gr', '2026-09-01', 'theater', null, '2026-08-11T08:00:00', null);
  ins.run('old-w', 'Παλιό', 'https://www.athinorama.gr/theatre/performance/palio-10011111/', 'athinorama.gr', '2026-07-01', 'theater', null, '2026-07-01T08:00:00', null);
  ins.run('old-l', 'Παλιό', 'https://www.athinorama.gr/theatre/performance/palio-10011111/', 'athinorama.gr', '2026-07-02', 'theater', null, '2026-07-02T08:00:00', 'old-w');
  return db;
}

describe('URL-sibling collapse', () => {
  test('fixture precondition: three live siblings share the slug; one pair pre-merged', () => {
    const db = fixtureDb();
    const live = db.query(`SELECT COUNT(*) c FROM events WHERE url LIKE '%bakxes-10091044%' AND merged_into IS NULL`).get() as { c: number };
    expect(live.c).toBe(3);
    // Enriched-survivor precondition: bak-2's description must clear the
    // 50-char floor or the election test goes vacuous (first version: 29 chars).
    const desc = db.query(`SELECT length(full_description) l FROM events WHERE id='bak-2'`).get() as { l: number };
    expect(desc.l).toBeGreaterThan(50);
    const merged = db.query(`SELECT COUNT(*) c FROM events WHERE merged_into IS NOT NULL`).get() as { c: number };
    expect(merged.c).toBe(1);
  });

  test('finds exactly the live bakxes group (solo + pre-merged excluded)', () => {
    const groups = findUrlSiblingGroups(fixtureDb());
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id).sort()).toEqual(['bak-1', 'bak-2', 'bak-3']);
  });

  test('survivor election prefers the enriched row (Vector C: never the stale oldest)', () => {
    const groups = findUrlSiblingGroups(fixtureDb());
    // bak-2 is enriched; bak-3 is newer but unenriched; bak-1 oldest.
    expect(electSurvivor(groups[0].rows).id).toBe('bak-2');
  });

  test('among non-enriched rows the NEWEST wins (Vector C), not the oldest', () => {
    const rows = [
      { id: 'a', url: 'u', full_description: null, created_at: '2026-08-01T08:00:00' },
      { id: 'b', url: 'u', full_description: null, created_at: '2026-08-11T08:00:00' },
    ];
    expect(electSurvivor(rows).id).toBe('b');
  });

  test('among several enriched rows the NEWEST enriched wins (latest hand-verified dates)', () => {
    const desc = 'A genuinely enriched description, comfortably past the fifty-character enrichment floor.';
    const rows = [
      { id: 'old-e', url: 'u', full_description: desc, created_at: '2026-07-01T08:00:00' },
      { id: 'new-e', url: 'u', full_description: desc, created_at: '2026-08-10T08:00:00' },
      { id: 'newer-plain', url: 'u', full_description: null, created_at: '2026-08-11T08:00:00' },
    ];
    expect(electSurvivor(rows).id).toBe('new-e');
  });

  test('collapse marks losers reversibly and logs dedup_merges', () => {
    const db = fixtureDb();
    const n = collapseGroups(db, findUrlSiblingGroups(db), false);
    expect(n).toBe(2); // bak-1, bak-3
    const losers = db.query(`SELECT id, merged_into FROM events WHERE merged_into IS NOT NULL AND id LIKE 'bak%'`).all() as Array<{ id: string; merged_into: string }>;
    expect(losers.every((l) => l.merged_into === 'bak-2')).toBe(true);
    const audit = db.query(`SELECT COUNT(*) c FROM dedup_merges WHERE match_layer='url-sibling'`).get() as { c: number };
    expect(audit.c).toBe(2);
  });

  test('idempotent: second run collapses nothing', () => {
    const db = fixtureDb();
    collapseGroups(db, findUrlSiblingGroups(db), false);
    expect(collapseGroups(db, findUrlSiblingGroups(db), false)).toBe(0);
  });

  test('dry-run plans but writes nothing', () => {
    const db = fixtureDb();
    const n = collapseGroups(db, findUrlSiblingGroups(db), true);
    expect(n).toBe(2);
    const merged = db.query(`SELECT COUNT(*) c FROM events WHERE merged_into IS NOT NULL`).get() as { c: number };
    expect(merged.c).toBe(1); // only the pre-merged fixture row
  });
});

describe('extractProposedDate', () => {
  test('ISO date in prose', () => {
    expect(extractProposedDate('post-save validator should correct to 2026-09-02', 2026)).toBe('2026-09-02');
  });

  test('English day-month abbreviation with context year', () => {
    expect(extractProposedDate('true night Sun 30 Aug 21:15', 2026)).toBe('2026-08-30');
  });

  test('no date → null', () => {
    expect(extractProposedDate('venue mismatch, needs research', 2026)).toBeNull();
  });
});
