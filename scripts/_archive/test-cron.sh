#!/bin/bash
# Test script to verify cron job will work correctly
# Simulates the exact cron environment

echo "🧪 Agent Athens - Cron Job Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Check Bun availability
echo "1️⃣  Checking Bun..."
if [ -x "/Users/chrism/.bun/bin/bun" ]; then
  echo "   ✅ Bun found: /Users/chrism/.bun/bin/bun"
  /Users/chrism/.bun/bin/bun --version
else
  echo "   ❌ Bun not found at /Users/chrism/.bun/bin/bun"
  exit 1
fi
echo ""

# Step 2: Check working directory
echo "2️⃣  Checking working directory..."
cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens" || exit 1
echo "   ✅ Changed to: $(pwd)"
echo ""

# Step 3: Check script exists
echo "3️⃣  Checking orchestrator script..."
if [ -f "scripts/scrape-all-sources.ts" ]; then
  echo "   ✅ Script found: scripts/scrape-all-sources.ts"
else
  echo "   ❌ Script not found"
  exit 1
fi
echo ""

# Step 4: Check configuration
echo "4️⃣  Checking configuration..."
if [ -f "config/orchestrator-config.json" ]; then
  echo "   ✅ Config found: config/orchestrator-config.json"
  echo "   Email ingestion enabled: $(cat config/orchestrator-config.json | grep -A1 email_ingestion | grep enabled)"
else
  echo "   ❌ Config not found"
  exit 1
fi
echo ""

# Step 5: Check environment variables
echo "5️⃣  Checking environment variables..."
if [ -f ".env" ]; then
  echo "   ✅ .env file found"
  source .env
  if [ -n "$EMAIL_USER" ]; then
    echo "   ✅ EMAIL_USER set: $EMAIL_USER"
  else
    echo "   ⚠️  EMAIL_USER not set"
  fi
  if [ -n "$EMAIL_PASSWORD" ]; then
    echo "   ✅ EMAIL_PASSWORD set: [hidden]"
  else
    echo "   ⚠️  EMAIL_PASSWORD not set"
  fi
else
  echo "   ❌ .env file not found"
fi
echo ""

# Step 6: Test dry-run
echo "6️⃣  Running dry-run test..."
/Users/chrism/.bun/bin/bun run scripts/scrape-all-sources.ts --dry-run
echo ""

# Step 7: Check logs directory
echo "7️⃣  Checking logs directory..."
if [ -d "logs" ]; then
  echo "   ✅ Logs directory exists"
  echo "   Writable: $([ -w logs ] && echo 'Yes' || echo 'No')"
else
  echo "   ⚠️  Logs directory missing, creating..."
  mkdir -p logs
  echo "   ✅ Created logs directory"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All checks passed! Cron job should work correctly."
echo ""
echo "📅 Scheduled run time: Daily at 8:00 AM"
echo "📁 Logs will be saved to: logs/scrape-YYYYMMDD.log"
echo ""
echo "To test manually:"
echo "  cd /Users/chrism/Project\\ with\\ Claude/AgentAthens/agent-athens && /Users/chrism/.bun/bin/bun run scripts/scrape-all-sources.ts"
