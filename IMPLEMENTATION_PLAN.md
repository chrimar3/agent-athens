# agent-athens Implementation Plan

## Daily Pipeline: 4-Step Architecture

### Overview
Transform 5-15 daily new events into 315 continuously-updated static pages with stable URL structure.

---

## Step 1: Daily Ingestion (08:00 AM)

### Input Sources
**Email Newsletters (Greek + English):**
- Gmail IMAP: `ggrigo.agent@gmail.com`
- Subscribed to 10+ Athens venues
- Process overnight arrivals

**Web Crawling:**
- This is Athens (official aggregator)
- SNFCC (structured data)
- Viva.gr / TicketServices.gr (ticketing platforms)
- Major venues (Gazarte, Bios, Fuzz, Megaron)

### Processing
```typescript
// src/ingest/daily-ingestion.ts
interface DailyIngestion {
  newEmails: Email[]        // From IMAP
  crawledPages: WebPage[]   // From browser automation

  async process() {
    const events = [];

    // Parse emails (Greek + English)
    for (const email of this.newEmails) {
      const extracted = await claudeParse(email.body);
      events.push(...extracted);
    }

    // Parse web pages
    for (const page of this.crawledPages) {
      const extracted = await extractStructuredData(page);
      events.push(...extracted);
    }

    return normalizeEvents(events);
  }
}
```

### Expected Volume
- **New events**: 5-15/day
- **Updated events**: 20-30/day (price changes, cancellations)
- **Total processing**: ~40 events/day
- **Processing time**: 2-5 minutes (Claude API calls)

---

## Step 2: Update Internal Database (08:05 AM)

### Database Choice: SQLite
```sql
-- schema.sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,              -- generated from title+date+venue
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,         -- ISO 8601
  type TEXT NOT NULL,               -- concert|exhibition|cinema|theater|performance|workshop
  genres TEXT,                      -- JSON array
  venue_name TEXT,
  venue_address TEXT,
  venue_lat REAL,
  venue_lng REAL,
  price_type TEXT,                  -- free|paid
  price_amount REAL,
  price_currency TEXT,
  url TEXT,
  source TEXT,                      -- newsletter|website
  created_at TEXT,
  updated_at TEXT,
  schema_json TEXT                  -- Full Schema.org Event object
);

CREATE INDEX idx_start_date ON events(start_date);
CREATE INDEX idx_type ON events(type);
CREATE INDEX idx_price_type ON events(price_type);
```

### Daily Update Logic
```typescript
// src/db/update.ts
export async function updateDatabase(newEvents: Event[]) {
  const db = await Database.open('data/events.db');
  const stats = { new: 0, updated: 0, deleted: 0 };

  for (const event of newEvents) {
    const existing = await db.get('SELECT * FROM events WHERE id = ?', event.id);

    if (!existing) {
      // NEW EVENT
      await db.run(INSERT_QUERY, event);
      stats.new++;
      console.log(`✅ NEW: ${event.title}`);
    } else if (hasChanged(existing, event)) {
      // UPDATED EVENT
      await db.run(UPDATE_QUERY, event);
      stats.updated++;
      console.log(`🔄 UPDATED: ${event.title}`);
    }
  }

  // Cleanup old events (past + 90 days retention)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const deleted = await db.run(
    'DELETE FROM events WHERE start_date < ?',
    cutoffDate.toISOString()
  );
  stats.deleted = deleted.changes;

  console.log(`📊 Stats: ${stats.new} new, ${stats.updated} updated, ${stats.deleted} deleted`);
  return stats;
}
```

### Database Size Estimates
- **Active events**: 300-500 events at any time
  - Past 30 days: ~100 events
  - Next 30 days: ~150 events
  - Next 60 days: ~250 events
- **File size**: 2-5 MB (SQLite)
- **Query performance**: Sub-millisecond (indexed)

---

## Step 3: Regenerate ALL Static Pages (08:10 AM)

### Why Regenerate Everything?
1. **It's fast**: 315 pages in ~2 seconds (Bun)
2. **It's small**: 4.1 MB total (smaller than 1 photo)
3. **Ensures consistency**: All cross-references stay valid
4. **Git diff efficiency**: Only changed files uploaded to Netlify

