-- 008: Add CHECK(genres IS NULL OR json_valid(genres)) to events table.
-- S97a maintenance batch (2026-04-28).
--
-- SQLite cannot ALTER TABLE ... ADD CHECK; recreation is required.
-- FTS5-aware: events_fts uses content=events,content_rowid=rowid; ALTER TABLE
-- RENAME would break the external-content link, so we drop & rebuild FTS5
-- inside this transaction.
--
-- Pre-flight (verified 2026-04-28 before this migration was authored):
--   - 11,751 of 12,539 events rows have genres='' (empty string), which is
--     NOT NULL and NOT valid JSON. They would fail the CHECK constraint as
--     written. Step 0 normalizes them to '[]' (valid empty JSON array,
--     semantically identical to "no genres"). Initial S97a v3 plan + audit
--     missed this because their pre-flight queries filtered `genres != ''`.
--   - After normalization, 0 rows fail the CHECK.
--   - No triggers on events: SELECT name FROM sqlite_master WHERE type='trigger'
--                            AND tbl_name='events'  → empty
--   - 61 columns; 21 indices; 1 FTS5 virtual table (content=events).
--   - Pre-migration row count captured for parity check: see commit log.
--
-- The migration runner (scripts/run-migrations.ts) wraps this whole file in
-- BEGIN/COMMIT, so no transaction blocks here. VACUUM is run separately
-- after the runner finishes (VACUUM cannot be inside a transaction).

-- Step 0: Normalize empty-string genres to '[]' (valid JSON empty array).
-- This is required before the CHECK constraint can be enforced. '' fails
-- json_valid() but '[]' passes. Behaviorally equivalent for consumers:
--   - JSON.parse('[]') === []  (vs '' which throws SyntaxError)
--   - .length === 0, .includes(x) === false (correct "no genres" semantics)
--   - existing rich-data rows (788 valid-JSON rows) untouched.
UPDATE events SET genres = '[]' WHERE genres = '';

-- Step 1: Drop FTS5 (cascades to events_fts_data, _idx, _docsize, _config).
DROP TABLE events_fts;

-- Step 2: Rename events to events_old.
ALTER TABLE events RENAME TO events_old;

-- Step 3: Recreate events with CHECK constraint.
-- Column list reconstructed from PRAGMA table_info(events) on 2026-04-28
-- (61 columns total, indices 0..60).
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
  ticket_url_source TEXT,
  CHECK (genres IS NULL OR json_valid(genres))
);

-- Step 4: Copy data. Column order in the new events table mirrors PRAGMA
-- table_info(events_old) exactly, so SELECT * is safe. (Verified by post-flight
-- row count parity test in the verification block.)
INSERT INTO events SELECT * FROM events_old;

-- Step 5: Drop the old shell.
DROP TABLE events_old;

-- Step 6: Recreate all 21 indices (captured verbatim 2026-04-28 from
-- sqlite_master before the migration; multi-line CREATE INDEX statements
-- normalized to single-line for readability).
CREATE INDEX idx_start_date ON events(start_date);
CREATE INDEX idx_type ON events(type);
CREATE INDEX idx_price_type ON events(price_type);
CREATE INDEX idx_venue_name ON events(venue_name);
CREATE INDEX idx_source ON events(source);
CREATE INDEX idx_is_cancelled ON events(is_cancelled);
CREATE INDEX idx_genres ON events(genres);
CREATE INDEX idx_type_date ON events(type, start_date);
CREATE INDEX idx_price_date ON events(price_type, start_date);
CREATE INDEX idx_type_price_date ON events(type, price_type, start_date);
CREATE INDEX idx_events_description_en ON events(full_description_en);
CREATE INDEX idx_events_description_gr ON events(full_description_gr);
CREATE INDEX idx_events_location_status ON events(location_status);
CREATE INDEX idx_events_needs_enrichment ON events(needs_enrichment);
CREATE INDEX idx_exhibition_dates ON events(type, start_date, end_date) WHERE type = 'exhibition';
CREATE INDEX idx_enrichment_tier ON events(enrichment_tier);
CREATE INDEX idx_door_policy ON events(door_policy);
CREATE INDEX idx_ticket_status ON events(ticket_url_status);
CREATE INDEX idx_time_source ON events(time_source);
CREATE INDEX idx_image_source ON events(image_source);
CREATE INDEX idx_ticket_url_resolved_at ON events(ticket_url_resolved_at);

-- Step 7: Recreate FTS5 virtual table (DDL captured verbatim from sqlite_master).
CREATE VIRTUAL TABLE events_fts USING fts5(
  title,
  description,
  full_description,
  venue_name,
  content=events,
  content_rowid=rowid
);

-- Step 8: Rebuild FTS5 index from events. SQLite FTS5 supports the 'rebuild'
-- command on the contentful FTS table to populate the index from its content
-- table.
INSERT INTO events_fts(events_fts) VALUES('rebuild');
