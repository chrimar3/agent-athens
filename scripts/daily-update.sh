#!/bin/bash
# Daily Update Script for Agent Athens
# Fetches emails, scrapes websites, and prepares data for Claude Code parsing

set -e  # Exit on error

echo "🚀 Agent Athens Daily Update"
echo "============================"
echo ""

# 1. Fetch emails from Gmail
echo "📧 Step 1: Fetching emails from Gmail..."
bun run fetch-emails
echo ""

# 2. Scrape websites (respects frequency)
echo "🕷️  Step 2: Scraping websites..."
python3 scripts/scrape-all-sites.py
echo ""

# 3. Summary
echo "📊 Summary:"
echo "   - Emails saved to: data/emails-to-parse/"
echo "   - HTML saved to: data/html-to-parse/"
echo ""

# 4. Next steps
echo "💡 Next Steps (with Claude Code):"
echo "   1. Ask: 'Parse emails in data/emails-to-parse/ and add events to database'"
echo "   2. Ask: 'Parse HTML in data/html-to-parse/ and extract events'"
echo "   3. Ask: 'Generate AI descriptions for unenriched events'"
echo "   4. Run: bun run build"
echo "   5. Commit and deploy"
echo ""

echo "✅ Daily update preparation complete!"
