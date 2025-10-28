#!/usr/bin/env python3
"""
Test script to analyze viva.gr page structure and find price selectors
"""

import asyncio
from playwright.async_api import async_playwright

async def test_viva_page():
    """Fetch a viva.gr page and extract price information"""

    # Sample viva.gr URL
    url = "https://www.viva.gr/gr-el/tickets/music/eden-presents-apparat/"

    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(headless=False)  # Visible browser for debugging
    context = await browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    )

    page = await context.new_page()

    print(f"🔍 Loading {url}")
    await page.goto(url, wait_until='networkidle', timeout=30000)

    # Wait for dynamic content
    await asyncio.sleep(3)

    print("\n📄 Page title:", await page.title())

    # Try various selectors
    selectors_to_try = [
        '.price',
        '.ticket-price',
        '[class*="price"]',
        '[class*="Price"]',
        '.money',
        '[class*="money"]',
        '[data-price]',
        '.product-price',
        '.event-price',
        'span.money',
        'div[class*="ticket"] span',
        'button[class*="ticket"]',
    ]

    print("\n🔍 Trying selectors:")
    for selector in selectors_to_try:
        try:
            elements = await page.query_selector_all(selector)
            if elements:
                print(f"\n✅ Found {len(elements)} elements with selector: {selector}")
                for i, el in enumerate(elements[:3]):  # Show first 3
                    text = await el.inner_text()
                    html = await el.inner_html()
                    print(f"   [{i+1}] Text: {text.strip()}")
                    print(f"       HTML: {html[:100]}")
        except Exception as e:
            print(f"❌ {selector}: {e}")

    # Search for euro symbol in page content
    print("\n💰 Searching for € symbol in page...")
    content = await page.content()

    import re
    euro_matches = re.findall(r'[^>]*€\s*\d+(?:[,.]\d+)?[^<]*', content)
    if euro_matches:
        print(f"\n✅ Found {len(euro_matches)} potential price strings:")
        for match in euro_matches[:10]:  # Show first 10
            print(f"   {match.strip()}")

    # Check for JSON data
    print("\n📦 Checking for JSON data...")
    scripts = await page.query_selector_all('script[type="application/json"]')
    print(f"   Found {len(scripts)} JSON scripts")

    for i, script in enumerate(scripts[:3]):
        try:
            script_content = await script.inner_text()
            if '€' in script_content or 'price' in script_content.lower():
                print(f"\n   Script {i+1} (contains price info):")
                print(f"   {script_content[:200]}...")
        except:
            pass

    print("\n✅ Analysis complete! Check output above.")
    print("Press Enter to close browser...")
    input()

    await browser.close()
    await playwright.stop()

if __name__ == '__main__':
    asyncio.run(test_viva_page())
