#!/usr/bin/env python3
"""
Parser for Athinorama.gr event listings.
Extracts events from music, theater, and cinema guide pages.

Usage:
    python3 parse_athinorama.py                           # Parse all categories
    python3 parse_athinorama.py --category music          # Parse music only
    python3 parse_athinorama.py --category theater        # Parse theater only
    python3 parse_athinorama.py --category cinema         # Parse cinema only
    python3 parse_athinorama.py path/to/file.html         # Parse specific file
"""

import json
import re
import sys
import argparse
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from pathlib import Path
import subprocess

# Category configurations
# Note: Files are found dynamically by pattern matching
CATEGORIES = {
    "music": {
        "url": "https://www.athinorama.gr/music/guide",
        "file_pattern": "*athinorama*music*guide*.html",
        "event_type": "concert",
        "url_pattern": "/music/"
    },
    "theater": {
        "url": "https://www.athinorama.gr/theatre/guide",
        "file_pattern": "*athinorama*theatre*guide*.html",
        "event_type": "theater",
        "url_pattern": "/theatre/"
    },
    "cinema": {
        "url": "https://www.athinorama.gr/cinema/guide",
        "file_pattern": "*athinorama*cinema*guide*.html",
        "event_type": "cinema",
        "url_pattern": "/cinema/"
    }
}

# HTML directory
HTML_DIR = Path(__file__).parent.parent / "data" / "html-to-parse"

def download_page(url: str, output_path: str) -> bool:
    """Download a page using curl."""
    try:
        result = subprocess.run([
            "curl", "-s", "-A",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            url, "-o", output_path
        ], capture_output=True, text=True, timeout=30)
        return result.returncode == 0
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False

def parse_greek_date(date_str: str) -> str:
    """Parse Greek date format like '08/12 Δευτ. 9 μ.μ.' to ISO date."""
    if not date_str:
        return None

    # Extract day/month
    match = re.search(r'(\d{1,2})/(\d{1,2})', date_str)
    if not match:
        return None

    day = int(match.group(1))
    month = int(match.group(2))

    # Assume current year or next year if month < current month
    now = datetime.now()
    year = now.year
    if month < now.month or (month == now.month and day < now.day):
        year = now.year + 1

    try:
        return f"{year}-{month:02d}-{day:02d}"
    except:
        return None

def parse_greek_time(date_str: str) -> str:
    """Parse Greek time format like '9 μ.μ.' or '9.30 μ.μ.' to HH:MM."""
    if not date_str:
        return "20:00"

    # Look for time patterns
    # "9 μ.μ." = 21:00
    # "9.30 μ.μ." = 21:30
    # "11 π.μ." = 11:00

    pm_match = re.search(r'(\d{1,2})(?:\.(\d{2}))?\s*μ\.μ\.', date_str)
    am_match = re.search(r'(\d{1,2})(?:\.(\d{2}))?\s*π\.μ\.', date_str)

    if pm_match:
        hour = int(pm_match.group(1))
        minute = pm_match.group(2) or "00"
        if hour < 12:
            hour += 12
        return f"{hour:02d}:{minute}"
    elif am_match:
        hour = int(am_match.group(1))
        minute = am_match.group(2) or "00"
        return f"{hour:02d}:{minute}"

    return "20:00"  # Default evening time

def parse_end_date(text: str) -> str:
    """Parse end date like 'Εως: 17/12' or 'Έως: 17/12'."""
    match = re.search(r'[ΕΈ]ως:?\s*(\d{1,2})/(\d{1,2})', text)
    if match:
        day = int(match.group(1))
        month = int(match.group(2))
        now = datetime.now()
        year = now.year
        if month < now.month or (month == now.month and day < now.day):
            year = now.year + 1
        return f"{year}-{month:02d}-{day:02d}"
    return None

