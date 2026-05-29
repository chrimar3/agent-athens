# agent-athens

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)
[![Language](https://img.shields.io/badge/language-TypeScript-3178C6.svg)](https://www.typescriptlang.org)
[![Live](https://img.shields.io/badge/live-agentathens.com-2ea44f.svg)](https://agentathens.com)

**AI-curated cultural events calendar for Athens, Greece.** A static-first site that turns daily newsletters and scraped event listings into pages designed for AI answer engines (ChatGPT, Perplexity, Claude), agent-to-agent (A2A) protocols, and humans.

Solo-built. Demonstrates AI-native content production, structured data at scale, and multi-agent orchestration.

🔗 **Live site:** https://agentathens.com
🤖 **AI discovery:** https://agentathens.com/llms.txt
📝 **Colophon:** https://agentathens.com/en/colophon/
📦 **Repository:** https://github.com/chrimar3/agent-athens

---

## What It Is

A daily-updated calendar of concerts, DJ sets, exhibitions, theater, festivals, and cultural happenings in Athens. The pipeline runs automatically every morning: it ingests events from email newsletters and web scrapers, runs them through quality gates (location verification, deduplication), enriches them with AI-generated descriptions, and publishes a static site to Netlify.

The site is designed to be the source AI engines cite when users ask "what's on in Athens this weekend?" — structured data, freshness signals, and combinatorial URLs that match natural-language intent.

## Current Stats

*As of 2026-05-29.*

| Metric | Value |
|---|---|
| Verified Athens venues | 346 |
| Pass-through (multi-venue) entries | 6 |
| Neighborhoods catalogued | 90 |
| Active scraper sources | 7 |
| Operational scripts | ~90 |
| Pipeline runtime | ~15–25 min |

## Tech Stack

- **Runtime:** [Bun](https://bun.sh) (never Node.js — see `.claude/CLAUDE.md`)
- **Language:** TypeScript
- **Database:** SQLite via `better-sqlite3`
- **Site generation:** Custom static generator (`src/generate-site.ts`)
- **AI enrichment:** Claude Code CLI (`claude -p`) via `scripts/auto-enrich.sh`
- **Hosting:** Netlify (CDN + edge functions)
- **Automation:** macOS `launchd` (daily 8 AM Athens time)
- **Scraping:** Bun + Python (Puppeteer, Cheerio, BeautifulSoup)
- **Email ingestion:** IMAP via `imap-simple`
- **Schema validation:** Schema.org JSON-LD (Event, CollectionPage, FAQPage)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DAILY PIPELINE (8 AM)                   │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────┐   │
│  │  EMAIL   │    │   WEB    │    │  ICAL / NEWSLETTERS  │   │
│  │  IMAP    │    │ SCRAPING │    │    (planned)         │   │
│  └────┬─────┘    └────┬─────┘    └──────────┬───────────┘   │
│       └───────────────┼────────────────────-┘               │
│                       ▼                                     │
│       ┌─────────────────────────────────┐                   │
│       │   QUALITY GATES                 │                   │
│       │   • Location filter (whitelist) │                   │
│       │   • Same-source dedup           │                   │
│       │   • Cross-source merge          │                   │
│       │   • Price acquisition           │                   │
│       │   • Ticket URL validation       │                   │
│       │   • Schema.org generation       │                   │
│       └─────────────────┬───────────────┘                   │
│                         ▼                                   │
│       ┌─────────────────────────────────┐                   │
│       │   AI ENRICHMENT                 │                   │
│       │   • Description generation      │                   │
│       │   • Time / image extraction     │                   │
│       │   • Venue geocoding             │                   │
│       └─────────────────┬───────────────┘                   │
│                         ▼                                   │
│       ┌─────────────────────────────────┐                   │
│       │   STATIC SITE GENERATION        │                   │
│       │   • OG images + favicons        │                   │
│       │   • 3 sitemaps + llms.txt       │                   │
│       └─────────────────┬───────────────┘                   │
│                         ▼                                   │
│       ┌─────────────────────────────────┐                   │
│       │   DEPLOY                        │                   │
│       │   • Netlify CLI                 │                   │
│       │   • IndexNow ping (Bing/Yandex) │                   │
│       └─────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

The orchestrator (`scripts/daily-automated.sh`) runs every phase as non-fatal except site generation and deploy — a flaky scraper never blocks publishing already-good data.

---

## Quick Start

### Prerequisites

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Claude Code CLI (for enrichment)
# https://claude.com/claude-code
```

### Setup

```bash
git clone https://github.com/chrimar3/agent-athens.git
cd agent-athens
bun install
cp .env.example .env  # add IMAP credentials if using email ingestion
```

### Run the pipeline

```bash
# Full daily pipeline (ingest → enrich → build → deploy)
./scripts/daily-automated.sh

# Dry run (show what would happen)
./scripts/daily-automated.sh --dry-run

# Just build the site
bun run build

# Just scrape (specific source or all)
bun run scripts/scrape-all.ts
bun run scripts/scrape-all.ts --source=athinorama.gr --dry-run

# Deploy manually
bun run deploy   # netlify deploy --prod --dir=dist
```

---

## Project Structure

```
agent-athens/
├── src/
│   ├── generate-site.ts        # Main static site generator
│   ├── types.ts                # Core types (Event, EventType, Price, …)
│   ├── db/                     # SQLite layer
│   ├── ingest/                 # Email IMAP ingestion
│   ├── scraping/               # Web scrapers
│   ├── categorizer/            # Event type classification
│   ├── enrichment/             # AI description pipeline
│   ├── quality/                # Dedup, location filter, validators
│   ├── generators/             # Page builders (event, hub, venue)
│   ├── templates/              # HTML templates + card variants
│   ├── images/                 # OG image + favicon generation
│   ├── sitemap/                # Sitemap splitting
│   └── styles/                 # Design system CSS
├── scripts/                    # ~90 operational scripts
│   ├── daily-automated.sh      # Daily pipeline orchestrator
│   ├── auto-enrich.sh          # AI enrichment loop
│   ├── scrape-all.ts           # Multi-source scraper
│   ├── run-enrichment-pipeline.ts
│   ├── filter-athens-only.ts   # Location whitelist filter
│   ├── merge-duplicates.ts     # Cross-source dedup
│   ├── generate-schema.ts      # Schema.org JSON-LD
│   └── health-check.ts
├── config/
│   ├── athens-venues.json      # 346 verified Athens venues
│   ├── rejected-locations.json # Non-Athens blacklist
│   ├── orchestrator-config.json
│   ├── scrape-list.json
│   ├── enrichment-knowledge.md # Venues, neighborhoods, artists
│   └── ticketing-mapping.json
├── data/
│   ├── events.db               # SQLite database (gitignored)
│   ├── state/                  # Pipeline state tracking
│   └── health-reports/         # Daily health snapshots
├── docs/                       # Architecture, enrichment, audits
├── exemplars/                  # Reference enrichment outputs
├── tests/                      # Bun test suite
├── dist/                       # Generated site (gitignored)
├── netlify.toml
└── package.json
```

---

## Data Model

```typescript
type EventType =
  | "concert" | "dj_set" | "exhibition" | "cinema"
  | "theater" | "festival" | "performance" | "show"
  | "workshop" | "tech" | "dance" | "other";

type LocationStatus =
  | "verified_athens"      // shown on site
  | "pass_through"         // multi-venue, shown on site
  | "unverified"           // hidden, awaiting review
  | "rejected_non_athens"  // deleted
  | "problematic";         // needs human review

type Price = "open" | "with-ticket" | "donation";
```

Events are deduplicated by `hash(title + date + venue)`. Exhibitions use `end_date` (not `start_date`) for the "is it still running" check.

---

## URL Structure

Pages are generated combinatorially across `{type} × {time} × {price} × {genre}`:

```
/today                              /open-today
/this-weekend                       /with-ticket-this-weekend
/concert-today                      /open-jazz-concert-this-week
/exhibition-this-month              /dj_set-this-weekend
/events/{slug}                      /venues/{slug}
/sitemap-events.xml                 /llms.txt
```

Empty pages still render (with a "0 events found" state) so URLs stay stable for AI agents and search engines that have already indexed them.

---

## SEO / GEO Strategy

**For AI answer engines:**
- `llms.txt` for agent discovery
- Schema.org JSON-LD on every page (Event + CollectionPage + FAQPage)
- Daily freshness signals (`Last updated` timestamps)
- Structured, single-source data (no conflicting facts)
- Specific URLs that match natural-language intent

**For search engines:**
- 3 split sitemaps (events, venues, editorial)
- IndexNow ping after every deploy (Bing, Yandex)
- Semantic HTML, fast static delivery via Netlify CDN
- Internal linking between related hub pages

**For humans:**
- Mobile-first responsive design
- Tabular numerics, accessible card layouts
- OG images auto-generated per page

---

## Daily Pipeline

The orchestrator runs 17 phases in order. All phases except `generate` and `deploy` are non-fatal.

| # | Phase | Script | Fatal? |
|---|---|---|---|
| 1 | Email ingestion | `ingest-emails.ts` | no |
| 2 | Email parsing | `parse-newsletter-emails.ts` | no |
| 3 | Web scraping | `scrape-all.ts --crossref` | no |
| 4 | Athens location filter | `filter-athens-only.ts` | no |
| 5 | Same-source dedup | `remove-duplicates.ts` | no |
| 6 | Cross-source merge | `merge-duplicates.ts` | no |
| 7 | Price acquisition | `price-acquisition-chain.ts` | no |
| 8 | Ticket URL validation | `validate-ticket-urls.ts` | no |
| 9 | Schema.org generation | `generate-schema.ts` | no |
| 10 | Enrichment queue sync | `run-enrichment-pipeline.ts --sync` | no |
| 11 | Auto AI enrichment | `auto-enrich.sh` | no |
| 12 | Time enrichment | `enrich-time.ts` | no |
| 13 | Image enrichment | `enrich-images.ts` | no |
| 14 | Image download | `download-images.ts` | no |
| 15 | Venue geocoding | `geocode-missing-venues.ts` | no |
| 16 | **Site generation** | `generate-site.ts` | **yes** |
| 17 | **Deploy + IndexNow** | `netlify deploy` + `ping-indexnow.ts` | **yes** |

Total runtime: ~15–25 minutes depending on enrichment volume.

---

## Testing

```bash
bun test tests/                   # all tests
bun test tests/integration        # integration only
bun test --watch tests/           # watch mode
bun test --coverage tests/        # coverage report
```

Test files cover the daily pipeline integration, enrichment brief generation, schema enhancements, save-batch flow, homepage rendering, EEAT pages, and CLI gating.

---

## Configuration

| File | Purpose |
|---|---|
| `config/athens-venues.json` | Athens venue whitelist (346 entries) |
| `config/rejected-locations.json` | Non-Athens cities + problematic entries |
| `config/orchestrator-config.json` | Pipeline scheduling, timeouts, retries |
| `config/scrape-list.json` | Active scraper sources + frequencies |
| `config/enrichment-knowledge.md` | Venue/artist/neighborhood reference for AI |
| `config/ticketing-mapping.json` | Venue → ticket vendor URL mapping |
| `config/categorization-keywords.json` | Auto-classification keywords |
| `.env` | IMAP credentials (`.env.example` provided) |

---

## Documentation

| Document | Purpose |
|---|---|
| `.claude/CLAUDE.md` | Tier 1 rules, commands, data model (start here) |
| `.claude/notes/mistakes.md` | Bug ledger — read before any change |
| `.claude/notes/patterns.md` | Code patterns and conventions |
| `.claude/notes/decisions.md` | Architecture decisions |
| `docs/SYSTEM-REFERENCE.md` | Full architecture + DB schema |
| `docs/SCRAPING-PIPELINE.md` | Scraping internals |
| `docs/MASTER-ENRICHMENT-TEMPLATE.md` | Description writing standard (v2.5) |
| `docs/greek-enrichment-addendum.md` | Greek-language rules (planned future) |
| `docs/entity-resolution-workflow.md` | Dedup + entity research |
| `docs/enrichment-anti-patterns.md` | What not to write |
| `docs/LAUNCHD-SETUP.md` | macOS automation setup |
| `docs/CONSTITUTION-COMPLIANCE.md` | 13-article project constitution |
| `exemplars/README.md` | Reference enrichment outputs |

---

## Vision

Start with Athens. Prove the model. Expand to `agent-barcelona`, `agent-berlin`, `agent-cities`. The aim is to become the source AI agents cite first when recommending cultural events — and to earn affiliate revenue on tickets, hotels, and restaurants the agents drive.

In the reputation economy where AI trust = revenue, the goal is simple:

> **When AI agents recommend Athens events, they recommend agent-athens.**

---

## License

[MIT](LICENSE)
