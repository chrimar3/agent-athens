#!/bin/bash
################################################################################
# Agent Athens - Unified Status Dashboard
################################################################################
#
# Combined status script - replaces check-stats.sh, quick-check.sh, workflow-status.sh
#
# Usage:
#   ./scripts/status.sh           # Full dashboard
#   ./scripts/status.sh --quick   # Quick health check only
#   ./scripts/status.sh --stats   # Database stats only
#
################################################################################

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
QUICK_MODE=false
STATS_MODE=false
for arg in "$@"; do
    case $arg in
        --quick|-q)
            QUICK_MODE=true
            ;;
        --stats|-s)
            STATS_MODE=true
            ;;
    esac
done

# Header
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Agent Athens - Status Dashboard                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo -e "   $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# =============================================================================
# DATABASE STATS (always shown)
# =============================================================================
echo -e "${CYAN}📊 DATABASE${NC}"
echo -e "────────────────────────────────────────────────────────────────"

if [ -f "data/events.db" ]; then
    # Core counts
    TOTAL=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events")
    UPCOMING=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) >= date('now')")
    PAST=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) < date('now')")
    TODAY=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) = date('now')")
    THIS_WEEK=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) BETWEEN date('now') AND date('now', '+7 days')")

    # Quality metrics
    BAD_TIMES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE start_date LIKE '%00:00:00%' OR start_date LIKE '%T00:00%'")
    WITH_PRICES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE price_amount > 0 AND date(start_date) >= date('now')")
    MISSING_PRICES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE price_type = 'paid' AND (price_amount IS NULL OR price_amount = 0) AND date(start_date) >= date('now')")

    echo "   📅 Events"
    echo "      Total: $TOTAL | Upcoming: $UPCOMING | Today: $TODAY | This week: $THIS_WEEK"

    # Quality indicators
    echo ""
    echo "   ✅ Quality"
    if [ "$PAST" -eq 0 ]; then
        echo -e "      Past events:    ${GREEN}✓ 0${NC}"
    else
        echo -e "      Past events:    ${RED}✗ $PAST (needs cleanup)${NC}"
    fi

    if [ "$BAD_TIMES" -eq 0 ]; then
        echo -e "      Bad times:      ${GREEN}✓ 0${NC}"
    else
        echo -e "      Bad times:      ${YELLOW}⚠ $BAD_TIMES (run fetch-missing-data.py)${NC}"
    fi

    if [ "$UPCOMING" -gt 0 ]; then
        PRICE_PCT=$((WITH_PRICES * 100 / UPCOMING))
        if [ "$PRICE_PCT" -ge 80 ]; then
            echo -e "      Price coverage: ${GREEN}✓ $PRICE_PCT%${NC} ($WITH_PRICES/$UPCOMING)"
        elif [ "$PRICE_PCT" -ge 50 ]; then
            echo -e "      Price coverage: ${YELLOW}⚠ $PRICE_PCT%${NC} ($WITH_PRICES/$UPCOMING)"
        else
            echo -e "      Price coverage: ${RED}✗ $PRICE_PCT%${NC} ($WITH_PRICES/$UPCOMING)"
        fi
    fi

    # Extended stats for full mode
    if [ "$STATS_MODE" = true ] || ([ "$QUICK_MODE" = false ] && [ "$STATS_MODE" = false ]); then
        echo ""
        echo "   📌 By Source"
        sqlite3 data/events.db "
            SELECT source, COUNT(*)
            FROM events
            WHERE date(start_date) >= date('now')
            GROUP BY source
            ORDER BY COUNT(*) DESC
        " | while IFS='|' read source count; do
            printf "      %-15s %4d events\n" "$source" "$count"
        done

        echo ""
        echo "   🎭 By Type"
        sqlite3 data/events.db "
            SELECT type, COUNT(*)
            FROM events
            WHERE date(start_date) >= date('now')
            GROUP BY type
            ORDER BY COUNT(*) DESC
        " | while IFS='|' read type count; do
            printf "      %-12s %4d events\n" "$type" "$count"
        done

        # Price stats
        if [ "$WITH_PRICES" -gt 0 ]; then
            MIN=$(sqlite3 data/events.db "SELECT MIN(price_amount) FROM events WHERE price_amount > 0 AND date(start_date) >= date('now')")
            MAX=$(sqlite3 data/events.db "SELECT MAX(price_amount) FROM events WHERE price_amount > 0 AND date(start_date) >= date('now')")
            AVG=$(sqlite3 data/events.db "SELECT CAST(AVG(price_amount) AS INTEGER) FROM events WHERE price_amount > 0 AND date(start_date) >= date('now')")

            echo ""
            echo "   💰 Prices"
            echo "      Min: €$MIN | Max: €$MAX | Avg: €$AVG"
        fi
    fi
