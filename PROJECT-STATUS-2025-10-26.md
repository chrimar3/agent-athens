# Agent Athens - Project Status Report
**Date**: October 26, 2025
**Generated for**: Documentation update in Claude UI

---

## 🎯 Project Overview

**agent-athens** is an AI-curated cultural events calendar for Athens, Greece that transforms event data into SEO/GEO-optimized static pages designed for AI answer engines (ChatGPT, Perplexity, Claude).

**Live Site**: https://agent-athens.netlify.app
**Tech Stack**: Bun + TypeScript + SQLite + Netlify
**Current Phase**: Live prototype with substantial event coverage

---

## ✅ What We've Accomplished

### 1. **Data Collection & Processing** ✅
- **Email Ingestion**: Implemented Gmail IMAP integration (`src/ingest/email-ingestion.ts`)
- **Web Scraping**: Automated scraping of 5 tier-1 sources (`scripts/scrape-all-sites.py`)
  - viva.gr (1,341 events)
  - more.com (1,225 events)
  - Viva.gr (349 events - different format)
  - gazarte.gr (38 events)
  - MEGARON (9 events)
- **Database**: SQLite with proper schema (`data/events.db`)
  - 3,135 total events in database
  - 3,121 upcoming events (14 past events auto-cleaned)
  - Proper deduplication via event ID hashing

### 2. **Event Coverage** 📊

**By Type**:
- Theater: 1,348 events (43%)
- Concert: 1,356 events (43%)
- Performance: 335 events (11%)
- Cinema: 38 events (1%)
- Exhibition: 20 events (<1%)
- Workshop: 24 events (<1%)

**By Timeline**:
- Today: 317 events
- Tomorrow: 177 events
- This Week: 940 events
- This Weekend: 455 events
- This Month: 699 events
- Next Month: 1,588 events

**Pricing**:
- 1,496 events with prices (48%)
- 1,623 events without prices (52%)
- Price range: €2.45 - €350.00
- Average price: €18

### 3. **Price Fetcher** 🏗️ (In Progress)
- **Script**: `scripts/fetch-prices.py` (Playwright-based)
- **Status**: Currently running in background
- **Issue**: Having difficulty parsing viva.gr prices (0/16 found so far)
- **Action Required**: Price fetcher selectors need updating for viva.gr JavaScript-rendered content

### 4. **Static Site Generation** ✅
- **Pages Generated**: 336 HTML pages
- **Output**: `/dist` directory (committed to git)
- **Structure**:
  - Core pages: today, tomorrow, this-week, this-weekend, this-month, next-month
  - Type pages: concert, theater, exhibition, cinema, performance, workshop
  - Price pages: free/paid × time ranges
  - Combined pages: type + price + time (e.g., `paid-concert-this-week.html`)
  - Genre pages: jazz-concert, electronic-concert, contemporary-art-exhibition, etc.
  - Discovery files: llms.txt, robots.txt, sitemap.xml

### 5. **Automation** ✅
- **Daily Update**: `scripts/daily-update.sh`
  - Fetches emails from Gmail
  - Scrapes websites (respects frequency)
  - Cleans up old events (7-day retention)
  - Prepares data for Claude Code parsing
- **Site Update**: `scripts/update-site.sh`
  - Full rebuild and deployment pipeline
- **Stats Checker**: `scripts/check-stats.sh`
  - Quick database overview

### 6. **Deployment** ✅
- **Platform**: Netlify
- **Auto-deploy**: Push to `main` branch triggers deployment
- **Config**: `netlify.toml` configured
- **Status**: Live at https://agent-athens.netlify.app

---

## 🚧 What's Left To Do

### 1. **Price Fetcher Improvement** 🔴 HIGH PRIORITY
**File**: `scripts/fetch-prices.py`

**Problem**: Current regex patterns don't find prices on viva.gr (JavaScript-rendered)

