#!/bin/bash
################################################################################
# Agent Athens - Session Diagnostic
################################################################################
#
# Data-driven snapshot for planning a Claude Code session.
# Run at the start of every session to see what needs attention.
#
# Usage:
#   ./scripts/session-diagnostic.sh
#
################################################################################

set -euo pipefail

# Resolve project root (script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB="$PROJECT_ROOT/data/events.db"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Check DB exists
if [ ! -f "$DB" ]; then
    echo -e "${RED}ERROR: Database not found at $DB${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Agent Athens - Session Diagnostic                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo -e "   $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# =============================================================================
# 1. TOTALS
# =============================================================================
echo -e "${CYAN}${BOLD}1. EVENT TOTALS${NC}"
echo -e "────────────────────────────────────────────────────────────────"

TOTAL=$(sqlite3 "$DB" "SELECT COUNT(*) FROM events;")
VISIBLE=$(sqlite3 "$DB" "SELECT COUNT(*) FROM events WHERE location_status IN ('verified_athens','pass_through') AND date(COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)) >= date('now');")
UPCOMING_ALL=$(sqlite3 "$DB" "SELECT COUNT(*) FROM events WHERE date(start_date) >= date('now');")

echo "   Total in DB:      $TOTAL"
echo "   Visible on site:  $VISIBLE"
echo "   Upcoming (all):   $UPCOMING_ALL"
echo ""

# =============================================================================
# 2. UNENRICHED
# =============================================================================
echo -e "${CYAN}${BOLD}2. ENRICHMENT GAPS${NC}"
echo -e "────────────────────────────────────────────────────────────────"

UNENRICHED=$(sqlite3 "$DB" "
  SELECT COUNT(*) FROM events
  WHERE needs_enrichment = 1
    AND location_status IN ('verified_athens','pass_through')
    AND date(COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)) >= date('now');
")
NO_DESC=$(sqlite3 "$DB" "
  SELECT COUNT(*) FROM events
  WHERE (full_description IS NULL OR full_description = '')
    AND location_status IN ('verified_athens','pass_through')
    AND date(COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)) >= date('now');
")
NO_TIME=$(sqlite3 "$DB" "
  SELECT COUNT(*) FROM events
  WHERE time_doors IS NULL
    AND start_date NOT LIKE '%T%'
    AND type NOT IN ('exhibition')
    AND location_status IN ('verified_athens','pass_through')
    AND date(start_date) >= date('now');
")

if [ "$UNENRICHED" -gt 0 ]; then
    echo -e "   Needs enrichment: ${YELLOW}$UNENRICHED${NC}"
else
    echo -e "   Needs enrichment: ${GREEN}0${NC}"
fi

if [ "$NO_DESC" -gt 0 ]; then
    echo -e "   Missing description: ${YELLOW}$NO_DESC${NC}"
else
    echo -e "   Missing description: ${GREEN}0${NC}"
fi

if [ "$NO_TIME" -gt 0 ]; then
    echo -e "   Missing time (non-exhibition): ${YELLOW}$NO_TIME${NC}"
else
    echo -e "   Missing time: ${GREEN}0${NC}"
fi
echo ""

# =============================================================================
# 3. NEXT 7 DAYS - gap detection
# =============================================================================
echo -e "${CYAN}${BOLD}3. NEXT 7 DAYS${NC}"
echo -e "────────────────────────────────────────────────────────────────"

sqlite3 "$DB" "
  WITH RECURSIVE dates(d) AS (
    SELECT date('now')
    UNION ALL
    SELECT date(d, '+1 day') FROM dates WHERE d < date('now', '+6 days')
  )
  SELECT
    d,
    CASE CAST(strftime('%w', d) AS INTEGER)
      WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue'
      WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri'
      WHEN 6 THEN 'Sat'
    END AS day_name,
    (SELECT COUNT(*) FROM events
     WHERE date(start_date) = d
       AND location_status IN ('verified_athens','pass_through')) AS event_count
  FROM dates;
" | while IFS='|' read date day count; do
    if [ "$count" -eq 0 ]; then
        echo -e "   $date ($day): ${RED}0 events - GAP${NC}"
    elif [ "$count" -lt 5 ]; then
        echo -e "   $date ($day): ${YELLOW}$count events${NC}"
    else
        echo -e "   $date ($day): ${GREEN}$count events${NC}"
    fi
done
echo ""

# =============================================================================
# 4. BY SOURCE
# =============================================================================
echo -e "${CYAN}${BOLD}4. BY SOURCE${NC}"
echo -e "────────────────────────────────────────────────────────────────"

sqlite3 "$DB" "
  SELECT source, COUNT(*) as cnt
  FROM events
  WHERE location_status IN ('verified_athens','pass_through')
    AND date(COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)) >= date('now')
  GROUP BY source
  ORDER BY cnt DESC;
" | while IFS='|' read source count; do
    printf "   %-20s %4d events\n" "$source" "$count"
done
echo ""

# =============================================================================
# 5. BY TYPE
# =============================================================================
echo -e "${CYAN}${BOLD}5. BY TYPE${NC}"
echo -e "────────────────────────────────────────────────────────────────"

sqlite3 "$DB" "
  SELECT type, COUNT(*) as cnt
  FROM events
  WHERE location_status IN ('verified_athens','pass_through')
    AND date(COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)) >= date('now')
  GROUP BY type
  ORDER BY cnt DESC;
" | while IFS='|' read type count; do
    printf "   %-15s %4d events\n" "$type" "$count"
