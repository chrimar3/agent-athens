# Parsing Batch: ATHINORAMA

## Files to Process (12)
1. 2025-10-26-athinorama-www-athinorama-gr-theater-.html
2. 2025-10-26-athinorama-www-athinorama-gr-art-.html
3. 2025-10-22-athinorama-www-athinorama-gr-Going_out-.html
4. 2025-10-22-athinorama-www-athinorama-gr-clubbing-.html
5. 2025-10-26-athinorama-www-athinorama-gr-cinema-.html
6. 2025-10-22-athinorama-www-athinorama-gr-art-.html
7. 2025-10-26-athinorama-www-athinorama-gr-Going_out-.html
8. 2025-10-22-athinorama-www-athinorama-gr-music-.html
9. 2025-10-26-athinorama-www-athinorama-gr-music-.html
10. 2025-10-26-athinorama-www-athinorama-gr-clubbing-.html
11. 2025-10-22-athinorama-www-athinorama-gr-cinema-.html
12. 2025-10-22-athinorama-www-athinorama-gr-theater-.html

## Total Size: 1.44 MB

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
Save extracted events to: data/parsed/athinorama-events.json
