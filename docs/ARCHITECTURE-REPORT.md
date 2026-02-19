# Agent Athens - Architecture Report

## Executive Summary

**Agent Athens** είναι ένα AI-curated cultural events calendar για την Αθήνα. Συλλέγει events από emails και web scraping, φιλτράρει μόνο Αθήνα, εμπλουτίζει με AI descriptions, και παράγει static site optimized για AI answer engines.

**Tech Stack:** Bun + TypeScript + SQLite + Python (scraping) + Netlify
**Live Site:** https://agentathens.netlify.app
**GitHub:** https://github.com/chrimar3/agent_athens

---

## Data Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DAILY AUTOMATED (8 AM)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. EMAIL INGESTION          2. WEB SCRAPING         3. QUALITY GATES       │
│  ┌─────────────────┐        ┌─────────────────┐     ┌─────────────────┐    │
│  │ ingest-emails.ts│        │scrape-all-sites │     │ location-filter │    │
│  │ (IMAP fetch)    │───────▶│ (Python/Puppeteer)───▶│ (Athens only)   │    │
│  └─────────────────┘        └─────────────────┘     └─────────────────┘    │
│                                                              │              │
│  4. PRICE ENRICHMENT         5. SITE GENERATION      6. DEPLOY             │
│  ┌─────────────────┐        ┌─────────────────┐     ┌─────────────────┐    │
│  │fix-urls-prices.ts│◀──────│ generate-site.ts│────▶│ Netlify         │    │
│  │(more.com prices) │        │ (336 pages)     │     │ (auto-deploy)   │    │
│  └─────────────────┘        └─────────────────┘     └─────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       MANUAL (Claude Code Session)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  AI ENRICHMENT: run-enrichment-pipeline.ts → Claude generates 150-300 word descriptions│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Files by Function

### 1. Site Generation (Output)

| File | Lines | Purpose |
|------|-------|---------|
| `src/generate-site.ts` | 351 | Main entry point - generates all 336 HTML pages + JSON APIs |
| `src/templates/page.ts` | 369 | HTML template with Schema.org markup, GEO optimization |
| `src/utils/url-validator.ts` | 203 | URL validation, UTM parameters, fallback search URLs |
| `src/utils/urls.ts` | ~100 | URL building for pages |
| `src/utils/filters.ts` | ~150 | Event filtering (type, time, price) |
| `src/utils/i18n.ts` | ~200 | Greek date/time formatting |

**Output:**
- `dist/*.html` - 336 static HTML pages
- `dist/api/*.json` - 315 JSON API endpoints
- `dist/llms.txt` - AI agent instructions
- `dist/sitemap.xml` - SEO sitemap

### 2. Database Layer

| File | Lines | Purpose |
|------|-------|---------|
| `src/db/database.ts` | 393 | SQLite operations, queries, upserts |
| `data/events.db` | - | SQLite database (~160 events) |

**Schema highlights:**
```sql
events (
  id, title, description, full_description,
  start_date, end_date,
  type, genres, tags,
  venue_name, venue_address, venue_neighborhood,
  price_type, price_amount, price_range,
  url, source,
  location_status,  -- verified_athens | pass_through | rejected
  needs_enrichment, enriched_at
)
```

### 3. Data Ingestion

| File | Purpose |
|------|---------|
| `scripts/ingest-emails.ts` | IMAP connection, fetch newsletter emails |
| `src/ingest/email-parser.ts` | Parse email HTML to extract events |
| `src/ingest/newsletter-formats/*.ts` | Format-specific parsers (lifo, megaron, snfcc, this-is-athens) |

### 4. Web Scraping

| File | Language | Purpose |
|------|----------|---------|
| `scripts/scrape-all-sites.py` | Python | Main scraper orchestrator |
| `scripts/fetch-missing-data.py` | Python | Fetch times & prices from event pages |
| `scripts/fix-urls-and-prices.ts` | TypeScript | Enhanced more.com price extraction with JSON-LD |
| `scripts/scrape-more-enhanced.ts` | TypeScript | Standalone more.com scraper |
| `scripts/analyze-more-structure.ts` | TypeScript | Research tool for page structure |

**Supported sources:**
- `viva.gr` / `more.com` (102 events) - 100% price success
- `athinorama.gr` (24 events) - 100% price success
- `clubber.gr` (22 events) - Door price (no online prices)
- `megaron.gr` (4 events) - 100% price success

### 5. Quality Gates

| File | Purpose |
|------|---------|
| `src/quality/location-filter.ts` | Athens-only filtering |
| `config/athens-venues.json` | 78 verified Athens venues whitelist |
| `config/rejected-locations.json` | Non-Athens locations blacklist |
| `scripts/review-venues.ts` | CLI for reviewing unknown venues |

**Location status flow:**
```
Event arrives
├─ Venue in whitelist → verified_athens (show on site)
├─ "Πολλαπλοί Χώροι" → pass_through (show on site)
├─ Contains "Θεσσαλονίκη" → rejected_non_athens (hidden)
├─ "TBA" or generic → problematic (needs review)
└─ Unknown venue → unverified (hidden until reviewed)
```

### 6. AI Enrichment

| File | Purpose |
|------|---------|
| `scripts/run-enrichment-pipeline.ts` | Main enrichment script (runs in Claude Code) |
| `src/enrichment/description-generator.ts` | Prompt templates for AI |
| `src/enrichment/venue-context.ts` | Venue background info |
| `src/enrichment/artist-lookup.ts` | Artist/performer info |

