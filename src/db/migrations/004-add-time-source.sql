-- Migration 004: Add time_source tracking field
-- Required by: Time Enrichment Pipeline
-- Date: 2026-02-11

-- ============================================================================
-- TIME SOURCE TRACKING
-- ============================================================================
-- Track where time data came from:
-- - 'scraped_listing': Time found in listing page during main scrape
-- - 'scraped_detail': Time extracted from detail page by enrichment script
-- - NULL: No time data available

ALTER TABLE events ADD COLUMN time_source TEXT;

-- ============================================================================
-- INDEX FOR FINDING EVENTS MISSING TIME
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_time_source ON events(time_source);
