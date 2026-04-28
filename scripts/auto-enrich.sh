#!/bin/bash
#
# Agent Athens - Automated AI Enrichment
# =======================================
#
# Runs Claude Code CLI (`claude -p`) to enrich events automatically.
# Called by daily-automated.sh after enrichment queue sync.
#
# Non-fatal: pipeline continues if this fails (Article VII)
#
# Usage:
#   ./scripts/auto-enrich.sh           # Run enrichment
#   ./scripts/auto-enrich.sh --dry-run # Show what would run
#
# @see .claude/notes/decisions.md (CLI Enrichment Automation)

set -euo pipefail

# Fix #1: Prevent "nested session" error when launchd inherits CLAUDECODE env var
unset CLAUDECODE 2>/dev/null || true

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_DIR/data/events.db"
BRIEFS_DIR="$PROJECT_DIR/temp-briefs"
LOG_DIR="$PROJECT_DIR/logs"

# Resolve claude binary: try PATH first, then known install locations
CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
if [[ -z "$CLAUDE_BIN" ]]; then
    for candidate in "$HOME/.local/bin/claude" "$HOME/.npm-global/bin/claude" "/usr/local/bin/claude"; do
        [[ -x "$candidate" ]] && CLAUDE_BIN="$candidate" && break
    done
fi
ALLOWED_TOOLS="Bash Read Write WebSearch Glob Grep WebFetch"
MAX_BATCHES=2
EVENTS_PER_BATCH=5  # Raised from 4 on 2026-04-09 (S81 — parallel batches + 4 daily runs). Observed 4-event variance 285-854s → 5-event projection ~1070s worst, safe under BATCH_TIMEOUT=1800. Architectural target: 10 events × 6 slots = 60 events/day (2 batches × 5 events × 6 daily triggers). S89 (2026-04-20): overnight slots 01:00 + 22:00 unloaded — laptop lid closed; effective throughput is 40/day until always-on hardware available.
MIN_QUEUE=3
# S99 (2026-04-28): tightened BATCH_TIMEOUT from 1800→900. v2.1.105+ ships a
# server-side stream-idle watchdog at 5min; the wrapper's stdout-idle is 2min.
# 900s wall-clock is the outer fence — anything taking longer than 15min is
# already failing some inner gate. plist EnvironmentVariables can override.
BATCH_TIMEOUT=${BATCH_TIMEOUT:-900}
STDOUT_IDLE_CAP=${STDOUT_IDLE_CAP:-120}  # S99: kill batch if its stdout mtime hasn't advanced in N seconds.

# S99: Server-side stream watchdog (Claude Code v2.1.105+). CLAUDE_STREAM_IDLE_TIMEOUT_MS
# kills mid-stream stalls at 5min idle. CLAUDE_ENABLE_BYTE_WATCHDOG enables
# byte-level idle detection in addition to event-level. Both are no-ops on
# older claude versions; non-destructive to set unconditionally. plist
# EnvironmentVariables override these defaults.
export CLAUDE_STREAM_IDLE_TIMEOUT_MS=${CLAUDE_STREAM_IDLE_TIMEOUT_MS:-300000}
export CLAUDE_ENABLE_BYTE_WATCHDOG=${CLAUDE_ENABLE_BYTE_WATCHDOG:-1}

# Ensure we're in project directory
cd "$PROJECT_DIR"

# ============================================================================
# Logging
# ============================================================================

mkdir -p "$LOG_DIR"
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/auto-enrich-$TODAY.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

# ============================================================================
# Kill orphaned claude CLI processes from previous auto-enrich runs
# Only targets true orphans (parent PID 1) with auto-enrich signatures.
# Never kills interactive sessions or processes with living parents.
# ============================================================================

STALE_PIDS=$(pgrep -x claude 2>/dev/null || true)
if [[ -n "$STALE_PIDS" ]]; then
    echo "$STALE_PIDS" | while read pid; do
        PPID_OF_PROC=$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)
        [[ -z "$PPID_OF_PROC" ]] && continue

        # Only kill true orphans (reparented to init/launchd, PPID=1)
        [[ "$PPID_OF_PROC" != "1" ]] && continue

        PROC_CMD=$(ps -p "$pid" -o args= 2>/dev/null || true)
        [[ -z "$PROC_CMD" ]] && continue

        # Skip Claude desktop app
        [[ "$PROC_CMD" == *"Claude.app"* ]] && continue

        # Skip interactive sessions
        [[ "$PROC_CMD" == *"--dangerously-skip-permissions"* ]] && continue

        # Only kill if it looks like an auto-enrich spawned process:
        # claude -p with --output-format text (the exact flags we use on line 214)
        if [[ "$PROC_CMD" == *" -p "* ]] && [[ "$PROC_CMD" == *"--output-format"* ]]; then
            log "Killing orphaned auto-enrich claude process $pid (PPID=1, cmd: ${PROC_CMD:0:80})"
            kill "$pid" 2>/dev/null || true
        fi
    done