**Solution Needed**:
```python
# Current approach (not working for viva.gr):
price_matches = re.findall(r'(€\s*\d+(?:[,.]\d+)?|\d+(?:[,.]\d+)?\s*€)', html)

# Need to add Playwright selector-based extraction:
price_element = await page.query_selector('.ticket-price') # or similar
if price_element:
    price_text = await price_element.inner_text()
```

**Impact**: Currently 52% of events lack pricing (1,623 events)

**Files to Review**:
- `scripts/fetch-prices.py:66-84` - Price extraction logic
- Sample viva.gr page structure to identify correct selectors

### 2. **AI Enrichment** 🟡 MEDIUM PRIORITY
**Status**: 0 events have AI-generated 400-word descriptions

**What's Needed**:
- Run `scripts/enrich-events.ts` to generate rich descriptions
- Uses `tool_agent` (FREE via Claude Code)
- Rate limiting: 2 seconds between calls
- Estimated time: ~2 hours for all 3,121 events

**Requirements** (from CLAUDE.md):
- Exactly 400 words (±20 acceptable)
- No fabricated information
- Focus on cultural context
- Target: AI answer engines + human readers

### 3. **Database Schema Updates** 🟢 LOW PRIORITY (Optional)
**Current State**: Schema works but could be improved

**Potential Enhancements**:
- Add `organizer` field (artist/company name)
- Add `recurring` field (for weekly/monthly events)
- Add `images` field (event poster URLs)
- Add `accessibility` field (wheelchair access, etc.)

**File**: `src/db/schema.sql`

### 4. **Genre Classification** 🟢 LOW PRIORITY
**Current State**: Genre pages exist but most have 0 events

**Issue**: Events don't have genre metadata populated

**Solution**:
- Enhance scrapers to extract genre from event pages
- Add AI-based genre classification during enrichment
- Map genres: jazz, electronic, indie, pop, etc.

**Files**:
- `scripts/scrape-all-sites.py` - Add genre extraction
- `scripts/enrich-events.ts` - Add genre classification

### 5. **Documentation Updates** 📝 CURRENT TASK
**Status**: Partially documented

**Files Needing Updates**:
- `README.md` - Update with current stats (3,121 events, 48% priced)
- `.claude/CLAUDE.md` - Mark completed priorities
- `IMPLEMENTATION_PLAN.md` - Update progress tracking
- `AUTOMATION.md` - Document actual automation workflows

---

## 🔄 Current Automated Workflows

### Daily Update (Manual Trigger)
```bash
./scripts/daily-update.sh
```
1. Fetches overnight emails from Gmail
2. Scrapes tier-1 websites
3. Cleans up past events
4. Saves data to `data/emails-to-parse/` and `data/html-to-parse/`
5. Notifies user (macOS notification)

**Next Step (Manual)**: Use Claude Code to parse and import data

### Full Site Update (Manual Trigger)
```bash
./scripts/update-site.sh
```
1. Runs scrapers
2. Imports data to database
3. Generates static site
4. Commits to git
5. Deploys to Netlify

### Price Fetching (On-Demand)
```bash
python3 scripts/fetch-prices.py [--limit N]
```
- Fetches prices for events without pricing
- Updates database in real-time
- Currently has issues with viva.gr parsing

---

## 📊 Database Schema (Summary)

**Table**: `events`

**Key Fields**:
- `id` (TEXT) - Hash of title+date+venue
- `title`, `description`, `full_description`
- `start_date`, `end_date` (ISO 8601)
- `type` - concert|exhibition|cinema|theater|performance|workshop
- `genres` (JSON array)
- `venue_name`, `venue_address`, `venue_neighborhood`
- `price_type` - free|paid|donation
- `price_amount`, `price_currency`, `price_range`
- `url` - Event page URL
- `source` - newsletter|viva.gr|more.com|etc.

**Indexes**: Optimized for filtering by type, date, price, venue

---

## 🎯 Recommended Next Steps (Priority Order)

### Immediate (This Session)
1. ✅ ~~Monitor price fetcher progress~~
2. ✅ ~~Rebuild site with current data~~
3. 🔄 Commit and deploy updated site
4. 📝 Update project documentation (README, CLAUDE.md)

