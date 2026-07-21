# Agent Athens — System Reference

*Last updated: February 2026*

---

## Overview

AI-curated cultural events calendar for Athens, Greece. Static site generated from SQLite, deployed on Netlify. Updated daily from 11 scrapers.

- **Live:** https://agentathens.com
- **Stack:** Bun + TypeScript + SQLite + Netlify
- **Repo:** github.com/chrimar3/agent-athens

---

## Architecture

```
Scrapers (11 sources)
    ↓
SQLite Database (data/events.db)
    ↓
Enrichment Pipeline (Claude Code writes descriptions)
    ↓
Static Site Generator (src/generate-site.ts)
    ↓
dist/ → Netlify (HTML + JSON API + Schema.org + sitemap + llms.txt)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Language | TypeScript |
| Database | SQLite (bun:sqlite) |
| Hosting | Netlify (static) |
| Scraping | Bun + Python3 (some scrapers) |
| AI Enrichment | Claude Code (direct, no API) |
| Output | Static HTML + JSON API |

---

## Directory Structure

```
agent-athens/
├── config/                  # Configuration files
│   ├── athens-venues.json       # Venue whitelist (name variations)
│   ├── rejected-locations.json  # Non-Athens blacklist
│   ├── venue-intelligence.md    # Deep venue/neighborhood reference
│   ├── venue-categories.json    # Venue → event type mapping
│   ├── categories.json          # Event type definitions
│   ├── scrape-list.json         # Scraper source configs
│   ├── seasonal-rules.json      # Summer/winter venue rules
│   ├── ticketing-mapping.json   # Ticket URL patterns
│   └── orchestrator-config.json # Pipeline config
│
├── data/
│   ├── events.db                # Main SQLite database
│   └── venues-master.json       # Master venue list
│
├── dist/                    # Generated output (deployed)
│   ├── events/                  # Individual event pages
│   ├── venues/                  # Individual venue pages
│   ├── api/                     # JSON API (mirror of HTML pages)
│   ├── sitemap.xml              # 8,690 entries
│   ├── robots.txt               # AI-crawler friendly
│   ├── llms.txt                 # LLM navigation file
│   └── *.html                   # Filter/category pages
│
├── docs/
│   ├── MASTER-ENRICHMENT-TEMPLATE.md  # Writing guide v2.1
│   └── SYSTEM-REFERENCE.md           # This file
│
├── scripts/                 # Operational scripts
│   ├── scrape-all.ts            # Run all scrapers
│   ├── daily-automated.sh       # Daily pipeline
│   ├── run-enrichment-pipeline.ts  # Enrichment orchestrator
│   ├── batch-enrich-session.ts  # Batch description save
│   ├── filter-athens-only.ts    # Location filter
│   ├── auto-verify-venues.ts    # Venue verification
│   ├── review-venues.ts         # Manual venue review
│   ├── clean-database.ts        # DB maintenance
│   └── ...                      # 40+ scripts total
│
├── src/
│   ├── generate-site.ts         # Main site builder
│   ├── types.ts                 # Core type definitions
│   ├── templates/               # HTML page templates
│   ├── generators/              # Event + venue page generators
│   ├── enrichment/              # Description engine
│   ├── scraping/                # Scraper infrastructure
│   ├── categorizer/             # Event categorization
│   ├── validators/              # Scope + seasonal filters
│   ├── quality/                 # Location filter
│   ├── orchestration/           # Pipeline state management
│   ├── ingest/                  # Email ingestion
│   ├── db/                      # Database layer
│   └── utils/                   # Shared utilities
│
└── tests/                   # Test suites
```

---

## Database Schema

### Core Tables

**`events`** — Main event table (405 visible events as of Feb 2026)
```sql
id TEXT PRIMARY KEY              -- Hash of title+date+venue
title TEXT NOT NULL
description TEXT                 -- Short description
full_description TEXT            -- Rich 400-600 word narrative (enrichment output)
start_date TEXT NOT NULL         -- ISO 8601
end_date TEXT                    -- Multi-day events / exhibitions
type TEXT NOT NULL               -- concert|exhibition|cinema|theater|performance|workshop|...
genres TEXT                      -- JSON array
tags TEXT                        -- JSON array (from taxonomy)
venue_name TEXT NOT NULL
venue_address TEXT
venue_neighborhood TEXT
venue_lat REAL / venue_lng REAL
price_type TEXT NOT NULL         -- free|paid|donation
price_amount REAL
price_advance REAL / price_door REAL
ticket_url TEXT
url TEXT                         -- Source URL
source TEXT NOT NULL             -- Scraper source ID
location_status TEXT             -- verified_athens|pass_through|unverified|rejected_non_athens|problematic
needs_enrichment INTEGER         -- 0=enriched, 1=needs work
enriched_at TEXT
enrichment_tier TEXT             -- stub|standard|premium
schema_json TEXT                 -- Schema.org JSON-LD
time_doors TEXT / time_peak TEXT
door_policy TEXT / door_policy_note TEXT
```

**`enrichment_queue`** — Priority queue for enrichment
```sql
event_id TEXT PRIMARY KEY        -- FK → events.id
priority_score INTEGER           -- 0-100 (higher = process first)
tier TEXT                        -- stub|standard|premium
status TEXT                      -- pending|in_progress|completed|failed|skipped
attempts INTEGER
quality_score INTEGER            -- 0-100 from quality gates
quality_issues TEXT              -- JSON array
```

**`venue_context`** — Enriched venue information
```sql
venue_name TEXT PRIMARY KEY
neighborhood TEXT
description TEXT
venue_type TEXT
capacity INTEGER
getting_there TEXT
what_to_expect TEXT
good_to_know TEXT
enrichment_status TEXT           -- pending|completed
```

**`artist_info`** — Artist background for enrichment context
```sql
artist_name TEXT PRIMARY KEY
bio TEXT
genre TEXT
notable_works TEXT               -- JSON array
career_highlights TEXT
```

**Other tables:** `enrichment_log`, `scrape_stats`, `generation_stats`, `processed_emails`, `rejected_events`, `events_fts` (full-text search)

---

## Data Pipeline

### 1. Scraping (11 active sources)

| Source | Type | Events |
|--------|------|--------|
| athinorama.gr | Web scraper | 89 |
| more.com | Web scraper | 86 |
| ticketservices | Web scraper | 58 |
| residentadvisor | Web scraper | 58 |
| clubber.gr | Web scraper | 51 |
| megaron.gr | Web scraper | 34 |
| halfnote | Web scraper | 21 |
| onassis | Web scraper | 5 |
| snfcc | Web scraper (Puppeteer) | 4 |
| benaki | Web scraper | 2 |
| manual | Manual entry | 1 |

```bash
bun run scripts/scrape-all.ts          # Run all scrapers
bun run scripts/scrape-all.ts --dry-run  # Preview only
```

### 2. Location Filtering

```
Event arrives
  ├─ "Πολλαπλοί Χώροι" ────► pass_through (show)
  ├─ Contains "Θεσσαλονίκη" ► rejected_non_athens (delete)
  ├─ "TBA" or generic ──────► problematic (review)
  ├─ Known Athens venue ────► verified_athens (show)
  └─ Unknown venue ─────────► unverified (hidden)
