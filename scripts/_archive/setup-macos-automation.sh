#!/bin/bash
################################################################################
# Setup Daily Automation for Agent Athens (macOS LaunchAgent)
################################################################################
#
# macOS uses launchd, not cron. This script creates a LaunchAgent that runs
# the daily workflow at 6:00 AM Athens time.
#
# Usage:
#   ./scripts/setup-macos-automation.sh
#
# Commands after setup:
#   Test now:     launchctl start com.agentathens.daily
#   Check status: launchctl list | grep agentathens
#   View logs:    tail -f logs/launchd-*.log
#   Disable:      launchctl unload ~/Library/LaunchAgents/com.agentathens.daily.plist
################################################################################

set -e

echo "🔧 Setting up Agent Athens automation for macOS (launchd)"
echo "=========================================================="
echo ""

# Get absolute paths
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_NAME="com.agentathens.daily.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

# Find bun and python paths
BUN_PATH="$(which bun 2>/dev/null || echo "$HOME/.bun/bin/bun")"
PYTHON_PATH="$(which python3 2>/dev/null || echo "/usr/bin/python3")"

# Validate paths
if [ ! -f "$BUN_PATH" ]; then
    echo "❌ Error: bun not found at $BUN_PATH"
    echo "   Please install bun: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

if [ ! -f "$PYTHON_PATH" ]; then
    echo "❌ Error: python3 not found at $PYTHON_PATH"
    exit 1
fi

echo "📁 Project directory: $PROJECT_DIR"
echo "🔹 Bun path: $BUN_PATH"
echo "🔹 Python path: $PYTHON_PATH"
echo ""

# Ensure directories exist
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$HOME/Library/LaunchAgents"

# Make workflow script executable
chmod +x "$PROJECT_DIR/scripts/daily-workflow.sh"

# Build PATH with all necessary directories
BUN_DIR="$(dirname "$BUN_PATH")"
PYTHON_DIR="$(dirname "$PYTHON_PATH")"
NETLIFY_PATH="$(which netlify 2>/dev/null || echo "")"
NETLIFY_DIR=""
if [ -n "$NETLIFY_PATH" ]; then
    NETLIFY_DIR=":$(dirname "$NETLIFY_PATH")"
fi

FULL_PATH="$BUN_DIR:$PYTHON_DIR$NETLIFY_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Unload existing agent if present
if launchctl list 2>/dev/null | grep -q "com.agentathens.daily"; then
    echo "🔄 Unloading existing LaunchAgent..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Generate plist with correct paths
echo "📝 Creating LaunchAgent plist..."
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.agentathens.daily</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-l</string>
        <string>-c</string>
        <string>cd "$PROJECT_DIR" &amp;&amp; ./scripts/daily-workflow.sh</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>6</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/logs/launchd-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/logs/launchd-stderr.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$FULL_PATH</string>
        <key>HOME</key>
        <string>$HOME</string>
        <key>LANG</key>
        <string>en_US.UTF-8</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>

    <key>RunAtLoad</key>
    <false/>

    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
EOF

# Load the new configuration
echo "🚀 Loading LaunchAgent..."
launchctl load "$PLIST_PATH"

# Verify it loaded
if launchctl list 2>/dev/null | grep -q "com.agentathens.daily"; then
    echo ""
    echo "✅ LaunchAgent installed successfully!"
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "                    SETUP COMPLETE                       "
    echo "════════════════════════════════════════════════════════"
    echo ""
    echo "📅 Schedule: Daily at 6:00 AM"
    echo "📁 Plist: $PLIST_PATH"
    echo "📋 Logs: $PROJECT_DIR/logs/launchd-*.log"
    echo ""
    echo "Commands:"
    echo "  Test now:     launchctl start com.agentathens.daily"
    echo "  Check status: ./scripts/check-automation.sh"
    echo "  View logs:    tail -f $PROJECT_DIR/logs/launchd-*.log"
    echo "  Disable:      launchctl unload $PLIST_PATH"
    echo ""
else
    echo "❌ Failed to load LaunchAgent"
    echo "   Check: launchctl list | grep agentathens"
    exit 1
fi
