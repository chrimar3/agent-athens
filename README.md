# agent-athens

AI-curated cultural events calendar for Athens, Greece. Transforms daily event newsletters and events scraped from the internet into SEO/GEO-optimized static pages designed for AI answer engines (ChatGPT, Perplexity, Claude), future A2A assistants, and humans.

## Status

**Phase:** Live Prototype (Developer-Only)
**Current Milestone:** Available only to project developers
**Next Milestone:** Make available to search engines
**Future Milestone:** Release to small group of first users for feedback
**Mode:** Static Site (Netlify CDN)
**Pages:** Dynamic (currently ~315 pages based on active events)
**Location:** Athens, Greece (EET/UTC+2)
**Deployment:** Netlify (auto-deploy on git push)

## The Vision

Start with Athens. Prove the model. Expand to agent-barcelona, agent-berlin, agent-cities. Become the global cultural events platform for the AI era, monetized through affiliate revenue (tickets, hotels, restaurants) and agent referral networks where AI agents earn commission on bookings they drive.

## The Ask

In the reputation economy where AI trust = revenue, agent-athens is positioned to be the source that AI engines cite first. We're building the infrastructure for affiliate marketing in the post-LLM world.

---

## How It Works: Complete System Flow

### Phase 1: Event Collection (Daily, ~8:00 AM Athens)

**1A. Email Ingestion** (**PRIORITY - Need to work on this**):
1. Connect to Gmail via IMAP (`ggrigo.agent@gmail.com`)
2. Fetch overnight newsletter arrivals from inbox
3. Parse emails with `tool_agent`:
   - Extract event title, date, time, venue, type, genre
   - Identify price (open/with-ticket)
   - Extract venue address and URLs
4. Collect raw events in memory (unenriched)
5. **Archive processed emails** (remove from inbox → All Mail)
   - Even if 0 events extracted (confirmations, alerts, etc.)
   - Prevents reprocessing
   - Creates audit trail

**Good-to-have:** List of active newsletters for monitoring and documentation of event catchment scope

**1B. Web Scraping** (Current - Manual, needs to become standalone run when Agent SDK is called):
1. Load website crawl list (**MUST-HAVE - operational config**)
   - File: `config/scrape-list.json` (site name, URL, selectors, frequency)
   - Example sites: This is Athens, SNFCC, Gazarte, Bios, Six D.O.G.S, Fuzz Club
2. For each website in list:
   - Crawl website URL
   - Parse HTML/structured data with `tool_agent`
   - Extract events (title, date, venue, type, short description)
3. Collect raw events in memory (unenriched)
4. Track processed URLs (last crawled timestamp)

**Must-have:** Website crawl list configuration

**1C. Database Upsert** (Deduplication & Storage):
1. Normalize all collected events (from email + web) to Schema.org format
2. For each event:
   - Generate event ID (hash of `title+date+venue`)
   - Check if ID exists in database
   - **IF exists:** UPDATE (description, price, URL changes)
   - **IF new:** INSERT
3. Log results summary

**Output**:
```
📊 Database Upsert Results:
  ✅ X new events inserted
  🔄 Y events updated (price/description changes)
  ⏭️  Z duplicates skipped (already current)
```

