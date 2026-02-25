# Code Patterns

Established patterns in Agent Athens codebase.

## Scraper Pattern

All scrapers follow this structure:

```typescript
interface ScrapedEvent {
  title: string;
  description: string;
  startDate: string;       // ISO format
  endDate?: string;        // For exhibitions
  venue: { name: string; address: string; neighborhood?: string };
  price: { type: 'open' | 'with-ticket'; amount?: number };
  genres: string[];
  tags: string[];
  url?: string;
  source: string;          // Always set to source identifier
}

export async function scrapeSourceName(): Promise<ScrapedEvent[]> {
  // 1. Fetch page (direct or Puppeteer)
  // 2. Parse HTML/JSON
  // 3. Map to ScrapedEvent
  // 4. Return array
}
```

## Database Conversion Pattern

Always use `eventToRow()` and `rowToEvent()` for database operations:

```typescript
// Writing: Event → Row
const row = eventToRow(event);
stmt.run(row);

// Reading: Row → Event
const events = rows.map(rowToEvent);
```

## Filter Pattern

Events filter by `location_status`:
- `verified_athens` - Show on site
- `pass_through` - Show on site (multi-venue events)
- `unverified` - Hide until reviewed
- `rejected_non_athens` - Never show

## Date Handling Pattern

Always use Luxon with Europe/Athens timezone:

```typescript
import { DateTime } from 'luxon';
const today = DateTime.now().setZone('Europe/Athens').toISODate();
```

## AI Enrichment Pattern

Claude Code operates interactively - there's no separate API module.
Use Claude Code's tools directly (WebSearch, Read, Write, Edit, etc.):

```typescript
// ❌ WRONG - This module doesn't exist
const { callToolAgent } = await import('../src/enrichment/tool-agent');

// ✅ CORRECT - Claude Code operates interactively
// Scripts should output prompts/data for Claude Code to act on
// Then update config/database based on Claude Code's actions
```

For AI tasks that need automation, design scripts that:
1. Output data for Claude Code to process
2. Accept results back via JSON or direct database updates
3. Never assume an AI API exists - Claude Code IS the AI

## Auto-Verify Venues Pattern

Interactive workflow for verifying venue locations:

```bash
# 1. List unverified venues
bun run scripts/auto-verify-venues.ts --list

# 2. Claude Code uses WebSearch to verify each venue
# 3. Claude Code updates config files directly:
#    - config/athens-venues.json (Athens venues)
#    - config/rejected-locations.json (non-Athens)

# 4. Apply location filter
bun run scripts/filter-athens-only.ts
```

Key principles:
- Scripts list what needs doing, Claude Code does the research
- Update config files, not just database (config is source of truth)
- Always run location filter after config changes

## Venue Variation Pattern

When adding a venue to `config/athens-venues.json`, include these variation types:

```json
{
  "canonical_name": "ΚΠΙΣΝ",
  "variations": [
    "SNFCC",                           // English abbreviation
    "Κέντρο Πολιτισμού Ίδρυμα Σταύρος Νιάρχος",  // Full Greek name
    "Κεντρο Πολιτισμου Ιδρυμα Σταυρος Νιαρχος",  // Without accents
    "Κέντρο Πολιτισμού – Ίδρυμα «Σταύρος Νιάρχος»",  // With guillemets
    "Κέντρο Πολιτισμού – Ίδρυμα &#171;Σταύρος Νιάρχος&#187;"  // HTML entities
  ],
  "neighborhood": "Kallithea"
}
```

**Variation checklist:**
- [ ] English name/abbreviation
- [ ] Full Greek name with accents
- [ ] Greek name WITHOUT accents (scrapers often strip them)
- [ ] Unicode special chars (« » – —)
- [ ] HTML entity equivalents (`&#171;` `&#187;` `&amp;`)
- [ ] Address-appended versions ("Venue, Street 123, Αθήνα, Greece")
- [ ] Event-prefixed versions ("WAVVES Bios Ρομαντσο")

## Venue Review Workflow

1. Run filter: `bun run scripts/filter-athens-only.ts`
2. Analyze unverified venues list
3. Categorize: Athens (add) / Non-Athens (reject) / Special cases (review)
4. Update `config/athens-venues.json` with new venues + variations
5. Update `config/rejected-locations.json` for non-Athens
6. Rerun filter to verify
7. Check results: `sqlite3 data/events.db "SELECT location_status, COUNT(*) FROM events GROUP BY location_status;"`

