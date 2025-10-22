#!/usr/bin/env python3
"""
Parse tier 1 ticketing sites HTML and extract events to JSON.
Handles: viva.gr, more.com, gazarte.gr
"""

import json
import re
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup
from typing import List, Dict, Optional

# Base directory
BASE_DIR = Path(__file__).parent.parent
HTML_DIR = BASE_DIR / "data" / "html-to-parse"
OUTPUT_DIR = BASE_DIR / "data" / "parsed"

# Create output directory if it doesn't exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Cutoff date - filter out past events
CUTOFF_DATE = datetime(2025, 10, 22)

def clean_text(text: str) -> str:
    """Clean and normalize text."""
    if not text:
        return ""
    return " ".join(text.strip().split())

def parse_date(date_str: str) -> Optional[str]:
    """Parse various date formats and return YYYY-MM-DD."""
    if not date_str:
        return None

    # Try various Greek date formats
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

def parse_viva_html(file_path: Path) -> List[Dict]:
    """Parse Viva.gr HTML files."""
    events = []

    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    # Viva uses article tags with class 'play-template'
    event_cards = soup.find_all('article', class_=re.compile(r'play-template', re.I))

    for card in event_cards:
        try:
            # Extract title from h2, h3, or h4 tag (more reliable)
            title_elem = card.find(['h2', 'h3', 'h4'])
            if title_elem:
                title = clean_text(title_elem.get_text())
            else:
                # Fallback: extract from card text
                card_text = clean_text(card.get_text())

                # Try to extract title after month name
                title_match = re.search(r'(?:Ιανουαριου|Φεβρουαριου|Μαρτιου|Απριλιου|Μαιου|Ιουνιου|Ιουλιου|Αυγουστου|Σεπτεμβριου|Οκτωβριου|Νοεμβριου|Δεκεμβριου|Ιαν|Φεβ|Μαρ|Απρ|Μαι|Ιουν|Ιουλ|Αυγ|Σεπ|Οκτ|Νοε|Δεκ)\s+(.+)', card_text)

                if title_match:
                    title_text = title_match.group(1).strip()
                    # Split and take first reasonable part
                    title_parts = title_text.split()
                    if len(title_parts) > 5:
                        title = ' '.join(title_parts[:5])
                    else:
                        title = title_text
                else:
                    continue

            if not title or len(title) < 3:
                continue

            # Get card text for description
            card_text = clean_text(card.get_text())

            # Extract URL
            url = None
            link = card.find('a', href=True)
            if link:
                url = link['href']
                if not url.startswith('http'):
                    url = f"https://www.viva.gr{url}"

            # Extract dates from class names
            # Classes include patterns like: newShowd20251113, musicd20251113
            classes = ' '.join(card.get('class', []))
            date_matches = re.findall(r'd(\d{8})', classes)

            # Get the first date (earliest)
            date = None
            if date_matches:
                try:
                    date_str = date_matches[0]
                    # Format: YYYYMMDD
                    year = int(date_str[:4])
                    month = int(date_str[4:6])
                    day = int(date_str[6:8])
                    date_obj = datetime(year, month, day)

                    if date_obj >= CUTOFF_DATE:
                        date = date_obj.strftime('%Y-%m-%d')
                except:
                    pass

            # Extract time - not usually available in list view
            time = None

            # Extract venue from the end of the text
            venue = ""
            venue_parts = card_text.split()
            if len(venue_parts) > 3:
                venue = ' '.join(venue_parts[-3:])

            # Determine category from file name and classes
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
                "time": time,
                "venue": venue or "TBA",
                "type": categorize_event_type(title, category, venue),
                "genre": category or "general",
                "price": "with-ticket",
                "url": url,
                "short_description": card_text[:200],
                "source_name": "viva.gr",
                "source_file": file_path.name
            }

            # Only add events with valid dates
            if date:
                events.append(event)

        except Exception as e:
            continue

    return events

def parse_more_html(file_path: Path) -> List[Dict]:
    """Parse More.com HTML files - same structure as Viva."""
    events = []

    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    # More.com uses the same article structure as Viva
    event_cards = soup.find_all('article', class_=re.compile(r'play-template', re.I))

    for card in event_cards:
        try:
            # Extract title from h2, h3, or h4
            title_elem = card.find(['h2', 'h3', 'h4'])
            if not title_elem:
                continue

            title = clean_text(title_elem.get_text())
            if not title or len(title) < 3:
                continue

            # Extract URL
            url = None
            link = card.find('a', href=True)
            if link:
                url = link['href']
                if not url.startswith('http'):
                    url = f"https://www.more.com{url}"

            # Extract dates from class names
            # Classes include patterns like: newShowd20251113, musicd20251113
            classes = ' '.join(card.get('class', []))
            date_matches = re.findall(r'd(\d{8})', classes)

            # Get the first date (earliest)
            date = None
            if date_matches:
                try:
                    date_str = date_matches[0]
                    # Format: YYYYMMDD
                    year = int(date_str[:4])
                    month = int(date_str[4:6])
                    day = int(date_str[6:8])
                    date_obj = datetime(year, month, day)

                    if date_obj >= CUTOFF_DATE:
                        date = date_obj.strftime('%Y-%m-%d')
                except:
                    pass

            # Extract time - not usually available in list view
            time = None

            # Extract venue and other details from text
            card_text = clean_text(card.get_text())
            venue = ""

            # Look for venue in structured elements
            venue_elem = card.find(class_=re.compile(r'venue|location', re.I))
            if venue_elem:
                venue = clean_text(venue_elem.get_text())

            # Determine category from file name and classes
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
                "time": time,
                "venue": venue or "TBA",
                "type": categorize_event_type(title, category, venue),
                "genre": category or "general",
                "price": "with-ticket",
                "url": url,
                "short_description": card_text[:200],
                "source_name": "more.com",
                "source_file": file_path.name
            }

            # Only add events with valid dates
            if date:
                events.append(event)

        except Exception as e:
            continue

    return events