fi

# ============================================================================
# Battery skip REMOVED (2026-04-15, S82 hotfix)
# ----------------------------------------------------------------------------
# Was: exit 0 on battery power to prevent clamshell-sleep watchdog suspension.
# Problem: blocked ALL enrichment for 6 days (Apr 10-15) because the laptop
# was on battery during every enrichment window. Zero events enriched.
#
# Why removal is safe: the other 5 defense layers handle clamshell adequately:
#   1. .auto-enrich.lock — prevents overlapping runs
#   2. Lock mtime guard (LOCK_MAX_AGE) — auto-recovers stuck processes
#   3. Orphan cleanup on startup — kills zombie claude processes
#   4. Wall-clock watchdog (S89) — `date +%s` advances through system sleep,
#      so BATCH_TIMEOUT fires correctly even with the lid closed. Replaces
#      the previous `caffeinate -s sleep` which was paused by clamshell sleep
#      and stretched 30-min timeouts into multi-hour hangs.
#   5. launchd retry — next trigger runs normally after a skip/failure
#
# Worst case on battery + lid close: BATCH_TIMEOUT (1800s) fires as designed,
# the batch is killed, and the next launchd trigger runs normally.
#
# Original rationale preserved: specs/claude-hang-diagnostic.md Section 5,
# R1.A test 2026-04-08 (753s for caffeinate -i sleep 300 on battery+clamshell)
# — this data motivated the wall-clock replacement in S89.
# ============================================================================

# ============================================================================
# Lock file — prevent overlapping runs
# ============================================================================

LOCK_FILE="$PROJECT_DIR/.auto-enrich.lock"
# Maximum age (in seconds) before a lock is considered stuck regardless of PID liveness.
# Set higher than MAX_BATCHES * BATCH_TIMEOUT + warmup overhead. Default: 2 hours.
LOCK_MAX_AGE=7200
if [[ -f "$LOCK_FILE" ]]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    # Check lock age first — a stuck-but-alive process is no better than a crashed one.
    # macOS stat: -f %m gives mtime as seconds since epoch.
    LOCK_MTIME=$(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    LOCK_AGE=$((NOW - LOCK_MTIME))

    if [[ "$LOCK_AGE" -gt "$LOCK_MAX_AGE" ]]; then
        log "Lock file is ${LOCK_AGE}s old (>${LOCK_MAX_AGE}s max), holder PID $LOCK_PID is stuck. Force-removing and killing tree."
        # Best-effort kill of the stuck process tree
        if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
            pkill -9 -P "$LOCK_PID" 2>/dev/null || true
            kill -9 "$LOCK_PID" 2>/dev/null || true
        fi
        rm -f "$LOCK_FILE"
    elif kill -0 "$LOCK_PID" 2>/dev/null; then
        log "Another enrichment already running (PID $LOCK_PID, age ${LOCK_AGE}s). Skipping."
        exit 0
    else
        log "Stale lock file found (PID $LOCK_PID dead). Removing."
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ============================================================================
# Parse Arguments
# ============================================================================

DRY_RUN="false"
for arg in "$@"; do
    case $arg in
        --dry-run) DRY_RUN="true" ;;
    esac
done

# ============================================================================
# Main
# ============================================================================

log "=== Auto-enrichment starting ==="

# 1. Check dependencies
if [[ ! -x "$CLAUDE_BIN" ]]; then
    log_error "Claude CLI not found at $CLAUDE_BIN"
    exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
    log_error "Database not found at $DB_PATH"
    exit 1
fi

# Fix #3: Network pre-check — fail fast with clear message
# exit 0 (not 1) because "network down" is expected when machine just woke up
# Note: api.anthropic.com returns 404 on root, so check for any HTTP response (not -f)
HTTP_CODE=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" https://api.anthropic.com 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "000" ]]; then
    log "Network unavailable (no response from api.anthropic.com) — skipping auto-enrich"
    exit 0
fi

# 2. Check queue size
QUEUE_SIZE=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*) FROM events
    WHERE needs_enrichment = 1
      AND location_status IN ('verified_athens', 'pass_through')
      AND (full_description IS NULL OR full_description = '')
      AND date(COALESCE(
        CASE WHEN type='exhibition' THEN end_date ELSE NULL END,
        start_date
      )) >= date('now');
