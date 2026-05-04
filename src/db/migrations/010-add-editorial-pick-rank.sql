-- Migration 010: Add editorial_pick_rank column
-- Required by: S101a editorial picks infrastructure
-- Date: 2026-05-04
--
-- editorial_pick_rank is a denormalized cache of the editorial pick rank that
-- lives canonically in config/editorial-content.json (featuredEvents map).
-- The JSON file is the source of truth; this column exists for query convenience
-- (sort/filter events by rank, or join picks into hub queries without re-parsing
-- the JSON every time).
--
-- DECISION TREE (resolved 2026-05-04 from S101a discovery report):
-- The originally-spec'd composite unique constraint on
--   (hub_slug, locale, week_starting, editorial_pick_rank)
-- is NOT possible: none of hub_slug/locale/week_starting exist on the events
-- table, and adding them is out of scope for picks infrastructure (they would
-- be a much larger schema change unrelated to this work).
--
-- Picks are scoped per editorial-content.json entry, which is keyed by event_id
-- alone. An event can only be in one editorial window at a time (validFrom/
-- validUntil), so uniqueness within a window is enforced JSON-side. The DB
-- column is therefore non-unique and indexed only as a partial index where
-- the rank IS NOT NULL — the index stays small since most rows have NULL.
--
-- Population: out of S101a scope. S101b will define the sync mechanism
-- (sync at build-time from JSON, or runtime lookup, or backfill script).

ALTER TABLE events ADD COLUMN editorial_pick_rank INTEGER;

CREATE INDEX IF NOT EXISTS idx_editorial_pick_rank
  ON events(editorial_pick_rank)
  WHERE editorial_pick_rank IS NOT NULL;
