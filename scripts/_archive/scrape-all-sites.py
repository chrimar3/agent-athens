#!/usr/bin/env python3
"""
Unified Web Scraper for Agent Athens
=====================================

Handles ALL sites from config/scrape-list.json using multiple methods:
- playwright: Browser automation for JS-heavy sites (Viva, More)
- curl: Simple HTTP fetch for static sites (Athinorama)
- ical: iCal feed fetching (Clubber.gr)

Features:
- Uses system Chrome to bypass macOS restrictions
- Respects crawl frequency tracking
- Resource blocking for performance
- Anti-detection with realistic browser
- Saves HTML/iCal for parsing
"""

import asyncio
import json
import logging
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Route

# Optional stealth mode
try:
    from playwright_stealth import stealth_async
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False


@dataclass
class ScrapeConfig:
    """Configuration from scrape-list.json"""
    total_sites: int
    expected_monthly_events: int
    user_agent: str
    default_delay_seconds: int
    default_crawl_frequency: str
    default_timeout_ms: int
    max_retries: int


@dataclass
class Site:
    """Site configuration"""
    id: str
    name: str
    url: Optional[str]
    tier: int
    difficulty: str
    expected_events: int
    crawl_frequency: str
    pages: List[str]
    categories: List[str]
    skip: bool = False
    scrape_method: Optional[str] = None
    ical_feed: Optional[str] = None
    parser: Optional[str] = None
    importer: Optional[str] = None
    notes: Optional[str] = None


