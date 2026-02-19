#!/usr/bin/env python3
"""
Unified HTML Parser - All Event Sources
========================================

Parses HTML files from all event sources and outputs unified JSON.
Combines functionality from parse_tier1_sites.py and parse_athinorama.py.

Supported sources:
  - viva.gr (Schema.org markup)
  - more.com (Schema.org markup)
  - gazarte.gr (Card-based layout)
  - athinorama.gr (Music, theater, cinema guides)

Usage:
  python3 scripts/parse-all-html.py                  # Parse all sources
  python3 scripts/parse-all-html.py --source viva    # Parse only viva.gr
  python3 scripts/parse-all-html.py --source athinorama --category music
  python3 scripts/parse-all-html.py path/to/file.html  # Parse specific file
"""

import json
import re
import sys
import argparse
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
from collections import Counter

# Base directories
BASE_DIR = Path(__file__).parent.parent
HTML_DIR = BASE_DIR / "data" / "html-to-parse"
OUTPUT_DIR = BASE_DIR / "data" / "parsed"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Cutoff date - filter out past events
CUTOFF_DATE = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
TODAY = datetime.now().strftime("%Y-%m-%d")


# =============================================================================
# SHARED UTILITIES
# =============================================================================

def clean_text(text: str) -> str:
    """Clean and normalize text."""
    if not text:
        return ""
    return " ".join(text.strip().split())


def parse_date(date_str: str) -> Optional[str]:
    """Parse various date formats and return YYYY-MM-DD."""
    if not date_str:
        return None

    patterns = [
        (r'(\d{1,2})/(\d{1,2})/(\d{4})', '%d/%m/%Y'),
        (r'(\d{1,2})-(\d{1,2})-(\d{4})', '%d-%m-%Y'),
        (r'(\d{4})-(\d{1,2})-(\d{1,2})', '%Y-%m-%d'),
    ]

    for pattern, fmt in patterns:
        match = re.search(pattern, date_str)
        if match:
            try:
                date_obj = datetime.strptime(match.group(0), fmt)
                if date_obj >= CUTOFF_DATE:
                    return date_obj.strftime('%Y-%m-%d')
            except ValueError:
                continue

    return None


def parse_time(time_str: str) -> Optional[str]:
    """Extract time in HH:MM format."""
    if not time_str:
        return None

    match = re.search(r'(\d{1,2}):(\d{2})', time_str)
    if match:
        return f"{int(match.group(1)):02d}:{match.group(2)}"
    return None


def categorize_event_type(title: str, category: str, venue: str) -> str:
    """Determine event type based on content."""
    text = (title + " " + category + " " + venue).lower()

    if any(word in text for word in ['concert', 'συναυλία', 'μουσική', 'music', 'jazz', 'rock']):
        return 'concert'
    elif any(word in text for word in ['θέατρο', 'theater', 'theatre', 'παράσταση']):
        return 'theater'
    elif any(word in text for word in ['cinema', 'κινηματογράφος', 'ταινία', 'film']):
        return 'cinema'
    elif any(word in text for word in ['έκθεση', 'exhibition', 'gallery', 'art']):
        return 'exhibition'
    elif any(word in text for word in ['workshop', 'εργαστήριο', 'σεμινάριο']):
        return 'workshop'
    else:
        return 'performance'


# =============================================================================
# VIVA.GR PARSER
# =============================================================================

