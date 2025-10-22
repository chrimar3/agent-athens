# Agent Athens - Coding Patterns & Standards

**Last Updated**: October 22, 2025
**Purpose**: Preserve established patterns for consistent development

---

## 🎯 Core Principles

1. **FREE First** - No paid API calls. Use Claude Code for AI parsing.
2. **Two-Step Process** - Fetch data → Parse with Claude Code (FREE)
3. **Athens Timezone** - All dates in `Europe/Athens` (EET/EEST, UTC+2/+3)
4. **Use "open" not "free"** - Terminology standard for events
5. **Commit Everything** - Database, dist/, and data/ for audit trail

---

## 📁 Project Structure

```
agent-athens/
├── src/
│   ├── generate-site.ts       # Main site generator
│   ├── types.ts               # TypeScript types
│   ├── db/
│   │   └── database.ts        # SQLite with Bun (getDatabase())
│   ├── ingest/
│   │   └── email-ingestion.ts # Gmail IMAP email fetcher
│   ├── templates/
│   │   └── page.ts            # HTML renderer
│   └── utils/
│       ├── filters.ts         # Event filtering
│       ├── urls.ts            # URL building
│       └── ai-parser.ts       # AI parsing utilities (FREE)
├── scripts/
│   ├── init-database.ts       # Initialize database
│   ├── scrape-websites.ts     # Web scraping (standalone)
│   ├── enrich-events.ts       # AI descriptions
│   └── import-scraped-events.ts
├── config/
│   └── scrape-list.json       # 16 sites configured
├── data/
│   ├── events.db              # SQLite database (committed)
│   ├── emails-to-parse/       # Gmail fetched emails (JSON)
│   ├── html-to-parse/         # Scraped HTML files
│   ├── processed-emails.json  # Email tracking
│   └── crawl-tracker.json     # Website crawl timestamps
└── dist/                      # Generated site (committed)
```

---

## 🔧 Database Patterns

### Connection (Bun SQLite)

```typescript
import { getDatabase } from '../db/database';

const db = getDatabase();
```

**✅ DO**: Use `getDatabase()` function
**❌ DON'T**: Import `db` directly (doesn't exist)

### Event ID Generation

```typescript
import { createHash } from 'crypto';

function generateEventId(title: string, date: string, venue: string): string {
  const hash = createHash('sha256');
  hash.update(`${title.toLowerCase()}-${date}-${venue.toLowerCase()}`);
  return hash.digest('hex').substring(0, 16);
}
```

### Upsert Pattern

```typescript
const eventId = generateEventId(event.title, event.date, event.venue);
const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);

if (existing) {
  // UPDATE existing event
  db.prepare('UPDATE events SET ... WHERE id = ?').run(..., eventId);
} else {
  // INSERT new event
  db.prepare('INSERT INTO events (...) VALUES (...)').run(...);
}
```

---

## 📧 Email Ingestion Pattern

### Two-Step Workflow (FREE)

**Step 1: Fetch Emails** (automated)
```bash
bun run fetch-emails
```

**Step 2: Parse Emails** (manual with Claude Code)
```
Ask Claude: "Parse the emails in data/emails-to-parse/ and add events to database"
```

### Email Storage Format

```typescript
interface EmailToParse {
  subject: string;
  from: string;
  date: string;      // ISO timestamp
  text: string;      // Plain text content
  html: string;      // HTML content
  messageId: string; // For deduplication
}
```

Saved to: `data/emails-to-parse/YYYY-MM-DD-subject.json`

### Message-ID Tracking

```typescript
interface ProcessedEmails {
  messageIds: string[];
  lastProcessed: string;
}

// Load
const processed = JSON.parse(readFileSync('./data/processed-emails.json'));

// Check
if (processed.messageIds.includes(messageId)) {
  skip; // Already processed
}

// Save
processed.messageIds.push(messageId);
writeFileSync('./data/processed-emails.json', JSON.stringify(processed, null, 2));
```

---

## 🕷️ Web Scraping Patterns

### Configuration-Driven Scraping

```typescript
// Load config
const config = JSON.parse(readFileSync('./config/scrape-list.json'));

// Each site has:
interface Site {
  id: string;
  name: string;
  url: string;
  tier: number;
  difficulty: string;
  expected_events: number;
  crawl_frequency: string;  // "daily" | "weekly" | "bi-weekly"
  pages: string[];          // URLs to scrape
  categories: string[];
  skip?: boolean;           // Mark problematic sites
  notes?: string;
}
```

### Fetch with Timeout & Retry

```typescript
async function fetchHTML(
  url: string,
  userAgent: string,
  timeoutMs: number = 30000,
  retries: number = 2
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,el;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error: any) {
      lastError = error;

      // Don't retry on 404
      if (error.message.includes('HTTP 4')) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}
```

### User-Agent (CRITICAL)

