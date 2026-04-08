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
MAX_BATCHES=3
EVENTS_PER_BATCH=4  # Raised from 3 on 2026-04-08 (throughput session). 4-event batches project ~1156s mean / ~1664s worst, safe under BATCH_TIMEOUT=1800. Target: 9→12 events/day (+33%).
MIN_QUEUE=3
BATCH_TIMEOUT=1800  # 30 minutes max per batch (batches avg 15-20 min)

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
# Battery precondition — defer enrichment when on battery power
# ----------------------------------------------------------------------------
# Why: caffeinate -s only prevents system sleep on AC power (per `man caffeinate`).
# On battery, lid-close (Clamshell Sleep) suspends the entire bash process tree
# including the watchdog timer, causing indefinite hangs. Apr 7 2026 incident
# confirmed this empirically — see specs/claude-hang-diagnostic.md Section 5
# (R1.A test 2026-04-08 measured 753s for `caffeinate -i sleep 300` on battery+clamshell).
#
# Skip strategy: exit 0 (success) so daily-automated.sh treats this as a normal
# "nothing to do" outcome. The next launchd cycle will retry; the user can also
# manually run when plugged in. The skip happens BEFORE the lock file is taken
# so a battery skip does not consume a lock cycle.
# ============================================================================

POWER_SOURCE=$(pmset -g batt 2>/dev/null | head -1)
case "$POWER_SOURCE" in
    *"Battery Power"*)
        log "On battery power — deferring enrichment to next AC cycle"
        log "  (rationale: clamshell sleep on battery would suspend the watchdog;"
        log "   see specs/claude-hang-diagnostic.md Section 5 for details)"
        exit 0
        ;;
    *"AC Power"*)
        : # proceed
        ;;
    *)
        log "Power source unknown ('$POWER_SOURCE') — proceeding (fail-open)"
        ;;
esac

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
# caffeinate -s asserts no-system-sleep on AC power. Battery case is filtered
# by the precondition check at the top of this script, so we are guaranteed
# to be on AC by this point.
"$CLAUDE_BIN" -p "echo ready" --max-turns 1 --output-format json > /dev/null 2>&1 &
WARMUP_PID=$!
( caffeinate -s sleep 120 && kill "$WARMUP_PID" 2>/dev/null ) &
WATCHDOG_PID=$!
wait "$WARMUP_PID" 2>/dev/null || true
kill "$WATCHDOG_PID" 2>/dev/null || true
wait "$WATCHDOG_PID" 2>/dev/null || true
log "Warm-up complete"

# 9. Run claude -p on each batch (sequential for SQLite safety)
SUCCEEDED=0
FAILED=0

for brief in "${BATCH_FILES[@]}"; do
    BATCH_NAME=$(basename "$brief" .md)
    log "Enriching $BATCH_NAME..."

    BRIEF_CONTENT=$(cat "$brief")
    START_TIME=$(date +%s)

    # Run claude in background with watchdog timer (replaces broken perl alarm)
    "$CLAUDE_BIN" -p "$BRIEF_CONTENT" \
        --output-format text \
        --allowedTools "$ALLOWED_TOOLS" \
        >> "$LOG_FILE" 2>&1 &
    CLAUDE_PID=$!

    # Start watchdog timer in background.
    # caffeinate -s asserts no-system-sleep so the timer survives lid-close on AC power.
    # On battery, the precondition check at the top of this script causes early exit,
    # so we are guaranteed to be on AC by this point.
    # Empirical: caffeinate -i was insufficient (R1.A test 2026-04-08 measured 753s for
    # `caffeinate -i sleep 300` on battery+clamshell). See specs/claude-hang-diagnostic.md.
    ( caffeinate -s sleep "$BATCH_TIMEOUT" && kill "$CLAUDE_PID" 2>/dev/null && log_error "$BATCH_NAME timed out after ${BATCH_TIMEOUT}s (killed PID $CLAUDE_PID)" ) &
    TIMER_PID=$!

    # Wait for claude to finish (or be killed by watchdog)
    wait "$CLAUDE_PID" && EXIT_CODE=0 || EXIT_CODE=$?

    # Cancel the timer if claude finished before timeout
    kill "$TIMER_PID" 2>/dev/null || true
    wait "$TIMER_PID" 2>/dev/null || true

    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))

    if [[ "$EXIT_CODE" -eq 0 ]]; then
        log "$BATCH_NAME completed in ${ELAPSED}s"
        SUCCEEDED=$((SUCCEEDED + 1))
    else
        log_error "$BATCH_NAME failed (exit $EXIT_CODE) after ${ELAPSED}s"
        FAILED=$((FAILED + 1))
    fi
done

# 9. Report
TOTAL_ENRICHED=$((SUCCEEDED * EVENTS_PER_BATCH))
log "=== Auto-enrichment complete ==="
log "Batches: $SUCCEEDED succeeded, $FAILED failed"
log "Events enriched (est): $TOTAL_ENRICHED"

if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi

exit 0