class UnifiedScraper:
    """Unified scraper for all Agent Athens sites"""

    def __init__(self):
        self.config = None
        self.sites = []
        self.tracker = {}
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.browser_started = False

        # Setup logging - disable duplicate output
        self.logger = logging.getLogger(__name__)
        self.logger.handlers = []  # Clear any existing handlers
        self.logger.propagate = False  # Prevent duplicate logs
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(message)s')
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    def load_config(self):
        """Load scrape-list.json configuration"""
        config_path = Path('./config/scrape-list.json')
        with open(config_path) as f:
            data = json.load(f)

        crawl_config = data['crawl_config']
        self.config = ScrapeConfig(
            total_sites=crawl_config['total_sites'],
            expected_monthly_events=crawl_config['expected_monthly_events'],
            user_agent=crawl_config['user_agent'],
            default_delay_seconds=crawl_config['default_delay_seconds'],
            default_crawl_frequency=crawl_config.get('default_crawl_frequency', 'daily'),
            default_timeout_ms=crawl_config.get('default_timeout_ms', 30000),
            max_retries=crawl_config.get('max_retries', 2)
        )

        # Load sites
        self.sites = []
        for site_data in data['sites']:
            site = Site(
                id=site_data['id'],
                name=site_data['name'],
                url=site_data.get('url'),
                tier=site_data['tier'],
                difficulty=site_data['difficulty'],
                expected_events=site_data['expected_events'],
                crawl_frequency=site_data['crawl_frequency'],
                pages=site_data.get('pages', []),
                categories=site_data.get('categories', []),
                skip=site_data.get('skip', False),
                scrape_method=site_data.get('scrape_method'),
                ical_feed=site_data.get('ical_feed'),
                parser=site_data.get('parser'),
                importer=site_data.get('importer'),
                notes=site_data.get('notes')
            )
            self.sites.append(site)

    def load_tracker(self):
        """Load crawl tracker"""
        tracker_path = Path('./data/crawl-tracker.json')
        if tracker_path.exists():
            with open(tracker_path) as f:
                self.tracker = json.load(f)
        else:
            self.tracker = {}

    def save_tracker(self):
        """Save crawl tracker"""
        tracker_path = Path('./data/crawl-tracker.json')
        tracker_path.parent.mkdir(parents=True, exist_ok=True)
        with open(tracker_path, 'w') as f:
            json.dump(self.tracker, f, indent=2)

    def should_crawl_site(self, site: Site) -> bool:
        """Check if site needs crawling based on frequency"""
        if site.id not in self.tracker:
            return True

        last_crawled = self.tracker[site.id].get('last_crawled')
        if not last_crawled:
            return True

        # Parse timestamp and make it timezone-aware if needed
        last_crawled_clean = last_crawled.replace('Z', '+00:00')
        last_crawl_dt = datetime.fromisoformat(last_crawled_clean)

        # Ensure both datetimes are timezone-aware
        if last_crawl_dt.tzinfo is None:
            from datetime import timezone
            last_crawl_dt = last_crawl_dt.replace(tzinfo=timezone.utc)

        now_aware = datetime.now().astimezone()
        hours_since = (now_aware - last_crawl_dt).total_seconds() / 3600

        frequency_map = {
            'daily': 24,
            'bi-weekly': 84,
            'weekly': 168,
            'monthly': 720
        }

        required_hours = frequency_map.get(site.crawl_frequency, 24)
        return hours_since >= required_hours

    async def start_browser(self):
        """Initialize Playwright browser (lazy - only when needed)"""
        if self.browser_started:
            return

        self.playwright = await async_playwright().start()

        # Launch browser with system Chrome (macOS workaround)
        try:
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                channel='chrome'  # Use system Chrome
            )
            self.logger.info("✅ Using system Chrome browser")
        except Exception as e:
            # Fallback to regular chromium
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                ]
            )
            self.logger.info("✅ Using Playwright Chromium")

        # Create context with anti-detection
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent=self.config.user_agent,
            locale='el-GR',  # Greek locale for Athens sites
            timezone_id='Europe/Athens',
        )

        self.context.set_default_timeout(self.config.default_timeout_ms)
        self.context.set_default_navigation_timeout(self.config.default_timeout_ms)
        self.browser_started = True

    async def close_browser(self):
        """Close browser"""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def fetch_page(self, url: str, retries: int = 2) -> Optional[str]:
        """Fetch a single page using Playwright with retry logic"""
        for attempt in range(retries + 1):
            page = await self.context.new_page()

            # Resource blocking for performance (only images/fonts/media - keep styles for JS sites)
            async def block_resources(route: Route):
                resource_type = route.request.resource_type
                url_str = route.request.url
                # Block images, fonts, media, and tracking
                if resource_type in ['image', 'font', 'media']:
                    await route.abort()
                elif any(x in url_str for x in ['google-analytics', 'gtag', 'facebook.net', 'hotjar', 'doubleclick']):
                    await route.abort()
                else:
                    await route.continue_()

            await page.route('**/*', block_resources)

            try:
                await page.goto(url, wait_until='domcontentloaded', timeout=45000)
                # Wait a bit for dynamic content
                await asyncio.sleep(1)
                html = await page.content()
                await page.close()
                return html
            except Exception as e:
                await page.close()
                if attempt < retries:
                    self.logger.warning(f"   ⚠️  Retry {attempt + 1}/{retries}: {e}")
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                else:
                    self.logger.error(f"   ❌ Failed to fetch {url} after {retries + 1} attempts: {e}")
                    return None
        return None

    def fetch_with_curl(self, url: str) -> Optional[str]:
        """Fetch a page using curl (for simple static sites)"""
        try:
            result = subprocess.run([
                'curl', '-s', '-A', self.config.user_agent,
                '--connect-timeout', '30',
                url
            ], capture_output=True, text=True, timeout=60)

            if result.returncode == 0 and result.stdout:
                return result.stdout
            else:
                self.logger.error(f"   ❌ curl failed: {result.stderr}")
                return None
        except subprocess.TimeoutExpired:
            self.logger.error(f"   ❌ curl timeout for {url}")
            return None
        except Exception as e:
            self.logger.error(f"   ❌ curl error: {e}")
            return None

    def fetch_ical(self, url: str) -> Optional[str]:
        """Fetch iCal feed using curl (no browser user agent - iCal clients don't use Chrome UA)"""
        try:
            # Use a simple user agent for iCal feeds - Chrome UA causes some servers to return HTML
            result = subprocess.run([
                'curl', '-s',
                '-A', 'AgentAthens/1.0 (iCal)',
                '--connect-timeout', '30',
                url
            ], capture_output=True, text=True, timeout=120)

            if result.returncode == 0 and result.stdout:
                # Verify it's valid iCal
                if 'BEGIN:VCALENDAR' in result.stdout:
                    return result.stdout
                else:
                    self.logger.error(f"   ❌ Invalid iCal response (got HTML instead)")
                    return None
            else:
                self.logger.error(f"   ❌ iCal fetch failed: {result.stderr}")
                return None
        except subprocess.TimeoutExpired:
            self.logger.error(f"   ❌ iCal fetch timeout for {url}")
            return None
        except Exception as e:
            self.logger.error(f"   ❌ iCal fetch error: {e}")
            return None

    def save_html(self, site_id: str, site_name: str, url: str, html: str) -> str:
        """Save HTML file for Claude Code parsing"""
        output_dir = Path('./data/html-to-parse')
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y-%m-%d')

        # Create filename from URL
        url_slug = url.replace('https://', '').replace('http://', '')
        url_slug = url_slug.replace('/', '-').replace('.', '-')[:50]
        filename = f"{timestamp}-{site_id}-{url_slug}.html"
        filepath = output_dir / filename

        # Save HTML
        filepath.write_text(html, encoding='utf-8')

        # Save metadata
        metadata = {
            'site_id': site_id,
            'site_name': site_name,
            'url': url,
            'fetched_at': datetime.now().isoformat(),
            'html_length': len(html),
        }

        metadata_path = filepath.with_suffix('.json')
        metadata_path.write_text(json.dumps(metadata, indent=2))

        return str(filepath)

    def save_ical(self, site_id: str, site_name: str, url: str, content: str) -> str:
        """Save iCal file for parsing"""
        output_dir = Path('./data/ical-to-parse')
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y-%m-%d')
        filename = f"{timestamp}-{site_id}.ics"
        filepath = output_dir / filename

        # Save iCal
        filepath.write_text(content, encoding='utf-8')

        # Save metadata
        metadata = {
            'site_id': site_id,
            'site_name': site_name,
            'url': url,
            'fetched_at': datetime.now().isoformat(),
            'content_length': len(content),
            'event_count': content.count('BEGIN:VEVENT')
        }

        metadata_path = filepath.with_suffix('.json')
        metadata_path.write_text(json.dumps(metadata, indent=2))

        return str(filepath)

    async def scrape_site(self, site: Site) -> Dict[str, Any]:
        """Scrape a single site using appropriate method"""
        self.logger.info(f"\n🌐 Scraping: {site.name} ({site.id})")
        self.logger.info(f"   Tier: {site.tier} | Method: {site.scrape_method}")
        self.logger.info(f"   Expected: {site.expected_events} events | Frequency: {site.crawl_frequency}")

        # Skip sites marked as skip
        if site.skip:
            self.logger.info(f"   ⏭️  Skipping: {site.notes or 'Marked as skip'}")
            return {'success': True, 'pages': 0, 'skipped': True}

        # Skip social media scraping (not implemented)
        if site.scrape_method in ['social_media_or_aggregator', 'instagram']:
            self.logger.info(f"   ⏭️  Skipping: {site.scrape_method} (not implemented)")
            return {'success': True, 'pages': 0, 'skipped': True}

        # Initialize tracker
        if site.id not in self.tracker:
            self.tracker[site.id] = {
                'last_crawled': '',
                'last_success': '',
                'total_crawls': 0,
                'failed_crawls': 0
            }

        pages_fetched = 0
        errors = []

        # Handle iCal feeds
        if site.scrape_method == 'ical' and site.ical_feed:
            self.logger.info(f"   📅 Fetching iCal: {site.ical_feed}")
            content = self.fetch_ical(site.ical_feed)

            if content:
                event_count = content.count('BEGIN:VEVENT')
                filepath = self.save_ical(site.id, site.name, site.ical_feed, content)
                self.logger.info(f"   💾 Saved: {Path(filepath).name} ({event_count} events)")
                pages_fetched = 1
            else:
                errors.append(f"{site.ical_feed}: Failed to fetch iCal")

        # Handle curl (simple HTTP) sites
        elif site.scrape_method == 'curl':
            for page_url in site.pages:
                try:
                    self.logger.info(f"   📥 Fetching (curl): {page_url}")
                    html = self.fetch_with_curl(page_url)

                    if html is None:
                        errors.append(f"{page_url}: Failed to fetch")
                        continue

                    if len(html) < 1000:
                        self.logger.warning(f"   ⚠️  Page too small ({len(html)} bytes)")
                        continue

                    filepath = self.save_html(site.id, site.name, page_url, html)
                    self.logger.info(f"   💾 Saved: {Path(filepath).name} ({len(html) / 1024:.1f} KB)")
                    pages_fetched += 1

                    # Polite delay
                    await asyncio.sleep(self.config.default_delay_seconds)

                except Exception as e:
                    self.logger.error(f"   ❌ Error: {e}")
                    errors.append(f"{page_url}: {str(e)}")

        # Handle playwright (browser automation) sites
        elif site.scrape_method == 'playwright' or site.pages:
            if not site.pages:
                self.logger.info(f"   ⏭️  Skipping: No pages defined")
                return {'success': True, 'pages': 0, 'skipped': True}

            # Start browser only when needed
            if not self.browser_started:
                self.logger.info("   🚀 Starting browser...")
                await self.start_browser()

            for page_url in site.pages:
                try:
                    self.logger.info(f"   📥 Fetching (playwright): {page_url}")
                    html = await self.fetch_page(page_url)

                    if html is None:
                        errors.append(f"{page_url}: Failed to fetch")
                        continue

                    if len(html) < 5000:
                        self.logger.warning(f"   ⚠️  Page too small ({len(html)} bytes)")
                        continue

                    filepath = self.save_html(site.id, site.name, page_url, html)
                    self.logger.info(f"   💾 Saved: {Path(filepath).name} ({len(html) / 1024:.1f} KB)")
                    pages_fetched += 1

                    # Polite delay
                    await asyncio.sleep(self.config.default_delay_seconds)

                except Exception as e:
                    self.logger.error(f"   ❌ Error: {e}")
                    errors.append(f"{page_url}: {str(e)}")

        else:
            self.logger.info(f"   ⏭️  Skipping: Unknown scrape method '{site.scrape_method}'")
            return {'success': True, 'pages': 0, 'skipped': True}

        # Update tracker
        self.tracker[site.id]['last_crawled'] = datetime.now().isoformat()
        self.tracker[site.id]['total_crawls'] += 1

        if errors:
            self.tracker[site.id]['failed_crawls'] += 1
        else:
            self.tracker[site.id]['last_success'] = datetime.now().isoformat()

        success = pages_fetched > 0
        if success:
            self.logger.info(f"   ✅ Success: Fetched {pages_fetched} pages/feeds")
        else:
            self.logger.info(f"   ❌ Failed: Nothing fetched")

        return {'success': success, 'pages': pages_fetched, 'errors': errors}

    async def run(self, force_all: bool = False, site_filter: Optional[str] = None):
        """Run the scraper"""
        print("🕷️  Unified Web Scraper for Agent Athens")
        print("=" * 70)

        # Load configuration
        self.load_config()
        self.load_tracker()

        print(f"\n📋 Configuration:")
        print(f"   Total sites: {self.config.total_sites}")
        print(f"   Expected events: {self.config.expected_monthly_events}/month")
        print(f"   Delay: {self.config.default_delay_seconds}s between requests")

        # Filter sites
        sites_to_crawl = self.sites

        if site_filter:
            sites_to_crawl = [s for s in sites_to_crawl if s.id == site_filter]
            if not sites_to_crawl:
                print(f"\n❌ No site found with id '{site_filter}'")
                return
            print(f"\n🎯 Filter: Only crawling '{site_filter}'")

        if not force_all:
            sites_to_crawl = [s for s in sites_to_crawl if self.should_crawl_site(s)]

        if force_all:
            print(f"\n🔄 Force mode: Crawling all sites")

        print(f"\n📊 Sites to crawl: {len(sites_to_crawl)}/{len(self.sites)}")

        if not sites_to_crawl:
            print("\n✅ No sites need crawling based on their schedules")
            print("💡 Use --force to crawl all sites anyway\n")
            return

        # Check if any sites need browser
        needs_browser = any(s.scrape_method == 'playwright' or (s.scrape_method is None and s.pages) for s in sites_to_crawl)
        if needs_browser:
            print("\n🚀 Browser will start when needed for Playwright sites")
        else:
            print("\n⚡ No browser needed (using curl/iCal methods)")

        print("=" * 70)

        # Scrape each site
        results = {
            'total': len(sites_to_crawl),
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'total_pages': 0
        }

        for site in sites_to_crawl:
            result = await self.scrape_site(site)

            if result.get('skipped'):
                results['skipped'] += 1
            elif result['success']:
                results['successful'] += 1
            else:
                results['failed'] += 1

            results['total_pages'] += result['pages']

        # Save tracker
        self.save_tracker()

        # Close browser
        await self.close_browser()

        # Summary
        print("\n" + "=" * 70)
        print("\n📊 Scraping Summary:")
        print(f"   Sites processed: {results['total']}")
        print(f"   ✅ Successful: {results['successful']}")
        print(f"   ⏭️  Skipped: {results['skipped']}")
        print(f"   ❌ Failed: {results['failed']}")
        print(f"   📄 Pages fetched: {results['total_pages']}")

        print("\n💡 Next step:")
        print('   Ask Claude Code: "Parse the HTML files in data/html-to-parse/ and extract events to the database"')
        print("\n✅ Web scraping completed\n")


async def main():
    """Main entry point"""
    import sys

    # Parse args
    force_all = '--force' in sys.argv
    site_filter = None
    for arg in sys.argv[1:]:
        if arg.startswith('--site='):
            site_filter = arg.split('=')[1]

    scraper = UnifiedScraper()
    await scraper.run(force_all=force_all, site_filter=site_filter)


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    asyncio.run(main())
