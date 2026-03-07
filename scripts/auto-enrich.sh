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

CLAUDE_BIN="/Users/chrism/.npm-global/bin/claude"
ALLOWED_TOOLS="Bash Read Write WebSearch Glob Grep WebFetch"
MAX_BATCHES=3
EVENTS_PER_BATCH=3
MIN_QUEUE=3
BATCH_TIMEOUT=900  # 15 minutes max per batch (batches avg 7-9 min)

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

# 8. Run claude -p on each batch (sequential for SQLite safety)
SUCCEEDED=0
FAILED=0

for brief in "${BATCH_FILES[@]}"; do
    BATCH_NAME=$(basename "$brief" .md)
    log "Enriching $BATCH_NAME..."

    BRIEF_CONTENT=$(cat "$brief")
    START_TIME=$(date +%s)

    # Fix #2: timeout prevents 105-min hangs on network failures
    # macOS lacks coreutils `timeout`, so use perl wrapper
    if perl -e "alarm $BATCH_TIMEOUT; exec @ARGV" -- \
        "$CLAUDE_BIN" -p "$BRIEF_CONTENT" \
        --output-format text \
        --allowedTools "$ALLOWED_TOOLS" \
        >> "$LOG_FILE" 2>&1; then
        END_TIME=$(date +%s)
        ELAPSED=$((END_TIME - START_TIME))
        log "$BATCH_NAME completed in ${ELAPSED}s"
        SUCCEEDED=$((SUCCEEDED + 1))
    else
        END_TIME=$(date +%s)
        ELAPSED=$((END_TIME - START_TIME))
        log_error "$BATCH_NAME failed after ${ELAPSED}s"
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
