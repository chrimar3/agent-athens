#!/usr/bin/env python3
"""
Fetch Missing Event Data - Unified Time & Price Fetcher
========================================================

Single script to fetch BOTH missing times AND prices from event pages.
More efficient than running two separate scripts (one page load per event).

Supported sources:
  - viva.gr (Schema.org microdata, Greek text patterns)
  - more.com (Schema.org microdata, Greek text patterns)
  - athinorama.gr (Greek text patterns, structured data)
  - gazarte.gr (Greek text patterns)

Usage:
  python3 scripts/fetch-missing-data.py              # Fetch all missing data
  python3 scripts/fetch-missing-data.py --times      # Only fetch times
  python3 scripts/fetch-missing-data.py --prices     # Only fetch prices
  python3 scripts/fetch-missing-data.py --limit 10   # Test with 10 events
  python3 scripts/fetch-missing-data.py --parallel 5 # Fetch 5 at a time
  python3 scripts/fetch-missing-data.py --source viva.gr  # Only viva.gr
  python3 scripts/fetch-missing-data.py --dry-run    # Preview only
"""

import asyncio
import sqlite3
import sys
import re
from pathlib import Path
from typing import List, Tuple, Optional, Dict
import argparse

from playwright.async_api import async_playwright, Browser

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data/events.db"


# ============================================================================
# Source-specific extraction patterns
# ============================================================================

TIME_PATTERNS = {
    "viva.gr": [
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
        r'Ώρα[:\s]+(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]+(\d{1,2}:\d{2})',
        r'<span[^>]*class="[^"]*time[^"]*"[^>]*>(\d{1,2}:\d{2})',
    ],
    "more.com": [
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
        r'Ώρα[:\s]+(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]+(\d{1,2}:\d{2})',
        r'<meta[^>]*content="[^"]*T(\d{2}:\d{2}):',
    ],
    "athinorama.gr": [
        r'Ώρα[:\s]*(\d{1,2}:\d{2})',
        r'(\d{1,2}:\d{2})\s*(?:μ\.μ\.|μμ)',
        r'<span[^>]*class="[^"]*hour[^"]*"[^>]*>(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]*(\d{1,2}:\d{2})',
    ],
    "gazarte.gr": [
        r'Ώρα[:\s]*(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]*(\d{1,2}:\d{2})',
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
    ],
    "megaron.gr": [
        r'Ώρα[:\s]*(\d{1,2}:\d{2})',
        r'(\d{1,2}:\d{2})\s*(?:μ\.μ\.|μμ)',
        r'Έναρξη[:\s]*(\d{1,2}:\d{2})',
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
    ],
    "clubber.gr": [
        r'Ώρα[:\s]*(\d{1,2}:\d{2})',
        r'(\d{1,2}:\d{2})\s*(?:μ\.μ\.|μμ)',
        r'Έναρξη[:\s]*(\d{1,2}:\d{2})',
        # Clubber events often start late at night
        r'\b(\d{1,2}:\d{2})\b',
    ],
    "default": [
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
        r'<meta[^>]*content="[^"]*T(\d{2}:\d{2}):',
        r'Ώρα[:\s]+(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]+(\d{1,2}:\d{2})',
        r'(\d{1,2}:\d{2})\s*(?:μ\.μ\.|μμ|π\.μ\.|πμ)',
        r'\b(\d{1,2}:\d{2})\b',
    ]
}

PRICE_PATTERNS = {
    "viva.gr": [
        # NOTE: viva.gr does NOT show prices on event detail pages
        # Prices only appear in checkout flow - extraction will fail
        r'"price"[:\s]*"?(\d+(?:\.\d{2})?)"?',
        r'"lowPrice"[:\s]*"?(\d+(?:\.\d{2})?)"?',
        r'(?:από|from)\s*(?:€|EUR)?\s*(\d+(?:[.,]\d{2})?)',
        r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
        r'(\d+(?:[.,]\d{2})?)\s*(?:€|EUR)',
    ],
    "more.com": [
        r'"price"[:\s]*"?(\d+(?:\.\d{2})?)"?',
        r'"lowPrice"[:\s]*"?(\d+(?:\.\d{2})?)"?',
        r'(?:από|from)\s*(?:€|EUR)?\s*(\d+(?:[.,]\d{2})?)',
        r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
    ],
    "athinorama.gr": [
        r'(?:Τιμή|Εισιτήριο|Κόστος)[:\s]*(\d+(?:[.,]\d{2})?)\s*(?:€|ευρώ)',
        r'(\d+(?:[.,]\d{2})?)\s*(?:€|ευρώ)',
        r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
    ],
    "gazarte.gr": [
        r'(?:Τιμή|Εισιτήριο)[:\s]*(\d+(?:[.,]\d{2})?)',
        r'(\d+(?:[.,]\d{2})?)\s*(?:€|ευρώ)',
        r'(?:προπώληση|presale)[:\s]+(?:€)?\s*(\d+)',
    ],
    "megaron.gr": [
        # megaron.gr shows prices like "€25", "€16", "€10" on event pages
        r'€\s*(\d+(?:[.,]\d{2})?)',
        r'(\d+(?:[.,]\d{2})?)\s*€',
        r'(?:Εισιτήρια?|Τιμές?)[:\s]*€?\s*(\d+)',
    ],
    "clubber.gr": [
        # Most clubber.gr events are free entry (clubs/parties)
        # Some may have cover charges
        r'(?:Είσοδος|Entry)[:\s]*€?\s*(\d+)',
        r'€\s*(\d+)',
        r'(\d+)\s*€',
    ],
    "default": [
        r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
        r'(\d+(?:[.,]\d{2})?)\s*(?:€|EUR)',
        r'(?:Τιμή|Κόστος|Εισιτήριο)[:\s]+(\d+(?:[.,]\d{2})?)',
        r'(?:από|from)\s+(?:€|EUR)?\s*(\d+(?:[.,]\d{2})?)',
        r'"price"[:\s]*"?(\d+(?:\.\d{2})?)"?',
    ]
}


