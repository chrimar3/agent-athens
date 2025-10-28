#!/bin/bash
# Monitor price fetcher progress

LOG_FILE="logs/price-fetch-fixed.log"

echo "📊 Price Fetcher Monitor"
echo "========================"
echo ""

while true; do
    # Check if process is still running
    if pgrep -f "fetch-prices.py" > /dev/null; then
        # Get current progress
        CURRENT=$(grep -oP '\[\K[0-9]+(?=/1467)' "$LOG_FILE" | tail -1)
        TOTAL=1467

        if [ ! -z "$CURRENT" ]; then
            PERCENT=$((CURRENT * 100 / TOTAL))
            REMAINING=$((TOTAL - CURRENT))

            # Get recent success/failure counts
            RECENT_SUCCESS=$(tail -50 "$LOG_FILE" | grep -c "✅ Price:")
            RECENT_FAIL=$(tail -50 "$LOG_FILE" | grep -c "❌ No price")

            echo -ne "\r🔄 Progress: $CURRENT/$TOTAL ($PERCENT%) | Recent: ✅ $RECENT_SUCCESS ❌ $RECENT_FAIL | Remaining: $REMAINING events"
        fi
    else
        echo -e "\n\n✅ Price fetcher completed!"
        break
    fi

    sleep 5
done

echo ""
echo ""
echo "📊 Final Statistics"
echo "==================="
./scripts/check-stats.sh
