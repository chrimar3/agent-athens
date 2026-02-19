#!/usr/bin/env python3
"""
AI-Assisted Time Extraction
============================

Uses Claude AI to extract event times from descriptions and titles
for events that failed HTML-based extraction.

This script uses the seo-content-writer agent to intelligently parse
Greek event descriptions and infer likely start times.

Usage:
  python3 scripts/extract-times-with-ai.py              # Extract all
  python3 scripts/extract-times-with-ai.py --limit 10   # Test with 10
  python3 scripts/extract-times-with-ai.py --dry-run    # Preview only
"""

import asyncio
import sqlite3
import sys
import re
from pathlib import Path
from typing import List, Tuple, Optional
import argparse
from datetime import datetime

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data/events.db"


class AITimeExtractor:
    """Extracts event times using AI agent"""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.stats = {
            "total": 0,
            "success": 0,
            "all_day": 0,
            "failed": 0
        }

    def validate_time(self, time_str: str) -> Optional[str]:
        """Validate time format (HH:MM) and return normalized version"""
        if not time_str:
            return None

        try:
            # Extract just the time part (HH:MM)
            match = re.search(r'(\d{1,2}):(\d{2})', time_str)
            if not match:
                return None

            hours = int(match.group(1))
            minutes = int(match.group(2))

            # Validate ranges
            if hours < 0 or hours > 23:
                return None
            if minutes < 0 or minutes > 59:
                return None

            # Return normalized format
            return f"{hours:02d}:{minutes:02d}"

        except (ValueError, IndexError):
            return None

    async def extract_time_with_ai(self, event: Tuple) -> Optional[str]:
        """Use AI to extract time from event data"""
        event_id, title, date, short_desc, full_desc, full_desc_gr, url = event

        # Build context for AI
        context = f"""Event Title: {title}

Date: {date}

URL: {url}"""

        if short_desc:
            context += f"\n\nShort Description:\n{short_desc}"

        if full_desc_gr:
            context += f"\n\nGreek Description:\n{full_desc_gr[:500]}"
        elif full_desc:
            context += f"\n\nEnglish Description:\n{full_desc[:500]}"

        # Prompt for AI
        prompt = f"""{context}

TASK: Extract the event start time from the information above.

INSTRUCTIONS:
1. Look for explicit time mentions in Greek or English (e.g., "ώρα έναρξης 20:30", "starts at 9pm", "21:00")
2. Common Greek patterns: "Ώρα:", "ώρες", "αναχώρηση", "έναρξη"
3. If this is an all-day event (workshop, exhibition, excursion with no specific time), respond with "ALL_DAY"
4. If no time information is found, respond with "NOT_FOUND"

RESPONSE FORMAT:
- Return ONLY the time in HH:MM format (24-hour, e.g., "20:30", "14:00")
- OR return "ALL_DAY" for all-day events
- OR return "NOT_FOUND" if genuinely no time information exists

Do NOT include explanations, just the time or status."""

        try:
            # Call AI agent (using subprocess to call tool_agent)
            import subprocess

            # Save prompt to temp file
            temp_prompt = PROJECT_ROOT / "temp_time_prompt.txt"
            temp_prompt.write_text(prompt)

            # Call seo-content-writer agent
            result = subprocess.run(
                ["claude", "agent", "call", "seo-content-writer", "--file", str(temp_prompt)],
                capture_output=True,
                text=True,
                timeout=30
            )

            # Clean up temp file
            temp_prompt.unlink()

            if result.returncode != 0:
                return None

            # Parse response
            response = result.stdout.strip()

            if "ALL_DAY" in response:
                return "ALL_DAY"
            elif "NOT_FOUND" in response:
                return None
            else:
                return self.validate_time(response)

        except Exception as e:
            print(f"   ❌ AI extraction failed: {e}")
            return None

    async def extract_and_update(self, events: List[Tuple]):
        """Extract times and update database"""
        self.stats["total"] = len(events)

        print(f"\n🤖 AI Time Extraction for {len(events)} events...\n")

        updates = []
        all_day_events = []

        for i, event in enumerate(events, 1):
            event_id, title, date, short_desc, full_desc, full_desc_gr, url = event

            print(f"[{i}/{len(events)}] {title[:60]}...")

            time_result = await self.extract_time_with_ai(event)

            if time_result == "ALL_DAY":
                print(f"   📅 All-day event detected")
                all_day_events.append(event_id)
                self.stats["all_day"] += 1
            elif time_result:
                # Convert to ISO timestamp
                date_part = date.split('T')[0]
                new_date = f"{date_part}T{time_result}:00+02:00"

                print(f"   ✅ Extracted time: {time_result} → {new_date}")
                updates.append((new_date, event_id))
                self.stats["success"] += 1
            else:
                print(f"   ⚠️  No time found")
                self.stats["failed"] += 1

            # Rate limiting (2 seconds between AI calls)
            if i < len(events):
                await asyncio.sleep(2)

        # Update database
        if not self.dry_run and (updates or all_day_events):
            print(f"\n💾 Updating database...")
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            # Update times
            for new_date, event_id in updates:
                cursor.execute(
                    "UPDATE events SET start_date = ?, updated_at = datetime('now') WHERE id = ?",
                    (new_date, event_id)
                )

            # Mark all-day events (add column if needed)
            try:
                cursor.execute("ALTER TABLE events ADD COLUMN all_day INTEGER DEFAULT 0")
            except sqlite3.OperationalError:
                pass  # Column already exists

            for event_id in all_day_events:
                cursor.execute(
                    "UPDATE events SET all_day = 1, updated_at = datetime('now') WHERE id = ?",
                    (event_id,)
                )

            conn.commit()
            conn.close()
            print(f"✅ Database updated!")
        elif self.dry_run:
            print(f"\n🔍 DRY RUN: Would update {len(updates)} times, mark {len(all_day_events)} as all-day")

    def print_summary(self):
        """Print final statistics"""
        print(f"\n{'='*60}")
        print(f"📊 AI Time Extraction Summary")
        print(f"{'='*60}")
        print(f"Total events:        {self.stats['total']}")
        print(f"✅ Times extracted:  {self.stats['success']}")
        print(f"📅 All-day events:   {self.stats['all_day']}")
        print(f"❌ Not found:        {self.stats['failed']}")
        print(f"{'='*60}")
        if self.stats['total'] > 0:
            success_rate = ((self.stats['success'] + self.stats['all_day']) / self.stats['total']) * 100
            print(f"📈 Success rate: {success_rate:.1f}%")
        print(f"{'='*60}")


def get_events_with_missing_times(limit: Optional[int] = None) -> List[Tuple]:
    """Query events with midnight timestamps from database"""

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    query = """
        SELECT
            id, title, start_date,
            short_description, full_description, full_description_gr,
            url
        FROM events
        WHERE date(start_date) >= date('now')
        AND start_date LIKE '%00:00:00%'
        ORDER BY start_date
    """

    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query)
    events = cursor.fetchall()

    conn.close()

    return events


async def main():
    parser = argparse.ArgumentParser(description="AI-assisted time extraction")
    parser.add_argument("--limit", type=int, help="Limit number of events (for testing)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating database")

    args = parser.parse_args()

    print(f"🔍 Finding events with missing times...")

    # Get events from database
    events = get_events_with_missing_times(limit=args.limit)

    if not events:
        print(f"✅ No events found with missing times!")
        sys.exit(0)

    print(f"📋 Found {len(events)} events with missing times")

    # Extract times with AI
    extractor = AITimeExtractor(dry_run=args.dry_run)

    await extractor.extract_and_update(events)
    extractor.print_summary()


if __name__ == "__main__":
    asyncio.run(main())
