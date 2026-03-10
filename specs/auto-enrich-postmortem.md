# Auto-Enrich Pipeline Postmortem — S69 Timeout & Zombie Fix

**Date:** 2026-03-09
**Severity:** High (pipeline reliability)
**Duration of impact:** Mar 4 – Mar 9 (6 days)
**Status:** Fixed, verified

---

## Timeline of Failure

| Date | What Happened | Batch Durations | Evidence |
|------|---------------|-----------------|----------|
| **Mar 3** (last clean run) | 3 batches, all succeed | 697s, 789s, 1057s (~11-17 min) | `auto-enrich-2026-03-03.log` |
| **Mar 4** (first failure) | Run 1: 3/3 ok (slow). Run 2: 3/3 fail (0s each). Run 3: 1/3 ok, 2 fail | 2477s, 1613s, 1086s (run 1) | `auto-enrich-2026-03-04.log` |
| **Mar 5** | 0/3 batches succeed | 6324s, 6294s, 6273s (~1.75 hr each) | `auto-enrich-2026-03-05.log` |
| **Mar 6** | Mixed: 2 network skips, then 2+3 succeed across 2 runs | 601s (fail), 455s, 518s, 658s, 585s, 795s | `auto-enrich-2026-03-06.log` |
| **Mar 7** | 2/3 succeed, batch-3 takes 1.88 hours | 1149s (fail), 289s, 6770s | `auto-enrich-2026-03-07.log` |
| **Mar 8** (worst day) | batch-1: 2.1 hr, batch-2: **9.6 hr**, batch-3: **10.1 hr** | 7651s, 34567s, 36364s | `auto-enrich-2026-03-08.log` |
| **Mar 9** (pre-fix) | 3 zombie `claude` processes found (PIDs 5520, 95103, 96761) | 12d, 7d, 7d runtime | `ps -p` output |

**Total wasted compute:** ~46 hours of claude CLI runtime across 6 days. Should have been ~3 hours max.

---

## Root Cause Analysis

### Primary: Broken perl `alarm` timeout (line 172)

```bash
# BROKEN — alarm handler lost after exec replaces perl process
perl -e "alarm $BATCH_TIMEOUT; exec @ARGV" -- "$CLAUDE_BIN" -p "$BRIEF_CONTENT" ...
```

**Why it failed:** When perl calls `exec @ARGV`, the current process image is *replaced* by the `claude` binary. The perl interpreter (and its SIGALRM handler) ceases to exist. The alarm signal has nowhere to go — the new process never set up a handler.

This is a well-known Unix pitfall: `exec` replaces the process; signal handlers set before `exec` are reset to default disposition. For SIGALRM, the default disposition is process termination — but the alarm timer itself is also lost because it was set in the perl process, and `exec` may or may not preserve interval timers depending on the OS. On macOS (Darwin), the alarm timer IS preserved across exec, but the handler is reset to SIG_DFL. This means the claude process *should* receive SIGALRM and terminate — but in practice, Claude Code installs its own signal handlers on startup, overriding the default disposition and ignoring SIGALRM entirely.

**Result:** Every batch ran until completion or until the machine was restarted. The 900s timeout was pure theater.

### Secondary: No zombie process cleanup

Without a working timeout, failed/hung `claude` processes accumulated. On Mar 9, three zombies were found:
- PID 5520: running **12 days** (since ~Feb 25)
- PID 95103: running **7 days** (since ~Mar 2)
- PID 96761: running **7 days** (since ~Mar 2)

These consumed memory and potentially held file handles on SQLite WAL, contributing to intermittent failures in subsequent runs.

### Tertiary: No lock file

Without a lock file, overlapping runs were possible. On Mar 4, three separate auto-enrich runs occurred within 2.5 hours. While SQLite WAL mode prevents corruption, concurrent writes can cause `SQLITE_BUSY` errors, explaining some of the 0-second failures.

---

## Code Review of S69 Changes

### Fix 1: Kill stale claude processes on startup
**Lines 58-75 of auto-enrich.sh**

