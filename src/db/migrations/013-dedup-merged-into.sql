-- Migration 013 — dedup arc: reversible merge marking (2026-07-05)
--
-- The cross-source merge pass historically DELETED loser rows (with a
-- loser_snapshot in dedup_merges for undo). The dedup arc replaces deletion
-- with marking: losers stay in the table, pointing at their survivor, so a
-- merge is reversible with a single UPDATE and the GEO Strategist can rule
-- on loser-URL disposition (410 / 301 / noindex) before anything disappears.
--
-- merged_into: survivor event id (NULL = live event, not a merge loser)
-- merged_at:   when the merge pass marked this row
--
-- Emission note: nothing reads these columns yet — marked losers still
-- build pages, BY DESIGN, until the GEO ruling lands
-- (see specs/dedup-url-disposition-proposal.md).
--
-- Read by:
--   scripts/mark-duplicates.ts (skips already-merged rows)
--   scripts/merge-duplicates.ts / scripts/remove-duplicates.ts
--     (exclusion — a marked loser must never be re-detected and DELETED,
--      that would destroy reversibility)
--   src/quality/import-gate.ts (matches incoming events against live rows only)
-- Written by:
--   scripts/mark-duplicates.ts

ALTER TABLE events ADD COLUMN merged_into TEXT;
ALTER TABLE events ADD COLUMN merged_at TEXT;

CREATE INDEX idx_events_merged_into
  ON events(merged_into)
  WHERE merged_into IS NOT NULL;