def extract_genre_from_tags(tags_elem) -> str:
    """Extract genre from tags element."""
    if not tags_elem:
        return "various"

    tags_text = tags_elem.get_text().lower()

    # Music genres
    if any(g in tags_text for g in ['rock', 'ροκ']):
        return "rock"
    elif any(g in tags_text for g in ['jazz', 'τζαζ']):
        return "jazz"
    elif any(g in tags_text for g in ['electronic', 'ηλεκτρονική', 'techno', 'house']):
        return "electronic"
    elif any(g in tags_text for g in ['λαϊκή', 'laiko', 'ρεμπέτικ', 'rebetiko']):
        return "greek-traditional"
    elif any(g in tags_text for g in ['κλασική', 'classical', 'όπερα', 'opera']):
        return "classical"
    elif any(g in tags_text for g in ['hip hop', 'rap']):
        return "hip-hop"
    elif any(g in tags_text for g in ['pop', 'ποπ']):
        return "pop"

    # Theater genres
    elif any(g in tags_text for g in ['κωμωδία', 'comedy']):
        return "comedy"
    elif any(g in tags_text for g in ['δράμα', 'drama']):
        return "drama"
    elif any(g in tags_text for g in ['μιούζικαλ', 'musical']):
        return "musical"
    elif any(g in tags_text for g in ['παιδικό', 'kids', 'παιδιά']):
        return "family"

    # Cinema genres
    elif any(g in tags_text for g in ['animation', 'κινούμενα']):
        return "animation"
    elif any(g in tags_text for g in ['θρίλερ', 'thriller']):
        return "thriller"
    elif any(g in tags_text for g in ['ντοκιμαντέρ', 'documentary']):
        return "documentary"
    elif any(g in tags_text for g in ['μουσική', 'music']):
        return "music-film"

    return "various"

def parse_music_events(soup: BeautifulSoup) -> list:
    """Parse music/concert events from Athinorama."""
    events = []
    items = soup.find_all('div', class_='item')

    for item in items:
        # Skip ad banners
        classes = item.get('class', [])
        if 'adv-banner' in classes:
            continue

        # Must be a card-item
        if 'card-item' not in classes:
            continue

        # Get title and URL
        title_elem = item.find('h2', class_='item-title')
        if not title_elem:
            continue

        title_link = title_elem.find('a')
        if not title_link:
            continue

        title = title_link.get_text(strip=True)
        url = title_link.get('href', '')
        if url and not url.startswith('http'):
            url = f"https://www.athinorama.gr{url}"

        # Get venue from h4
        venue_elem = item.find('h4')
        venue = ""
        if venue_elem:
            venue_link = venue_elem.find('a')
            if venue_link:
                venue = venue_link.get_text(strip=True)

        # Get description and date/time from summary elements
        summary_elems = item.find_all('p', class_='summary')
        description = ""
        date_time_str = ""

        for summary in summary_elems:
            text = summary.get_text(strip=True)
            # Check if this contains date info (day/month pattern or day name)
            if re.search(r'\d{1,2}/\d{1,2}', text):
                date_time_str = text
            elif not description:
                description = text

        # Parse date and time
        date = parse_greek_date(date_time_str)
        time = parse_greek_time(date_time_str)

        if not date:
            continue

        # Get genre from tags
        tags_elem = item.find('div', class_='tags')
        genre = extract_genre_from_tags(tags_elem)

        event = {
            "title": title,
            "date": date,
            "time": time,
            "venue": venue,
            "type": "concert",
            "genre": genre,
            "price": "with-ticket",
            "url": url,
            "description": description[:500] if description else "",
            "source": "athinorama.gr",
            "location": "Athens, Greece"
        }

        events.append(event)

    return events

