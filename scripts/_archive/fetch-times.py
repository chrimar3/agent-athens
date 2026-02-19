#!/usr/bin/env python3
"""
Fetch Missing Event Times - Multi-Source Support
=================================================

Finds events with midnight (00:00:00.000) timestamps and fetches their
actual event times from event pages using Playwright.

Supported sources:
  - viva.gr (Schema.org microdata, Greek text patterns)
  - more.com (Schema.org microdata, Greek text patterns)
  - athinorama.gr (Greek text patterns, structured data)
  - gazarte.gr (Greek text patterns)

Usage:
  python3 scripts/fetch-times.py              # Fetch all missing times
  python3 scripts/fetch-times.py --limit 10    # Test with 10 events
  python3 scripts/fetch-times.py --dry-run     # Preview without updating DB
  python3 scripts/fetch-times.py --parallel 5  # Fetch 5 pages at a time
"""

import asyncio
import sqlite3
import sys
import re
from pathlib import Path
from typing import List, Tuple, Optional
import argparse
from datetime import datetime

from playwright.async_api import async_playwright, Browser

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data/events.db"


# Source-specific time extraction patterns
SOURCE_PATTERNS = {
    "viva.gr": [
        # Schema.org startDate in JSON-LD
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
        # Greek time patterns
        r'Ώρα[:\s]+(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]+(\d{1,2}:\d{2})',
        # Time in event details
        r'<span[^>]*class="[^"]*time[^"]*"[^>]*>(\d{1,2}:\d{2})',
    ],
    "more.com": [
        # Schema.org startDate
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
        # Greek patterns
        r'Ώρα[:\s]+(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]+(\d{1,2}:\d{2})',
        # Meta tags
        r'<meta[^>]*content="[^"]*T(\d{2}:\d{2}):',
    ],
    "athinorama.gr": [
        # Athinorama uses Greek time format
        r'Ώρα[:\s]*(\d{1,2}:\d{2})',
        r'(\d{1,2}:\d{2})\s*(?:μ\.μ\.|μμ)',
        # Event info blocks
        r'<span[^>]*class="[^"]*hour[^"]*"[^>]*>(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]*(\d{1,2}:\d{2})',
    ],
    "gazarte.gr": [
        # Gazarte event times
        r'Ώρα[:\s]*(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]*(\d{1,2}:\d{2})',
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
    ],
    # Generic fallback patterns for any source
    "default": [
        r'"startDate"[:\s]*"[^"]*T(\d{2}:\d{2})',
        r'<meta[^>]*content="[^"]*T(\d{2}:\d{2}):',
        r'Ώρα[:\s]+(\d{1,2}:\d{2})',
        r'Έναρξη[:\s]+(\d{1,2}:\d{2})',
        r'(\d{1,2}:\d{2})\s*(?:μ\.μ\.|μμ|π\.μ\.|πμ)',
        r'(?:Ημέρα|Ημερομηνία)[^<]*?(\d{1,2}:\d{2})',
        r'\b(\d{1,2}:\d{2})\b',
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
    return "default"


class TimeFetcher:
    """Fetches event times from multiple source sites"""

    def __init__(self, delay_seconds: float = 1.0, dry_run: bool = False, parallel: int = 1):
        self.delay_seconds = delay_seconds
        self.dry_run = dry_run
        self.parallel = parallel
        self.browser: Optional[Browser] = None
        self.context = None
        self.stats = {
            "total": 0,
            "success": 0,
            "no_time_found": 0,
            "failed": 0,
            "by_source": {}
        }

    async def initialize(self):
        """Start browser with shared context for efficiency"""
        playwright = await async_playwright().start()

        # Use system Chrome for reliability
        self.browser = await playwright.chromium.launch(
            headless=True,
            channel="chrome",
        )

        # Create a shared context for all pages (faster than new context per page)
        self.context = await self.browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        )

        print(f"🌐 Browser initialized")
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
            # Split into hours and minutes
            parts = time_str.split(':')
            if len(parts) != 2:
                return None

            hours = int(parts[0])
            minutes = int(parts[1])

            # Validate ranges
            if hours < 0 or hours > 23:
                return None
            if minutes < 0 or minutes > 59:
                return None

            # Return normalized format
            return f"{hours:02d}:{minutes:02d}"

        except (ValueError, IndexError):
            return None

    async def extract_time_from_page(self, url: str) -> Optional[str]:
        """Extract event time from any supported source page"""
        source = get_source_from_url(url)

        try:
            page = await self.context.new_page()

            # Fetch page with longer timeout
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await page.wait_for_timeout(1000)

            # Get page content
            html = await page.content()
            await page.close()

            # Get source-specific patterns, fall back to default
            patterns = SOURCE_PATTERNS.get(source, SOURCE_PATTERNS["default"])

            # Collect all valid times and score them
            time_candidates = []

            for pattern in patterns:
                matches = re.finditer(pattern, html, re.IGNORECASE)
                for match in matches:
                    time_str = match.group(1)
                    validated_time = self.validate_time(time_str)
                    if validated_time:
                        hours = int(validated_time.split(':')[0])
                        minutes = int(validated_time.split(':')[1])

                        # Skip very early morning times (unlikely for events)
                        if hours < 8:
                            continue

                        # Score based on likelihood of being an event time
                        score = 0

                        # Prefer rounded times (19:00, 20:30 etc)
                        if minutes in [0, 15, 30, 45]:
                            score += 10

                        # Evening times more likely (18:00-23:00)
                        if 18 <= hours <= 23:
                            score += 5
                        # Afternoon times also common (14:00-17:59)
                        elif 14 <= hours <= 17:
                            score += 3
                        # Morning/midday times less likely but possible
                        elif 10 <= hours <= 13:
                            score += 1

                        time_candidates.append((validated_time, score))

            # Return the highest scoring time
            if time_candidates:
                time_candidates.sort(key=lambda x: x[1], reverse=True)
                return time_candidates[0][0]

            return None

        except Exception as e:
            print(f"   ❌ Error fetching page: {e}")
            self.stats["failed"] += 1
            return None

    async def fetch_single_event(self, event_data: Tuple[str, str, str, str], index: int, total: int) -> Optional[Tuple[str, str, str]]:
        """Fetch time for a single event, return (new_date, event_id, source) or None"""
        event_id, title, current_date, url = event_data
        source = get_source_from_url(url)

        print(f"[{index}/{total}] {title[:50]}...")
        print(f"   URL: {url} ({source})")

        time_str = await self.extract_time_from_page(url)

        if time_str:
            # Convert "20:30" to proper ISO timestamp
            date_part = current_date.split('T')[0]
            new_date = f"{date_part}T{time_str}:00+02:00"

            print(f"   ✅ Found time: {time_str} → {new_date}")

            self.stats["success"] += 1
            self.stats["by_source"][source] = self.stats["by_source"].get(source, 0) + 1
            return (new_date, event_id, source)
        else:
            print(f"   ⚠️  No time found")
            self.stats["no_time_found"] += 1
            return None

    async def fetch_and_update(self, events: List[Tuple[str, str, str, str]]):
        """Fetch times and update database - supports parallel fetching"""
        self.stats["total"] = len(events)

        print(f"\n⏰ Fetching times for {len(events)} events...\n")

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
            print(f"\n💾 Updating database with {len(updates)} times...")
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            for new_date, event_id, _ in updates:
                cursor.execute(
                    "UPDATE events SET start_date = ?, updated_at = datetime('now') WHERE id = ?",
                    (new_date, event_id)
                )

            conn.commit()
            conn.close()
            print(f"✅ Database updated!")
        elif self.dry_run:
            print(f"\n🔍 DRY RUN: Would update {len(updates)} events")

    async def close(self):
        """Cleanup"""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()

    def print_summary(self):
        """Print final statistics"""
        print(f"\n{'='*60}")
        print(f"📊 Time Fetch Summary (Multi-Source)")
        print(f"{'='*60}")
        print(f"Total events:     {self.stats['total']}")
        print(f"✅ Times found:   {self.stats['success']}")
        print(f"⚠️  No time found: {self.stats['no_time_found']}")
        print(f"❌ Failed:        {self.stats['failed']}")

        # Show breakdown by source
        if self.stats['by_source']:
            print(f"\n📌 By Source:")
            for source, count in sorted(self.stats['by_source'].items(), key=lambda x: -x[1]):
                print(f"   {source}: {count} times found")

        print(f"{'='*60}")
        if self.stats['total'] > 0:
            success_rate = (self.stats['success'] / self.stats['total']) * 100
            print(f"📈 Success rate: {success_rate:.1f}%")
        print(f"{'='*60}")


def get_events_with_missing_times(limit: Optional[int] = None, source: Optional[str] = None) -> List[Tuple[str, str, str, str]]:
    """Query events with midnight timestamps from database - supports all sources"""

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
        SELECT id, title, start_date, url
        FROM events
        WHERE date(start_date) >= date('now')
        AND (start_date LIKE '%00:00:00%' OR start_date LIKE '%T00:00%')
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
        for _, _, _, url in events:
            src = get_source_from_url(url)
            source_counts[src] = source_counts.get(src, 0) + 1
        print(f"\n📌 Events by source:")
        for src, count in sorted(source_counts.items(), key=lambda x: -x[1]):
            print(f"   {src}: {count} events")

    return events


async def main():
    parser = argparse.ArgumentParser(description="Fetch missing event times from all supported sources")
    parser.add_argument("--limit", type=int, help="Limit number of events (for testing)")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between requests (default: 1.0s)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating database")
    parser.add_argument("--parallel", type=int, default=1, help="Number of pages to fetch in parallel (default: 1)")
    parser.add_argument("--source", type=str, help="Filter to specific source (viva.gr, more.com, athinorama.gr, gazarte.gr)")

    args = parser.parse_args()

    print(f"🔍 Finding events with missing times (00:00:00)...")
    if args.source:
        print(f"📌 Filtering to source: {args.source}")

    # Get events from database
    events = get_events_with_missing_times(limit=args.limit, source=args.source)

    if not events:
        print(f"✅ No events found with missing times!")
        sys.exit(0)

    print(f"📋 Found {len(events)} events with missing times")

    # Fetch times
    fetcher = TimeFetcher(delay_seconds=args.delay, dry_run=args.dry_run, parallel=args.parallel)

    try:
        await fetcher.initialize()
        await fetcher.fetch_and_update(events)
    finally:
        await fetcher.close()

    fetcher.print_summary()


if __name__ == "__main__":
    asyncio.run(main())