```typescript
// ✅ CORRECT - Use realistic browser
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ❌ WRONG - Gets blocked
const USER_AGENT = 'AthensEventsBot/1.0';
```

### Crawl Frequency Tracking

```typescript
interface CrawlTracker {
  [siteId: string]: {
    last_crawled: string;    // ISO timestamp
    last_success: string;    // ISO timestamp
    total_crawls: number;
    failed_crawls: number;
  };
}

// Check if should crawl
function shouldCrawlSite(site: Site, tracker: CrawlTracker): boolean {
  const lastCrawled = tracker[site.id]?.last_crawled;
  if (!lastCrawled) return true;

  const hoursSince = (Date.now() - new Date(lastCrawled).getTime()) / (1000 * 60 * 60);

  const frequencyMap = {
    'daily': 24,
    'bi-weekly': 84,
    'weekly': 168,
  };

  return hoursSince >= (frequencyMap[site.crawl_frequency] || 24);
}
```

### HTML Storage for Claude Parsing

```typescript
function saveHTMLForParsing(siteId: string, siteName: string, url: string, html: string): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const safeId = siteId.replace(/[^a-z0-9]/gi, '-');
  const filename = `${timestamp}-${safeId}.html`;
  const filepath = `./data/html-to-parse/${filename}`;

  // Save HTML
  writeFileSync(filepath, html, 'utf-8');

  // Save metadata
  const metadata = {
    site_id: siteId,
    site_name: siteName,
    url: url,
    fetched_at: new Date().toISOString(),
    html_length: html.length,
  };
  writeFileSync(filepath.replace('.html', '.json'), JSON.stringify(metadata, null, 2));

  return filepath;
}
```

---

## 🤖 AI Parsing Pattern (FREE with Claude Code)

### Never Use Paid APIs

```typescript
// ❌ WRONG - Costs money
const response = await fetch('https://api.anthropic.com/v1/messages', {
  headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY }
});

// ✅ CORRECT - FREE with Claude Code
// Save data to files, then ask Claude Code to parse
saveHTMLForParsing(siteId, siteName, url, html);
console.log('Ask Claude Code: "Parse the HTML files in data/html-to-parse/"');
```

### AI Prompt Template (for Claude Code)

```typescript
const prompt = `Parse this Athens cultural events newsletter and extract all events.

Email/HTML Content:
${content}

Extract ALL events. For each event, return JSON:
{
  "title": "Event Name",
  "date": "2025-10-25",           // YYYY-MM-DD
  "time": "21:00",                // HH:MM 24-hour
  "venue": "Venue Name",
  "type": "concert",              // concert|exhibition|cinema|theater|performance|workshop
  "genre": "jazz",
  "price": "open",                // "open" or "with-ticket" (NEVER "free")
  "address": "123 Street, Athens",
  "url": "https://example.com",
  "short_description": "Brief description"
}

CRITICAL RULES:
1. Do NOT fabricate information. Only use data provided.
2. Use "open" not "free" for free events
3. Date must be YYYY-MM-DD format
4. Time in 24-hour HH:MM format
5. Return ONLY valid JSON array
`;
```

### Word Count Validation (for enrichment)

```typescript
function validateWordCount(description: string): boolean {
  const wordCount = description.split(/\s+/).length;

  if (wordCount < 380 || wordCount > 420) {
    console.warn(`⚠️  Word count: ${wordCount} (target: 400)`);
    return false;
  }

  return true;
}
```

---

## 📅 Date/Time Patterns

### Always Use Athens Timezone

```typescript
import { DateTime } from 'luxon';

// ✅ CORRECT
const today = DateTime.now().setZone('Europe/Athens').toISODate();

// ❌ WRONG - Uses local timezone
const today = new Date().toISOString().split('T')[0];
```

### Event Date Filtering

```typescript
// Get events for "today"
const today = DateTime.now().setZone('Europe/Athens');
const todayStart = today.startOf('day').toISO();
const todayEnd = today.endOf('day').toISO();

const events = db.prepare(`
  SELECT * FROM events
  WHERE date >= ? AND date < ?
  ORDER BY date, time
`).all(todayStart, todayEnd);
```

---

## 🚨 Error Handling Patterns

### Logging with Emojis

```typescript
console.log('✅ Success');
console.log('🔄 Processing...');
console.log('📥 Loading data');
console.log('🤖 AI processing');
console.warn('⚠️  Warning');
console.error('❌ Error');
console.log('📊 Summary');
console.log('💾 Saved');
console.log('⏭️  Skipping');
console.log('🕷️  Web scraping');
console.log('📧 Email');
console.log('🌐 Website');
```

### Try-Catch Pattern

```typescript
try {
  const result = await riskyOperation();
  console.log('✅ Success:', result);
  return result;
} catch (error) {
  console.error('❌ Failed:', error.message);
  throw new Error(`Operation failed: ${error.message}`);
}
```

### Rate Limiting

