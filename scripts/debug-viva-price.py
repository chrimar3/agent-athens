#!/usr/bin/env python3
"""
Debug script to test different approaches for fetching viva.gr prices
"""

import asyncio
import requests
from bs4 import BeautifulSoup
import re
import json

# Test URLs
test_urls = [
    "https://www.viva.gr/gr-el/tickets/music/the-rasmus/",
    "https://www.viva.gr/gr-el/tickets/music/giorgis-manolakis-1/",
]

print("="*70)
print("🔍 Testing viva.gr Price Fetching - Multiple Approaches")
print("="*70)

for i, url in enumerate(test_urls, 1):
    print(f"\n{'='*70}")
    print(f"Test {i}: {url}")
    print('='*70)

    # Approach 1: Simple requests (no JavaScript)
    print("\n📋 Approach 1: Simple HTTP GET (no JS)")
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7',
        }
        response = requests.get(url, headers=headers, timeout=10, allow_redirects=True)

        print(f"   Status: {response.status_code}")
        print(f"   Final URL: {response.url}")
        print(f"   Content Length: {len(response.text)} bytes")

        # Check if it redirects to more.com
        if 'more.com' in response.url:
            print("   ⚠️  Redirects to more.com!")

        # Search for prices in HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # Look for price in various places
        price_patterns = [
            (r'€\s*(\d+(?:[,.]\d+)?)', 'Euro symbol pattern'),
            (r'(\d+(?:[,.]\d+)?)\s*€', 'Number before euro'),
            (r'"price["\']?\s*:\s*["\']?(\d+(?:[,.]\d+)?)', 'JSON price field'),
        ]

        found_prices = set()
        for pattern, desc in price_patterns:
            matches = re.findall(pattern, response.text)
            if matches:
                found_prices.update(matches)
                print(f"   ✅ {desc}: {matches[:5]}")

        if found_prices:
            print(f"   💰 All found prices: {sorted(found_prices)}")
        else:
            print("   ❌ No prices found in HTML")

        # Check for specific selectors
        selectors_to_try = [
            ('button', 'class', 'buy'),
            ('button', 'class', 'ticket'),
            ('a', 'class', 'btn'),
            ('div', 'class', 'price'),
            ('span', 'class', 'money'),
        ]

        print("\n   🔍 Checking common selectors:")
        for tag, attr, value in selectors_to_try:
            elements = soup.find_all(tag, {attr: lambda x: x and value in str(x).lower()})
            if elements:
                print(f"   ✅ Found {len(elements)} {tag}[{attr}*={value}]")
                for el in elements[:2]:
                    print(f"      Text: {el.get_text(strip=True)[:50]}")

    except Exception as e:
        print(f"   ❌ Error: {str(e)[:100]}")

    # Approach 2: Check if it's an API endpoint
    print("\n📋 Approach 2: Check for API endpoints")
    try:
        # Try to find data-event-id or similar
        soup = BeautifulSoup(response.text, 'html.parser')

        # Look for data attributes
        elements_with_data = soup.find_all(attrs={'data-event-id': True})
        if elements_with_data:
            print(f"   ✅ Found {len(elements_with_data)} elements with data-event-id")
            for el in elements_with_data[:2]:
                print(f"      ID: {el.get('data-event-id')}")

        # Look for JSON-LD schema
        json_ld = soup.find_all('script', type='application/ld+json')
        if json_ld:
            print(f"   ✅ Found {len(json_ld)} JSON-LD scripts")
            for script in json_ld:
                try:
                    data = json.loads(script.string)
                    if 'offers' in data or 'price' in str(data).lower():
                        print(f"      💰 Contains price data: {json.dumps(data, indent=2)[:200]}")
                except:
                    pass

    except Exception as e:
        print(f"   ❌ Error: {str(e)[:100]}")

print("\n" + "="*70)
print("✅ Analysis Complete!")
print("="*70)
