#!/bin/bash
################################################################################
# Check Agent Athens Automation Status
################################################################################
#
# Verifies that the daily automation is properly configured and shows status.
#
# Usage:
#   ./scripts/check-automation.sh
################################################################################

echo "🔍 Checking Agent Athens automation status..."
echo ""

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_NAME="com.agentathens.daily"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

# Check OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Platform: macOS (using launchd)"
    echo ""

    # Check if plist exists
    if [ -f "$PLIST_PATH" ]; then
        echo "✅ Plist file exists: $PLIST_PATH"
    else
        echo "❌ Plist file NOT found: $PLIST_PATH"
        echo "   Run: ./scripts/setup-macos-automation.sh"
        exit 1
    fi

    # Check if loaded
    echo ""
    echo "📋 LaunchAgent status:"
    if launchctl list 2>/dev/null | grep -q "$PLIST_NAME"; then
        echo "✅ LaunchAgent is LOADED"
        echo ""
        launchctl list "$PLIST_NAME" 2>/dev/null || true
    else
        echo "❌ LaunchAgent is NOT loaded"
        echo "   Run: launchctl load $PLIST_PATH"
        exit 1
    fi
else
    echo "🐧 Platform: Linux/Other (using cron)"
    echo ""

    # Check cron
    if crontab -l 2>/dev/null | grep -q "daily-workflow.sh"; then
        echo "✅ Cron job is configured"
        echo ""
        echo "📋 Cron entry:"
        crontab -l 2>/dev/null | grep "daily-workflow"
    else
        echo "❌ Cron job NOT found"
        echo "   Run: ./scripts/setup-automation.sh"
        exit 1
    fi
fi

# Check recent logs
echo ""
echo "════════════════════════════════════════════════════════"
echo "                     RECENT LOGS                         "
echo "════════════════════════════════════════════════════════"

# Find most recent workflow log
LATEST_LOG=$(ls -t "$PROJECT_DIR/logs/daily-workflow-"*.log 2>/dev/null | head -1)

if [ -n "$LATEST_LOG" ] && [ -f "$LATEST_LOG" ]; then
    echo ""
    echo "📋 Latest workflow log: $(basename "$LATEST_LOG")"
    echo "   Modified: $(stat -f '%Sm' "$LATEST_LOG" 2>/dev/null || stat -c '%y' "$LATEST_LOG" 2>/dev/null)"
    echo ""
    echo "Last 15 lines:"
    echo "────────────────────────────────────────────────────────"
    tail -15 "$LATEST_LOG"
else
    echo ""
    echo "⚠️  No workflow logs found yet"
    echo "   The automation hasn't run yet, or logs are in a different location."
fi

# Check launchd-specific logs if on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ""

    if [ -f "$PROJECT_DIR/logs/launchd-stdout.log" ]; then
        echo "📋 LaunchD stdout (last 5 lines):"
        echo "────────────────────────────────────────────────────────"
        tail -5 "$PROJECT_DIR/logs/launchd-stdout.log"
    fi

    if [ -f "$PROJECT_DIR/logs/launchd-stderr.log" ]; then
        STDERR_SIZE=$(wc -c < "$PROJECT_DIR/logs/launchd-stderr.log" | tr -d ' ')
        if [ "$STDERR_SIZE" -gt 0 ]; then
            echo ""
            echo "⚠️  LaunchD stderr (last 5 lines):"
            echo "────────────────────────────────────────────────────────"
            tail -5 "$PROJECT_DIR/logs/launchd-stderr.log"
        fi
    fi
fi

# Summary
echo ""
echo "════════════════════════════════════════════════════════"
echo "                      SUMMARY                            "
echo "════════════════════════════════════════════════════════"
echo ""
echo "📅 Schedule: Daily at 6:00 AM"
echo "📁 Project: $PROJECT_DIR"
echo ""
echo "Quick commands:"
echo "  Test now:  launchctl start $PLIST_NAME"
echo "  View logs: tail -f $PROJECT_DIR/logs/daily-workflow-*.log"
echo ""
