#!/bin/bash
################################################################################
# Agent Athens - Quick Health Check
################################################################################
#
# Fast validation of system health - run anytime to check status
#
# Usage:
#   ./scripts/quick-check.sh
################################################################################

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}      Agent Athens - Quick Health Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Database Health
echo -e "${BLUE}📊 Database Health${NC}"
TOTAL=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events")
PAST=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) < date('now')")
BAD_TIMES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE start_date LIKE '%00:00:00%'")

echo "   Total events: $TOTAL"
if [ "$PAST" -eq 0 ]; then
    echo -e "   Past events: ${GREEN}✓ 0${NC}"
else
    echo -e "   Past events: ${RED}✗ $PAST (should be 0)${NC}"
fi

if [ "$BAD_TIMES" -eq 0 ]; then
    echo -e "   Bad times (00:00:00): ${GREEN}✓ 0${NC}"
else
    echo -e "   Bad times (00:00:00): ${RED}✗ $BAD_TIMES (should be 0)${NC}"
fi
echo ""

# Site Build
echo -e "${BLUE}🏗️  Site Build${NC}"
if [ -d "dist" ]; then
    PAGE_COUNT=$(find dist -name "*.html" 2>/dev/null | wc -l | tr -d ' ')
    echo -e "   Generated pages: ${GREEN}$PAGE_COUNT${NC}"
else
    echo -e "   ${YELLOW}⚠️  dist/ folder not found - run: bun run build${NC}"
fi
echo ""

# Git Status
echo -e "${BLUE}📝 Git Status${NC}"
MODIFIED=$(git status --short | wc -l | tr -d ' ')
if [ "$MODIFIED" -eq 0 ]; then
    echo -e "   Working tree: ${GREEN}✓ Clean${NC}"
else
    echo -e "   Modified files: ${YELLOW}$MODIFIED${NC}"
fi

BRANCH=$(git branch --show-current)
echo "   Current branch: $BRANCH"
echo ""

# Last Workflow Run
echo -e "${BLUE}🔄 Last Workflow Run${NC}"
LAST_LOG=$(ls -t logs/daily-workflow-*.log 2>/dev/null | head -1)
if [ -n "$LAST_LOG" ]; then
    LAST_RUN=$(basename "$LAST_LOG" | sed 's/daily-workflow-//;s/.log//')
    echo "   Last run: $LAST_RUN"

    # Check for errors
    ERRORS=$(grep -c "❌" "$LAST_LOG" 2>/dev/null || echo "0")
    WARNINGS=$(grep -c "⚠️" "$LAST_LOG" 2>/dev/null || echo "0")

    if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
        echo -e "   Status: ${GREEN}✓ Success${NC}"
    elif [ "$ERRORS" -gt 0 ]; then
        echo -e "   Status: ${RED}✗ Errors: $ERRORS${NC}"
    else
        echo -e "   Status: ${YELLOW}⚠️  Warnings: $WARNINGS${NC}"
    fi
else
    echo -e "   ${YELLOW}No workflow logs found${NC}"
fi
echo ""

# Overall Status
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ "$PAST" -eq 0 ] && [ "$BAD_TIMES" -eq 0 ]; then
    echo -e "${GREEN}✅ System Health: GOOD${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  System Health: NEEDS ATTENTION${NC}"
    echo ""
    echo "Run cleanup: bun run scripts/clean-database.ts"
    exit 1
fi
