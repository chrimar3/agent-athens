-- Orphan enrichment_log row cleanup (deferred maintenance)
--
-- Authored: 2026-04-24 during Session 98.
-- Status: NOT EXECUTED in Session 98. Deferred to a future maintenance batch
--         after a DB backup has been taken. Reason: Session 98 already ships
--         a schema migration (saved_to_events + run_id) plus a save-path
--         change — one blast radius per session.
--
-- Context:
--   Path C classification (Session 98 prep) found 957 enrichment_log rows in
--   the `4_complete` length bucket with events_null (event row doesn't exist).
--   The V2 verification narrowed the majority to 940 "deleted" rows — events
--   that existed when enriched, then aged out via the natural past-event
--   lifecycle. They carry no active value; they inflate enrichment_log size
--   and confuse any cross-join analysis.
--
--   At Session 98 close the count was 942 (2 additional orphans accumulated
--   between Path C and Session B). The window is still a 2026-02-26 → 2026-03-02
--   cluster; whatever caused that batch of late-February enrichments followed
--   by aggressive event cleanup is historical, not active.
--
-- Preconditions before execution:
--   1. `cp data/events.db data/events.db.pre-orphan-cleanup-2026-04-24` (snapshot).
--   2. Re-run the count below — must match the session's documented value
--      (~942) within single-digit variance. Large deviation → stop and
--      investigate before deleting.
--   3. Confirm no in-flight enrichment run (lock file absent, no `claude -p`
--      procs). Deletion inside an active window risks removing rows that
--      correspond to events briefly absent from the events table.
--
-- Execution:
--   bun run some-maintenance-wrapper.ts --file specs/cleanup-enrichment-log-orphans.sql
--   (or invoke sqlite3 data/events.db < specs/cleanup-enrichment-log-orphans.sql
--    if the maintenance session prefers direct sqlite3)
--
-- Rollback: restore from the snapshot created in precondition 1.


-- Step 1: Count check (no side effect). Confirm we're operating on the
-- expected tail before any DELETE fires.
SELECT COUNT(*) AS orphan_count
FROM enrichment_log el
LEFT JOIN events e ON e.id = el.event_id
WHERE e.id IS NULL
  AND DATE(el.created_at) BETWEEN '2026-02-26' AND '2026-03-02';


-- Step 2: Delete orphan rows within the documented window.
-- Scoped tightly by date range — do NOT relax this to "all orphan rows" in
-- this script. Other windows may contain orphans we haven't audited.
DELETE FROM enrichment_log
WHERE event_id IN (
  SELECT el.event_id
  FROM enrichment_log el
  LEFT JOIN events e ON e.id = el.event_id
  WHERE e.id IS NULL
    AND DATE(el.created_at) BETWEEN '2026-02-26' AND '2026-03-02'
)
  AND DATE(created_at) BETWEEN '2026-02-26' AND '2026-03-02';


-- Step 3: Verification. Orphan count in the window should drop to 0.
SELECT COUNT(*) AS remaining_orphans_in_window
FROM enrichment_log el
LEFT JOIN events e ON e.id = el.event_id
WHERE e.id IS NULL
  AND DATE(el.created_at) BETWEEN '2026-02-26' AND '2026-03-02';


-- Step 4: Sanity — overall enrichment_log row count dropped by ~942.
SELECT COUNT(*) AS total_log_rows_after FROM enrichment_log;