def get_source_from_url(url: str) -> str:
    """Detect source site from URL"""
    url_lower = url.lower()
    if "viva.gr" in url_lower:
        return "viva.gr"
    elif "more.com" in url_lower:
        return "more.com"
    elif "athinorama.gr" in url_lower:
        return "athinorama.gr"
    elif "gazarte.gr" in url_lower:
        return "gazarte.gr"
    elif "megaron.gr" in url_lower:
        return "megaron.gr"
    elif "clubber.gr" in url_lower:
        return "clubber.gr"
    return "default"


class UnifiedDataFetcher:
    """Fetches both times and prices from event pages in a single pass"""

    def __init__(self, delay_seconds: float = 1.0, dry_run: bool = False,
                 parallel: int = 1, fetch_times: bool = True, fetch_prices: bool = True):
        self.delay_seconds = delay_seconds
        self.dry_run = dry_run
        self.parallel = parallel
        self.fetch_times = fetch_times
        self.fetch_prices = fetch_prices
        self.browser: Optional[Browser] = None
        self.context = None
        self.stats = {
            "total": 0,
            "times_found": 0,
            "prices_found": 0,
            "both_found": 0,
            "nothing_found": 0,
            "failed": 0,
            "by_source": {}
        }

    async def initialize(self):
        """Start browser with shared context"""
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(
            headless=True,
            channel="chrome",
        )
        self.context = await self.browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        )

        mode = []
        if self.fetch_times:
            mode.append("times")
        if self.fetch_prices:
            mode.append("prices")

        print(f"🌐 Browser initialized")
        print(f"📋 Fetching: {' + '.join(mode)}")
        print(f"⏱️  Rate limit: {self.delay_seconds}s between requests")
        if self.parallel > 1:
            print(f"🔀 Parallel mode: {self.parallel} pages at a time")
        if self.dry_run:
            print(f"🔍 DRY RUN MODE - no database updates")

    def validate_time(self, time_str: str) -> Optional[str]:
        """Validate time format (HH:MM) and return normalized version"""
        if not time_str:
            return None
        try:
            parts = time_str.split(':')
            if len(parts) != 2:
                return None
            hours = int(parts[0])
            minutes = int(parts[1])
            if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
                return None
            return f"{hours:02d}:{minutes:02d}"
        except (ValueError, IndexError):
            return None

    def extract_time(self, html: str, source: str) -> Optional[str]:
        """Extract event time from HTML"""
        patterns = TIME_PATTERNS.get(source, TIME_PATTERNS["default"])
        time_candidates = []

        for pattern in patterns:
            matches = re.finditer(pattern, html, re.IGNORECASE)
            for match in matches:
                time_str = match.group(1)
                validated_time = self.validate_time(time_str)
                if validated_time:
                    hours = int(validated_time.split(':')[0])
                    minutes = int(validated_time.split(':')[1])

                    if hours < 8:
                        continue

                    score = 0
                    if minutes in [0, 15, 30, 45]:
                        score += 10
                    if 18 <= hours <= 23:
                        score += 5
                    elif 14 <= hours <= 17:
                        score += 3
                    elif 10 <= hours <= 13:
                        score += 1

                    time_candidates.append((validated_time, score))

        if time_candidates:
            time_candidates.sort(key=lambda x: x[1], reverse=True)
            return time_candidates[0][0]
        return None

    def extract_price(self, html: str, source: str) -> Optional[float]:
        """Extract event price from HTML"""
        patterns = PRICE_PATTERNS.get(source, PRICE_PATTERNS["default"])

        for pattern in patterns:
            matches = re.finditer(pattern, html, re.IGNORECASE)
            for match in matches:
                try:
                    price_str = match.group(1).replace(',', '.')
                    price = float(price_str)
                    if 0 < price < 1000:
                        return price
                except (ValueError, IndexError):
                    continue
        return None

    async def fetch_data_from_page(self, url: str) -> Tuple[Optional[str], Optional[float]]:
        """Fetch both time and price from a single page load"""
        source = get_source_from_url(url)
        time_result = None
        price_result = None

        try:
            page = await self.context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await page.wait_for_timeout(1000)
            html = await page.content()
            await page.close()

            if self.fetch_times:
                time_result = self.extract_time(html, source)
            if self.fetch_prices:
                price_result = self.extract_price(html, source)

            return time_result, price_result

        except Exception as e:
            print(f"   ❌ Error: {str(e)[:50]}")
            self.stats["failed"] += 1
            return None, None

    async def fetch_single_event(self, event_data: Dict, index: int, total: int) -> Dict:
        """Fetch data for a single event"""
        event_id = event_data["id"]
        title = event_data["title"]
        url = event_data["url"]
        current_date = event_data.get("start_date", "")
        needs_time = event_data.get("needs_time", False)
        needs_price = event_data.get("needs_price", False)
        source = get_source_from_url(url)

        print(f"[{index}/{total}] {title[:50]}...")
        print(f"   URL: {url} ({source})")

        time_str, price = await self.fetch_data_from_page(url)

        result = {
            "event_id": event_id,
            "source": source,
            "time": None,
            "price": None,
            "new_date": None
        }

        found_time = False
        found_price = False

        if needs_time and time_str:
            date_part = current_date.split('T')[0]
            result["new_date"] = f"{date_part}T{time_str}:00+02:00"
            result["time"] = time_str
            found_time = True
            print(f"   ✅ Time: {time_str}")

        if needs_price and price:
            result["price"] = price
            found_price = True
            print(f"   ✅ Price: €{price:.2f}")

        if not found_time and needs_time:
            print(f"   ⚠️  No time found")
        if not found_price and needs_price:
            print(f"   ⚠️  No price found")

        # Update stats
        if found_time and found_price:
            self.stats["both_found"] += 1
        elif found_time:
            self.stats["times_found"] += 1
        elif found_price:
            self.stats["prices_found"] += 1
        else:
            self.stats["nothing_found"] += 1

        if found_time or found_price:
            self.stats["by_source"][source] = self.stats["by_source"].get(source, 0) + 1

        return result

    async def fetch_and_update(self, events: List[Dict]):
        """Fetch data and update database"""
        self.stats["total"] = len(events)

        print(f"\n📥 Fetching data for {len(events)} events...\n")

        results = []

        if self.parallel > 1:
            for batch_start in range(0, len(events), self.parallel):
                batch = events[batch_start:batch_start + self.parallel]
                tasks = []
                for i, event_data in enumerate(batch):
                    global_index = batch_start + i + 1
                    task = self.fetch_single_event(event_data, global_index, len(events))
                    tasks.append(task)

                batch_results = await asyncio.gather(*tasks)
                results.extend(batch_results)

                if batch_start + self.parallel < len(events):
                    await asyncio.sleep(self.delay_seconds)
        else:
            for i, event_data in enumerate(events, 1):
                result = await self.fetch_single_event(event_data, i, len(events))
                results.append(result)
                if i < len(events):
                    await asyncio.sleep(self.delay_seconds)

        # Update database
        if not self.dry_run:
            time_updates = [(r["new_date"], r["event_id"]) for r in results if r["new_date"]]
            price_updates = [(r["price"], r["event_id"]) for r in results if r["price"]]

            if time_updates or price_updates:
                print(f"\n💾 Updating database...")
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()

                if time_updates:
                    for new_date, event_id in time_updates:
                        cursor.execute(
                            "UPDATE events SET start_date = ?, updated_at = datetime('now') WHERE id = ?",
                            (new_date, event_id)
                        )
                    print(f"   ✅ Updated {len(time_updates)} times")

                if price_updates:
                    for price, event_id in price_updates:
                        cursor.execute(
                            "UPDATE events SET price_amount = ?, updated_at = datetime('now') WHERE id = ?",
                            (price, event_id)
                        )
                    print(f"   ✅ Updated {len(price_updates)} prices")

                conn.commit()
                conn.close()
        else:
            time_count = sum(1 for r in results if r["new_date"])
            price_count = sum(1 for r in results if r["price"])
            print(f"\n🔍 DRY RUN: Would update {time_count} times, {price_count} prices")

    async def close(self):
        """Cleanup"""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()

    def print_summary(self):
        """Print final statistics"""
        print(f"\n{'='*60}")
        print(f"📊 Unified Data Fetch Summary")
        print(f"{'='*60}")
        print(f"Total events:      {self.stats['total']}")
        print(f"✅ Both found:     {self.stats['both_found']}")
        print(f"⏰ Times only:     {self.stats['times_found']}")
        print(f"💰 Prices only:    {self.stats['prices_found']}")
        print(f"⚠️  Nothing found:  {self.stats['nothing_found']}")
        print(f"❌ Failed:         {self.stats['failed']}")

        if self.stats['by_source']:
            print(f"\n📌 Success by Source:")
            for source, count in sorted(self.stats['by_source'].items(), key=lambda x: -x[1]):
                print(f"   {source}: {count}")

        print(f"{'='*60}")
        if self.stats['total'] > 0:
            success = self.stats['both_found'] + self.stats['times_found'] + self.stats['prices_found']
            rate = (success / self.stats['total']) * 100
            print(f"📈 Success rate: {rate:.1f}%")
        print(f"{'='*60}")