")

log "Enrichment queue: $QUEUE_SIZE events"

if [[ "$QUEUE_SIZE" -lt "$MIN_QUEUE" ]]; then
    log "Queue below minimum ($MIN_QUEUE). Skipping enrichment."
    exit 0
fi

# 3. Calculate batch count (cap at MAX_BATCHES)
BATCHES=$MAX_BATCHES
if [[ "$QUEUE_SIZE" -lt $((EVENTS_PER_BATCH * MAX_BATCHES)) ]]; then
    BATCHES=$(( (QUEUE_SIZE + EVENTS_PER_BATCH - 1) / EVENTS_PER_BATCH ))
    if [[ "$BATCHES" -gt "$MAX_BATCHES" ]]; then
        BATCHES=$MAX_BATCHES
    fi
fi

log "Will generate $BATCHES batch(es) of $EVENTS_PER_BATCH events"

if [[ "$DRY_RUN" == "true" ]]; then
    log "[DRY RUN] Would clean temp-briefs, generate $BATCHES batches, run claude -p on each"
    exit 0
fi

# 4. Clean old batch files from temp-briefs/
rm -f "$BRIEFS_DIR"/batch-*.md "$BRIEFS_DIR"/batch-*.manifest.json 2>/dev/null || true
log "Cleaned old batch files"

# 5. Sync enrichment queue
log "Syncing enrichment queue..."
if ! bun run scripts/run-enrichment-pipeline.ts --sync >> "$LOG_FILE" 2>&1; then
    log_error "Queue sync failed"
    exit 1
fi

# 6. Generate briefs
log "Generating $BATCHES enrichment briefs..."
BRIEF_OUTPUT=$(bun run scripts/generate-enrichment-brief.ts --count="$EVENTS_PER_BATCH" --batches="$BATCHES" 2>&1)
echo "$BRIEF_OUTPUT" >> "$LOG_FILE"

# 7. Find generated batch files (parse the actual filenames)
BATCH_FILES=()
for f in "$BRIEFS_DIR"/batch-*.md; do
    [[ -f "$f" ]] && BATCH_FILES+=("$f")
done