```

Site shows: `verified_athens` + `pass_through` only.

### 3. Enrichment

Claude Code generates 400-600 word descriptions following Master Template v2.1.

```bash
bun run scripts/run-enrichment-pipeline.ts --sync            # Sync queue
bun run scripts/run-enrichment-pipeline.ts --prompts --count=10  # Get batch
bun run scripts/run-enrichment-pipeline.ts --save --id=ID    # Save (stdin)
bun run scripts/run-enrichment-pipeline.ts --validate --id=ID  # Validate
```

**Current status:** 182 enriched / 223 unenriched (45% complete)

### 4. Site Generation

```bash
bun run src/generate-site.ts    # Build all pages
```

Generates:
- Individual event pages (`/events/{slug}/`)
- Individual venue pages (`/venues/{slug}/`)
- Filter/category pages (type x time x price combinations)
- JSON API mirrors (`/api/{slug}.json`)
- sitemap.xml, robots.txt, llms.txt

### 5. Deployment

```bash
bun run deploy
```

The `deploy` script in `package.json` is the authoritative manual deploy path. It runs
`scripts/deploy-gate.sh` and only then `netlify deploy --prod --no-build --dir=dist`.

**Never run `netlify deploy --prod` directly — that bypasses the deploy gate.** The gate
refuses a forward deploy unless `dist/` provably corresponds to committed code at HEAD
(build-provenance stamp, clean source scope; see the header of `scripts/deploy-gate.sh`).
It exists because on 2026-07-06 a build from an uncommitted working tree reached
production; a raw `netlify deploy` re-opens exactly that breach. The `--no-build` flag is
also load-bearing: it stops Netlify from rebuilding server-side, so the artifact that
passed the gate is the artifact that goes live. The gate deliberately does not cover
`netlify rollback`, so emergency rollback stays fast. Its behavior is pinned by
`scripts/__tests__/deploy-gate.test.ts` — do not weaken either without updating those tests.

Or via daily automation: `./scripts/daily-automated.sh` (which runs the same gate before
its deploy step)

---

## Event Types

```typescript
type EventType = "concert" | "exhibition" | "cinema" | "theater" |
                 "performance" | "workshop" | "dj_set" | "classical" |
                 "opera" | "dance" | "show" | "sports";