done
echo ""

# =============================================================================
# 6. ENRICHMENT QUEUE
# =============================================================================
echo -e "${CYAN}${BOLD}6. ENRICHMENT QUEUE${NC}"
echo -e "────────────────────────────────────────────────────────────────"

# Check if enrichment_queue table exists
HAS_QUEUE=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='enrichment_queue';")

if [ "$HAS_QUEUE" -eq 1 ]; then
    sqlite3 "$DB" "
      SELECT status, COUNT(*) as cnt
      FROM enrichment_queue
      GROUP BY status
      ORDER BY cnt DESC;
    " | while IFS='|' read status count; do
        printf "   %-15s %4d\n" "$status" "$count"
    done

    QUEUE_TOTAL=$(sqlite3 "$DB" "SELECT COUNT(*) FROM enrichment_queue;")
    if [ "$QUEUE_TOTAL" -eq 0 ]; then
        echo "   (empty)"
    fi
else
    echo "   (enrichment_queue table not found)"
fi
echo ""

# =============================================================================
# 7. LAST SCRAPE TIMESTAMPS
# =============================================================================
echo -e "${CYAN}${BOLD}7. LAST SCRAPE PER SOURCE${NC}"
echo -e "────────────────────────────────────────────────────────────────"

sqlite3 "$DB" "
  SELECT source, MAX(scraped_at) as last_scrape
  FROM events
  WHERE scraped_at IS NOT NULL
  GROUP BY source
  ORDER BY last_scrape DESC;
" | while IFS='|' read source last_scrape; do
    if [ -n "$last_scrape" ]; then
        printf "   %-20s %s\n" "$source" "$last_scrape"
    else
        printf "   %-20s %s\n" "$source" "(never)"
    fi
done

# Also check scrape_stats if it exists
HAS_STATS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='scrape_stats';")
if [ "$HAS_STATS" -eq 1 ]; then
    LAST_RUN=$(sqlite3 "$DB" "SELECT MAX(scraped_at) FROM scrape_stats;")
    if [ -n "$LAST_RUN" ] && [ "$LAST_RUN" != "" ]; then
        echo ""
        echo "   Last scrape run: $LAST_RUN"
    fi
fi
echo ""

# =============================================================================
# 8. THIS WEEKEND
# =============================================================================
echo -e "${CYAN}${BOLD}8. THIS WEEKEND (Fri-Sun)${NC}"
echo -e "────────────────────────────────────────────────────────────────"

# Calculate next Friday (or today if already Fri/Sat/Sun)
WEEKEND_STATS=$(sqlite3 "$DB" "
  WITH weekend AS (
    SELECT
      CASE
        WHEN CAST(strftime('%w', 'now') AS INTEGER) <= 5
          THEN date('now', '+' || (5 - CAST(strftime('%w', 'now') AS INTEGER)) || ' days')
        WHEN CAST(strftime('%w', 'now') AS INTEGER) = 6
          THEN date('now', '-1 day')
        ELSE date('now', '-2 days')
      END AS fri,
      CASE
        WHEN CAST(strftime('%w', 'now') AS INTEGER) <= 5
          THEN date('now', '+' || (7 - CAST(strftime('%w', 'now') AS INTEGER)) || ' days')
        WHEN CAST(strftime('%w', 'now') AS INTEGER) = 6
          THEN date('now', '+1 day')
        ELSE date('now')
      END AS sun
  )
  SELECT
    fri, sun,
    (SELECT COUNT(*) FROM events
     WHERE date(start_date) BETWEEN fri AND sun
       AND location_status IN ('verified_athens','pass_through')) AS weekend_count,
    (SELECT COUNT(*) FROM events
     WHERE date(start_date) BETWEEN fri AND sun
       AND location_status IN ('verified_athens','pass_through')
       AND time_doors IS NOT NULL) AS with_time,
    (SELECT COUNT(*) FROM events
     WHERE date(start_date) BETWEEN fri AND sun
       AND location_status IN ('verified_athens','pass_through')
       AND (full_description IS NOT NULL AND full_description != '')) AS with_desc
  FROM weekend;
")

echo "$WEEKEND_STATS" | while IFS='|' read fri sun count with_time with_desc; do
    echo "   Period: $fri to $sun"
    echo "   Events: $count"
    if [ "$count" -gt 0 ]; then
        TIME_PCT=$((with_time * 100 / count))
        DESC_PCT=$((with_desc * 100 / count))
        echo "   With time: $with_time/$count ($TIME_PCT%)"
        echo "   With description: $with_desc/$count ($DESC_PCT%)"
    fi
done
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}SESSION PRIORITIES:${NC}"

PRIORITIES=0
if [ "$UNENRICHED" -gt 10 ]; then
    echo -e "   ${RED}1.${NC} Enrich $UNENRICHED events (run enrichment pipeline)"
    PRIORITIES=$((PRIORITIES + 1))
fi
if [ "$NO_TIME" -gt 10 ]; then
    echo -e "   ${YELLOW}2.${NC} Fill $NO_TIME missing times (run enrich-time.ts)"
    PRIORITIES=$((PRIORITIES + 1))
fi
if [ "$NO_DESC" -gt 10 ]; then
    echo -e "   ${YELLOW}3.${NC} Write $NO_DESC missing descriptions"
    PRIORITIES=$((PRIORITIES + 1))
fi
if [ "$PRIORITIES" -eq 0 ]; then
    echo -e "   ${GREEN}Looking good! No urgent gaps.${NC}"
fi
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""
