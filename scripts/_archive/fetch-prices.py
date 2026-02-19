#!/usr/bin/env python3
"""
Fetch pricing information for events by scraping individual event pages.

This script:
1. Gets events without pricing from database
2. Fetches their individual event pages with retry logic
3. Extracts price information
4. Updates the database with progress saved every 50 events

Features:
- Automatic retry (2 attempts per URL)
- Network error recovery (browser restart on disconnect)
- Progress saving (every 50 events)
- Graceful handling of timeouts and failures

Run with: python3 scripts/fetch-prices.py [--limit N] [--batch-size N]
"""

import asyncio
import json
import logging
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

from playwright.async_api import async_playwright, Browser, BrowserContext, TimeoutError

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)


class PriceFetcher:
    def __init__(self, db_path: str = 'data/events.db'):
        self.db_path = db_path
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.failed_urls: List[str] = []

    async def start_browser(self):
        """Initialize browser with better settings"""
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(
            headless=True,
            channel='chrome'
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            # Add better network handling
            java_script_enabled=True,
            bypass_csp=True
        )
        # Longer timeout for network issues
        self.context.set_default_timeout(30000)

    async def close_browser(self):
        """Close browser"""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()

    async def fetch_price_with_retry(self, url: str, max_retries: int = 2) -> Optional[Dict[str, Any]]:
        """Fetch price with retry logic"""
        for attempt in range(max_retries):
            try:
                result = await self.fetch_price(url)
                if result:
                    return result

                # If no result but no error, wait and retry
                if attempt < max_retries - 1:
                    await asyncio.sleep(2)

            except TimeoutError as e:
                logger.warning(f"   ⏱️  Timeout on attempt {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(3)
                else:
                    logger.error(f"   ❌ Failed after {max_retries} attempts: Timeout")

            except Exception as e:
                error_msg = str(e)[:150]
                if 'ERR_INTERNET_DISCONNECTED' in error_msg or 'ERR_CONNECTION' in error_msg:
                    logger.warning(f"   🔌 Network issue on attempt {attempt + 1}/{max_retries}")
                    if attempt < max_retries - 1:
                        # Longer wait for network issues
                        await asyncio.sleep(5)
                        # Restart browser if needed
                        try:
                            await self.close_browser()
                            await asyncio.sleep(2)
                            await self.start_browser()
                            logger.info(f"   🔄 Browser restarted")
                        except:
                            pass
                    else:
                        logger.error(f"   ❌ Network failure after {max_retries} attempts")
                else:
                    logger.error(f"   ❌ Error: {error_msg}")

        return None

    async def fetch_price(self, url: str) -> Optional[Dict[str, Any]]:
        """Fetch price from event page"""
        page = None
        try:
            page = await self.context.new_page()

            # Try to load page with better error handling
            await page.goto(url, wait_until='domcontentloaded', timeout=25000)

            # Wait a bit for dynamic content
            await asyncio.sleep(0.5)

            # Get page content
            html = await page.content()

            # Extract prices using regex
            # Pattern 1: Look for JSON data with prices
            json_match = re.search(r'"prices":"<span class=\'money\'>([^<]+)</span>"', html)
            if json_match:
                price_text = json_match.group(1).strip()
                price = self.parse_price(price_text)
                return price

            # Pattern 2: Look for price in HTML
            price_matches = re.findall(r'(€\s*\d+(?:[,.]\d+)?|\d+(?:[,.]\d+)?\s*€)', html)
            if price_matches:
                # Take most common price
                from collections import Counter
                most_common = Counter(price_matches).most_common(1)[0][0]
                price = self.parse_price(most_common)
                return price

            return None

        finally:
            if page:
                try:
                    await page.close()
                except:
                    pass

    def parse_price(self, price_text: str) -> Dict[str, Any]:
        """Parse price text into structured data"""
        # Remove currency symbol and clean
        cleaned = price_text.replace('€', '').replace(',', '.').strip()

        # Check for range
        range_match = re.match(r'(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)', cleaned)
        if range_match:
            min_price = float(range_match.group(1))
            max_price = float(range_match.group(2))
            return {
                'type': 'paid',
                'amount': min_price,
                'range': f'€{min_price:.0f}-€{max_price:.0f}',
                'currency': 'EUR'
            }

        # Single price
        try:
            amount = float(cleaned)
            return {
                'type': 'paid',
                'amount': amount,
                'currency': 'EUR'
            }
        except:
            return None

    async def run(self, limit: Optional[int] = None, batch_size: int = 50):
        """Main execution"""
        logger.info('💰 Price Fetcher for Agent Athens')
        logger.info('=' * 70)

        # Connect to database
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Get events without pricing
        query = """
            SELECT id, title, url
            FROM events
            WHERE url IS NOT NULL
              AND (price_amount IS NULL OR price_amount = 0)
              AND date(start_date) >= date('now')
            ORDER BY start_date ASC
        """

        if limit:
            query += f" LIMIT {limit}"

        cursor.execute(query)
        events = cursor.fetchall()

        logger.info(f'\n📊 Found {len(events)} events needing price data')

        if not events:
            logger.info('\n✅ All events already have pricing!')
            conn.close()
            return

        # Start browser
        logger.info(f'\n🚀 Starting browser...')
        logger.info(f'📦 Processing in batches of {batch_size} events\n')
        await self.start_browser()

        # Fetch prices
        logger.info('💰 Fetching prices...\n')

        updated = 0
        failed = 0
        batch_num = 0

        for idx, event in enumerate(events, 1):
            logger.info(f"[{idx}/{len(events)}] {event['title'][:60]}")
            logger.info(f"   URL: {event['url'][:80]}")

            price = await self.fetch_price_with_retry(event['url'])

            if price:
                # Update database
                cursor.execute("""
                    UPDATE events
                    SET price_type = ?,
                        price_amount = ?,
                        price_range = ?,
                        price_currency = ?
                    WHERE id = ?
                """, (
                    price['type'],
                    price.get('amount'),
                    price.get('range'),
                    price.get('currency'),
                    event['id']
                ))
                conn.commit()

                if price.get('range'):
                    logger.info(f"   ✅ Price: {price['range']}")
                else:
                    logger.info(f"   ✅ Price: €{price['amount']:.2f}")
                updated += 1
            else:
                logger.info(f"   ❌ No price found")
                failed += 1
                self.failed_urls.append(event['url'])

            # Save progress every batch_size events
            if idx % batch_size == 0:
                batch_num += 1
                logger.info(f'\n📊 Batch {batch_num} complete: {updated} updated, {failed} failed')
                logger.info(f'💾 Progress saved to database\n')

            # Small delay between requests
            await asyncio.sleep(0.5)

        # Close browser
        await self.close_browser()

        # Summary
        logger.info('\n' + '=' * 70)
        logger.info(f'\n📊 Final Summary:')
        logger.info(f'   Total processed: {len(events)}')
        logger.info(f'   ✅ Prices found: {updated}')
        logger.info(f'   ❌ No price: {failed}')

        if self.failed_urls:
            logger.info(f'\n⚠️  Failed URLs ({len(self.failed_urls)}):')
            for url in self.failed_urls[:10]:
                logger.info(f'   - {url[:80]}')
            if len(self.failed_urls) > 10:
                logger.info(f'   ... and {len(self.failed_urls) - 10} more')

        logger.info(f'\n✅ Price fetching complete!')

        conn.close()


async def main():
    limit = None
    batch_size = 50

    if '--limit' in sys.argv:
        idx = sys.argv.index('--limit')
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    if '--batch-size' in sys.argv:
        idx = sys.argv.index('--batch-size')
        if idx + 1 < len(sys.argv):
            batch_size = int(sys.argv[idx + 1])

    fetcher = PriceFetcher()
    await fetcher.run(limit=limit, batch_size=batch_size)


if __name__ == '__main__':
    asyncio.run(main())
