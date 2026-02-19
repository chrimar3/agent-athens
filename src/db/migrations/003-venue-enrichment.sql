-- Migration 003: Venue Enrichment
-- Adds columns to venue_context for enriched venue information
-- NOTE: Only adds columns that don't exist. Run after checking schema.

-- Add enrichment-specific columns to venue_context
ALTER TABLE venue_context ADD COLUMN getting_there TEXT;
ALTER TABLE venue_context ADD COLUMN what_to_expect TEXT;
ALTER TABLE venue_context ADD COLUMN good_to_know TEXT;
ALTER TABLE venue_context ADD COLUMN enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE venue_context ADD COLUMN enriched_at TEXT;

-- Mark existing descriptions as completed
UPDATE venue_context
SET enrichment_status = 'completed',
    enriched_at = datetime('now')
WHERE description IS NOT NULL AND description != '';