def parse_viva_html(file_path: Path) -> List[Dict]:
    """Parse Viva.gr HTML files."""
    events = []

    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    event_cards = soup.find_all('article', class_=re.compile(r'play-template', re.I))

    for card in event_cards:
        try:
            title_elem = card.find(['h2', 'h3', 'h4'])
            if title_elem:
                title = clean_text(title_elem.get_text())
            else:
                continue

            if not title or len(title) < 3:
                continue

            card_text = clean_text(card.get_text())

            # Extract URL
            url = None
            link = card.find('a', href=True)
            if link:
                url = link['href']
                if not url.startswith('http'):
                    url = f"https://www.viva.gr{url}"

            # Extract dates from class names (format: d20251113)
            classes = ' '.join(card.get('class', []))
            date_matches = re.findall(r'd(\d{8})', classes)

            date = None
            if date_matches:
                try:
                    date_str = date_matches[0]
                    year = int(date_str[:4])
                    month = int(date_str[4:6])
                    day = int(date_str[6:8])
                    date_obj = datetime(year, month, day)
                    if date_obj >= CUTOFF_DATE:
                        date = date_obj.strftime('%Y-%m-%d')
                except:
                    pass

            # Extract venue
            venue = ""
            venue_parts = card_text.split()
            if len(venue_parts) > 3:
                venue = ' '.join(venue_parts[-3:])

            # Determine category from file name
            category = ""
            if "music" in file_path.name or "music" in classes:
                category = "music"
            elif "theater" in file_path.name or "theater" in classes:
                category = "theater"
            elif "sports" in file_path.name or "sport" in classes:
                category = "sports"

            event = {
                "title": title,
                "date": date,
                "time": "20:00",
                "venue": venue or "TBA",
                "type": categorize_event_type(title, category, venue),
                "genre": category or "general",
                "price": "with-ticket",
                "url": url or "",
                "description": card_text[:200],
                "source": "viva.gr",
                "location": "Athens, Greece"
            }

            if date:
                events.append(event)

        except Exception:
            continue

    return events


# =============================================================================
# MORE.COM PARSER
# =============================================================================

def parse_more_html(file_path: Path) -> List[Dict]:
    """Parse More.com HTML files."""
    events = []

    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    event_cards = soup.find_all('article', class_=re.compile(r'play-template', re.I))

    for card in event_cards:
        try:
            title_elem = card.find(['h2', 'h3', 'h4'])
            if not title_elem:
                continue

            title = clean_text(title_elem.get_text())
            if not title or len(title) < 3:
                continue

            url = None
            link = card.find('a', href=True)
            if link:
                url = link['href']
                if not url.startswith('http'):
                    url = f"https://www.more.com{url}"

            classes = ' '.join(card.get('class', []))
            date_matches = re.findall(r'd(\d{8})', classes)

            date = None
            if date_matches:
                try:
                    date_str = date_matches[0]
                    year = int(date_str[:4])
                    month = int(date_str[4:6])
                    day = int(date_str[6:8])
                    date_obj = datetime(year, month, day)
                    if date_obj >= CUTOFF_DATE:
                        date = date_obj.strftime('%Y-%m-%d')
                except:
                    pass

            card_text = clean_text(card.get_text())
            venue = ""

            venue_elem = card.find(class_=re.compile(r'venue|location', re.I))
            if venue_elem:
                venue = clean_text(venue_elem.get_text())

            category = ""
            if "music" in file_path.name or "music" in classes:
                category = "music"
            elif "theater" in file_path.name or "theater" in classes:
                category = "theater"
            elif "sports" in file_path.name or "sport" in classes:
                category = "sports"

            event = {
                "title": title,
                "date": date,
                "time": "20:00",
                "venue": venue or "TBA",
                "type": categorize_event_type(title, category, venue),
                "genre": category or "general",
                "price": "with-ticket",
                "url": url or "",
                "description": card_text[:200],
                "source": "more.com",
                "location": "Athens, Greece"
            }

            if date:
                events.append(event)

        except Exception:
            continue

    return events


# =============================================================================
# GAZARTE.GR PARSER
# =============================================================================