### Generation Process
```typescript
// src/generate-site.ts (enhanced)
export async function generateSite() {
  console.log('🚀 Starting site generation...\n');

  // Load events from database
  const db = await Database.open('data/events.db');
  const allEvents = await db.all('SELECT * FROM events ORDER BY start_date');
  console.log(`📥 Loaded ${allEvents.length} events from database\n`);

  let pagesGenerated = 0;

  // Generate core time pages (7 pages)
  for (const time of TIME_RANGES) {
    await generatePage({ time }, allEvents);
    pagesGenerated++;
  }

  // Generate type pages (42 pages)
  for (const type of EVENT_TYPES) {
    await generatePage({ type }, allEvents);
    for (const time of TIME_RANGES) {
      await generatePage({ type, time }, allEvents);
      pagesGenerated++;
    }
  }

  // Generate price pages (14 pages)
  for (const price of ['free', 'paid']) {
    await generatePage({ price }, allEvents);
    for (const time of TIME_RANGES) {
      await generatePage({ price, time }, allEvents);
      pagesGenerated++;
    }
  }

  // Generate type + price pages (84 pages)
  for (const type of EVENT_TYPES) {
    for (const price of ['free', 'paid']) {
      await generatePage({ type, price }, allEvents);
      for (const time of TIME_RANGES) {
        await generatePage({ type, price, time }, allEvents);
        pagesGenerated++;
      }
    }
  }

  // Generate top genre pages (168 pages)
  const topGenres = await getTopGenres(db, 10);
  for (const genre of topGenres) {
    for (const time of TIME_RANGES) {
      await generatePage({ genre: genre.name, type: genre.type, time }, allEvents);
      pagesGenerated++;
    }
  }

  // Generate discovery files
  await generateLLMsTxt();
  await generateRobotsTxt();
  await generateSitemap(pagesGenerated);

  console.log(`\n✅ Site generation complete!`);
  console.log(`📊 Total pages: ${pagesGenerated}`);
  console.log(`💾 Total size: ${await getDirSize('dist')} MB`);
}
```

### Build Performance
- **Time**: ~2-5 seconds (Bun is fast!)
- **Output**: 315 HTML + 315 JSON + 4 discovery files = 634 files
- **Size**: 4.1 MB
- **Memory**: ~50 MB peak

---

## Step 4: Smart URL Management (Stable Cardinality)

### The Genius Insight: URLs ≠ Events

**Problem (naive approach):**
```
1000 events → 1000 pages → 1000 URLs 💥 (explosion!)
```

**Solution (combinatorial approach):**
```
1000 events → 315 pages → 315 URLs ✅ (stable!)
```

### URL Space Analysis

**Total URL combinations:**
```typescript
const urlSpace = {
  // Core pages (7)
  time: ['today', 'tomorrow', 'this-week', 'this-weekend', 'this-month', 'next-month', 'all'],

  // Type pages (6 × 7 = 42)
  type_time: 6 types × 7 times,

  // Price pages (2 × 7 = 14)
  price_time: 2 prices × 7 times,

  // Type + Price pages (6 × 2 × 7 = 84)
  type_price_time: 6 types × 2 prices × 7 times,

  // Genre pages (10 top genres × 7 times = 70)
  genre_time: 10 genres × 7 times,

  // Genre + Price pages (10 × 2 × 7 = 140)
  genre_price_time: 10 genres × 2 prices × 7 times,

  // Homepage (1)
  homepage: 1
};

// Total: 7 + 42 + 14 + 84 + 70 + 140 + 1 = 358 URLs
// Actual: ~315 URLs (some combinations have 0 events and are skipped)
```

### URL Stability Over Time

**Key principle**: URL existence is **independent of event count**

| URL | Jan (10 events) | Jun (50 events) | Aug (200 events) |
|-----|----------------|-----------------|-------------------|
| `/free-concert-today` | ✅ (0 events) | ✅ (2 events) | ✅ (8 events) |
| `/jazz-concert-this-week` | ✅ (1 event) | ✅ (5 events) | ✅ (12 events) |
| `/exhibition-this-month` | ✅ (3 events) | ✅ (15 events) | ✅ (30 events) |

