#!/bin/bash
################################################################################
# Agent Athens - Workflow Status Dashboard
################################################################################
#
# Shows detailed status of daily automation workflow
#
# Usage:
#   ./scripts/workflow-status.sh
################################################################################

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

clear
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Agent Athens - Workflow Status Dashboard         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Database Stats
echo -e "${BLUE}📊 Database Statistics${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
TOTAL=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events")
PAST=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) < date('now')")
TODAY=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) = date('now')")
THIS_WEEK=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) BETWEEN date('now') AND date('now', '+7 days')")
BAD_TIMES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE start_date LIKE '%00:00:00%'")

echo "   Total events: $TOTAL"
echo "   Today: $TODAY"
echo "   This week: $THIS_WEEK"
if [ "$PAST" -eq 0 ]; then
    echo -e "   Past events: ${GREEN}✓ $PAST${NC}"
else
    echo -e "   Past events: ${RED}✗ $PAST (needs cleanup)${NC}"
fi
if [ "$BAD_TIMES" -eq 0 ]; then
    echo -e "   Bad times (00:00:00): ${GREEN}✓ $BAD_TIMES${NC}"
else
    echo -e "   Bad times: ${RED}✗ $BAD_TIMES (needs cleanup)${NC}"
fi
echo ""

# Last Run Info
echo -e "${BLUE}🔄 Last Workflow Execution${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
LAST_LOG=$(ls -t logs/daily-workflow-*.log 2>/dev/null | head -1)
if [ -n "$LAST_LOG" ]; then
    TIMESTAMP=$(basename "$LAST_LOG" | sed 's/daily-workflow-//;s/.log//')
    YEAR=${TIMESTAMP:0:4}
    MONTH=${TIMESTAMP:4:2}
    DAY=${TIMESTAMP:6:2}
    HOUR=${TIMESTAMP:9:2}
    MIN=${TIMESTAMP:11:2}
    SEC=${TIMESTAMP:13:2}

    echo "   Date: $YEAR-$MONTH-$DAY $HOUR:$MIN:$SEC"

    # Extract stats from log
    if grep -q "Daily workflow complete" "$LAST_LOG"; then
        echo -e "   Status: ${GREEN}✓ Completed${NC}"
    else
        echo -e "   Status: ${YELLOW}⚠️  Incomplete or Running${NC}"
    fi

    ERRORS=$(grep -c "❌" "$LAST_LOG" 2>/dev/null || echo "0")
    WARNINGS=$(grep -c "⚠️" "$LAST_LOG" 2>/dev/null || echo "0")

    if [ "$ERRORS" -gt 0 ]; then
        echo -e "   Errors: ${RED}$ERRORS${NC}"
    fi
    if [ "$WARNINGS" -gt 0 ]; then
        echo -e "   Warnings: ${YELLOW}$WARNINGS${NC}"
    fi

    # Try to extract final event count
    FINAL_EVENTS=$(grep "Total events:" "$LAST_LOG" | tail -1 | grep -o "[0-9]*" | head -1)
    if [ -n "$FINAL_EVENTS" ]; then
        echo "   Events processed: $FINAL_EVENTS"
    fi

    echo ""
    echo "   Log file: $LAST_LOG"
else
    echo -e "   ${YELLOW}No workflow runs found${NC}"
    echo "   Run: ./scripts/daily-workflow.sh"
fi
echo ""

# Site Build Status
echo -e "${BLUE}🏗️  Site Build${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
if [ -d "dist" ]; then
    PAGE_COUNT=$(find dist -name "*.html" 2>/dev/null | wc -l | tr -d ' ')
    echo "   Generated pages: $PAGE_COUNT"

    # Check if today.html exists and when it was last modified
    if [ -f "dist/today.html" ]; then
        MODIFIED=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" dist/today.html 2>/dev/null || date -r dist/today.html "+%Y-%m-%d %H:%M")
        echo "   Last build: $MODIFIED"
    fi
else
    echo -e "   ${RED}✗ dist/ not found${NC}"
    echo "   Run: bun run build"
fi
echo ""

# Git Status
echo -e "${BLUE}📝 Git & Deployment${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
BRANCH=$(git branch --show-current)
echo "   Branch: $BRANCH"

MODIFIED=$(git status --short | wc -l | tr -d ' ')
if [ "$MODIFIED" -eq 0 ]; then
    echo -e "   Working tree: ${GREEN}✓ Clean${NC}"
else
    echo -e "   Modified files: ${YELLOW}$MODIFIED${NC}"
fi

# Last commit
LAST_COMMIT=$(git log -1 --format="%h - %s" 2>/dev/null)
COMMIT_TIME=$(git log -1 --format="%ar" 2>/dev/null)
echo "   Last commit: $LAST_COMMIT"
echo "   Committed: $COMMIT_TIME"
echo ""

# Cron Status
echo -e "${BLUE}⏰ Automation Status${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
if crontab -l 2>/dev/null | grep -q "daily-workflow.sh"; then
    echo -e "   Cron job: ${GREEN}✓ Installed${NC}"
    CRON_SCHEDULE=$(crontab -l 2>/dev/null | grep "daily-workflow.sh" | awk '{print $1,$2,$3,$4,$5}')
    echo "   Schedule: $CRON_SCHEDULE (cron format)"
else
    echo -e "   Cron job: ${YELLOW}⚠️  Not installed${NC}"
    echo "   Run: ./scripts/setup-automation.sh"
fi
echo ""

# Recent Logs
echo -e "${BLUE}📋 Recent Activity${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
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

# Overall Status
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
if [ "$PAST" -eq 0 ] && [ "$BAD_TIMES" -eq 0 ] && [ "$PAGE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}║              ✅  System Status: HEALTHY                 ║${NC}"
else
    echo -e "${YELLOW}║           ⚠️   System Needs Attention                  ║${NC}"
fi
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Quick actions
echo -e "${BLUE}Quick Actions:${NC}"
echo "   Check health:      ./scripts/quick-check.sh"
echo "   Run workflow:      ./scripts/daily-workflow.sh"
echo "   Clean database:    bun run scripts/clean-database.ts"
echo "   Rebuild site:      bun run build"
echo ""
