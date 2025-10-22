#!/usr/bin/env python3
"""
Playwright Web Scraper - Production Ready with Best Practices
==============================================================

Features:
- Anti-detection with stealth techniques
- Resource blocking for performance
- Proxy support
- Browser context management
- Error handling and retries
- Configurable settings
- Multiple browser support

Installation:
    pip install playwright playwright-stealth --break-system-packages
    playwright install chromium

Usage:
    from playwright_scraper import PlaywrightScraper

    async with PlaywrightScraper() as scraper:
        html = await scraper.get('https://example.com')
"""

import asyncio
import random
import logging
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any, Callable
from dataclasses import dataclass
from enum import Enum

from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Route

# Optional: Install with: pip install playwright-stealth --break-system-packages
try:
    from playwright_stealth import stealth_async
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False
    logging.warning("playwright-stealth not installed. Install with: pip install playwright-stealth")


class BrowserType(Enum):
    """Supported browser types"""
    CHROMIUM = "chromium"
    FIREFOX = "firefox"
    WEBKIT = "webkit"


@dataclass
class ScraperConfig:
    """Configuration for the Playwright scraper"""

    # Browser settings
    browser_type: BrowserType = BrowserType.CHROMIUM
    headless: bool = True

    # Anti-detection
    use_stealth: bool = True
    disable_webdriver: bool = True

    # Performance
    block_images: bool = True
    block_fonts: bool = False
    block_stylesheets: bool = False
    block_media: bool = True

    # Proxy settings
    proxy_server: Optional[str] = None  # e.g., "http://proxy.example.com:8080"
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None

    # Browser context settings
    viewport_width: int = 1920
    viewport_height: int = 1080
    user_agent: Optional[str] = None
    locale: str = "en-US"
    timezone_id: str = "America/New_York"

    # Behavior settings
    default_timeout: int = 30000  # milliseconds
    navigation_timeout: int = 30000
    wait_until: str = "domcontentloaded"  # or "load", "networkidle"

    # Delays for human-like behavior
    min_delay: int = 1000  # milliseconds
    max_delay: int = 3000

    # Advanced
    ignore_https_errors: bool = True
    java_script_enabled: bool = True