def parse_gazarte_html(file_path: Path) -> List[Dict]:
    """Parse Gazarte.gr HTML files."""
    events = []

    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    event_cards = soup.find_all(['div', 'article', 'li'], class_=re.compile(r'(event|card|item)', re.I))

    for card in event_cards:
        try:
            title_elem = card.find(['h1', 'h2', 'h3', 'h4', 'a'], class_=re.compile(r'(title|name)', re.I))
            if not title_elem:
                title_elem = card.find('a')
            if not title_elem:
                continue

            title = clean_text(title_elem.get_text())
            if not title or len(title) < 3:
                continue

            url = None
            link = card.find('a', href=True)
            if link:
                url = link['href']
                if not url.startswith('http'):
                    url = f"https://www.gazarte.gr{url}"

            date_elem = card.find(['span', 'div', 'time'], class_=re.compile(r'(date|time)', re.I))
            date = parse_date(date_elem.get_text() if date_elem else "")

            time_elem = card.find(['span', 'div'], class_=re.compile(r'(time|hour)', re.I))
            time = parse_time(time_elem.get_text() if time_elem else "")

            venue = "Gazarte"

            desc_elem = card.find(['p', 'div'], class_=re.compile(r'(description|excerpt)', re.I))
            description = clean_text(desc_elem.get_text() if desc_elem else "")[:200]

            category = ""
            if "concerts" in file_path.name:
                category = "music"
            elif "cinema" in file_path.name:
                category = "cinema"

            event_type = "concert" if "concerts" in file_path.name else \
                         "cinema" if "cinema" in file_path.name else \
                         "exhibition" if "exhibitions" in file_path.name else \
                         categorize_event_type(title, category, venue)

            event = {
                "title": title,
                "date": date,
                "time": time or "20:00",
                "venue": venue,
                "type": event_type,
                "genre": category or "general",
                "price": "with-ticket",
                "url": url or "",
                "description": description,
                "source": "gazarte.gr",
                "location": "Athens, Greece"
            }

            if date:
                events.append(event)

        except Exception:
            continue

    return events


# =============================================================================
# ATHINORAMA.GR PARSERS
# =============================================================================

def parse_greek_date(date_str: str) -> Optional[str]:
    """Parse Greek date format like '08/12 Δευτ. 9 μ.μ.' to ISO date."""
    if not date_str:
        return None

    match = re.search(r'(\d{1,2})/(\d{1,2})', date_str)
    if not match:
        return None

    day = int(match.group(1))
    month = int(match.group(2))

    now = datetime.now()
    year = now.year
    if month < now.month or (month == now.month and day < now.day):
        year = now.year + 1

    try:
        return f"{year}-{month:02d}-{day:02d}"
    except:
        return None


def parse_greek_time(date_str: str) -> str:
    """Parse Greek time format like '9 μ.μ.' to HH:MM."""
    if not date_str:
        return "20:00"

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

    return "20:00"


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
    elif any(g in tags_text for g in ['electronic', 'ηλεκτρονική']):
        return "electronic"
    elif any(g in tags_text for g in ['λαϊκή', 'laiko', 'ρεμπέτικ']):
        return "greek-traditional"
    elif any(g in tags_text for g in ['κλασική', 'classical']):
        return "classical"
    elif any(g in tags_text for g in ['hip hop', 'rap']):
        return "hip-hop"

    # Theater genres
    elif any(g in tags_text for g in ['κωμωδία', 'comedy']):
        return "comedy"
    elif any(g in tags_text for g in ['δράμα', 'drama']):
        return "drama"
    elif any(g in tags_text for g in ['μιούζικαλ', 'musical']):
        return "musical"

    # Cinema genres
    elif any(g in tags_text for g in ['animation', 'κινούμενα']):
        return "animation"
    elif any(g in tags_text for g in ['ντοκιμαντέρ', 'documentary']):
        return "documentary"

    return "various"


def parse_athinorama_music(soup: BeautifulSoup) -> List[Dict]:
    """Parse music/concert events from Athinorama."""
    events = []
    items = soup.find_all('div', class_='item')

    for item in items:
        classes = item.get('class', [])
        if 'adv-banner' in classes or 'card-item' not in classes:
            continue

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

        venue_elem = item.find('h4')
        venue = ""
        if venue_elem:
            venue_link = venue_elem.find('a')
            if venue_link:
                venue = venue_link.get_text(strip=True)

        summary_elems = item.find_all('p', class_='summary')
        description = ""
        date_time_str = ""

        for summary in summary_elems:
            text = summary.get_text(strip=True)
            if re.search(r'\d{1,2}/\d{1,2}', text):
                date_time_str = text
            elif not description:
                description = text

        date = parse_greek_date(date_time_str)
        time = parse_greek_time(date_time_str)

        if not date:
            continue

        tags_elem = item.find('div', class_='tags')
        genre = extract_genre_from_tags(tags_elem)

        events.append({
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
        })

    return events