**Total:** New raw events per day in database (dynamic number - realistically we don't expect hundreds of new events every day)

---

### Phase 2: Event Enrichment (Daily, ~8:05 AM)

**AI Description Generator** (`bun run scripts/enrich-events.ts`):

For each event without a full description:

1. **Build enrichment prompt**:
   - Include event metadata (title, type, venue, date, genre)
   - Request exactly 400 words (±20 acceptable)
   - Emphasize cultural context, artist background, what makes it special
   - Avoid marketing fluff, focus on authentic storytelling

2. **Call `tool_agent`** (need to work on scheduling a call to the Agent SDK to run the project like we manually do in Claude Code, which uses the internal `tool_agent`):
   - Generate compelling narrative description
   - Include practical details naturally (time, location, price)
   - Mention Athens neighborhood connections when relevant
   - Never fabricate facts

3. **Update database**:
   - Store in `full_description` column
   - Update `updated_at` timestamp
   - Word count validation (must be ~400 words)

4. **Rate limiting**:
   - 2-second pause between `tool_agent` calls
   - Handle 429 errors gracefully (wait 30s)
   - Log progress and errors

**Output**: All events have rich 400-word descriptions

**Cost**: **CRITICAL: FREE when using `tool_agent`!**

---

### Phase 3: Database Cleanup (Daily, ~8:10 AM)

**Automatic Event Lifecycle** (within `generate-site.ts`):

1. **Delete expired events**:
   - Remove events older than 1 day (past events)
   - Keep today/future events only
   - Maintains database size (~300-500 event categories typical)

2. **Smart date handling**:
   - "Today" automatically updates daily
   - "Tomorrow" becomes "today" (no manual updates)
   - Past events disappear automatically

**Output**: Clean database with only current/future events

---

### Phase 4: Static Site Generation (Daily, ~8:15 AM)

**Combinatorial Page Generator** (`bun run build`):

1. **Load events from database**:
   ```typescript
   const allEvents = getAllEvents();
   console.log(`📥 Loaded ${allEvents.length} events`);
   ```

2. **Generate combinatorial pages** (Type × Time × Price × Genre = dynamic number of pages, currently ~315):

   **Core time pages** (dynamic count):
   - `/today`, `/tomorrow`, `/this-week`, `/this-weekend`, `/this-month`, `/next-month`, `/all-events`
   - **TODO**: Consider if we also need pages with specific values, such as `/november-2025` (which currently appears as "next-month")

   **Type pages** (dynamic count: types × time ranges):
   - `/concert-today`, `/exhibition-this-week`, `/cinema-this-weekend`, etc.

   **Price pages** (dynamic count: price filters × time ranges):
   - `/open-today`, `/with-ticket-this-week`, etc.
   - **Note**: Using "open" and "with-ticket" terminology instead of "free/paid"

   **Type + Price pages** (dynamic count: types × prices × time ranges):
   - `/open-concert-today`, `/with-ticket-exhibition-this-week`, etc.

   **Genre pages** (dynamic count: genres × time ranges × prices):
   - `/jazz-concert-today`, `/open-jazz-concert-this-week`, etc.

3. **For each page**:
   - Filter events matching criteria (type, time, price, genre)
   - Generate HTML with Schema.org markup (Event CollectionPage)
   - Generate JSON API (same data, different format)
   - Handle empty pages gracefully ("0 events found, check back tomorrow")
   - Add cross-links to related pages

4. **Generate discovery files**:
   - `llms.txt` - AI agent discovery (what this site offers) - **TODO: Confirm if this is a good practice**
   - `robots.txt` - Search engine crawling rules
   - `sitemap.xml` - All URLs for search engines (dynamic count)

**Output**: HTML pages + JSON APIs + 3 discovery files (total size ~4.1 MB)

**Build time**: ~2-5 seconds (Bun is fast!)

---

### Phase 5: Deployment (Daily, ~8:20 AM)

**Git + Netlify Auto-Deploy**:

1. **Commit changes**:
   ```bash
   git add dist/ data/events.db
   git commit -m "chore: Daily update $(date +%Y-%m-%d)

   - X new events added
   - Y events enriched with AI descriptions
   - Z past events removed

   🤖 Automated daily update"
   git push origin main
   ```

2. **Netlify detects push**:
   - Triggers build (instant - just copies files)
   - Atomic deployment (zero downtime)
   - Global CDN distribution
   - SSL/HTTPS automatic

3. **Site goes live**:
   - https://agent-athens.netlify.app
   - All pages updated (dynamic count)
   - Fresh data visible to users and AI agents

**Deploy time**: ~30 seconds (Netlify build + CDN propagation)

**Total pipeline**: ~20 minutes (collection → enrichment → generation → deployment)

---

## Daily Timeline (Athens Time / ET)

**Note:** Designed for Athens (EET/EEST) but configurable for any timezone.

```
08:00 AM - Email ingestion + Web scraping (PRIORITY - need to develop now)
08:05 AM - AI enrichment (using tool_agent)
08:10 AM - Database cleanup
08:15 AM - Site generation (dynamic page count)
08:20 AM - Git commit + Netlify deploy
08:25 AM - ✅ Live site updated
```

**Current (Manual)**: Run `bun run build` whenever events are added/updated. Manual from the perspective of the human developer can mean asking Claude Code to run these tasks. Agent SDK will be able to run them as standalone when called through the SDK.

**Future (Automated)**: macOS launchd triggers full pipeline daily at 8 AM.

---

## Key Decision Points

1. **Do we have new events?** → Yes: Enrich with AI descriptions
2. **Are events enriched?** → No: Run `scripts/enrich-events.ts`
3. **Are there past events?** → Yes: Auto-cleanup on site generation
4. **Page has 0 events?** → Still generate (show "0 events found" message)
5. **Database has changes?** → Regenerate ALL pages (ensures consistency)
6. **Deployment ready?** → Git push → Netlify auto-deploys

---

## Human Setup Requirements

Before you start coding, you'll need to set up a few things manually. These are one-time setup tasks that enable you to own and operate the production infrastructure.

### 1. Set Up GitHub Repository (Required)

**Why:** You'll own the codebase and control deployments.

**Steps:**
1. **Fork or transfer** the repository to your GitHub account:
   - Option A: Fork: `https://github.com/ggrigo/agent-athens` → Click "Fork"
   - Option B: Transfer: Repo owner transfers ownership to you (Settings → Transfer)
2. Clone YOUR repository:
   ```bash
   git clone https://github.com/YOUR-USERNAME/agent-athens.git
   cd agent-athens
   ```
3. You now control the `main` branch and all deployments

### 2. Set Up Netlify for Production (Required)

**Why:** You'll own the production deployment and domain.

**Steps:**
1. Go to [netlify.com](https://netlify.com) and sign up (free tier is plenty)
2. Click "Add new site" → "Import an existing project"
3. Connect to your GitHub repository (`YOUR-USERNAME/agent-athens`)
4. Configure build settings:
   - **Build command:** `bun run build` (or leave empty - we commit `dist/`)
   - **Publish directory:** `dist`
   - **Branch:** `main`
5. Click "Deploy site"
6. Your production site is live at: `agent-athens.netlify.app` (or custom domain)

**Auto-Deploy Setup:**
- Netlify will auto-deploy every time you push to `main`
- Or use CLI: `netlify deploy --prod --dir=dist`

**Local CLI Setup:**
```bash
npm install -g netlify-cli
netlify login
netlify link  # Links to YOUR production site
```

### 3. Create a Newsletter Subscription Email (Future)

**Why:** To receive Athens event newsletters for testing email ingestion (Phase 1A - not yet implemented).

**Steps:**
1. Create a new Gmail account (e.g., `yourname.athens.events@gmail.com`)
2. Enable IMAP in Gmail:
   - Settings → Forwarding and POP/IMAP → Enable IMAP
3. Generate an App Password:
   - Google Account → Security → 2-Step Verification → App Passwords
   - Select "Mail" and generate a 16-character password
4. Subscribe to Athens event newsletters:
   - This is Athens: [thisisathens.org](https://thisisathens.org)
   - Lifo Guide: [lifo.gr/guide](https://lifo.gr/guide)
   - Venue newsletters: Six D.O.G.S, Gazarte, Bios, Fuzz Club, SNFCC
5. Save your credentials to `.env`:
   ```bash
   cp .env.example .env
   # Edit .env with your email and app password
   ```

**Note:** Email ingestion is not yet implemented. For now, the pipeline uses web scraping (no credentials needed).

### 4. Get Claude Code (Required for Interactive AI Tasks)

**Why:** HTML parsing and event enrichment use Claude Code tool_agent (free with your subscription).

**Steps:**
1. Install Claude Code CLI: Follow instructions at [claude.ai/code](https://claude.ai/code)
2. Authenticate: `claude login`
3. You're ready to use interactive AI features (HTML parsing, enrichment)

**What you'll use it for:**
- Parsing HTML event pages into structured JSON
- Generating 400-word event descriptions
- Database queries and transformations

---

## Quick Start

### 1. Prerequisites

```bash
# Install Bun (fast JavaScript runtime)
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

### 2. Setup Project

```bash
# Clone repository
git clone https://github.com/ggrigo/agent-athens.git
cd agent-athens

# Install dependencies
bun install
```

### 3. Initialize Database

```bash
# Create SQLite database with schema
bun run scripts/init-database.ts

# Import sample events (optional)
bun run scripts/import-scraped-events.ts
```

### 4. Enrich Events with AI

```bash
# Generate 400-word descriptions for all events
bun run scripts/enrich-events.ts

# Or enrich in batches (need to decide on tool_agent capacity)
bun run scripts/enrich-5-events.ts
```

### 5. Generate Static Site

```bash
# Build all pages (dynamic count)
bun run build

# Output: dist/ directory with HTML + JSON files
```

### 6. Deploy to Netlify

```bash
# First time: Connect to Netlify
netlify login
netlify init

# Deploy (or just git push if auto-deploy is configured)
bun run deploy
# Or manually: netlify deploy --prod --dir=dist
```

---

## Project Structure

**Note:** The following is offered as an example architecture.

```
agent-athens/
├── src/                        # Source code
│   ├── generate-site.ts        # Main site generator (combinatorial logic)
│   ├── types.ts                # TypeScript types (Event, Filters, etc.)
│   ├── db/                     # Database layer
│   │   └── database.ts         # SQLite queries (insert, update, get events)
│   ├── templates/              # HTML generation
│   │   └── page.ts             # Page renderer (Schema.org markup)
│   └── utils/                  # Utilities
│       ├── normalize.ts        # Event normalization (Schema.org format)
│       ├── filters.ts          # Event filtering (type, time, price, genre)
│       └── urls.ts             # URL building (/open-jazz-concert-today)
├── scripts/                    # Standalone scripts
│   ├── init-database.ts        # Database initialization
│   ├── scrape-events.ts        # Web scraping
│   ├── import-scraped-events.ts # Import JSON events to DB
│   ├── enrich-events.ts        # AI description generation (all events)
│   └── enrich-5-events.ts      # AI enrichment (batched)
├── data/                       # Data files (gitignored except .sql)
│   ├── events.db               # SQLite database (gitignored)
│   ├── events.sql              # Database schema
│   ├── scraped-events.json     # Raw scraped events (gitignored)
│   └── unenriched-events.json  # Events pending enrichment (gitignored)
├── dist/                       # Generated static site (gitignored locally, committed for Netlify)
│   ├── *.html                  # HTML pages (dynamic count)
│   ├── api/*.json              # JSON API endpoints (dynamic count)
│   ├── llms.txt                # AI agent discovery
│   ├── robots.txt              # Search engine rules
│   └── sitemap.xml             # Search engine sitemap
├── logs/                       # Runtime logs (gitignored)
├── netlify.toml                # Netlify configuration
├── package.json                # Bun dependencies
├── tsconfig.json               # TypeScript configuration
├── .gitignore                  # Git exclusions
├── README.md                   # This file
├── PROJECT_DESCRIPTION.md      # Full technical overview
├── ELEVATOR_PITCH.md           # 30-second + 2-minute pitches
├── IMPLEMENTATION_PLAN.md      # 4-step daily pipeline architecture
├── ENRICHMENT_README.md        # AI enrichment guide
└── COMBINATORIAL_SEO_STRATEGY.md # SEO/GEO strategy documentation
```

---

## Configuration

**Note:** The following values are offered as examples.

### Portfolio Settings (Content Strategy)

- **Input:** Curated events daily (dynamic count)
- **Output:** Unique pages (dynamic count, currently ~315)
- **Multiplier:** Dynamic coverage based on event diversity
- **Update Frequency:** Daily (8:00 AM Athens time)

### Page Generation Rules

**Note:** These are example values. We need to define the multi-dimensional cube and its accepted values.

- **Event Types:** 6 (concert, exhibition, cinema, theater, performance, workshop)
- **Time Ranges:** 7 (today, tomorrow, this-week, this-weekend, this-month, next-month, all-events)
- **Price Filters:** 2 (open, with-ticket)
- **Genres:** Top genres per type (dynamic, based on actual events)

### URL Structure

**Pattern:** `/{price}-{genre}-{type}-{time}`

**Note:** Using "open" and "with-ticket" terminology ✅

**Examples:**
- `/open-jazz-concert-today`
- `/contemporary-art-exhibition-this-week`
- `/with-ticket-electronic-concert-this-weekend`
- `/cinema-this-month`
- `/open-today`

### Database Management

- **Active Events:** 300-500 event categories at any time (rolling window)
- **Cleanup Policy:** Events older than 1 day auto-deleted
- **Retention:** 90 days historical (future enhancement)
- **File Size:** 2-5 MB (SQLite)

### AI Enrichment

- **Model:** Anthropic Agent SDK (`tool_agent`)
- **Word Count:** 400 words (±20 acceptable)
- **Rate Limit:** 2 seconds between requests
- **Cost:** **FREE (using `tool_agent`)**

---

## Data Sources

**Current:**
- **Manual Scraping:** This is Athens, SNFCC, Gazarte, Bios, Six D.O.G.S, Fuzz Club
  - **Need:** List of websites to crawl
- **SQLite Database:** Persistent event storage

**In Development:**
- **Gmail IMAP:** Automated newsletter ingestion (`ggrigo.agent@gmail.com`)
  - **Need:** List of active newsletters for monitoring and documentation of event catchment scope

---

## SEO/GEO Strategy

**Note:** We have done minimal analysis. The below are offered as a direction that must be confirmed, and in time will be updated and modified as we learn more about the best practices of SEO/GEO.

### For AI Answer Engines (GEO = Generative Engine Optimization)

**Discovery:**
- `llms.txt` - Tells AI agents what this site offers (**TODO: Confirm if this is a good practice**)
- Schema.org markup - Machine-readable event data (Event + CollectionPage)
- Freshness signals - Explicit "Last updated: Oct 19, 2025" timestamps

**Trust Signals:**
- Daily updates (freshness = AI trust)
- Structured data (easy to parse)
- Single source (no conflicting data)
- Specific pages (exact intent matching)

**Citation Format Example:**
```
User: "What open concerts are in Athens this weekend?"

AI Agent Response:
"According to agent-athens (updated today), there are 3 open concerts
this weekend:
1. Jazz Night at Six D.O.G.S (Friday, Oct 20)
2. Electronic Showcase at Bios (Saturday, Oct 21)
3. Indie Band at Fuzz Club (Sunday, Oct 22)

Source: https://agent-athens.netlify.app/open-concert-this-weekend"
```

### For Humans (SEO)

- Keyword-rich URLs (`/open-jazz-concert-today`)
- Semantic HTML with proper headings
- Mobile-responsive design
- Fast loading (static HTML, global CDN)
- Internal linking (related pages)

---

## Safety Features

- **Content Validation:** Word count checks on AI descriptions (~400 words)
- **Date Handling:** Automatic cleanup of past events (no stale data)
- **Error Handling:** Rate limit detection, retry logic, progress logging
- **Empty Pages:** Graceful handling (show "0 events found" message)
- **URL Stability:** All URLs always exist (even with 0 events)

---

## Manual Override

### Pause System

Edit `src/generate-site.ts`:
```typescript
// Skip site generation
if (process.env.PAUSE_GENERATION === 'true') {
  console.log('⏸️  Generation paused via PAUSE_GENERATION flag');
  process.exit(0);
}
```

### Force Rebuild

```bash
# Delete dist/ and regenerate everything
rm -rf dist/
bun run build
```

### Emergency Rollback

```bash
# Revert to previous Netlify deployment
netlify rollback
```

---

## Logs

Runtime logs in `logs/`:
- `scrape-YYYY-MM-DD.log` - Web scraping
- `enrich-YYYY-MM-DD.log` - AI enrichment
- `build-YYYY-MM-DD.log` - Site generation
- `deploy-YYYY-MM-DD.log` - Netlify deployment

---

## Testing

```bash
# Test database initialization
bun run scripts/init-database.ts

# Test event import
bun run scripts/import-scraped-events.ts

# Test AI enrichment (batched - need to decide on tool_agent capacity)
bun run scripts/enrich-5-events.ts

# Test site generation
bun run build

# Check output
ls -lh dist/*.html | head -10

# Test deployment (dry run)
netlify deploy --dir=dist
# Then check deploy preview URL
```

---

## Automation (Future - Mac Mini)

### macOS launchd Configuration

Create `~/Library/LaunchAgents/com.user.agent-athens.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.agent-athens</string>

  <key>ProgramArguments</key>
  <array>
    <string>/Users/georgios/Documents/Projects/athens-events/agent-athens/daily-update.sh</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/georgios/Documents/Projects/athens-events/agent-athens/logs/daily.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/georgios/Documents/Projects/athens-events/agent-athens/logs/daily.error.log</string>
</dict>
</plist>
```

### Daily Update Script

Create `daily-update.sh`:

```bash
#!/bin/bash
set -e

cd /Users/georgios/Documents/Projects/athens-events/agent-athens

echo "========================================"
echo "agent-athens Daily Update"
echo "Started: $(date)"
echo "========================================"

# Step 1: Ingest events (PRIORITY - need to develop now)
# echo "\n📥 Step 1: Ingesting events..."
# bun run src/ingest/daily-ingestion.ts

# Step 2: Enrich events with AI (using tool_agent)
echo "\n🤖 Step 2: Enriching events..."
bun run scripts/enrich-events.ts

# Step 3: Generate site
echo "\n🔄 Step 3: Generating site..."
bun run build

# Step 4: Deploy to Netlify
echo "\n🚀 Step 4: Deploying..."
git add dist/ data/events.db
git commit -m "chore: Daily update $(date +%Y-%m-%d)

🤖 Automated daily update"
git push origin main

echo "\n========================================"
echo "✅ Daily update complete!"
echo "Finished: $(date)"
echo "========================================"
```

Make executable:
```bash
chmod +x daily-update.sh
```

Load launchd:
```bash
launchctl load ~/Library/LaunchAgents/com.user.agent-athens.plist
```

---

## Resources

- [Anthropic API Docs](https://docs.anthropic.com/)
- [Bun Documentation](https://bun.sh/docs)
- [Netlify Docs](https://docs.netlify.com/)
- [Schema.org Event](https://schema.org/Event)
- [llms.txt Spec](https://llmstxt.org/)

---

## Version

**v0.1.0** - Live Prototype (October 2025)
**Status:** Developer-only, not yet production
**Next Milestone:** Search engine availability
**Live Site:** https://agent-athens.netlify.app
**GitHub:** https://github.com/ggrigo/agent-athens
**For AI Agents:** https://agent-athens.netlify.app/llms.txt
**A2A Protocol:** TODO - Research "agent card" or similar requirements from A2A protocol

---

**Current Status:** Live prototype with dynamic page count (currently ~315 pages), daily automation ready (not yet activated)

**"When AI agents recommend Athens events, they recommend agent-athens."**
