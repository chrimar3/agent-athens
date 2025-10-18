# Event Enrichment Guide

## Overview
The enrichment script uses Claude Sonnet 4.5 to generate detailed 400-word descriptions for events, enhancing the basic scraped data with compelling cultural context and storytelling.

## Setup

### 1. Set API Key
```bash
export ANTHROPIC_API_KEY=your-key-here
```

Or add to your shell profile (~/.zshrc or ~/.bashrc):
```bash
echo 'export ANTHROPIC_API_KEY=your-key-here' >> ~/.zshrc
source ~/.zshrc
```

### 2. Run Enrichment
```bash
bun run scripts/enrich-events.ts
```

## How It Works

### Input
The script:
- Loads all events from the database
- Finds events without `fullDescription` (or with descriptions < 100 words)
- For each event, builds a detailed prompt with event metadata

### AI Generation
Each prompt instructs Claude to:
- Write exactly 400 words (±20 acceptable)
- Start with a compelling hook
- Provide cultural context (who is the artist/exhibition)
- Explain what makes the event special
- Include practical details naturally
- End with a call-to-action
- Use engaging, accessible English (not marketing fluff)
- Focus on cultural value and experience
- Mention Athens neighborhood connections when relevant
- Never fabricate facts

### Output
- Generates ~400-word description for each event
- Stores in `full_description` column in database
- Updates `updated_at` timestamp
- Rate-limited to 2 seconds between requests (avoid API limits)

## Database Schema

Events are stored with:
- `description`: Short 1-2 sentence summary (from scraping)
- `full_description`: AI-generated 400-word article (from enrichment)

## Daily Workflow

1. **Scraping** (scripts/scrape-events.ts)
   - Fetches new events from sources
   - Extracts basic metadata + short descriptions
   - Inserts into database

2. **Enrichment** (scripts/enrich-events.ts)
   - Finds events without full descriptions
   - Generates 400-word articles with Claude
   - Updates database

3. **Site Generation** (src/generate-site.ts)
   - Loads enriched events from database
   - Cleans up past events (older than 1 day)
   - Filters to only show today/future events
   - Generates all 336 static pages

## Event Lifecycle & Cleanup

### Automatic Date Handling
The site generator implements smart date filtering:

```typescript
// Filter to events happening today or later
const now = new Date();
const events = allEvents.filter(event => {
  const eventDate = new Date(event.startDate);
  return eventDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
});
```

This automatically handles:
- **Tomorrow becomes today**: No manual updates needed
- **Past events disappear**: Only current/future events are published
- **Database cleanup**: Events older than 1 day are deleted on each generation

### Example
- **Day 1 (Oct 18):**
  - "Today" shows events for Oct 18
  - "Tomorrow" shows events for Oct 19

- **Day 2 (Oct 19):**
  - "Today" shows events for Oct 19 (what was "tomorrow" yesterday)
  - "Tomorrow" shows events for Oct 20
  - Oct 18 events are deleted from database and don't appear anywhere

## Cost Estimation

- **API Cost**: ~$0.003 per event (using Claude Sonnet 4.5)
- **36 events**: ~$0.11
- **Daily updates (10 new events/day)**: ~$0.03/day = ~$1/month

## Error Handling

The script handles:
- Missing API key (exits with helpful message)
- Rate limiting (waits 30s if hit 429 error)
- Individual event failures (logs and continues)
- Progress tracking (shows count of enriched vs errors)

## Future Enhancements

1. **Semantic Tags**: Extract themes, moods, audiences from descriptions
2. **Greek Translation**: Generate bilingual descriptions
3. **Image Generation**: AI-generated event visuals
4. **Sentiment Analysis**: Tag events by vibe (intimate, energetic, contemplative)
5. **Cross-Event Recommendations**: "If you like X, you'll love Y"
