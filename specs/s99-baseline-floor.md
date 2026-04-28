# S99 Watchdog-Era Baseline Floor

**Captured:** 2026-04-28 (S99 Step 0, pre-wrapper-land)
**Purpose:** Establish honest pre-S99 stall pattern so the 14-day post-S99 comparison has a fixed floor.

## Pre-S99 stall pattern

Source: `logs/auto-enrich-2026-04-{16..27}.log` (S97a Phase 1 verified via `grep -c "Stream idle timeout"`).

| Date | Stream-idle timeouts | Cascade? |
|---|---|---|
| 2026-04-16 | 4 | absorbed |
| 2026-04-17 | 8 | absorbed |
| 2026-04-18 | 7 | absorbed |
| 2026-04-19 | 5 | absorbed |
| 2026-04-20 | 1 | absorbed |
| 2026-04-23 | 3 | absorbed |
| 2026-04-24 | 2 | absorbed |
| 2026-04-25 | 4 | **CASCADE — 0 events enriched** |
| 2026-04-26 | 6 | **CASCADE — 0 events enriched** |
| 2026-04-27 | 0 | clean recovery |

**Aggregate:** ~50 stream-idle-timeout lines across 10 days; 2 cascade days in 12 days.
**Pattern signal:** chronic background of 1-8 timeouts/day; recovery mechanism normally absorbs them; failed Apr 25-26 specifically (recovery-asymmetry — separate forensic question per S97a known-issues entry).

## Watchdog-era observation window

**Period:** 2026-04-29 → 2026-05-12 (14 days post-S99 land)
**Sources for monitoring:**
- `logs/auto-enrich-*.log` daily — count `Stream idle timeout` occurrences AND new `KILL_CAUSE: ...` log lines (from S99 T1 tagging).
- `data/events.db` enrichment_log — daily `saved_to_events=1` counts (zero-event-day detection).
- `data/search-visibility-log.csv` — STALE_ENRICHMENT flag occurrences.

## Re-evaluation criteria

After 2026-05-12:

1. **Stream-idle timeout count per day.**
   - Target: chronic ≤2/day, **zero cascade days**.
   - Baseline: chronic 1-8/day, 2 cascade days in 12.
   - Pass: median ≤2 AND zero cascades. Fail: median >2 OR any cascade.

2. **BATCH_TIMEOUT-900 hits per day.**
   - Target: ≤1/day.
   - Trigger for STDOUT_IDLE_CAP retune: >2/day means stream-idle is firing too eagerly on healthy slow responses. Raise `STDOUT_IDLE_CAP` from 120s → 180-240s and re-baseline another 14d window.

3. **Kill-cause distribution (from S99 T1 tagging).**
   - Surfaces which gate is doing the work:
     - `KILL_CAUSE: server-stream-idle` — v2.1.105 watchdog catches it (good, no wrapper escalation).
     - `KILL_CAUSE: stdout-idle` — wrapper's stdout-mtime catches it (good, server-side missed a stall variant).
     - `KILL_CAUSE: wrapper-wall-clock` — wrapper's 900s wall-clock catches it (mid; suggests stdout-idle didn't fire — investigate why).
     - `KILL_CAUSE: perl-alarm` — legacy BATCH_TIMEOUT catches it (bad — means everything else missed).
   - Healthy distribution: >80% server-stream-idle, <20% stdout-idle, ~0% wrapper-wall-clock or perl-alarm.

## Triggers for follow-up sessions

| Condition | Action |
|---|---|
| Watchdog-era window completes with zero cascade days AND stream-idle median ≤2 | Mark S99 success in `decisions.md`. Recovery-asymmetry diagnostic still owed (separate question). |
| Watchdog-era window shows ≥1 cascade day | **Recovery-asymmetry diagnostic session** triggered. The forensic question (S97a known-issues entry) is independent of stream-idle. |
| Watchdog-era window shows >2 BATCH_TIMEOUT-900 hits/day | **STDOUT_IDLE_CAP retune session.** Raise to 180-240s. Re-run synthetic-stall test (`/tmp/spike-stall-test.sh`). |
| `claude` ships v2.1.130+ with further watchdog improvements | Re-evaluate whether custom wrapper still adds value. May be able to remove stdout-mtime layer if server-side covers more failure modes. |
| `KILL_CAUSE: perl-alarm` rate >5% of all kills | Outer perl-alarm is doing too much work. Investigate whether stdout-idle gate is firing late (polling interval too long) or wrapper-wall-clock is set too high. |

## Update protocol

This file is **read-only after S99 land**. Updates to the watchdog-era observation results go in:
- `decisions.md` — S99 success/failure entry at end of window.
- `docs/known-issues.md` — Recovery-Asymmetry entry update if new evidence surfaces.
- A new `specs/s99-watchdog-era-results.md` if a follow-up session writes a structured retro.
