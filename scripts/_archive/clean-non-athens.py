#!/usr/bin/env python3
"""
Remove non-Athens events from database
"""

import sqlite3

db_path = 'data/events.db'

# Non-Athens city indicators (Greek cities)
NON_ATHENS_KEYWORDS = [
    'ΛΑΜΙΑ', 'ΤΡΙΚΑΛΑ', 'ΠΑΤΡΑ', 'ΘΕΣ/ΚΗ', 'ΘΕΣΣΑΛΟΝΙΚΗ',
    'ΗΡΑΚΛΕΙΟ', 'ΧΑΝΙΑ', 'ΡΕΘΥΜΝΟ', 'ΒΟΛΟΣ', 'ΙΩΑΝΝΙΝΑ',
    'ΚΑΒΑΛΑ', 'ΚΕΡΚΥΡΑ', 'ΡΟΔΟΣ', 'ΛΑΡΙΣΑ', 'ΣΕΡΡΕΣ'
]

print("🧹 Cleaning Non-Athens Events")
print("="*70)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Find events with city names in title or venue
conditions = []
for city in NON_ATHENS_KEYWORDS:
    conditions.append(f"title LIKE '%{city}%'")
    conditions.append(f"venue_name LIKE '%{city}%'")
    conditions.append(f"venue_address LIKE '%{city}%'")

where_clause = " OR ".join(conditions)

cursor.execute(f"""
    SELECT id, title, venue_name, venue_address
    FROM events
    WHERE {where_clause}
""")

non_athens_events = cursor.fetchall()

print(f"\n📊 Found {len(non_athens_events)} non-Athens events")

if not non_athens_events:
    print("✅ No non-Athens events found!")
    conn.close()
    exit(0)

# Show first 10
print("\n📋 Sample events to be removed:")
for event_id, title, venue, address in non_athens_events[:10]:
    print(f"\n  - {title[:60]}")
    print(f"    Venue: {venue}")
    if address:
        print(f"    Address: {address}")

# Delete them
cursor.execute(f"DELETE FROM events WHERE {where_clause}")

deleted = cursor.rowcount
conn.commit()
conn.close()

print("\n" + "="*70)
print(f"📊 Summary:")
print(f"   ✅ Deleted: {deleted} non-Athens events")
print("\n✅ Cleanup complete!")
print("="*70)
