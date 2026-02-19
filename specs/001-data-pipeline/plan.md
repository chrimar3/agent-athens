# Technical Plan: Data Pipeline & Quality

**Spec ID:** 001-data-pipeline
**Plan Version:** 1.0
**Created:** 2025-01-20

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DAILY PIPELINE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  FULLY AUTOMATED (launchd @ 8:00 AM)                                  │ │
│  │                                                                        │ │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐   │ │
│  │  │   EMAIL     │    │    WEB      │    │     QUALITY GATES       │   │ │
│  │  │  INGESTION  │───▶│  SCRAPING   │───▶│  ┌─────────────────┐   │   │ │
│  │  │             │    │             │    │  │ Location Filter │   │   │ │
│  │  └─────────────┘    └─────────────┘    │  │   (Athens only) │   │   │ │
│  │                                         │  └────────┬────────┘   │   │ │
│  │                                         │           ▼            │   │ │
│  │                                         │  ┌─────────────────┐   │   │ │
│  │                                         │  │  Deduplication  │   │   │ │
│  │                                         │  │  (normalized)   │   │   │ │
│  │                                         │  └────────┬────────┘   │   │ │
│  │                                         └───────────┼────────────┘   │ │
│  │                                                     ▼                 │ │
│  │                                         ┌─────────────────────────┐   │ │
│  │                                         │      events.db          │   │ │
│  │                                         │  (clean, Athens-only)   │   │ │
│  │                                         └───────────┬─────────────┘   │ │
│  │                                                     ▼                 │ │
│  │                                         ┌─────────────────────────┐   │ │
│  │                                         │    Site Generation      │   │ │
│  │                                         │     (bun run build)     │   │ │
│  │                                         └───────────┬─────────────┘   │ │
│  │                                                     ▼                 │ │
│  │                                         ┌─────────────────────────┐   │ │
│  │                                         │   git push → Netlify    │   │ │
│  │                                         └─────────────────────────┘   │ │
│  │                                                                        │ │
│  │  Result: Site updates daily with ALL verified Athens events           │ │
│  │          (with or without AI descriptions)                            │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PERIODIC SESSION (Claude Code, when you want)                        │ │
│  │                                                                        │ │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │ │
│  │  │    VENUE    │    │     AI      │    │   REBUILD   │               │ │
│  │  │   REVIEW    │    │ ENRICHMENT  │    │  + DEPLOY   │               │ │
│  │  │ (optional)  │    │             │    │             │               │ │
│  │  └─────────────┘    └─────────────┘    └─────────────┘               │ │
│  │                                                                        │ │
│  │  Result: Unverified venues approved, descriptions enhanced            │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Decisions

### Part A: Event Collection

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IMAP Library | `imapflow` | Modern async IMAP for Bun, well-maintained |
| Email Parsing | `mailparser` | Handles MIME, encodings, attachments |
| HTML Parsing | `cheerio` | jQuery-like, already in project |
| State Storage | JSON files | Simple, no external dependencies |

### Part B: Data Quality Gates

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Venue Matching | Case-insensitive substring | Handles variations like "Six Dogs" vs "SIX D.O.G.S" |
| Location Check | Title + venue fields | Non-Athens cities usually mentioned explicitly |
| Dedup Normalization | Remove quotes, collapse spaces, lowercase | Handles observed duplicate patterns |
| Unknown Venues | Import as 'unverified', hide from site | Conservative approach, manual review |

### Part C: Enrichment Workflow

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI Runtime | Claude Code tool_agent | Free with Max subscription |
| Description Length | 150-300 words | Content-focused, not word-count-focused |
| Validation | Structure check + forbidden phrases | Ensures citation-worthy output |
| Rate Limiting | 2 second delay | Prevents overwhelming, allows interruption |

### Part D: Automated Deployment

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scheduler | macOS launchd | Catches up on missed jobs after sleep |
| Script | Bash shell | Simple, no runtime dependencies for automation |
| Commit Strategy | Auto-commit with counts | Traceable daily updates |

---

## Component Architecture

### Directory Structure

