#!/bin/bash
#
# Daily Enrichment Check - Mac Automation
# Runs daily at 9 AM via launchd
#
# What it does:
# 1. Checks how many events need enrichment
# 2. If > 10 events, sends macOS notification
# 3. Creates a ready-to-use report for Claude Code
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Get current date in Athens timezone
TODAY=$(TZ="Europe/Athens" date +%Y-%m-%d)

# Count unenriched future events
UNENRICHED=$(sqlite3 data/events.db <<SQL
SELECT COUNT(*) FROM events
WHERE (full_description_gr IS NULL OR full_description_gr = '')
  AND start_date >= '$TODAY'
SQL
)

# Create enrichment report
REPORT_FILE="$HOME/Desktop/enrichment-report-$(date +%Y%m%d).txt"

cat > "$REPORT_FILE" << REPORT
🤖 Agent Athens - Daily Enrichment Report
Generated: $(date '+%Y-%m-%d %H:%M')

📊 ENRICHMENT STATUS:
   Unenriched future events: $UNENRICHED
   Target batch size: 10 events
   Estimated time: ~5 minutes

📋 NEXT STEPS:
   1. Open Claude Code in this project
   2. Say: "Enrich 10 events using seo-content-writer agent"
   3. I'll handle the rest!

🔄 WORKFLOW:
   Claude Code → Task tool → seo-content-writer agent → 400-word Greek descriptions

✅ BENEFITS:
   - FREE (no API costs)
   - High quality (cultural context, artist info)
   - Fast (10 events in ~5 minutes)
   - SEO optimized (400-600 words)

---

Sample events needing enrichment:
$(sqlite3 data/events.db <<SQL
SELECT '  - ' || title || ' (' || date(start_date) || ' at ' || venue_name || ')'
FROM events
WHERE (full_description_gr IS NULL OR full_description_gr = '')
  AND start_date >= '$TODAY'
ORDER BY start_date ASC
LIMIT 5
SQL
)

... and $((UNENRICHED - 5)) more events

REPORT

# Send macOS notification if threshold met
if [ "$UNENRICHED" -ge 10 ]; then
    osascript -e "display notification \"$UNENRICHED events need enrichment. Check Desktop for report.\" with title \"Agent Athens\" sound name \"Glass\""
fi

echo "✅ Report created: $REPORT_FILE"
echo "📊 Unenriched events: $UNENRICHED"

