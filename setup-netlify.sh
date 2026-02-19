#!/bin/bash
# Automated Netlify setup for agent-athens

set -e

echo "🚀 Setting up Netlify for agent-athens..."
echo ""

# Navigate to project directory
cd /Users/georgios/Documents/Projects/athens-events/agent-athens

# Use expect to handle interactive prompts
expect << 'EOF'
set timeout 60

spawn netlify init

# First prompt: Link or Create
expect "What would you like to do?"
send "\033\[B\r"
# Down arrow to select "Create & configure a new project"

# Wait for team selection
expect "Team:"
send "\r"
# Default selection (first team)

# Site name prompt
expect "Site name"
send "agent-athens\r"

# Wait for completion
expect "Success!"
send "\r"

expect eof
EOF

echo ""
echo "✅ Netlify setup complete!"
echo ""
echo "Testing deployment..."
netlify deploy --prod --dir=dist

echo ""
echo "🎉 Site should be live at: https://agent-athens.netlify.app"
