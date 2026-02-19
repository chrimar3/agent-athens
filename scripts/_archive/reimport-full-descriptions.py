#!/usr/bin/env python3
"""
Re-import Full Descriptions with Cast/Crew Data
================================================

Updates database source_full_description column with improved parser output
that includes cast/crew sections with performer names.

Critical fix: Original parser missed .r_castText sections.
New parser captures both description AND cast/crew data.

Usage:
  python3 scripts/reimport-full-descriptions.py
"""

import json
import sqlite3
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data/events.db"
JSON_PATH = PROJECT_ROOT / "data/full-descriptions.json"


def reimport_descriptions():
    """Update database with improved full descriptions"""

    # Load parsed descriptions
    print(f"📥 Loading descriptions from {JSON_PATH}")
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    descriptions = data['descriptions']
    print(f"✅ Loaded {len(descriptions)} descriptions")
    print()

    # Connect to database
    print(f"🔌 Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Stats
    stats = {
        "updated": 0,
        "not_found": 0,
        "errors": 0
    }

    # Update each event
    print(f"🔄 Updating source_full_description for {len(descriptions)} events...")
    print()

    for event_id, desc_data in descriptions.items():
        try:
            # Check if event exists
            cursor.execute("SELECT id FROM events WHERE id = ?", (event_id,))
            result = cursor.fetchone()

            if not result:
                stats["not_found"] += 1
                if stats["not_found"] <= 5:  # Show first 5
                    print(f"⚠️  Event not found in DB: {event_id}")
                continue

            # Update source_full_description
            full_desc = desc_data['full_description']
            cursor.execute("""
                UPDATE events
                SET source_full_description = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            """, (full_desc, event_id))

            stats["updated"] += 1

            # Progress indicator
            if stats["updated"] % 50 == 0:
                print(f"[{stats['updated']}/{len(descriptions)}] Updated...")

        except Exception as e:
            stats["errors"] += 1
            print(f"❌ Error updating {event_id}: {e}")

    # Commit changes
    conn.commit()
    conn.close()

    # Print summary
    print()
    print(f"{'='*60}")
    print(f"📊 Re-import Summary")
    print(f"{'='*60}")
    print(f"✅ Updated:        {stats['updated']}")
    print(f"⚠️  Not found:      {stats['not_found']}")
    print(f"❌ Errors:         {stats['errors']}")
    print(f"{'='*60}")
    print()

    # Show sample with cast/crew
    print("📋 Verifying cast/crew data in database...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, title, source_full_description
        FROM events
        WHERE id = '103c8d0b56746e95'
    """)

    result = cursor.fetchone()
    if result:
        event_id, title, full_desc = result
        print(f"\nSample Event: {event_id}")
        print(f"Title: {title}")
        print(f"Source description length: {len(full_desc)} chars")

        # Check for cast/crew section
        if "=== ΣΥΝΤΕΛΕΣΤΕΣ / CAST & CREW ===" in full_desc:
            print("✅ Cast/crew section present!")

            # Extract cast section
            cast_start = full_desc.find("=== ΣΥΝΤΕΛΕΣΤΕΣ / CAST & CREW ===")
            cast_section = full_desc[cast_start:cast_start+300]
            print(f"\nCast preview:\n{cast_section}")
        else:
            print("❌ Cast/crew section MISSING!")

    conn.close()

    return stats


if __name__ == "__main__":
    reimport_descriptions()
