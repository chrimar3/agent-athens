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
REPORT_DIR="$HOME/Desktop"
THRESHOLD=5  # Minimum events to trigger notification

# Ensure log directory exists
mkdir -p "$LOG_DIR"

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

log "Stats: $UNENRICHED unenriched, $ENRICHED enriched, $TOTAL_VISIBLE total visible"

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
Unenriched events: $UNENRICHED
Enriched events:   $ENRICHED
Total visible:     $TOTAL_VISIBLE

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

  # Calculate batches
  BATCHES=$(( (UNENRICHED + 9) / 10 ))
  EST_TIME=$(( BATCHES * 5 ))

  cat >> "$REPORT_FILE" << EOF

ENRICHMENT ESTIMATE
-------------------
Events to enrich: $UNENRICHED
Batches of 10:    $BATCHES
Est. time:        ~$EST_TIME minutes

HOW TO ENRICH
-------------
1. Open Claude Code in the agent-athens project
2. Say: "Enrich 10 events"
3. Wait ~5 minutes
4. Repeat as needed

Or run: bun run scripts/run-enrichment-pipeline.ts
EOF
fi

echo "" >> "$REPORT_FILE"
echo "===============================================" >> "$REPORT_FILE"

log "Report saved to: $REPORT_FILE"

# Send notification if threshold met
if [ "$UNENRICHED" -ge "$THRESHOLD" ]; then
  log "Sending notification ($UNENRICHED >= $THRESHOLD threshold)"

  osascript -e "display notification \"$UNENRICHED events need enrichment. Check Desktop report.\" with title \"Agent Athens\" subtitle \"Enrichment Reminder\" sound name \"Glass\""

else
  log "Below threshold ($UNENRICHED < $THRESHOLD), no notification"
fi

log "=== Enrichment check complete ==="
