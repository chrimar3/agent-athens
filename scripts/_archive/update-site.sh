#!/bin/bash
# Automated workflow to update Agent Athens site
#
# This script:
# 1. Scrapes event websites
# 2. Parses HTML files to database
# 3. Fetches pricing for new events
# 4. Rebuilds the static site
# 5. Deploys to Netlify
#
# Usage: ./scripts/update-site.sh [--skip-scrape] [--skip-prices] [--skip-deploy]

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
SKIP_SCRAPE=false
SKIP_PRICES=false
SKIP_DEPLOY=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --skip-scrape)
      SKIP_SCRAPE=true
      shift
      ;;
    --skip-prices)
      SKIP_PRICES=true
      shift
      ;;
    --skip-deploy)
      SKIP_DEPLOY=true
      shift
      ;;
  esac
done

echo -e "${BLUE}🚀 Agent Athens - Automated Site Update${NC}"
echo "========================================"
echo ""

# Step 1: Scrape websites
if [ "$SKIP_SCRAPE" = false ]; then
  echo -e "${YELLOW}📥 Step 1: Scraping event websites...${NC}"
  python3 scripts/scrape-all-sites.py

  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Scraping failed${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ Scraping complete${NC}"
  echo ""
else
  echo -e "${YELLOW}⏭️  Skipping scraping${NC}"
  echo ""
fi

# Step 2: Parse HTML files to database
echo -e "${YELLOW}📊 Step 2: Parsing HTML files to database...${NC}"

# Count HTML files
HTML_COUNT=$(ls -1 data/html-to-parse/*.html 2>/dev/null | wc -l | tr -d ' ')

if [ "$HTML_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No HTML files to parse${NC}"
else
  echo "Found $HTML_COUNT HTML files to parse"

  # Use the Task tool via Claude Code to parse HTML
  echo "Parsing HTML files..."
  bun run scripts/parse-helper.ts data/html-to-parse/*.html

  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Parsing failed${NC}"
    exit 1
  fi

  # Archive parsed HTML files
  mkdir -p data/html-archive
  mv data/html-to-parse/*.html data/html-archive/ 2>/dev/null || true
  mv data/html-to-parse/*.json data/html-archive/ 2>/dev/null || true

  echo -e "${GREEN}✅ Parsing complete${NC}"
fi
echo ""

# Step 3: Fetch prices for new events
if [ "$SKIP_PRICES" = false ]; then
  echo -e "${YELLOW}💰 Step 3: Fetching prices for events...${NC}"

  # Count events without prices
  NO_PRICE_COUNT=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE url IS NOT NULL AND (price_amount IS NULL OR price_amount = 0) AND date(start_date) >= date('now')" 2>/dev/null || echo "0")

  echo "Events needing price data: $NO_PRICE_COUNT"

  if [ "$NO_PRICE_COUNT" -gt 0 ]; then
    python3 scripts/fetch-prices.py

    if [ $? -ne 0 ]; then
      echo -e "${YELLOW}⚠️  Price fetching had errors, but continuing...${NC}"
    else
      echo -e "${GREEN}✅ Price fetching complete${NC}"
    fi
  else
    echo -e "${GREEN}✅ All events already have prices${NC}"
  fi
  echo ""
else
  echo -e "${YELLOW}⏭️  Skipping price fetching${NC}"
  echo ""
fi

# Step 4: Rebuild static site
echo -e "${YELLOW}🔨 Step 4: Rebuilding static site...${NC}"
bun run build

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Step 5: Deploy to Netlify
if [ "$SKIP_DEPLOY" = false ]; then
  echo -e "${YELLOW}🚀 Step 5: Deploying to Netlify...${NC}"
  netlify deploy --prod --dir=dist

  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ Deployment complete${NC}"
  echo ""
else
  echo -e "${YELLOW}⏭️  Skipping deployment${NC}"
  echo ""
fi

# Summary
echo ""
echo -e "${GREEN}🎉 Site update complete!${NC}"
echo "========================================"

# Show stats
TOTAL_EVENTS=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) >= date('now')" 2>/dev/null || echo "0")
WITH_PRICES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE price_amount > 0 AND date(start_date) >= date('now')" 2>/dev/null || echo "0")

echo ""
echo -e "${BLUE}📊 Current Statistics:${NC}"
echo "  Total upcoming events: $TOTAL_EVENTS"
echo "  Events with prices: $WITH_PRICES"
echo ""
echo -e "${BLUE}🌐 Site URL: https://agentathens.netlify.app${NC}"
echo ""
