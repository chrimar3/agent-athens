#!/bin/bash
# Quick stats checker for Agent Athens

echo "📊 Agent Athens - Current Statistics"
echo "====================================="
echo ""

# Database stats
if [ -f "data/events.db" ]; then
  TOTAL=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE date(start_date) >= date('now')")
  WITH_PRICES=$(sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE price_amount > 0 AND date(start_date) >= date('now')")
  PERCENT=$((WITH_PRICES * 100 / TOTAL))

  echo "📅 Events:"
  echo "  Total upcoming: $TOTAL"
  echo "  With prices: $WITH_PRICES ($PERCENT%)"
  echo "  Without prices: $((TOTAL - WITH_PRICES))"
  echo ""

  # Price ranges
  MIN=$(sqlite3 data/events.db "SELECT MIN(price_amount) FROM events WHERE price_amount > 0")
  MAX=$(sqlite3 data/events.db "SELECT MAX(price_amount) FROM events WHERE price_amount > 0")
  AVG=$(sqlite3 data/events.db "SELECT CAST(AVG(price_amount) AS INTEGER) FROM events WHERE price_amount > 0")

  echo "💰 Price Range:"
  echo "  Min: €$MIN"
  echo "  Max: €$MAX"
  echo "  Average: €$AVG"
  echo ""

  # By type
  echo "📊 Events by Type:"
  sqlite3 data/events.db "
    SELECT
      type,
      COUNT(*) as count,
      COUNT(CASE WHEN price_amount > 0 THEN 1 END) as with_price
    FROM events
    WHERE date(start_date) >= date('now')
    GROUP BY type
    ORDER BY count DESC
  " | while IFS='|' read type count with_price; do
    printf "  %-12s %4d events (%d with prices)\n" "$type:" "$count" "$with_price"
  done
  echo ""

  # By source
  echo "🌐 Events by Source:"
  sqlite3 data/events.db "
    SELECT source, COUNT(*)
    FROM events
    WHERE date(start_date) >= date('now')
    GROUP BY source
    ORDER BY COUNT(*) DESC
  " | while IFS='|' read source count; do
    printf "  %-15s %4d events\n" "$source" "$count"
  done
  echo ""
else
  echo "❌ Database not found"
fi

# Check if price fetcher is running
if pgrep -f "fetch-prices.py" > /dev/null; then
  echo "🔄 Price fetcher is currently running"
  if [ -f "/tmp/price-fetch.log" ]; then
    CURRENT=$(tail -1 /tmp/price-fetch.log | grep -o '\[[0-9]*/[0-9]*\]' | head -1)
    echo "  Progress: $CURRENT"
  fi
else
  echo "✅ No price fetcher running"
fi

echo ""
