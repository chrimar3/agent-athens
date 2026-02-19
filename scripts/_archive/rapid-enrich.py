#!/usr/bin/env python3
"""
Rapid Event Enrichment - Prepare batches for parallel agent processing
Generates compact prompts for maximum throughput
"""
import sqlite3
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data/events.db"
ENRICHED_DIR = PROJECT_ROOT / "data/enriched"

def get_enriched_ids():
    enriched = set()
    for f in ENRICHED_DIR.glob("*-en.txt"):
        enriched.add(f.stem.replace("-en", ""))
    return enriched

def format_price(price_type, amount):
    if price_type == "free":
        return "free"
    elif amount:
        return f"€{int(amount)}"
    return "with ticket"

def extract_key_info(source_desc):
    """Extract just the essential parts"""
    # Get first 800 chars of description
    desc_part = source_desc.split("=== ΣΥΝΤΕΛΕΣΤΕΣ")[0][:800].strip()

    # Get cast section
    cast_part = ""
    if "=== ΣΥΝΤΕΛΕΣΤΕΣ" in source_desc:
        cast_part = source_desc.split("=== ΣΥΝΤΕΛΕΣΤΕΣ")[1][:600].strip()

    return desc_part, cast_part

def main():
    enriched_ids = get_enriched_ids()
    print(f"Already enriched: {len(enriched_ids)}/242")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, title, venue_name, type, price_type, price_amount, source_full_description
        FROM events
        WHERE source_full_description IS NOT NULL
          AND source_full_description != ''
          AND strftime('%Y-%m', start_date) = '2025-11'
        ORDER BY
            CASE WHEN source_full_description LIKE '%=== ΣΥΝΤΕΛΕΣΤΕΣ%' THEN 0 ELSE 1 END,
            start_date
    """)

    batch = []
    for row in cursor.fetchall():
        if row['id'] not in enriched_ids and len(batch) < 50:
            desc, cast = extract_key_info(row['source_full_description'])
            batch.append({
                'id': row['id'],
                'title': row['title'],
                'venue': row['venue_name'],
                'type': row['type'],
                'price': format_price(row['price_type'], row['price_amount']),
                'desc': desc,
                'cast': cast,
                'has_cast': bool(cast)
            })

    conn.close()

    # Save compact batch
    output = PROJECT_ROOT / "data/rapid-batch-50.json"
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(batch, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Prepared batch of {len(batch)} events")
    print(f"📁 Saved to: {output}")
    print(f"\n📊 Breakdown:")
    with_cast = sum(1 for e in batch if e['has_cast'])
    print(f"  - With cast: {with_cast}")
    print(f"  - Without cast: {len(batch) - with_cast}")
    print(f"\n🚀 Ready for parallel agent processing!")

    # Show first 5
    print(f"\nFirst 5 events:")
    for i, e in enumerate(batch[:5], 1):
        cast_mark = "✅" if e['has_cast'] else "❌"
        print(f"{i}. {e['id'][:16]}... | {e['title'][:35]}... | {cast_mark}")

if __name__ == "__main__":
    main()