def parse_athinorama_theater(soup: BeautifulSoup) -> List[Dict]:
    """Parse theater events from Athinorama."""
    events = []
    items = soup.find_all('div', class_='item')

    for item in items:
        classes = item.get('class', [])
        if 'adv-banner' in classes or 'card-item' not in classes:
            continue

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

        venue_elem = item.find('h4')
        venue = ""
        if venue_elem:
            venue_link = venue_elem.find('a')
            if venue_link:
                venue = venue_link.get_text(strip=True)

        summary_elems = item.find_all('p', class_='summary')
        description = ""
        date_time_str = ""

        for summary in summary_elems:
            text = summary.get_text(strip=True)
            if re.search(r'\d{1,2}/\d{1,2}', text):
                date_time_str = text
            elif not description:
                description = text

        date = parse_greek_date(date_time_str)
        if not date:
            date = TODAY  # Theater shows are ongoing

        time = parse_greek_time(date_time_str) if date_time_str else "20:30"

        tags_elem = item.find('div', class_='tags')
        genre = extract_genre_from_tags(tags_elem)

        director_elem = item.find('div', class_='director')
        if director_elem:
            director = director_elem.get_text(strip=True)
            description = f"{director}. {description}" if description else director

        events.append({
            "title": title,
            "date": date,
            "time": time,
            "venue": venue,
            "type": "theater",
            "genre": genre,
            "price": "with-ticket",
            "url": url,
            "description": description[:500] if description else "",
            "source": "athinorama.gr",
            "location": "Athens, Greece"
        })

    return events


def parse_athinorama_cinema(soup: BeautifulSoup) -> List[Dict]:
    """Parse cinema events from Athinorama."""
    events = []
    items = soup.find_all('div', class_='item')

    for item in items:
        classes = item.get('class', [])
        if 'adv-banner' in classes or 'card-item' not in classes:
            continue

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

        original_title_elem = item.find('div', class_='original-title')
        original_title = ""
        if original_title_elem:
            original_title = original_title_elem.get_text(strip=True).rstrip(' /')

        summary_elem = item.find('p', class_='summary')
        description = summary_elem.get_text(strip=True) if summary_elem else ""

        tags_elem = item.find('div', class_='tags')
        genre = extract_genre_from_tags(tags_elem)

        if original_title and original_title != title:
            description = f"({original_title}) {description}"

        events.append({
            "title": title,
            "date": TODAY,
            "time": "various",
            "venue": "Various Cinemas",
            "type": "cinema",
            "genre": genre,
            "price": "with-ticket",
            "url": url,
            "description": description[:500] if description else "",
            "source": "athinorama.gr",
            "location": "Athens, Greece"
        })

    return events


def parse_athinorama_html(file_path: Path, category: str = None) -> List[Dict]:
    """Parse Athinorama HTML file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    # Auto-detect category from filename
    if not category:
        name_lower = file_path.name.lower()
        if 'music' in name_lower:
            category = 'music'
        elif 'theatre' in name_lower or 'theater' in name_lower:
            category = 'theater'
        elif 'cinema' in name_lower:
            category = 'cinema'
        else:
            category = 'music'

    if category == 'music':
        return parse_athinorama_music(soup)
    elif category == 'theater':
        return parse_athinorama_theater(soup)
    elif category == 'cinema':
        return parse_athinorama_cinema(soup)
    else:
        return parse_athinorama_music(soup)


# =============================================================================
# MAIN PARSING LOGIC
# =============================================================================

def get_latest_files(files: List[Path], source: str) -> List[Path]:
    """Get today's files or most recent batch."""
    today_files = [f for f in files if TODAY in f.name]
    if today_files:
        return today_files

    if files:
        first_date = files[0].name.split('-')[0:3]
        date_prefix = '-'.join(first_date)
        return [f for f in files if f.name.startswith(date_prefix)]

    return []