def parse_gazarte_html(file_path: Path) -> List[Dict]:
    """Parse Gazarte.gr HTML files."""
    events = []

    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    # Find event cards
    event_cards = soup.find_all(['div', 'article', 'li'], class_=re.compile(r'(event|card|item)', re.I))

    for card in event_cards:
        try:
            # Extract title
            title_elem = card.find(['h1', 'h2', 'h3', 'h4', 'a'], class_=re.compile(r'(title|name)', re.I))
            if not title_elem:
                title_elem = card.find('a')

            if not title_elem:
                continue

            title = clean_text(title_elem.get_text())
            if not title or len(title) < 3:
                continue

            # Extract URL
            url = None
            link = card.find('a', href=True)
            if link:
                url = link['href']
                if not url.startswith('http'):
                    url = f"https://www.gazarte.gr{url}"

            # Extract date
            date_elem = card.find(['span', 'div', 'time'], class_=re.compile(r'(date|time)', re.I))
            date = parse_date(date_elem.get_text() if date_elem else "")

            # Extract time
            time_elem = card.find(['span', 'div'], class_=re.compile(r'(time|hour)', re.I))
            time = parse_time(time_elem.get_text() if time_elem else "")

            # Gazarte is the venue itself
            venue = "Gazarte"

            # Extract description
            desc_elem = card.find(['p', 'div'], class_=re.compile(r'(description|excerpt)', re.I))
            description = clean_text(desc_elem.get_text() if desc_elem else "")[:200]

            # Determine category from file name
            category = ""
            if "concerts" in file_path.name:
                category = "music"
            elif "cinema" in file_path.name:
                category = "cinema"
            elif "exhibitions" in file_path.name:
                category = "art"

            event_type = "concert" if "concerts" in file_path.name else \
                        "cinema" if "cinema" in file_path.name else \
                        "exhibition" if "exhibitions" in file_path.name else \
                        categorize_event_type(title, category, venue)

            event = {
                "title": title,
                "date": date,
                "time": time,
                "venue": venue,
                "type": event_type,
                "genre": category or "general",
                "price": "with-ticket",
                "url": url,
                "short_description": description,
                "source_name": "gazarte.gr",
                "source_file": file_path.name
            }

            # Only add events with valid dates
            if date:
                events.append(event)

        except Exception as e:
            continue

    return events

def main():
    """Main parsing function."""
    all_events = []

    # Files to parse
    files_to_parse = [
        # Viva.gr files
        "2025-10-22-viva-www-viva-gr-tickets-.html",
        "2025-10-22-viva-www-viva-gr-tickets-music-.html",
        "2025-10-22-viva-www-viva-gr-tickets-theater-.html",
        "2025-10-22-viva-www-viva-gr-tickets-sports-.html",
        # More.com files
        "2025-10-22-more-www-more-com-gr-el-tickets-.html",
        "2025-10-22-more-www-more-com-gr-el-tickets-music-.html",
        "2025-10-22-more-www-more-com-gr-el-tickets-theater-.html",
        "2025-10-22-more-www-more-com-gr-el-tickets-sports-.html",
        # Gazarte files
        "2025-10-22-gazarte-www-gazarte-gr-events.html",
        "2025-10-22-gazarte-www-gazarte-gr-cinema.html",
        "2025-10-22-gazarte-www-gazarte-gr-concerts.html",
        "2025-10-22-gazarte-www-gazarte-gr-exhibitions.html",
    ]

    for filename in files_to_parse:
        file_path = HTML_DIR / filename

        if not file_path.exists():
            print(f"Warning: {filename} not found")
            continue

        print(f"Parsing {filename}...")

        try:
            if "viva" in filename:
                events = parse_viva_html(file_path)
            elif "more" in filename:
                events = parse_more_html(file_path)
            elif "gazarte" in filename:
                events = parse_gazarte_html(file_path)
            else:
                continue

            print(f"  Found {len(events)} events")
            all_events.extend(events)

        except Exception as e:
            print(f"  Error parsing {filename}: {e}")
            continue

    # Remove duplicates based on title and date
    unique_events = []
    seen = set()

    for event in all_events:
        key = (event['title'].lower(), event['date'], event['venue'].lower())
        if key not in seen:
            seen.add(key)
            unique_events.append(event)

    # Sort by date
    unique_events.sort(key=lambda x: (x['date'] or '9999-99-99', x['time'] or '00:00'))

    # Save to JSON
    output_file = OUTPUT_DIR / "tier1-sites.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(unique_events, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Parsed {len(all_events)} total events")
    print(f"✓ Saved {len(unique_events)} unique events to {output_file}")
    print(f"\nBreakdown by source:")

    for source in ["viva.gr", "more.com", "gazarte.gr"]:
        count = len([e for e in unique_events if e['source_name'] == source])
        print(f"  {source}: {count} events")

if __name__ == "__main__":
    main()