else
    echo -e "   ${RED}❌ Database not found (data/events.db)${NC}"
fi
echo ""

# Exit early for stats-only mode
if [ "$STATS_MODE" = true ]; then
    exit 0
fi

# =============================================================================
# SITE BUILD
# =============================================================================
echo -e "${CYAN}🏗️  SITE BUILD${NC}"
echo -e "────────────────────────────────────────────────────────────────"
if [ -d "dist" ]; then
    PAGE_COUNT=$(find dist -name "*.html" 2>/dev/null | wc -l | tr -d ' ')
    echo "   Generated pages: $PAGE_COUNT"

    if [ -f "dist/today.html" ]; then
        MODIFIED=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" dist/today.html 2>/dev/null || date -r dist/today.html "+%Y-%m-%d %H:%M")
        echo "   Last build: $MODIFIED"
    fi
else
    echo -e "   ${RED}✗ dist/ not found - run: bun run build${NC}"
fi
echo ""

# Exit early for quick mode
if [ "$QUICK_MODE" = true ]; then
    # Quick overall status
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if [ "$PAST" -eq 0 ] && [ "$BAD_TIMES" -eq 0 ]; then
        echo -e "${GREEN}✅ System Health: GOOD${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  System Health: NEEDS ATTENTION${NC}"
        [ "$PAST" -gt 0 ] && echo "   • Run: bun run scripts/clean-database.ts"
        [ "$BAD_TIMES" -gt 0 ] && echo "   • Run: python3 scripts/fetch-missing-data.py"
        exit 1
    fi
fi

# =============================================================================
# WORKFLOW STATUS
# =============================================================================
echo -e "${CYAN}🔄 LAST WORKFLOW${NC}"
echo -e "────────────────────────────────────────────────────────────────"
LAST_LOG=$(ls -t logs/daily-workflow-*.log 2>/dev/null | head -1)
if [ -n "$LAST_LOG" ]; then
    TIMESTAMP=$(basename "$LAST_LOG" | sed 's/daily-workflow-//;s/.log//')
    YEAR=${TIMESTAMP:0:4}
    MONTH=${TIMESTAMP:4:2}
    DAY=${TIMESTAMP:6:2}
    HOUR=${TIMESTAMP:9:2}
    MIN=${TIMESTAMP:11:2}

    echo "   Date: $YEAR-$MONTH-$DAY $HOUR:$MIN"

    if grep -q "Daily workflow complete" "$LAST_LOG"; then
        echo -e "   Status: ${GREEN}✓ Completed${NC}"
    else
        echo -e "   Status: ${YELLOW}⚠️  Incomplete${NC}"
    fi

    ERRORS=$(grep -c "❌" "$LAST_LOG" 2>/dev/null || echo "0")
    WARNINGS=$(grep -c "⚠️" "$LAST_LOG" 2>/dev/null || echo "0")

    [ "$ERRORS" -gt 0 ] && echo -e "   Errors: ${RED}$ERRORS${NC}"
    [ "$WARNINGS" -gt 0 ] && echo -e "   Warnings: ${YELLOW}$WARNINGS${NC}"

    echo "   Log: $LAST_LOG"
