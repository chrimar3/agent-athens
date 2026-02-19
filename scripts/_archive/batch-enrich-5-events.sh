#!/bin/bash
#
# Batch Enrichment Script - Enriches 5 events at a time
# This script is designed to be run by Claude Code via Task tool
# or manually by the user
#
# Usage: ./scripts/batch-enrich-5-events.sh
#

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🤖 Batch Enrichment - Starting..."
echo "📂 Working directory: $PROJECT_ROOT"
echo ""

# Get 5 unenriched future events
echo "📊 Querying database for unenriched events..."
EVENTS=$(sqlite3 data/events.db <<EOF
SELECT json_object(
  'id', id,
  'title', title,
  'type', type,
  'venue_name', venue_name,
  'venue_address', venue_address,
  'start_date', start_date,
  'price_type', price_type,
  'description', description,
  'genres', genres
)
FROM events
WHERE (full_description_gr IS NULL OR full_description_gr = '')
  AND start_date >= date('now')
ORDER BY start_date ASC
LIMIT 5;
EOF
)

# Check if we got any events
EVENT_COUNT=$(echo "$EVENTS" | wc -l | tr -d ' ')

if [ "$EVENT_COUNT" -eq 0 ]; then
  echo "✅ No events need enrichment!"
  exit 0
fi

echo "📋 Found $EVENT_COUNT events to enrich"
echo ""

# Create a temporary file to store event JSON
EVENTS_FILE="/tmp/events-to-enrich-$$.json"
echo "$EVENTS" > "$EVENTS_FILE"

echo "📝 Event list saved to: $EVENTS_FILE"
echo ""
echo "⚠️  NEXT STEP: Claude Code needs to:"
echo "   1. Read $EVENTS_FILE"
echo "   2. For each event, call Task tool with seo-content-writer agent"
echo "   3. Update database with generated descriptions"
echo ""
echo "💡 This is where Mac automation stops - Task tool is Claude Code-only"
echo ""

# Display events for manual processing
echo "=".repeat(60)
echo "EVENTS TO PROCESS:"
echo "=".repeat(60)
cat "$EVENTS_FILE"
echo ""

exit 0