if [[ ${#BATCH_FILES[@]} -eq 0 ]]; then
    log "No batch files generated. Queue may be empty after filtering."
    exit 0
fi

log "Generated ${#BATCH_FILES[@]} batch file(s)"

# 8. Warm up Claude CLI (forces startup overhead into a throwaway call)
log "Warming up Claude CLI..."
# macOS lacks GNU timeout — use background process with watchdog.
# Wall-clock watchdog: `date +%s` measures real time and advances through
# system/clamshell sleep, unlike `sleep N` which is paused by the kernel.
# caffeinate was previously used to assert against idle sleep but did NOT
# prevent lid-close sleep, so timeouts could stretch to hours (S89).
"$CLAUDE_BIN" -p "echo ready" --max-turns 1 --output-format json > /dev/null 2>&1 &
WARMUP_PID=$!
( WATCHDOG_END=$(( $(date +%s) + 120 ))
  while [ "$(date +%s)" -lt "$WATCHDOG_END" ]; do sleep 30; done
  kill "$WARMUP_PID" 2>/dev/null
) &
WATCHDOG_PID=$!
wait "$WARMUP_PID" 2>/dev/null || true
kill "$WATCHDOG_PID" 2>/dev/null || true
wait "$WATCHDOG_PID" 2>/dev/null || true
log "Warm-up complete"

# 8b. Pre-flight auth check (S89) — fail fast on 401 instead of burning
#     30 min of BATCH_TIMEOUT per batch when the CLI session is expired.
log "Running auth pre-check..."
if ! echo "ok" | "$CLAUDE_BIN" -p --output-format json >/dev/null 2>&1; then
  log_error "Claude CLI auth check failed — aborting enrichment run"
  exit 1
fi
log "Auth pre-check passed"

# 9. Run claude -p on all batches in parallel (S80)
#    Each batch's save-batch.ts invocation (inside its own claude -p) opens its
#    own SQLite connection with PRAGMA busy_timeout = 30000, so concurrent saves
#    serialize safely at the SQLite level (commit 46667ce35). Prior to S80 this
#    loop ran batches sequentially — see git log for the rationale if this
#    reverts.

# S98: run-unique identifier for wrapper↔subprocess reconciliation.
# Exported so `claude -p` inherits it, and save-batch.ts inside the subprocess
# reads process.env.RUN_ID to tag each enrichment_log row. `date +%s` for
# human-readable timestamp; `$$` disambiguates overlapping launchd-triggered
# runs in the same second.
RUN_ID="$(date +%s)-$$"
export RUN_ID
log "RUN_ID=$RUN_ID"

SUCCEEDED=0
FAILED=0
TOTAL_ENRICHED=0

declare -a CLAUDE_PIDS=()
declare -a WATCHDOG_PIDS=()
declare -a BATCH_NAMES=()
declare -a START_TIMES=()
declare -a BATCH_OUTS=()  # S99: per-batch stdout files for stdout-mtime watchdog

# Launch all batches in parallel
for brief in "${BATCH_FILES[@]}"; do
    BATCH_NAME=$(basename "$brief" .md)
    log "Launching $BATCH_NAME (parallel)..."

    BRIEF_CONTENT=$(cat "$brief")
    START_TIME=$(date +%s)

    # S99: per-batch output file. Required for stdout-mtime watchdog in the
    # parallel-batch model — a shared LOG_FILE has its mtime advanced by
    # other batches' output, masking a stalled batch.
    BATCH_OUT="$LOG_DIR/.batch-${BATCH_NAME}-${RUN_ID}.out"
    rm -f "$BATCH_OUT" && touch "$BATCH_OUT"

    # Run claude in background, output to per-batch file.
    "$CLAUDE_BIN" -p "$BRIEF_CONTENT" \
        --output-format text \
        --allowedTools "$ALLOWED_TOOLS" \
        > "$BATCH_OUT" 2>&1 &
    CLAUDE_PID=$!

    # S99 watchdog: combined wall-clock + stdout-idle with T1 KILL_CAUSE logging.
    # Wall-clock cap: BATCH_TIMEOUT (default 900s, was 1800).
    # Stdout-idle cap: STDOUT_IDLE_CAP (default 120s).
    # `date +%s` and `stat -f %m` (BSD/macOS) advance through system/clamshell
    # sleep; `sleep N` does not. caffeinate does NOT prevent lid-close sleep
    # (S89, see specs/claude-hang-diagnostic.md) so it stays removed.
    # KILL_CAUSE log lines tag which gate fired for forensic attribution
    # (see specs/s99-baseline-floor.md re-evaluation criteria).
    ( WATCHDOG_END=$(( $(date +%s) + BATCH_TIMEOUT ))
      while true; do
        NOW=$(date +%s)
        # Stop polling if claude already exited cleanly
        kill -0 "$CLAUDE_PID" 2>/dev/null || break
        # Wall-clock check
        if [ "$NOW" -ge "$WATCHDOG_END" ]; then
          ELAPSED=$(( NOW - WATCHDOG_END + BATCH_TIMEOUT ))
          log_error "KILL_CAUSE: wrapper-wall-clock pid=$CLAUDE_PID elapsed=${ELAPSED}s exit=124 batch=$BATCH_NAME"
          kill "$CLAUDE_PID" 2>/dev/null
          break
        fi
        # Stdout-mtime idle check (NOTE: stat -f %m is BSD/macOS; use -c %Y on Linux)
        MTIME=$(stat -f %m "$BATCH_OUT" 2>/dev/null || echo "$NOW")
        IDLE=$(( NOW - MTIME ))
        if [ "$IDLE" -ge "$STDOUT_IDLE_CAP" ]; then
          ELAPSED=$(( NOW - START_TIME ))
          log_error "KILL_CAUSE: stdout-idle pid=$CLAUDE_PID elapsed=${ELAPSED}s idle=${IDLE}s exit=125 batch=$BATCH_NAME"
          kill "$CLAUDE_PID" 2>/dev/null
          break
        fi
        sleep 15
      done
    ) &
    TIMER_PID=$!

    CLAUDE_PIDS+=("$CLAUDE_PID")
    WATCHDOG_PIDS+=("$TIMER_PID")
    BATCH_NAMES+=("$BATCH_NAME")
    START_TIMES+=("$START_TIME")
    BATCH_OUTS+=("$BATCH_OUT")
done

log "All ${#CLAUDE_PIDS[@]} batches launched in parallel. Waiting for completion..."

# Collect results in launch order.
# Note: wait() blocks on the specific PID, so if batch-1 takes longer than batch-2,
# the loop still waits for batch-1 first. Log output is in launch order (1, 2, 3)
# not finish order — intentional for predictable log parsing.
for i in "${!CLAUDE_PIDS[@]}"; do
    CLAUDE_PID="${CLAUDE_PIDS[$i]}"
    TIMER_PID="${WATCHDOG_PIDS[$i]}"
    BATCH_NAME="${BATCH_NAMES[$i]}"
    START_TIME="${START_TIMES[$i]}"
    BATCH_OUT="${BATCH_OUTS[$i]}"
    # S98: extract integer batch number from "batch-N" for DB query filter.
    BATCH_NUM="${BATCH_NAME#batch-}"

    # Wait for claude to finish (or be killed by watchdog)
    wait "$CLAUDE_PID" && EXIT_CODE=0 || EXIT_CODE=$?

    # Cancel this batch's watchdog if claude finished before timeout
    kill "$TIMER_PID" 2>/dev/null || true
    wait "$TIMER_PID" 2>/dev/null || true

    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))

    # S99: append per-batch output to main log file BEFORE result categorization
    # so log_error from below shares the file with the batch's stream output.
    if [ -f "$BATCH_OUT" ]; then
        cat "$BATCH_OUT" >> "$LOG_FILE"
    fi

    # S99 T1: detect if Claude Code's server-side stream watchdog (v2.1.105+)
    # fired. It self-terminates and emits a recognizable signature in output.
    # Log post-detection KILL_CAUSE so forensics can attribute. Exit code is
    # whatever claude returned (likely non-zero).
    SERVER_STREAM_IDLE=0
    if [ -f "$BATCH_OUT" ] && grep -qiE 'stream.idle.timeout|stream watchdog|stream.idle' "$BATCH_OUT" 2>/dev/null; then
        SERVER_STREAM_IDLE=1
        log "KILL_CAUSE: server-stream-idle pid=$CLAUDE_PID elapsed=${ELAPSED}s exit=$EXIT_CODE batch=$BATCH_NAME"
    fi

    # Keep BATCH_OUT for forensics on failure or stream-idle detection;
    # remove on clean success.
    if [ "$EXIT_CODE" -eq 0 ] && [ "$SERVER_STREAM_IDLE" -eq 0 ] && [ -f "$BATCH_OUT" ]; then
        rm -f "$BATCH_OUT"
    fi

    # S98: reconcile against DB state. Authoritative signal is the count of
    # enrichment_log rows this (run_id, batch_number) produced with
    # saved_to_events=1. Subprocess exit code is advisory — stream-idle can
    # exit non-zero after saves commit cleanly.
    SAVED_THIS_BATCH=$(sqlite3 "$DB_PATH" "
      SELECT COUNT(*) FROM enrichment_log
      WHERE run_id = '$RUN_ID'
        AND batch_number = $BATCH_NUM
        AND saved_to_events = 1
    " 2>/dev/null || echo 0)
    SAVED_THIS_BATCH="${SAVED_THIS_BATCH:-0}"

    # Four-quadrant log matrix (S98). Ground-truth bucketing: saves happened
    # = SUCCEEDED, regardless of exit code. Exit code drives log severity only.
    if [[ "$EXIT_CODE" -eq 0 && "$SAVED_THIS_BATCH" -gt 0 ]]; then
        log "$BATCH_NAME OK: $SAVED_THIS_BATCH events saved in ${ELAPSED}s"
        SUCCEEDED=$((SUCCEEDED + 1))
        TOTAL_ENRICHED=$((TOTAL_ENRICHED + SAVED_THIS_BATCH))
    elif [[ "$EXIT_CODE" -ne 0 && "$SAVED_THIS_BATCH" -gt 0 ]]; then
        # Wrapper-misreport quadrant — the class Session 98 was built to surface.
        log "$BATCH_NAME WARN: subprocess exited $EXIT_CODE but $SAVED_THIS_BATCH events saved successfully (${ELAPSED}s)"
        SUCCEEDED=$((SUCCEEDED + 1))
        TOTAL_ENRICHED=$((TOTAL_ENRICHED + SAVED_THIS_BATCH))
    elif [[ "$EXIT_CODE" -eq 0 && "$SAVED_THIS_BATCH" -eq 0 ]]; then
        # New-failure-class detector. Theoretical today; if this ever fires,
        # subprocess lied about success. Investigate immediately.
        log_error "$BATCH_NAME WARN: subprocess reported success but no events saved (${ELAPSED}s) — possible new failure class"
        FAILED=$((FAILED + 1))
    else
        log_error "$BATCH_NAME ERROR: subprocess failed (exit $EXIT_CODE) and no events saved (${ELAPSED}s)"
        FAILED=$((FAILED + 1))
    fi
done

# 9. Report — based on accumulated DB counts, not SUCCEEDED × EVENTS_PER_BATCH.
log "=== Auto-enrichment complete ==="
log "RUN_ID: $RUN_ID"
log "Batches: $SUCCEEDED succeeded, $FAILED failed"
log "Events enriched: $TOTAL_ENRICHED"

if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi

exit 0
