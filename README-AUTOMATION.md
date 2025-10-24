# Agent Athens - Automation Guide

## Overview

Agent Athens automatically updates daily with fresh events from Athens venues. The automation includes:

1. **Web Scraping** - Fetches event listings from tier-1 sources
2. **Price Extraction** - Gets accurate ticket prices for each event
3. **Site Generation** - Builds static HTML pages optimized for SEO/GEO
4. **Deployment** - Pushes to Netlify CDN

## Quick Start

### Full Update (Scrape → Parse → Prices → Build → Deploy)

```bash
./scripts/update-site.sh
```

This runs the complete workflow. Use flags to skip steps:
- `--skip-scrape` - Skip web scraping
- `--skip-prices` - Skip price fetching
- `--skip-deploy` - Skip Netlify deployment

### Individual Commands

```bash
# Scrape event websites
bun run scrape-web

# Parse HTML files to database
bun run scripts/parse-helper.ts data/html-to-parse/*.html

# Fetch prices for events
bun run fetch-prices

# Build static site
bun run build

# Deploy to Netlify
bun run deploy
```

## Daily Automation

### GitHub Actions (Recommended)

The site updates automatically every day at 8:00 AM Athens time via GitHub Actions.

**Setup:**
1. Go to repository Settings → Secrets and variables → Actions
2. Add these secrets:
   - `NETLIFY_AUTH_TOKEN` - Your Netlify personal access token
   - `NETLIFY_SITE_ID` - Your Netlify site ID

The workflow file is at `.github/workflows/daily-update.yml`

### Manual Trigger

Trigger the GitHub Action manually:
1. Go to Actions tab
2. Select "Daily Site Update"
3. Click "Run workflow"

## How It Works

### 1. Web Scraping (`scrape-all-sites.py`)

Scrapes tier-1 event sources:
- **more.com** (Viva/More ticketing platform)
- **gazarte.gr** (Independent venue)

Features:
- Respects crawl frequency (daily/weekly/monthly)
- Tracks last crawl time
- Uses Playwright for JavaScript-rendered sites
- Polite 2-second delays between requests
- Saves HTML for parsing

### 2. HTML Parsing (`parse-helper.ts`)

Extracts structured event data from HTML:
- Event title, date, time
- Venue information
- Event type (concert, theater, etc.)
- Description
- Ticket URLs

Saves to SQLite database with deduplication.

### 3. Price Fetching (`fetch-prices.py`)

Fetches accurate ticket prices:
- Visits individual event pages
- Extracts price from page (€15, €45, etc.)
- Handles price ranges (€10-€25)
- Updates database with pricing
- Skips events that already have prices

**Performance:**
- ~1 second per event
- Processes ~1,800 events in 30 minutes
- 98% success rate

### 4. Site Generation (`generate-site.ts`)

Builds static HTML pages:
- 336 pages total (index, categories, filters)
- SEO optimized meta tags
- Schema.org structured data
- Mobile-responsive design
- Prices displayed when available

### 5. Deployment

Deploys to Netlify CDN:
- Instant global distribution
- Automatic HTTPS
- Atomic deployments (no downtime)

## File Structure

```
agent-athens/
├── scripts/
│   ├── scrape-all-sites.py      # Main web scraper
│   ├── fetch-prices.py           # Price extraction
│   ├── parse-helper.ts           # HTML parser
│   └── update-site.sh            # Full automation script
├── data/
│   ├── events.db                 # SQLite database
│   ├── crawl-tracker.json        # Tracks scraping schedule
│   ├── html-to-parse/            # Downloaded HTML files
│   └── html-archive/             # Processed HTML archive
├── dist/                         # Generated static site
├── .github/workflows/
│   └── daily-update.yml          # GitHub Actions workflow
└── package.json                  # NPM scripts
```

## Monitoring

### Check Scraping Status

```bash
cat data/crawl-tracker.json
```

### Check Database Stats

```bash
sqlite3 data/events.db "
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN price_amount > 0 THEN 1 END) as with_prices
  FROM events
  WHERE date(start_date) >= date('now')
"
```

### View Recent Events

```bash
sqlite3 data/events.db "
  SELECT title, price_amount, start_date
  FROM events
  WHERE date(start_date) >= date('now')
  ORDER BY start_date
  LIMIT 10
"
```

## Troubleshooting

### Events missing prices

Run the price fetcher:
```bash
bun run fetch-prices
```

### Old events still showing

The database auto-cleans events older than 1 day during build.

### Site not updating

1. Check GitHub Actions logs
2. Verify Netlify secrets are set
3. Run locally: `./scripts/update-site.sh`

## Development

### Test Locally

```bash
# Build site
bun run build

# Serve locally
bun run serve
# Visit http://localhost:3000
```

### Add New Event Source

1. Add to `config/scrape-list.json`
2. Define pages to scrape
3. Set crawl frequency
4. Run `bun run scrape-web`

## Performance

- **Scraping**: ~30 seconds for all sites
- **Parsing**: ~5 seconds for 2,000 events
- **Price fetching**: ~30 minutes for 1,800 events
- **Site generation**: ~5 seconds for 336 pages
- **Deployment**: ~1 minute to Netlify

**Total**: ~35 minutes for full update

## License

MIT License - See LICENSE file
