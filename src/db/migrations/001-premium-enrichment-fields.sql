-- Migration 001: Add premium enrichment fields (missing columns only)
-- Required by: PRD v2, Master Enrichment Template
-- Date: 2026-01-26

-- ============================================================================
-- TIMING & DOOR POLICY
-- ============================================================================

ALTER TABLE events ADD COLUMN time_peak TEXT;
ALTER TABLE events ADD COLUMN time_doors TEXT;
ALTER TABLE events ADD COLUMN door_policy TEXT;
ALTER TABLE events ADD COLUMN door_policy_note TEXT;

-- ============================================================================
-- PRICE TRACKING (extended)
-- ============================================================================

ALTER TABLE events ADD COLUMN price_advance REAL;
ALTER TABLE events ADD COLUMN price_door REAL;
ALTER TABLE events ADD COLUMN price_source TEXT;

-- ============================================================================
-- TICKETING
-- ============================================================================

ALTER TABLE events ADD COLUMN ticket_url TEXT;
ALTER TABLE events ADD COLUMN ticket_url_status TEXT;

-- ============================================================================
-- ENRICHMENT TRACKING (extended)
-- ============================================================================

ALTER TABLE events ADD COLUMN enrichment_tier TEXT DEFAULT 'stub';
ALTER TABLE events ADD COLUMN schema_valid INTEGER DEFAULT 0;

-- ============================================================================
-- VENUE EXTENDED DATA
-- ============================================================================

ALTER TABLE events ADD COLUMN venue_metro_station TEXT;
ALTER TABLE events ADD COLUMN venue_metro_line TEXT;

-- ============================================================================
-- NEW INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_enrichment_tier ON events(enrichment_tier);
CREATE INDEX IF NOT EXISTS idx_door_policy ON events(door_policy);
CREATE INDEX IF NOT EXISTS idx_ticket_status ON events(ticket_url_status);
