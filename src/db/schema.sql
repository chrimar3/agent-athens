-- agent-athens Database Schema
-- SQLite database for Athens cultural events

CREATE TABLE IF NOT EXISTS events (
  -- Core identification
  id TEXT PRIMARY KEY,                    -- Generated from title+date+venue hash
  title TEXT NOT NULL,
  description TEXT,
  full_description TEXT,                  -- Rich 400-500 word description for AI

  -- Temporal data
  start_date TEXT NOT NULL,               -- ISO 8601 datetime
  end_date TEXT,                          -- For multi-day events

  -- Event classification
  type TEXT NOT NULL,                     -- concert|exhibition|cinema|theater|performance|workshop|other
  genres TEXT,                            -- JSON array of genres
  tags TEXT,                              -- JSON array of tags

  -- Venue information
  venue_name TEXT NOT NULL,
  venue_address TEXT,
  venue_neighborhood TEXT,
  venue_lat REAL,
  venue_lng REAL,
  venue_capacity INTEGER,

  -- Pricing
  price_type TEXT NOT NULL,               -- free|paid|donation
  price_amount REAL,
  price_currency TEXT DEFAULT 'EUR',
  price_range TEXT,                       -- e.g., "€10-€20"

  -- External references
  url TEXT,                               -- Event page URL
  source TEXT NOT NULL,                   -- newsletter|this-is-athens|snfcc|etc

  -- AI context (JSON)
  ai_context TEXT,                        -- JSON: {mood, audience, similarTo, vibe, etc}

  -- Schema.org compliance
  schema_json TEXT,                       -- Full Schema.org Event object as JSON

  -- Metadata
  created_at TEXT NOT NULL,               -- When first added to DB
  updated_at TEXT NOT NULL,               -- Last modification
  scraped_at TEXT,                        -- When last scraped from source

  -- Tracking
  is_cancelled INTEGER DEFAULT 0,         -- Boolean: event cancelled
  is_featured INTEGER DEFAULT 0,          -- Boolean: promoted event
  view_count INTEGER DEFAULT 0,           -- Track popularity

  -- Image fields
  image_url TEXT,                         -- og:image URL from source page (hotlinked)
  image_source TEXT,                      -- 'scraped_listing' | 'scraped_detail' | 'backfill' | 'not_found'

  -- Exhibition-specific fields
  opening_hours TEXT,                     -- JSON: {"mon": "closed", "tue": "10:00-18:00", ...}
  closed_days TEXT,                       -- "Monday" or "Monday, Tuesday"
  permanent_collection INTEGER DEFAULT 0  -- Boolean: permanent vs temporary exhibition
);

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_price_type ON events(price_type);
CREATE INDEX IF NOT EXISTS idx_venue_name ON events(venue_name);
CREATE INDEX IF NOT EXISTS idx_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_is_cancelled ON events(is_cancelled);

-- Index for genre searches (though genres is JSON array)
CREATE INDEX IF NOT EXISTS idx_genres ON events(genres);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_type_date ON events(type, start_date);
CREATE INDEX IF NOT EXISTS idx_price_date ON events(price_type, start_date);
CREATE INDEX IF NOT EXISTS idx_type_price_date ON events(type, price_type, start_date);

-- Exhibition-specific index for "currently open" queries
CREATE INDEX IF NOT EXISTS idx_exhibition_dates ON events(type, start_date, end_date) WHERE type = 'exhibition';

-- Full-text search index for titles and descriptions
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  title,
  description,
  full_description,
  venue_name,
  content=events,
  content_rowid=rowid
);

-- Trigger to keep FTS index updated
CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, title, description, full_description, venue_name)
  VALUES (new.rowid, new.title, new.description, new.full_description, new.venue_name);
END;

CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
  UPDATE events_fts SET
    title = new.title,
    description = new.description,
    full_description = new.full_description,
    venue_name = new.venue_name
  WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
  DELETE FROM events_fts WHERE rowid = old.rowid;
END;

-- Table for tracking scraping statistics
CREATE TABLE IF NOT EXISTS scrape_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  events_found INTEGER DEFAULT 0,
  events_new INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  duration_ms INTEGER,
  success INTEGER DEFAULT 1,
  error_message TEXT
);

-- Table for tracking site generation stats
CREATE TABLE IF NOT EXISTS generation_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  total_events INTEGER,
  pages_generated INTEGER,
  build_duration_ms INTEGER,
  deploy_success INTEGER DEFAULT 0
);

-- Table for deduplication merge audit log
-- Each row records one merge: winner absorbed loser's best fields, then loser was deleted.
-- loser_snapshot contains the full row JSON for undo.
CREATE TABLE IF NOT EXISTS dedup_merges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  winner_id TEXT NOT NULL,
  loser_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  match_layer TEXT NOT NULL,
  match_reason TEXT,
  fields_merged TEXT,           -- JSON array of field names that were updated
  loser_snapshot TEXT,          -- Full JSON of deleted record for undo
  merged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- Enrichment v4 Tables
-- ============================================================================

-- Enrichment log: tracks every description change with before/after snapshots.
-- Base columns created by earlier migration; v4 adds: description_before,
-- description_after, batch_number, session_id, quality_score, quality_issues,
-- tags_applied. Use ALTER TABLE to add these to existing production table.
-- NOTE: enrichment_log is created via migration scripts, not here, because
-- production already has the table. This comment documents the full schema.

-- Entity knowledge: reusable research about artists, venues, festivals, promoters.
-- Broader than artist_info (which remains as legacy with 2 rows).
-- canonical_name is lowercased for case-insensitive matching.
CREATE TABLE IF NOT EXISTS entity_knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,          -- 'artist' | 'venue' | 'festival' | 'promoter'
  name TEXT NOT NULL,
  canonical_name TEXT,                -- lowercased for matching
  bio TEXT,
  genre TEXT,                         -- JSON array
  notable_works TEXT,
  career_highlights TEXT,
  active_since INTEGER,
  athens_context TEXT,                -- Athens-specific notes
  fun_facts TEXT,
  source TEXT,
  source_url TEXT,
  confidence TEXT DEFAULT 'medium',   -- 'high' | 'medium' | 'low'
  last_verified TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(entity_type, canonical_name)
);

CREATE INDEX IF NOT EXISTS idx_ek_type_name ON entity_knowledge(entity_type, canonical_name);

-- Knowledge feedback: corrections, additions, staleness reports for entity data.
-- Processed flag tracks whether feedback has been applied to the entity record.
CREATE TABLE IF NOT EXISTS knowledge_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER REFERENCES entity_knowledge(id),
  event_id TEXT,
  session_id TEXT,
  feedback_type TEXT NOT NULL,       -- 'correction' | 'addition' | 'stale'
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  processed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
