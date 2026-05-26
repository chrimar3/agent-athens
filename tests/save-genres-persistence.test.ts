/**
 * Regression test for the P0 save-drop bug (2026-05-27).
 *
 * The events table has exactly one CHECK constraint:
 *   CHECK (genres IS NULL OR json_valid(genres))
 * Scrapers emitted genres: '' (empty string) and bare strings ('visual-arts'),
 * which are NOT valid JSON, so every such INSERT threw and was silently swallowed
 * by saveEvents' catch — dropping ~75% of scraped events (538 found -> 129 saved).
 *
 * IMPORTANT: this test builds its events table from the LIVE PRODUCTION DDL, not
 * src/db/schema.sql. schema.sql has drifted from prod (it lacks the genres CHECK
 * and several columns the INSERT writes), so loading it would test a fiction —
 * it would neither enforce the constraint that caused the drop nor have the columns.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { normalizeGenres } from '../src/db/database';
import { saveEvents } from '../scripts/scrape-all';

// Exact production DDL for the events table, captured via:
//   sqlite3 data/events.db ".schema events"
// The trailing `CHECK (genres IS NULL OR json_valid(genres))` is the constraint under test.
const PROD_EVENTS_DDL = `
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  full_description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  type TEXT NOT NULL,
  genres TEXT,
  tags TEXT,
  venue_name TEXT NOT NULL,
  venue_address TEXT,
  venue_neighborhood TEXT,
  venue_lat REAL,
  venue_lng REAL,
  venue_capacity INTEGER,
  price_type TEXT NOT NULL,
  price_amount REAL,
  price_currency TEXT DEFAULT 'EUR',
  price_range TEXT,
  url TEXT,
  source TEXT NOT NULL,
  ai_context TEXT,
  schema_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scraped_at TEXT,
  is_cancelled INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  dedup_protected INTEGER DEFAULT 0,
  dedup_reason TEXT,
  full_description_en TEXT,
  full_description_gr TEXT,
  language_preference TEXT DEFAULT 'both',
  source_full_description TEXT,
  all_day INTEGER DEFAULT 0,
  location_status TEXT DEFAULT 'unverified',
  needs_enrichment INTEGER DEFAULT 1,
  enriched_at TEXT,
  opening_hours TEXT,
  closed_days TEXT,
  permanent_collection INTEGER DEFAULT 0,
  time_peak TEXT,
  time_doors TEXT,
  door_policy TEXT,
  door_policy_note TEXT,
  price_advance REAL,
  price_door REAL,
  price_source TEXT,
  ticket_url TEXT,
  ticket_url_status TEXT,
  enrichment_tier TEXT DEFAULT 'stub',
  schema_valid INTEGER DEFAULT 0,
  venue_metro_station TEXT,
  venue_metro_line TEXT,
  time_source TEXT,
  image_url TEXT,
  image_source TEXT,
  image_local TEXT,
  ticket_url_resolved_at TEXT,
  ticket_url_source TEXT, ticket_url_resolved TEXT DEFAULT NULL, editorial_pick_rank INTEGER,
  CHECK (genres IS NULL OR json_valid(genres))
)
`;

function createProdSchemaDB(): Database {
  const db = new Database(':memory:');
  db.run(PROD_EVENTS_DDL);
  return db;
}

/** A clearly in-scope, future-dated concert so scope/seasonal filters don't drop it. */
function makeScrapedEvent(overrides: Record<string, any> = {}): any {
  return {
    id: 'test-genres-empty',
    title: 'Test Concert Persistence Probe',
    description: 'A live music concert used to verify save-path persistence.',
    start_date: '2026-12-01',
    time: '21:00',
    type: 'concert',
    genres: '',                       // the previously-dropped case
    venue_name: 'Gagarin 205',
    url: 'https://example.com/test-event',
    price_type: 'with-ticket',
    price_amount: null,
    price_range: null,
    source: 'test-source',
    location_status: 'verified_athens',
    ...overrides,
  };
}

