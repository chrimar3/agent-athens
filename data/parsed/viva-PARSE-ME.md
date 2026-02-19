# Parsing Batch: VIVA

## Files to Process (8)
1. 2025-10-22-viva-www-viva-gr-tickets-theater-.html
2. 2025-10-22-viva-www-viva-gr-tickets-music-.html
3. 2025-10-26-viva-www-viva-gr-tickets-.html
4. 2025-10-22-viva-www-viva-gr-tickets-.html
5. 2025-10-26-viva-www-viva-gr-tickets-sports-.html
6. 2025-10-22-viva-www-viva-gr-tickets-sports-.html
7. 2025-10-26-viva-www-viva-gr-tickets-music-.html
8. 2025-10-26-viva-www-viva-gr-tickets-theater-.html

## Total Size: 10.36 MB

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
Save extracted events to: data/parsed/viva-events.json