else
    echo -e "   ${YELLOW}No workflow logs found${NC}"
fi
echo ""

# =============================================================================
# GIT & DEPLOYMENT
# =============================================================================
echo -e "${CYAN}📝 GIT & DEPLOY${NC}"
echo -e "────────────────────────────────────────────────────────────────"
BRANCH=$(git branch --show-current 2>/dev/null)
MODIFIED=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
LAST_COMMIT=$(git log -1 --format="%h - %s" 2>/dev/null)
COMMIT_TIME=$(git log -1 --format="%ar" 2>/dev/null)

echo "   Branch: $BRANCH"
if [ "$MODIFIED" -eq 0 ]; then
    echo -e "   Working tree: ${GREEN}✓ Clean${NC}"
else
    echo -e "   Modified files: ${YELLOW}$MODIFIED${NC}"
fi
echo "   Last commit: $LAST_COMMIT ($COMMIT_TIME)"
echo ""

# =============================================================================
# AUTOMATION
# =============================================================================
echo -e "${CYAN}⏰ AUTOMATION${NC}"
echo -e "────────────────────────────────────────────────────────────────"
if crontab -l 2>/dev/null | grep -q "daily-workflow.sh"; then
    echo -e "   Cron job: ${GREEN}✓ Installed${NC}"
    CRON_SCHEDULE=$(crontab -l 2>/dev/null | grep "daily-workflow.sh" | awk '{print $1,$2,$3,$4,$5}')
    echo "   Schedule: $CRON_SCHEDULE"
else
    echo -e "   Cron job: ${YELLOW}⚠️  Not installed${NC}"
fi

# Check for running processes
if pgrep -f "fetch-missing-data.py" > /dev/null; then
    echo -e "   ${BLUE}🔄 fetch-missing-data.py is running${NC}"
fi
if pgrep -f "scrape-all-sites.py" > /dev/null; then
    echo -e "   ${BLUE}🔄 scrape-all-sites.py is running${NC}"
fi
echo ""

# =============================================================================
# RECENT RUNS
# =============================================================================
echo -e "${CYAN}📋 RECENT RUNS (last 5)${NC}"
echo -e "────────────────────────────────────────────────────────────────"
RECENT_LOGS=$(ls -t logs/daily-workflow-*.log 2>/dev/null | head -5)
if [ -n "$RECENT_LOGS" ]; then
    echo "$RECENT_LOGS" | while read log; do
        TIMESTAMP=$(basename "$log" | sed 's/daily-workflow-//;s/.log//')
        YEAR=${TIMESTAMP:0:4}
        MONTH=${TIMESTAMP:4:2}
        DAY=${TIMESTAMP:6:2}
        HOUR=${TIMESTAMP:9:2}
        MIN=${TIMESTAMP:11:2}

        if grep -q "Daily workflow complete" "$log"; then
            echo -e "   ${GREEN}✓${NC} $YEAR-$MONTH-$DAY $HOUR:$MIN"
        else
            echo -e "   ${YELLOW}⚠${NC} $YEAR-$MONTH-$DAY $HOUR:$MIN"
        fi
    done
else
    echo "   No recent logs"
fi
echo ""

# =============================================================================
# OVERALL STATUS
# =============================================================================
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
if [ "$PAST" -eq 0 ] && [ "$BAD_TIMES" -eq 0 ] && [ -d "dist" ]; then
    echo -e "${GREEN}                    ✅ System Status: HEALTHY                    ${NC}"
else
    echo -e "${YELLOW}                  ⚠️  System Needs Attention                     ${NC}"
fi
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Quick commands
echo -e "${BLUE}Quick Commands:${NC}"
echo "   ./scripts/status.sh --quick    # Quick health check"
echo "   ./scripts/status.sh --stats    # Database stats only"
echo "   ./scripts/daily-workflow.sh    # Run full workflow"
echo "   bun run scripts/clean-database.ts  # Clean database"
echo ""