### Short Term (Next Session)
1. 🔴 Fix price fetcher for viva.gr (improve selectors)
2. 🔴 Re-run price fetcher to get remaining 1,623 prices
3. 🟡 Run AI enrichment on all 3,121 events
4. ✅ Rebuild and deploy final version

### Medium Term (Future)
1. Add genre classification to events
2. Implement recurring events tracking
3. Add event images/posters
4. Create API endpoints for programmatic access
5. Add search functionality to website

---

## 🐛 Known Issues

### 1. Price Fetcher - viva.gr Parsing
**Severity**: High
**Impact**: 52% of events lack pricing
**File**: `scripts/fetch-prices.py:66-84`
**Fix Required**: Update selectors to handle JavaScript-rendered content

### 2. Zero AI Enrichment
**Severity**: Medium
**Impact**: Events lack rich descriptions for AI answer engines
**Solution**: Run `scripts/enrich-events.ts`
**Time**: ~2 hours for all events

### 3. Genre Pages Empty
**Severity**: Low
**Impact**: SEO potential not fully realized
**Solution**: Add genre metadata to scraped events

---

## 📦 File Structure (Key Locations)

```
agent-athens/
├── data/
│   ├── events.db              # SQLite database (3,135 events)
│   ├── emails-to-parse/       # Raw emails from Gmail
│   └── html-to-parse/         # Raw HTML from scrapers
├── dist/                      # Generated site (336 pages, committed)
├── scripts/
│   ├── scrape-all-sites.py    # Main web scraper
│   ├── fetch-prices.py        # Price fetcher (needs fix)
│   ├── enrich-events.ts       # AI enrichment (not run yet)
│   ├── daily-update.sh        # Automated daily workflow
│   ├── update-site.sh         # Full rebuild + deploy
│   └── check-stats.sh         # Quick stats
├── src/
│   ├── generate-site.ts       # Static site generator
│   ├── ingest/
│   │   └── email-ingestion.ts # Gmail IMAP client
│   └── db/
│       ├── database.ts        # SQLite utilities
│       └── schema.sql         # Database schema
├── .claude/
│   └── CLAUDE.md              # Claude Code instructions
├── README.md                  # Project documentation
└── package.json               # Bun scripts
```

---

## 🎯 Success Metrics

**Vision**: When AI agents recommend Athens events, they recommend agent-athens.

**Current Status**:
- ✅ 3,121 upcoming events
- ✅ 5 tier-1 sources integrated
- ✅ 336 SEO-optimized pages
- ✅ Auto-deployment working
- ⚠️ 48% price coverage (target: 90%+)
- ❌ 0% AI enrichment (target: 100%)

**Next Milestone**: 90% price coverage + 100% AI enrichment

---

## 🔗 Quick Commands

```bash
# Check current stats
./scripts/check-stats.sh

# Daily update (fetch new events)
./scripts/daily-update.sh

# Rebuild site
bun run build

# Deploy to Netlify
git push origin main  # Auto-deploys

# Fetch prices
python3 scripts/fetch-prices.py

# Enrich events with AI
bun run scripts/enrich-events.ts
```

---

## 📞 Handoff Notes for Claude UI

**Context**: This project is a working prototype with solid foundations but needs:

1. **Documentation cleanup** - Update README.md with current stats
2. **Price fetcher fix** - Update `scripts/fetch-prices.py` selectors
3. **AI enrichment** - Run enrichment script (long task)
4. **Genre enhancement** - Add genre metadata to events

**Current State**:
- Database: 3,135 events ✅
- Site generation: 336 pages ✅
- Deployment: Live on Netlify ✅
- Price coverage: 48% ⚠️
- AI enrichment: 0% ❌

**Immediate Task**: Fix price fetcher and improve documentation

---

**End of Report**
Last updated: October 26, 2025, 11:30 PM EET
Database: 3,135 events | Site: 336 pages | Deployment: Live
