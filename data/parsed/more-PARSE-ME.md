# Parsing Batch: MORE

## Files to Process (17)
1. 2025-10-22-more-www-more-com-gr-el-tickets-.html
2. 2025-10-26-more-www-more-com-gr-el-tickets-.html
3. 2025-10-22-more-www-more-com-gr-el-tickets-sports-.html
4. 2025-10-22-more-www-more-com-gr-el-tickets-concerts-.html
5. 2025-10-26-more-www-more-com-gr-el-tickets-music-.html
6. 2025-10-22-more-www-more-com-en-us-tickets-.html
7. 2025-10-22-more-www-more-com-events.html
8. 2025-10-22-more-www-more-com-gr-el-tickets-theater-.html
9. 2025-10-22-more-www-more-gr.html
10. 2025-10-22-more-playwright.html
11. 2025-10-22-more-www-more-com.html
12. 2025-10-22-more-www-more-com-gr-el-tickets-music-.html
13. 2025-10-22-more-www-more-gr-tickets-.html
14. 2025-10-26-more-www-more-com-gr-el-tickets-theater-.html
15. 2025-10-22-more-www-more-com-en-us-tickets-music-.html
16. 2025-10-22-more-www-more-com-en-us-tickets-theater-.html
17. 2025-10-26-more-www-more-com-gr-el-tickets-sports-.html

## Total Size: 22.35 MB

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
Save extracted events to: data/parsed/more-events.json
