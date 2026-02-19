-- Migration 002: Create enrichment_queue table
-- Required by: PRD v2, Enrichment Pipeline Integration
-- Date: 2026-02-02

-- ============================================================================
-- ENRICHMENT QUEUE TABLE
-- Tracks enrichment priority, status, and scheduling
-- ============================================================================

CREATE TABLE IF NOT EXISTS enrichment_queue (
  -- Primary key matches events table
  event_id TEXT PRIMARY KEY,

  -- Priority scoring (higher = process sooner)
  priority_score INTEGER DEFAULT 0,
  priority_reason TEXT,

  -- Tier classification
  tier TEXT DEFAULT 'standard' CHECK (tier IN ('stub', 'standard', 'premium')),

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),

  -- Scheduling
  scheduled_for TEXT,  -- ISO timestamp for when to process

  -- Attempt tracking
  attempts INTEGER DEFAULT 0,
  last_attempt TEXT,
  last_error TEXT,

  -- Quality gates
  quality_score INTEGER,  -- 0-100 quality rating
  quality_issues TEXT,    -- JSON array of issues found

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,

  -- Foreign key constraint
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES FOR QUEUE OPERATIONS
-- ============================================================================

-- Fast lookup for pending items by priority
CREATE INDEX IF NOT EXISTS idx_queue_pending
  ON enrichment_queue(status, priority_score DESC)
  WHERE status = 'pending';

-- Fast lookup for scheduled items
CREATE INDEX IF NOT EXISTS idx_queue_scheduled
  ON enrichment_queue(scheduled_for)
  WHERE status = 'pending' AND scheduled_for IS NOT NULL;

-- Tier-based queries
CREATE INDEX IF NOT EXISTS idx_queue_tier
  ON enrichment_queue(tier, status);

-- Failed items for retry
CREATE INDEX IF NOT EXISTS idx_queue_failed
  ON enrichment_queue(status, attempts)
  WHERE status = 'failed' AND attempts < 3;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_enrichment_queue_updated
  AFTER UPDATE ON enrichment_queue
  FOR EACH ROW
  BEGIN
    UPDATE enrichment_queue SET updated_at = datetime('now') WHERE event_id = NEW.event_id;
  END;