def parse_theater_events(soup: BeautifulSoup) -> list:
    """Parse theater events from Athinorama."""
    events = []
    items = soup.find_all('div', class_='item')

    for item in items:
        # Skip ad banners and non-card items
        classes = item.get('class', [])
        if 'adv-banner' in classes:
            continue
        if 'card-item' not in classes:
            continue

        # Get title and URL
        title_elem = item.find('h2', class_='item-title')
        if not title_elem:
            continue

        title_link = title_elem.find('a')
        if not title_link:
            continue

        title = title_link.get_text(strip=True)
        url = title_link.get('href', '')
        if url and not url.startswith('http'):
            url = f"https://www.athinorama.gr{url}"

        # Get venue from h4
        venue_elem = item.find('h4')
        venue = ""
        if venue_elem:
            venue_link = venue_elem.find('a')
            if venue_link:
                venue = venue_link.get_text(strip=True)

        # Get description and dates from summary elements
        summary_elems = item.find_all('p', class_='summary')
        description = ""
        end_date = None
        date_time_str = ""

        for summary in summary_elems:
            text = summary.get_text(strip=True)
            # Check for end date "Εως: 17/12"
            if 'ως:' in text.lower() or 'ως' in text:
                end_date = parse_end_date(text)
                # Also check for start date in same line
                if re.search(r'\d{1,2}/\d{1,2}', text.replace(end_date or '', '')):
                    date_time_str = text
            elif re.search(r'\d{1,2}/\d{1,2}', text):
                date_time_str = text
            elif not description:
                description = text

        # Get director info
        director_elem = item.find('div', class_='director')
        director = ""
        if director_elem:
            director = director_elem.get_text(strip=True)

        # For theater, if no specific date, use today as start (ongoing shows)
        date = parse_greek_date(date_time_str)
        if not date:
            # Theater shows are typically ongoing - use today's date
            date = datetime.now().strftime("%Y-%m-%d")

        time = parse_greek_time(date_time_str) if date_time_str else "20:30"

        # Get genre from tags
        tags_elem = item.find('div', class_='tags')
        genre = extract_genre_from_tags(tags_elem)

        # Build description with director
        full_description = description
        if director:
            full_description = f"{director}. {description}" if description else director

        event = {
            "title": title,
            "date": date,
            "time": time,
            "venue": venue,
            "type": "theater",
            "genre": genre,
            "price": "with-ticket",
            "url": url,
            "description": full_description[:500] if full_description else "",
            "source": "athinorama.gr",
            "location": "Athens, Greece"
        }

        # Add end_date if available (for recurring shows)
        if end_date:
            event["end_date"] = end_date

        events.append(event)

    return events

def parse_cinema_events(soup: BeautifulSoup) -> list:
    """Parse cinema/film events from Athinorama."""
    events = []
    items = soup.find_all('div', class_='item')

    # Cinema items are "currently playing" - use today's date
    today = datetime.now().strftime("%Y-%m-%d")

    for item in items:
        # Skip ad banners and non-card items
        classes = item.get('class', [])
        if 'adv-banner' in classes:
            continue
        if 'card-item' not in classes:
            continue

        # Get title and URL
        title_elem = item.find('h2', class_='item-title')
        if not title_elem:
            continue

        title_link = title_elem.find('a')
        if not title_link:
            continue

        title = title_link.get_text(strip=True)
        url = title_link.get('href', '')
        if url and not url.startswith('http'):
            url = f"https://www.athinorama.gr{url}"

        # Get original title if available
        original_title_elem = item.find('div', class_='original-title')
        original_title = ""
        if original_title_elem:
            original_title = original_title_elem.get_text(strip=True).rstrip(' /')

        # Get description
        summary_elem = item.find('p', class_='summary')
        description = summary_elem.get_text(strip=True) if summary_elem else ""

        # Get genre from tags
        tags_elem = item.find('div', class_='tags')
        genre = extract_genre_from_tags(tags_elem)

        # Get duration from tags
        duration = ""
        if tags_elem:
            duration_match = re.search(r"Διάρκεια:\s*(\d+)'", tags_elem.get_text())
            if duration_match:
                duration = f"{duration_match.group(1)} min"

        # Build full description
        full_description = description
        if original_title and original_title != title:
            full_description = f"({original_title}) {description}"
        if duration:
            full_description = f"{full_description} [{duration}]"

        event = {
            "title": title,
            "date": today,  # Currently playing
            "time": "various",  # Multiple showtimes
            "venue": "Various Cinemas",  # Films play in multiple theaters
            "type": "cinema",
            "genre": genre,
            "price": "with-ticket",
            "url": url,
            "description": full_description[:500] if full_description else "",
            "source": "athinorama.gr",
            "location": "Athens, Greece"
        }

        events.append(event)

    return events

