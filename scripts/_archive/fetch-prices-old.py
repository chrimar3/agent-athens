#!/usr/bin/env python3
"""
Fetch pricing information for events by scraping individual event pages.

This script:
1. Gets events without pricing from database
2. Fetches their individual event pages
3. Extracts price information
4. Updates the database

Run with: python3 scripts/fetch-prices.py [--limit N]
"""

import asyncio
import json
import logging
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from playwright.async_api import async_playwright, Browser, BrowserContext

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)


class PriceFetcher:
    def __init__(self, db_path: str = 'data/events.db'):
        self.db_path = db_path
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None

    async def start_browser(self):
        """Initialize browser"""
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(
            headless=True,
            channel='chrome'
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        )
        self.context.set_default_timeout(15000)

    async def close_browser(self):
        """Close browser"""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()

    async def fetch_price(self, url: str) -> Optional[Dict[str, Any]]:
        """Fetch price from event page"""
        page = None
        try:
            page = await self.context.new_page()

            # Increased timeout and better error handling
            await page.goto(url, wait_until='domcontentloaded', timeout=20000)

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

        except Exception as e:
            logger.error(f"   Error fetching {url}: {str(e)[:100]}")
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

    async def run(self, limit: Optional[int] = None):
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
            return

        # Start browser
        logger.info('\n🚀 Starting browser...')
        await self.start_browser()

        # Fetch prices
        logger.info('\n💰 Fetching prices...\n')

        updated = 0
        failed = 0

        for idx, event in enumerate(events, 1):
            logger.info(f"[{idx}/{len(events)}] {event['title'][:50]}")
            logger.info(f"   URL: {event['url']}")

            price = await self.fetch_price(event['url'])

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
                    logger.info(f"   ✅ Price: €{price['amount']:.0f}")
                updated += 1
            else:
                logger.info(f"   ❌ No price found")
                failed += 1

            # Reduced delay for faster processing
            await asyncio.sleep(0.3)

        # Close browser
        await self.close_browser()

        # Summary
        logger.info('\n' + '=' * 70)
        logger.info(f'\n📊 Summary:')
        logger.info(f'   Total processed: {len(events)}')
        logger.info(f'   ✅ Prices found: {updated}')
        logger.info(f'   ❌ No price: {failed}')
        logger.info(f'\n✅ Price fetching complete!')

        conn.close()


async def main():
    limit = None
    if '--limit' in sys.argv:
        idx = sys.argv.index('--limit')
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    fetcher = PriceFetcher()
    await fetcher.run(limit=limit)


if __name__ == '__main__':
    asyncio.run(main())