```typescript
// Between AI calls (minimum 2 seconds)
for (const event of events) {
  await enrichEvent(event);
  await new Promise(resolve => setTimeout(resolve, 2000));
}

// Between web requests (configurable)
await new Promise(resolve => setTimeout(resolve, config.default_delay_seconds * 1000));
```

---

## 🎨 TypeScript Patterns

### Event Schema

```typescript
interface Event {
  id: string;              // hash(title+date+venue)
  title: string;
  date: string;            // YYYY-MM-DD
  time: string;            // HH:MM (24-hour)
  venue: string;
  type: EventType;
  genre: string;
  price: 'open' | 'with-ticket';  // NEVER "free"
  address: string;
  url: string;
  short_description: string;      // ~100 words
  full_description?: string;      // ~400 words (AI-generated)
  created_at: string;             // ISO timestamp
  updated_at: string;             // ISO timestamp
}

type EventType = 'concert' | 'exhibition' | 'cinema' | 'theater' | 'performance' | 'workshop';
```

### Avoid `any`, Define Interfaces

```typescript
// ❌ WRONG
function processData(data: any) { ... }

// ✅ CORRECT
interface ProcessData {
  title: string;
  date: string;
}
function processData(data: ProcessData) { ... }
```

---

## 🗂️ File Naming Conventions

```
data/emails-to-parse/YYYY-MM-DD-subject-slug.json
data/html-to-parse/YYYY-MM-DD-siteid.html
data/html-to-parse/YYYY-MM-DD-siteid.json (metadata)
```

---

## 📦 NPM Scripts

```json
{
  "scripts": {
    "build": "bun run src/generate-site.ts",
    "fetch-emails": "bun run src/ingest/email-ingestion.ts",
    "scrape-web": "bun run scripts/scrape-websites.ts"
  }
}
```

### Usage

```bash
# Email ingestion
bun run fetch-emails

# Web scraping (all sites)
bun run scrape-web

# Web scraping (force all)
bun run scrape-web --force

# Web scraping (specific site)
bun run scrape-web --site=viva

# Build site
bun run build
```

---

## 🔄 Workflow Summary

### 1. Email Ingestion Workflow

```bash
# Step 1: Fetch emails (automated)
bun run fetch-emails

# Step 2: Parse with Claude Code (manual, FREE)
# Ask: "Parse emails in data/emails-to-parse/ and add events to database"
```

### 2. Web Scraping Workflow

```bash
# Step 1: Scrape websites (automated)
bun run scrape-web

# Step 2: Parse with Claude Code (manual, FREE)
# Ask: "Parse HTML files in data/html-to-parse/ and extract events"
```

### 3. Site Generation Workflow

```bash
# Generate all static pages
bun run build

# Commit and deploy
git add dist/ data/events.db
git commit -m "chore: Daily update $(date +%Y-%m-%d)"
git push origin main  # Netlify auto-deploys
```

---

## 🎯 Critical "Never Do This" List

1. ❌ **Never** use paid AI APIs (Anthropic, OpenAI) - Use Claude Code
2. ❌ **Never** use "free" - Always use "open" for free events
3. ❌ **Never** use local timezone - Always `Europe/Athens`
4. ❌ **Never** fabricate event data in AI prompts
5. ❌ **Never** skip rate limiting (2s minimum between AI calls)
6. ❌ **Never** use bot user-agents - Use realistic browser UA
7. ❌ **Never** ignore 404 errors - Update config or skip site
8. ❌ **Never** hardcode dates - Use `DateTime.now().setZone()`
9. ❌ **Never** commit secrets - Use `.env` file (gitignored)
10. ❌ **Never** delete `dist/` or `data/` - Commit for audit trail

---

## ✅ Best Practices

1. ✅ **Always** validate AI output (word count, required fields)
2. ✅ **Always** use hash-based event IDs for deduplication
3. ✅ **Always** log with emojis for clarity
4. ✅ **Always** handle errors gracefully (try-catch)
5. ✅ **Always** use TypeScript interfaces (no `any`)
6. ✅ **Always** track processed items (emails, URLs)
7. ✅ **Always** use configurable timeouts and retries
8. ✅ **Always** save metadata alongside data files
9. ✅ **Always** commit database and generated files
10. ✅ **Always** follow conventional commit format

---

## 📊 Success Metrics

- **Email Ingestion**: ✅ Working (Gmail IMAP + archiving)
- **Web Scraping**: ✅ Working (4 sites, ~2,700 events)
- **Crawl Tracking**: ✅ Implemented (timestamps, frequency)
- **Timeout Handling**: ✅ Implemented (30s, 2 retries)
- **FREE Parsing**: ✅ Pattern established (Claude Code)
- **Database Schema**: ✅ Defined (SQLite with Bun)

---

**End of Coding Patterns Document**

*For questions or updates, refer to `.claude/CLAUDE.md`*
