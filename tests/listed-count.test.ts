/**
 * Quality-loop round 2, move 6 — one computed "listed events" count.
 *
 * The site lists selectUpcomingListing(selectPublishedPopulation(all)). The
 * scoreboard and the health report used their own SQL and disagreed with the
 * site (1,142 / 723 vs 365 on 2026-09-23). This pins that both now read the
 * one function, and that the function applies the site's rules — each
 * excluded fixture row exercises one rule a raw SQL count gets wrong.
 *
 * Synthetic temp-file DB only (the prod-db-guard preload forbids data/events.db).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { countListedEvents, countListedEventsInDb, selectListedEvents } from '../src/utils/listed-count';
import { getAllEvents } from '../src/db/database';
import { selectPublishedPopulation, selectUpcomingListing } from '../src/utils/event-populations';
import { isCurrentSql, athensTodaySql } from '../src/db/effective-end-sql';
import { assembleScoreboard, parseHealthReport } from '../scripts/assemble-scoreboard';
import { getListedCount, getDatabaseSummary, formatDatabaseSection } from '../scripts/health-check';

const ROOT = join(import.meta.dir, '..');
const SCHEMA = readFileSync(join(ROOT, 'src', 'db', 'schema.sql'), 'utf-8');

type Seed = { id: string; start: string; end?: string; type?: string; status: string; source?: string; merged?: string; cancelled?: number; created?: string };
const SEED: Seed[] = [
  // Listed (2)
  { id: 'listed-concert',     start: '2099-03-01T20:00:00', status: 'verified_athens' },
  { id: 'listed-exhibition',  start: '2020-01-01', end: '2099-12-31', type: 'exhibition', status: 'pass_through' },
  // Not listed — one rule each
  { id: 'past-concert',       start: '2020-03-01T20:00:00', status: 'verified_athens' },
  { id: 'unverified-venue',   start: '2099-03-02T20:00:00', status: 'unverified' },
  { id: 'non-athens',         start: '2099-03-03T20:00:00', status: 'rejected_non_athens' },
  { id: 'dedup-loser',        start: '2099-03-01T20:00:00', status: 'verified_athens', merged: 'listed-concert' },
  { id: 'cancelled',          start: '2099-03-04T20:00:00', status: 'verified_athens', cancelled: 1 },
  { id: 'rollover-suspect',   start: '2099-03-05T20:00:00', status: 'verified_athens', source: 'athinorama.gr', created: '2026-01-01T00:00:00Z' },
];
const EXPECTED_LISTED = 2;

let work: string;
let dbPath: string;
let reportsDir: string;

function seedDb(path: string): void {
  const db = new Database(path);
  db.exec(SCHEMA);
  const ins = db.prepare(`
    INSERT INTO events (id, title, start_date, end_date, type, venue_name, price_type, source, merged_into,
                        is_cancelled, location_status, created_at, updated_at)
    VALUES ($id, $title, $start, $end, $type, 'Fixture Venue', 'open', $source, $merged,
            $cancelled, $status, $created, $created)
  `);
  for (const s of SEED) {
    ins.run({
      $id: s.id, $title: `Title ${s.id}`, $start: s.start, $end: s.end ?? null, $type: s.type ?? 'concert',
      $source: s.source ?? 'fixture', $merged: s.merged ?? null, $cancelled: s.cancelled ?? 0,
      $status: s.status, $created: s.created ?? '2098-12-01T00:00:00Z',
    });
  }
  ins.finalize();
  db.close();
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'aa-listed-count-'));
  dbPath = join(work, 'events.db');
  reportsDir = join(work, 'health-reports');
  mkdirSync(reportsDir);
  seedDb(dbPath);
  writeFileSync(join(reportsDir, '2026-09-23.txt'), [
    'AGENT ATHENS HEALTH REPORT - 2026-09-23',
    'SCRAPING',
    '  v fixture              8 events (same)',
    'DATABASE',
    ...formatDatabaseSection({ total: 8, visible: 5, hidden: 3 }, EXPECTED_LISTED),
    '',
  ].join('\n'));
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('fixture preconditions (each excluded row must be one a raw SQL count keeps)', () => {
  test('the SQL "visible upcoming" population over-counts this fixture', () => {
    const db = new Database(dbPath, { readonly: true });
    const sqlVisible = (db.prepare(`SELECT COUNT(*) AS n FROM events
      WHERE location_status IN ('verified_athens','pass_through') AND merged_into IS NULL AND ${isCurrentSql()}`)
      .get({ $today: athensTodaySql() }) as { n: number }).n;
    const rows = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
    db.close();
    expect(rows).toBe(SEED.length);
    // cancelled + rollover suspect are current publishable live rows by SQL, not listed by the site
    expect(sqlVisible).toBe(EXPECTED_LISTED + 2);
  });

  test('the rollover row really is a rollover suspect (>300 days after first scrape)', () => {
    const r = SEED.find(s => s.id === 'rollover-suspect')!;
    expect((Date.parse(r.start) - Date.parse(r.created!)) / 86_400_000).toBeGreaterThan(300);
  });
});

describe('countListedEvents — the site listing rules, reused not reimplemented', () => {
  test('counts exactly the listed rows', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(countListedEvents(getAllEvents(db))).toBe(EXPECTED_LISTED);
      expect(countListedEventsInDb(db)).toBe(EXPECTED_LISTED);
    } finally { db.close(); }
  });

  test('equals the build pipeline composition generate-site.ts uses', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const all = getAllEvents(db);
      const now = new Date();
      expect(countListedEvents(all, now)).toBe(selectUpcomingListing(selectPublishedPopulation(all).events, now).length);
    } finally { db.close(); }
  });
});

describe('llms.txt wiring: the build hands generateLLMsTxt the already-listed population', () => {
  test('counting an already-listed population returns its length (the function is idempotent)', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const now = new Date();
      const listed = selectListedEvents(getAllEvents(db), now);
      expect(listed.length).toBe(EXPECTED_LISTED);
      expect(countListedEvents(listed, now)).toBe(listed.length);
    } finally { db.close(); }
  });
});

describe('scoreboard and health report agree on the listed count', () => {
  test('scoreboard listed_events, health-check getListedCount and the shared function are one number', () => {
    const sb = assembleScoreboard({ dbPath, reportsDir, outPath: join(work, 'scoreboard.json'), today: '2026-09-23' });
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(sb.listed_events).toBe(EXPECTED_LISTED);
      expect(getListedCount(db)).toBe(EXPECTED_LISTED);
      expect(countListedEventsInDb(db)).toBe(EXPECTED_LISTED);
    } finally { db.close(); }
  });

  test('scoreboard keeps its other counts, which are not the listed count', () => {
    const sb = assembleScoreboard({ dbPath, reportsDir, outPath: join(work, 'scoreboard.json'), today: '2026-09-23' });
    expect(sb.total_events).toBe(SEED.length - 1); // live rows (loser excluded)
    expect(sb.upcoming_events).toBeGreaterThan(sb.listed_events);
  });

  test('health report DATABASE section leads with the listed count and labels the row counts', () => {
    const lines = formatDatabaseSection({ total: 19633, visible: 723, hidden: 18910 }, 365);
    expect(lines[0]).toBe('  Listed events (what the site lists): 365');
    expect(lines.join('\n')).not.toMatch(/\bVisible\b/);
    const parsed = parseHealthReport(['DATABASE', ...lines].join('\n'), 'x.txt');
    expect(parsed.database).toEqual({ total: 19633, visible: 723, hidden: 18910, new_unverified_venues: 0 });
  });

  test('health-check row summary still reports the raw and publishable-current row counts', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      const s = getDatabaseSummary(db);
      expect(s.total).toBe(SEED.length);
      expect(s.visible).toBe(EXPECTED_LISTED + 2);
    } finally { db.close(); }
  });
});
