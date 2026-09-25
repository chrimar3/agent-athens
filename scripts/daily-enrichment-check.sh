#!/bin/bash
#
# Daily Enrichment Check
# Runs at 9 AM to check for unenriched events and notify the user
#
# This script:
# 1. Counts unenriched events (verified_athens + pass_through, future dates)
# 2. Creates a report on Desktop
# 3. Sends macOS notification if threshold is met
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_DIR/data/events.db"
# Pipeline logs (read only here). Pipeline runs, possibly in a container,
# write this folder.
PIPELINE_LOG_DIR="$PROJECT_DIR/logs"
# This host job's own log lives in the host-only state folder (security loop
# round 4): containers can write the repo's logs/, so a symlink planted there
# would make this job append into any file the owner can write.
LOG_DIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/logs"
REPORT_DIR="$HOME/Desktop/Agent-Athens/enrichment AgentAthens"
THRESHOLD=5  # Minimum events to trigger notification

# Throughput constants — mirror scripts/auto-enrich.sh; update together if those change.
EVENTS_PER_BATCH=5     # matches EVENTS_PER_BATCH in auto-enrich.sh
BATCHES_PER_RUN=2      # matches MAX_BATCHES in auto-enrich.sh
ACTIVE_DAILY_SLOTS=4   # 10:00, 13:00, 16:00, 19:00 (01:00 + 22:00 unloaded S89)

# Ensure log and report directories exist
mkdir -p "$LOG_DIR"
mkdir -p "$REPORT_DIR"

# Log file
LOG_FILE="$LOG_DIR/enrichment-check.log"

refuse() {
  echo "[enrichment-check] REFUSED — $1" >&2
  exit 1
}

# Never write through a symlink, even in the host-only folder.
no_symlink() {
  if [ -L "$1" ]; then
    refuse "$1 is a symlink; something planted it. Inspect it, delete it, then rerun scripts/daily-enrichment-check.sh."
  fi
}
no_symlink "$LOG_DIR"
no_symlink "$LOG_FILE"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# macOS notification. The script text is constant: message, subtitle and
# sound reach AppleScript as arguments, never as script source, so nothing in
# them can run as code (security loop round 4).
# $1 message  $2 subtitle  $3 sound (a built-in sound name)
notify() {
  case "$3" in
    Glass|Basso) ;;
    *) refuse "notify: unknown sound name" ;;
  esac
  osascript -e 'on run argv' \
    -e 'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name (item 4 of argv)' \
    -e 'end run' -- "$1" "Agent Athens" "$2" "$3"
}

# The database is written by pipeline runs; every value read from it that
# reaches a message or an arithmetic test must be a plain count.
require_count() {
  case "$2" in
    ''|*[!0-9]*) refuse "$1 from $DB_PATH is not a non-negative integer (got '${2:0:40}'). Check the database with: sqlite3 -readonly data/events.db" ;;
  esac
}

# Security loop round 8: this host job never opens the container-written
# database itself (a planted FIFO blocks sqlite3; a planted VIEW makes a plain
# SELECT run forever). Every query goes through scripts/untrusted-db-query.ts:
# a private copy, a schema check (no views, no foreign triggers) and a child
# process killed at its wall clock (src/watchdog/untrusted-db.ts).
# AA_UNTRUSTED_DB_CLI is a test seam (fixture copies of this script live
# outside the repo); launchd never sets it.
UNTRUSTED_DB_CLI="${AA_UNTRUSTED_DB_CLI:-$SCRIPT_DIR/untrusted-db-query.ts}"
BUN_BIN="$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")"

log "=== Starting enrichment check ==="

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
  log "ERROR: Database not found at $DB_PATH"
  exit 1
fi

# Get today's date in SQLite format
TODAY=$(date '+%Y-%m-%d')

# One untrusted read for every count and the report's sample rows.
# enrichment_log may be absent (older databases): its count is then empty → 0.
VISIBLE="location_status IN ('verified_athens', 'pass_through') AND start_date >= '$TODAY'"
if ! DB_OUT="$("$BUN_BIN" "$UNTRUSTED_DB_CLI" --db "$DB_PATH" --require-table events \
    --count UNENRICHED events "SELECT COUNT(*) FROM events WHERE $VISIBLE AND needs_enrichment = 1" \
    --count TOTAL_VISIBLE events "SELECT COUNT(*) FROM events WHERE $VISIBLE" \
    --count ENRICHED events "SELECT COUNT(*) FROM events WHERE $VISIBLE AND needs_enrichment = 0" \
    --count AUTO_ENRICHED_TODAY enrichment_log "SELECT COUNT(*) FROM enrichment_log WHERE date(created_at) = date('now')" \
    --rows events "SELECT substr(title, 1, 40) AS title, start_date AS date, substr(venue_name, 1, 20) AS venue, type FROM events WHERE $VISIBLE AND needs_enrichment = 1 ORDER BY start_date ASC LIMIT 10" \
    2>>"$LOG_FILE")"; then
  log "ERROR: $DB_PATH was not read (refused, timed out or failed — see the untrusted-db-query line above)"
  notify "events.db could not be read safely. See enrichment-check.log." "Enrichment Check REFUSED" "Basso"
  refuse "$DB_PATH was not read safely (details in $LOG_FILE). Inspect it with: sqlite3 -readonly data/events.db .schema"
fi

