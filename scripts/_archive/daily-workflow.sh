#!/bin/bash
################################################################################
# Agent Athens - Optimized Daily Workflow
################################################################################
#
# This script handles the complete daily data pipeline:
# 1. Fetch emails & scrape websites (all sources in parallel)
# 2. Parse and import events (dynamic file finding)
# 3. Extract missing times & prices (multi-source support, parallel fetching)
# 4. Deduplicate and clean database
# 5. Rebuild site
# 6. Deploy to Netlify
#
# Optimizations:
#   - Parallel time/price fetching (5 pages at a time)
#   - Multi-source support (viva.gr, more.com, athinorama.gr, gazarte.gr)
#   - Smart cleanup (preserves fixable data)
#   - Dynamic file finding (no hardcoded dates)
#
# Usage:
#   ./scripts/daily-workflow.sh
#   ./scripts/daily-workflow.sh --skip-deploy  # Skip deployment
#
# Can be automated with cron:
#   0 6 * * * cd /path/to/agent-athens && ./scripts/daily-workflow.sh
################################################################################

set -e  # Exit on error

# LAUNCHD FIX: Use absolute paths (launchd doesn't reliably pass environment variables)
# Detect home directory even if $HOME is not set
USER_HOME="${HOME:-$(eval echo ~$(whoami))}"
BUN_PATH="$USER_HOME/.bun/bin/bun"
PYTHON_PATH="/usr/bin/python3"

# Build PATH with all necessary directories for launchd
export PATH="$USER_HOME/.bun/bin:$USER_HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="$USER_HOME"

# Verify bun exists
if [ ! -f "$BUN_PATH" ]; then
    echo "❌ ERROR: bun not found at $BUN_PATH"
    echo "   Please install bun: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Create bun alias function for cleaner code
bun() {
    "$BUN_PATH" "$@"
}

# Parse arguments
SKIP_DEPLOY=false
for arg in "$@"; do
    case $arg in
        --skip-deploy)
            SKIP_DEPLOY=true
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
LOG_FILE="logs/daily-workflow-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs

log() {
    echo -e "${GREEN}✅${NC} $1" | tee -a "$LOG_FILE"
}

log_step() {
    echo "" | tee -a "$LOG_FILE"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}$1${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}⚠️${NC}  $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}❌${NC} $1" | tee -a "$LOG_FILE"
}

# Start
echo "" | tee -a "$LOG_FILE"
echo "🚀 Agent Athens - Complete Daily Workflow" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

################################################################################
# STEP 1: Data Collection
################################################################################
log_step "📥 STEP 1: Data Collection"

# 1a. Fetch emails from Gmail
echo "📧 Fetching emails from Gmail..." | tee -a "$LOG_FILE"
if bun run scripts/ingest-emails.ts >> "$LOG_FILE" 2>&1; then
    log "Emails fetched successfully"
else
    log_warn "Email fetch failed (continuing anyway)"
fi

# 1b. Scrape websites
echo "🕷️  Scraping websites..." | tee -a "$LOG_FILE"
if python3 scripts/scrape-all-sites.py >> "$LOG_FILE" 2>&1; then
    log "Websites scraped successfully"
else
    log_warn "Web scraping failed (continuing anyway)"
fi

################################################################################
# STEP 2: Parsing & Import
################################################################################
log_step "🔍 STEP 2: Parsing & Import"

# 2a. Parse ALL HTML sources → JSON (unified parser)
echo "📄 Parsing all HTML files (Viva, More, Gazarte, Athinorama)..." | tee -a "$LOG_FILE"
if python3 scripts/parse-all-html.py >> "$LOG_FILE" 2>&1; then
    log "All HTML sources parsed successfully"
else
    log_warn "HTML parsing failed (continuing anyway)"
fi

# 2c. Parse full descriptions
echo "📝 Parsing full descriptions..." | tee -a "$LOG_FILE"
if python3 scripts/parse-full-descriptions.py >> "$LOG_FILE" 2>&1; then
    log "Full descriptions parsed"
else
    log_warn "Description parsing failed (continuing anyway)"
fi

# 2d. Parse emails
echo "📨 Parsing newsletter emails..." | tee -a "$LOG_FILE"
if bun run scripts/parse-newsletter-emails.ts >> "$LOG_FILE" 2>&1; then
    log "Emails parsed successfully"
else
    log_warn "Email parsing failed (continuing anyway)"
fi

# 2e. Import ALL events (Tier-1 + Athinorama + Clubber iCal + Newsletter)
echo "💾 Importing events from all sources..." | tee -a "$LOG_FILE"
bun run scripts/import-all-events.ts >> "$LOG_FILE" 2>&1
log "Events imported from all sources"

# Check import stats
TOTAL_EVENTS=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events")
log "Total events in database: $TOTAL_EVENTS"

################################################################################
# STEP 3: Data Quality - Extract Missing Data (UNIFIED)
################################################################################
log_step "🔧 STEP 3: Extract Missing Times & Prices (Unified, Parallel)"

# 3a. Check what's missing
MISSING_TIMES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE start_date LIKE '%00:00:00%' OR start_date LIKE '%T00:00%'")
MISSING_PRICES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE price_type = 'paid' AND (price_amount IS NULL OR price_amount = 0)")