## Time Extraction Pattern

Use multiple fallback patterns per source. Process in priority order:

```typescript
// Pattern priority (first match wins)
1. Structured data (startTime attribute, JSON-LD startDate with time)
2. Semantic HTML (<time datetime="...">)
3. Greek text patterns ("8.30 μ.μ." → PM format)
4. Generic patterns ("21:00", "Ώρα: 20:30")
```

### Greek Time Normalization

```typescript
// Convert Greek AM/PM to 24-hour
function normalizeGreekTime(hour: number, minute: number, isPM: boolean): string {
  if (isPM && hour < 12) hour += 12;
  if (!isPM && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// Match patterns
const greekPM = /(\d{1,2})(?:[:\.](\d{2}))?\s*μ\.?μ\.?/i;  // 8.30 μ.μ., 8μμ
const greekAM = /(\d{1,2})(?:[:\.](\d{2}))?\s*π\.?μ\.?/i;  // 10 π.μ., 10πμ
```

### Malformed JSON-LD Recovery

Some sites (more.com) produce invalid JSON-LD with unescaped quotes. Use regex fallback:

```typescript
// In page.evaluate() when JSON.parse fails:
try {
  const json = JSON.parse(raw);
  // ... normal processing
} catch (e) {
  // Regex fallback for malformed JSON
  const startDateMatch = raw.match(/"startDate"\s*:\s*\["?([^"\]]+)"?\]/);
  const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)/);

  if (startDateMatch || nameMatch) {
    return {
      '@type': 'Event',
      name: nameMatch ? nameMatch[1] : null,
      startDate: startDateMatch ? [startDateMatch[1]] : null,
      _recovered: true
    };
  }
}
```

### Checking Time Coverage

```sql
-- Time coverage by source
SELECT source,
  SUM(CASE WHEN start_date LIKE '%T%' OR time_doors IS NOT NULL THEN 1 ELSE 0 END) as has_time,
  COUNT(*) as total,
  ROUND(100.0 * SUM(CASE WHEN start_date LIKE '%T%' OR time_doors IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as pct
FROM events WHERE start_date >= date('now')
GROUP BY source ORDER BY total DESC;

-- Time source breakdown
SELECT time_source, COUNT(*) FROM events
WHERE start_date >= date('now')
GROUP BY time_source;
```

## Session Start Pattern

Every Claude Code session should start with:

```bash
# 1. Run diagnostic to see what needs work
./scripts/session-diagnostic.sh

# 2. Use the appropriate pre-check slash command
/project:pre-scrape-check    # Before scraping
/project:pre-enrich-check    # Before enrichment
/project:pre-venue-check     # Before venue config changes
```

The slash commands enforce reading `mistakes.md` and `patterns.md` before starting work — prevents repeating known pitfalls.

## Exhibition-Safe Date Queries

All queries that filter "current/upcoming" events must use:
```sql
WHERE date(COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)) >= date('now')
```
This pattern appears in `session-diagnostic.sh` and should be used everywhere.

## Schema.org Generation (3 paths)

Schema.org is generated in 3 places — each works with a different data shape but must produce consistent output:

| File | Data Type | Used By |
|------|-----------|---------|
| `src/generators/event-page.ts` → `generateEventSchema()` | `Event` (types.ts) | Individual event pages |
| `src/utils/i18n.ts` → `toSchemaOrg()` | `Event` (types.ts) | Listing pages via page.ts |
| `src/enrichment/quality-gates.ts` → `generateSchemaOrg()` | `EventForEnrichment` | Enrichment pipeline |

**SCHEMA_TYPE_MAP** canonical source: `quality-gates.ts`. Imported by `i18n.ts` and `event-page.ts`.

**Pricing pattern** (must be consistent across all 3):
- `isAccessibleForFree`: true for "open"/"donation", false for "with-ticket"
- `offers.price`: "0" for free, amount.toString() for paid, "" if unknown
- `offers.priceCurrency`: always "EUR"
- `offers.availability`: always "https://schema.org/InStock"

## Hreflang Pattern

All page types must include 3 hreflang tags:
```html
<link rel="alternate" hreflang="el" href="[greek URL]">
<link rel="alternate" hreflang="en" href="[/en/ prefixed URL]">
<link rel="alternate" hreflang="x-default" href="[/en/ prefixed URL]">
```