class PlaywrightScraper:
    """
    Production-ready Playwright scraper with anti-detection and best practices.
    """

    # Default Chrome user agent (update periodically)
    DEFAULT_USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    # Chromium launch arguments optimized for scraping
    CHROMIUM_ARGS = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-ipc-flooding-protection',
        '--disable-hang-monitor',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-features=TranslateUI',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--no-first-run',
        '--password-store=basic',
        '--use-mock-keychain',
    ]

    def __init__(self, config: Optional[ScraperConfig] = None):
        """
        Initialize the Playwright scraper.

        Args:
            config: Configuration object. Uses defaults if not provided.
        """
        self.config = config or ScraperConfig()
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None

        # Setup logging
        self.logger = logging.getLogger(__name__)
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)

    async def __aenter__(self):
        """Context manager entry"""
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        await self.close()

    async def start(self):
        """Initialize browser and context"""
        self.playwright = await async_playwright().start()

        # Select browser type
        if self.config.browser_type == BrowserType.CHROMIUM:
            browser_launcher = self.playwright.chromium
        elif self.config.browser_type == BrowserType.FIREFOX:
            browser_launcher = self.playwright.firefox
        else:
            browser_launcher = self.playwright.webkit

        # Prepare launch options
        launch_options: Dict[str, Any] = {
            'headless': self.config.headless,
        }

        # Try using system Chrome instead of downloaded Chromium (macOS workaround)
        if self.config.browser_type == BrowserType.CHROMIUM:
            # Try to use system Chrome which is already trusted by macOS
            try:
                launch_options['channel'] = 'chrome'  # Use installed Chrome
                self.logger.info("Attempting to use system Chrome browser")
            except:
                # Fallback to Playwright's chromium
                launch_options['args'] = self.CHROMIUM_ARGS.copy()

        # Add proxy if configured
        if self.config.proxy_server:
            launch_options['proxy'] = {
                'server': self.config.proxy_server,
            }
            if self.config.proxy_username:
                launch_options['proxy']['username'] = self.config.proxy_username
            if self.config.proxy_password:
                launch_options['proxy']['password'] = self.config.proxy_password

        # Launch browser
        self.browser = await browser_launcher.launch(**launch_options)
        self.logger.info(f"Browser launched: {self.config.browser_type.value}")

        # Create context with anti-detection settings
        context_options = {
            'viewport': {
                'width': self.config.viewport_width,
                'height': self.config.viewport_height
            },
            'user_agent': self.config.user_agent or self.DEFAULT_USER_AGENT,
            'locale': self.config.locale,
            'timezone_id': self.config.timezone_id,
            'ignore_https_errors': self.config.ignore_https_errors,
            'java_script_enabled': self.config.java_script_enabled,
        }

        self.context = await self.browser.new_context(**context_options)
        self.context.set_default_timeout(self.config.default_timeout)
        self.context.set_default_navigation_timeout(self.config.navigation_timeout)

        # Create page
        self.page = await self.context.new_page()

        # Apply stealth if available and enabled
        if self.config.use_stealth and STEALTH_AVAILABLE:
            await stealth_async(self.page)
            self.logger.info("Stealth mode applied")
        elif self.config.use_stealth and not STEALTH_AVAILABLE:
            self.logger.warning("Stealth mode requested but playwright-stealth not installed")

        # Manually remove webdriver property if stealth not available
        if self.config.disable_webdriver and not STEALTH_AVAILABLE:
            await self.page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
            """)

        # Setup resource blocking
        if any([
            self.config.block_images,
            self.config.block_fonts,
            self.config.block_stylesheets,
            self.config.block_media
        ]):
            await self.page.route('**/*', self._resource_blocker)
            self.logger.info("Resource blocking enabled")

    async def _resource_blocker(self, route: Route):
        """Block unnecessary resources to improve performance"""
        resource_type = route.request.resource_type

        should_block = (
            (resource_type == 'image' and self.config.block_images) or
            (resource_type == 'font' and self.config.block_fonts) or
            (resource_type == 'stylesheet' and self.config.block_stylesheets) or
            (resource_type == 'media' and self.config.block_media)
        )

        if should_block:
            await route.abort()
        else:
            await route.continue_()

    async def random_delay(self):
        """Add random delay to mimic human behavior"""
        delay = random.randint(self.config.min_delay, self.config.max_delay)
        await asyncio.sleep(delay / 1000)

    async def get(
        self,
        url: str,
        wait_until: Optional[str] = None,
        add_delay: bool = True
    ) -> str:
        """
        Navigate to URL and return HTML content.

        Args:
            url: Target URL
            wait_until: Wait condition ('load', 'domcontentloaded', 'networkidle')
            add_delay: Whether to add random delay before returning

        Returns:
            HTML content of the page
        """
        if not self.page:
            raise RuntimeError("Browser not started. Use async with or call start()")

        self.logger.info(f"Navigating to: {url}")

        await self.page.goto(
            url,
            wait_until=wait_until or self.config.wait_until
        )

        if add_delay:
            await self.random_delay()

        return await self.page.content()

    async def get_with_scroll(self, url: str, scroll_count: int = 3) -> str:
        """
        Navigate to URL, scroll page to load dynamic content, return HTML.

        Args:
            url: Target URL
            scroll_count: Number of times to scroll down

        Returns:
            HTML content after scrolling
        """
        await self.get(url, add_delay=False)

        for i in range(scroll_count):
            self.logger.info(f"Scrolling {i+1}/{scroll_count}")
            await self.page.evaluate('window.scrollBy(0, window.innerHeight)')
            await self.random_delay()

        return await self.page.content()

    async def extract_data(
        self,
        url: str,
        selectors: Dict[str, str],
        wait_for_selector: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """
        Navigate to URL and extract data using CSS selectors.

        Args:
            url: Target URL
            selectors: Dict mapping field names to CSS selectors
            wait_for_selector: Optional selector to wait for before extraction

        Returns:
            List of dictionaries containing extracted data
        """
        await self.get(url, add_delay=False)

        if wait_for_selector:
            await self.page.wait_for_selector(wait_for_selector)

        # Find all elements for the first selector to determine count
        first_key = list(selectors.keys())[0]
        first_selector = selectors[first_key]
        elements = await self.page.query_selector_all(first_selector)

        results = []
        for i in range(len(elements)):
            item = {}
            for field, selector in selectors.items():
                elements = await self.page.query_selector_all(selector)
                if i < len(elements):
                    item[field] = await elements[i].inner_text()
                else:
                    item[field] = None
            results.append(item)

        self.logger.info(f"Extracted {len(results)} items")
        return results

    async def click_and_wait(
        self,
        selector: str,
        wait_for_selector: Optional[str] = None,
        wait_for_navigation: bool = False
    ):
        """
        Click an element and optionally wait for response.

        Args:
            selector: CSS selector for element to click
            wait_for_selector: Optional selector to wait for after click
            wait_for_navigation: Whether to wait for navigation
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        if wait_for_navigation:
            async with self.page.expect_navigation():
                await self.page.click(selector)
        else:
            await self.page.click(selector)

        if wait_for_selector:
            await self.page.wait_for_selector(wait_for_selector)

        await self.random_delay()

    async def fill_form(self, form_data: Dict[str, str]):
        """
        Fill form fields with human-like behavior.

        Args:
            form_data: Dict mapping CSS selectors to values to fill
        """
        for selector, value in form_data.items():
            await self.page.fill(selector, value)
            await asyncio.sleep(random.uniform(0.1, 0.3))

    async def take_screenshot(
        self,
        path: str,
        full_page: bool = False
    ):
        """
        Take a screenshot of the current page.

        Args:
            path: File path to save screenshot
            full_page: Whether to capture full scrollable page
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        await self.page.screenshot(path=path, full_page=full_page)
        self.logger.info(f"Screenshot saved to: {path}")

    async def execute_script(self, script: str) -> Any:
        """
        Execute JavaScript in the page context.

        Args:
            script: JavaScript code to execute

        Returns:
            Result of script execution
        """
        if not self.page:
            raise RuntimeError("Browser not started")

        return await self.page.evaluate(script)

    async def new_page(self) -> Page:
        """
        Create a new page in the same context.

        Returns:
            New page instance
        """
        if not self.context:
            raise RuntimeError("Browser not started")

        page = await self.context.new_page()

        # Apply stealth to new page
        if self.config.use_stealth and STEALTH_AVAILABLE:
            await stealth_async(page)

        return page

    async def close(self):
        """Close browser and cleanup"""
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

        self.logger.info("Browser closed")


# =============================================================================
# MORE.COM SCRAPING FUNCTION
# =============================================================================

async def scrape_more_com():
    """Attempt to scrape more.com with Playwright - ONE LAST TRY"""

    print("🕷️  Playwright Scraper for more.com")
    print("=" * 70)
    print()

    # URLs to try - comprehensive list for more.com
    urls_to_try = [
        # Main pages
        "https://www.more.com",
        "https://www.more.com/gr-el/tickets/",
        "https://www.more.com/en-us/tickets/",

        # Music/Concerts
        "https://www.more.com/gr-el/tickets/music/",
        "https://www.more.com/gr-el/tickets/concerts/",
        "https://www.more.com/en-us/tickets/music/",

        # Theater
        "https://www.more.com/gr-el/tickets/theater/",
        "https://www.more.com/en-us/tickets/theater/",

        # Sports (they also sell sports tickets)
        "https://www.more.com/gr-el/tickets/sports/",

        # Alternative domains
        "https://www.more.gr",
        "https://www.more.gr/tickets/",

        # Legacy URLs
        "https://www.more.com/events",
        "https://www.more.com/tickets",
    ]

    config = ScraperConfig(
        headless=True,
        block_images=True,
        block_fonts=True,
        block_media=True,
        use_stealth=STEALTH_AVAILABLE,
        default_timeout=30000,
        navigation_timeout=30000,
        wait_until="domcontentloaded"
    )

    successful_urls = []
    failed_urls = []

    async with PlaywrightScraper(config) as scraper:
        for i, url in enumerate(urls_to_try, 1):
            try:
                print(f"\n🌐 [{i}/{len(urls_to_try)}] Trying: {url}")

                html = await scraper.get(url)

                # Check if we got actual content (not just error page)
                if len(html) < 5000:
                    print(f"   ⚠️  Page too small ({len(html)} bytes) - likely error page, skipping")
                    failed_urls.append((url, "Page too small"))
                    continue

                # Success! Save HTML
                output_dir = Path('./data/html-to-parse')
                output_dir.mkdir(parents=True, exist_ok=True)

                timestamp = datetime.now().strftime('%Y-%m-%d')
                # Create unique filename based on URL path
                url_slug = url.replace('https://', '').replace('http://', '').replace('/', '-').replace('.', '-')
                url_slug = url_slug[:50]  # Limit length
                filename = f"{timestamp}-more-{url_slug}.html"
                filepath = output_dir / filename

                # Save HTML
                filepath.write_text(html, encoding='utf-8')

                # Save metadata
                metadata = {
                    'site_id': 'more',
                    'site_name': 'more.com',
                    'url': url,
                    'fetched_at': datetime.now().isoformat(),
                    'html_length': len(html),
                    'method': 'playwright',
                    'success': True
                }

                metadata_path = filepath.with_suffix('.json')
                metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')

                print(f"   ✅ Success! Saved to: {filename}")
                print(f"   📊 HTML length: {len(html):,} bytes ({len(html) / 1024:.1f} KB)")

                successful_urls.append(url)

                # Add small delay between requests to be polite
                await asyncio.sleep(2)

            except Exception as error:
                print(f"   ❌ Failed: {error}")
                failed_urls.append((url, str(error)))
                continue

    print("\n" + "=" * 70)
    print("\n📊 Summary:")
    print(f"   ✅ Successful: {len(successful_urls)}")
    print(f"   ❌ Failed: {len(failed_urls)}")

    if successful_urls:
        print("\n✅ Successfully scraped:")
        for url in successful_urls:
            print(f"   - {url}")

    if failed_urls:
        print("\n❌ Failed URLs:")
        for url, error in failed_urls:
            print(f"   - {url}")
            print(f"     Error: {error}")

    print("\n" + "=" * 70)
    print("✅ Playwright scraping completed")


if __name__ == '__main__':
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(message)s'
    )

    # Run the more.com scraper
    asyncio.run(scrape_more_com())
