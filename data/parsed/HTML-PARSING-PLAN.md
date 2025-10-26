# HTML Parsing Strategy - Agent Athens
## Executive Summary

**Challenge**: 69 HTML files from 15 different Athens event websites need to be parsed to extract ~2,000+ cultural events into the database.

**Current Status**: 
- 69 HTML files stored in `data/html-to-parse/`
- Files organized by site (more.com, viva.gr, athinorama.gr, halfnote.gr, etc.)
- Total size: ~37 MB

**Recommended Approach**: **Python BeautifulSoup Batch Parser** (fastest, most reliable)

---

## Why Python BeautifulSoup?

1. **Speed**: Can process all 69 files in under 5 minutes
2. **Reliability**: Handles malformed HTML gracefully  
3. **Pattern Recognition**: Can extract structured data from HTML/JSON-LD
4. **Batch Processing**: No need for AI rate limiting
5. **Existing Code**: Project already has `parse_tier1_sites.py`

---

## Implementation Plan

### Step 1: Enhanced Python Parser

Create `scripts/parse-all-html-to-json.py`:

```python
#!/usr/bin/env python3
"""
Parse all HTML files and extract events to JSON
Handles multiple site patterns automatically
"""

import os
import json
import re
from bs4 import BeautifulSoup
from datetime import datetime
from pathlib import Path
import hashlib

HTML_DIR = "data/html-to-parse"
OUTPUT_DIR = "data/parsed"

def extract_json_ld(soup):
    """Extract JSON-LD event data from meta tags"""
    scripts = soup.find_all('script', type='application/ld+json')
    events = []
    for script in scripts:
        try:
            data = json.loads(script.string)
            if isinstance(data, list):
                events.extend([e for e in data if e.get('@type') == 'Event'])
            elif data.get('@type') == 'Event':
                events.append(data)
        except:
            pass
    return events

def extract_meta_events(soup):
    """Extract events from meta itemprop tags"""
    events = []
    # Find event containers
    containers = soup.find_all(['div', 'article', 'a'], class_=re.compile('event|item'))
    
    for container in containers:
        event = {}
        # Extract from meta tags
        for meta in container.find_all('meta', itemprop=True):
            prop = meta.get('itemprop')
            content = meta.get('content', '')
            event[prop] = content
        
        # Extract from text
        title_elem = container.find(['h2', 'h3', 'h4'], class_=re.compile('title|name'))
        if title_elem:
            event['title'] = title_elem.get_text(strip=True)
        
        if event.get('title') or event.get('name'):
            events.append(event)
    
    return events

def normalize_event(raw_event, source):
    """Convert raw extracted data to standard Event format"""
    title = raw_event.get('name') or raw_event.get('title', '')
    
    # Extract date
    start_date = raw_event.get('startDate', '')
    if not start_date:
        # Try parsing from text
        date_text = raw_event.get('date', '')
        # Add date parsing logic here
    
    # Extract venue
    venue = ''
    location = raw_event.get('location', {})
    if isinstance(location, dict):
        venue = location.get('name', '')
    elif isinstance(location, str):
        venue = location
    
    # Generate ID
    event_id = hashlib.sha256(
        f"{title.lower()}|{start_date}|{venue.lower()}".encode()
    ).hexdigest()[:16]
    
    return {
        "id": event_id,
        "title": title,
        "date": start_date.split('T')[0] if start_date else None,
        "time": start_date.split('T')[1][:5] if 'T' in start_date else None,
        "venue": venue,
        "type": guess_event_type(title, raw_event.get('description', '')),
        "genre": extract_genre(title),
        "price_type": "paid" if raw_event.get('offers') else "free",
        "url": raw_event.get('url', ''),
        "description": raw_event.get('description', ''),
        "source": source
    }

def guess_event_type(title, description):
    """Infer event type from title/description"""
    text = (title + ' ' + description).lower()
    
    if any(word in text for word in ['concert', 'συναυλία', 'music', 'μουσική', 'jazz', 'rock']):
        return 'concert'
    elif any(word in text for word in ['exhibition', 'έκθεση', 'gallery', 'art']):
        return 'exhibition'
    elif any(word in text for word in ['cinema', 'film', 'movie', 'ταινία']):
        return 'cinema'
    elif any(word in text for word in ['theater', 'theatre', 'θέατρο', 'play']):
        return 'theater'
    elif any(word in text for word in ['performance', 'dance', 'χορός']):
        return 'performance'
    elif any(word in text for word in ['workshop', 'εργαστήριο', 'class']):
        return 'workshop'
    else:
        return 'other'

def extract_genre(title):
    """Extract genre from title"""
    title_lower = title.lower()
    
    # Music genres
    genres = ['jazz', 'rock', 'pop', 'classical', 'electronic', 'hip-hop', 'folk']
    for genre in genres:
        if genre in title_lower:
            return genre
    
    return 'general'

def parse_html_file(filepath):
    """Parse single HTML file and extract events"""
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Try multiple extraction methods
    events = []
    
    # Method 1: JSON-LD
    events.extend(extract_json_ld(soup))
    
    # Method 2: Meta itemprop
    if not events:
        events.extend(extract_meta_events(soup))
    
    # Method 3: Site-specific patterns (add as needed)
    
    return events

def main():
    """Process all HTML files"""
    Path(OUTPUT_DIR).mkdir(exist_ok=True)
    
    all_events = []
    file_count = 0
    
    for filename in os.listdir(HTML_DIR):
        if not filename.endswith('.html'):
            continue
        
        filepath = os.path.join(HTML_DIR, filename)
        source = filename.replace('.html', '')
        
        print(f"Processing: {filename}")
        
        try:
            raw_events = parse_html_file(filepath)
            
            for raw in raw_events:
                event = normalize_event(raw, source)
                if event['title'] and event['date']:
                    all_events.append(event)
            
            file_count += 1
            print(f"  ✅ Extracted {len(raw_events)} events")
        
        except Exception as e:
            print(f"  ❌ Error: {e}")
    
    # Save to JSON
    output_file = os.path.join(OUTPUT_DIR, 'all-extracted-events.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_events, f, indent=2, ensure_ascii=False)
    
    print(f"\n📊 Summary:")
    print(f"  Files processed: {file_count}")
    print(f"  Events extracted: {len(all_events)}")
    print(f"  Output: {output_file}")

if __name__ == '__main__':
    main()
```

