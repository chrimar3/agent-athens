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
LOG_DIR="$PROJECT_DIR/logs"
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

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== Starting enrichment check ==="

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
  log "ERROR: Database not found at $DB_PATH"
  exit 1
fi

# Get today's date in SQLite format
TODAY=$(date '+%Y-%m-%d')

# Count unenriched events (visible events with future dates)
UNENRICHED=$(sqlite3 "$DB_PATH" "
  SELECT COUNT(*) FROM events
  WHERE location_status IN ('verified_athens', 'pass_through')
  AND needs_enrichment = 1
  AND start_date >= '$TODAY';
")

# Count total visible future events
TOTAL_VISIBLE=$(sqlite3 "$DB_PATH" "
  SELECT COUNT(*) FROM events
  WHERE location_status IN ('verified_athens', 'pass_through')
  AND start_date >= '$TODAY';
")

# Count already enriched
ENRICHED=$(sqlite3 "$DB_PATH" "
  SELECT COUNT(*) FROM events
  WHERE location_status IN ('verified_athens', 'pass_through')
  AND needs_enrichment = 0
  AND start_date >= '$TODAY';
")

# Count events auto-enriched today (via enrichment_log timestamps)
AUTO_ENRICHED_TODAY=0
HAS_ENRICHMENT_LOG=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='enrichment_log';")
if [ "$HAS_ENRICHMENT_LOG" -gt 0 ]; then
  AUTO_ENRICHED_TODAY=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*) FROM enrichment_log
    WHERE date(created_at) = date('now');
  ")
fi

# Check if auto-enrich log exists for today
AUTO_ENRICH_RAN="false"
AUTO_ENRICH_LOG="$LOG_DIR/auto-enrich-$TODAY.log"
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

  sqlite3 -header -column "$DB_PATH" "
    SELECT
      substr(title, 1, 40) as title,
      start_date as date,
      substr(venue_name, 1, 20) as venue,
      type
    FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
    AND needs_enrichment = 1
    AND start_date >= '$TODAY'
    ORDER BY start_date ASC
    LIMIT 10;
  " >> "$REPORT_FILE"

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
    osascript -e "display notification \"Auto-enriched $AUTO_ENRICHED_TODAY today. $UNENRICHED still pending.\" with title \"Agent Athens\" subtitle \"Enrichment Report\" sound name \"Glass\""
    log "Notification: auto-enriched $AUTO_ENRICHED_TODAY, $UNENRICHED pending"
  elif [ "$UNENRICHED" -ge "$THRESHOLD" ]; then
    osascript -e "display notification \"Auto-enrich ran but 0 enriched. $UNENRICHED pending. Check logs.\" with title \"Agent Athens\" subtitle \"Enrichment Warning\" sound name \"Basso\""
    log "Warning: auto-enrich ran but enriched 0 events"
  fi
elif [ "$UNENRICHED" -ge "$THRESHOLD" ]; then
  # Warning: auto-enrichment may not have run
  osascript -e "display notification \"$UNENRICHED events need enrichment. Auto-enrich may not have run.\" with title \"Agent Athens\" subtitle \"Enrichment Warning\" sound name \"Basso\""
  log "Warning: auto-enrich log not found, $UNENRICHED pending"
else
  log "Below threshold ($UNENRICHED < $THRESHOLD), no notification"
fi

log "=== Enrichment check complete ==="