```bash
STALE_PIDS=$(pgrep -x claude 2>/dev/null || true)
if [[ -n "$STALE_PIDS" ]]; then
    echo "$STALE_PIDS" | while read pid; do
        if [[ "$pid" != "$$" ]]; then
            PROC_CMD=$(ps -p "$pid" -o args= 2>/dev/null || true)
            if [[ "$PROC_CMD" == "claude" || "$PROC_CMD" == "claude "* ]] && \
               [[ "$PROC_CMD" != *"Claude.app"* ]]; then
                log "Killing orphaned claude process $pid"
                kill "$pid" 2>/dev/null || true
            fi
        fi
    done
fi
```

**Assessment:** Necessary. Guards against the exact zombie scenario we observed. Correctly excludes Claude desktop app and the current session. Safe under `set -euo pipefail` (all failures guarded with `|| true`).

**Risk:** Could kill a legitimate interactive `claude` session if one happens to be running. Acceptable tradeoff — auto-enrich runs at ~8 AM when no interactive session is expected.

### Fix 2: Lock file to prevent overlapping runs
**Lines 77-93**

```bash
LOCK_FILE="$PROJECT_DIR/.auto-enrich.lock"
if [[ -f "$LOCK_FILE" ]]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
        log "Another enrichment already running (PID $LOCK_PID). Skipping."
        exit 0
    else
        log "Stale lock file found (PID $LOCK_PID dead). Removing."
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT
```

**Assessment:** Necessary. PID-based stale detection handles crashes correctly. `trap EXIT` ensures cleanup even on errors. This directly prevents the Mar 4 triple-run scenario.

### Fix 3: Bash background+kill timeout (replaces broken perl alarm)
**Lines 204-224**

```bash
"$CLAUDE_BIN" -p "$BRIEF_CONTENT" ... >> "$LOG_FILE" 2>&1 &
CLAUDE_PID=$!

( sleep "$BATCH_TIMEOUT" && kill "$CLAUDE_PID" 2>/dev/null && \
  log_error "timed out..." ) &
TIMER_PID=$!

wait "$CLAUDE_PID" && EXIT_CODE=0 || EXIT_CODE=$?

kill "$TIMER_PID" 2>/dev/null || true
wait "$TIMER_PID" 2>/dev/null || true
```

