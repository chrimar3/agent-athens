#!/usr/bin/env python3
"""
Quick script to fetch and save viva.gr/more.com page for manual analysis
"""

import asyncio
from playwright.async_api import async_playwright

async def analyze_page():
    # Test both viva.gr and more.com URLs
    urls = [
        "https://www.viva.gr/gr-el/tickets/music/the-rasmus/",
        "https://www.more.com/gr-el/tickets/theater/thomas-zampras-andreas-paspatis-ksekiname-k-blepoume/"
    ]

    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(headless=True)
    context = await browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    )

    for i, url in enumerate(urls):
        print(f"\n{'='*70}")
        print(f"Analyzing URL {i+1}: {url}")
        print('='*70)

        page = await context.new_page()
        await page.goto(url, wait_until='networkidle', timeout=30000)
        await asyncio.sleep(2)  # Wait for JS

        # Save HTML
        html = await page.content()
        filename = f"data/price-page-{i+1}.html"
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"✅ Saved HTML to {filename}")

        # Try to find price elements
        print("\n🔍 Looking for price indicators...")

        # Check for buttons with price
        buttons = await page.query_selector_all('button, a[class*="button"], .btn')
        for btn in buttons[:10]:
            text = await btn.inner_text()
            if '€' in text or 'EUR' in text:
                print(f"   💰 Button: {text.strip()}")
                html = await btn.get_attribute('class')
                print(f"       Classes: {html}")

        # Check page text for prices
        text = await page.inner_text('body')
        import re
        prices = re.findall(r'€\s*\d+(?:[,.]\d+)?', text)
        if prices:
            print(f"\n   Found prices in page text: {set(prices)}")

        await page.close()

    await browser.close()
    await playwright.stop()

    print("\n✅ Analysis complete! Check data/price-page-*.html files")

if __name__ == '__main__':
    asyncio.run(analyze_page())