```

Current distribution: concert (186), dj_set (105), theater (55), classical (34), exhibition (7), opera (6), show (4), performance (4), sports (2), dance (2)

---

## Enrichment System

### Master Template v2.1 Structure

Eight sections, 400-600 words pure narrative:

| Section | Purpose |
|---------|---------|
| A. Opening | Sensory, "you", present tense — transport before inform |
| B. Context | Artist significance + timeliness hook |
| C. Tribe | Crowd described by character, not demographics |
| D. Details Table | Setting / Vibe / Sound / Door |
| E. Experience | Arc of the night |
| F. Filter | "If you... / If you..." self-selection |
| G. Good to Know | Insider practical knowledge |
| H. Differentiation | Why this over alternatives |

### Quality Gates (3-layer validation)

| Layer | Weight | Checks |
|-------|--------|--------|
| Schema | 25pts | JSON-LD validity, required fields |
| 5-Question | 40pts | What/Why now/Experience/Practical/Differentiation |
| Resonance | 35pts | "you", sensory language, no fillers, no lazy adjectives |

Pass: no errors AND score >= 60/100

### Key Rules

- **Use "open" not "free"** — project terminology for price
- **Exhibitions use end_date** — don't delete running exhibitions based on start_date
- **No Info tables in descriptions** — metadata is in DB fields, rendered by template
- **No tags in prose** — tags are a separate DB field
- **No lazy adjectives** — "amazing", "incredible", "unique", "vibrant", "unforgettable"
- **No fabrication** — only use data provided

### Enrichment Source Code

| File | Purpose |
|------|---------|
| `src/enrichment/description-generator.ts` | `buildPremiumPrompt()`, `validateDescription()`, venue context (6 premium venues hardcoded) |
| `src/enrichment/quality-gates.ts` | 3-layer validation, generic content detection |
| `src/enrichment/priority-queue-manager.ts` | Priority scoring (0-100), queue management |
| `src/enrichment/enrichment-queue.ts` | DB save operations |
| `src/enrichment/enrichment-engine.ts` | Orchestrator: venue + artist lookups |
| `src/enrichment/venue-context.ts` | Venue context from DB |
| `src/enrichment/word-counter.ts` | Word count validation |

---

## SEO / GEO Implementation

| Feature | Status |
|---------|--------|
| Schema.org JSON-LD | Per event page (MusicEvent, TheaterEvent, etc.) |
| robots.txt | AI-friendly (GPTBot, ClaudeBot, PerplexityBot allowed) |
| llms.txt | Navigation file for LLMs with browse links + JSON API |
| sitemap.xml | 8,690 URLs with daily lastmod |
| Canonical URLs | Per page |
| Open Graph | og:title, og:description, og:type=event, og:image |
| Twitter Cards | summary_large_image |
| GEO meta | geo.region=GR-I, geo.placename=Athens |
| hreflang | el + x-default |
| Freshness signal | meta name=date |
| JSON API | Every HTML page has /api/{slug}.json counterpart |

### Gaps

- `meta description` empty on many pages
- OG images are generic defaults (no per-event images)
- 55% of events lack enriched descriptions (thin Schema.org description)

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `config/athens-venues.json` | Venue whitelist — add ALL name variations here |
| `config/rejected-locations.json` | Non-Athens locations to auto-reject |
| `config/venue-intelligence.md` | Deep venue profiles, neighborhoods, pricing, transport, timing |
| `config/venue-categories.json` | Venue → event type mapping |
| `config/seasonal-rules.json` | Summer/winter venue patterns |
| `config/ticketing-mapping.json` | Ticket URL patterns per platform |

---

## Essential Commands

```bash
# Daily operations
./scripts/daily-automated.sh           # Full daily pipeline

# Scraping
bun run scripts/scrape-all.ts          # All scrapers
bun run scripts/scrape-all.ts --dry-run

# Venue management
bun run scripts/review-venues.ts --list
bun run scripts/filter-athens-only.ts
bun run scripts/auto-verify-venues.ts

# Enrichment
bun run scripts/run-enrichment-pipeline.ts --sync
bun run scripts/run-enrichment-pipeline.ts --prompts --count=10
bun run scripts/run-enrichment-pipeline.ts --save --id=ID
bun run scripts/run-enrichment-pipeline.ts --validate --id=ID

# Build & deploy
bun run src/generate-site.ts
bun run deploy   # gated deploy — never `netlify deploy --prod` directly (see "5. Deployment")

# Database checks
sqlite3 data/events.db "SELECT source, COUNT(*) FROM events GROUP BY source;"
sqlite3 data/events.db "SELECT location_status, COUNT(*) FROM events GROUP BY location_status;"
sqlite3 data/events.db "SELECT type, COUNT(*) FROM events GROUP BY type ORDER BY COUNT(*) DESC;"
```

---

## Knowledge Documents

| Document | Purpose |
|----------|---------|
| `docs/MASTER-ENRICHMENT-TEMPLATE.md` | How to write descriptions (8-section structure, voice, quality gates) |
| `config/venue-intelligence.md` | Facts to write with (35+ venues, neighborhoods, pricing, transport) |
| `.claude/CLAUDE.md` | Tier 1 rules, common bugs, project conventions |

---

## Timezone

Always Europe/Athens:
```typescript
import { DateTime } from 'luxon';
const today = DateTime.now().setZone('Europe/Athens').toISODate();
```