**Enrichment produces:**
- `full_description` (150-300 words, Greek)
- `full_description_en` (English version)
- Optimized for AI answer engines to quote

### 7. Automation

| File | Purpose |
|------|---------|
| `scripts/daily-automated.sh` | Main pipeline script (runs via launchd at 8 AM) |
| `scripts/setup-macos-automation.sh` | launchd plist setup |
| `com.agentathens.daily.plist` | launchd job definition |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `config/athens-venues.json` | 78 verified Athens venues with aliases |
| `config/rejected-locations.json` | Cities/venues to exclude |
| `config/scrape-list.json` | URLs to scrape |
| `config/newsletter-formats.json` | Email parsing rules |
| `netlify.toml` | Netlify deployment config |
| `package.json` | Dependencies & scripts |

---

## Key npm Scripts

```bash
bun run build              # Generate static site (336 pages)
bun run deploy             # Deploy to Netlify
bun run fetch-emails       # Fetch emails from IMAP
bun run scrape-web         # Run Python scrapers
bun run fetch-prices       # Fetch missing prices
bun run test               # Run test pipeline
```

---

## Current Data Stats (January 2026)

```
Total Events:           162
├─ verified_athens:     154 (showing on site)
├─ pass_through:          8 (showing on site)
└─ other:                 0

Price Status:
├─ PAID (with price):   124
├─ DOOR PRICE:           22 (clubber.gr)
├─ TBA:                  14
└─ FREE:                  2

Sources:
├─ viva.gr/more.com:    111 (100% price success)
├─ athinorama.gr:        24 (100% price success)
├─ clubber.gr:           22 (door price)
├─ megaron.gr:            4 (100% price success)
└─ manual:                1

Enrichment:             162/162 (100% complete)
```

---

## Recent Improvements (Jan 2026)

1. **more.com JSON-LD extraction** - Structured data extraction for richer metadata
2. **TBA handling** - Events without prices show "TBA" instead of €0
3. **Door price** - clubber.gr events marked as "Door price"
4. **UTM tracking** - All external links have `utm_source=agentathens`
5. **Referrer enabled** - Removed `noreferrer` so ticketing sites see traffic source

---

## Files to Read for Full Context

Για το Claude UI, τα πιο σημαντικά αρχεία με σειρά προτεραιότητας:

### Must Read (Core Logic)
1. `src/generate-site.ts` - Site generation entry point
2. `src/templates/page.ts` - HTML template & Schema.org
3. `src/db/database.ts` - Database operations
4. `scripts/fix-urls-and-prices.ts` - Price extraction logic

### Should Read (Pipeline)
5. `scripts/daily-automated.sh` - Full pipeline flow
6. `scripts/scrape-all-sites.py` - Web scraping orchestration
7. `src/quality/location-filter.ts` - Athens filtering

### Reference (Config)
8. `config/athens-venues.json` - Venue whitelist
9. `package.json` - Scripts & dependencies
10. `.claude/CLAUDE.md` - Project instructions

---

## Directory Structure

```
agent-athens/
├── src/
│   ├── generate-site.ts          # Main site generator
│   ├── types.ts                  # TypeScript types
│   ├── db/
│   │   └── database.ts           # SQLite operations
│   ├── templates/
│   │   └── page.ts               # HTML template
│   ├── utils/
│   │   ├── filters.ts            # Event filtering
│   │   ├── i18n.ts               # Greek formatting
│   │   ├── url-validator.ts      # URL handling + UTM
│   │   └── urls.ts               # URL building
│   ├── ingest/
│   │   ├── email-ingestion.ts    # IMAP fetch
│   │   ├── email-parser.ts       # Email parsing
│   │   └── newsletter-formats/   # Per-source parsers
│   ├── quality/
│   │   └── location-filter.ts    # Athens filtering
│   └── enrichment/
│       ├── description-generator.ts
│       └── venue-context.ts
├── scripts/
│   ├── daily-automated.sh        # Main pipeline
│   ├── scrape-all-sites.py       # Web scraping
│   ├── fetch-missing-data.py     # Price/time fetch
│   ├── fix-urls-and-prices.ts    # more.com extraction
│   ├── run-enrichment-pipeline.ts          # AI enrichment
│   └── review-venues.ts          # Venue review CLI
├── config/
│   ├── athens-venues.json        # Venue whitelist
│   ├── rejected-locations.json   # Location blacklist
│   └── scrape-list.json          # Scrape targets
├── data/
│   └── events.db                 # SQLite database
├── dist/                         # Generated site output
│   ├── *.html                    # 336 HTML pages
│   ├── api/*.json                # 315 JSON APIs
│   ├── llms.txt                  # AI instructions
│   └── sitemap.xml               # SEO sitemap
└── docs/
    └── ARCHITECTURE-REPORT.md    # This file
```

---

## Next Steps / Open Tasks

1. **Expand sources** - Add more venues (Gazarte, SNFCC, Onassis)
2. **Improve clubber.gr** - Check if Resident Advisor has prices
3. **Add exhibition data** - Currently 0 exhibitions
4. **Email ingestion** - Fix newsletter parsing for new formats
5. **Monitoring** - Add alerts for scraping failures
6. **Analytics** - Track which events get clicks

---

*Last updated: January 26, 2026*
