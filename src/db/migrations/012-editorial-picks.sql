-- Migration 012 — S101a-1 editorial picks table (cornerstone foundation)
--
-- Replaces the denormalized rank cache from Migration 010 with a normalized
-- per-week, per-hub, per-locale picks table. Migration 010's
-- events.editorial_pick_rank column was scaffolding that was never wired up
-- (zero rows populated, no application code references) and is left in place
-- for cleanup in a separate session — see operational-todos.md.
--
-- Per GEO Strategist v4 spec (May 8 amendment): event_id is TEXT to match
-- events.id (which is TEXT PRIMARY KEY, not INTEGER as the v3 spec assumed).
-- The FK CASCADE relies on type-aligned columns to behave reliably.
--
-- Constraints (all enforced at SQLite level):
--   PK (hub_slug, locale, week_starting, rank)
--     ── prevents two events claiming the same rank in the same window
--   UNIQUE (hub_slug, locale, week_starting, event_id)
--     ── prevents the same event holding two ranks in the same window
--   CHECK rank BETWEEN 1 AND 10
--     ── enforces the editorial-pick rank vocabulary
--   FK event_id → events(id) ON DELETE CASCADE
--     ── pick rows disappear when their underlying event is deleted
--
-- The (hub_slug, locale, week_starting, rank) PK leaves the same event_id
-- free to appear on different hub_slugs in the same week — the multi-
-- cornerstone happy path. v4 spec §6 calls this "load-bearing" and requires
-- explicit constraint-test coverage.
--
-- Read by:
--   (none yet — S101a-2 wires this into hub-page rendering)
-- Written by:
--   (none yet — S101b will define the sync mechanism from
--   config/editorial-content.json or a successor source-of-truth)

CREATE TABLE IF NOT EXISTS editorial_picks (
  hub_slug      TEXT    NOT NULL,
  locale        TEXT    NOT NULL DEFAULT 'en',
  week_starting TEXT    NOT NULL,
  event_id      TEXT    NOT NULL,
  rank          INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
  PRIMARY KEY (hub_slug, locale, week_starting, rank),
  UNIQUE       (hub_slug, locale, week_starting, event_id),
  FOREIGN KEY  (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_editorial_picks_render
  ON editorial_picks (hub_slug, week_starting, rank);