```
agent-athens/
├── src/
│   ├── ingest/
│   │   ├── email-ingestion.ts        # IMAP fetch
│   │   ├── email-parser.ts           # Route to format parsers
│   │   └── newsletter-formats/       # Per-newsletter parsers
│   │       ├── this-is-athens.ts
│   │       ├── lifo-guide.ts
│   │       └── index.ts
│   ├── quality/
│   │   ├── location-filter.ts        # Athens verification
│   │   ├── deduplication.ts          # Normalized matching
│   │   └── venue-matcher.ts          # Whitelist/blacklist + auto-merge
│   ├── enrichment/
│   │   ├── enrichment-queue.ts       # Queue management
│   │   ├── description-generator.ts  # Prompt + validation
│   │   └── word-counter.ts           # Validation utility
│   ├── db/
│   │   └── database.ts               # Extended with new columns
│   └── utils/
│       └── normalize.ts              # Title/venue normalization
├── scripts/
│   ├── daily-automated.sh            # launchd script (full pipeline)
│   ├── daily-manual.ts               # Claude Code session commands
│   ├── ingest-emails.ts              # Standalone email fetch
│   ├── parse-emails.ts               # Standalone parsing
│   ├── list-unenriched.ts            # Queue inspection
│   ├── run-enrichment-pipeline.ts              # Batch enrichment
│   └── review-venues.ts              # Venue verification CLI
├── config/
│   ├── athens-venues.json            # Whitelist (78 venues + variations + neighborhoods)
│   ├── rejected-locations.json       # Blacklist (21 cities + 4 regions + 10 venues + 8 problematic)
│   ├── newsletter-formats.json       # Parsing rules
│   └── orchestrator-config.json      # Pipeline settings
├── data/
│   ├── events.db                     # SQLite database
│   ├── emails-to-parse/              # Incoming emails
│   ├── emails-unparseable/           # Failed parsing
│   ├── processed-emails.json         # Email tracking
│   ├── rejected-events.json          # Rejection log
│   └── pipeline-state.json           # Daily run state
└── tests/
    ├── quality/
    │   ├── location-filter.test.ts
    │   └── deduplication.test.ts
    ├── ingest/
    │   ├── email-ingestion.test.ts
    │   └── email-parser.test.ts
    └── enrichment/
        └── description-generator.test.ts
```

---

## Data Model

### Database Migration: 001_pipeline_extensions.sql

```sql
-- Location filtering
ALTER TABLE events ADD COLUMN location_status TEXT DEFAULT 'unverified';
CREATE INDEX idx_events_location_status ON events(location_status);

-- Enrichment tracking
ALTER TABLE events ADD COLUMN needs_enrichment INTEGER DEFAULT 1;
ALTER TABLE events ADD COLUMN enriched_at TEXT;

-- Source tracking
ALTER TABLE events ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE events ADD COLUMN source_id TEXT;

-- Update existing events
UPDATE events 
SET location_status = 'verified_athens',
    needs_enrichment = 0,
    enriched_at = datetime('now'),
    source = 'legacy'
WHERE full_description IS NOT NULL 
  AND length(full_description) > 100;

-- Rejected events tracking
CREATE TABLE IF NOT EXISTS rejected_events (
    id TEXT PRIMARY KEY,
    title TEXT,
    venue TEXT,
    date TEXT,
    source TEXT,
    rejection_reason TEXT,
    rejected_at TEXT NOT NULL
);

-- Processed emails tracking
CREATE TABLE IF NOT EXISTS processed_emails (
    message_id TEXT PRIMARY KEY,
    from_address TEXT,
    subject TEXT,
    received_at TEXT,
    processed_at TEXT NOT NULL,
    event_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',
    error_message TEXT
);
```

---

## Config Files

### config/athens-venues.json

```json
{
  "version": "1.0",
  "venues": [
    {
      "canonical_name": "Six D.O.G.S",
      "variations": ["Six Dogs", "6 D.O.G.S", "6 Dogs", "SIXDOGS"],
      "neighborhood": "Monastiraki"
    },
    {
      "canonical_name": "Gazarte",
      "variations": ["GAZARTE", "Γκαζάρτε"],
      "neighborhood": "Gazi"
    },
    {
      "canonical_name": "Stavros Niarchos Foundation Cultural Center",
      "variations": ["SNFCC", "ΚΠΙΣΝ", "Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος"],
      "neighborhood": "Kallithea"
    }
  ],
  "neighborhoods": [
    "Μοναστηράκι", "Monastiraki",
    "Γκάζι", "Gazi", 
    "Ψυρρή", "Psyrri",
    "Εξάρχεια", "Exarchia",
    "Πειραιάς", "Piraeus",
    "Κηφισιά", "Kifisia",
    "Γλυφάδα", "Glyfada",
    "Μαρούσι", "Marousi",
    "Αθήνα", "Athens"
  ]
}
```