echo "Missing times: $MISSING_TIMES (from all sources)" | tee -a "$LOG_FILE"
echo "Missing prices: $MISSING_PRICES (from all sources)" | tee -a "$LOG_FILE"

# 3b. Fetch ALL missing data in single pass (more efficient - one page load per event)
if [ "$MISSING_TIMES" -gt 0 ] || [ "$MISSING_PRICES" -gt 0 ]; then
    echo "📥 Fetching missing data (times + prices in single pass, 5 pages at a time)..." | tee -a "$LOG_FILE"
    if python3 scripts/fetch-missing-data.py --parallel 5 --delay 0.5 >> "$LOG_FILE" 2>&1; then
        # Check final counts
        FINAL_TIMES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE start_date LIKE '%00:00:00%' OR start_date LIKE '%T00:00%'")
        FINAL_PRICES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE price_type = 'paid' AND (price_amount IS NULL OR price_amount = 0)")
        log "Data fetched. Missing: times=$FINAL_TIMES, prices=$FINAL_PRICES"
    else
        log_warn "Data fetching failed (continuing anyway)"
    fi
else
    log "No missing data - skipping"
fi

################################################################################
# STEP 4: Deduplication
################################################################################
log_step "🔄 STEP 4: Deduplication"

echo "🔍 Running 7-pass deduplication..." | tee -a "$LOG_FILE"
if bun run scripts/remove-duplicates.ts >> "$LOG_FILE" 2>&1; then
    log "Deduplication completed"
else
    log_warn "Deduplication failed (continuing anyway)"
fi

################################################################################
# STEP 5: Database Cleanup (SMART MODE)
################################################################################
log_step "🧹 STEP 5: Smart Database Cleanup"

echo "🗑️  Running smart database cleanup (preserves fixable data)..." | tee -a "$LOG_FILE"
bun run scripts/clean-database.ts >> "$LOG_FILE" 2>&1
log "Database cleaned"

# Get final stats
FINAL_EVENTS=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events")
PAST_EVENTS=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) < date('now')")
BAD_TIMES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE start_date LIKE '%00:00:00%' OR start_date LIKE '%T00:00%'")

echo "" | tee -a "$LOG_FILE"
echo "📊 Database Quality Report:" | tee -a "$LOG_FILE"
echo "   Total events: $FINAL_EVENTS" | tee -a "$LOG_FILE"
echo "   Past events: $PAST_EVENTS (should be 0)" | tee -a "$LOG_FILE"
echo "   Missing times: $BAD_TIMES (can be fixed by fetch-times.py)" | tee -a "$LOG_FILE"

if [ "$PAST_EVENTS" -gt 0 ]; then
    log_warn "Database still has past events!"
else
    log "Database is clean ✨"
fi

################################################################################
# STEP 6: Rebuild Site
################################################################################
log_step "🏗️  STEP 6: Rebuild Static Site"

echo "📄 Generating static pages..." | tee -a "$LOG_FILE"
bun run build >> "$LOG_FILE" 2>&1
log "Site rebuilt successfully"

# Count generated pages
PAGE_COUNT=$(find dist -name "*.html" | wc -l | tr -d ' ')
log "Generated $PAGE_COUNT HTML pages"

################################################################################
# STEP 7: Deploy to Netlify
################################################################################
log_step "🚀 STEP 7: Deploy to Netlify"

if [ "$SKIP_DEPLOY" = true ]; then
    log_warn "Skipping deployment (--skip-deploy flag set)"
else
    # Commit changes
    echo "📝 Committing changes to git..." | tee -a "$LOG_FILE"
    git add data/events.db dist/ >> "$LOG_FILE" 2>&1 || true

    if git diff --cached --quiet; then
        log_warn "No changes to commit - skipping deployment"
    else
        COMMIT_MSG="chore: Daily update $(date +%Y-%m-%d) - $FINAL_EVENTS events"
        git commit -m "$COMMIT_MSG" >> "$LOG_FILE" 2>&1
        log "Changes committed"

        # Push to GitHub
        echo "⬆️  Pushing to GitHub..." | tee -a "$LOG_FILE"
        git push origin main >> "$LOG_FILE" 2>&1
        log "Pushed to GitHub"

        # Force Netlify deployment
        echo "🌐 Deploying to Netlify..." | tee -a "$LOG_FILE"
        if netlify deploy --prod --dir=dist >> "$LOG_FILE" 2>&1; then
            log "Deployed to https://agentathens.netlify.app"
        else
            log_error "Netlify deployment failed"
        fi
    fi
fi

################################################################################
# STEP 8: Summary & Notification
################################################################################
log_step "📊 STEP 8: Summary"

echo "" | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "                    DAILY WORKFLOW COMPLETE               " | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "📊 Final Statistics:" | tee -a "$LOG_FILE"
echo "   • Total events: $FINAL_EVENTS" | tee -a "$LOG_FILE"
echo "   • Pages generated: $PAGE_COUNT" | tee -a "$LOG_FILE"
echo "   • Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "🌐 Live site: https://agentathens.netlify.app" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Finished: $(date)" | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"

# Send macOS notification
if command -v osascript &> /dev/null; then
    osascript -e "display notification \"$FINAL_EVENTS events • $PAGE_COUNT pages generated\" with title \"Agent Athens Daily Update Complete\" sound name \"Glass\"" 2>/dev/null || true
fi

log "✅ Daily workflow complete!"