def parse_athinorama_html(html_path: str, category: str = None) -> list:
    """Parse Athinorama HTML file and extract events based on category."""

    with open(html_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    # Auto-detect category from filename or URL patterns in HTML
    if not category:
        html_path_lower = html_path.lower()
        if 'music' in html_path_lower:
            category = 'music'
        elif 'theatre' in html_path_lower or 'theater' in html_path_lower:
            category = 'theater'
        elif 'cinema' in html_path_lower:
            category = 'cinema'
        else:
            # Check page content
            page_text = soup.get_text().lower()
            if 'συναυλίες' in page_text or '/music/' in str(soup):
                category = 'music'
            elif 'θέατρο' in page_text or '/theatre/' in str(soup):
                category = 'theater'
            elif 'σινεμά' in page_text or '/cinema/' in str(soup):
                category = 'cinema'
            else:
                category = 'music'  # Default

    # Parse based on category
    if category == 'music':
        return parse_music_events(soup)
    elif category == 'theater':
        return parse_theater_events(soup)
    elif category == 'cinema':
        return parse_cinema_events(soup)
    else:
        return parse_music_events(soup)

def main():
    parser = argparse.ArgumentParser(description='Parse Athinorama.gr event listings')
    parser.add_argument('file', nargs='?', help='HTML file to parse')
    parser.add_argument('--category', '-c', choices=['music', 'theater', 'cinema', 'all'],
                        default='all', help='Category to parse')
    parser.add_argument('--download', '-d', action='store_true',
                        help='Download fresh HTML before parsing')
    parser.add_argument('--output', '-o', help='Output JSON file path')

    args = parser.parse_args()

    all_events = []

    # Single file mode
    if args.file:
        if not Path(args.file).exists():
            print(f"Error: File not found: {args.file}")
            sys.exit(1)

        print(f"Parsing: {args.file}")
        events = parse_athinorama_html(args.file)
        all_events.extend(events)
        print(f"Found {len(events)} events")

    # Category mode
    else:
        categories_to_parse = [args.category] if args.category != 'all' else ['music', 'theater', 'cinema']

        for cat in categories_to_parse:
            config = CATEGORIES[cat]

            # Find file dynamically by pattern
            pattern = config['file_pattern']
            matching_files = sorted(HTML_DIR.glob(pattern), reverse=True)

            if not matching_files and args.download:
                # Download if requested
                print(f"Downloading {cat} from {config['url']}...")
                html_file = HTML_DIR / f"athinorama-{cat}-guide.html"
                HTML_DIR.mkdir(parents=True, exist_ok=True)
                if download_page(config['url'], str(html_file)):
                    print(f"  Saved to: {html_file}")
                    matching_files = [html_file]
                else:
                    print(f"  Failed to download {cat}")
                    continue

            if matching_files:
                # Use most recent file
                html_file = matching_files[0]
                print(f"\nParsing {cat}: {html_file.name}")
                events = parse_athinorama_html(str(html_file), cat)
                all_events.extend(events)
                print(f"  Found {len(events)} {cat} events")
            else:
                print(f"  Skipping {cat} - no files matching '{pattern}' in {HTML_DIR}")

    # Save results
    if all_events:
        output_path = args.output or "data/parsed/athinorama-events.json"
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(all_events, f, ensure_ascii=False, indent=2)

        print(f"\n{'='*50}")
        print(f"Total: {len(all_events)} events")
        print(f"Saved to: {output_path}")

        # Show breakdown by type
        by_type = {}
        for event in all_events:
            t = event['type']
            by_type[t] = by_type.get(t, 0) + 1

        print("\nBreakdown by type:")
        for t, count in sorted(by_type.items()):
            print(f"  {t}: {count}")

        # Show sample
        print("\nSample events:")
        for event in all_events[:3]:
            print(f"  - [{event['type']}] {event['title']} @ {event['venue']} on {event['date']}")
    else:
        print("\nNo events found!")

if __name__ == "__main__":
    main()
