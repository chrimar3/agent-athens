-- Migration 011 — S110f hard-stop tier validator
--
-- Records concerns the enrichment agent emitted alongside each saved
-- description. Tier classification (A0/B) lives in
-- config/enrichment-gate-rules.yml; this table just stores the raw
-- (event_id, concern_type, concern_text) triples.
--
-- Read by:
--   src/db/database.ts:getAllEvents()  — chokepoint filter for public output
--   src/validators/completeness-reporter.ts:printHardStopSummary()
--
-- Written by:
--   scripts/save-batch.ts  — ingests temp-descriptions/batch-N/concerns.jsonl
--
-- PRIMARY KEY (event_id, concern_type) means the same concern emitted twice
-- collapses to one row; INSERT OR REPLACE in save-batch.ts keeps the most
-- recent concern_text.

CREATE TABLE IF NOT EXISTS event_concerns (
  event_id TEXT NOT NULL,
  concern_type TEXT NOT NULL,
  concern_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, concern_type),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_concerns_type ON event_concerns(concern_type);
CREATE INDEX IF NOT EXISTS idx_concerns_event ON event_concerns(event_id);