describe('normalizeGenres (unit)', () => {
  // Every value a scraper is known to emit must come out as valid JSON AND a JSON array.
  const cases: Array<[string, string | null | undefined]> = [
    ['empty string', ''],
    ['whitespace', '   '],
    ['bare string visual-arts', 'visual-arts'],
    ['bare string film', 'film'],
    ['valid array electronic', '["electronic"]'],
    ['valid array jazz', '["jazz"]'],
    ['valid multi array', '["Art", "Contemporary"]'],
    ['null', null],
    ['undefined', undefined],
  ];

  for (const [label, input] of cases) {
    test(`'${label}' -> valid JSON array`, () => {
      const out = normalizeGenres(input);
      // Must satisfy the CHECK: json-parseable...
      const parsed = JSON.parse(out);
      // ...and an array (matches the column's documented semantics + rowToEvent's JSON.parse).
      expect(Array.isArray(parsed)).toBe(true);
    });
  }

  test('already-valid JSON arrays are preserved (no-op for passing values)', () => {
    expect(normalizeGenres('["electronic"]')).toBe('["electronic"]');
    expect(normalizeGenres('["jazz"]')).toBe('["jazz"]');
  });

  test('empty/null collapse to empty array', () => {
    expect(normalizeGenres('')).toBe('[]');
    expect(normalizeGenres(null)).toBe('[]');
    expect(normalizeGenres(undefined)).toBe('[]');
  });

  test('bare non-JSON string is wrapped into a single-element array', () => {
    expect(normalizeGenres('visual-arts')).toBe('["visual-arts"]');
  });
});

describe('genres CHECK constraint (reproduces the bug)', () => {
  let db: Database;
  beforeEach(() => { db = createProdSchemaDB(); });
  afterEach(() => { db.close(); });

  test("raw INSERT with genres='' is REJECTED by the CHECK (this is the silent-drop cause)", () => {
    const insert = () => db.prepare(
      `INSERT INTO events (id, title, start_date, type, genres, venue_name, price_type, source, created_at, updated_at)
       VALUES ('x','t','2026-12-01','concert','', 'v','with-ticket','s', datetime('now'), datetime('now'))`
    ).run();
    expect(insert).toThrow();
  });

  test("raw INSERT with normalized genres ('[]') SUCCEEDS", () => {
    const insert = () => db.prepare(
      `INSERT INTO events (id, title, start_date, type, genres, venue_name, price_type, source, created_at, updated_at)
       VALUES ('x','t','2026-12-01','concert','[]','v','with-ticket','s', datetime('now'), datetime('now'))`
    ).run();
    expect(insert).not.toThrow();
  });
});

describe('saveEvents persists previously-dropped events (the fix)', () => {
  let db: Database;
  beforeEach(() => { db = createProdSchemaDB(); });
  afterEach(() => { db.close(); });

  test("an event with genres='' now PERSISTS (was silently dropped)", () => {
    const result = saveEvents([makeScrapedEvent({ genres: '' })], false, db);

    expect(result.failed).toBe(0);
    expect(result.saved).toBe(1);

    const row = db.prepare('SELECT genres FROM events WHERE source = ?').get('test-source') as { genres: string } | undefined;
    expect(row).toBeDefined();
    // Stored genres must be valid JSON (satisfies the CHECK) — normalized to an empty array.
    expect(row!.genres).toBe('[]');
    expect(Array.isArray(JSON.parse(row!.genres))).toBe(true);
  });

  test('an event with already-valid genres still persists unchanged', () => {
    const result = saveEvents([makeScrapedEvent({ id: 'test-genres-valid', genres: '["jazz"]' })], false, db);
    expect(result.saved).toBe(1);
    expect(result.failed).toBe(0);
    const row = db.prepare('SELECT genres FROM events WHERE id = ?').get('test-genres-valid') as { genres: string };
    expect(row.genres).toBe('["jazz"]');
  });
});
