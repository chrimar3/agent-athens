#!/usr/bin/env python3
"""
Fetch Individual Event Pages for Enhanced Data Extraction
==========================================================

Purpose: Download full event page HTML to extract performer details,
         full descriptions, and program information.

Why: Scraper currently only saves LISTING pages (short descriptions).
     Individual event pages contain rich data (performer bios, full text).

Usage:
  python3 scripts/fetch-event-pages.py              # Fetch all November events
  python3 scripts/fetch-event-pages.py --limit 5    # Test with 5 events
  python3 scripts/fetch-event-pages.py --month 12   # Fetch December events

Output: data/event-pages/{event-id}.html
"""

import asyncio
import sqlite3
import sys
from pathlib import Path
from typing import List, Tuple, Optional
import argparse
from datetime import datetime

from playwright.async_api import async_playwright, Browser

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data/events.db"
OUTPUT_DIR = PROJECT_ROOT / "data/event-pages"


class EventPageFetcher:
    """Fetches individual event pages with rate limiting"""

    def __init__(self, delay_seconds: float = 1.5):
        self.delay_seconds = delay_seconds
        self.browser: Optional[Browser] = None
        self.stats = {
            "total": 0,
            "fetched": 0,
            "skipped": 0,
            "failed": 0
        }

    async def initialize(self):
        """Start browser"""
        OUTPUT_DIR.mkdir(exist_ok=True)

        playwright = await async_playwright().start()

        # Use system Chrome for reliability
        self.browser = await playwright.chromium.launch(
            headless=True,
            channel="chrome",  # Use system Chrome
        )

        print(f"🌐 Browser initialized")
        print(f"📂 Output: {OUTPUT_DIR}")
        print(f"⏱️  Rate limit: {self.delay_seconds}s between requests")

    async def fetch_page(self, event_id: str, url: str) -> bool:
        """Fetch a single event page"""
        output_file = OUTPUT_DIR / f"{event_id}.html"

        # Skip if already fetched
        if output_file.exists():
            file_age_hours = (datetime.now().timestamp() - output_file.stat().st_mtime) / 3600
            if file_age_hours < 24:  # Skip if fetched within last 24 hours
                self.stats["skipped"] += 1
                return True

        try:
            page = await self.browser.new_page(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            )

            # Fetch page
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)

            # Wait a bit for dynamic content
            await page.wait_for_timeout(500)

            # Save HTML
            html = await page.content()
            output_file.write_text(html, encoding='utf-8')

            await page.close()

            self.stats["fetched"] += 1
            return True

        except Exception as e:
            print(f"❌ Failed {event_id}: {e}")
            self.stats["failed"] += 1
            return False

    async def fetch_events(self, events: List[Tuple[str, str, str]]):
        """Fetch all event pages with rate limiting"""
        self.stats["total"] = len(events)

        print(f"\n📥 Fetching {len(events)} event pages...\n")

        for i, (event_id, title, url) in enumerate(events, 1):
            # Progress indicator
            if i % 10 == 0 or i == 1:
                print(f"[{i}/{len(events)}] {title[:50]}...")

            await self.fetch_page(event_id, url)

            # Rate limiting
            if i < len(events):  # Don't delay after last one
                await asyncio.sleep(self.delay_seconds)

    async def close(self):
        """Cleanup"""
        if self.browser:
            await self.browser.close()

    def print_summary(self):
        """Print final statistics"""
        print(f"\n{'='*60}")
        print(f"📊 Fetch Summary")
        print(f"{'='*60}")
        print(f"Total events:     {self.stats['total']}")
        print(f"✅ Fetched:       {self.stats['fetched']}")
        print(f"⏭️  Skipped:       {self.stats['skipped']} (already cached)")
        print(f"❌ Failed:        {self.stats['failed']}")
        print(f"{'='*60}")


def get_events_from_db(month: int = 11, year: int = 2025, limit: Optional[int] = None) -> List[Tuple[str, str, str]]:
    """Query events from database"""

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Build date range
    start_date = f"{year}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{month + 1:02d}-01"

    query = """
        SELECT id, title, url
        FROM events
        WHERE date(start_date) >= ? AND date(start_date) < ?
        AND url IS NOT NULL
        ORDER BY start_date
    """

    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query, (start_date, end_date))
    events = cursor.fetchall()

    conn.close()

    return events


async def main():
    parser = argparse.ArgumentParser(description="Fetch individual event pages for enhanced data extraction")
    parser.add_argument("--month", type=int, default=11, help="Month to fetch (default: 11 for November)")
    parser.add_argument("--year", type=int, default=2025, help="Year to fetch (default: 2025)")
    parser.add_argument("--limit", type=int, help="Limit number of events (for testing)")
    parser.add_argument("--delay", type=float, default=1.5, help="Delay between requests in seconds (default: 1.5)")

    args = parser.parse_args()

    print(f"🔍 Fetching event pages for {args.year}-{args.month:02d}")

    # Get events from database
    events = get_events_from_db(month=args.month, year=args.year, limit=args.limit)

    if not events:
        print(f"❌ No events found for {args.year}-{args.month:02d}")
        sys.exit(1)

    print(f"📋 Found {len(events)} events")

    # Fetch pages
    fetcher = EventPageFetcher(delay_seconds=args.delay)

    try:
        await fetcher.initialize()
        await fetcher.fetch_events(events)
    finally:
        await fetcher.close()

    fetcher.print_summary()

    # Estimate time saved
    if fetcher.stats["skipped"] > 0:
        time_saved = fetcher.stats["skipped"] * args.delay
        print(f"\n⏱️  Time saved by caching: ~{time_saved:.0f} seconds ({time_saved/60:.1f} minutes)")


if __name__ == "__main__":
    asyncio.run(main())
