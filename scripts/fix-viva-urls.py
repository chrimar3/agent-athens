#!/usr/bin/env python3
"""
Fix viva.gr URLs by converting them to more.com equivalents
Since viva.gr redirects to more.com homepage, we need to update the URLs
"""

import sqlite3
import re

db_path = 'data/events.db'

print("🔧 Fixing viva.gr URLs")
print("="*70)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all viva.gr URLs
cursor.execute("""
    SELECT id, title, url, source
    FROM events
    WHERE url LIKE 'https://www.viva.gr%'
""")

viva_events = cursor.fetchall()

print(f"\n📊 Found {len(viva_events)} events with viva.gr URLs")

if not viva_events:
    print("✅ No viva.gr URLs to fix!")
    conn.close()
    exit(0)

# Strategy: Convert viva.gr URLs to more.com format
# https://www.viva.gr/gr-el/tickets/music/the-rasmus/
# ->
# https://www.more.com/gr-el/tickets/music/the-rasmus/

updated = 0
failed = 0

for event_id, title, url, source in viva_events:
    # Replace domain
    new_url = url.replace('https://www.viva.gr', 'https://www.more.com')

    try:
        cursor.execute("""
            UPDATE events
            SET url = ?, source = 'more.com'
            WHERE id = ?
        """, (new_url, event_id))

        updated += 1

        if updated <= 5:  # Show first 5
            print(f"\n✅ Updated:")
            print(f"   Title: {title[:50]}")
            print(f"   Old: {url}")
            print(f"   New: {new_url}")

    except Exception as e:
        print(f"\n❌ Failed to update {title[:50]}: {e}")
        failed += 1

conn.commit()
conn.close()

print("\n" + "="*70)
print(f"📊 Summary:")
print(f"   Total viva.gr URLs: {len(viva_events)}")
print(f"   ✅ Updated: {updated}")
print(f"   ❌ Failed: {failed}")
print("\n✅ URL fix complete!")
print("\nNow run: python3 scripts/fetch-prices.py")
print("="*70)
