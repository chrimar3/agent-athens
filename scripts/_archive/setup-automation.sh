#!/bin/bash
################################################################################
# Setup Daily Automation for Agent Athens
################################################################################
#
# This script sets up automated daily workflow execution.
# - On macOS: Uses launchd (LaunchAgent)
# - On Linux: Uses cron
#
# The workflow will run every day at 6:00 AM and:
# 1. Fetch emails & scrape websites
# 2. Parse and import events
# 3. Extract missing times & prices
# 4. Clean database
# 5. Rebuild site
# 6. Deploy to Netlify
#
# Usage:
#   ./scripts/setup-automation.sh
################################################################################

set -e

echo "🔧 Setting up Agent Athens Daily Automation"
echo "============================================"
echo ""

# Get the absolute path to the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Project directory: $PROJECT_DIR"
echo ""

# Detect OS and use appropriate method
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Detected macOS - using launchd (LaunchAgent)"
    echo ""

    # Delegate to macOS-specific script
    exec "$PROJECT_DIR/scripts/setup-macos-automation.sh"
else
    echo "🐧 Detected Linux/Other - using cron"
    echo ""

    # Check if cron is available
    if ! command -v crontab &> /dev/null; then
        echo "❌ Error: crontab command not found"
        echo "   Please install cron or run the workflow manually"
        exit 1
    fi

    # Create cron job entry (with properly quoted path for spaces)
    CRON_JOB="0 6 * * * cd '$PROJECT_DIR' && ./scripts/daily-workflow.sh >> logs/cron.log 2>&1"

    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "daily-workflow.sh"; then
        echo "⚠️  Cron job already exists. Updating it..."
        # Remove old entry
        crontab -l 2>/dev/null | grep -v "daily-workflow.sh" | crontab -
    fi

    # Add new cron job
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

    echo "✅ Cron job installed successfully!"
    echo ""
    echo "📅 Schedule: Every day at 6:00 AM"
    echo "📝 Command: $CRON_JOB"
    echo ""
    echo "To view all cron jobs:"
    echo "  crontab -l"
    echo ""
    echo "To remove the cron job:"
    echo "  crontab -e"
    echo "  (then delete the line with 'daily-workflow.sh')"
    echo ""
    echo "To run manually:"
    echo "  ./scripts/daily-workflow.sh"
    echo ""
    echo "Logs will be saved to:"
    echo "  logs/daily-workflow-YYYYMMDD-HHMMSS.log"
    echo "  logs/cron.log"
    echo ""
    echo "✅ Setup complete!"
fi