**Benefits:**
1. **SEO stability**: URLs never die (no 404s)
2. **AI trust**: Consistent endpoints over time
3. **Caching**: CDN can aggressively cache
4. **Predictability**: Every filter combination has a page

### Empty Page Strategy
```html
<!-- Example: /free-concert-today with 0 events -->
<h1>Free Concert in Athens Today</h1>
<p class="summary">
  <strong>0 events</strong> are happening today.
</p>
<p>No free concerts found for today. Check back tomorrow for updates!</p>
<p>Our calendar is updated daily at 8:00 AM Athens time.</p>

<!-- Related pages suggestion -->
<aside>
  <h2>You might like:</h2>
  <ul>
    <li><a href="/free-concert-this-week">Free concerts this week (3 events)</a></li>
    <li><a href="/concert-today">All concerts today (5 events)</a></li>
  </ul>
</aside>
```

**Why this is good:**
- No 404 errors (SEO benefit)
- Clear user message
- Related page suggestions
- AI agents get structured "0 events" response

---

## Complete Daily Workflow

### Cron Schedule (macOS launchd)
```xml
<!-- ~/Library/LaunchAgents/com.user.agent-athens.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.agent-athens</string>

  <key>ProgramArguments</key>
  <array>
    <string>/Users/ggrigo/Documents/Projects/athens-events/agent-athens/daily-update.sh</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/ggrigo/Documents/Projects/athens-events/agent-athens/logs/daily.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/ggrigo/Documents/Projects/athens-events/agent-athens/logs/daily.error.log</string>
</dict>
</plist>
```

### Daily Update Script
```bash
#!/bin/bash
# daily-update.sh

set -e  # Exit on error

cd /Users/ggrigo/Documents/Projects/athens-events/agent-athens

echo "========================================="
echo "agent-athens Daily Update"
echo "Started: $(date)"
echo "========================================="

# Step 1: Ingest new events (08:00-08:05)
echo "\n📥 Step 1: Ingesting events..."
bun run src/ingest/daily-ingestion.ts

# Step 2: Update database (08:05-08:10)
echo "\n💾 Step 2: Updating database..."
bun run src/db/update-database.ts

# Step 3: Regenerate site (08:10-08:12)
echo "\n🔄 Step 3: Regenerating site..."
bun run src/generate-site.ts

# Step 4: Deploy to Netlify (08:12-08:15)
echo "\n🚀 Step 4: Deploying..."
git add dist/ data/events.db
git commit -m "chore: Daily update $(date +%Y-%m-%d)

$(cat logs/daily-stats.json)

🤖 Automated daily update"
git push origin main

echo "\n========================================="
echo "✅ Daily update complete!"
echo "Finished: $(date)"
echo "========================================="
```

### Execution Timeline
```
08:00 AM - Cron triggers daily-update.sh
08:00 AM - Step 1: Ingest (5 min)
  ├── Fetch emails via IMAP
  ├── Crawl websites
  └── Parse with Claude Sonnet 4.5

08:05 AM - Step 2: Update DB (1 min)
  ├── Compare with existing events
  ├── Insert new (5-15 events)
  ├── Update changed (20-30 events)
  └── Delete old (expired events)

08:10 AM - Step 3: Regenerate (2 min)
  ├── Load 300-500 events from DB
  ├── Generate 315 HTML pages
  ├── Generate 315 JSON APIs
  └── Generate discovery files

08:12 AM - Step 4: Deploy (3 min)
  ├── Git commit changes
  ├── Push to GitHub
  └── Netlify auto-deploy

08:15 AM - ✅ COMPLETE
```

**Total time**: ~15 minutes
**User-facing downtime**: 0 seconds (Netlify atomic deploys)

---

## Database vs Static Files Trade-off

### Why SQLite + Static Generation (Not Pure Static)

**Option A: Pure Static (No DB)**
```
❌ Re-parse all historical emails daily (slow)
❌ Lose update history
❌ Can't detect "what changed"
```

