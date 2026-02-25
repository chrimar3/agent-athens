-- Migration 005: Add image_url and image_source fields
-- Required by: Image Enrichment Pipeline
-- Date: 2026-02-25

-- ============================================================================
-- IMAGE URL TRACKING
-- ============================================================================
-- Stores hotlinked og:image URLs extracted from event source pages.
-- image_source tracks provenance:
-- - 'scraped_listing': Image found in listing page during main scrape
-- - 'scraped_detail': Image extracted from detail page by enrichment script
-- - 'backfill': Image added by backfill script
-- - 'not_found': Source page fetched but no suitable image found
-- - NULL: Not yet processed

ALTER TABLE events ADD COLUMN image_url TEXT;
ALTER TABLE events ADD COLUMN image_source TEXT;

-- ============================================================================
-- INDEX FOR FINDING EVENTS MISSING IMAGES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_image_source ON events(image_source);