def main():
    parser = argparse.ArgumentParser(description='Parse HTML files from all event sources')
    parser.add_argument('file', nargs='?', help='Specific HTML file to parse')
    parser.add_argument('--source', '-s',
                        choices=['viva', 'more', 'gazarte', 'athinorama', 'all'],
                        default='all', help='Source to parse')
    parser.add_argument('--category', '-c',
                        choices=['music', 'theater', 'cinema'],
                        help='Category for Athinorama')
    parser.add_argument('--output', '-o', help='Output JSON file path')

    args = parser.parse_args()

    all_events = []

    # Single file mode
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"❌ File not found: {args.file}")
            sys.exit(1)

        print(f"📄 Parsing: {file_path.name}")
        name_lower = file_path.name.lower()

        if 'viva' in name_lower:
            events = parse_viva_html(file_path)
        elif 'more' in name_lower:
            events = parse_more_html(file_path)
        elif 'gazarte' in name_lower:
            events = parse_gazarte_html(file_path)
        elif 'athinorama' in name_lower:
            events = parse_athinorama_html(file_path, args.category)
        else:
            print(f"⚠️  Unknown source, trying generic parse...")
            events = parse_viva_html(file_path)  # Default to viva parser

        all_events.extend(events)
        print(f"   Found {len(events)} events")

    # Multi-source mode
    else:
        sources = [args.source] if args.source != 'all' else ['viva', 'more', 'gazarte', 'athinorama']

        for source in sources:
            print(f"\n📂 Processing {source}...")

            if source == 'viva':
                files = sorted(HTML_DIR.glob("*-viva-*.html"), reverse=True)
                files = get_latest_files(files, 'viva')
                for file_path in files:
                    print(f"   Parsing: {file_path.name}")
                    events = parse_viva_html(file_path)
                    print(f"   Found {len(events)} events")
                    all_events.extend(events)

            elif source == 'more':
                files = sorted(HTML_DIR.glob("*-more-*.html"), reverse=True)
                files = get_latest_files(files, 'more')
                for file_path in files:
                    print(f"   Parsing: {file_path.name}")
                    events = parse_more_html(file_path)
                    print(f"   Found {len(events)} events")
                    all_events.extend(events)

            elif source == 'gazarte':
                files = sorted(HTML_DIR.glob("*-gazarte-*.html"), reverse=True)
                files = get_latest_files(files, 'gazarte')
                for file_path in files:
                    print(f"   Parsing: {file_path.name}")
                    events = parse_gazarte_html(file_path)
                    print(f"   Found {len(events)} events")
                    all_events.extend(events)

            elif source == 'athinorama':
                categories = [args.category] if args.category else ['music', 'theater', 'cinema']
                patterns = {
                    'music': "*athinorama*music*guide*.html",
                    'theater': "*athinorama*theatre*guide*.html",
                    'cinema': "*athinorama*cinema*guide*.html"
                }
                for cat in categories:
                    files = sorted(HTML_DIR.glob(patterns[cat]), reverse=True)
                    if files:
                        file_path = files[0]  # Most recent
                        print(f"   Parsing {cat}: {file_path.name}")
                        events = parse_athinorama_html(file_path, cat)
                        print(f"   Found {len(events)} events")
                        all_events.extend(events)

    if not all_events:
        print("\n⚠️  No events found!")
        print(f"   Check for HTML files in: {HTML_DIR}")
        sys.exit(0)

    # Remove duplicates
    unique_events = []
    seen = set()
    for event in all_events:
        key = (event['title'].lower(), event['date'], event.get('venue', '').lower())
        if key not in seen:
            seen.add(key)
            unique_events.append(event)

    # Sort by date
    unique_events.sort(key=lambda x: (x['date'] or '9999-99-99', x['time'] or '00:00'))

    # Save to JSON
    output_file = args.output or str(OUTPUT_DIR / "all-events.json")
    Path(output_file).parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(unique_events, f, ensure_ascii=False, indent=2)

    # Print summary
    print(f"\n{'='*60}")
    print(f"📊 Parsing Summary")
    print(f"{'='*60}")
    print(f"Total parsed:  {len(all_events)}")
    print(f"Unique events: {len(unique_events)}")
    print(f"Saved to:      {output_file}")

    print(f"\n📌 By source:")
    source_counts = Counter(e['source'] for e in unique_events)
    for source, count in source_counts.most_common():
        print(f"   {source}: {count} events")

    print(f"\n📌 By type:")
    type_counts = Counter(e['type'] for e in unique_events)
    for event_type, count in type_counts.most_common():
        print(f"   {event_type}: {count} events")

    print(f"{'='*60}")


if __name__ == "__main__":
    main()
