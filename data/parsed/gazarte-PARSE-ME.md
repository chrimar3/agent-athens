# Parsing Batch: GAZARTE

## Files to Process (8)
1. 2025-10-26-gazarte-www-gazarte-gr-events.html
2. 2025-10-22-gazarte-www-gazarte-gr-concerts.html
3. 2025-10-22-gazarte-www-gazarte-gr-cinema.html
4. 2025-10-22-gazarte-www-gazarte-gr-events.html
5. 2025-10-26-gazarte-www-gazarte-gr-concerts.html
6. 2025-10-26-gazarte-www-gazarte-gr-exhibitions.html
7. 2025-10-26-gazarte-www-gazarte-gr-cinema.html
8. 2025-10-22-gazarte-www-gazarte-gr-exhibitions.html

## Total Size: 0.46 MB

## Instructions for Claude Code

For each HTML file above, extract ALL cultural events using this format:

```json
[
  {
    "title": "Event name",
    "date": "2025-10-28",
    "time": "21:00",
    "venue": "Venue name",
    "type": "concert|exhibition|cinema|theater|performance|workshop",
    "genre": "jazz|rock|theater|etc",
    "price_type": "free|paid",
    "url": "https://full-url-to-event",
    "description": "Brief description"
  }
]
```

### Rules:
- Only Athens events
- Date in YYYY-MM-DD format
- Time in HH:MM 24-hour format (or null)
- Skip events with missing critical fields (title, date, venue)
- Do NOT fabricate information

### Save Results:
Save extracted events to: data/parsed/gazarte-events.json