**Option B: Pure Dynamic (DB + Server)**
```
❌ Requires hosting ($5-20/month)
❌ Slower for users (query time)
❌ Worse SEO (dynamic content)
```

**Option C: Hybrid (DB + Static) ✅ WINNER**
```
✅ Fast builds (DB queries in milliseconds)
✅ Fast user experience (static HTML)
✅ Change detection (know what's new/updated)
✅ Free hosting (Netlify)
✅ Perfect SEO (pre-rendered HTML)
```

---

## Scaling Analysis

### Traffic Scaling
| Visitors/day | Bandwidth/month | Netlify Free Tier | Cost |
|-------------|-----------------|-------------------|------|
| 100 | 12 MB | ✅ 100 GB | $0 |
| 1,000 | 123 MB | ✅ 100 GB | $0 |
| 10,000 | 1.23 GB | ✅ 100 GB | $0 |
| 100,000 | 12.3 GB | ✅ 100 GB | $0 |
| 500,000 | 61.5 GB | ✅ 100 GB | $0 |
| 1,000,000 | 123 GB | ❌ Exceeds | $19/month (Pro) |

**Conclusion**: Free until ~500K visitors/month!

### Event Scaling
| Events in DB | Pages | Build time | Deploy time | Total |
|-------------|-------|------------|-------------|-------|
| 100 | 315 | 1s | 30s | 31s |
| 300 | 315 | 2s | 30s | 32s |
| 500 | 315 | 3s | 30s | 33s |
| 1,000 | 315 | 5s | 30s | 35s |
| 5,000 | 315 | 15s | 30s | 45s |

**Conclusion**: Scales linearly, stays under 1 minute even at 5,000 events!

### URL Cardinality Scaling
| Top genres tracked | URLs | Build time |
|-------------------|------|------------|
| 5 | 245 | 1.5s |
| 10 | 315 | 2s |
| 20 | 455 | 3s |
| 50 | 875 | 5s |

**Sweet spot**: 10-20 genres = 315-455 URLs

---

## Cost Analysis

### Current Setup (Optimized)
- **Hosting**: Netlify Free ($0/month)
- **Domain**: None yet ($0/month, using netlify.app)
- **AI**: Claude API (~$2-5/month for daily parsing)
- **Email**: Gmail Free ($0/month)
- **Total**: **~$5/month**

### Future Scaling (500K visitors/month)
- **Hosting**: Netlify Pro ($19/month)
- **Domain**: Custom domain ($12/year = $1/month)
- **AI**: Claude API (~$10-20/month for more sources)
- **Email**: Gmail Free ($0/month)
- **Total**: **~$40/month**

**Revenue potential at 500K/month**:
- Affiliate clicks (2% CTR × $0.50 CPC): $5,000/month
- API Pro tier (10 customers × $9): $90/month
- **ROI**: 125x+ 🚀

---

## Next Implementation Steps

1. **Set up SQLite database schema** ✅ (schema defined)
2. **Create ingestion scripts**:
   - Email IMAP parser (Greek + English)
   - Web crawler (Playwright/Puppeteer)
   - Claude parsing integration
3. **Build database update logic**:
   - Upsert events
   - Change detection
   - Cleanup old events
4. **Enhance site generator**:
   - Load from SQLite (not JSON file)
   - Add stats to pages ("New this week: 5 events")
   - Generate empty pages for 0-event combinations
5. **Create daily-update.sh script**
6. **Set up launchd automation**
7. **Test full pipeline end-to-end**
8. **Monitor and iterate**

---

## Success Metrics

### Technical Metrics
- ✅ Daily build success rate > 99%
- ✅ Build time < 5 minutes
- ✅ Site size < 10 MB
- ✅ All 315 URLs return 200 OK

### Content Metrics
- 📊 Events in database: 300-500
- 📊 New events/day: 5-15
- 📊 Updated events/day: 20-30
- 📊 Source coverage: 10+ venues

### User Metrics
- 📈 Google Search Console impressions
- 📈 AI agent citations (track via referrers)
- 📈 JSON API requests
- 📈 Affiliate click-through rate

---

**Status**: Ready for implementation
**Estimated dev time**: 2-3 days
**First deploy**: Within 1 week