UNENRICHED=""
TOTAL_VISIBLE=""
ENRICHED=""
AUTO_ENRICHED_TODAY=""
while IFS= read -r line; do
  case "$line" in
    '--- rows') break ;;
    UNENRICHED=*) UNENRICHED="${line#*=}" ;;
    TOTAL_VISIBLE=*) TOTAL_VISIBLE="${line#*=}" ;;
    ENRICHED=*) ENRICHED="${line#*=}" ;;
    AUTO_ENRICHED_TODAY=*) AUTO_ENRICHED_TODAY="${line#*=}" ;;
  esac
done <<< "$DB_OUT"
SAMPLE_ROWS="$(printf '%s\n' "$DB_OUT" | sed -n '/^--- rows$/,$p' | sed '1d')"
# No enrichment_log table → no auto-enrichment recorded today.
[ -n "$AUTO_ENRICHED_TODAY" ] || AUTO_ENRICHED_TODAY=0

require_count UNENRICHED "$UNENRICHED"
require_count TOTAL_VISIBLE "$TOTAL_VISIBLE"
require_count ENRICHED "$ENRICHED"
require_count AUTO_ENRICHED_TODAY "$AUTO_ENRICHED_TODAY"

# Check if auto-enrich log exists for today
AUTO_ENRICH_RAN="false"
AUTO_ENRICH_LOG="$PIPELINE_LOG_DIR/auto-enrich-$TODAY.log"
if [ -f "$AUTO_ENRICH_LOG" ]; then
  AUTO_ENRICH_RAN="true"
fi

log "Stats: $UNENRICHED unenriched, $ENRICHED enriched, $TOTAL_VISIBLE total visible, $AUTO_ENRICHED_TODAY auto-enriched today"

# Generate report file
REPORT_DATE=$(date '+%Y%m%d')
REPORT_FILE="$REPORT_DIR/enrichment-report-$REPORT_DATE.txt"

cat > "$REPORT_FILE" << EOF
===============================================
Agent Athens - Enrichment Report
Generated: $(date '+%Y-%m-%d %H:%M:%S')
===============================================

SUMMARY
-------
Unenriched events:      $UNENRICHED
Enriched events:        $ENRICHED
Auto-enriched today:    $AUTO_ENRICHED_TODAY
Total visible:          $TOTAL_VISIBLE

EOF

# Add sample events if there are unenriched ones
if [ "$UNENRICHED" -gt 0 ]; then
  echo "NEXT 10 EVENTS TO ENRICH" >> "$REPORT_FILE"
  echo "-------------------------" >> "$REPORT_FILE"

  printf '%s\n' "$SAMPLE_ROWS" >> "$REPORT_FILE"

  echo "" >> "$REPORT_FILE"

  # Derived throughput — see constants at top of script
  EVENTS_PER_DAY=$(( BATCHES_PER_RUN * EVENTS_PER_BATCH * ACTIVE_DAILY_SLOTS ))
  BATCHES_NEEDED=$(( (UNENRICHED + EVENTS_PER_BATCH - 1) / EVENTS_PER_BATCH ))
  DAYS_TO_CLEAR=$(( (UNENRICHED + EVENTS_PER_DAY - 1) / EVENTS_PER_DAY ))

  cat >> "$REPORT_FILE" << EOF

ENRICHMENT ESTIMATE
-------------------
Events to enrich:  $UNENRICHED
Batches ($EVENTS_PER_BATCH each):   $BATCHES_NEEDED
Days to clear:     ~$DAYS_TO_CLEAR (at $EVENTS_PER_DAY/day = $ACTIVE_DAILY_SLOTS slots x $BATCHES_PER_RUN batches x $EVENTS_PER_BATCH events)

HOW TO ENRICH (AUTOMATED)
--------------------------
Auto-enrichment runs daily as part of the pipeline.
Today: $AUTO_ENRICHED_TODAY events auto-enriched, $UNENRICHED remaining.

Manual fallback:
  cd ~/Project\ with\ Claude/AgentAthens/agent-athens
  ./scripts/auto-enrich.sh
EOF
fi

echo "" >> "$REPORT_FILE"
echo "===============================================" >> "$REPORT_FILE"

log "Report saved to: $REPORT_FILE"

# Send notification based on auto-enrichment status
if [ "$AUTO_ENRICH_RAN" == "true" ]; then
  # Informational: auto-enrichment ran
  if [ "$AUTO_ENRICHED_TODAY" -gt 0 ]; then
    notify "Auto-enriched $AUTO_ENRICHED_TODAY today. $UNENRICHED still pending." "Enrichment Report" "Glass"
    log "Notification: auto-enriched $AUTO_ENRICHED_TODAY, $UNENRICHED pending"
  elif [ "$UNENRICHED" -ge "$THRESHOLD" ]; then
    notify "Auto-enrich ran but 0 enriched. $UNENRICHED pending. Check logs." "Enrichment Warning" "Basso"
    log "Warning: auto-enrich ran but enriched 0 events"
  fi
elif [ "$UNENRICHED" -ge "$THRESHOLD" ]; then
  # Warning: auto-enrichment may not have run
  notify "$UNENRICHED events need enrichment. Auto-enrich may not have run." "Enrichment Warning" "Basso"
  log "Warning: auto-enrich log not found, $UNENRICHED pending"
else
  log "Below threshold ($UNENRICHED < $THRESHOLD), no notification"
fi

log "=== Enrichment check complete ==="