### config/rejected-locations.json

```json
{
  "version": "1.0",
  "cities": [
    {"greek": "Θεσσαλονίκη", "latin": "Thessaloniki"},
    {"greek": "Πάτρα", "latin": "Patras"},
    {"greek": "Ηράκλειο", "latin": "Heraklion"},
    {"greek": "Πτολεμαΐδα", "latin": "Ptolemaida"},
    {"greek": "Βέροια", "latin": "Veria"},
    {"greek": "Λάρισα", "latin": "Larissa"},
    {"greek": "Βόλος", "latin": "Volos"},
    {"greek": "Ιωάννινα", "latin": "Ioannina"},
    {"greek": "Κοζάνη", "latin": "Kozani"},
    {"greek": "Ρόδος", "latin": "Rhodes"},
    {"greek": "Μύκονος", "latin": "Mykonos"},
    {"greek": "Σαντορίνη", "latin": "Santorini"}
  ],
  "regions": [
    {"greek": "Χαλκιδική", "latin": "Halkidiki"},
    {"greek": "Κρήτη", "latin": "Crete"}
  ]
}
```

---

## Quality Gate Logic

### Location Filter Flow

```typescript
function checkLocation(event: RawEvent): LocationResult {
  const { title, venue } = event;
  const combined = `${title} ${venue}`.toLowerCase();
  
  // Step 0: Check pass-through venues (bypass verification)
  // These are valid entries that aren't real venues (e.g., "Πολλαπλοί Χώροι" = "Multiple Venues")
  for (const passThrough of whitelist.pass_through_venues) {
    if (normalizeVenue(event.venue) === normalizeVenue(passThrough)) {
      return { status: 'pass_through', reason: 'Not a real venue but allowed on site' };
    }
  }
  
  // Step 1: Check blacklist (reject known non-Athens)
  for (const city of blacklist.cities) {
    if (combined.includes(city.greek.toLowerCase()) || 
        combined.includes(city.latin.toLowerCase())) {
      return { status: 'rejected_non_athens', reason: `Contains ${city.latin}` };
    }
  }
  
  // Step 1b: Check problematic entries (flag for review)
  for (const prob of blacklist.problematic_entries.entries) {
    if (normalizeVenue(event.venue) === normalizeVenue(prob.name)) {
      return { status: 'problematic', reason: prob.reason };
    }
  }
  
  // Step 2: Check whitelist (approve known Athens + auto-merge to canonical)
  for (const venueConfig of whitelist.venues) {
    const allNames = [venueConfig.canonical_name, ...venueConfig.variations];
    for (const name of allNames) {
      if (normalizeVenue(event.venue).includes(normalizeVenue(name))) {
        return { 
          status: 'verified_athens', 
          matched_venue: venueConfig.canonical_name,  // Auto-merge to canonical
          neighborhood: venueConfig.neighborhood
        };
      }
    }
  }
  
  // Step 3: Check neighborhoods
  for (const hood of whitelist.neighborhoods) {
    if (combined.includes(hood.toLowerCase())) {
      return { status: 'verified_athens', reason: `Neighborhood: ${hood}` };
    }
  }
  
  // Step 4: Unknown - flag for review
  return { status: 'unverified', reason: 'Unknown venue' };
}
```

### Venue Auto-Merge Logic

When an event matches a variation, store the `canonical_name` instead:

```typescript
// Example: "Gazarte - Ground Stage" → stored as "Gazarte"
// Example: "Κύτταρο Live" → stored as "Κύτταρο"
// Example: "Μέγαρο Μουσικής" → stored as "Μέγαρο Μουσικής Αθηνών"

function normalizeVenueForStorage(venue: string, whitelist: Whitelist): string {
  for (const venueConfig of whitelist.venues) {
    const allNames = [venueConfig.canonical_name, ...venueConfig.variations];
    for (const name of allNames) {
      if (normalizeVenue(venue).includes(normalizeVenue(name))) {
        return venueConfig.canonical_name;
      }
    }
  }
  return venue; // Unknown venue, keep as-is
}
```