def get_events_needing_data(limit: Optional[int] = None, source: Optional[str] = None,
                            times_only: bool = False, prices_only: bool = False) -> List[Dict]:
    """Query events that need times and/or prices"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    supported_sources = ['viva.gr', 'more.com', 'athinorama.gr', 'gazarte.gr', 'megaron.gr', 'clubber.gr']

    if source:
        source_filter = f"AND url LIKE '%{source}%'"
    else:
        source_conditions = " OR ".join([f"url LIKE '%{s}%'" for s in supported_sources])
        source_filter = f"AND ({source_conditions})"

    # Build conditions based on what we're fetching
    conditions = []
    if not prices_only:
        conditions.append("(start_date LIKE '%00:00:00%' OR start_date LIKE '%T00:00%')")
    if not times_only:
        conditions.append("(price_type = 'paid' AND (price_amount IS NULL OR price_amount = 0))")

    if conditions:
        data_filter = f"AND ({' OR '.join(conditions)})"
    else:
        data_filter = ""

    query = f"""
        SELECT id, title, start_date, url, price_type, price_amount
        FROM events
        WHERE date(start_date) >= date('now')
        AND url IS NOT NULL
        {source_filter}
        {data_filter}
        ORDER BY start_date
    """

    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    events = []
    for row in rows:
        event_id, title, start_date, url, price_type, price_amount = row
        needs_time = '00:00:00' in start_date or 'T00:00' in start_date
        needs_price = price_type == 'paid' and (price_amount is None or price_amount == 0)

        if times_only:
            needs_price = False
        if prices_only:
            needs_time = False

        if needs_time or needs_price:
            events.append({
                "id": event_id,
                "title": title,
                "start_date": start_date,
                "url": url,
                "needs_time": needs_time,
                "needs_price": needs_price
            })

    # Print summary
    if events:
        time_count = sum(1 for e in events if e["needs_time"])
        price_count = sum(1 for e in events if e["needs_price"])
        print(f"\n📌 Events needing data:")
        print(f"   Missing times: {time_count}")
        print(f"   Missing prices: {price_count}")

        source_counts = {}
        for e in events:
            src = get_source_from_url(e["url"])
            source_counts[src] = source_counts.get(src, 0) + 1
        print(f"\n📌 By source:")
        for src, count in sorted(source_counts.items(), key=lambda x: -x[1]):
            print(f"   {src}: {count} events")

    return events


async def main():
    parser = argparse.ArgumentParser(description="Fetch missing times and prices from event pages")
    parser.add_argument("--limit", type=int, help="Limit number of events (for testing)")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests (default: 1.0s)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating database")
    parser.add_argument("--parallel", type=int, default=1, help="Number of pages to fetch in parallel")
    parser.add_argument("--source", type=str, help="Filter to specific source")
    parser.add_argument("--times", action="store_true", help="Only fetch missing times")
    parser.add_argument("--prices", action="store_true", help="Only fetch missing prices")

    args = parser.parse_args()

    # Default to both if neither specified
    fetch_times = not args.prices or args.times
    fetch_prices = not args.times or args.prices

    print(f"🔍 Finding events with missing data...")
    if args.source:
        print(f"📌 Filtering to source: {args.source}")

    events = get_events_needing_data(
        limit=args.limit,
        source=args.source,
        times_only=args.times,
        prices_only=args.prices
    )

    if not events:
        print(f"✅ No events found needing data!")
        sys.exit(0)

    print(f"📋 Found {len(events)} events needing data")

    fetcher = UnifiedDataFetcher(
        delay_seconds=args.delay,
        dry_run=args.dry_run,
        parallel=args.parallel,
        fetch_times=fetch_times,
        fetch_prices=fetch_prices
    )

    try:
        await fetcher.initialize()
        await fetcher.fetch_and_update(events)
    finally:
        await fetcher.close()

    fetcher.print_summary()


if __name__ == "__main__":
    asyncio.run(main())
