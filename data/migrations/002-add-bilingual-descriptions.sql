-- Migration 002: Add Bilingual Description Columns
-- Purpose: Support both English and Greek descriptions for all events
-- Date: November 4, 2025

-- Add bilingual description columns
ALTER TABLE events ADD COLUMN full_description_en TEXT;
ALTER TABLE events ADD COLUMN full_description_gr TEXT;

-- Add language preference column (for future use)
ALTER TABLE events ADD COLUMN language_preference TEXT DEFAULT 'both'; -- 'en'|'gr'|'both'

-- Create indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_events_description_en ON events(full_description_en);
CREATE INDEX IF NOT EXISTS idx_events_description_gr ON events(full_description_gr);

-- Migrate existing full_description to full_description_en (most are English)
-- Note: This assumes existing descriptions are primarily English
-- Events with Greek descriptions will need manual review
UPDATE events
SET full_description_en = full_description
WHERE full_description IS NOT NULL
  AND full_description != ''
  AND full_description_en IS NULL;

-- Mark events that have been migrated
UPDATE events
SET updated_at = datetime('now')
WHERE full_description IS NOT NULL AND full_description != '';

-- Add comment about migration
-- The old full_description column is kept for backward compatibility
-- New enrichment scripts should populate full_description_en and full_description_gr
-- Once all events are migrated, full_description can be deprecated

SELECT
  COUNT(*) as total_events,
  COUNT(full_description) as has_old_description,
  COUNT(full_description_en) as has_english,
  COUNT(full_description_gr) as has_greek
FROM events;