### Step 2: Import to Database

Use existing TypeScript importer:

```bash
bun run scripts/import-parsed-events.ts
```

### Step 3: Enrich with AI

```bash
bun run scripts/enrich-events.ts
```

---

## Alternative: Manual AI Parsing (Current Approach)

If you prefer to use Claude Code for parsing:

### Process by Priority

1. **High Priority** (most events):
   - `more` (17 files, 22 MB) - ticketing platform
   - `viva` (8 files, 10 MB) - ticketing platform
   - `athinorama` (12 files, 1.4 MB) - Athens events magazine

2. **Medium Priority** (venue-specific):
   - `gazarte` (8 files)
   - `halfnote` (4 files)
   - `clubber` (6 files)

3. **Low Priority** (minimal content):
   - `romantso`, `kyttaro`, `gagarin205`, `greek_festival`, `culture_athens`

### Per-Site Instructions

Available in: `data/parsed/{site}-PARSE-ME.md`

---

## Recommendation

**Go with Python BeautifulSoup approach**:
- Fastest execution (< 5 minutes)
- Most reliable for bulk processing
- Can handle all site patterns
- No AI rate limiting needed
- Parse first, enrich later

**Then use AI only for**:
- Generating 400-word descriptions
- Enriching incomplete data
- Adding semantic tags

---

## Quick Start

```bash
# Option A: Python Parser (RECOMMENDED)
pip install beautifulsoup4 lxml
python3 scripts/parse-all-html-to-json.py
bun run scripts/import-parsed-events.ts

# Option B: Manual AI Parsing
# Follow instructions in data/parsed/{site}-PARSE-ME.md
# Process each site batch manually with Claude Code

# Final Step (both options)
bun run scripts/enrich-events.ts
bun run build
```

---

Generated: $(date)
