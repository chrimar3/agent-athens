#!/usr/bin/env python3
"""
Parse Full Event Descriptions from Fetched HTML
================================================

Extracts rich, full-length descriptions from More.com event pages.

Problem solved: Database only has 146-char short descriptions.
               AI enrichment can't mention performers without source material.

Solution: Extract full ~1,600 char descriptions that include performer names.

Usage:
  python3 scripts/parse-full-descriptions.py              # Parse all
  python3 scripts/parse-full-descriptions.py --limit 5    # Test with 5
  python3 scripts/parse-full-descriptions.py --output data/full-descriptions.json

Output: JSON file with event_id -> full_description mapping
"""

import json
import argparse
from pathlib import Path
from typing import Dict, List
from bs4 import BeautifulSoup

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
HTML_DIR = PROJECT_ROOT / "data/event-pages"
DEFAULT_OUTPUT = PROJECT_ROOT / "data/full-descriptions.json"


class MoreHTMLParser:
    """Parse More.com event page HTML to extract full descriptions"""

    def __init__(self):
        self.stats = {
            "total": 0,
            "success": 0,
            "no_description": 0,
            "errors": 0
        }

    def parse_event_html(self, html_path: Path) -> Dict[str, any]:
        """
        Parse a single event HTML file.

        Returns dict with:
          - event_id: str
          - full_description: str (1,000-2,000 chars typically)
          - description_length: int
          - performer_names: List[str] (extracted from text)
        """
        event_id = html_path.stem  # Remove .html extension

        try:
            with open(html_path, 'r', encoding='utf-8') as f:
                html = f.read()

            soup = BeautifulSoup(html, 'html.parser')

            # Extract full description from main content
            desc_div = soup.select_one('#r_summaryText .r_descriptionText')

            # ALSO extract cast/crew section (CRITICAL for performer names!)
            cast_div = soup.select_one('.r_castText')

            if not desc_div and not cast_div:
                self.stats["no_description"] += 1
                return {
                    "event_id": event_id,
                    "full_description": None,
                    "description_length": 0,
                    "error": "Neither description nor cast div found"
                }

            # Get all paragraphs from description
            description_parts = []

            if desc_div:
                paragraphs = desc_div.find_all('p')
                desc_text = '\n\n'.join([
                    p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)
                ])
                if desc_text:
                    description_parts.append(desc_text)

            # Get cast/crew information
            if cast_div:
                cast_paragraphs = cast_div.find_all('p')
                cast_text = '\n\n'.join([
                    p.get_text(strip=True) for p in cast_paragraphs if p.get_text(strip=True)
                ])
                if cast_text:
                    # Add header to distinguish cast section
                    description_parts.append("\n\n=== ΣΥΝΤΕΛΕΣΤΕΣ / CAST & CREW ===\n" + cast_text)

            # Combine description + cast
            full_description = '\n\n'.join(description_parts)

            if not full_description:
                self.stats["no_description"] += 1
                return {
                    "event_id": event_id,
                    "full_description": None,
                    "description_length": 0,
                    "error": "Description empty after parsing"
                }

            # Also extract title (often contains performer names)
            title_tag = soup.select_one('h1')
            title = title_tag.get_text(strip=True) if title_tag else ""

            # Extract JSON-LD metadata if available
            json_ld = None
            json_ld_tag = soup.select_one('script[type="application/ld+json"]')
            if json_ld_tag:
                try:
                    json_ld = json.loads(json_ld_tag.string)
                except:
                    pass

            self.stats["success"] += 1

            return {
                "event_id": event_id,
                "full_description": full_description,
                "description_length": len(full_description),
                "title": title,
                "json_ld": json_ld,
                "has_metadata": json_ld is not None
            }

        except Exception as e:
            self.stats["errors"] += 1
            return {
                "event_id": event_id,
                "full_description": None,
                "description_length": 0,
                "error": str(e)
            }

    def parse_all(self, limit: int = None) -> List[Dict]:
        """Parse all HTML files in the event-pages directory"""

        html_files = sorted(HTML_DIR.glob("*.html"))

        if limit:
            html_files = html_files[:limit]

        self.stats["total"] = len(html_files)

        print(f"📄 Parsing {len(html_files)} HTML files...")
        print()

        results = []

        for i, html_file in enumerate(html_files, 1):
            if i % 50 == 0 or i == 1:
                print(f"[{i}/{len(html_files)}] Processing...")

            result = self.parse_event_html(html_file)
            results.append(result)

        return results

    def print_summary(self):
        """Print parsing statistics"""
        print(f"\n{'='*60}")
        print(f"📊 Parsing Summary")
        print(f"{'='*60}")
        print(f"Total files:       {self.stats['total']}")
        print(f"✅ Success:        {self.stats['success']}")
        print(f"⚠️  No description: {self.stats['no_description']}")
        print(f"❌ Errors:         {self.stats['errors']}")
        print(f"{'='*60}")

    def save_results(self, results: List[Dict], output_path: Path):
        """Save parsing results to JSON"""

        # Create simplified mapping for database import
        description_map = {}
        metadata_map = {}

        for result in results:
            event_id = result['event_id']

            if result.get('full_description'):
                description_map[event_id] = {
                    "full_description": result['full_description'],
                    "length": result['description_length'],
                    "title": result.get('title', '')
                }

                if result.get('json_ld'):
                    metadata_map[event_id] = result['json_ld']

        # Save both formats
        output_data = {
            "descriptions": description_map,
            "metadata": metadata_map,
            "stats": self.stats,
            "total_events": len(description_map)
        }

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)

        print(f"\n💾 Saved {len(description_map)} descriptions to {output_path}")

        # Also create a simple CSV for database import
        csv_path = output_path.with_suffix('.csv')
        with open(csv_path, 'w', encoding='utf-8') as f:
            f.write("event_id,full_description,description_length\n")
            for event_id, data in description_map.items():
                # Escape quotes for CSV
                desc = data['full_description'].replace('"', '""')
                f.write(f'"{event_id}","{desc}",{data["length"]}\n')

        print(f"💾 Saved CSV for import to {csv_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Parse full event descriptions from fetched HTML files"
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of files to parse (for testing)"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output JSON file path"
    )

    args = parser.parse_args()

    # Check if HTML directory exists
    if not HTML_DIR.exists():
        print(f"❌ HTML directory not found: {HTML_DIR}")
        print(f"   Run scripts/fetch-event-pages.py first")
        return 1

    html_count = len(list(HTML_DIR.glob("*.html")))
    if html_count == 0:
        print(f"❌ No HTML files found in {HTML_DIR}")
        print(f"   Run scripts/fetch-event-pages.py first")
        return 1

    print(f"✅ Found {html_count} HTML files")
    print()

    # Parse HTML files
    parser_obj = MoreHTMLParser()
    results = parser_obj.parse_all(limit=args.limit)

    # Print stats
    parser_obj.print_summary()

    # Save results
    parser_obj.save_results(results, args.output)

    # Sample output
    successful = [r for r in results if r.get('full_description')]
    if successful:
        print(f"\n📋 Sample extraction:")
        sample = successful[0]
        print(f"Event ID: {sample['event_id']}")
        print(f"Length: {sample['description_length']} chars")
        print(f"Preview: {sample['full_description'][:200]}...")

    return 0


if __name__ == "__main__":
    exit(main())