### Deduplication Flow

```typescript
function normalizeForDedup(text: string): string {
  return text
    .replace(/[«»""„'']/g, '')     // Remove all quote variants
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .toLowerCase()
    .trim();
}

function generateEventId(title: string, date: string, venue: string): string {
  const normTitle = normalizeForDedup(title);
  const normVenue = normalizeForDedup(venue || 'unknown');
  const normDate = new Date(date).toISOString().split('T')[0];
  
  return hash(`${normTitle}|${normDate}|${normVenue}`);
}

function shouldSkipGeneric(title: string, existingEvents: Event[]): boolean {
  // Skip "RELEASE ATHENS 2026" if "RELEASE ATHENS 2026 / Nick Cave" exists
  const normalized = normalizeForDedup(title);
  return existingEvents.some(e => 
    normalizeForDedup(e.title).startsWith(normalized) &&
    normalizeForDedup(e.title).length > normalized.length
  );
}
```

---

## Enrichment Prompt Template

```markdown
Write a description for this Athens cultural event optimized for AI answer engines to quote.

**Event:**
- Title: {title}
- Date: {date}
- Time: {time}
- Venue: {venue}
- Type: {type}
- Genre: {genre}
- Price: {price}

**Structure (follow this order):**

1. **Opening fact (1 sentence):** State what, who, where, when in a single quotable sentence.
   Example: "Jazz quartet The Athenians perform at Six D.O.G.S in Monastiraki on Saturday January 25th at 9 PM."

2. **The performer/exhibition (2-3 sentences):** Who they are, their significance, what they're known for. Only verified facts — if unknown, focus on the genre/style instead.

3. **The experience (2-3 sentences):** What attendees will see/hear/feel. The venue's character if notable.

4. **Practical close (1-2 sentences):** Ticket price, how to get them, any important details.

**Rules:**
- Total: 150-300 words
- First sentence MUST be independently quotable by AI engines
- NO filler phrases ("Whether you're a music lover...", "Don't miss this chance...")
- NO superlatives ("incredible", "amazing", "unforgettable")
- NO fabricated quotes or facts
- Write in English

**Output:** The description only, no preamble.
```

---

## launchd Configuration

### com.agentathens.daily.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.agentathens.daily</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/agent-athens/scripts/daily-automated.sh</string>
    </array>
    
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    
    <key>StandardOutPath</key>
    <string>/path/to/agent-athens/logs/daily.log</string>
    
    <key>StandardErrorPath</key>
    <string>/path/to/agent-athens/logs/daily.error.log</string>
    
    <key>WorkingDirectory</key>
    <string>/path/to/agent-athens</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
```

**Key feature:** launchd automatically runs missed jobs when the machine wakes from sleep.

---

## Error Handling Strategy

| Phase | Error | Handling | Recovery |
|-------|-------|----------|----------|
| Email Ingestion | IMAP connection failure | Retry 3x with backoff | Log, continue to scraping |
| Email Ingestion | Auth failure | Fail immediately | Alert operator |
| Email Parsing | Unknown format | Move to unparseable/ | Manual review |
| Location Filter | Match failure | Default to 'unverified' | Manual review |
| Deduplication | Hash collision | Update existing | Keep newer data |
| Site Generation | Build failure | Abort pipeline | No deploy |
| Deployment | Git push failure | Retry once | Log, manual intervention |

---

## Testing Strategy

### Unit Tests

| Module | Test Focus | Coverage Target |
|--------|------------|-----------------|
| normalize.ts | Quote removal, whitespace, Greek | 95% |
| location-filter.ts | Whitelist, blacklist, unknown | 90% |
| deduplication.ts | Normalization, hash consistency | 90% |
| description-generator.ts | Prompt building, validation | 85% |

### Integration Tests

| Test | Description |
|------|-------------|
| Import pipeline | Email → Parse → Quality → DB |
| Location accuracy | Known Athens vs non-Athens samples |
| Dedup accuracy | Known duplicate pairs |
| Full daily pipeline | Automated phases end-to-end |

---

*Plan complete. Ready for tasks.*
