#!/bin/bash
#
# Setup Mac Automation for Agent Athens
# Configures launchd to run daily enrichment checks
#

set -e

echo "🍎 Setting up Mac Automation for Agent Athens"
echo ""

# Create logs directory if needed
mkdir -p logs

# Load the launchd agent
echo "📋 Loading launchd agent..."
launchctl unload ~/Library/LaunchAgents/com.agentoathens.enrichment-check.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.agentoathens.enrichment-check.plist

echo ""
echo "✅ Mac automation setup complete!"
echo ""
echo "📅 SCHEDULE:"
echo "   Daily at 9:00 AM"
echo ""
echo "🔔 WHAT HAPPENS:"
echo "   1. Checks for unenriched events"
echo "   2. Creates report on Desktop"
echo "   3. Sends macOS notification if ≥10 events need enrichment"
echo ""
echo "🧪 TEST NOW:"
echo "   ./scripts/daily-enrichment-check.sh"
echo ""
echo "📊 VIEW LOGS:"
echo "   tail -f logs/enrichment-check.log"
echo ""
echo "🛑 TO DISABLE:"
echo "   launchctl unload ~/Library/LaunchAgents/com.agentoathens.enrichment-check.plist"
echo ""