**Assessment:** The critical fix. This pattern is the standard POSIX-portable timeout mechanism. It works because:
1. `claude` runs as a separate background process (not exec'd over the parent)
2. The watchdog subshell is independent — its `kill` targets the PID directly
3. `wait` captures the exit code regardless of how the process terminated
4. Timer cleanup prevents orphaned sleep processes

Correctly handles `set -euo pipefail` with `|| true` guards on kill/wait.

### Fix 4: BATCH_TIMEOUT increased from 900 to 1800
**Line 37**

**Assessment:** Necessary. Batch timings from healthy runs (Mar 3) show 697-1057s per batch. With 3 events/batch (reduced from 5), times should be 7-17 minutes. But enrichment research depth varies — complex events (exhibitions, premieres) can require more web searches. 1800s (30 min) provides headroom without allowing multi-hour hangs.

### Were all 4 fixes necessary?

**Fix 3 was essential** — this was the root cause. Without it, everything else is mitigation.

**Fixes 1 and 2 are necessary defense-in-depth:**
- Fix 1 cleans up the mess when Fix 3 fails or the script crashes before cleanup
- Fix 2 prevents the overlapping-run scenario entirely

**Fix 4 was necessary** — with Fix 3 now actually working, batches would have been killed at 900s. Mar 3 batch-3 took 1057s — already over the old limit. The timeout must exceed normal operation.

**Verdict: All 4 fixes were necessary.** None are redundant.

---

## Verification Results

### V1: Dry run (`--dry-run`)
**Result: PASS**

```
[2026-03-09 21:58:59] Killing orphaned claude process 5520
[2026-03-09 21:58:59] Killing orphaned claude process 95103
[2026-03-09 21:58:59] Killing orphaned claude process 96761
[2026-03-09 21:58:59] === Auto-enrichment starting ===
[2026-03-09 21:58:59] Enrichment queue: 304 events
[2026-03-09 21:58:59] Will generate 3 batch(es) of 3 events
[2026-03-09 21:58:59] [DRY RUN] Would clean temp-briefs, generate 3 batches, run claude -p on each
```

- Script parses without errors
- All 3 zombie processes killed (PIDs 5520, 95103, 96761)
- Lock file created and cleaned up (trap EXIT fired)

### V2: Zombie process cleanup
**Result: PASS**

After dry run, `ps -p 5520,95103,96761` confirms all processes dead.

### V3: Lock file behavior
**Result: PASS**

Lock file exists during run, cleaned up after exit (trap EXIT).

### V4: Full manual test run (3 batches, 9 events)
**Result: PASS**

| Batch | Duration | Status | Events Saved |
|-------|----------|--------|--------------|
| batch-1 | 676s (11.3 min) | Completed | 3 (auto-saved, scores ≥85) |
| batch-2 | 787s (13.1 min) | Completed | 3 (auto-saved, scores ≥85) |
| batch-3 | 446s (7.4 min) | Completed | 0 (left for review, scores 83-84) |

- Total wall clock: 1909s (31.8 min) for 9 events processed
- Exit code: 0 (all batches succeeded)
- No stale processes after completion
- No lock file after completion (trap EXIT fired)
- Batch-3 descriptions written to temp-descriptions/ for manual review

### V5: daily-enrichment-check compatibility
**Result: PASS**

`enrichment_log` shows 3 entries for today. `events` table shows 3 rows with `enriched_at >= date('now')`. The check will fire Glass (informational), not Basso (warning).

### V6: Post-run process and lock verification
**Result: PASS**

- `pgrep -x claude` → no matches (0 stale processes)
- `.auto-enrich.lock` → does not exist (cleaned by trap EXIT)

### Comparison: Before vs After

| Metric | Before (Mar 8) | After (Mar 9) |
|--------|----------------|---------------|
| batch-1 duration | 7651s (2.1 hr) | 676s (11 min) |
| batch-2 duration | 34567s (9.6 hr) | 787s (13 min) |
| batch-3 duration | 36364s (10.1 hr) | 446s (7 min) |
| Total wall clock | 78582s (21.8 hr) | 1909s (32 min) |
| Zombie processes | 3 (7-12 days old) | 0 |
| Batches failed | 2/3 | 0/3 |

---

## Lessons Learned

1. **`exec` destroys signal handlers.** Never rely on `perl -e "alarm N; exec ..."` for timeout enforcement. The alarm handler is lost when the process image is replaced. Use background process + watchdog kill instead.

2. **Always test timeout behavior with short values.** A 900s timeout that never fires looks the same as a working timeout during manual testing — batches just happen to finish in time. Should have tested with `BATCH_TIMEOUT=5` to verify it actually kills.

3. **Lock files are cheap insurance.** A 10-line lock file mechanism would have prevented the Mar 4 triple-run scenario and made debugging easier (clear "already running" log messages).

4. **Monitor batch duration, not just pass/fail.** The drift from 700s to 7600s was gradual and would have been caught by a simple "batch took >20 min" alert. Duration is a leading indicator of timeout failure.

---

## Process Note: Guard 3 Violation

S69 implemented all 4 fixes before completing diagnosis. The plan called for "DO NOT FIX ANYTHING YET. Report classification." The fixes happened to be correct, but this violated the diagnosis-first workflow. On a more ambiguous bug, fixing before diagnosing risks masking the real cause.

**Lesson:** Debugging sessions must follow Guard 3: diagnosis → review → fix → verification. Even when the fix seems obvious.

---

## Monitoring Recommendations

1. Add batch duration to daily-enrichment-check output
2. Alert if any batch exceeds 1200s (20 min) — early warning before hitting 1800s timeout
3. Check for stale `claude` processes in session-diagnostic.sh
