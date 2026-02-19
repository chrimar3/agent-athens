#!/bin/bash
# Daily Update Script for Agent Athens - FULLY AUTOMATED
# Fetches emails, scrapes websites, parses data, imports to database

set -e  # Exit on error

echo "🚀 Agent Athens Daily Update - FULLY AUTOMATED"
echo "=============================================="
echo ""

# 1. Fetch emails from Gmail
echo "📧 Step 1: Fetching emails from Gmail..."
bun run scripts/ingest-emails.ts
echo ""

# 2. Scrape websites (respects frequency)
echo "🕷️  Step 2: Scraping websites..."
python3 scripts/scrape-all-sites.py
echo ""

# 3. Parse HTML → JSON (AUTOMATED with Python)
echo "🔍 Step 3: Parsing HTML to extract events..."
python3 scripts/parse_tier1_sites.py
python3 scripts/parse-full-descriptions.py
echo ""

# 4. Parse emails → JSON (AUTOMATED with TypeScript)
echo "📨 Step 4: Parsing newsletter emails..."
bun run scripts/parse-newsletter-emails.ts
echo ""

# 5. Import all parsed events to database (Athens filter applied automatically)
echo "💾 Step 5: Importing events to database..."
bun run scripts/import-tier1-events.ts
bun run scripts/import-newsletter-events.ts
echo ""

# 6. Clean up old events (7-day retention)
echo "🧹 Step 6: Database cleanup..."
bun run scripts/cleanup-old-events.ts
echo ""

# 7. Summary statistics
echo "📊 Summary:"
sqlite3 data/events.db "SELECT COUNT(*) || ' total events' FROM events;"
sqlite3 data/events.db "SELECT COUNT(*) || ' unenriched events' FROM events WHERE full_description_gr IS NULL;"
echo ""

# 8. Optional next steps
echo "💡 OPTIONAL Next Steps (Claude Code):"
echo "   1. Enrich unenriched events with 400-word Greek descriptions"
echo "   2. Run: bun run build"
echo "   3. Deploy: git push origin main"
echo ""

echo "✅ Fully automated daily update complete!"
echo ""

# 9. Send notification to user
echo "🔔 Sending notification..."
osascript -e "display notification \"Data collection, parsing, and import complete!\" with title \"Agent Athens\" sound name \"Glass\""