Applied in: `page.ts` (filter pages), `event-page.ts` (event detail), `venue-page.ts` (individual + index).

## Test Sweep Pattern

When quality gate terminology changes (e.g., `FILLER_PHRASES` → `LAZY_ADJECTIVES`, error message "filler" → "lazy adjectives"), **sweep all tests in the same commit**. Check:
- Error message string assertions (`e.includes('filler')` → `e.includes('lazy')`)
- Exported constant content assertions (`toContain('unforgettable experience')` → `toContain('unforgettable')`)
- Test helper word lists — if a word gets added to a rejection list (like "vibrant" added to `LAZY_ADJECTIVES`), test helpers that generate "valid" text must not contain it

## Scroll Lock Pattern (Multiple Overlays)

When multiple components can lock scroll (filter sheets, hamburger menu, modals), never use direct `document.body.style.overflow` manipulation. Instead:

```css
/* Each component gets its own CSS class */
body.scroll-locked,
body.scroll-locked-menu { overflow: hidden; }
```

```javascript
// Filter bar uses:
document.body.classList.add('scroll-locked');
document.body.classList.remove('scroll-locked');

// Hamburger uses:
document.body.classList.add('scroll-locked-menu');
document.body.classList.remove('scroll-locked-menu');
```

CSS keeps scroll locked as long as *either* class is present. No coordination logic needed between scripts.

## Problematic Venue Variants Pattern

Generic venue placeholders come in variants. When adding one to `config/rejected-locations.json` `problematic_entries`, add common synonyms:
- "Live Music Venue" AND "Live Music Space"
- "TBA" (already covered)
- Watch for: "Live Music Hall", "Concert Venue", "Event Space", etc.

## Enrichment v4 Infrastructure Pattern

### SQLite ALTER TABLE Idempotency

SQLite lacks `ADD COLUMN IF NOT EXISTS`. Always check first:

```typescript
const columns = db.prepare("PRAGMA table_info(table_name)").all() as { name: string }[];
const existingCols = new Set(columns.map(c => c.name));

if (!existingCols.has('new_column')) {
  db.run(`ALTER TABLE table_name ADD COLUMN new_column TEXT`);
}
```

### Enrichment Save with Before/After Logging

When saving enriched descriptions, always capture the previous state:

```typescript
// 1. Read current description
const current = db.prepare("SELECT full_description FROM events WHERE id = ?").get(eventId);

// 2. Update event
db.prepare(`UPDATE events SET full_description = ?, needs_enrichment = 0,
  enriched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(newDesc, eventId);

// 3. Log with before/after for rollback
db.prepare(`INSERT INTO enrichment_log (event_id, enrichment_version,
  description_before, description_after, batch_number, session_id)
  VALUES (?, 'v4', ?, ?, ?, ?)`).run(eventId, current.full_description, newDesc, batch, session);
```

### Entity Knowledge UPSERT Pattern

```typescript
db.prepare(`
  INSERT INTO entity_knowledge (entity_type, name, canonical_name, bio, source, ...)
  VALUES (?, ?, ?, ?, ?, ...)
  ON CONFLICT(entity_type, canonical_name) DO UPDATE SET
    bio = COALESCE(excluded.bio, bio),
    source = excluded.source,
    updated_at = datetime('now')
`).run(type, name, name.toLowerCase().trim(), bio, source, ...);
```

### Enrichment v4 CLI Toolchain

```bash
# Gate check a description file
bun run scripts/auto-gate-check.ts temp-descriptions/event.md --tier=premium --event-id=abc123

# Write description + tags
bun run scripts/write-description.ts <event-id> "Description text..."
bun run scripts/write-tags.ts <event-id> Jazz Intimate Metro-accessible

# Batch save to DB (reads temp-descriptions/*.md)
bun run scripts/save-batch.ts --session=feb-2026 --batch=1

# Save entity knowledge
bun run scripts/save-entity.ts --type=artist --name="Name" --bio="..." --confidence=high

# Rollback
bun run scripts/rollback-batch.ts --event-id=<id>
bun run scripts/rollback-batch.ts --batch=1 --session=feb-2026
```

### db.run() for DDL Statements

Use `db.run()` instead of the database execute method for SQL DDL statements. The project security hook falsely flags the SQLite execute method (confusing it with child_process). Both work identically for DDL, but `db.run()` avoids hook warnings.
