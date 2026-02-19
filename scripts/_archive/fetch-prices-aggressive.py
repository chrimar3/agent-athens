#!/usr/bin/env python3
"""
Aggressive Price Fetcher - Multi-Source Support
================================================

Enhanced version of price fetcher with source-specific extraction patterns.
Supports all major event sources with parallel fetching.

Supported sources:
  - viva.gr (Schema.org offers, Greek patterns)
  - more.com (Schema.org offers, Greek patterns)
  - athinorama.gr (Greek price patterns)
  - gazarte.gr (Greek price patterns)

Usage:
  python3 scripts/fetch-prices-aggressive.py              # Fetch all
  python3 scripts/fetch-prices-aggressive.py --limit 10   # Test with 10
  python3 scripts/fetch-prices-aggressive.py --dry-run    # Preview only
  python3 scripts/fetch-prices-aggressive.py --parallel 5 # Fetch 5 at a time
  python3 scripts/fetch-prices-aggressive.py --source viva.gr # Only viva.gr
"""

import asyncio
import sqlite3
import sys
import re
from pathlib import Path
from typing import List, Tuple, Optional
import argparse

from playwright.async_api import async_playwright, Browser

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data/events.db"


# Source-specific price extraction patterns
SOURCE_PRICE_PATTERNS = {
    "viva.gr": [
        # Schema.org offers
        r'"price"[:\s]*"?(\d+(?:\.\d{2})?)"?',
        r'"lowPrice"[:\s]*"?(\d+(?:\.\d{2})?)"?',
        # Greek patterns
        r'(?:από|from)\s*(?:€|EUR)?\s*(\d+(?:[.,]\d{2})?)',
        r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
        r'(\d+(?:[.,]\d{2})?)\s*(?:€|EUR)',
        r'Τιμή[:\s]+(\d+(?:[.,]\d{2})?)',
    ],
    "more.com": [
        # Schema.org offers
        r'"price"[:\s]*"?(\d+(?:\.\d{2})?)"?',
        r'"lowPrice"[:\s]*"?(\d+(?:\.\d{2})?)"?',
        # Greek patterns
        r'(?:από|from)\s*(?:€|EUR)?\s*(\d+(?:[.,]\d{2})?)',
        r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
        r'(\d+(?:[.,]\d{2})?)\s*(?:€|EUR)',
    ],
    "athinorama.gr": [
        # Athinorama Greek patterns
        r'(?:Τιμή|Εισιτήριο|Κόστος)[:\s]*(\d+(?:[.,]\d{2})?)\s*(?:€|ευρώ)',
        r'(\d+(?:[.,]\d{2})?)\s*(?:€|ευρώ)',
        r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
        r'(?:από|from)\s*(?:€)?\s*(\d+)',
    ],
    "gazarte.gr": [
        # Gazarte patterns
        r'(?:Τιμή|Εισιτήριο)[:\s]*(\d+(?:[.,]\d{2})?)',
        r'(\d+(?:[.,]\d{2})?)\s*(?:€|ευρώ)',
        r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
        r'(?:προπώληση|presale)[:\s]+(?:€)?\s*(\d+)',
    ],
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
    return "default"


class AggressivePriceFetcher:
    """Fetches event prices with multiple extraction strategies - multi-source support"""

    def __init__(self, delay_seconds: float = 1.0, dry_run: bool = False, parallel: int = 1):
        self.delay_seconds = delay_seconds
        self.dry_run = dry_run
        self.parallel = parallel
        self.browser: Optional[Browser] = None
        self.context = None
        self.stats = {
            "total": 0,
            "success": 0,
            "no_price_found": 0,
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

        # Shared context for efficiency
        self.context = await self.browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        )

        print(f"🌐 Browser initialized")
        print(f"⏱️  Rate limit: {self.delay_seconds}s between requests")
        if self.parallel > 1:
            print(f"🔀 Parallel mode: {self.parallel} pages at a time")
        if self.dry_run:
            print(f"🔍 DRY RUN MODE - no database updates")

    def extract_price(self, text: str, source: str = "default") -> Optional[float]:
        """Extract price from text using source-specific patterns"""

        # Get source-specific patterns first, then fall back to generic
        source_patterns = SOURCE_PRICE_PATTERNS.get(source, [])

        # Generic patterns as fallback
        generic_patterns = [
            r'(?:€|EUR)\s*(\d+(?:[.,]\d{2})?)',
            r'(\d+(?:[.,]\d{2})?)\s*(?:€|EUR)',
            r'(?:Τιμή|Κόστος|Εισιτήριο)[:\s]+(\d+(?:[.,]\d{2})?)\s*(?:€|ευρώ|EUR)',
            r'(?:από|from)\s+(?:€|EUR)?\s*(\d+(?:[.,]\d{2})?)',
            r'(?:€|EUR)?\s*(\d+)(?:[.,]\d{2})?\s*[-–]\s*(?:€|EUR)?\s*\d+',
            r'\b(\d+(?:[.,]\d{2})?)\s*€',
            r'(?:προπώληση|presale)[:\s]+(?:€|EUR)?\s*(\d+(?:[.,]\d{2})?)',
            r'(?:ταμείο|door)[:\s]+(?:€|EUR)?\s*(\d+(?:[.,]\d{2})?)',
        ]

        # Try source-specific patterns first
        all_patterns = source_patterns + generic_patterns

        for pattern in all_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    price_str = match.group(1).replace(',', '.')
                    price = float(price_str)

                    # Sanity check: reasonable price range for events
                    if 0 < price < 1000:
                        return price
                except (ValueError, IndexError):
                    continue

        return None

    async def fetch_price_from_page(self, url: str) -> Optional[float]:
        """Extract price from event page - source-aware"""
        source = get_source_from_url(url)

        try:
            page = await self.context.new_page()

            # Fetch page
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await page.wait_for_timeout(1500)

            # Get page content
            html = await page.content()
            await page.close()

            # Try to extract price from HTML using source-specific patterns
            price = self.extract_price(html, source)

            if price:
                return price

            # Try to find price in meta tags / JSON-LD
            meta_patterns = [
                r'<meta[^>]*property="price"[^>]*content="([^"]*)"',
                r'<meta[^>]*name="price"[^>]*content="([^"]*)"',
                r'"price":\s*"?(\d+(?:\.\d{2})?)"?',
                r'"amount":\s*"?(\d+(?:\.\d{2})?)"?',
                r'"lowPrice":\s*"?(\d+(?:\.\d{2})?)"?',
            ]

            for pattern in meta_patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    try:
                        price = float(match.group(1))
                        if 0 < price < 1000:
                            return price
                    except ValueError:
                        continue

            return None

        except Exception as e:
            print(f"   ❌ Error: {str(e)[:50]}")
            self.stats["failed"] += 1
            return None

    async def fetch_single_event(self, event_data: Tuple[str, str, str], index: int, total: int) -> Optional[Tuple[float, str, str]]:
        """Fetch price for a single event, return (price, event_id, source) or None"""
        event_id, title, url = event_data
        source = get_source_from_url(url)

        print(f"[{index}/{total}] {title[:50]}...")
        print(f"   URL: {url} ({source})")

        price = await self.fetch_price_from_page(url)

        if price:
            print(f"   ✅ Found price: €{price:.2f}")
            self.stats["success"] += 1
            self.stats["by_source"][source] = self.stats["by_source"].get(source, 0) + 1
            return (price, event_id, source)
        else:
            print(f"   ⚠️  No price found")
            self.stats["no_price_found"] += 1
            return None

    async def fetch_and_update(self, events: List[Tuple[str, str, str]]):
        """Fetch prices and update database - supports parallel fetching"""
        self.stats["total"] = len(events)

        print(f"\n💰 Aggressive price fetching for {len(events)} events...\n")

        updates = []

        if self.parallel > 1:
            # Parallel fetching in batches
            for batch_start in range(0, len(events), self.parallel):
                batch = events[batch_start:batch_start + self.parallel]
                tasks = []

                for i, event_data in enumerate(batch):
                    global_index = batch_start + i + 1
                    task = self.fetch_single_event(event_data, global_index, len(events))
                    tasks.append(task)

                # Run batch in parallel
                results = await asyncio.gather(*tasks)

                # Collect successful results
                for result in results:
                    if result:
                        updates.append(result)

                # Rate limit between batches
                if batch_start + self.parallel < len(events):
                    await asyncio.sleep(self.delay_seconds)
        else:
            # Sequential fetching (original behavior)
            for i, event_data in enumerate(events, 1):
                result = await self.fetch_single_event(event_data, i, len(events))
                if result:
                    updates.append(result)

                # Rate limiting
                if i < len(events):
                    await asyncio.sleep(self.delay_seconds)

        # Update database
        if not self.dry_run and updates:
            print(f"\n💾 Updating database with {len(updates)} prices...")
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            for price, event_id, _ in updates:
                cursor.execute(
                    "UPDATE events SET price_amount = ?, updated_at = datetime('now') WHERE id = ?",
                    (price, event_id)
                )

            conn.commit()
            conn.close()
            print(f"✅ Database updated!")
        elif self.dry_run:
            print(f"\n🔍 DRY RUN: Would update {len(updates)} prices")

    async def close(self):
        """Cleanup"""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()

    def print_summary(self):
        """Print final statistics"""
        print(f"\n{'='*60}")
        print(f"📊 Aggressive Price Fetch Summary (Multi-Source)")
        print(f"{'='*60}")
        print(f"Total events:       {self.stats['total']}")
        print(f"✅ Prices found:    {self.stats['success']}")
        print(f"⚠️  No price found:  {self.stats['no_price_found']}")
        print(f"❌ Failed:          {self.stats['failed']}")

        # Show breakdown by source
        if self.stats['by_source']:
            print(f"\n📌 By Source:")
            for source, count in sorted(self.stats['by_source'].items(), key=lambda x: -x[1]):
                print(f"   {source}: {count} prices found")

        print(f"{'='*60}")
        if self.stats['total'] > 0:
            success_rate = (self.stats['success'] / self.stats['total']) * 100
            print(f"📈 Success rate: {success_rate:.1f}%")
        print(f"{'='*60}")


def get_events_with_missing_prices(limit: Optional[int] = None, source: Optional[str] = None) -> List[Tuple[str, str, str]]:
    """Query events without prices from database - supports all sources"""

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Support all known sources
    supported_sources = ['viva.gr', 'more.com', 'athinorama.gr', 'gazarte.gr']

    if source:
        # Filter to specific source
        source_filter = f"AND url LIKE '%{source}%'"
    else:
        # Include all supported sources
        source_conditions = " OR ".join([f"url LIKE '%{s}%'" for s in supported_sources])
        source_filter = f"AND ({source_conditions})"

    query = f"""
        SELECT id, title, url
        FROM events
        WHERE date(start_date) >= date('now')
        AND price_type = 'paid'
        AND (price_amount IS NULL OR price_amount = 0)
        AND url IS NOT NULL
        {source_filter}
        ORDER BY start_date
    """

    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query)
    events = cursor.fetchall()

    conn.close()

    # Print source breakdown
    if events:
        source_counts = {}
        for _, _, url in events:
            src = get_source_from_url(url)
            source_counts[src] = source_counts.get(src, 0) + 1
        print(f"\n📌 Events by source:")
        for src, count in sorted(source_counts.items(), key=lambda x: -x[1]):
            print(f"   {src}: {count} events")

    return events


async def main():
    parser = argparse.ArgumentParser(description="Aggressive price fetching from all supported sources")
    parser.add_argument("--limit", type=int, help="Limit number of events (for testing)")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests (default: 1.0s)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating database")
    parser.add_argument("--parallel", type=int, default=1, help="Number of pages to fetch in parallel (default: 1)")
    parser.add_argument("--source", type=str, help="Filter to specific source (viva.gr, more.com, athinorama.gr, gazarte.gr)")

    args = parser.parse_args()

    print(f"🔍 Finding events with missing prices...")
    if args.source:
        print(f"📌 Filtering to source: {args.source}")

    # Get events from database
    events = get_events_with_missing_prices(limit=args.limit, source=args.source)

    if not events:
        print(f"✅ No events found with missing prices!")
        sys.exit(0)

    print(f"📋 Found {len(events)} events with missing prices")

    # Fetch prices
    fetcher = AggressivePriceFetcher(delay_seconds=args.delay, dry_run=args.dry_run, parallel=args.parallel)

    try:
        await fetcher.initialize()
        await fetcher.fetch_and_update(events)
    finally:
        await fetcher.close()

    fetcher.print_summary()


if __name__ == "__main__":
    asyncio.run(main())
