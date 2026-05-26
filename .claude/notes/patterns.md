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

### Raw Identifiers in data-* Attributes

When templates emit `data-*` attributes that will be consumed by downstream code (e.g., a `/saved/` page that constructs URLs), always store the **raw identifier** (bare slug, bare ID), not the pre-prefixed form (like `/events/slug/`). If the consumer adds a prefix, the emitter must NOT. Otherwise you get double-prefixing. Applies to any value shared between build-time templates and client-side hydration scripts.

### Three-Layer Filtering (for venues with non-event programming)

When a venue hosts both cultural events AND non-event content (sports, tours, facilities), use this stack:

1. **URL pattern filter** — Only accept `/event/` URLs, reject `/venue/`, `/episkepsi/`, etc.
2. **Title regex exclusion** — Catch sports, tours, fountains, camps, open calls by keyword
3. **Category exclusion** — Never scrape entire categories that aren't cultural (sports, tours)

Pattern is reusable for any venue with mixed content (e.g., Technopolis has Industrial Gas Museum tours alongside concerts).

### Category-First Scraping

When a source has per-category pages (WordPress taxonomy archives, etc.), scrape categories first for accurate type classification, then use the main listing page as fallback. Category pages give authoritative types without keyword guessing.

Order: category pages → main events page (only adds events not already found in categories)

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
WHERE COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
```
This pattern appears in `session-diagnostic.sh`, `cleanup-old-images.ts`, and all pipeline scripts.

### UPCOMING_FILTER Constant Pattern

For scripts with many date-filtered queries (like `remove-duplicates.ts` with 20+ queries), define a constant:

```typescript
const UPCOMING_FILTER = `COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')`;

// Then use in template literals:
const events = db.prepare(`SELECT * FROM events WHERE ${UPCOMING_FILTER}`).all();
```

This prevents drift — one definition, many usages. Easy to grep for consistency checks.

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
- `offers.price`: "0" for free, amount.toString() for paid, **omitted** if unknown (never empty string — invalid per Schema.org)
- `offers.priceCurrency`: always "EUR"
- `offers.availability`: always "https://schema.org/InStock"

**Timezone discipline**: Any code path that emits Schema.org `startDate` must normalize to include timezone offset (`+02:00`/`+03:00`). Use `getAthensTimezone()` from `quality-gates.ts`. Known paths: `event-page.ts`, `page.ts` (hub schemas), `venue-page.ts`. When adding a new page type that emits dates, add timezone normalization at creation time — don't rely on the post-build validator to catch it later.

**Multi-block JSON-LD extraction**: Use `extractAllJsonLd()` in `schema-completeness.ts` for pages with multiple JSON-LD blocks (hub pages: CollectionPage + FAQPage; event pages may gain performer + event blocks). Single-block `extractJsonLd()` still exists but only for legacy event validation.

## Hreflang Pattern

All page types must include 3 hreflang tags:
```html
<link rel="alternate" hreflang="el" href="[greek URL]">
<link rel="alternate" hreflang="en" href="[/en/ prefixed URL]">
<link rel="alternate" hreflang="x-default" href="[/en/ prefixed URL]">
```

Applied in: `page.ts` (filter pages), `event-page.ts` (event detail), `venue-page.ts` (individual + index).

## Locale-Aware URL Emission Pattern

URL-bearing meta fields (canonical, og:url, JSON-LD `url` / `@id`) must be derived **locale-aware at the emission point**, not patched post-render. Reference shape (used by `event-page.ts:411` and `templates/page.ts:461,511`):

```typescript
const urlPrefix = locale === 'en' ? 'en/' : '';
// then:
`${BASE_URL}/${urlPrefix}${slug}`
```

**Why:** post-render regex-patches (like the old `hub-page.ts:376-378` canonical override) only fix the field they target; sibling fields in the same template silently drift. Patching downstream is a one-field operation; emitting locale-aware is template-wide. The D11 sweep on 2026-05-12 caught a 3-month drift between canonical (patched) and og:url + JSON-LD `CollectionPage.url` (unpatched) — see mistakes.md.

**Greek is the unprefixed default.** Never prepend `/el/`. The hreflang=el alternate always points at the bare path. Only `locale === 'en'` produces a prefix.

**Do not switch to `src/utils/locale-url.ts`** for these emission sites unless you also touch every Greek caller. The helper returns trailing-slashed paths (`/en/this-weekend/`), while the existing templates produce no-trailing-slash URLs (`https://agentathens.com/this-weekend`); a wholesale switch would change Greek-side output (shotgun surgery).

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

## Subagent Enrichment Pattern

### Brief Generation
```bash
bun scripts/generate-enrichment-brief.ts --count=5
# → temp-briefs/batch-N.md
```

### Spawning a Subagent
The parent reads the brief file and passes its contents as the Task tool prompt. Key elements:
1. Set working directory explicitly: "Your working directory is: /Users/chrism/Project with Claude/AgentAthens/agent-athens"
2. Tell subagent to read exemplars and anti-patterns FIRST
3. Provide execution instructions with exact CLI commands
4. Request a batch-review.md summary at the end

### Token Budget
- Brief itself: ~300-700 words (~250-535 tokens)
- Subagent total usage: ~20K tokens per event (research + writing + gate checks)
- 2-event batch: ~71K tokens, ~4 min
- 5-event batch: ~103K tokens, ~7.8 min (lower than estimate — efficient web search caching)

### What the Parent Receives Back
A text summary only — not individual tool calls. The summary includes:
- Research findings
- Gate scores
- Files created
- Decisions made
- An agentId for resuming

### Calibration Workflow
```
HUMAN: "Enrich next batch"
PARENT: bun scripts/generate-enrichment-brief.ts --count=5
PARENT: Task tool → general-purpose subagent with brief
  → subagent: WebSearch, write descriptions, gate check
  → ALL output → temp-descriptions/ (no auto-save)
PARENT: receives summary
HUMAN: reviews descriptions in temp-descriptions/
  → edits if needed
  → updates calibration-log.md
  → bun scripts/save-batch.ts --batch=N for approved descriptions
```

### Steady-State (Soft Auto-Save) Workflow
```
PARENT: archive temp-descriptions/*.md → archive/
PARENT: bun scripts/generate-enrichment-brief.ts --count=5
PARENT: quick pre-flight (≥3 types? exhibition? token budget?)
PARENT: Task tool → general-purpose subagent with brief
  → subagent: WebSearch, write descriptions, gate check, write tags
  → if all scores ≥85: subagent runs save-batch.ts (AUTO-SAVE)
  → creates batch-N-review.md with "AUTO-SAVED" or "LEFT FOR REVIEW"
PARENT: receives summary
PARENT: spot-check (read openings, check one credentials, note diversity)
  → ~2 min vs ~10 min full review
```

### Throughput Data (Sessions 1-3)
- Calibration (session 1): 2 batches, 10 events, ~245K tokens, ~18 min subagent time
- Steady-state (session 2): 3 batches, 15 events, ~301K tokens, ~24 min subagent time
- Post-fix validation (session 3): 3 batches, 15 events, ~310K tokens, ~24 min subagent time
- Per-event average: ~20K tokens, ~5 min (includes research + writing + gate check + tags)
- Parent overhead: ~5 min per batch (generate brief + spot-check)
- Three-batch session total: ~40 min (parallel subagent + parent work)

### Post-Fix Gate Score Analysis (Session 3)
- Average post-save score: 89.5/100 (batches 8-10)
- Pre-save scores: 84-85 (infrastructure false positives: schema, tags, last_verified, practical block)
- Post-save scores: 89-90 (save-batch.ts populates infrastructure fields, eliminating deductions)
- Tag taxonomy expansion had minimal direct scoring impact (~0.1-0.5 point improvement)
- The 89-90 ceiling appears structural: gate checker deducts for timeliness hooks even when present (keyword pattern matching doesn't always detect contextual timeliness)

### Type Mismatch Pattern (Persistent)
Despite categorizer fixes, type mismatches remain at ~33% (5/15 in session 3):
- **Venue-lock mismatches**: Kafetheatro→theater (for pop concerts), Temple→dj_set (for metal fests), Concert #1→classical (for world/jazz)
- **Fallback-preserved scraper types**: Viva la mamma! scraped as sports, By Heart scraped as exhibition
- **Missing keyword categories**: meetup, conference not in categorization-keywords.json despite existing as EventType
- Fix path: Add meetup/conference keyword rules; move more venues to mixed_venues when evidence of multi-type usage emerges

### Sensory Extrapolation vs Fabrication Boundary
The line between acceptable and fabricated venue details:
- **Acceptable**: Inferring "smoke note" from a Michelin-documented wood-fire kitchen. The fact is verified; the sensory experience is a reasonable deduction.
- **Fabrication**: Inventing "kitchen smoke and retsina from barrels" when no source confirms the venue has a kitchen or serves retsina.
- **Rule**: Extrapolate from verified facts → OK. Invent from nothing → violation.
- **When in doubt**: Open with the event's sound, performer's first action, or audience energy.

### Structural Repetition — Solved by Rules 15-16
Rules 15-16 eliminated structural repetition across 10 descriptions (batches 2-3):
- Sound-first openings: 60% (batch 1) → 20% (batches 2-3)
- "Combination" closers: 40% (batch 1) → 0% (batches 2-3)
- Cross-batch distribution (10 events): 4 action, 3 visual, 2 sound, 1 space
- All 10 closers use distinct structural devices

### Two-Batch Session Pattern
Running two consecutive 5-event batches in one session works without quality degradation:
- Each subagent gets fresh context (no cross-contamination)
- Parent review quality maintained across both batches
- Archive → generate → spawn → review → save cycle takes ~15 min per batch
- Token cost: ~120K per 5-event batch (~24K/event average)
- Total session: ~245K tokens for 10 events

### Exhibition Enrichment Requires Extra Steps
When a batch includes exhibitions:
1. Research end_date (exhibitions run weeks/months)
2. Use Format/Access rows in details table (not Sound/Door)
3. After save-batch.ts, manually UPDATE events SET end_date = 'YYYY-MM-DD' if not already in DB
4. Verify exhibition-safe date queries still work

## Venue Categorization Pattern

`venue_type_map` for single-type venues (all events get the same type). `mixed_venues` for multi-type venues (events analyzed by keywords).

**When to use venue_type_map**: Only when a venue hosts exactly ONE event type. All DJ clubs (Astron, Dybbuk, SMUT), all theaters (Θέατρο Παλλάς, Θέατρο Νους), museums (Μουσείο Μπενάκη).

**When to use mixed_venues**: Any venue that hosts 2+ event types. Megaron (classical + concert + dance + theater), Rabbithole (dj_set + theater), GNO (opera + dance), Christmas Theater (concerts + theater + sports), all multi-purpose cultural centers.

**Sports keyword specificity**: Generic words like "fight", "πάλη", "round", "ring" match hundreds of non-sports events in Greek cultural context. Use multi-word phrases ("fight night", "boxing match", "combat sports") and place sports low in priority order.

## Tag Taxonomy Sync Pattern

Code `TAG_TAXONOMY` in `description-generator.ts` is the runtime validation source. Template doc `MASTER-ENRICHMENT-TEMPLATE.md` is the subagent guidance source. Both must stay in sync. When subagents write tags that generate warnings in `write-tags.ts`, expand the code taxonomy — don't narrow the template.

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

## Event Detail Page Pattern

The event detail page (`event-page.ts`) generates static HTML for `/events/[slug]/`.

### GEO Source Order
Content follows **facts-first** order for AI crawler citability:
```
<article>
  Hero (blurred background + title + date)
  ├── Practical block (structured facts table)
  ├── Description (narrative, truncated with read-more)
  ├── Inline CTA (tickets or "Ελεύθερη είσοδος")
  ├── Venue section
  ├── Source attribution
  ├── Connections (genres/neighborhood)
  └── Related events
  Mobile bottom bar (fixed CTA, <768px only)
</article>
```

### CTA Rendering Rules
- **Paid + ticket URL**: Link button → "Αγοράστε εισιτήρια →"
- **Open entry**: Informational text → "Ελεύθερη είσοδος" (never "Δωρεάν")
- **Past events**: No CTA at all (inline hidden, mobile bar hidden)
- Color: `var(--accent-primary)` — no per-type color

### Past-Event Treatment (CSS-only via `data-past`)
```html
<article data-past="true">
```
CSS selectors handle everything — no JS needed:
- `[data-past="true"] .edp-hero-bg` → dimmed + grayscale
- `[data-past="true"] .edp-inline-cta` → hidden
- `[data-past="true"] .edp-mobile-bar` → hidden

### Mobile Bottom Bar
- z-index: `var(--z-bottom-bar)` (150) — above content, below modals
- Visibility: IntersectionObserver on hero CTA triggers show/hide
- Hidden for past events via `[data-past="true"]`

## CLI Enrichment via `claude -p` Pattern

### Basic Command
```bash
cd ~/Project\ with\ Claude/AgentAthens/agent-athens
BRIEF=$(ls -t temp-briefs/batch-*.md | head -1)
claude -p "$(cat "$BRIEF")" \
  --output-format text \
  --allowedTools "Bash Read Write WebSearch Glob Grep WebFetch"
```

### Key Behaviors
- `-p` / `--print` runs non-interactively with full tool access
- **`--allowedTools` is mandatory** — without it, tool calls are silently blocked (no human to approve)
- Output goes to stdout; file writing happens via Bash tool calls (bun scripts)
- From inside Claude Code: set `CLAUDECODE=` to bypass nested session detection
- From cron/shell scripts: no bypass needed (no parent CC session to detect)
- Brief size: tested up to 9.7KB (~1074 tokens) without truncation

### Permission Model
In `-p` mode, tools must be pre-approved via `--allowedTools`. The enrichment workflow needs:
- `Bash` — runs bun scripts (write-description, gate-check, save-batch)
- `Read` — reads exemplars, anti-patterns, venue intel
- `Write` — creates description files in temp-descriptions/
- `WebSearch` — researches events, artists, venues
- `Glob`, `Grep` — finds files in codebase
- `WebFetch` — fetches event page content

### Quality Validation
CLI-produced descriptions match interactive quality:
- Gate score: 84 pre-save → 89 post-save (same as subagent enrichment)
- All 8 sections present, no fabrication, proper credentials verification
- The 84→89 gap is infrastructure metadata (Schema.org, tags, last_verified) populated by save-batch.ts

### Auto-Enrich Pipeline Pattern
```bash
# Standalone
./scripts/auto-enrich.sh           # Runs enrichment (3 batches of 3)
./scripts/auto-enrich.sh --dry-run # Shows what would run

# In daily pipeline (daily-automated.sh)
# Phase 3e-auto: runs after enrichment_sync, before time_enrichment
# Non-fatal: returns 0 even on failure (Article VII)
```

Flow: kill stale processes → acquire lock → check queue >= 3 → clean old briefs → sync queue → generate briefs → run claude -p per batch (sequential with watchdog timeout) → report results → release lock.

### POSIX-Portable Timeout Pattern (macOS-safe)

macOS lacks `timeout` / `gtimeout`. Never use `perl -e "alarm N; exec @ARGV"` — `exec` replaces the process image and the alarm handler is lost. Instead:

```bash
# Run command in background
"$CMD" "$ARGS" &
CMD_PID=$!

# Watchdog: kill after N seconds
( sleep "$TIMEOUT" && kill "$CMD_PID" 2>/dev/null ) &
TIMER_PID=$!

# Wait for command (or its death by watchdog)
wait "$CMD_PID" && EXIT_CODE=0 || EXIT_CODE=$?

# Cancel watchdog if command finished first
kill "$TIMER_PID" 2>/dev/null || true
wait "$TIMER_PID" 2>/dev/null || true
```

Under `set -euo pipefail`, guard all `kill`/`wait` with `|| true` — the PID may already be dead.

### Lock File Pattern (PID-based)

```bash
LOCK_FILE="$PROJECT_DIR/.auto-enrich.lock"
if [[ -f "$LOCK_FILE" ]]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
        echo "Already running (PID $LOCK_PID). Skipping."
        exit 0
    else
        rm -f "$LOCK_FILE"  # Stale lock, owner dead
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT
```

`kill -0` checks if a PID exists without sending a signal — handles crashes where trap didn't fire.

### Auto-Enrich Reliability Layers

Defense-in-depth for unattended enrichment:

1. **Lock file** — prevents overlapping runs
2. **Stale process cleanup** — recovers from previous crashes
3. **Watchdog timeout** — prevents infinite hangs
4. **Adequate timeout value** — doesn't kill healthy runs
5. **daily-enrichment-check.sh** — alerts on failure (human escalation)

**Escalation rule:** If enrichment warning fires 2+ consecutive days → treat as critical, investigate same day.

## Geocoding Utility Pattern

### Architecture
`src/utils/geocode.ts` — Nominatim-based, config-driven for multi-city support.

```typescript
import { geocodeVenue, ATHENS_CONFIG } from '../src/utils/geocode';

const result = await geocodeVenue('Μέγαρο Μουσικής Αθηνών', ATHENS_CONFIG);
// → { lat: 37.976, lon: 23.749, confidence: 'high', source: 'nominatim' }
```

### Key Design Decisions
- **Bounding box validation** — GeocodeConfig contains minLat/maxLat/minLon/maxLon. Results outside box are rejected.
- **Confidence tiers** — high (POI: amenity/tourism/building), medium (street/neighborhood), low (city-level, always rejected).
- **Rate limiting** — 1.1s between requests (Nominatim TOS). State is module-level, reset via `_resetRateLimit()` for tests.
- **Fallback queries** — "Venue, Athens, Greece" → "Venue, Αθήνα" → bare name with countrycodes filter.
- **Skip patterns** — "Πολλαπλοί Χώροι", "TBA", "Online", "Livestream" bypassed.

### Batch Script
```bash
bun run scripts/geocode-missing-venues.ts --dry-run         # Preview
bun run scripts/geocode-missing-venues.ts                    # Live + backfill
bun run scripts/geocode-missing-venues.ts --confidence=high  # Strict mode
bun run scripts/geocode-missing-venues.ts --limit=20         # Cap count
```

### Pipeline Integration
In `daily-automated.sh`, Phase 3j (after image download, before site generation):
- Uses `--confidence=high` for automated runs (no manual review)
- Non-fatal: pipeline continues if geocoding fails

### Backfill GROUP BY Caveat
The `backfill-venue-geo.ts` script groups by venue_name to check if geo update is needed, but SQLite returns an arbitrary row's venue_lat for the group. If *some* events for a venue have geo and others don't, the backfill may skip the group. Workaround: run a direct SQL propagation after backfill to copy geo from events that have it to same-venue events that don't.

Key constraints:
- Absolute path for claude binary (launchd has minimal PATH)
- Sequential execution (avoids SQLite WAL locking)
- Clean temp-briefs/ before generating (prevents stale re-processing)
- MAX_BATCHES=3 cap (15 events/day, rate limit safety)

## Hub Page 5-Part Structure

Hub pages (`src/generators/hub-page.ts`) inject 5 sections into base page HTML:

1. **Answer Capsule** — 40-60 word direct answer, `hub-answer-capsule` class, accent-primary left border (context 5/5), bg-surface background
2. **Comparison Table** — Max 20 rows, `hub-comparison-table` class, all `<th>` have `scope="col"` (WCAG), horizontal scroll wrapper for mobile
3. **Event Blocks** — Max 8 enriched events with 2-sentence excerpts, `hub-event-block` class
4. **FAQ Accordion** — Native `<details>/<summary>`, chevron rotation via CSS borders, FAQPage JSON-LD schema, `hub-faq` class
5. **Seasonal Narrative** — Placeholder, hidden when empty

Config: `config/hub-pages.json` (16 hubs). Type: `HubConfig` in `src/types.ts`.

### Hub Truncation + Overflow Pages (S67)
- `HUB_EVENT_LIMIT = 30` — caps card-grid + ItemList schema at 30
- Editorial sections (capsule, table, blocks) use full `filteredEvents` (own caps)
- Hubs > 30 events get a "See all N events →" link → `/slug/all/`
- Overflow pages: noindex, no filter bar, back-link navigation
- NOT in sitemap (no `generatedUrls.push()`)

## Isolation:isolate Checklist

When adding a new component with `z-index`, add `isolation: isolate` to create a scoped stacking context. Current components (S68):
- `.event-card`, `.feature-card`, `.related-event-card` (cards)
- `.site-header`, `.filter-bar`, `.search-overlay` (chrome)
- `.mobile-overlay`, `.mobile-menu` (mobile nav)
- `.edp-hero` (event detail page)

### FAQ Accordion ARIA Pattern

Uses native `<details>/<summary>` — no manual `aria-expanded` needed (browser handles it). CSS chevron via `::after` pseudo-element with border-right + border-bottom rotated 45deg (closed) / -135deg (open). Reduced-motion fallback disables transition.

## Venue Geo Research Workflow

When adding new venues to `data/venues-master.json`:

1. **Find candidates**: `bun run scripts/backfill-venue-geo.ts --report` → shows unmatched venues by event count
2. **Research priority**: Highest event count first (7→6→5→4→3→2→1)
3. **Best sources for Athens venue coordinates** (in order of reliability):
   - `stigmap.gr` — embed map pages contain `lat=X; lng=Y;` in source code
   - `athinorama.gr` — theater/venue pages often embed coordinates in map widgets
   - `elculture.gr` — venue pages contain lat/lng data attributes
   - `mapcarta.com` — OpenStreetMap-based, good for well-known venues
   - `vrisko.gr` / `xo.gr` — Greek Yellow Pages, confirm addresses
4. **Validation**: lat 37.9-38.1, lng 23.6-23.8 (Athens metro range)
5. **JSON format**: field is `lng` (not `lon`). Neighborhood is free-form string.
6. **Name mismatches**: When DB uses different Greek script than master key, add alias entry with same geo data
7. **Skip list**: Multi-venue designations (`Πολλαπλοί Χώροι`), unverifiable venues
8. **After adding**: Validate JSON → dry run → apply → verify coverage → build

## Transit Audit Pattern

When auditing enriched descriptions for transit/logistics errors:

1. **Extract all transit claims** via SQL keyword search (`metro`, `station`, `walk`, `bus`, `tram`, `line`)
2. **Group by venue** — most errors are venue-level (wrong metro → all descriptions for that venue wrong)
3. **Verify facts** against official sources (Athens Metro map, Google Maps walking times)
4. **Fix via SQL REPLACE** for station name corrections (fast, surgical)
5. **Use Python regex** for complex pattern removal (e.g., line color references across varied formats)
6. **Update knowledge base** (`config/enrichment-knowledge.md`) to prevent recurrence
7. **Multiple regex passes** needed — line colors appear in many formats: `(Blue line)`, `(Line 3, Blue)`, `on the Blue line`, `on Line 3`, prose mentions

Key Athens Metro facts (verified 2026-03-03):
- Line 1 (Green/ISAP): Piraeus↔Kifissia
- Line 2 (Red): Anthoupoli↔Elliniko
- Line 3 (Blue): Nikaia↔Airport
- Omonia: Lines 1+2 only (NO Line 3)
- Monastiraki: Lines 1+3 (NOT Red)
- Kerameikos: Line 3 only (nearest for all Gazi venues)
- Megaro Moussikis: Line 3 (nearest for Megaron concert hall, NOT Evangelismos)

## Dual-Language Enrichment Pattern

File convention for dual-language enrichment output:
```
temp-descriptions/batch-N/
  <event-id>.md          ← Greek description (primary)
  <event-id>.en.md       ← English description (optional)
  <event-id>.tags.json   ← Tags (shared)
```

Pipeline flow:
1. Brief generator (`generate-enrichment-brief.ts`) includes English word targets + Entity Locking terms
2. Enrichment subagent writes both `.md` (Greek) and `.en.md` (English) per event
3. Save-batch auto-detects `.en.md`, runs `validateEnglishDescription()`, writes to `full_description_gr` + `full_description_en` + legacy `full_description`
4. If no `.en.md` exists, saves Greek only (backwards compatible)

Key files:
- `config/entity-locking.json` — terms that stay untranslated in English
- `src/enrichment/enrichment-matrix.ts` — `en_min`/`en_max` per category
- `src/enrichment/quality-gates.ts` — `validateEnglishDescription()` function
- `scripts/save-batch.ts` — dual-column UPDATE + English quality gate
- `scripts/generate-enrichment-brief.ts` — Entity Locking section + English instructions in brief

## Utility Adoption Sweep Pattern

When a formatting utility is added (e.g., `displayNeighborhood()`), grep for **all call sites** that handle similar data, not just the one being fixed. Example: `displayNeighborhood()` was applied to event records but missed venue records in `search-index.ts`. Checklist:
- `grep -rn "venue.neighborhood\|neighborhood" src/` — find every neighborhood reference
- Check each: does it display raw DB value or pass through the utility?
- Common miss sites: search indexes, JSON API endpoints, sitemap generators, schema markup

## Scraper Venue ≠ Source Venue Pattern

When a source (e.g., Athinorama) lists a different venue than the DB record, the description should use the **source venue** (it's authoritative). The DB venue came from the scraper's initial pass, which sometimes infers incorrectly — especially at multi-hall complexes like the Nakas building (Ωδείο Αθηνών vs Ωδείο Φίλιππος Νάκας at Ippokratous 41).

**When this happens:**
1. Write the description using the source-verified venue
2. Flag the mismatch in the batch review
3. DB venue needs manual correction (UPDATE events SET venue_name = ... WHERE id = ...)
4. May also need `config/athens-venues.json` update if the correct venue isn't in the whitelist

**Known instances (2026-03-04):**
- Duo Duende (282ef93b): DB says "Ωδείο Αθηνών", source says "Ωδείο Φίλιππος Νάκας"

## Build-Time Token Substitution Pattern

`resolveTokens()` in `hub-page.ts` is a locale-aware closure inside `renderHubPage()`. It replaces `{{MONTH_YEAR}}` → "March 2026" and `{{MONTH}}` → "March" (en) / "Μαρτίου" (el) at build time.

**Extend this pattern** for any future build-time text substitution — season names, year references, city names for multi-city expansion. Don't add new substitution mechanisms; add new token patterns to `resolveTokens()`.

Applied to: `answerCapsuleEn`, `answerCapsuleEl`, and all FAQ question/answer text (via `resolvedFaqs` mapping before `renderFaqSection` and `renderFaqSchema`).

## QA Finding Reproduction Rule

QA findings need reproduction steps before spending time diagnosing. If a bug report lacks an exact URL + screenshot, the fix may already be in place. Ask for:
1. Exact URL where the issue was observed
2. Screenshot or copy of the incorrect output
3. Timestamp (to check against deploy history)

Without these, you risk diagnosing a ghost — the fix was already shipped but the QA reviewer saw a cached/stale version.

## Card Link Accessibility Pattern (::before click target)

Cards use `<article>` wrapper with heading-only `<a class="card-link">` + `::before` pseudo-element for full-card click area:

```html
<article class="event-card">
  <div class="card-image-wrapper">...</div>
  <div class="card-body">
    <h3 class="card-title"><a href="/events/..." class="card-link">Title</a></h3>
    ...
  </div>
</article>
```

CSS requirements:
- `.event-card { position: relative; isolation: isolate; }` — creates stacking context
- `.card-link::before { content: ''; position: absolute; inset: 0; z-index: 1; }` — click target
- `.card-badge { position: relative; z-index: 2; }` — sits above the overlay
- Focus via `:has(.card-link:focus-visible)` with `@supports not selector(:has(*))` fallback

Applies to: `renderEventCard()` (page.ts), `renderRelatedEventCard()` (event-page.ts), `renderEventCardList()` + `renderFeatureCard()` (card-variants.ts). Hero cards still use `<a>` wrapper (different structure, not in scope).

## View Transitions Pattern (MPA)

Cross-document View Transitions are CSS-only progressive enhancement. The pattern:

1. `@view-transition { navigation: auto; }` — enables the API
2. Named elements via CSS: `.site-header { view-transition-name: site-header; }` — NOT inline styles
3. Persistent chrome (`animation: none`) vs content (`cross-fade`)
4. `@view-transition { navigation: none; }` inside `@media (prefers-reduced-motion: reduce)`

**Do NOT** add inline `style="view-transition-name: event-{slug}"` on cards if a page can have >50 cards — each name creates a compositor snapshot layer. Use class-based names for structural elements only.

## Surface Token + Z-Index Stacks

4-level surface hierarchy in `design-system.css`:

| Token | Hex | Role | Example selectors |
|-------|-----|------|-------------------|
| `--bg-primary` | #0d0d0d | Page body | `body`, main layout |
| `--bg-elevated` | #151515 | Structural panels, overlays | Filter dropdown, search overlay, footer |
| `--bg-surface` | #1e1e1e | Content sections on page body | `.edp-venue-section`, `.related-pages`, `.neighborhood` |
| `--bg-raised` | #282828 | Interactive states inside elevated containers | Hover/active in filter dropdown, search results |

Rule: use `--bg-raised` for hover/active/focus states **inside** `--bg-elevated` containers. Use `--bg-surface` for static content blocks sitting on `--bg-primary`.

## WCAG Contrast Validation Process

When changing surface tokens, validate all text/surface combinations:

1. List all text tokens (`--text-primary` through `--text-muted`)
2. List all surface tokens where that text appears
3. Calculate contrast ratio (WebAIM tool or `(L1 + 0.05) / (L2 + 0.05)`)
4. Require ≥ 4.5:1 for normal text (AA), ≥ 3:1 for large text
5. Document any failing combos as CSS comments (e.g., `--text-muted` on `--bg-raised` = 3.4:1)
6. Verify no component actually uses the failing combination

## Pull Quote Insertion

Pull quotes are injected into hub page card grids via `injectPullQuotes()` in `hub-page.ts`.

**How it works:**
1. Split card grid HTML at `<h2 class="date-group-header">` boundaries
2. Track cumulative card count via `data-count` attributes on `<div class="date-group">`
3. After every ~10 cards, insert `<aside class="pull-quote" aria-hidden="true">`
4. CSS `grid-column: 1 / -1` makes the aside span the full grid width

**Key details:**
- Quotes come from `getPullQuotes(hubSlug, locale)` in `editorial-content.ts`
- If no quotes exist for a hub, nothing is injected (graceful empty array)
- The aside goes *between* date groups, not inside them — it's a sibling of the `<div class="date-group">` elements

## Featured Editorial Card Pattern

`renderFeaturedEventCard(event, vignette, badgeTreatment)` in `card-variants.ts`.

**Structure:**
- `.event-card-featured-editorial` — `isolation: isolate` stacking context
- `.featured-editorial-image` — 16:9 (padding-top: 56.25%)
- `.featured-editorial-title` — `--type-h2` (28px), `--font-weight-bold` (700)
- `.featured-editorial-vignette` — editorial text, 3-line clamp
- `.card-link::before` — full-card click target (S64 pattern)

**Badge treatment:** Pass `'yellow'` (event type color) or `'neutral'` (`--bg-raised` background).

## Section Editorial

In hub-page.ts, section editorials inject below the event blocks `<h2>` heading:
```html
<h2>Αναλυτικά</h2>
<p class="section-editorial">Editorial text here</p>
```
Max-width 720px. Only appears when both enriched events AND editorial content exist for the hub.

## Hardware-Dependent Test Pattern

Tests that depend on physical machine state (lid close, power source, thermal state, display hotplug, external peripherals, battery drain, sleep/wake transitions) **cannot run inside a Claude Code tool call**. Claude shares the user's terminal session — if the user closes the lid or disconnects power, Claude's subprocess suspends too, and there is no way for Claude to "observe from outside" the event it is supposedly measuring.

This is a collaboration pattern, not a code pattern. It applies whenever diagnosis needs data from the physical machine.

**Claude's responsibilities:**
1. Identify that the test is hardware-dependent as early as possible — before writing any test harness.
2. Prepare a **single-line, self-contained recipe** the user can paste into a fresh terminal (NOT inside Claude Code). Include:
   - The exact command, with `START=$(date +%s); ...; END=$(date +%s); echo "Elapsed: $((END-START))s"` wrapping for timing.
   - Pre-conditions the user must set up (e.g., *"disconnect AC adapter first"*, *"close all other Claude Code windows"*).
   - Expected PASS and FAIL values, with a clear gap between them so there is no ambiguous middle range.
   - What to do on the ambiguous case (usually: "rerun with stricter conditions").
3. Specify *where* the user should run it ("Terminal.app, NOT inside Claude Code").
4. Tell the user what to copy-paste back when they return.
5. When the result arrives, resume diagnosis from there.

**User's responsibilities:**
1. Run the recipe bare-metal, with a phone/watch timer for the physical event (lid close, unplug, etc.).
2. Paste the `Elapsed:` output back into the Claude Code session.

**What NOT to do (from direct experience):**
- Do NOT run `caffeinate -i sleep 300` or similar *inside* a Claude Code Bash tool call. It either blocks for 5 minutes (burning context with no useful work) or gets killed by Claude's tool timeout, yielding no measurement. We already know this — see `mistakes.md` → "Hardware-dependent tests cannot run inside Claude Code".
- Do NOT ask the user to "try different things and report back" — hardware tests are expensive (8-40 minutes real-world wait per run). Give one precise recipe per round-trip.
- Do NOT combine multiple physical events into one test ("close the lid AND unplug AND run on external monitor"). If the test fails, you won't know which variable caused it. One physical variable per recipe.

**Reference implementation:** `specs/claude-hang-diagnostic.md` → Section 8 → "R1 Appendix — Empirical test recipe" → "R1.A" is the canonical example. It has all five elements: exact command with timing wrapper, pre-condition ("disconnect the power adapter"), PASS/FAIL values with a 470s gap, ambiguous-case instructions, and "NOT inside Claude Code" guidance. Use it as the template for any future hardware-dependent test.

**Common hardware-dependent scenarios in this project:**
- `caffeinate` behavior under clamshell sleep / battery vs. AC (solved; see R1.A)
- `pmset` assertion interaction with user-space processes
- launchd `StartCalendarInterval` firing while the laptop is closed
- Any test involving `ioreg -n AppleClamshellState` observed state
- Network transitions (Wi-Fi drop, VPN reconnect) that require physically toggling the radio

## Batch Sizing Constraints Pattern

When changing `EVENTS_PER_BATCH` or `MAX_BATCHES` in `scripts/auto-enrich.sh`, five coupled constraints must hold simultaneously. This pattern documents the constraints and the projection methodology.

### The five constraints

```
(1) MAX_BATCHES × BATCH_TIMEOUT + warmup_overhead ≤ LOCK_MAX_AGE
(2) Projected 5th-percentile batch duration < BATCH_TIMEOUT (timeout safety margin)
(3) Projected mean batch duration × MAX_BATCHES + scrape_phase_time < 2h (total run budget)
(4) Brief token count per batch < context budget (~15K tokens ceiling; currently ~3.5K at 5 events)
(5) Per-batch event ID list unique across concurrent batches (prevents manifest collision)
```

Constraint (1) is load-bearing for the lock-mtime recovery mechanism — if violated, the stale-lock check installed in the R2 session will force-kill valid in-progress runs. The numeric values must hold together, not in isolation.

### Timing projection methodology

Raw linear scaling (`new_duration = old_duration × new_count / old_count`) over-predicts because each batch has fixed per-batch overhead (warmup, brief load, exemplar reads). Use an affine model:

```
batch_duration ≈ fixed_cost + per_event_cost × N_events
```

**Fit the model from observed data:**
1. Grep `logs/auto-enrich-*.log` for `completed in` lines to get durations
2. Use at least 5-6 data points for stability
3. Check the range: if max > 1.4 × mean, the distribution has a heavy upper tail — plan against the max, not the mean
4. Extrapolate both mean and upper-tail:
   - Mean projection: `fixed_cost + per_event_cost × new_N`
   - Worst-case projection: `fixed_cost + per_event_cost × new_N × (max / mean)`
5. If worst-case projection exceeds BATCH_TIMEOUT by any margin, fall back one step on N and recheck

### The Step 0 → Step 1 → Step 2 → re-verify loop

**Critical:** re-verify assumptions between steps when new data arrives. In the 2026-04-08 throughput session, Step 1 analysis used 5 batch samples (max 913s). A 6th batch completed during Step 2 at 1249s, shifting the worst-case projection from 1455s (safe) to 2082s (over-timeout). Without re-running the timing grep between Step 1 and Step 3, the change would have shipped with ~5% expected timeout rate. **Always re-verify distribution stats after any new batch completes during the session.**

### Single-lever change rule

Batch sizing changes come in three levers: events-per-batch, batches-per-run, runs-per-day. **Change one lever per session**, then collect ≥3 days of production data before changing another. Reasons:
1. If something regresses, you know which lever caused it
2. Lever interactions are non-obvious — a 4-event bump + a BATCH_TIMEOUT raise + a MAX_BATCHES bump together might pass all individual safety checks and still hit `LOCK_MAX_AGE` in combination
3. Rollback blast radius stays bounded to one variable

### Safe fallback hierarchy

If a batch sizing change causes problems:
1. **First line:** revert the changed variable to its prior value. One-line edit to `auto-enrich.sh`. Zero architectural impact.
2. **Second line:** if reverting doesn't fully recover (e.g., queue state corruption from timed-out batches), also run `UPDATE enrichment_queue SET status='pending' WHERE status='in_progress' AND updated_at < datetime('now', '-1 day')` to re-enable events that got stuck.
3. **Third line:** if the lock-mtime recovery mechanism failed and there's a zombie lock, `rm .auto-enrich.lock` after confirming no running `claude -p` process holds it (`pgrep -f "claude -p"`).

### Never change these without a plan

- `LOCK_MAX_AGE` — load-bearing for stale-lock recovery from the R2 session
- `caffeinate -s` in the watchdog (line 303) — load-bearing for clamshell-on-AC survival
- `MIN_QUEUE` floor — raising it above `EVENTS_PER_BATCH` causes skipped runs on low-content days, working against throughput goals
- `temp-briefs/batch-N.md` naming convention — the save-batch.ts `--batch=N` flag expects this format

## Mode-Flag Pattern for Bash Pipeline Scripts

When a long-running bash pipeline script needs to support multiple execution modes (e.g., `full` vs `freshness` vs `enrichment` in Agent Athens' `daily-automated.sh`), extending the existing argument parser is meaningfully better than introducing a positional default.

### The antipattern: positional default

```bash
# ❌ WRONG — breaks existing --dry-run compatibility
PIPELINE_MODE="${1:-full}"

case "$PIPELINE_MODE" in
    full|freshness|enrichment) ;;
    *) echo "Invalid mode: $PIPELINE_MODE"; exit 1 ;;
esac
```

Why it's wrong: if the script is ever invoked as `./daily-automated.sh --dry-run`, `$1` is `--dry-run`, which becomes `PIPELINE_MODE`, which fails the case validation, which exits. **Every existing `--dry-run` invocation silently breaks.** The regression is invisible until someone tries to dry-run the script.

### The pattern: extend the existing case block

```bash
# ✓ CORRECT — extends existing for-arg loop, preserves --dry-run
main() {
    DRY_RUN="false"
    PIPELINE_MODE="full"
    for arg in "$@"; do
        case $arg in
            --dry-run)         DRY_RUN="true" ;;
            --mode=*)          PIPELINE_MODE="${arg#--mode=}" ;;
            full|freshness|enrichment) PIPELINE_MODE="$arg" ;;
            --help|-h)         echo "Usage: $0 [mode] [--dry-run]"; exit 0 ;;
            *)                 echo "Unknown arg: $arg"; exit 1 ;;
        esac
    done

    case "$PIPELINE_MODE" in
        full|freshness|enrichment) ;;
        *) echo "Invalid mode: $PIPELINE_MODE"; exit 1 ;;
    esac

    # ... rest of main() ...
}
```

Three properties this pattern guarantees:
1. **Both positional and flag syntax work:** `daily-automated.sh freshness` AND `daily-automated.sh --mode=freshness` both set PIPELINE_MODE=freshness
2. **Arg order independence:** `--dry-run freshness` and `freshness --dry-run` both work the same way
3. **Backward compatibility:** zero-arg invocation (`daily-automated.sh`) defaults to the existing full-pipeline behavior via `PIPELINE_MODE="full"` initialization before the loop

Reference implementation: `scripts/daily-automated.sh:573-595` (S79, 2026-04-09).

### Phase-gating pattern

Once mode is parsed, gate phase groups via `if [[ "$PIPELINE_MODE" != "<excluded_mode>" ]]; then ... fi` blocks. Do NOT move phase function definitions — just wrap the calls in main():

```bash
main() {
    # Always run (all modes)
    check_dependencies
    run_backup_db

    # Freshness phases (skip in enrichment mode)
    if [[ "$PIPELINE_MODE" != "enrichment" ]]; then
        run_ingest
        run_parse
        # ...
    fi

    # Enrichment phases (skip in freshness mode)
    if [[ "$PIPELINE_MODE" != "freshness" ]]; then
        run_enrichment_sync
        # ...
    fi

    # Build & deploy (skip in enrichment mode)
    local deploy_ok=0
    if [[ "$PIPELINE_MODE" != "enrichment" ]]; then
        if run_generate; then
            # ... nested conditional unchanged ...
        fi
    else
        # Enrichment-only mode: nothing to deploy. Mark deploy_ok=1 so
        # the exit-status check below doesn't flag the run as failed.
        deploy_ok=1
        log "Enrichment mode: skipping build + deploy"
    fi
}
```

**Critical:** if any mode intentionally skips a phase that sets state used by the exit-status check (like `deploy_ok`), the else-branch MUST explicitly set that state. Otherwise the skipped mode looks like a failure to the caller (launchd logs it as `LastExitStatus=1`).

## Per-Mode Lock File Pattern

When a bash script supports multiple execution modes that write to a shared backing store (like SQLite), single-lock-per-script is pessimistic. Two modes that touch different columns/tables can safely run concurrently. Use per-mode locks instead.

### Design

```bash
# One lock file per mode, not one global lock
LOCK_FILE="$PROJECT_DIR/.pipeline-${PIPELINE_MODE}.lock"
LOCK_MAX_AGE=25200  # 7 hours — covers worst-case cold morning run

if [[ -f "$LOCK_FILE" ]]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    LOCK_AGE=$(( $(date +%s) - $(stat -f%m "$LOCK_FILE" 2>/dev/null || echo 0) ))
    if [[ $LOCK_AGE -gt $LOCK_MAX_AGE ]]; then
        log "Stale $PIPELINE_MODE lock (age: ${LOCK_AGE}s). Force-removing."
        rm -f "$LOCK_FILE"
    elif [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
        log "Pipeline $PIPELINE_MODE already running (PID=$LOCK_PID). Exiting cleanly."
        exit 0  # NOT exit 1 — launchd would log as failure
    else
        log "Dead $PIPELINE_MODE lock (PID=$LOCK_PID not running). Removing."
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT
```

### Four critical properties

1. **Exit 0 on "already running"**: launchd (or cron) logs non-zero exits as failures. A correctly-detected concurrent run is not a failure — it's the lock doing its job. Exiting 0 keeps error logs clean.
2. **Stale-lock detection via mtime**: a long-running process that was SIGKILLed may leave a stale lock file behind. Without an mtime check, future runs would be blocked indefinitely. The `LOCK_MAX_AGE` should be set to `max_expected_runtime + safety_margin` — for Agent Athens pipeline, worst-case observed was 6h cold-scrape morning runs, so 7 hours gives ~1h margin.
3. **Dead-process detection via `kill -0`**: an even better check than mtime, since processes can die cleanly without removing their lock file (e.g., OOM kill, power loss). `kill -0 $PID` is a POSIX-standard no-op that returns 0 if the process exists, non-zero otherwise. Combine BOTH checks: mtime catches hung-but-alive processes, kill -0 catches dead-without-cleanup processes.
4. **`trap 'rm -f "$LOCK_FILE"' EXIT`**: cleanup the lock on normal exit. Without this, every successful run leaves its lock behind for the stale-age check to catch — which works but is noisy.

### When single-lock is still correct

Per-mode locks are only correct when modes truly don't conflict. If two modes write the same DB row or modify the same in-flight file, they MUST use a shared lock. For Agent Athens `daily-automated.sh`:
- `freshness` writes to: `events` (scrape-insert, quality-filter, dedup-merge), `content-hashes.json`, `dist/`
- `enrichment` writes to: `events` (description, enriched_at), `enrichment_queue`, `temp-briefs/`, `temp-descriptions/`
- Overlap: both write to the `events` table, but to different COLUMNS. SQLite's row-level locking handles this at the statement level; bash-level serialization isn't needed.
- **`full` mode uses its own `.pipeline-full.lock`** and blocks both sub-modes — because full mode writes to everything.

Reference implementation: `scripts/daily-automated.sh:597-617` (S79, 2026-04-09).

## Launchctl Transition Pattern (load new, unload old)

When replacing a launchd job with a new version (or splitting one job into multiple), the load/unload order matters subtly.

### The pattern

```bash
# ✓ CORRECT: load new first, unload old second
launchctl load ~/Library/LaunchAgents/new-job-A.plist
launchctl load ~/Library/LaunchAgents/new-job-B.plist
launchctl unload ~/Library/LaunchAgents/old-job.plist
```

### Why this order

The scheduler is always covered by at least one registered job during the transition. Between the `load new` calls and the `unload old` call, ALL THREE jobs are briefly registered simultaneously — if a trigger time happens to fall in that window, the OLD job runs (which is still correct behavior per its pre-existing schedule). The NEW jobs won't trigger until THEIR scheduled times, which are in the future.

### The wrong order

```bash
# ✗ WRONG: unload old first, then load new
launchctl unload old-job.plist
launchctl load new-job-A.plist
launchctl load new-job-B.plist
```

Between the unload and the subsequent loads, NO agentathens-prefixed job is registered. If a system event causes a scheduled trigger check in that window, nothing runs. In practice this window is a few tens of milliseconds — unlikely to cause a miss — but the "load first, unload second" habit costs nothing and eliminates the risk entirely.

### Keep the old plist file on disk

```bash
# After loading new jobs and unloading the old registration:
ls ~/Library/LaunchAgents/old-job.plist
# File still exists — only the launchd registration was removed.

# Rollback is now a single launchctl load:
launchctl load ~/Library/LaunchAgents/old-job.plist
# The old job fires on its pre-existing schedule again.
```

This is the cheapest possible rollback path. The file is ~2KB; the cost of keeping it on disk forever is negligible compared to the option value of being able to revert in one command. For Agent Athens, `com.agentathens.daily.plist` has been kept as a "rollback insurance" file since S79.

Reference implementation: `scripts/daily-automated.sh` header comments in the freshness+enrichment plists at `~/Library/LaunchAgents/` and `config/launchd/` (S79, 2026-04-09).

## Parallel Bash Process Management Pattern

When a bash script needs to run N independent work items in parallel and collect results, the correct pattern is **parallel launch → indexed arrays → ordered wait**. Common mistakes: single-array tracking (loses per-batch metadata), parallel wait (doesn't work — bash `wait` only takes one PID at a time unless called with no args), finish-order logging (non-deterministic output).

### The pattern

```bash
declare -a CHILD_PIDS=()
declare -a WATCHDOG_PIDS=()
declare -a ITEM_NAMES=()
declare -a START_TIMES=()

# Launch phase — all items fire in rapid succession
for item in "${WORK_ITEMS[@]}"; do
    NAME=$(basename "$item")
    log "Launching $NAME..."
    START=$(date +%s)

    # Main work in background
    do_work "$item" >> "$LOG_FILE" 2>&1 &
    CHILD_PID=$!

    # Per-item watchdog (independent timeout for each)
    ( sleep "$TIMEOUT" && kill "$CHILD_PID" 2>/dev/null && log_error "$NAME timed out" ) &
    WATCHDOG_PID=$!

    # Store in parallel arrays
    CHILD_PIDS+=("$CHILD_PID")
    WATCHDOG_PIDS+=("$WATCHDOG_PID")
    ITEM_NAMES+=("$NAME")
    START_TIMES+=("$START")
done

log "All ${#CHILD_PIDS[@]} items launched in parallel."

# Collect phase — iterate in launch order, wait on each specific PID
for i in "${!CHILD_PIDS[@]}"; do
    CHILD_PID="${CHILD_PIDS[$i]}"
    WATCHDOG_PID="${WATCHDOG_PIDS[$i]}"
    NAME="${ITEM_NAMES[$i]}"
    START_TIME="${START_TIMES[$i]}"

    # Block on this specific PID
    wait "$CHILD_PID" && EXIT_CODE=0 || EXIT_CODE=$?

    # Cancel the per-item watchdog (it fires on timeout OR we cancel it on success)
    kill "$WATCHDOG_PID" 2>/dev/null || true
    wait "$WATCHDOG_PID" 2>/dev/null || true

    ELAPSED=$(( $(date +%s) - START_TIME ))

    if [[ "$EXIT_CODE" -eq 0 ]]; then
        log "$NAME completed in ${ELAPSED}s"
    else
        log_error "$NAME failed (exit $EXIT_CODE) after ${ELAPSED}s"
    fi
done
```

### Key properties

**Parallel arrays, not associative arrays**: the four `declare -a` arrays (CHILD_PIDS, WATCHDOG_PIDS, ITEM_NAMES, START_TIMES) are indexed by the SAME integer index. Access pattern: `CHILD_PIDS[$i]`, `WATCHDOG_PIDS[$i]`, etc. This works because bash `declare -a` arrays are ordered. Associative arrays (`declare -A`) are unordered and break the "iterate in launch order" property.

**Launch-order wait, not finish-order wait**: `wait $PID` blocks on a specific PID. If batch-1 is slow and batch-2+3 finish first, the loop still waits on batch-1 FIRST. After batch-1 exits, the loop moves to batch-2 (already done, returns immediately) then batch-3 (also done, returns immediately). Total loop time = `max(work durations)`. The log output order is launch order (predictable) even though finish order was different.

**Wait returns specific exit codes per PID**: `wait "$PID" && EXIT_CODE=0 || EXIT_CODE=$?` captures each child's exit code independently. Without the PID argument, `wait` waits for ALL children and returns the exit code of the LAST one — useless for per-item tracking.

**Per-item watchdogs, not a global watchdog**: each child gets its own `( sleep $TIMEOUT && kill $PID )` subshell. One hung work item doesn't kill the others, and one work item's timeout doesn't affect another's deadline. The watchdog cancellation (`kill $WATCHDOG_PID`) after normal exit cleans up the subshell process.

### Common antipatterns to avoid

**❌ `wait` with no args + counting exits:**
```bash
do_work1 &
do_work2 &
do_work3 &
wait  # Blocks until ALL children exit, but you lose per-item exit codes
```

**❌ Using `jobs -p` + wait:**
```bash
do_work1 &
do_work2 &
for pid in $(jobs -p); do wait $pid; done  # Works but loses launch order and metadata
```

**❌ Parallel waits via subshell backgrounds:**
```bash
( wait $PID1 && log "done 1" ) &
( wait $PID2 && log "done 2" ) &
# The subshell's `wait` can't wait on a process that isn't ITS child — doesn't work
```

**❌ Finish-order logging via polling:**
```bash
while [[ ${#PIDS[@]} -gt 0 ]]; do
    for pid in "${PIDS[@]}"; do
        if ! kill -0 $pid 2>/dev/null; then
            log "$pid done"
            # Hard to cleanly remove from array; polling wastes CPU
        fi
    done
    sleep 1
done
```

### SQLite + concurrent writes — the companion pattern

If parallel work items write to the same SQLite database, the bash parallelism is only safe if the database connections are configured for concurrency. Two PRAGMAs are required:

```sql
PRAGMA journal_mode = WAL;        -- Concurrent readers, serialized writers
PRAGMA busy_timeout = 30000;      -- Writer waits up to 30s for lock
```

**Both are load-bearing.** WAL mode enables reader concurrency AND makes the writer lock window tight (milliseconds, not seconds). busy_timeout converts "immediate SQLITE_BUSY error" into "wait up to N ms, then error if still locked".

**Where to set them**: right after `new Database(path)`, before any `prepare` or `run` calls. Each independent DB connection in the concurrent scenario must set its OWN PRAGMAs — they're per-connection, not database-wide.

Reference implementation: `scripts/auto-enrich.sh` (S80, 2026-04-09) uses this pattern for 3 concurrent `claude -p` calls, each of which internally invokes `save-batch.ts` (which sets busy_timeout at line 344). Measured speedup: 67% reduction in enrichment wall-clock vs serial (43 min → 14 min).

### When the overhead is worth it

Parallel bash is notably more complex than serial. The overhead (4 arrays, launch phase, collect phase, per-item watchdogs, watchdog cancellation) roughly doubles the loop code. Worth it when:

1. **The work items dominate wall-clock** (e.g., 3 items × 15 min each = 45 min serial → 15 min parallel is a 30-min win)
2. **The items are genuinely independent** (no shared mutable state beyond what DB-level concurrency primitives protect)
3. **The parallelism count is small** (3-10 items). For 100+ items, use a work queue pattern instead

Not worth it when:
- Items are fast (< 10s each) — overhead dominates the savings
- Items share state that can't be safely parallelized
- The item count is unknown at launch time (use a queue instead)

## Runtime Artifacts vs Source Code Pattern

**Rule:** runtime-generated files (databases, caches, state files, temporary work files) should NEVER be tracked by git. Source code and configuration SHOULD be tracked. The distinction matters more than it looks.

### What counts as "runtime artifact"

If answering YES to any of these, it's a runtime artifact:
- Is the file *generated* by a script, not hand-edited by a human?
- Does it change on every pipeline run without a matching source code change?
- Could a fresh clone regenerate it by running the pipeline once?
- Is it binary and >1 MB?
- Does its delta show thousands of changed lines per day?
- Would a diff between two versions be uninformative to a human reviewer?

Examples of runtime artifacts in this project (all now gitignored as of 2026-04-08):
- `data/events.db` — SQLite database, 36 MB, mutated by every pipeline phase
- `data/content-hashes.json` — incremental hash tracking for sitemap generation
- `data/health-reports/*.txt` — auto-generated daily health snapshots
- `temp-briefs/*.md` — scratch space for enrichment batches
- `dist/` — built site output (already gitignored)
- `data/images/` — scraped image cache (already gitignored)
- `logs/*.log` — all log files (already covered by `*.log`)

Examples of things that LOOK like runtime artifacts but are actually source:
- `config/athens-venues.json` — hand-curated venue list with variations
- `config/enrichment-knowledge.md` — human-written venue intel
- `exemplars/*.md` — reference descriptions used as training examples
- `data/venues-master.json` — the single source of truth for venue canonicalization (small, manually updated)

**Heuristic:** if removing the file and running the pipeline regenerates it identically, it's a runtime artifact. If removing it breaks the pipeline until a human rewrites it, it's source code.

### The `git add -A` antipattern

`git add -A` stages every modified file in the working tree that isn't `.gitignore`-excluded. Combined with a pipeline that mutates runtime artifacts living in unignored directories, this creates a feedback loop:

1. Pipeline mutates `data/events.db` (36 MB binary)
2. Pipeline calls `git add -A && git commit`
3. Git packs the 36 MB binary diff (slow)
4. `git push` transfers the pack (slower — 40 minutes observed)
5. GitHub processes the binary delta server-side (slowest)
6. The next day, repeat from step 1 — each commit re-packs a new version

**The bloat compounds.** Every day's binary diff is stored forever in git history. After 60 days you have 60 binary deltas, each ~1 MB compressed. The repo's `.git/` grows linearly with calendar days, not with actual code change volume.

**Detection:** run `git count-objects -vH`. If `size` (loose objects) is >> `size-pack`, git history hasn't been gc'd recently AND likely contains large binaries. On this project, the ratio was 375 MiB loose vs 72 MiB packed — a 5:1 ratio is suspicious.

**Remediation:**
1. Add the paths to `.gitignore`
2. Run `git rm --cached --ignore-unmatch <path>` for each path
3. Commit with a descriptive message
4. (Optional, separate session) Rewrite history with `git filter-repo` to purge historical blobs. Destructive — requires backup of `.git/` first.

### The Backup-Script-Before-Untrack Pattern

When untracking something that was implicitly backed up by git history (databases, state files), you need an explicit replacement safety net BEFORE the untrack lands.

**Sequence:**
1. Write the backup script and hook it into the relevant cron/pipeline
2. **Actually run the backup script once** — prove empirically it produces a recoverable artifact
3. Verify recoverability (decompress, query row count, `PRAGMA integrity_check`)
4. Only then proceed with `git rm --cached` and the `.gitignore` edit
5. Commit the gitignore change AND the backup script in ONE atomic commit

**Why the atomicity matters:** a two-commit approach (backup script first, then gitignore) has a window where git is still the only backup. A one-commit approach means at the moment the gitignore change lands, the safety net is already in place.

**Reference implementation:** `scripts/backup-events-db.sh`. Uses `VACUUM INTO` (not `cp`) because SQLite WAL mode makes `cp` unsafe. Uses gzip (84% compression observed on this DB). Backups live at `$HOME/agent-athens-backups/` (outside the project dir) so they survive `rm -rf project/`. Retention is 7 days via `find -mtime +7 -delete`. Runtime: <1 second for 36 MB source.

### SQLite backup specifics

**Use `VACUUM INTO`, not `cp`.** SQLite in WAL mode has companion files (`events.db-shm`, `events.db-wal`) that hold uncommitted writes. A `cp data/events.db backup.db` during active writes may capture a database missing the WAL-pending state — potentially corrupt or stale.

```bash
# ✓ CORRECT — uses SQLite's online backup API, safe under WAL
sqlite3 data/events.db "VACUUM INTO '/path/to/backup.db'"

# ✗ WRONG — races with active writers
cp data/events.db /path/to/backup.db
```

`VACUUM INTO` additionally defragments (reclaims empty pages), so the output is often smaller than the source even before compression. Observed ratio on this project: 36 MB source → 5.6 MB gzipped backup (84% reduction, most of which is the defrag + text compression of the sqlite_master schema).

### Backup location decision tree

- **Inside project dir, gitignored**: simplest, but lost if `rm -rf project/` happens. Use only for truly disposable backups.
- **`$HOME/{projectname}-backups/`**: survives project-dir wipe, still on same machine. Good default for dev-machine backups. **This is what we chose.**
- **Network share / NAS**: survives single-machine failure. Adds complexity (mount reliability, credentials). Layer on top of local backups, don't replace.
- **Cloud (S3, etc.)**: survives physical disaster. Adds external dependencies + secrets + cost. Only necessary for production-critical data.

The tradeoff is reliability vs complexity. Agent Athens is a single-dev project on a laptop; `$HOME/agent-athens-backups/` is the right tier — if the laptop dies, the scrapers can rebuild the DB from scratch in a few hours. If it were a production multi-user service, S3 would be table stakes.

## Quality Gate Scope Rule

Gate checks must only score things the description writer controls. Specifically:

- **Word count**: Use per-event matrix targets from `classifyEvent()` + `getWordTarget()`, not hardcoded tier limits
- **Schema.org validation**: Only check when schema is actually provided. Schema is generated at build time by `generateSchemaOrg()`, not by the writer
- **Section structure**: Don't check for literal template strings ('practical block', 'tags', 'last verified') in description text — these are rendered by the site generator
- **Event metadata**: Missing date/time/venue/price fields are data pipeline concerns, not description quality issues. Score as `info`, not `warning`

The `validateEnglishDescription()` and `validateGreekDescription()` validators already follow this pattern — they were written after the matrix was established. The legacy `validateQualityGates()` was the one that violated it (fixed in Session 85).

## Venue Name Matching Pattern

Always normalize venue names before matching against venue lists. Greek venue names arrive from scrapers in different cases (mixed case, ALL CAPS, no accents) and languages (Greek, English).

```typescript
// ✅ CORRECT — case-insensitive + accent-insensitive
function normalizeVenue(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function venueMatches(venue: string, list: string[]): boolean {
  const norm = normalizeVenue(venue);
  return list.some(v => norm.includes(normalizeVenue(v)));
}

// ❌ WRONG — JS case + Greek diacritics break this
VENUES.some(v => venue.includes(v))
```

When adding venues to PREMIUM_VENUES or MAJOR_CONCERT_VENUES, include ALL known name variants (Greek, English, abbreviated). The `venueMatches()` helper handles case/accent differences, but completely different names (e.g., "Στέγη Ιδρύματος Ωνάση" vs "Onassis Stegi") still need separate entries.

### Suppressed Gate → Behavioral Rule Pattern
When suppressing a scored quality gate (e.g., MISSING_PRACTICAL) to eliminate phantom penalties, consider whether a replacement **behavioral rule** preserves the intent without reintroducing automated scoring. Rule 24 (venue-specific insider detail) demonstrates this: the suppressed gate's intent (practical info) was reframed as a citation-oriented LLM instruction, with human review via the quality gate checklist rather than code enforcement.

## Wall-Clock Watchdog Pattern (S89, 2026-04-20)

When a bash script needs a timeout for a backgrounded process that might span a macOS system-sleep or clamshell-sleep event, `sleep N` in a background subshell is NOT safe — the kernel pauses the `sleep` process during sleep, so the watchdog never fires. `caffeinate -s` asserts against *idle* sleep only; it does not prevent lid-close sleep. The reliable pattern is a wall-clock loop using `date +%s`, which measures real time and keeps advancing through system sleep:

```bash
# Start the actual work in the background
"$CLAUDE_BIN" -p "..." > "$LOG_FILE" 2>&1 &
CLAUDE_PID=$!

# Wall-clock watchdog — fires after TIMEOUT seconds of real time,
# even if the laptop lid is closed for part of that time
( WATCHDOG_END=$(( $(date +%s) + TIMEOUT ))
  while [ "$(date +%s)" -lt "$WATCHDOG_END" ]; do sleep 30; done
  kill "$CLAUDE_PID" 2>/dev/null
  log_error "Batch timed out after ${TIMEOUT}s"
) &
TIMER_PID=$!

# Wait for the work. If it finishes first, cancel the watchdog.
wait "$CLAUDE_PID" && EXIT_CODE=0 || EXIT_CODE=$?
kill "$TIMER_PID" 2>/dev/null || true
wait "$TIMER_PID" 2>/dev/null || true
```

Key properties:
- **`date +%s` advances during system sleep** — `sleep 30` inside the loop may be stretched by the kernel during sleep, but when the system wakes up `$(date +%s)` returns the correct real-time value and the loop exits promptly.
- **30-second poll interval** — trades ±30s timeout granularity for ~120× fewer wakeups than a `sleep 1` loop. Well under any meaningful BATCH_TIMEOUT precision.
- **Cancellation is unchanged** — after the real work finishes, `kill "$TIMER_PID"` + `wait "$TIMER_PID"` cleans up the watchdog. The `while` loop's `sleep 30` is interruptible by SIGTERM.
- **Unconditional log after kill** — write the `log_error` line *after* the kill rather than chaining with `&&`, so the timeout event is always logged even if the work process already exited between the timeout-tick and the kill call.

Use this pattern anywhere the previous `caffeinate -s sleep N` or `timeout N` idioms were used on macOS — it's strictly more correct on laptop hardware and equivalent on always-on hardware. See `scripts/auto-enrich.sh` for the production usage (warm-up watchdog at ~L263, per-batch watchdog at ~L318).

## Inline-Script IIFE with `dataset` — .ics Calendar Export (2026-04-21)

Pattern for client-side actions that need event-specific data but share one implementation across all pages: render a `<button>` with `data-*` attributes per event, then ship ONE script that queries `[data-...]` and reads `btn.dataset` on click. No per-page JS, no module loader, no hydration. Mirrors `renderSaveButtonScript` / `renderShareButtonScript` — calendar joins them as `renderCalendarScript` in `src/templates/action-bar.ts`.

```html
<button data-calendar-event
  data-event-start="2026-10-25T19:00:00"
  data-event-end="2026-03-29"
  data-event-peak="22:00"
  data-event-type="exhibition"
  data-event-title="..." data-event-venue="..." ...>
  Calendar
</button>

<script>(function(){
  var btn = document.querySelector('[data-calendar-event]');
  if (!btn) return;
  btn.addEventListener('click', function() {
    var d = btn.dataset;        // camelCased automatically
    /* build payload → Blob → URL.createObjectURL → <a download> click */
  });
})();</script>
```

Gotchas specific to .ics generation:

- **Date-only vs full ISO in a single parser**: DB stores `start_date` with time (`2026-10-25T19:00:00`) but `end_date` as date-only (`2026-03-29`). `parseIsoLocal()` must branch on both shapes; date-only defaults to `H=23, Mi=59` so exhibition closing day is preserved in calendar.

- **No TZ offset in DB `start_date`**: raw values are Athens-local wall time. The `+03:00` is appended only by `formatSchemaDate` for Schema.org JSON-LD. Emit .ics with `DTSTART;TZID=Europe/Athens:YYYYMMDDTHHMMSS` — no offset conversion needed. Regex-strip separators (`-`, `:`) and you're done.

- **TS template literal → JS string escape depth**: regex like `/\d{2}/` in the emitted JS requires `\\d{2}` in the TS template literal source. For RFC 5545 backslash escaping (where you need to *output* a literal backslash), skip the escape tower — use `String.fromCharCode(92)` once at the top of the IIFE and splice via `.split().join()` instead of regex.

- **Line folding at 75 octets, not 75 characters**: Greek UTF-8 is 2 bytes/char, so a 50-char Greek SUMMARY is 100 octets and needs folding. Walk `new TextEncoder().encode(line)`, back off on continuation bytes (`(byte & 0xC0) === 0x80`) to avoid splitting a multi-byte sequence, then decode each chunk with `TextDecoder`.

- **Filename sanitization**: slugs can contain unicode — strip non-`[a-zA-Z0-9-]` before building the `.ics` filename, otherwise the `a.download` attribute gets ignored by some browsers.

- **No VTIMEZONE block**: Google/Apple/Outlook resolve `TZID=Europe/Athens` via the IANA tzdb, so the 30+ lines of VTIMEZONE/RRULE DST transitions aren't needed. Trade-off documented in `decisions.md`.

## Canonical-format-at-importer-seam pattern

When a string-valued DB column accretes multiple formats over time (from different scrapers, code paths, or schema versions), centralize the format contract:

1. **One classifier, one normalizer** (`src/utils/date-format.ts` — `classifyDateFormat`, `normalizeDateField`). The classifier is the single source of truth for "what shape is this value?" Both write-path and render-path must call it so they can't silently diverge on edge cases (e.g. one treats `…T00:00:00.000Z` as naive-ts, the other as tz-aware).
2. **Normalizer applied at every write seam** — the canonical `upsertEvent()` AND every allowlisted bypass scraper. The seam-side call is what makes the guarantee hold going forward; the one-time migration (`scripts/migrate-date-format.ts`) only cleans up existing data.
3. **Architectural guard test** (`tests/no-bypass.test.ts`). Enumerate all `INSERT INTO <table>` sites across `src/` + `scripts/`, exclude test + archived directories via glob, assert each hit is either the canonical seam OR inside an explicitly listed `ALLOWED_BYPASSES` range. Use file + line-range (not exact line) so local edits don't break the guard. Each range entry carries a justification comment explaining **why** this site bypasses the canonical seam (usually performance, occasionally independent transaction semantics). If a new INSERT appears outside the allowlist, the test fails with an actionable error pointing the author at the allowlist file.
4. **Render-side reuse** — the render path (Schema.org emitter, templates, per-event generators) routes through a single formatter (`formatSchemaDate`) that uses the same classifier. Prevents the classic duplicate-logic trap where three render paths each independently implement `…T00:00:00+tz` for date-only inputs and drift out of sync. Discovered S95: three such duplications in `event-page.ts`, `venue-page.ts`, `templates/page.ts`.
5. **Malformed → throw, not silent passthrough.** Both the write-side normalizer and the render-side formatter throw on format-classifier `'malformed'`. Silent passthrough lets bad data flow to production; throws fail loud and surface upstream bugs.

Reusable for any cross-cutting string-shape invariant: date columns, URL columns, phone-number columns, money/currency columns.

## Every new monitor must specify its non-coverage at design time (2026-04-23, Session A)

When adding a monitoring signal — S91 visibility monitor, a STALE marker, a health check, a metric — the first question is not "what does this watch?" but "what does this explicitly **not** watch?" S91 monitored sitemap freshness and IndexNow submission health. It did not monitor enrichment throughput. That omission was silent: no warning in the commit, no note in the spec, no comment at the top of the script. Five days of zero-event enrichment runs slipped past because the non-coverage was implicit.

**Apply this going forward:**

1. Every monitor spec has a "Known non-coverage" section naming the failure modes the signal will **not** catch. At minimum, enumerate the adjacent subsystems the monitor doesn't observe.
2. When extending an existing monitor, audit its prior non-coverage list for what the extension still misses. Adding `enriched_last_24h` to S91 closes the enrichment-throughput gap, but the spec still names the empty-queue false-positive and the weekend-check-gap as active non-coverage.
3. Reviewers reject PRs that add a monitor without this section. The cost of writing it is a paragraph. The cost of not writing it is S90 repeating silently for 5 days.

The rule applies recursively: a monitor that catches a specific failure does not close the class of failures related to it. Declaring the boundary makes the next gap visible instead of latent.

## Passive markers vs. active alerts (2026-04-23, Session A)

A monitoring signal has two independent attributes: **what it detects** and **how it reaches a human**. These get conflated. The result is a pipeline where detection is strong and delivery is weak, and the weak link silently defeats the strong one.

**Classes:**

- **Passive marker** — the signal lands in a file (CSV column, log line, metric time-series, DB row). Detection fires correctly. A human surfaces it only by looking. Good: cheap to build, no retraining, no noise. Bad: silent across weekends, vacations, distraction windows.
- **Active alert** — the signal pushes out: macOS notification, email, chat ping, pager. Detection fires and reaches a human within minutes. Good: survives attention gaps. Bad: needs noise management (threshold tuning, escalation rules, suppression during known outages), becomes tedious fast.

**Rule:** every monitor must declare its alert class in its spec. A passive marker is often correct (most of our signals are not urgent enough for notifications), but it must be **chosen** passive, not default-passive by accident. When promoting passive → active, do it as a separate session with its own threshold spike — don't bolt a notification onto an existing monitor without measuring how often it would have fired in the last 30 days.

S91's `enriched_last_24h` extension is declared passive. The weekend gap ("nobody checks the CSV on Saturday") is explicit non-coverage, tracked against the next time it bites rather than speculatively patched.

## Semantic-fit gating (2026-04-23, Session 97)

**Rule:** Any fallback that inherits from a container — venue, source, category, tag, or any other aggregation — must validate that the child's shape matches the container's typical shape before inheriting. **Structural availability ≠ semantic correctness.**

**Third instance of this class in the codebase:**
1. Enrichment classifier substring bug (pre-2026-03) — matched category keywords anywhere in title, ignoring token boundaries.
2. Scraper dedupe on partial title matches (pre-2026-04) — collapsed distinct events because titles overlapped.
3. `venue_default` price inheritance (2026-04-23, S97) — a tech conference at a classical venue inherited classical pricing because the chain checked "does this venue have a default?" not "does this event fit the venue's typical programming?"

**Mechanism of the failure mode:** the fallback is a 2-step chain — (a) is there anything to inherit from, (b) inherit it. Step (a) only checks structure (a record exists, a key matches, a parent is present). It does not check whether the child's shape is compatible with the parent's shape. The missing step is a **compatibility predicate** between child and container.

**How to apply:**

1. When writing any fallback that inherits from a container, add a third step between (a) and (b): a predicate that returns true only if the child's shape matches the container's typical shape. If the predicate returns false, skip the inheritance and let the fall-through continue (usually to `unknown` / empty / null, which is usually safer than a confident wrong value).
2. "Typical shape" is usually statistical, not hardcoded. For the venue_default case: the venue's top-N historical event types, computed from DB. For category defaults: the top-N titles that fit the category's keyword vocabulary. For source defaults: the top-N fields the source reliably provides.
3. When the container has **no history** to compute typical shape from, default-reject. Inheriting from an empty prior is the same failure mode as inheriting from a mismatched prior — in both cases the inference is unsupported.
4. The predicate must run **before** the structural lookup, not after. Otherwise a fuzzy-match or alias resolution can bypass it (the Megaron case: fuzzy-matching "Μέγαρο Μουσικής" to "Μέγαρο Μουσικής Αθηνών" would have bypassed a post-hoc check).

**Code shape** (from `scripts/price-acquisition-chain.ts`):

```ts
function getX(containerKey: string, childShape: Shape, history: History): Result | null {
  if (!isChildShapeCompatibleWithContainer(childShape, containerKey, history)) {
    return null;  // refuse → caller falls through to unknown
  }
  // … existing structural lookup
}
```

**Test shape:** for each gate, test at minimum: (i) compatible child returns inherited value, (ii) incompatible child returns null, (iii) no-history container returns null, (iv) fuzzy-match doesn't bypass the gate.

## Status fields decay (2026-04-24, Session 98)

**Rule:** Any column that claims to summarize another state — `enrichment_tier`, `price_source`, `saved_to_events`, a field called `session_id` that stores something other than a session identifier — must be written at the moment the state changes AND verified against ground truth when read. Names promise; values drift. A read that trusts the name is a read of stale data.

**Four instances surfaced in one week:**

1. **`enrichment_tier='stub'` on fully-enriched events** (Session 97 diagnostic). The tier field stopped being updated somewhere in the save path. Events that passed quality gates at v4 with scores of 94+ still carry `stub`. Any filter like `WHERE enrichment_tier != 'stub'` undercount enriched events.
2. **`price_source='venue_default'` on type-mismatched prices** (Session 97 fixed). The source field said "inherited from venue default" but the venue's default didn't apply to this event's type. Name-implies-semantic-fit; value-doesn't-deliver.
3. **Commit scope doesn't match `git status` output** (Session 96 mistake, round-four of the same class). Different subsystem, same shape: `git status` presents a view that promises "this is what your commit will contain," but the index actually drives the commit. The name of the thing disagrees with the value.
4. **`enrichment_log.session_id` stores batch-within-run name** (Session 98 diagnostic). Column named for session-level aggregation, populated with values like `'batch-1'`. Two runs on the same day share `session_id='batch-1'` — aggregation by session_id collapses history. The fix is `run_id` as a new column, not a semantic change to `session_id` (because scripts/rollback-batch.ts reads session_id as a destructive filter).

**Four in one week is no longer "recurring" — it's the dominant bug class surfacing from this codebase.** Graduates from observation to working principle. Four remediation tactics:

**(a) Write at source.** The column that records "X was saved successfully" must be written at the moment of the successful save, in the same transaction if possible. `saved_to_events BOOLEAN` on `enrichment_log` is Session 98's application: set by `save-batch.ts` in the same code block that runs `UPDATE events SET full_description = ...`. Not by a downstream cron, not by a log-scraping tool. At source.

**(b) Verify at read.** Any filter that trusts a status field should carry a verification fallback — "is this really stub?" means reading the field AND checking a ground-truth signal (`LENGTH(full_description_en) > 200` for enrichment, `price_amount IS NOT NULL` for price, etc.). When the two disagree, prefer ground truth.

**(c) Name for current semantics, not aspirational.** If a column is called `session_id` and nobody writes session-level values to it, rename to `batch_label` or add `run_id` as the real-semantic companion. Aspirational names invite readers to write queries that aren't supported by the actual values.

**(d) Add a new column instead of repurposing.** When you find a status field whose values don't match its name, adding a new column with clean semantics is almost always cheaper than migrating the old one's values. Downstream readers of the old column might be using the broken semantics as a feature (rollback-batch.ts treats `session_id='batch-1'` as a targeting key, not a session identifier). Migration risks breaking those. New column keeps the blast radius at zero.

**Future pressure test:** if a fifth instance surfaces in the next two weeks, elevate the principle to a `no-bypass.test.ts`-style architectural guard — grep for `SELECT ... FROM X WHERE status_field = ...` patterns across src/ and flag them for review.

## Observability at the source (2026-04-24, Session 98)

**Rule:** When the thing being observed and the observation of it are written by different code paths, the observation drifts from the thing. Keep them in the same code path.

**Session 98 application:**
- `saved_to_events BOOLEAN` is written by `save-batch.ts` in the same function as the `UPDATE events` call. If the UPDATE succeeds, `saved_to_events=1`. If it throws, `saved_to_events=0`. Both paths write a log row. The observation and the thing are the same commit.
- `auto-enrich.sh` used to infer save count from subprocess exit code (a proxy on a different code path). Session 98 replaced that with a direct DB query against `saved_to_events`. The wrapper doesn't infer anymore; it reads.

**Counter-examples (what this rule is not):**
- Not an argument against monitoring or logs. Logs are fine; they're observability of observations. The rule is about the first observation layer — the one closest to the event — being written at the event.
- Not an argument against async observability. A queue-then-persist observability pipeline is fine IF the initial "we did this thing" record is written at the thing. The queue/pipeline is a transport; the source-of-truth write happens in the same code path as the action.

**How to apply:**

1. When adding an observability signal, ask "where does the thing-being-observed happen?" — that's where the observability write should happen, not some log-scraping or exit-code-inferring cron that runs later.
2. When fixing an observability bug, the fix is often "move the write earlier, into the same function as the action." Not "make the later layer smarter about inferring what the earlier layer did."
3. S91 discipline still applies: observability writes must be best-effort (wrapped in try/catch) so they never block the action. The discipline "write at source" is compatible with "never kill production path" — put the try/catch around the observability write, not the action.

## Spot-check event IDs have ~24-hour shelf life — re-query at time of use (2026-04-24 → promoted to standing rule 2026-04-28, Session A)

**Standing rule:** A spot-check event ID in a plan or scratch file is a **claim about a moment in time, not a permanent reference.** Treat it as cached data that expires. Always re-query the originating filter at the time of use, even if the ID was captured earlier in the same session. **Within the same conversation, datasets can shift by 20%+ as events roll past** — Session A observed this directly: 609 future events at Step 5 first run → 473 at Step 5 second run within the same arc.

**Why it matters:** Event-date-bound data decays faster than other project data. A plan authored on day N referencing "the Lah Porella event at Ilion Plus" works on day N (event upcoming) but silently breaks by day N+K (event past, Tier 0 guard fires, cascade never exercises the intended path). Pre-A caught this when the originally-cited Lah Porella event (2026-04-23) rolled past 2026-04-24. Session A then re-witnessed it: spot-check IDs captured at the start of Step 5 needed re-querying by the end of the same step.

**Counter-example (what this is not):** Not an argument against naming specific events in plans — concreteness is valuable for review and reproducibility. The rule is "concreteness + date annotation + ALWAYS re-query at time of use," not "never reference specific events."

**How to apply:**

1. When a plan or scratch file cites an event ID, always include `start_date` beside it. Future readers (including the author) can see at a glance whether the reference might have decayed.
2. **Re-query before use, every time.** Even if you captured the ID 30 minutes ago and the conversation hasn't ended. The query takes seconds; debugging a stale-ID failure takes much longer.
3. When writing spot-check sections of session plans, prefer **queries** over static IDs. "Earliest future ticketed event at venue X" continues to return valid results; a static ID does not.
4. When documenting findings in scratch files like `specs/session-*-event-ids.md`, timestamp the capture moment in the file body (not just in filesystem metadata). Makes drift obvious on re-read. Add a one-line "shelf-life note" for any event whose `start_date` is within 14 days.
5. If the spot-check ID rolled past mid-session, **don't try to validate using a past event** — the past-event guard short-circuits the cascade you were trying to test. Re-pick a future event via the same query family, or document "no live test case currently — unit test only" in the session record and move on.

## Continue read-only work when blocked for planner decision (2026-04-24, Pre-A)

**Rule:** When a session stops to await a planner decision, the executor should continue any read-only or diagnostic work in parallel that doesn't depend on the blocked decision. Don't idle. Don't wait for the decision before running the next read-only check that would have happened anyway.

**Why it matters:** Planner decisions take non-zero time (minutes to hours in synchronous sessions, longer when async). During that window, the executor's session state — loaded files, warm caches, active tool connections, accumulated context — is at its peak relevance to the task. Wasting that window means re-bootstrapping some of that state when the decision comes back. Worse, the executor forgets incidental observations ("while I was poking around I noticed...") that would have informed the planner's decision if surfaced in time.

**Session Pre-A demonstrated this:** when Step 2 (migration 007) stopped for the Option A/B/C decision on `_migrations` tracking drift, the executor continued with Step 1's writer enumeration (read-only, independent of the blocked decision), so when the planner approved Option A the writer list was already known and Step 3 scope could be reported confidently as part of the resumption. The planner's decision window cost near-zero context time.

**What counts as "parallel-safe while blocked":**
- Read-only DB queries (counts, samples, schema inspections)
- File reads + grep surveys for enumeration
- Documentation review (reading decisions.md, CLAUDE.md, known-issues.md for related context)
- Capturing observations into a scratch file in `specs/`

**What does NOT count (don't do these while blocked):**
- Anything that writes to files the planner's decision might direct you to write differently
- Running the subject-of-decision itself (e.g. if the decision is "should we run migration X", don't run migration X)
- Anything that changes DB state, git state, or external services

**How to apply:**

1. When you stop for a planner decision, name 1-3 read-only tasks that would inform or follow the decision. Do them. Include their results in the same message where you present options for the decision.
2. If nothing read-only is useful, say so. Don't invent busy-work.
3. When reporting results, keep the blocked decision front-and-center. The parallel work is context, not a counterproposal to the decision.

## Pipeline phase isolation requires .gitignore audit, not just code-level locks (2026-04-28, S97a/S97b)

**Rule:** Constitution Rule #5 ("phases independently failable") needs an operational corollary: phases must also be **independently file-isolated** — anything one phase writes to the working tree is fair game for any later phase that runs `git add`. A pipeline that uses `git add -A` (or a permissive equivalent) erases the file-isolation between phases unless `.gitignore` is comprehensive.

**Why it matters:** S97a Step 5 (CHECK migration) created 3 forensic backup files in `data/`. S97a was conceptually isolated from the freshness pipeline by code-level locks (`.auto-enrich.lock`, `.pipeline-enrichment.lock`) — neither phase modifies the other's files. But the 08:00 freshness cycle ran its routine `git add` step, swept the untracked backup files, committed and pushed them to origin (~150 MiB binary blobs in commit ff8bcaf82). The locks did their job. The `git add` step did not — because `.gitignore` had no glob for `data/events.db.*`. Forensic intent (keep backups) and pipeline intent (commit changes) were on a collision course that lock-based isolation didn't catch.

**How to apply:**

1. **Step 0 of any plan that creates files in tracked directories:** grep `.gitignore` for coverage. If the new files don't match an existing rule, add the rule before creating the files.
2. **When reviewing a plan that creates artifacts (backups, snapshots, dumps, intermediate logs):** ask "where do these files live, and would the daily/freshness `git add` step pick them up?" If yes, demand the gitignore patch as a precondition.
3. **For pipelines using broad `git add` (`-A`, `.`, glob patterns):** maintain a `.gitignore` discipline that's strict-by-default. Better to add `data/*.bak`, `*.snapshot`, `*.tmp` patterns prophylactically than to remediate post-leak.

**Bonus corollary — known caveat:** This pattern doesn't help if `.gitignore` itself has the wrong rule. The S97a leak's `.gitignore:40` had `data/events.db` (literal, no glob). A reviewer scanning the plan against the gitignore would have seen "events.db is gitignored" and not noticed the literal-vs-glob distinction. Step 0 grep should look for the *actual* file pattern, not the family it belongs to.

## DB migrations run through `bun run scripts/run-migrations.ts`, never `sqlite3 < file` (2026-04-28, S97a)

**Rule:** Migrations on this project execute via `bun run scripts/run-migrations.ts` (which uses `bun:sqlite`), never via the system `sqlite3` CLI. The two SQLite runtimes have different feature sets, and the divergence is silent until a feature-specific statement runs.

**Why it matters:** macOS-shipped `sqlite3` does not include the FTS5 module. The project's `events_fts` virtual table is FTS5 (`content=events, content_rowid=rowid`). Any migration that touches FTS5 — `DROP TABLE events_fts`, `CREATE VIRTUAL TABLE … USING fts5(...)`, `INSERT INTO events_fts(events_fts) VALUES('rebuild')` — errors at runtime on the system CLI with `Error: in prepare, no such module: fts5`. The CLI accepts the file (parses ok); failure is execution-time. S97a v3 plan prescribed `sqlite3 < file`; pre-flight smoke test surfaced the divergence before any destructive operation.

**How to apply:**

1. **Author migrations in `src/db/migrations/NNN-description.sql`** (the runner's discovery path). Use the next available number per `ls src/db/migrations/`.
2. **Apply via `bun run scripts/run-migrations.ts`**. The runner wraps each migration in BEGIN/COMMIT, tracks applied state in `_migrations`, rolls back on error, and uses `bun:sqlite` (FTS5-capable).
3. **Do NOT use `sqlite3 < file` even for "simple" migrations.** The simplicity is illusory if the project schema includes any feature missing from system sqlite3. Even non-FTS5 migrations should go through the runner for `_migrations` tracking and the audit trail (`applied_at`, `applied_by`).
4. **For one-off manual queries** (read-only inspection, ad-hoc fixes): `bun -e 'import { Database } from "bun:sqlite"; ...'` is safer than `sqlite3 data/events.db "SELECT ..."` — same FTS5-capable runtime as the application uses. The `sqlite3` CLI is fine for `.schema` / `PRAGMA` / `SELECT` on non-FTS5 tables, but defaulting to `bun:sqlite` removes the divergence trap entirely.

**Detection signal:** if a migration plan shows `sqlite3 < file` AND the project has FTS5 (or any other compile-time-optional SQLite feature), flag the runner choice as Step 0 of the review.

## URL-path exclusion for source-boundary bugs: config deletion + deny-list mechanism (2026-04-28, S100)

**Rule:** When a scraper ingests out-of-scope URLs because of a config error, the fix has two orthogonal layers and you ship both: (1) **point-fix** — remove the specific URL from the source's allow-list at discovery time; (2) **category-fix** — add a per-source `excludedUrlPatterns` deny-list checked at save time, so future config errors and same-class regressions are caught even if the allow-list grows again.

**Why it matters:** Point-fix without deny-list treats each case as novel — a future contributor who re-adds a section URL to the allow-list (or a new source whose URL taxonomy mixes cultural and out-of-scope paths) will recreate the same leak. Deny-list without point-fix leaves the active scraper still hitting and parsing out-of-scope URLs every cycle, only for the save-time filter to reject them — wasted compute and a noisy log signal that makes legitimate failures harder to spot. The two layers protect different failure modes (config drift vs operational waste). They're independent — adding one doesn't reduce the value of the other.

**Why URL-path beats keyword/venue at this layer:** A title like `ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 2025-2026` slips a Greek-keyword filter that has nominative `αγώνες` but not genitive `αγώνων` (Greek inflection blind spot — separate follow-up). A regional sports arena like `Κλειστό Καλλιθέας` slips a venue list that names ΟΑΚΑ/Καραϊσκάκης/SEF but missed the smaller venue. The URL path `/tickets/sports/` is **the source's own categorization** — the most authoritative signal available, language-independent, and stable as title formats and venue names evolve. Type-based filtering downstream (e.g., delete `type='sports'`) is a third-class defense — it depends on a categorizer that may itself be the cause of the leak.

**How to apply:**

1. **Layer 1 (point-fix at discovery):** Find the source's URL allow-list (often a hardcoded array in a per-source scraper). Remove the offending entry. This stops the scraper from hitting the URL at all.
2. **Layer 2 (deny-list at save):** Co-locate URL deny-list with existing keyword/venue deny-list (e.g., extend `event-scope.json` with `excludedUrlPatterns: string[]` rather than create a new config file — one mental model, one config). Run the URL check **before** any allow-overrides, because URL-path policy is source-boundary and not defeatable by content overrides (e.g., a "ballet" override that legitimately resurrects a sports-venue event must NOT resurrect a `/tickets/sports/` URL).
3. **Tests:** Cover (a) URL-match excludes, (b) no-match passes, (c) URL deny-list overrides allowed-keyword overrides (locks the precedence decision), (d) events without a URL field still work (backward-compat).
4. **Prefer extending existing scope-filter mechanism over creating new files.** If the project already has a `shouldExcludeEvent`-style validator running at every save, add the URL check there. Avoids fragmenting "what does it mean for an event to be in scope" across multiple validators.

**Detection signal:** when reviewing a leak that originated from a scraper's URL allow-list, ask "would a deny-list at save time have caught this even if the allow-list change reverted?" If yes, ship both layers; do not rely on the allow-list edit alone.

**Related anti-pattern (do NOT do):** Add the URL deny-list to a config file that has no active code consumer. Verify config consumers via grep before writing — see `mistakes.md` S100 entry on `scrape-list.json`.

## Coverage metrics need definition before threshold gates (2026-04-28, Session A)

**Rule:** Any plan that contains a branch gate of the form "if coverage ≥ X% do A, else do B" **must define the metric explicitly in decisions.md before the gate fires.** Without explicit definition, the executor faces an ambiguity that is technically a planner decision and produces avoidable round-trips at the worst moment — when both options are viable and the answer changes the next session's scope.

**Why it matters:** Session A's plan said "≥ 90% → skip curation; 70–90% → curate; < 70% → diagnose." When the executor produced two valid coverage numbers (64.5% real-URL only vs 74.2% with `door_only` counted as actionable), neither answered the gate definitively without a planner decision. Both interpretations are defensible; the plan didn't say which. The executor surfaced both, the planner aligned on which to use, but the round-trip happened at the most context-expensive moment (after the dry-run, with the result on screen).

**The core failure mode:** plans treat metrics as obvious because their authors have an implicit definition in mind, but executors faithfully implementing the plan can compute multiple equally-defensible numbers from the same dataset.

**How to apply:**

1. When writing a branch gate based on a percentage, **inline the metric definition next to the threshold**. Example: `"Coverage = (count where status produces a non-null ticket URL) / (count of in-scope events). door_only counts as covered because it produces a valid CTA, just without URL."` That sentence in `decisions.md` D-section would have removed the ambiguity end-to-end.
2. If the metric has multiple reasonable variants, **say which variant the gate uses** and (optionally) report the others for context. "The gate uses real-URL coverage; report total-actionable-CTA alongside for visibility."
3. When the executor encounters a metric ambiguity at gate-fire time, the right move is **not** to pick one and proceed. It's to surface both with the framing "the gate requires a planner-level metric definition; here are the two reasonable readings." That converts a silent-wrong-answer risk into an explicit alignment moment.
4. Retroactive fix when ambiguity is found: **add the definition to the relevant `decisions.md` D-entry** (not to the plan, which is ephemeral). Future sessions referencing the same gate inherit the resolved definition automatically.

**Counter-example (what this is not):** Not an argument against having gates — gates are useful for branching. The rule is "gate + metric definition together," not "no gates."

## Time-correlated data shifts during long-running session arcs (2026-04-28, Session A)

**Rule:** Plans referencing **absolute counts** of time-bound data (events, posts, tickets, jobs) become brittle when the session takes more than a day. Reference **proportions or thresholds** instead, or include an explicit "re-baseline before gating" step. Long-running session arcs see datasets shift by 20%+ even within a single conversation.

**Why it matters:** Session A's plan said "expect ≥ 600 future ticketed events" as a Step 0 verification gate. By the time Step 5 ran (two real-world days later in the same conversation arc), the count had drifted from 609 → 473 — a 22% shift. If "≥ 600" had been a hard gate later in the plan, the session would have stalled needlessly. The plan absorbed this drift gracefully because the threshold was only at Step 0; if the same threshold had been at Step 5's branch gate, it would have produced a false-failure stop.

**The core observation:** absolute counts of time-bound data are valid as **point-in-time measurements**, not as **persistent invariants**. A plan that references them as invariants will silently rot.

**How to apply:**

1. When a plan needs a numeric threshold, prefer **proportions over absolute counts** wherever the underlying dataset is time-bound. "≥ 70% real-URL coverage" survives a 22% dataset shift; "≥ 600 events resolved" does not.
2. When an absolute count is unavoidable (e.g. "≥ 100 events for the dry-run to be statistically meaningful"), **co-locate it with a re-baseline step**: "Step N — re-verify count before gating on it. If the count has shifted by more than ~20%, re-evaluate the gate's premise rather than failing closed."
3. For multi-day session arcs, **timestamp every numeric reference in plans/scratch files** with the day it was captured. The reader can then judge for themselves whether to re-query.
4. **Avoid daisy-chaining counts across sessions without re-verification.** Session N captures "608 future events"; Session N+3 plan says "process the 608 events from Session N." Wrong by Session N+3. Right form: "process the future-event set as defined by query Q at session start."

**Combined with the spot-check shelf-life rule above:** these are the same underlying issue applied to different data types. Absolute counts are aggregate spot-checks; spot-check IDs are individual-row spot-checks. Both decay; both need re-query at time of use; both are silent-wrong-answer hazards in long-running session arcs.

## Stdout-mtime watchdog wrapper for unattended LLM CLI invocations (2026-04-28, S99)

**Rule:** When invoking `claude -p` (or any unattended LLM CLI) from a launchd-scheduled bash script, layer multiple independent timeout gates and tag which one fires for forensics. A single gate is fragile; layered gates with explicit attribution make every future failure debuggable.

**Why it matters:** GitHub Issue #25979 + the Apr 25-26 cascade documented that `claude -p` can stay alive at 0% CPU mid-thinking-block with no SSE event progress. The server-side stream watchdog Anthropic shipped in v2.1.105 (`CLAUDE_STREAM_IDLE_TIMEOUT_MS`) catches these — but launchd has no idle gate of its own, and a hung process can sit at 0% CPU through clamshell sleep, network blips, or unrecognized stall variants. Without a client-side gate, recovery depends entirely on the server-side path being right, with no fallback. S97a's reframe (recovery-asymmetry) was inevitable as long as one gate carried all the weight.

**Layered gate architecture (S99 production model in `scripts/auto-enrich.sh:309-389`):**

1. **Server-side stream-idle (v2.1.105+)** — kicks in at `CLAUDE_STREAM_IDLE_TIMEOUT_MS` (default 300000=5min). Detected post-hoc by grepping the per-batch stdout file for the watchdog signature. KILL_CAUSE log: `server-stream-idle pid=… elapsed=…s exit=<claude-exit>`.
2. **Client-side stdout-mtime watchdog (S99)** — in a bash watchdog subshell, poll `stat -f %m "$BATCH_OUT"` every 15s. Kill the child if mtime hasn't advanced in `STDOUT_IDLE_CAP` (default 120s) seconds. KILL_CAUSE log: `stdout-idle pid=… elapsed=…s idle=…s exit=125`.
3. **Wall-clock outer fence (legacy + S99 tightened)** — `BATCH_TIMEOUT` (S99 = 900s, was 1800). Belt-and-suspenders for any stall mode the inner two miss. KILL_CAUSE log: `wrapper-wall-clock pid=… elapsed=…s exit=124`.

**How to apply (executable spec):**

1. **Use direct file redirect for stdout, NOT pipe.** macOS pipe block-buffering is 4-8 KB (Issue #25670). Pipe-buffered output makes mtime advance unreliable. Direct redirect (`> "$BATCH_OUT" 2>&1`) gives unbuffered byte-level mtime updates.
2. **Per-batch output files in parallel-batch models.** A shared LOG_FILE has its mtime advanced by other batches' output, masking a stalled batch. Each batch needs its own file: `$LOG_DIR/.batch-${BATCH_NAME}-${RUN_ID}.out`. Append to the main log on completion; keep the per-batch file on failure for forensics.
3. **`stat -f %m` is BSD/macOS; use `stat -c %Y` on Linux.** Add a comment marking the platform dependency.
4. **Watchdog subshell polls `kill -0 "$CHILD"` to short-circuit when the process exits cleanly.** Without it, the subshell wastes the full timeout duration.
5. **KILL_CAUSE log format is fixed: `KILL_CAUSE: <gate> pid=… elapsed=…s [idle=…s] exit=…[ batch=…]`.** Structured suffix (key=value pairs) so future log analyzers can parse without ambiguity.
6. **Each gate's exit code is distinct and meaningful.** 124 = wrapper-wall-clock; 125 = stdout-idle; 143 = SIGTERM (what wait() sees when the watchdog killed); whatever claude returns = server-stream-idle.
7. **Validate the synthetic-stall path with a re-runnable artifact** (`/tmp/spike-stall-test.sh` — replaces `claude -p` with `sleep N` to exercise the kill path independent of the live API). Re-run after any wrapper change or STDOUT_IDLE_CAP retune.

**Why both server-side AND client-side (not just one):** they catch different failure modes.
- Server-side: API-level stream stalls. Anthropic infrastructure decides "this stream is stuck."
- Client-side: local-process stalls (DNS hang, TLS handshake timeout, kernel-level I/O block, post-recv processing loop). The process is alive, the API isn't sending, the local watchdog notices stdout isn't growing.

If you only ship one, you have one failure-mode coverage. Two layered gates with KILL_CAUSE attribution let you observe which mode is dominant in production and tune accordingly. Without attribution, you're flying blind on which gate is doing the work.

**Watchdog-era observation pattern:** before landing the wrapper, capture a baseline (frequency of stalls, cascade days, time-to-failure distribution) in a `specs/<session>-baseline-floor.md` artifact. Define a 14-day post-land window. Track KILL_CAUSE distribution across the window. Healthy distribution: server-side catches >80%; client-side catches the residual stall variants; wrapper-wall-clock and outer perl-alarm rates are ~0% (they're only doing work if all inner gates miss).

## Sampled-corpus audit via live sitemap (2026-04-28, S100a)

**Rule:** When auditing schema-correctness or any other content property across a large generated corpus, prefer **live sitemap sampling** over local-dist scanning when (a) ground truth is what consumers see (AI engines, crawlers, search), and (b) local dist may be incomplete or out of sync with production. The sitemap is authoritative for "which URLs the site claims exist" and HTTP-fetching those URLs gives the same bytes the consumer sees.

**Why it matters:** S100a's original plan called for scanning local `dist/` for 12,300 pages. Local dist had 45 pages (build was a partial/skeleton). Pivoting to live audit via sitemap got the same answer in 15 seconds (314 URLs at concurrency=10) without depending on local-build correctness.

**How to apply:**

1. **Fetch the sitemap index first.** `https://<origin>/sitemap-index.xml` lists sub-sitemaps (events / venues / editorial / etc.). Parse `<loc>` tags from each.
2. **Sample per page class with statistical confidence in mind.** For binary classification (correct / incorrect):
   - Full corpus (or near-full) for small classes (<100 URLs).
   - 200-400 of N for large classes (>1000 URLs). At N=9186, sample of 200 (2.2%) gives 95% CI of 0–1.5% true rate if 0 misclassified — high-confidence falsification.
   - The 95% CI rule: if k of n misclassified, the binomial upper bound is approximately `k/n + 1.96 * sqrt(k(n-k)/n^3)`. For k=0 use Wilson upper of `~3/n`.
3. **Concurrency = 10** is polite for Netlify. ~3-5 min wall-clock for 300+ URLs.
4. **Distinguish failure modes in classification.** A row that fails the audit can be one of:
   - Real misclassification (the hypothesis under test) — count toward tier
   - HTTP 404 (page in sitemap doesn't exist) — separate finding (sitemap-vs-build inconsistency)
   - HTTP 5xx / network error — re-test or flag as transient
   - Page returns 200 but emits no relevant data (e.g., no JSON-LD) — separate finding (completeness gap)

   The audit script's classifier should NOT lump all `match=false` together. S100a's script did, leading to a misleading auto-tier of "Tier 1" when the real result was Class 0 (manually reclassified).

5. **Output: structured findings file with three sections** — Step 0 (sitemap counts), Step 1 (small-sample preview), Step 2 (full-sample classification per URL class). Include both auto-classified AND manual-reclassified verdicts when they differ; explain the divergence.

**Limitations:**

- HTTP-based audits hit production; rate-limit politely, don't audit during traffic peaks.
- Sample-based results don't prove the corpus is clean — 0/200 events misclassified means 95% confident the rate is <1.5%, not 0. A second audit at a higher sample rate (or full corpus pass) is the right escalation if the result is borderline.
- Sitemap-based audit assumes the sitemap is correct. If the sitemap omits URLs, those URLs aren't audited. Cross-check sitemap URL count against build manifest if rigor is needed.

## KPI pipeline architecture: separate read-mostly DB + baseline-as-deliverable (2026-04-28, S100)

**Rule:** When standing up a new KPI/observability data pipeline that crosses multiple sources (vendor APIs, manual CSVs, server logs, manual observations), use a separate read-mostly SQLite database with normalized per-row tables — not a CSV append log, not a column added to an existing operational DB. And capture the pre-amplification baseline as a written artifact BEFORE the system goes live.

**Why it matters:** S100 set up `data/kpi.db` separate from `data/events.db`. Different write patterns (KPI is append-mostly, low frequency; events is write-heavy from scrapers/enrichment), different backup cadence, different consumer surface (analytics queries vs application reads). Mixing them would force every events.db backup script to also handle KPI, bloat events.db backups, and entangle two unrelated rate-of-change profiles.

**The baseline-as-deliverable side is independent and equally important.** Without `specs/s100-kpi-baseline-<date>.md` capturing the empty-state at S100 land, "first citation appeared on May X" is ambiguous between "first citation ever" vs "first citation we noticed." The honest empty-state IS the deliverable for the comparison anchor.

**How to apply (KPI pipeline architecture):**

1. **Schema-first migration** (`scripts/kpi-init.ts`): all tables + indexes in one idempotent script. Run with `--status` flag to dump table counts. Don't bundle data-import logic into the schema script.
2. **Separate config from code for the things that change** (`config/tracked-prompts.json` for the 5 GEO Strategist priority prompts). Seed script reads JSON, INSERT OR REPLACE into the seed table. Updates become 1-line config edits, not code changes.
3. **Per-row tables, not aggregate counters.** Even if the dashboard report shows daily totals, store per-query / per-page / per-engine rows. Aggregates are queries; row-level data is recoverable detail. The S91 (`data/search-visibility-log.csv`) aggregate-counter approach is COMPLEMENTARY (good for trend lines), not a substitute. Keep both; do not consolidate.
4. **Manual-CSV importer pattern for vendor exports without APIs.** Bing Webmaster Tools, Netlify access logs (free tier), any vendor that doesn't expose machine-readable exports: ship the importer accepting `--file=<path>` arg, document the manual download workflow in `docs/<thing>-setup.md`. The importer being functional and exercised against a real (often zero-row) CSV is the deliverable.
5. **Vendor API auth as operator action, not autonomous code.** Service accounts + JSON keys + property linkage are security-relevant; defer to a separate session where the user does the Google Cloud Console setup before the importer ships. The importer's auth-pending fallback is "scaffold + `docs/setup.md` operator workflow."
6. **Gitignore the DB.** `data/<thing>.db`, `data/<thing>.db.*`, `-shm`, `-wal`. S97b lesson: pipeline `git add` will sweep the DB if not blocked at the gitignore level.

**How to apply (baseline-as-deliverable):**

1. **Capture before any amplification work lands.** S100 baseline captured BEFORE S101a-d cornerstone rewrites. The before/after window must be measurable from a fixed floor.
2. **Write zero-state honestly.** "n/a (auth pending — S100b)" is better than fabricating values. Honest absence is better than fraudulent presence.
3. **Cross-reference adjacent sessions' findings.** The baseline file links to S100a's Class 0 audit + S97a's known-issues entries; future readers can trace the corpus state across sessions.
4. **Define re-evaluation criteria + trigger conditions.** "Zero non-zero deltas by date X" → action Y. "Citations land but rank 4+" → investigate Z. Without explicit triggers, the baseline becomes nostalgic data instead of an actionable comparison anchor.
5. **Read-only after land.** The baseline file documents one moment; updates go in retro files (`specs/s100-kpi-amplification-results.md`) or session logs, not by editing the baseline.

**Limitations:**

- The "minimum viable checkpoint" framing (Path B) only works when manual logging carries the citation arc. If the watchdog window is short and manual logging cadence is too slow, the auth-pending importers are critical-path and the deferral hurts. S100's 4-week pre-I/O window + weekly Friday cadence + binary first-citation event makes Path B viable; tighter timelines would force Path A or Path C.
- KPI databases inevitably grow some operational write patterns (insert-on-import). Watch for the database becoming a hot path for any user-facing query — if it does, it has crossed the line from "read-mostly" and needs operational tooling (backup script, migration runner, etc.) to match.

---

## Pattern: City-config currency single-source — known incomplete

**Date:** 2026-04-30 (country/currency single-source session)

**Context:** `src/utils/schema-geo.ts` now exports `getCountryCode()` and `getCurrencyCode()`, sourcing from `config/city-geodata.json` (`country.code`, `country.currency`). All 5 hardcoded `'GR'` sites and all 5 hardcoded `'EUR'` sites in **JSON-LD schema emitters** now route through the accessors. Diagnostic missed one EUR site (`src/templates/page.ts:417`) — found during execution and added to the refactor.

**What's still hardcoded (intentional — different concern):**

- `src/utils/normalize.ts` — 9 sites (lines 126, 148, 158, 168, 178, 188, 198, 217, 223). Price-string parser fallbacks; produce `{currency: 'EUR'}` on the in-memory `Price` object during scraping/import.
- `src/db/database.ts:85` — `$price_currency: event.price.currency || "EUR"`. DB write fallback at the persistence boundary.

**Why these stayed literal:** parser/persistence defaults vs. schema emission are different concerns. A parser fallback's job is to be a known-safe constant when input is missing — making it depend on config-loading order is a regression. Schema emitters, by contrast, run during build where failing-loud is fine and a single source of truth removes shotgun surgery when more cities land.

**Rule of thumb after this session:**
- **JSON-LD or microdata block** → `getCountryCode()` / `getCurrencyCode()` accessor.
- **Default object spread, parser fallback, DB write** → keep the literal `'EUR'` / `'GR'`.
- Easy to grep, easy to enforce in review.

**Revisit trigger:** when Barcelona/Berlin (or any second city) configs land. At that point determine whether parser fallbacks should pull from the active city's config or stay as defensive literals. Until then, 10 `'EUR'` literals in `normalize.ts` + `database.ts` are intentional, not technical debt.

**Why `validFrom` was removed in the same session:** `event.createdAt` was being emitted as the schema.org `offers.validFrom` value — but that's "when our DB row was created," not "when tickets went on sale." Wrong signal is worse than no signal. schema.org marks the field optional, no validator enforces it, zero tests asserted it. Future column `tickets_on_sale_at` will repopulate when scrapers can capture it. Strategist decision 2026-04-29.

---

## Pattern: Shared YAML config + thin TypeScript loader (with `\b` ASCII gotcha)

**Date:** 2026-04-30 (S100b banned-phrases YAML loader)

**Context:** `config/banned-phrases.yaml` (delivered by Editorial Director) became the single source of truth for editorial banned-phrase enforcement. `src/utils/load-banned-phrases.ts` mirrors `src/utils/editorial-content.ts` shape (module-level cache, `import.meta.dir` paths, try/catch → empty fallback) and adds three things specific to per-language rule packs. This is the loader convention to reuse for any future per-language rule set: F1 binary criteria, ED writing-guide rules, multi-city per-locale config.

**Loader convention:**

1. **YAML carries data, TypeScript carries dispatch logic.** Schema: `<root>.{en|el}.absolute` (flat list of strings) + `<root>.{en|el}.contextual` (objects with `phrase` + machine-readable context). Adding rules is a YAML edit; adding a *match mode* is a code change.
2. **`re:` prefix dispatch.** A contextual entry's `phrase` is literal by default, OR a regex if prefixed with `re:`. One seed entry covers ~10 inflection forms in EL via a single regex while EN entries stay readable as literals. Two match modes, one schema, zero bloat.
3. **Path-keyed `Map<string, T>` cache** instead of single-slot. Tests can pass an alternate fixture YAML without polluting the default cache. Costs ~3 lines vs `editorial-content.ts`'s single-slot pattern; pays for itself the first time someone wants to test edge cases without hand-editing ED's seed.
4. **Graceful regex degradation at load time.** If a `re:` pattern fails `new RegExp()`, warn + flip `isRegex: false` + continue. A single seed typo doesn't kill the loader.
5. **Loud fallback (extension to `editorial-content.ts` pattern).** `editorial-content.ts` silently returns empty when its JSON is missing — fine for vignettes. For banned phrases, silent absence means EW prompts ship without rules, which is invisibly dangerous. Loader `console.warn`s once on fallback. Worth the noise.

**The `\b` ASCII gotcha (don't repeat this — JavaScript-specific):**

ECMAScript `\b` is **ASCII-only even with the `u` or `v` flag.** `\w` (which `\b` is built on) only matches `[A-Za-z0-9_]` regardless of regex flags. So `\bζωντανή\b`, even with `'iu'`, never matches Greek text in JS. Python `re` and most other engines respect Unicode in `\b`; ED's seed assumed that behavior. The brief's "use 'iu' for Unicode `\b`" instruction was based on the same misconception — verify before trusting.

**Workaround applied in the loader (preserves seed verbatim):**

```typescript
const UNICODE_WORD_BOUNDARY =
  '(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))';
function unicodifyBoundaries(pattern: string): string {
  return pattern.replace(/\\b/g, UNICODE_WORD_BOUNDARY);
}
```

Substitute `\b` → Unicode-aware boundary at compile time. `\p{L}` (Unicode letters) + `\p{N}` (numbers) + `_` covers the word-char concept across Greek + ASCII. Lookbehind/lookahead asserts a transition in either direction. Combined with `'u'` flag for Unicode case folding. ED's note 2 in the seed YAML implicitly authorized this transformation as an alternative to migrating the seed to explicit alternation.

**Rule of thumb:**

- Any `\b` in a JS regex that needs to match non-ASCII text → must be substituted at compile time, not left raw.
- The seed YAML stays correct (patterns are universally readable). The loader handles the JS-specific quirk.
- If the same YAML is later consumed by a Python F1 evaluator, **do not apply the substitution there** — Python `re` honors Unicode `\b` natively. The transformation is per-runtime, not per-seed.
- For any future loader that may parse user-supplied regex (vs ED-curated): test with non-ASCII input early, even if all known seed entries are ASCII today.

**Limitations:**

- The Unicode-aware boundary is *approximate* — it treats anything in `\p{L}` ∪ `\p{N}` ∪ `_` as a "word char." Strict standards (e.g. UAX #29 word segmentation) are more nuanced. Fine for banned-phrase matching across natural-language editorial copy; not appropriate for tokenizer-grade work.
- Cache key is the resolved path string — symlinks and `./foo` vs `foo` would create separate cache slots. Acceptable for a config loader; would matter for a hot-path file cache.

---

## Pattern: Coordinated validator + emitter changes — ship as one commit

**Date:** 2026-05-02 (Sprint 1 Session 3 closeout)

**Context:** Sprint 1 Sessions 2 + 3 reworked the JSON-LD `offers` contract. Three sessions, two halts, one coordinated commit. The lesson is reusable: when a validator enforces a contract that an emitter is changing, splitting the work across sessions or commits creates an unstable middle state.

**The mistake (S2):** Plan said "validators are Session 3" — implying validator changes could ship after the emitter rewire. Reality: the validator lists `'offers'` in `MANDATORY_FIELDS` uniformly. When the emitter started omitting offers on `EventCompleted` events, the validator flagged 8194 errors (~92% of corpus). Hard stop and revert the emitter; ship classifier + helpers as standalone utilities.

**The fix (S3):** Re-apply the emitter rewire *paired* with the validator extension in a single commit. Validator and emitter ship together or not at all. Single-test-suite green is necessary but not sufficient — the build-time invariant (schema completeness ≥98%) is the contract check that catches the coupling.

**Rule:**

1. **Identify validator-emitter pairs early.** Before splitting work, grep for every code path that enforces the contract you're changing. `MANDATORY_FIELDS` list is one signature; per-rule conditional checks are another. There may be 2+ files.
2. **One commit per contract.** Validator update + emitter update + types + tests = one commit. Bisect-friendly.
3. **The build is the contract test.** Tests can be green and the build still fail when emitters and validators disagree about what the schema looks like. Schema completeness (or equivalent build-time invariant) is the coupling detector.
4. **Discover stale-state surprises before committing.** Clean-rebuild side effects (orphan dirs in dist/, cached HTML with old shape) can surface alongside contract changes. They're not regression — they're the validator newly seeing what was always wrong. Diagnose vs. silence-the-alarm; they're different.

**Why:**

- Stable middle states matter for git bisect, deployments, rollbacks.
- The "I'll fix the validator next session" plan creates a window where the emitter looks broken; either you ship the broken state to production, or you stash the work, or you can't merge anything until both sessions complete.
- Strict validators are *more* valuable than loose ones — they catch contract drift at build time. The cost is they constrain how you can split work.

**How to apply:**

- When proposing to split contract work across sessions, ask: "What is the build-time invariant that proves the contract holds?" If it's "schema completeness ≥X%", the emitter and validator must move together. If there's no build-time invariant, they can split.
- When a validator change is coming, find every code path that enforces the related rule. `grep -rn 'CONSTANT_NAME\|relevant_field_name'` is rarely enough — a per-rule conditional in another file may be invisible to constant-search.
- When a build flags a category of errors after an emitter change, the question is: "Is this category the spec contradiction, or stale state in build outputs?" Both are real findings; both need different fixes (spec callout vs. clean rebuild + orphan sweep).

**Limitations:**

- This pattern is for build-time contracts. Runtime contract changes (e.g., API schemas) have different deployment shapes — reverse-compatibility windows, dual-write phases, etc.
- "One commit" assumes a single repo. Polyrepo pairs (separate emitter and validator services) can't ship one commit; they need a coordinated deploy with shared protocol versioning. The principle still applies (don't deploy them in opposite order); the mechanism differs.

---

## Pattern: Append-only CSV match-firing log for rule-curation observability

**Date:** 2026-05-02 (S100c)

**Context:** F1 quality-gate enforces banned phrases sourced from `config/banned-phrases.yaml` (ED-curated). When a rule fires (a banned phrase is matched in production text), we want to know which rules fire most so ED can decide which absolutes warrant promotion to contextual, and which contextual entries should tighten or loosen. This is *rule-curation observability* — not enforcement state, not a debug log. The audience is the rule-curator (ED), not the engineer.

**Pattern:**

```typescript
// Colocated with the rule data in src/enrichment/quality-gates.ts
const MATCH_LOG_PATH = path.resolve(import.meta.dir, '../../data/banned-phrase-matches.csv');
const MATCH_LOG_HEADER = 'timestamp,event_id,language_of_match,matched_phrase,description_excerpt\n';

function ensureMatchLog(): void {
  if (!fs.existsSync(MATCH_LOG_PATH)) {
    fs.writeFileSync(MATCH_LOG_PATH, MATCH_LOG_HEADER);
  }
}

function logMatch(eventId, language, phrase, description): void {
  if (process.env.NODE_ENV === 'test') return;  // <-- critical
  try {
    ensureMatchLog();
    const idx = description.toLowerCase().indexOf(phrase.toLowerCase());
    const start = Math.max(0, idx - 30);
    const end = Math.min(description.length, idx + phrase.length + 30);
    const excerpt = description.slice(start, end).replace(/\s+/g, ' ').replace(/"/g, '""');
    const row = `${new Date().toISOString()},${eventId ?? ''},${language},${phrase},"${excerpt}"\n`;
    fs.appendFileSync(MATCH_LOG_PATH, row);
  } catch {
    // Never block enforcement on a log write.
  }
}
```

**Rules of thumb:**

- **CSV not SQLite for rule-curator audiences.** ED greps and eyeballs. Numbers/Excel opens it for free. SQLite needs a tool. CSV wins for low-volume, low-frequency editorial review.
- **Append-only, gitignored.** High-write file with rotation needs different from source. Add to `.gitignore` next to other observability CSVs (e.g., `data/search-visibility-log.csv`).
- **`NODE_ENV=test` early-return guard.** Bun's test runner sets `NODE_ENV='test'` automatically (verified empirically). Without this guard, every CI test run pads the production CSV with test event_ids. Standard convention for separating production telemetry from test-time noise — applies to **any** observability hook that writes to disk from production code.
- **Try/catch around the write.** Log-write failures (disk-full, permissions, FS-stale) must never propagate up. The CSV is editorial telemetry, not enforcement state.
- **Excerpt: ±30 chars, whitespace-collapsed, CSV-double-quote-escaped.** ED needs enough context to judge "was this floating praise or a justified use," but not so much that the CSV becomes unreadable. Whitespace collapse handles multi-line descriptions; CSV escape handles embedded quotes.
- **Schema: `timestamp,event_id,language_of_match,matched_phrase,description_excerpt`.** event_id is nullable (some F1 entry points don't have it threaded through; that's OK — ED filters by phrase or timestamp instead). language_of_match is `'en'` or `'el'` — useful for sorting EN vs EL fire volumes separately.

**When to use:**

- Rule-based enforcement systems (banned phrases, lint rules, content moderation) where rule curation needs production firing data, not synthetic test cases.
- Editorial / human-in-the-loop systems where the curator is non-engineering.
- Slow-cycle review (weekly / monthly), not real-time alerting.

**When NOT to use:**

- High-volume hot paths (>100 writes/sec). Switch to a database with indexed columns.
- Multi-process write contention. CSVs append synchronously; concurrent processes can't safely share one without locking.
- Real-time / dashboard-driven workflows. CSV doesn't aggregate without a query layer.

**Inverse of usual logging direction:**

Usual logs capture **failures** for fixing — exception traces, error rates, slow queries. Match-firing logs capture **successes** (rule hits) so the rule itself can be tuned. The data flow is identical, but the analytical question is "is this rule still right?" not "is this code still working?" Useful framing when proposing observability for any rule-based system: ask the curator "what would let you decide if these rules are still right?" — the answer often shapes a different schema than what an engineer would default to.

---

## Pattern: TypeScript as cross-reference checker for refactors of cross-file constants

**Date:** 2026-05-02 (S100c — surfaced when removing `LAZY_ADJECTIVES`)

**Context:** Removing a cross-file exported constant. The explore phase used `grep -rn 'LAZY_ADJECTIVES' src/ tests/` to enumerate consumers. Grep doesn't distinguish in-file references from cross-file imports — and the third consumer was an in-file reference (`description-generator.ts:580` consumed the local `LAZY_ADJECTIVES` definition at L115). Grep listed it but it visually merged with the definition site, so the consumer count was off by one.

**Pattern:**

After removing an exported constant or symbol, run `bunx tsc --noEmit` (or `tsc --noEmit` for non-Bun projects) immediately. TypeScript's "Cannot find name 'X'" / "Module has no exported member 'X'" errors enumerate every consumer with line numbers — including in-file ones, ones in dynamic-import paths grep would miss, and ones in re-export chains. Faster and more reliable than grep for cross-reference enumeration.

**Rules of thumb:**

- **Trust tsc more than grep for cross-reference enumeration of named symbols.** Grep matches strings; tsc resolves names. The difference matters when the same string is both a definition and a usage in one file.
- **The first tsc run after Step N is the highest-signal moment in a refactor.** Don't batch multiple removals before running tsc — the error list gets noisy and harder to attribute.
- **Errors in test files are usually the easiest to fix; errors in production code paths are the hidden landmines.** Production-code errors mean a consumer the brief didn't anticipate; pause and decide whether to expand scope or roll back. Test errors usually just mean updating an import or a hardcoded count assertion.
- **This works for any TypeScript project, not just Bun.** The pattern is "use the language server as a refactor surface" — applicable to any strongly-typed language with usable error messages (Rust's compiler, Java's IDE refactor tools, etc.).

**Limitations:**

- Doesn't catch consumers that use dynamic strings (`obj['LAZY_ADJECTIVES']`) — rare, but possible.
- Doesn't catch consumers in untracked-by-tsconfig files (e.g., shell scripts, config files, docs). Always pair with a final `grep` after tsc is clean to catch these.
- Doesn't catch consumers in workspaces tsc isn't told about (multi-repo / monorepo with separate `tsconfig`s). Run tsc in each project that imports from the modified module.

## Honest JSON-LD timestamps via shared content-hash (S101a, 2026-05-02)

**Context:** Editorial Pushback 2 — scheduled rebuilds without content-change detection produce timestamp-bumps that AI engines penalize. AgentAthens already had honest sitemap `<lastmod>` via `src/sitemap/content-hasher.ts` (volatile-stripped HTML hash → `resolveLastModified`). But JSON-LD `datePublished`/`dateModified` in CollectionPage emissions read from `metadata.lastUpdate = new Date().toISOString()` on every build — fraudulent bumps every day, even when /this-weekend's event set was unchanged.

**Pattern (event-set hash → resolveLastModified → metadata override):**

1. **Pre-render hash on stable identity.** Compute a content-set-level hash of the displayed event set BEFORE rendering, not from rendered HTML. For /this-weekend the digest is `id|title|startDate|endDate|venue.name`, sorted by line, SHA-256 truncated to 16 hex. Field selection captures user-visible identity changes (title/time/venue moves) and ignores intentional Friday-delta description rewrites — Editorial's content quality work shouldn't trip lastmod.

2. **Reuse `resolveLastModified` from `content-hasher.ts`.** The helper already handles the truthful-lastmod logic (preserve prior date if hash unchanged, bump to today if changed) and `Europe/Athens` timezone. No new infrastructure — `loadManifest(path)` and `saveManifest(manifest, path)` accept an optional path arg, so the event-set manifest goes to `data/event-set-hashes.json` (separate from sitemap's `data/content-hashes.json` to avoid semantic collision).

3. **Thread the resolved date into render via metadata override.** Add an optional `lastUpdateOverride: string` parameter to the page render function (e.g. `renderHubPage`'s 6th param). Inside, override `metadata.lastUpdate` once after `buildPageMetadata`. This propagates to ALL three downstream consumers — JSON-LD `datePublished`/`dateModified`, `<meta name="date">`, `<span class="last-update">` — at one override point.

4. **Store the manifest at end of the relevant build phase.** `saveEventSetManifest(manifest, path)` after the hub-render section completes. Mid-build crash leaves the manifest unchanged (next build re-resolves from the unchanged prior state).

**Critical implementation details:**

- **`resolveLastModified` returns ISO date-only** (`2026-05-02`), not a timestamp. Whatever consumes `metadata.lastUpdate` must accept date-only — verify before threading. JSON-LD and HTML `<meta>` accept both. The `stripVolatileContent` regex strips both shapes.

- **Pre-existing daily build covers the cadence.** No new plist needed when a daily build already runs and the JSON-LD hash-gating ensures honest timestamps regardless of when the build fires. Adding a Friday-only plist would NOT have addressed the JSON-LD issue.

- **Side-benefit: `writeHtmlIfChangedSync` (byte-exact) actually skips rewrites.** With today's date no longer baked into JSON-LD on every build, hash-equal builds produce byte-identical HTML and the write is skipped. Free incrementality.

**Why this beats a Friday plist:**

A Friday plist would fire on a fixed schedule and rebuild — but its build would still emit today's date as `dateModified` regardless of whether the event set changed. Editorial's "no fraudulent bumps" concern is about the *rendered timestamp source*, not the *trigger schedule*. Hash-gating the source addresses the concern directly; a plist alone does not.

**When to extend this pattern:**

- Other cornerstone hubs (`/today`, `/this-week`, `/this-month`) — same shape; pre-compute hash in `generate-site.ts` ahead of `generateHubPages`, populate `lastUpdateOverrides` map.
- Per-event pages — different surface; would need a per-event hash (event-row digest) rather than event-set. Worth doing only if AI engines start citing events from the detail-page URL with frequency that justifies the per-page lastmod precision.
- Editorial pages, FAQ pages — same shape if they have a discrete content-set identity. Skip if their identity is just "the page exists" and updates are content-only.

**Limitations:**

- The `description` and `price.amount` fields are intentionally NOT in the event-set hash, by design (Editorial's Friday description-rewrites should not bump lastmod). If product needs change so that price-amount changes ARE reportable to AI engines as content updates, expand the hash.
- The pattern depends on `metadata.lastUpdate` being the single source of timestamp truth in render. If a render path bypasses metadata and reads `new Date()` directly, the override won't help. Audit-grep `new Date()` and `Date.now()` in render-path files before extending.

## Brief-vs-prod regression check via timestamp comparison (S101b, 2026-05-02)

When a brief asserts "X is in production", verify prod build timestamp against the commit timestamp before assuming the assertion holds.

The S101b brief asserted that S101a had wired hash-gating into prod for all hubs and asked for verification. Phase 0 fetched prod /this-weekend, found schema `dateModified` was a build-time ISO timestamp (not the expected date-only). Looked like a regression. Then `git log --format="%ai" 52f09d8d0` showed S101a was committed at 12:41:44 Athens, while the prod HTML's build timestamp was 11:07:48 Athens — production was rendered ~1.5 hours BEFORE the commit. No regression — deploy lag.

**Reusable check:**
1. Pull prod HTML's build timestamp from any per-build field (`dateModified` ISO, `<meta name="last-modified">`, or `<span class="last-update">` if rendered with full precision).
2. `git log --format="%ai" <commit-hash> -1` for the commit the brief assumes is deployed.
3. If commit timestamp > prod build timestamp, the assertion is "true post-next-deploy, not now."

**Why it matters:** the brief's premise drives the scope. If we'd treated the prod observation as a regression, we'd have hunted a non-existent bug in the override path (`hub-page.ts:282-283` is correct). The diagnosis flips a 30-min hunt-the-bug into a 5-min "wait for next deploy + re-verify."

**Pair with the broader brief-verification pattern:** check that the brief's named files exist with the claimed signatures (the user's "verify-paths-in-briefs" rule with 5 prior incidents — S71/S82/S95/S100b/S101a). The prod-vs-commit check extends that pattern to runtime state, not just code state.

## Dual-type seller for venue_direct_only (2026-05-02)

When a venue is the merchant of record (homepage as ticket_url, no
third-party platform), `seller["@type"]` emits as `["Place", "Organization"]`
to match the 2026-04-28 Canonical Entity Graph spec for venue-as-merchant
cases (Megaron, Onassis, Benaki — venues that self-merchant tickets).

**Scope of dual-type:** ONLY venue_direct_only classification.

**Other lanes stay scalar `"Organization"`:**
- `known_merchant` — host is the seller (Viva.gr, More.com, etc.)
- `listing_aggregator` — venue is de-facto seller, but not self-merchant
- `unclassified` — venue fallback
- Free events — venue as responsible Organization

**Validators paired:** Both `schema-validator.ts` and
`schema-completeness.ts` accept `seller["@type"]` as either scalar
`"Organization"` OR array containing `"Organization"` (matching the
emitter contract).

**Sprint 3 upgrade path:** When @graph migration ships, inline seller
objects move to `@id` references. The dual-type tuple stays — it's
about entity nature (Place + Organization), not about reference style.

**See:** decisions.md 2026-05-02 Sprint 1 Closeout entry; commit 8021646d1.

## Append-only beats insert-in-place for decisions.md (2026-05-02)

When backfilling a late-filed decision (authored on date X but written
to disk on date Y), append at end-of-file in the order entries are
filed — not inserted at the chronological position they would have
occupied if filed on time.

**Why:** decisions.md is a journal of decisions in the order they
were filed, not a sorted index. Reordering already-filed entries
rewrites history (git blame, file-order grep, "what was decided last"
semantics). Strict chronological-by-decision-date sorting is not
the file's purpose.

**Honest practice:** Append the late entry, and let the commit message
note "authored on X, filed on Y." The file order then tells the truth
about institutional memory hygiene rather than papering over the gap.

**Precedent:** Sprint 1 amendment session 2026-05-02 backfilled a
2026-04-29 GEO Strategist entry alongside the same-day 2026-05-02
closeout entry. Both appended at end of file after pre-existing
2026-05-02 entries (S100c, S101a). Non-strict global chronology
preserved over reordering filed entries.

## dist/ orphan sweep: layered classification (slug-membership + mtime fallback) (S102, 2026-05-02)

For `dist/` build artifacts, choose the orphan-detection criterion by
whether a DB-backed valid set exists for that path shape. **Event paths
have one (DB pageableEvents). Non-event paths don't.**

**Layered logic:**
- `dist/events/<slug>/index.html`, `dist/en/events/<slug>/index.html`
  → slug-membership against `pageableEvents.map(generateEventSlug)`.
  Out-of-set → sweep (arm-by-default; correctness-safe because DB is
  source of truth, doesn't depend on whether file was rewritten this build).
- `dist/api/<slug>.json` (excluding `api/categories/`, excluding `index.json`)
  → if slug ∈ valid set, KEEP (false-positive protection). Otherwise
  fall through to mtime check.
- Other HTML / JSON (homepage, hubs, venue pages, category aggregations
  like `dj_set-this-week.json`) → mtime check, requires `SWEEP_ORPHANS=1`
  to arm.

**Why slug-membership > mtime for event paths:** the build pipeline does
incremental regeneration (manifest hashing at L974: "X unchanged, Y
changed/new"). Pages with unchanged hashes are not rewritten; their
mtime stays older than `buildStartTime`. Mtime-only would falsely flag
every unchanged-but-valid page as orphan. Slug-membership is invariant
to whether the file was touched this build — only "is this slug in the
current pageable set?" matters.

**Why mtime stays as backstop for non-event:** there's no DB-backed
valid set for homepage/hubs/category JSON. These regenerate every build,
so mtime IS a valid signal — but the same incremental-build issue means
some legitimate non-event files may not be touched (hash-unchanged hub
pages). Hence the `SWEEP_ORPHANS=1` opt-in arm for non-event paths.

**Single source of truth for slug computation:** the sweep imports
`generateEventSlug` from `src/generators/event-page.ts` — the same
function that produces the dirname during page generation. If the slug
formula ever changes, both sites update together. Same family of
discipline as Sprint 1 S2's validator+emitter paired-shipping rule.

**Idempotency check:** consecutive builds must sweep 0 event orphans.
If second build > 0, something downstream of the sweep is creating
event-shaped paths not in pageableEvents — investigate before shipping.

**Multi-city ready:** `sweepOrphans()` takes `distDir` and
`validEventSlugs` as parameters; nothing about the path shapes is
city-specific. Barcelona/Berlin will pass their own DIST_DIR + their
city's pageable set.

**Reference:** `src/generators/orphan-sweep.ts`,
`tests/generators/orphan-sweep.test.ts` (14 cases including
false-positive protection, idempotency, parent-prune preserving
PROTECTED_ROOTS).

## Forward-looking spec scoping watchpoint, instance 1 (S103, 2026-05-02)

When a decision/spec entry references a column / field / job / migration
as **future work** without scoping its creation, that work tends to fall
through the cracks. Watch for this shape in spec entries and acceptance
criteria.

**Concrete instance:** decisions.md 2026-04-29 (GEO Strategist) referenced
`ticket_url_resolved` as future Sprint 2 work — "Sprint 2 adds nightly
URL resolver populating `ticket_url_resolved`." Migration 006 (2026-04-24)
added the audit columns (`ticket_url_resolved_at`, `ticket_url_source`)
but the URL value column itself was never added. No Sprint 1 session
shipped it. The Sprint 2 diagnostic caught the implicit assumption
during pre-flight.

**Why this happens:** the decision-author treats the column as
"infrastructure for the resolver" (existence implied by the resolver
being scoped); the resolver-author treats the column as
"infrastructure" (existence assumed before the resolver runs). Neither
adds it. Without explicit scoping ("Sprint 1 adds the column; Sprint 2
populates it"), the column drifts into a future-tense limbo.

**How to apply:**
- When reading or writing decision/spec entries, look for nouns that
  reference future state (`<table>.<new_column>`, `<service>`,
  `<nightly_job>`). If the entry doesn't *also* scope the creation,
  flag it.
- During session pre-flight diagnostics for any session that mentions
  a column/field/job by name, run a Step-0 verification: does the
  named thing exist? If not, halt — file an explicit creation step
  (or a separate session) before proceeding.
- Diagnostic scripts that audit decisions-vs-reality should treat
  forward-looking spec entries as candidates for "scoped or not?"
  classification, not as evidence the thing exists.

**Watch for instance 2** in Sprint 2.5 diagnostic (the resolver job
itself is a forward-looking spec entry now — gets scoped explicitly
in Sprint 2.5 brief intake) or Sprint 3 brief intake (any
forward-looking entries we author this sprint that reference
not-yet-built columns/jobs/services).

**Pattern family:** "verify-assumptions" / "diagnostic-first" guards.
Same family as "Brief-vs-prod regression check via timestamp comparison
(S101b)" and the verify-paths-in-briefs feedback. The variant here is
spec-vs-code (does X exist?) rather than prod-vs-code (does X behave
correctly?).

## Pre-create contract surface, populate data later (pattern, 2026-05-02)

When a contract has multiple data layers that ship at different cadences, define the full surface at first ship even if some layers are unpopulated. Layers gain a status field ("measured" / "not_measured") so consumers can disambiguate "data is zero" from "data is not yet measured."

**Examples:**
- ticket_url_resolved column (commit ce3ca0afc, 2026-05-02): ships as nullable, populated by Sprint 2.5 nightly resolver
- build-completeness.json place_level + aria_level layers (commit b6274644b, 2026-05-02): ships as "not_measured", populated by Sprint 2 B + C as they ship

**Pattern shape:** the contract surface is final at first ship. Future data work fills slots, doesn't reshape the artifact. Consumers write against the final shape from day one.

**Anti-pattern:** ship only the layers that have data, force consumers to handle shape changes when more layers populate.

## TS `satisfies` clause locks array against union evolution (watchpoint, 2026-05-02)

When an array's contents must mirror a TypeScript union (ordered iteration over all members, type-aware bucket lists), declare with `as const satisfies readonly UnionType[]`. If the union evolves and the array doesn't, compile fails.

**Instance:** Component D's BUCKET_ORDER mirrors EventType union declaration order, locked via `satisfies`.

**Family — type system enforcing contract instead of human discipline at edit time:**
1. ticketUrlResolved required-with-null (commit ce3ca0afc, 2026-05-02): forces every Event-construction site to express resolution state explicitly
2. Orphan sweep generateEventSlug import (commit bba8c1830, 2026-05-02): single source of truth for slug computation across modules
3. BUCKET_ORDER satisfies clause (commit b6274644b, 2026-05-02): array contents locked against union evolution

**Watchpoint** — three instances of "mechanical contract enforcement at type-level beats human discipline at edit-time." If a fourth instance surfaces with the same shape, codify.

**Possibly the same meta-pattern as cross-module SoT watchpoint** (filed 2026-05-XX, same instance count). Whether they're one rubric or two becomes clear at the next instance — wait to fuse.

## Build-completeness layer extension (pattern, 2026-05-02)

Component D's build-completeness.json artifact established a layered measurement surface with status flags ("measured" / "not_measured"). Component A demonstrates the layer-extension pattern: new measurement axes ship as new layers, not as extensions of existing layers.

**Why new layer beats extending an existing one:**
- event_level measures per-event JSON-LD coverage (each Event page has valid schema). DataFeed measures per-feed coverage (mandatory fields populated, alternate-link wired, llms.txt updated). Different axes.
- Conflating would hide signal — same way single aggregate hid the exhibition pass-rate gap (Component D finding 2026-05-02).
- Pattern compounds: Sprint 3 multi-merchant federation gets its own layer; Sprint 4 work gets its own layer; etc.

**Layer growth path observed:**
- Sprint 2 D: event_level + offer_level (measured) + place_level + aria_level (stubbed)
- Sprint 2 A: + datafeed_level (measured)
- Sprint 2 B: place_level → measured
- Sprint 2 C: aria_level → measured
- Sprint 3+: future layers stub-then-measure

**Discipline test:** add new layer when measurement axis is genuinely new. Extend existing layer when measurement is sub-dimension of existing one. The decision question: would conflating hide signal?

**Instances:**
1. Component D: established the layer surface (commit b6274644b)
2. Component A: extended with datafeed_level (commit 118bc810c)

Two instances; if Component B or C adds another layer cleanly, that's instance 3 and the pattern is established beyond first-of-its-kind.

## Verification artifacts ship separately from implementation (watchpoint, 2026-05-02)

Pre-flight specs, diagnostic specs, and other verification artifacts are first-class outputs that ship on their own cadence — not bundled into the implementation commit they inform.

**Why:**
- Verification artifact and implementation are different work units. The verification answers "what's the actual repo state?"; the implementation answers "now build the thing." Bundling conflates them.
- Verification artifacts may be referenced by multiple downstream sessions (Component A pre-flight informs Component A; Sprint 2 diagnostic informs A + C + B + Component E verification).
- If verification finds blocking issues, the verification ships standalone with the finding; implementation never starts. Bundling would force a phantom-implementation commit.

**Instances observed:**
1. Sprint 2 diagnostic spec (specs/sprint-2-diagnostic.md) — uncommitted, referenced by Component E disposition + Component A pre-flight
2. Component A pre-flight spec (specs/component-a-preflight.md) — uncommitted at Component A ship, prior-session work product
3. (orphan sweep + ticket_url_resolved had pre-flight findings inline in CC's plan, not separate spec files — different shape)

**Watchpoint** — three instances of "verification artifacts as standalone work products" but only two as separate spec files. If a fourth instance with the spec-file shape surfaces, this earns codification.

**Decision implication when it earns codification:** specs/ directory work products commit on their own cadence (or stay uncommitted as reference). Implementation commits stage by path explicitly, never including specs/ files.

## Negative-match filters fragile against slug-prefix expansion (mistake-class, 2026-05-02)

**Surfaced during:** Component A integration, line 497 of src/validators/schema-completeness.ts printSchemaSummary breakdown.

**The pattern:** code that classifies items by "everything that isn't X is Y" works correctly when there are only two categories. When new categories are added (X stays the same; new Z and W appear), the negative match silently miscategorizes Z and W as Y.

**Sprint 1 → Sprint 2 instance:** printSchemaSummary breakdown filter classified slugs by:
- Starts with "hub:" → hub
- Starts with "venue:" → venue
- Otherwise → event (negative match)

Component A added "datafeed:" slug prefix. The negative match misclassified datafeed:events as event, inflating event count by 1 and producing a 1-event datafeed gap in the breakdown. CC caught and patched inline (line 497 → explicit positive match for each known prefix; unknown prefix → log warning rather than silent miscategorize).

**Forward concern (Sprint 3+):** Sprint 3's Performer + Organizer schema work will add more slug prefixes (likely performer:, organizer:). Same class of bug if any code uses negative-match classification. Worth a Sprint 3 pre-flight check: grep for negative-match filter patterns before implementation.

**Pattern shape:** explicit positive matching > negative matching when categories may grow. Trades concise code for robustness against future expansion.

**Status:** Watchpoint. If Sprint 3 surfaces another negative-match-filter bug, this earns codification as a code review rule.

## Halt-at-surfacing-point operating mid-session (pattern, 2026-05-03)

When mid-session work surfaces an architectural fork (not a minor implementation detail), the executor halts and routes the decision rather than muscling through with workarounds.

**Component C instance:** Step 0 Part C failed with @axe-core/cli's bundled ChromeDriver mismatching system Chrome version. Four options surfaced (pin chromedriver locally / switch to Pa11y / update system Chrome / pivot to Playwright). CC presented all four with trade-offs; routed to Dev Planner; received Option 2 (Pa11y) decision. Plan structure absorbed the swap with minimal deviation; session continued.

**Why this matters:** the alternative (CC picks unilaterally and ships) would have hidden the architectural fork in implementation choices. Future sessions or teammates wouldn't see the trade-off explicitly. Routing decisions surface the fork as a decision worth recording in decisions.md, not a workaround buried in code.

**Pattern shape:** when implementation work surfaces a choice that's load-bearing architecturally (tool selection, library swap, build pipeline shape, data-shape contract), halt and route rather than pick. Implementation choices that aren't load-bearing (variable naming, error message wording, log format) don't need routing.

**Test for "load-bearing":** would the choice land in a decisions.md entry if surfaced explicitly? If yes, halt and route. If no, pick and proceed.

**Family — this is the third compounded discipline operating mid-session:**
1. Sprint 1 S2 protocol: validator + emitter ship together for contract changes (paired commits)
2. Activated discipline rule (2026-05-02): verify against actual repo before publishing
3. Halt-at-surfacing-point (this entry): mid-session forks routed rather than worked around

All three share the same underlying principle — surface the decision-shaped work as decisions, don't bury it as implementation.

**Instance count:** Component C ARIA tool fork is the first instance with this shape. Sprint 2 amendment session's daily-pipeline auto-commit collisions handled differently (didn't fork; absorbed into closeout pattern). If a similar mid-session architectural fork surfaces in Sprint 2 Component B, Sprint 2.5, or Sprint 3, that's instance 2.

---

## Bundled-browser pattern eliminates version-drift class (pattern, 2026-05-03)

Tools with transitive system dependencies (e.g., axe-core CLI + system Chrome) are structurally fragile for measurement infrastructure. Tools that bundle their dependencies (Pa11y bundles puppeteer+Chromium; Playwright bundles its own Chromium) eliminate the entire class.

**Component C instance:** axe-core CLI's bundled ChromeDriver pinned to Chrome 148; system Chrome 147.0.7727.138. Mismatch state is the standard ~50% of the time given Chrome's ~6-week release cadence. Pinning chromedriver locally just delays the next collision; doesn't solve the structural issue.

Pa11y bundles puppeteer+Chromium together as a known-compatible pair. Different architectural choice, no version-drift surface.

**Pattern shape:** for measurement infrastructure that needs to run reliably across environments (developer machines, CI, multi-city replicas), prefer tools that bundle transitive dependencies over tools that depend on system installs.

**Trade-off:** bundled-browser tools have larger install footprints (~50-150 MB) than CLI-only tools (~5-20 MB). For measurement infrastructure where reliability matters more than disk footprint, the trade-off favors bundling.

**Family:** related to "single source of truth" patterns — the bundled tool owns its full execution context, doesn't depend on environment to provide compatible parts.

**Where this applies in the codebase:**
- ARIA audit (Component C): Pa11y bundled
- Future Playwright-based tooling if Sprint 3+ surfaces a need
- Anywhere a CLI tool depends on system Chrome, system Python, system git, etc.

**Where this doesn't apply:**
- Bun runtime itself (we accept the dependency at the project level; Bun is the project's runtime contract)
- Standard Unix utilities (bash, grep, sed) — universal enough that "bundled" doesn't meaningfully apply

**Status:** First-instance pattern. If Sprint 3+ tooling decisions surface a similar bundled-vs-system trade-off, that's instance 2 and the pattern is reinforced.

---

## Config-driven multi-city semantic via city-geodata.json (pattern, 2026-05-03)

City-specific Schema.org / JSON-LD values that are stable per deployment (not per event, not per venue) live in `config/city-geodata.json` and are read via dedicated helpers in `src/utils/schema-geo.ts`. Helpers compose around the same `cityGeodata` cached read.

**Established helpers (precedent + new):**
- `getCountryCode()` → `cityGeodata.country.code` (e.g. "GR" for Athens)
- `getCurrencyCode()` → `cityGeodata.country.currency` (e.g. "EUR")
- `getRegionName()` → `cityGeodata.region.name` (e.g. "Attica", added 2026-05-03 for Q-B6)

**Pattern shape:** when a Schema.org / JSON-LD field has a single canonical value per city deployment, source it from city-geodata.json via a typed helper. Don't hardcode in emitters; don't re-read config in validators; don't pass through environment variables.

**Why this matters for the agent-* family of repos** (agent-athens, future agent-barcelona, agent-berlin): all city-specific values resolve from one config file. Forking agent-athens → agent-barcelona means one file replacement (`config/city-geodata.json`), not a grep-and-fix tour through emitters and validators.

**Test for "is this a city-geodata candidate":**
- Stable per deployment? Yes.
- Single canonical value (no per-venue or per-event variation)? Yes.
- Used in JSON-LD or other multi-city-replicable surface? Yes.
- → Add a helper in schema-geo.ts.

**Anti-pattern (refuted):** `addressRegion: venue.neighborhood || 'Attica'` (venue-page.ts:70 prior to 2026-05-03). Two values mixed at one site: per-venue neighborhood AND per-city fallback. Hard to reason about, hard to validate, fails multi-city replicability (a Barcelona venue with `neighborhood: "Eixample"` would emit "Eixample" instead of "Catalonia"). Replaced with `getRegionName()` per Q-B6.

**Family — this is the third helper:** getCountryCode (Sprint 1 baseline), getCurrencyCode (Sprint 1 baseline), getRegionName (Sprint 2 Component B-1). Future helpers expected as more JSON-LD blocks need city-specific values: e.g. `getDefaultLanguage()`, `getTimezone()` if/when those surface as needs.

**Status:** Active. Three-instance pattern with stable shape.

---

## Injectable expected-value parameter for testability (pattern, 2026-05-03)

When a validator function needs a config-derived expected value for comparison, accept it as a required parameter from the orchestrator rather than reading config inside the validate function. Tests pass mock values directly; orchestrator computes once and passes to each invocation; no module mocking needed.

**Instance:** `validateVenueSchema(htmlContent, venueSlug, expectedAddressRegion)` — orchestrator (validateAllPages) calls `getRegionName()` once before the venue scan loop, then passes the value into each validation. Tests pass `"Attica"` directly for positive case, `"Catalonia"` for multi-city replicability case.

**Pattern shape:** validators are pure functions of their inputs. Config reads happen at the orchestrator boundary, not inside the per-item validator. Tests can pass arbitrary expected values without touching any config files or mocking any modules.

**Why this beats default-from-helper:**
- Default-from-helper signature: `validateVenueSchema(html, slug, expected = getRegionName())` — looks like an optional param but is really hidden config dependency. Tests that pass nothing get the real config value; tests that need a different value pass it explicitly. The default makes the function impure — calling without a third arg has filesystem side effects.
- Required-param signature: `validateVenueSchema(html, slug, expected)` — function is purely a function of its inputs. Orchestrator carries the responsibility of computing `expected`. Tests have no implicit dependencies.

**Trade-off:** required-param means the signature change is breaking for any pre-existing callers. In B-1 there were zero non-orchestrator callers, so this was free. For broader codebase changes, evaluate caller count first.

**Anti-pattern (avoided):** mocking `bun:test` `mock.module()` to swap `schema-geo` for the multi-city test. Works but couples test to the module loader; brittle on future schema-geo refactors. The injectable-parameter approach has zero coupling to the module shape.

**Family — generalizable to other validators:** any `validateX` function that compares against config-derived canonical values is a candidate. Examples that would benefit if extended: `validateDataFeed` could take `expectedFeedName` as parameter (currently hardcoded contract); future place-vocab validators in B-2 will likely need similar shape for per-city or per-venue expected values.

**Status:** First-instance pattern in this codebase. Pre-existing validators (`validateSchemaCompleteness`, `validateHubSchema`, `validateDataFeed`) read globals or hardcode expectations. Refactor candidates if module-mocking ever becomes a need.

---

## Preserved per-subprocess output as messenger-vs-cause discriminator (diagnostic technique, 2026-05-03)

When a watchdog wrapper kills a subprocess on a stdout-idle gate, the question of "was the wrapper too aggressive (killing healthy work) vs. correctly detecting an upstream hang" is not answerable from the wrapper's own logs alone — the wrapper only knows that no bytes arrived. The discriminator is the **byte size of the preserved subprocess output file**:

- File contains *any* bytes (even partial JSON, even one token of text) → subprocess was producing output and the wrapper killed mid-stream → **wrapper is suspect** (consider raising the timeout, switching to `stream-json` for incremental confirmation, or comparing to the server-side stream-idle threshold).
- File is **0 bytes** → subprocess never wrote a single byte to stdout or stderr in the entire window → **wrapper is the messenger**, hang is upstream of any wrapper logic. Do not modify the wrapper; investigate the subprocess in isolation.

**Instance:** S101 enrichment drought diagnostic (2026-05-03). The S99 wrapper (`scripts/auto-enrich.sh:336`) preserves per-batch output as `$LOG_DIR/.batch-${BATCH_NAME}-${RUN_ID}.out` for forensics on failure. Across 10+ failed runs over 4 separate slots (08:13, 10:00, 13:00, 16:42, 19:00 on 2026-05-03), every preserved file was 0 bytes. This single observation reclassified the failure from "wrapper bug, revert wrapper" (the brief's Class B prescription) to "Claude CLI inference call hangs at byte-0 in launchd context" (Class G, novel). Reverting the wrapper would have caused processes to hang forever instead of being killed at 121s — strictly worse.

**Why this works:** the wrapper's stdout-idle gate is implemented via `stat -f %m` (mtime) on the per-batch output file, which only advances when bytes are written. If the file size is 0 at kill time, no bytes were ever written, so any conclusion about "wrapper too aggressive" is moot — there was nothing to be aggressive *about*.

**Pre-condition:** the wrapper must preserve subprocess output on failure (not delete it). The S99 wrapper does this explicitly (line 428 comment: "Keep BATCH_OUT for forensics on failure or stream-idle detection"). Any future watchdog design should follow this — silent-on-success, preserve-on-failure, with a documented file-naming scheme so forensics can correlate batch IDs to run IDs.

**Generalization:** applies to any wrapper-around-subprocess design where the wrapper enforces a stdout-idle (or stream-idle) timeout. Examples beyond auto-enrich: `caffeinate`-wrapped scripts, `timeout`-piped commands, custom watchdog harnesses around CI test runs, parallel-batch orchestrators (where shared-log mtime can mask single-batch stalls — also addressed by the per-batch file design in S99).

**Anti-pattern:** designing a watchdog that captures only its own diagnostic output (`KILL_CAUSE: ...`) without preserving the subprocess's. Saves disk space but loses the messenger-vs-cause discriminator. The 0-byte signal IS the diagnostic.

**Status:** First-instance use of this technique in S101. The wrapper itself was authored in S99 with forensics in mind — this session validated that the design choice paid off on its first real failure. Adding to patterns.md so future drought-class incidents recognize the pattern faster.

---

## INFO tier requires explicit aggregate consumption + summary surfacing wiring (pattern, 2026-05-03)

The validator-side `info[]` field on per-page results is necessary but not sufficient for INFO findings to reach consumers. Until the reporter aggregates info counts into PageGroupReport AND printSchemaSummary surfaces them in console output, INFO is write-only and effectively invisible.

**Symptom of the trap (B-1 baseline → B-2 pre-flight finding):** Sprint 1 added `result.info[]` (line 23–28 of schema-completeness.ts) and the `offers.url` push at line 185. From B-1's pre-flight P3, the per-page severity machinery looked complete and "supports WARN/INFO/ERROR with zero arch change". This claim was true *at the per-page level* but missed the aggregation boundary. B-2's pre-flight P4 caught it: 7,894 events × INFO findings would write but never read, never surface.

**Pattern shape:** When introducing a new severity tier, audit the full chain:
1. **Validator emits** to `result.{errors|warnings|info}[]` ← Sprint 1 stopped here
2. **Reporter aggregates** into PageGroupReport / BucketReport counters
3. **Summary surfaces** in console via `printSchemaSummary` (header line + Top-N findings block)
4. **Artifact persists** via `data/build-completeness.json` consumption

Each step requires deliberate wiring; no auto-propagation. A "shipped" tier that only completes step 1 is a write-only signal that misleads later auditors into thinking the tier is operational.

**B-2 instance:** Adding `info: number` to PageGroupReport + BucketReport (Step 3), updating `tally()` to take `hasInfo: boolean`, updating `printSchemaSummary` with separate INFO header + Top INFO findings block. Without these, Q-B1's "INFO universal" lock would have been a no-op.

**Mitigation for future tiers:** When designing a new severity tier, the spec must include all four chain links. Default skepticism about "the machinery already supports it" — verify by tracing where each tier surfaces in the artifact + console output, not just where it gets pushed onto the result.

**Family:** Related to "the contract is what consumers see, not what producers emit" — common across measurement/observability work.

**Status:** Active. INFO is now fully wired (B-2). If a future tier (e.g., BLOCKING-INFO, DEFERRED-WARN) is introduced, audit all four steps before declaring it shipped.

---

## Default-with-literal vs required parameter for validator config dependencies (pattern addendum, 2026-05-03)

B-1's "validators take config-derived expectations from orchestrator" pattern explicitly chose required parameters with no defaults. The reasoning: required params keep the function purely a function of its inputs; tests have no implicit dependencies; the orchestrator carries the responsibility of computing expected values.

B-2 surfaced a real edge case: when a new severity-injection parameter is added to a validator with a high call-site count (33 existing event tests for `validateSchemaCompleteness`), strict required-param enforcement forces a mass mechanical update of every test, even though most tests don't exercise the new behavior.

**Resolution:** Optional parameter with **literal default** is acceptable when:
- Default is a compile-time literal (e.g., `'info'`) — NOT a function call (e.g., `getRegionName()`).
- Production paths (orchestrator) always pass explicitly — verified by reading the orchestrator code.
- Tests for the new behavior pass explicit values; tests that don't care use the literal default.

**Why this preserves B-1's intent:**
- Validator stays *pure*: the literal default is not a config read; it's just `'info'`. Function-of-inputs property holds.
- Production path stays *explicit*: orchestrator passes explicitly (caught by code review or grep audit).
- Tests stay *focused*: only the tests exercising the new behavior need to mention the parameter.

**What this is NOT acceptable for** (B-1's original concern still stands):
- Defaults that call helpers reading config (`expected = getRegionName()` — the call site looks like an optional param but is really a hidden config dependency in tests that pass nothing).
- Defaults that wrap module-level mutable state.

**Heuristic:** "Evaluate caller count first" (from B-1's patterns.md addendum). High caller count + literal default = acceptable. Any caller count + helper default = prefer required param.

**Family:** Refines the B-1 "Injectable expected-value parameter for testability" entry; both patterns coexist with this distinction.

**Status:** Active. B-2 used literal-default for `validateSchemaCompleteness(html, slug, sameAsSeverity = 'info')`; required-param for `validateVenueSchema(html, slug, expected, sameAsSeverity)` (only 4 callers, all needed update anyway).

---

## Ratchet state surfaced in artifact for diagnostic visibility (pattern, 2026-05-03)

When introducing a coverage-based severity ratchet (severity decided once at build start based on a measurable ratio), persist the ratchet's full *state* — not just the resulting severity — in the build artifact for diagnostic visibility.

**B-2 instance (`config/completeness-ratchets.json` + `place.ratchet` slot in `data/build-completeness.json`):**

```json
"ratchet": {
  "venueSameAs": {
    "coverage": 0,
    "populated": 0,
    "total": 408,
    "threshold": 0.5,
    "currentSeverity": "info"
  }
}
```

The persisted state includes both the inputs (`populated`, `total`, `threshold`) and the derived outputs (`coverage`, `currentSeverity`). Consumers can verify the math: `coverage = populated / total`; `currentSeverity = coverage >= threshold ? 'warn' : 'info'`.

**Why this matters:**
- **Diagnostic visibility:** when severity is "info" (or "warn"), readers see WHY without having to chase the threshold definition through config files.
- **Trajectory tracking:** trends over builds can plot `coverage` rising toward the threshold; alerts can fire before the boundary is crossed.
- **Audit trail:** if severity flips unexpectedly, the artifact captures the exact inputs at the time of the flip.
- **Promotion confidence:** when coverage finally reaches threshold and severity flips to 'warn', the artifact records that this was the build at which it happened.

**Pattern shape:** for any policy decision made at build start based on observable inputs, persist BOTH inputs and decision in the build artifact. Don't hide the math in code that ran once and discarded its inputs.

**Generalizes to:**
- Future ratchets (place.image_coverage, etc. — Q-B5 deferred but follows same shape).
- Sprint 3 WARN→FAIL promotion ratchets — when a measurement metric hits a target, severity gets promoted; persist the metric inputs alongside the promotion decision.
- Any "decided once at build start" decision (e.g., feature flag rollouts, A/B test buckets, locale defaults).

**Anti-pattern (avoided):** persist only `currentSeverity: 'info'` in the artifact. Consumers can't reproduce the decision; future debugging requires re-running with logging.

**Status:** First-instance pattern in this codebase. If Sprint 3 promotion or future B-N components introduce additional ratchets, follow the same shape.

---

## Progressive complexity isolation for multi-variable subprocess hangs (diagnostic technique, 2026-05-03)

When a subprocess hangs and the production invocation has multiple flags / env / size variables, the cheapest path to a fix is *progressive complexity*: start from the bare invocation, add one variable per cycle, watch where the behavior flips. Each cycle is bounded by a watchdog (e.g., `( cmd & PID=$!; (sleep N && kill -9 $PID) & wait $PID; ...)` for portable macOS) and produces a single observation: pass / hang / error + byte count. The variable that flips the outcome is the cause.

**Instance:** S101a enrichment drought fix (2026-05-03). Production invocation had 3 differences from a "trivial" claude -p call:
- bare prompt vs production-sized 16KB
- no `--allowedTools` vs full tool set
- interactive shell stdin (TTY) vs launchd-context stdin (blocking pipe)
- `--output-format text` vs `--output-format stream-json --verbose`

Steps 2a–2e in the fix brief isolated each variable:
- 2a: bare `--output-format text` → works in 10s with stdin warning emitted
- 2b: + `--allowedTools` → works in 9s, same warning
- 2c: + 16KB prompt → 90s timeout, 157 bytes (just the warning, no inference output)
- 2d: launchd-style `env -i` → "Not logged in" (test invalidated; auth context stripped, would not match production launchd which retains creds)
- 2e: + `< /dev/null` → 5s clean run, no warning
- 2f: + 16KB prompt + `< /dev/null` + stream-json → first byte at 10s, 361KB streamed in 540s

The 2c → 2f arc isolated TWO independent root causes (stdin handling AND output buffering) where a more brute-force "try everything at once" approach would have applied multiple changes and credited the wrong one. The diagnostic technique distinguished between fixes-that-help and fixes-that-help-for-different-reasons.

**Pre-conditions for using this technique:**
- The production invocation can be reproduced in a foreground / interactive context (S101 had partial reproduction; S101a had clean foreground reproduction).
- The variables that differ from a "trivial" baseline are enumerable and small (3–6 in S101a's case).
- Each cycle is cheap (seconds–minutes, not hours).

**Anti-pattern (refuted):** "fix the most likely cause and re-run production" — works when there's only one variable. When there are multiple, this leaves you guessing whether your fix worked or whether one of the other variables happened to behave differently this run. The drought-class incidents that span multiple days are exactly the cases where this guessing accumulates wasted runs.

**Generalization:** applies to any multi-flag CLI invocation, watchdog-wrapped subprocess, or environment-dependent service. The technique is independent of the specific tool (claude / curl / ffmpeg / docker run) and applies any time you need to trace WHICH variable flipped behavior.

**Family:** Connects to "0-byte preserved-output as messenger-vs-cause discriminator" (the S101 diagnostic technique that kicked off this session) — together they form a 2-step recipe for stdout-idle-style watchdog failures: (1) check 0-byte BATCH_OUT to confirm wrapper-as-messenger; (2) progressive complexity isolation to find the specific variable causing the hang.

**Status:** First named application in S101a. Worth applying any time a "what changed?" investigation has more than 2 candidate variables.

### Numerator must subset denominator's domain

When computing coverage ratios for ratchet-style measurements, the numerator
must filter by denominator membership, not just by the primary criterion.

**Wrong shape:**
  populated = records.filter(r => r.sameAs && r.sameAs.length > 0).length
  coverage = populated / activeReachableKeys.size  // numerator/denominator domain mismatch

  → an inactive venue with sameAs (possible from a prior cycle) inflates
    numerator beyond denominator's domain. Coverage can exceed 1.0.

**Right shape:**
  populated = records.filter(r =>
    r.sameAs && r.sameAs.length > 0 &&
    activeReachableKeys.has(normalizeVenueKey(r.canonical_name))
  ).length
  coverage = populated / activeReachableKeys.size  // both filtered to same domain

**Generalization:** Whenever a coverage metric pairs a curated numerator
(filtered by criterion X) with a curated denominator (filtered by criterion Y),
the numerator filter MUST also enforce criterion Y. Otherwise the ratio is
semantically meaningless above edge cases.

**Examples beyond ratchets:** any "coverage of curated set" measurement —
test coverage filtered to non-generated source files, accessibility coverage
filtered to user-facing pages, etc.

**Origin:** Q-B8b ratchet denominator fix, B-2c (sprint-2-session-7),
2026-05-04.

### Pipeline-output staging: explicit allow-list, never `git add -A`

Automated pipelines that commit must stage by explicit path, not by
working-tree dirtiness. The reason: a working tree dirty for ANY reason
(developer WIP, leftover spec drafts, unrelated config edits) becomes
indistinguishable from "pipeline produced new output" when staged via
`-A`. The result is generic "chore" commits that scoop developer work
under a misleading message — destroying attribution and entangling
revert.

**Wrong shape:**
```bash
if ! git diff --quiet || ! git diff --cached --quiet || \
   [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    git add -A
    git commit -m "chore: daily pipeline update $(date +%Y-%m-%d)"
fi
```

**Right shape:**
```bash
local PIPELINE_ALLOWLIST=( "data/output-1.json" "data/output-2.json" )
git add -- "${PIPELINE_ALLOWLIST[@]}"
# Defense-in-depth: refuse to commit anything outside allow-list
local UNEXPECTED=""
while IFS= read -r staged; do
    local is_allowed=0
    for allowed in "${PIPELINE_ALLOWLIST[@]}"; do
        [[ "$staged" == "$allowed" ]] && { is_allowed=1; break; }
    done
    [[ $is_allowed -eq 0 ]] && UNEXPECTED="$UNEXPECTED $staged"
done < <(git diff --cached --name-only)
if [[ -n "$UNEXPECTED" ]]; then
    git reset HEAD --   # abort, don't commit unexpected files
elif git diff --cached --quiet; then
    : # nothing to commit, fine
else
    git commit -m "..." && git push
fi
```

**Allow-list discovery method:**
1. Read every phase the pipeline runs; map each phase to its output
   files.
2. Cross-reference outputs against `.gitignore` — most data outputs are
   already ignored (DB files, logs, CSVs).
3. The remaining set IS the allow-list. Usually 1–3 paths.
4. Verify against historical clean pipeline commits: their stat lines
   should match this set exactly.

**Detection block must scope to allow-list, not whole tree.** If
detection uses `git diff` over the whole tree, an unrelated WIP
modification triggers a pipeline commit attempt that will then trip the
guard. Cleaner: stage allow-list, then check `git diff --cached --quiet`
for "anything to commit?".

**Defense-in-depth guard is non-optional.** `git add -- <paths>`
shouldn't stage anything else, but a future bug — alias drift,
gitattributes filter, hook side-effect — could. The guard is cheap (~10
lines bash) and catches surprise contamination at commit time rather
than via post-mortem.

**Origin:** S111 daily-pipeline staging fix, 2026-05-04. Recurring
contamination across at least 5 commits (adbaef38e, 72ce32c73,
5d49315a1, 4a897a76b, 937f738de). Audit:
`specs/daily-pipeline-staging-audit.md`. Closing commit: `8bae1d2e5`.

### Bulk-config dedup via decision-tree script + manual-review subset

When a config file has many duplicate records (e.g., 57 collisions in a
408-record registry), don't merge by hand. Three steps:

1. **Pre-flight sample classification** (10–20%): hand-classify a
   reproducible alphabetical sample using a decision matrix (signals to
   HOLD, signals to MERGE confidently, signals to flag for manual review).
   Project the dominant pattern from sample to full set.
2. **Bulk-merge script** (one-off, /tmp-scoped, not committed): codifies
   the decision matrix as a classifier function. Applies to all groups,
   producing a candidate merged config + a per-group decisions log.
3. **Manual review of HOLD groups**: smaller subset (~10% of
   collisions). Reclassify based on signals not encodable in the
   classifier (e.g., local domain knowledge, semantic ambiguity).
   Indeterminates route to a domain expert async.

**Why a script, not jq/manual:** at 57 cases × 30 sec/case = 30+ minutes
of error-prone manual edits. A 200-line script applies the matrix
identically 57 times in seconds, with a reviewable log. The script is
an instrument, not project code — write to `/tmp/`, run, copy output to
real config, delete.

**Decision-tree ordering matters:**
- Hard conflict signals (different addresses/websites/ticketing) trump
  everything → HOLD.
- High-confidence merge signals (same address, same website) trump weak
  signals → MERGE.
- Cross-reference signals (variation overlap ≥ 50%) catch
  same-entity-different-spelling cases that field comparison misses.
- Soft signals (rich-vs-stub patterns) only fire after stronger signals
  rule out.

**Conservative-skip default for opportunistic enrichment:** if the
script can sometimes lift data to a richer field (e.g., extract
address from variation strings to top-level address field), require
high confidence (e.g., regex pattern AND all-records-agree). Wrong
data in a field that propagates to downstream emission (Schema.org,
search) is worse than missing data. The conservative skip preserves
embedded data — no information loss, just no promotion.

**Treat placeholder values as null:** registries accumulate
placeholders like `neighborhood: "Unknown"` from earlier normalization
passes. The classifier should treat these as effective-null, not as
"differing" values. Otherwise the rich-vs-stub branch mis-fires and
artificially HOLDs cases that should merge.

**Origin:** S112 venue dedup (Q-B8a Path 3), 2026-05-04. 51 of 57
collisions auto-merged; 6 routed to Editorial. Pre-flight:
`specs/venue-dedup-sample.md`. Script: `/tmp/b2d-merge.ts` (not
committed). Closing commit: `d35855ada`.

## Validator coverage audit precedes any FAIL-rule addition

Before adding (or proposing) a FAIL rule to
`src/validators/schema-completeness.ts`, audit two things first:

1. **Coverage** — is the validator already running on the subtype/page-class
   you'd be guarding? `VALID_SCHEMA_TYPES` (line 16) is built from
   `Object.values(SCHEMA_TYPE_MAP)`, so any DB type without a map entry
   silently falls to generic `Event` and may bypass type-conditional rules.
2. **Existing rules** — the validator may already enforce what you think
   you're adding. The price-symbol regex `/[€$£¥]/.test(price)` was already
   live at `schema-completeness.ts:172` when S101a flagged "missing
   price-format FAIL rule." The rule existed; the violation was on a
   parallel emission surface the validator never reads (microdata, see next
   pattern).

**How to apply:** read the validator end-to-end before writing the spec
for a new rule. If the rule exists, the gap is downstream (emission shape,
emission surface, or upstream data) — not a missing rule. Misdiagnosing
"missing rule" produces a no-op fix that ships clean diffs but doesn't
change the violating output.

**Origin:** S113 S101a-A audit, 2026-05-04. Spec:
`specs/s101a-implementation.md` §2 + §5a.

## JSON-LD validator is blind to microdata; check both surfaces when emission paths diverge

`validateSchemaCompleteness` parses JSON-LD only —
`htmlContent.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)`
at `schema-completeness.ts:86`. Any schema attribute emitted as HTML
microdata (`itemprop="price"`, `<meta itemprop="availability">`, etc.) is
invisible to it. Build "passes" while the page emits violation-prone
microdata that Google's rich-results parser will still flag.

This is structural, not a bug — JSON-LD and microdata are independent
emission paths in the codebase:

| Emission surface              | Emitter                                  | Validator?              |
|-------------------------------|------------------------------------------|-------------------------|
| Per-event JSON-LD             | `buildEventSchemaObject` (event-page.ts) | Yes                     |
| Hub CollectionPage JSON-LD    | `generateSchemaMarkup` (page.ts:395)     | Yes (validateHubSchema) |
| Hub card microdata            | `renderEventCard` (page.ts:283)          | **No**                  |
| DataFeed JSON                 | `buildEventSchemaObject` → datafeed.ts   | Yes (validateDataFeed)  |

S101a-A surfaced 11,217 microdata price-symbol violations on hub cards
while JSON-LD output was 100% clean — a coverage gap, not a rule gap.

**How to apply:** when proposing a FAIL rule for a schema attribute, grep
`itemprop="<attr>"` AND `"<attr>"` (JSON-LD form) across `src/templates/`
and `src/generators/`. If both surfaces emit it, both need validator
coverage OR the fix needs to enforce a single emission shape that both
paths inherit. The S101a-B fix closes the microdata gap by adding a
`validateMicrodata()` function to `schema-completeness.ts` AND by making
`renderEventCard` source numeric values directly from `event.price.amount`
rather than reusing the display-formatted `priceText`.

**Origin:** S113 S101a-A audit, 2026-05-04. Spec:
`specs/s101a-implementation.md` §2 (gap type d, "validator scope <
emission scope") + §5a (11,217 microdata violations on 0 JSON-LD
violations).

## Date-windowed editorial JSON entries — `validFrom`/`validUntil`/`rank` extension

Established 2026-05-04 (S114). When extending `config/editorial-content.json`
or other in-repo authoring surfaces with time-bounded entries, the canonical
field shape is:

```json
"<entry_key>": {
  "vignetteEl": "...",
  "vignetteEn": "...",
  "validFrom": "2026-05-22",   // ISO YYYY-MM-DD, inclusive
  "validUntil": "2026-05-28",  // ISO YYYY-MM-DD, inclusive
  "rank": 1                    // optional integer, semantics defined per consumer
}
```

Naming rationale:
- `validFrom` / `validUntil` (camelCase, JSON convention) — chosen over
  `startDate` / `endDate` to avoid namespace collision with event-level
  `start_date` / `end_date` semantics. Also avoids the `effective` /
  `expires` legal-ish framing.
- `rank` is meaningful only to the consuming surface (e.g.
  `MAX_PICK_RANK = 3` in `hub-page.ts`); the loader just exposes it.

**Loader contract** (per `src/utils/editorial-content.ts`):
- Both fields are optional. Entry without either → always returned
  (backward compat for non-windowed featured vignettes).
- Both fields inclusive. `today < validFrom` → null. `today > validUntil`
  → null.
- `currentDate` parameter optional; defaults to today in `Europe/Athens`
  via `new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' })`
  — emits `YYYY-MM-DD` directly.
- Two helpers cover the two access patterns: `getFeaturedVignette()`
  returns the locale-resolved string; `getFeaturedPickRank()` returns
  the integer (or null) for sort/filter.

**How to apply:** if S101b or future work needs time-bounded pull
quotes, section editorials, or other JSON-authored content, reuse this
field shape rather than inventing new names. The Europe/Athens-default
date logic and the inclusive-boundary semantics should be copied
verbatim — they're load-bearing for editorial intuition (an editor
sets "valid until May 28" expecting May 28 itself to count).

**Origin:** S114 (S101a editorial picks infrastructure), 2026-05-04.
File: `src/utils/editorial-content.ts:75-103`. Test coverage:
`src/utils/__tests__/editorial-content.test.ts` "getFeaturedVignette
date window" describe block (7 tests including boundary inclusivity
and backward-compat).

## Cornerstone-conditional surface elements in hub generator

Established 2026-05-04 (S114). The hub generator already had three
cornerstone-vs-non-cornerstone branches as of S60 (FAQ count 8 vs 4,
seasonal narrative populated only on cornerstones, cross-link section
inverted). S114 added a fourth: **the comparison table's Editor's Pick
★ column appears on cornerstone hubs only**.

Pattern for adding cornerstone-only structural elements:
1. Branch in `renderHubPage` based on `config.cornerstone === true`.
2. Render the affected element (header cell, section, etc.)
   conditionally — emit empty string when not cornerstone.
3. Don't gate the underlying helper function (e.g.
   `renderComparisonRow`); thread the condition through as a boolean
   prop and let the helper render minimally when false. This keeps
   helpers data-pure and testable without HubConfig.
4. Header/footer count consistency: if you add a 5th `<th>` to the
   thead row, every `<tr>` in tbody needs to either match (5 cells)
   or render as 4-cell rows on a separate non-cornerstone path. The
   row helper's optional boolean prop handles both cases without
   forking.

**How to apply:** S101b's homepage editorial picks and any S102+ work
that adds cornerstone-only surface elements should follow this pattern
— branch in the orchestrator (hub-page.ts), thread booleans through to
helpers, keep helpers ignorant of HubConfig.

**Origin:** S114, `src/generators/hub-page.ts:161-183` (renderComparisonRow)
and `src/generators/hub-page.ts:393-422` (Part 2 with showPickColumn
branch). Test coverage: `src/generators/__tests__/hub-page.test.ts` —
5 tests verifying 4-cell default, 5-cell with hasPick, cornerstone
header rendering (Greek + English aria-label), and non-cornerstone
column absence.

## Helper-call parity across multi-emitter Schema.org surfaces (S101a-B)

When two or more emitters produce the same Schema.org property from the
same data shape, route every emitter through the same helper — never
hardcode the value at one site and helper-call at another. The drift
shows up as silent multi-surface inconsistency the validator can't see
unless its rules cover every surface.

**The Agent Athens canonical example: `availabilityForEventStatus(resolveEventStatus(event))`.**

Three emit surfaces all produce `Schema.org/Offer.availability`:
1. Detail page JSON-LD: `buildEventSchemaObject` (`src/generators/event-page.ts`) — already used the helper.
2. Hub JSON-LD: `generateSchemaMarkup` (`src/templates/page.ts:444`) — was hardcoding `'https://schema.org/InStock'` until S101a-B replaced it with the helper.
3. Hub microdata: `renderEventCard` (`src/templates/page.ts:324`) — was emitting no availability at all until S101a-B added the helper-driven `<meta itemprop="availability">`.

The helper's `omit_offer` branch (returned for past events / `EventCompleted`) must be honored by **all three** sites; in S101a-B the hub JSON-LD path was changed to drop the entire `Offer` block when the helper returns `omit_offer`, mirroring detail-page behavior at `event-page.ts:227`.

**How to apply:**
- When adding a new Schema.org-emitting surface, grep for the helper functions of any property you're emitting; do not let yourself write a literal `"https://schema.org/..."` string in template code.
- When adding a new validator rule, enumerate every emit surface for the property and ensure the rule applies to all of them. The pre-S101a-B JSON-LD-only validator is the cautionary tale.
- Helpers that return discriminated-union shapes (`{kind:'emit',value} \| {kind:'omit_offer'}`) are the right primitive: they encode "don't emit anything" as a first-class outcome, so callers can't accidentally emit a default.

**Origin:** S101a-B (commit `d7003668b`), 11,217 microdata violations cleared by routing the hub microdata + hub JSON-LD through `availabilityForEventStatus`.

## Stage by path even when build evidence looks complete (S101a-B)

A successful local build (dist verified, zero violations, helpful counts in the right places) is not evidence that work is shipped. Until the working-tree changes are committed and pushed, the work exists only on one machine, and the next pipeline auto-commit can swallow it via `git add -A` (or, after S111, simply leave it dangling on the next push).

In S101a-B, all five source files plus two specs were modified locally and the dist had been rebuilt — looking complete. But `git status` showed all seven files as ` M`/`??` and there was no S101a-B commit in the log. "Working tree green" ≠ "session closed."

**How to apply:**
- Always end a session with explicit `git add <path>` for each file, then `git status` confirmation, then `git commit`. Stage by path per [feedback_stage_precisely.md](feedback_stage_precisely.md) — never `git add -A`/`git add .`.
- Treat `git status --short` as the session-closure check. If the output is non-empty, the session is not closed regardless of how good the dist looks.
- Specs (`specs/*.md`) are session deliverables, not local-only scratch. Future planners reference them. Stage and commit them with the implementation that closes them.

**Origin:** S101a-B (commit `d7003668b`). Sub-pattern reinforces [S111 explicit-path staging](https://github.com/chrimar3/agent-athens/commit/8bae1d2e5).

### Test mirroring is anti-pattern, even when "hardcoded literals" rule looks like it applies

The rule "Test assertions stay as hardcoded string literals" applies to
per-assertion values (specific URLs, error strings, magic numbers) — values
that should not be re-derived in tests because that would create tautology.
It does NOT apply to whole exported data structures (maps, configs, type
unions). Mirroring an entire SCHEMA_TYPE_MAP / Config object in test code
creates a maintenance trap: every source-side edit requires a parallel test
edit, and the mirror provides no test value beyond duplication.

Correct pattern: import the structure and validate its shape/integrity
(every key covered, no orphans, structural invariants). Don't mirror values.

Source: S101a-B follow-up (b00ca0295) — single-line SCHEMA_TYPE_MAP edit
broke transformations.test.ts:618 because it duplicated the full map.

### git push ≠ deploy in this codebase

Tasks ending at "commit + push" do not auto-deploy. Future task templates
should include explicit `deploy: yes|no|conditional` field to remove
ambiguity. Daily pipeline auto-deploy has variable timing and bundles
unrelated changes; explicit `netlify deploy --prod --dir=dist` gives clean
deploy-ID attribution and immediate citability impact.

Source: recurring across S77, S101a-B, performance reclassification.

## structural-parity-via-shared-helper

JSON-LD emission (`src/generators/event-page.ts:162`) and microdata emission
(`src/templates/page.ts:289, 342`) both flow through `resolveEventStatus()` and
`availabilityForEventStatus()` post-S101a-B. `eventStatus` and
`offers.availability` parity between the two surfaces is therefore structurally
guaranteed at the helper layer — no runtime parity validator needed. A single
regression test exercising the shared path is sufficient to catch drift if a
future change introduces a renderer that bypasses the helpers. Informs S110
coverage-manifest scoping (parity is one less coverage cell to track).

The S101a-B comment at `page.ts:285` makes this explicit: "derive schema-only
values via the canonical helper (mirrors event-page.ts:227 behavior)."

**Caveat (value vs emission):** the helper-layer guarantee covers the *value*
of `eventStatus` and `availability` — both surfaces compute the same string.
It does NOT cover the *emission decision* (whether to render the field at
all). The "no-amount with-ticket" fallback path at `page.ts:304-308` nulls
both microdata price and availability ("Schema.org Offer requires price;
emitting availability alone creates a malformed Offer"), while the JSON-LD
path at `event-page.ts:275-288` still emits an Offer with `availability`
present and `price` omitted. For the ~114 affected events, value-parity holds
but emission-parity does not. Out of scope for the regression test; flag if
S110 manifest scope reaches into emission decisions.

**Origin:** S101b diagnostic side-finding, 2026-05-06. S101b deferred per GEO
Strategist Sequencing Addendum; this finding emerged during pre-stop reading
of `event-page.ts` and `page.ts` and reduces S101b's reactivation scope when
scraper signal lands.

## Hermetic-Fixture Blindness (2026-05-06, S2)

Unit tests written against hermetic fixtures with self-consistent canonical
spelling can pass a 100% green suite while failing against the real corpus —
because the real corpus carries historical drift the fixtures don't model.

**Concrete S2 instance:** `src/utils/__tests__/tag-filter.test.ts` had 18
tests using a synthetic `ATHENS_VENUES_FIXTURE` with neighborhoods like
"Plaka", "Gazi", "Ampelokipoi". Each test passed and the 2 integration
tests against `upsertEvent`/`updateEvent` also passed. First backfill
caught 8 of 11 Step 0c neighborhoods (256 row updates, 73% catch rate);
3 missed entirely (Ampelokipoi/Psiri/Neos-Kosmos = 95 occurrences) plus
2 below-horizon (Pagrati/Athens-Riviera = 9 occurrences).

The misses came from a parallel lineage of pollution:
`TAG_TAXONOMY.neighborhood` (in `description-generator.ts`, removed in
Step 5) had 20 entries with different transliterations than
`athens-venues.json` `.neighborhoods` (88 entries). The fixtures used
config-canonical names; the corpus had taxonomy names. Both were "right"
from each source's perspective; the divergence made the filter look
correct and the corpus look polluted simultaneously.

**Pattern signal:** if a unit-tested rule is meant to apply to a real
corpus, pair the hermetic suite with at least one **real-config integration
test** that asserts on production data shape. For S2 this would have been:
"build the exclusion set from the actual `athens-venues.json` and
`city-geodata.json`, then assert that all 11 historically-polluting
neighborhoods are dropped." That test would have failed Phase 1, before
the backfill burned a real corpus run.

**Generalization:** when a pure-function filter or validator is hermetically
tested AND deployed against a corpus with historical drift, the hermetic
suite is necessary but not sufficient. The corpus has taxonomic memory the
fixtures don't share. Detection: if the production corpus has accumulated
data via multiple lineages of canonical names (TAG_TAXONOMY history,
NEIGHBORHOOD_GREEK aliases, scraper variations), the test surface must
include an integration probe that exercises the real source.

**Detection mechanism that worked:** the user-specified pre/post top-50
SQL diff with explicit "0 of the N tracked entries should have non-zero
count" assertion. This functions as a real-config integration test
delivered after-the-fact via verification rather than baked into the test
suite. For future filter sessions, prefer baking the assertion into the
suite (`tests/tag-filter-corpus-integration.test.ts`) so it fires in CI
rather than relying on session-time SQL diffing.

**Origin (S101b context retained):** S101b deferred per GEO Strategist
Sequencing Addendum; the S101b finding emerged during pre-stop reading
of `event-page.ts` and `page.ts` and reduces S101b's reactivation scope
when scraper signal lands.

## Diagnostic-vs-system metric divergence

The metric used for diagnostics MUST match the metric the system uses
for behavior. If they differ, drift between the two is invisible until
execution.

**Anchor (B-2d, Session 112):** Strategist Q-B8a Path 3 anchored on 57
collisions via `group_by(canonical_name)` in jq. The system resolves
venue identity via `normalizeVenueKey()`, which case-folds + diacritic-
strips + whitespace-collapses. Two case-folded uppercase duplicates
(ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ, ΘΕΑΤΡΟ ΠΑΛΛΑΣ) escaped the script's classifier
because the diagnostic aggregation differed from the runtime
aggregation. Surfaced at Step 4's normalized-key check; required
surgical jq fixes mid-session.

**Generalization:** future diagnostics that inform Strategist decisions
should aggregate via the same canonicalization the system uses for
behavior. This is a stricter form of "diagnostic counts are pre-
decision; operate against current state" — not just that counts can
drift in time, but that counts can drift in method if the diagnostic
doesn't match the runtime.

**Application:**
- Pre-flight diagnostics that count instances of X should use the same
  normalization the runtime uses to resolve X.
- If a Strategist routing question references a count, the count should
  be derived through the runtime's canonical aggregation, not through
  whatever jq one-liner is convenient.
- When a Strategist lock anchors on a number, the diagnostic that
  produced that number should be preserved (script, query, or method)
  so re-derivation at execution is reproducible.

**Origin:** B-2d (Session 112), 2026-05-04. See
`specs/sprint-2-retrospective.md` Pattern #3 for the Sprint 2 instance
context. Anchor revised in Session 117 from earlier B-2c numerator-
subsets-denominator framing (a separate finding, not bundled here)
back to the documented S112 case-folded-uppercase incident — see
`.claude/notes/mistakes.md:363`.

## Address-record-wins for canonical_name collision resolution

Established 2026-05-06 (S116 / Sprint 2 closeout). Anchor: B-2d
mechanical merges (5 cases — Cantina Social, Smut, Wild Poppies,
Burger Disco Club, IT Athens).

When two registry records share a canonical_name and one has a
parseable street address in `variations[]` (street name + number) while
the other has only a short label or alias, the address-bearing record
is canonical and the stub is deleted. Pattern is ONLY mechanical when:

1. Both records have the same canonical_name (hash collision, not
   intent collision)
2. One record's variations[] contains an address pattern matching the
   project's address regex (street + number + city/postcode)
3. The other record's variations[] is empty or contains only
   short-label aliases (no street/number)
4. Neighborhood difference between the two is consistent with the
   address — the address-record's neighborhood maps to the building's
   actual location; the stub's neighborhood is informational/wrong.

**Cases requiring Editorial verification (not mechanical):**
- Both records are stubs (no address in either)
- Both records have addresses (different buildings, possibly different
  venues with same name)
- The neighborhood difference doesn't reconcile with the address (one
  record says Gazi, address parses to Syntagma — but is the address
  reliable?)

**How to apply:** when adding a B-2d-shape collision-resolution
session, separate cases into "mechanical address-record-wins" (commit
together with this rationale) vs "Editorial verification needed"
(separate commit with external sources cited). Don't mix the two in
one commit — the resolution-method grouping matters for reverts and
audit.

**Origin:** S116 closeout, `commit eeeee8aea`. B-2d hold analysis
(2026-05-04 brief) provided the rule; S116 was first execution.

## Wikidata building-entity vs institution-entity for venue Place sameAs

Established 2026-05-06 (S116 / Sprint 2 closeout). Anchor: Onassis
Stegi sameAs decision — Q43064509 (building) chosen over Q109297692
(institution variant).

When attaching `sameAs` Wikidata QIDs to venue records (Schema.org
`Place` entities), prefer the **building entity** over the
**institution entity** when both exist. Reason: Schema.org Place
semantics describe a physical location with coordinates, capacity,
opening hours; the institution entity is an organizational concept
that may have multiple buildings or be venue-less.

**Examples:**
- Onassis Stegi: Q43064509 (the Συγγρού Avenue building) ✓
  Q109297692 (the Onassis Foundation as an organization) ✗
- Megaron Mousikis: Q582203 (the Athens Concert Hall building) ✓
- Benaki Πολιτισμού: Q816669 (the Koumpari main building) ✓
  (the broader Benaki Foundation umbrella has separate QIDs for
  Πινακοθήκη Γουλανδρή, Πειραιώς 138, etc.)

**How to apply:** when researching a sameAs candidate, check Wikidata
for both shapes. If only an institution entity exists (no building
QID), defer the sameAs rather than attach the wrong shape — same
discipline as S116's Pireos 138 deferral. The institution-entity
sameAs would be valid for `Organization` Schema.org type but not for
the `Place` (venue) we emit.

**Origin:** S116 closeout, Tier 1 sameAs landing. Inherited convention
from prior Strategist locks (Q-B7, Q-B8a) but not previously documented
as a pattern.

## Archival-vs-operational threshold (180-day vs 45-day)

Established 2026-05-06 (S116 / Sprint 2 closeout). Anchor: Q-B9
status quo (180-day revisit threshold accepted vs 45-day operational
cadence).

The same metric can be measured against multiple thresholds depending
on whether the consumer is operational (daily decisions) or archival
(quarterly reviews). When choosing a threshold for a new policy
question, classify the consumer first:

- **Operational** (45-day, weekly, etc.): the metric drives an
  imminent action. Threshold should track typical operational signal
  decay.
- **Archival** (180-day, quarterly, annual): the metric drives a
  retrospective review. Threshold should be long enough that
  short-term fluctuations don't surface as false positives.

**How to apply:** when defining a new "stale" / "fresh" policy in
config or code, name the consumer in the comment. e.g.
`STALE_VENUE_DAYS = 180  // archival — quarterly registry review` vs
`STALE_ENRICHMENT_HOURS = 36  // operational — pages oncall`.

**Origin:** S116 closeout, Q-B9 lock. Status quo accepted at 180-day
revisit; the operational 45-day window for enrichment data had been a
red herring in earlier discussion (different consumer, different
purpose).

## Memory-Resident State Can Mask On-Disk Divergence Indefinitely (2026-05-06, S2 → c0aa81a0d recovery)

Process-internal state (loaded config, computed exclusion sets,
in-memory snapshots) outlives the disk state that produced it. A test
or verification step running in the same process as a config Edit is
NOT evidence that the on-disk file is correct — it's evidence that the
in-memory state used by that process is correct. Those can diverge
silently if any concurrent process mutates the disk between load and
end-of-process.

**Concrete S2 instance:** during the S2 → `ae0f0d5f1` session, I ran
the Edit tool to add `neighborhood_aliases` to
`config/athens-venues.json`. The corpus backfill subsequently ran in
the same process — `loadDefaultExclusionSet()` read the on-disk file
once, cached the resulting Set in module memory, and the backfill
applied the cached Set to all 256+106 row updates. Tests, build, and
production verification all ran clean.

What I didn't observe: an interleaved `git stash push` from a
concurrent Sprint-2-closeout flow had stripped `neighborhood_aliases`
from the on-disk file between my Edit and my `git add`. The in-memory
exclusion set used by backfill / tests / build still had aliases (it
was loaded from a working tree that briefly contained them). The
on-disk file did not. My subsequent `git add config/athens-venues.json`
captured the post-stash blob — without aliases. Commit `ae0f0d5f1`
shipped without the field; corpus stayed clean only because the
backfill had already completed.

The bug would have surfaced silently on the next daily pipeline run,
when a fresh process called `loadDefaultExclusionSet()` against the
on-disk config without aliases — at that point any new event with
"Psiri" / "Pagrati" / "Ampelokipoi" tags would have under-filtered
straight into the corpus.

**Defensive contract** for any session that edits a config file
consumed by the same session's tests: add a fresh-process verification
step. After commit, run a separate `bun test` invocation in a NEW
process, reading the freshly-committed file. If in-process tests pass
but fresh-process tests fail, on-disk state diverged from the
in-memory state earlier tests ran against.

**Detection mechanism that worked (post-hoc):** a subsequent session's
plan-mode audit included `jq 'keys' config/athens-venues.json` and
`jq '.neighborhood_aliases'`, both run in fresh processes against the
on-disk file. The divergence surfaced immediately. The lesson is to
bake that fresh-process audit into the SAME session as the edit, not
the next one.

**Generalization:** any pure-function utility that loads JSON config
at module init (mirroring the `src/utils/schema-geo.ts` pattern) is
vulnerable to this. The fix isn't in the utility — it's in the
session protocol: edit → commit → run a fresh-process verification
that reads the committed file from scratch.

## Infrastructure value is independent of behavior change (2026-05-07, S118 from S110f)

S110f shipped citation-correctness governance (validator + chokepoint
filter + monitoring + kill switch + override path) bundled with a
brief revision intended to restore throughput. The brief revision
didn't restore throughput (root cause was wrapper-layer, not
brief-layer — see `mistakes.md` "S110 series diagnostic discipline").
But the governance infrastructure passed every architectural
verification gate it had: 20/20 loader unit tests + 37/37 query tests,
end-to-end filter test (62 dist refs → 0 on a single tier-A0 concern
insertion), `printHardStopSummary` renders cleanly with empty
operational data, build succeeds.

**The pattern:** validator + filter + monitoring infrastructure ships
value independently of the behavior change it was framed alongside.
Three properties make this work:

1. **Graceful degradation when operational state is unsupported.** The
   chokepoint filter (`getHardStopExcludeIds` in `src/db/database.ts`)
   and the monitoring report (`printHardStopSummary` in
   `src/validators/completeness-reporter.ts`) both check
   `sqlite_master` for the `event_concerns` table before querying it.
   Test fixtures use base schema (no migrations), so without this
   guard, every test invoking these paths would crash. The same guard
   makes the infrastructure run cleanly when there's no operational
   data yet (0 concerns flagged → all-zero monitoring output, no
   filter applied, all events ship).

2. **Idempotent migration.** `011-event-concerns.sql` adds a table
   with `IF NOT EXISTS` clauses on table + 2 indexes. Re-applying is
   harmless. The migration can land before the rest of the
   infrastructure does.

3. **Chokepoint architecture (Option β over γ).** Filter at one read
   site (`getAllEvents()`), not at N consumers. One edit, 62 surfaces
   protected. Verified empirically by inserting one concern and
   grepping `dist/` for dangling refs after a fresh build.

**Generalization (standing rule):** any new query path that reads
from a table introduced by a migration needs an existence guard via
`sqlite_master`. This pattern lives in `database.ts:getHardStopExcludeIds`
and `completeness-reporter.ts:printHardStopSummary` and should be the
standing approach for similar future work. Cost: ~3 lines + one extra
SELECT per call. Benefit (load-bearing): test fixtures don't crash;
infrastructure code can ship before operational state arrives.

**Deeper governance lesson:** when planning a session that bundles
infrastructure + behavior change, scope-name the infrastructure
separately. Its value crystallizes the moment the behavior layer
works, regardless of when that is. Don't fold the architectural gate
into the behavioral gate — see `mistakes.md` "Bundled architectural +
behavioral scope produces wrong verification gates."

## Soft-hold for cross-session bundling (2026-05-07, S118 from S110f)

When a session ships verified architectural work whose end-to-end
verification gate fails for reasons exogenous to the session's actual
scope (e.g., a transport-layer issue blocks a logical-layer fix from
being exercised), preserve the working tree rather than reverting or
force-committing. Three preconditions:

(a) failure is documented as exogenous;
(b) tests pass on the held state;
(c) the next session has a defined trigger that resolves the held
    work — commit if the exogenous issue clears and verification
    passes, revert if it reveals a defect under load.

The git working tree becomes a session-spanning carrier; future
sessions inherit the diff via `specs/sNNN-soft-held.md` documentation
that names what's held and what triggers each resolution path.

**S110f → S110g instance:** S110f shipped governance infrastructure
(validator + chokepoint filter + monitoring + kill switch + override
path); verification fire failed via wrapper-layer `STDOUT_IDLE_CAP`
(exogenous to S110f's scope). Tests pass on the held state (20/20
loader + 37/37 queries; one-off filter test 62→0 dist refs).
S110g's Step 4 verification fire is the defined trigger:

- ≥3 saves with no dangling refs → commit S110f + S110g together
- persistent IDLE_CAP kills with same failure class → iterate S110g
  fix; S110f stays held
- new failure class → diagnose separately; do not commit S110g; S110f
  stays held
- ≥3 saves but Guard 6 dangling refs → revert *only*
  `src/db/database.ts`; rest of S110f + S110g stay

Plan at `/Users/chrism/.claude/plans/s110g-stdout-idle-cap-recalibration.md`.

**Why this beats the alternatives:**

- **Hard revert** destroys verified architectural work to return to a
  baseline that's also broken; doubles total effort if the next
  session re-implements.
- **Force-commit unverified** ships infrastructure without empirical
  evidence the surrounding system is healthy enough to use it; the
  audit checkpoint has no real data to audit.
- **Soft-hold** preserves the verified work, defers the commit to the
  moment the exogenous issue clears, and lets the next session run
  into a primed environment with infrastructure already in place.

### Soft-hold + pull --rebase incompatibility

When committing files outside the held bundle during a soft-hold
(e.g., memory updates while feature code is held), the standard
`git pull --rebase` step will fail with exit 128 because pull-rebase
requires a clean working tree and held files are unstaged. The push
that follows will succeed if the remote hasn't diverged (fast-forward
case), which is the common case for fast-turnaround operator commits.
If divergence is suspected, the workaround is
`git stash --include-untracked` → `git pull --rebase` → `git stash pop`.
The defensive check before pushing is `git fetch && git log HEAD..origin/main`
— read-only, doesn't disturb the working tree, confirms no divergence.

*Discovered during S118 `c37255c4d` memory-only commit (pull-rebase
exit 128, push succeeded fast-forward).*

**Connects to:** `mistakes.md` "S110 series diagnostic discipline"
(why the exogenous-scope distinction matters); `mistakes.md`
"Bundled architectural + behavioral scope produces wrong verification
gates" (the framing-vs-gate gap that necessitated soft-hold);
`patterns.md` "Infrastructure value is independent of behavior change"
(the architectural-value claim that justifies preserving rather than
reverting).

## Empirical-first calibration for transport-layer thresholds (2026-05-07, S110g)

Don't tune transport-layer thresholds (timeouts, idle caps, retry
budgets) from intuition; tune from observed real durations. The wrong
threshold is invisible until it kills — by definition, an idle cap
that's correctly set produces no kills, so until you have kill data
you don't know whether the cap is too tight, too loose, or right.

S110g's empirical reframe of `STDOUT_IDLE_CAP=120`: five sessions of
brief-revision iteration treated repeated `KILL_CAUSE: stdout-idle
exit=125` as evidence of unproductively long agent thinking. Step 2's
mining of n=98 kills across all preserved logs revealed the actual
story: 76/90 (84%) of real kills landed at idle 120-134s — the agent
commonly thinks for 120-130s before producing first
`content_block_delta`, hitting the cap right at the edge of natural
distribution. **The cap was killing the median, not the tail.**

**The discipline:**

1. Treat every kill log line as a calibration data point. Right-censored
   lower bounds are still data.
2. Segment the kill distribution before recommending a threshold. Rule
   of thumb: if mode of kill-idle ≈ cap, the cap is killing natural
   distribution and needs to rise; if mode of kill-idle = 2×–3× cap,
   the cap is right and rare tail events are real.
3. Verify the methodology against the artifact format before designing
   the diagnostic pipeline. The original S110g plan's awk pipeline
   assumed wrapper line prefixes wrap each stream-json event; the
   actual `cat $BATCH_OUT >> $LOG_FILE` after batch completion produces
   unprefixed events. Methodology assumptions need trace-status
   discipline same as fix designs (see `mistakes.md` Mistake 3 from
   the S110 series section).

**Connects to:** `mistakes.md` "S110 series diagnostic discipline"
(why the wrong-layer fix kept happening); `specs/s110g-stdout-idle-samples.md`
(the empirical dataset).

## Scheduled fires confound verification (2026-05-07, S110g)

When working on a system with auto-triggers (launchd, cron, scheduled
jobs, GitHub Actions cron), check the schedule before assuming a
fire's timing maps to your action. The disciplined version: enumerate
the next N scheduled fires before any wrapper edit so that observed
fire timestamps can be correctly attributed.

**S110g instance:** the apparent verification fire at 19:21:27 killed
both batches at idle≈124s — only possible under the *old*
`STDOUT_IDLE_CAP=120`, not the new 600 just edited in. Reading the
file mtime (21:36) against the fire timestamp (19:21) revealed the
fire was actually `com.agentathens.enrichment-19.plist`'s 19:00
scheduled auto-fire, which ran the OLD wrapper (the manual edit
hadn't landed yet at 19:00). The actual S110g verification was the
next scheduled fire at 22:00 (`enrichment-22.plist`), which ran the
new wrapper and produced clean signal.

**The pattern:** scheduled triggers don't announce themselves. A fire
that looks like the verification you're waiting for might be a
scheduler doing its job. Always cross-check (a) which plist label
triggered, (b) what wrapper version was on disk at fire time, (c)
whether the result is consistent with the post-edit configuration. If
any of these are mismatched, you're reading the wrong fire.

**Operational corollary:** a system with N daily auto-fires has N
opportunities for verification confusion per day. Sessions that touch
the wrapper should either pause the relevant launchd labels
(`launchctl unload`) for the session's duration or explicitly own the
fire timing via manual `launchctl start` and ignore auto-fires that
interleave.

**Connects to:** `mistakes.md` "S110 series diagnostic discipline"
(the data-flow trace discipline this generalizes);
`docs/operational-todos.md` "S110f calibration audit" (where the
audit timing depends on knowing which fires produced which data).

## Atomic mkdir as portable lock primitive (2026-05-08, S111)

When `flock(1)` is unavailable (macOS without Homebrew flock package,
or any environment where the binary isn't on PATH) and the
filesystem is local APFS/HFS+/ext4, `mkdir` is atomic by POSIX spec
and serves as a drop-in lock idiom. The directory IS the lock;
metadata (PID, etc.) goes inside the directory as a regular file,
not as the lock itself.

**Four discipline points:**

1. The trap that removes the lock directory must be set ONLY inside
   the success branch of `mkdir`, never before. If the trap is armed
   before the acquisition outcome is known, an interrupt during
   acquisition could destroy a lock owned by another shell.

2. Stale-lock recovery (after detecting a dead-PID or aged-out lock)
   must be **single-shot retry**, not a while-loop. After `rm -rf`,
   call `mkdir` once: if it fails, another shell beat you to it —
   exit 0 and let them work. While-loops in this position can spin
   under pathological churn (rapid stale-lock turnover from a
   broken upstream).

3. Verify the filesystem is local before relying on mkdir atomicity.
   `mount` should show `apfs, local` or equivalent. Sync folders
   (iCloud, Dropbox, OneDrive) and network filesystems (NFS, SMB,
   AFP) do not guarantee the same atomicity semantics; APFS, HFS+,
   ext4, btrfs all do.

4. When renaming a lock path or any path tracked by external tooling
   (gitignore, monitoring, log rotation, backup-exclusion lists),
   grep ALL tracked files for the old path string before commit, not
   just the file being edited. Step 1 trace discipline extends
   beyond the file under change. *S111 instance:* the wrapper edit
   updated 9 in-script `LOCK_FILE` references but missed the
   `.gitignore` line 61 entry — surfaced post-push when the first
   live launchd fire after deploy left the new `.auto-enrich.lock.d/`
   directory showing as untracked in `git status`. Closed in a
   single-line follow-up commit.

**Why prefer mkdir over flock(1) on macOS:** stock macOS does not
ship the `flock(1)` userspace tool — Apple's BSD heritage provides
`flock(2)` (the syscall) and `lockf` (a different API) but not the
GNU userspace utility. Homebrew has no `flock` package by default;
some users install via custom formula but it's not reliable. Even
if launchd's effective PATH includes Homebrew bins (worth verifying
per-plist via the `EnvironmentVariables` block), the binary itself
might not be installed. mkdir is POSIX, present everywhere, and
atomic on every local filesystem you'd reasonably ship to.

**S111 instance:** `scripts/auto-enrich.sh` lock at lines 140–169
replaced check-then-create file lock with mkdir-based directory
lock. PID stored at `$LOCK_DIR/pid` for stale-lock recovery; EXIT
trap removes the directory. Race simulation (12/12 trials, 3
surfaces) confirmed exactly one winner per trial.

**Connects to:** `decisions.md` "S111 — Atomic lock acquisition"
(trace results that ruled out flock(1) and confirmed APFS as the
atomicity-supporting filesystem); `patterns.md` "Race simulation:
classify by log content, not by liveness at sleep N" (the
verification methodology used).

## Race simulation: classify by log content, not by liveness at sleep N (2026-05-08, S111)

Verifying concurrency fixes by spawning N processes and counting
"survivors" via `ps` after a fixed sleep is fragile. The metric
only works if winners stay alive for the full sleep duration; if
a winner's post-acquisition path is short (e.g., dry-run mode that
short-circuits within ~1s), survivor count drops to zero and the
test reports false failure even though the race resolved correctly.

**The robust metric:** classify each process's outcome by the log
lines its branch emits. Every branch in a well-instrumented lock
acquisition emits a distinct log message:

- Winner → `=== Auto-enrichment starting ===` (or whatever the
  post-acquisition first-action message is)
- Loser via alive-PID branch → `Another enrichment already running`
- Loser via stale-PID recovery → `Lock recovered by another shell
  during stale-PID recovery`
- Loser via aged-out recovery → `Lock recovered by another shell
  during force-remove`

Counting `won` vs `lost-*` classifications across both spawned
shells is independent of race-resolution timing. As long as both
shells flush their logs before the test inspects them, the
classification is deterministic.

**Bonus:** the loser's specific log line tells you which branch
fired, which lets a single test simultaneously verify both the
race-resolution outcome (exactly one winner) AND the branch
coverage (loser exercised the expected recovery path). With the
survivor-count metric, branch coverage is unobservable.

**S111 instance:** First-pass simulation reported 0 survivors at
sleep=2s on Class A trials. Inspection revealed both shells had
exited cleanly within the sleep window — the winner via dry-run
short-circuit, the loser via "Already running" skip. Switching to
log-content classification produced 12/12 clean trials across 3
surfaces (5 Class A + 5 Class B-dead + 2 Class B-aged) with
verified branch coverage.

**Generalization:** any concurrency fix where each branch emits a
distinct log line can use this metric. If the implementation logs
opaquely (one generic "Skipping" message regardless of which branch
fired), add branch-specific log strings as part of the fix — they
cost nothing at runtime and pay back as test-grain.

**Connects to:** `patterns.md` "Atomic mkdir as portable lock
primitive" (the fix this verified); `decisions.md` "S111 — Atomic
lock acquisition" (full trace results including the 0-survivor
diagnostic episode).

## Snapshot capture: write to spec file when automation cannot yet reach the source (2026-05-08, S122)

When an external system holds ground-truth that the project's
automation cannot yet pull (dashboards behind auth, APIs not yet
integrated, manual-research tasks), and the numbers are
time-sensitive (shifting hourly, needed as a baseline anchor for a
deadline), bypass the automation gap and write directly to a
date-stamped spec file in `specs/`. This is the fallback when
CSV-row updating, DB writing, or any other automated path is blocked.

**Shape of a snapshot spec:**

- Date in the filename: `specs/<descriptor>-baseline-YYYY-MM-DD.md`
- Frontmatter section with `**Captured:**` (timestamp),
  `**Days since X:**` (delta context if applicable),
  `**Deadline anchor:**` (why this matters)
- Snapshot table: metric × prior-baseline × current × delta — the
  comparison view is the load-bearing element
- Sources: dashboard names, query strings, inspection date, enough
  that someone re-running this in 6 months can re-find the data
- Open items routed elsewhere: what this snapshot does *not* cover
  and where those items live (other agents, follow-up sessions,
  deferred work)

**Why a spec file, not a CSV row, when both could exist.** The CSV
is trend-signal — many low-detail observations to draw a slope
line. A snapshot spec is anchor-event — single high-detail capture
meant to be re-read in context (e.g., "what did we look like
pre-I/O before that launch?"). Compressing an anchor into a CSV row
loses the interpretation, sources, and routing-to-elsewhere — which
are the whole point. Both can coexist; the CSV gets the numbers,
the spec gets the story.

**S122 instance:** GSC + Bing Webmaster Tools indexed counts,
gathered manually 17 days after the S90 cascade-failure pipeline
fix. The project's automation
(`scripts/monitor-search-visibility.ts`) was designed to record
these as CSV columns but lacks an `--update` mode to retrofit the
day's existing launchd-written row. Rather than block on the
missing feature, the recovery numbers were captured in
`specs/s90-recovery-baseline-2026-05-08.md` with full sources, the
known-issues entry was downgraded against this snapshot, and
`--update` mode was deferred to next session with its design
decisions pre-ratified (`decisions.md` "S122 — `--update` mode").
The deadline anchor (2026-05-19 Google I/O comparison) was
preserved without compromise.

**Generalization:** any time the response to "we don't have
automation for this yet" is "skip this measurement window," the
data is gone. A spec-file snapshot gives a third option: capture
now, automate later, and the historical record is preserved either
way. Especially valuable when (a) the window is irreproducible
(e.g., pre-launch baselines, post-incident state, time-bound
external events) or (b) the gap-to-automation is non-trivial and
shouldn't bottleneck the capture.

**Connects to:** `decisions.md` "S122 — `--update` mode for
monitor-search-visibility.ts" (the deferred-implementation
decisions this pattern fills the gap for);
`specs/s90-recovery-baseline-2026-05-08.md` (the canonical
instance); `specs/s100-kpi-baseline-2026-04-28.md` (a sibling KPI
capture that established the date-stamped spec precedent).

### Schema verification: `.schema` is not enough — run a SELECT

**Pattern:** Verifying column names by reading `.schema` output is incomplete.
Joins, computed values, aliases, and naming-convention drift (slug vs id,
source_url vs url) hide. Briefs that pass `.schema`-only verification can
still fail at runtime with `no such column: X`.

**Rule:** When a brief asserts that column `X` exists in table `T`, the
verification step is:

```sql
SELECT X FROM T LIMIT 1;
```

— not `.schema T | grep X`. The SELECT either succeeds (column exists with
that exact name) or errors immediately.

**Why this matters here:** During the imageless-events diagnostic session
(2026-05-08), the brief verification asserted `slug ✅` and `source_url ✅`
for the events table. Both failed at execution: `slug` is a computed value
from `generateEventSlug()` at event-page.ts:110 (not stored), and the URL
column is `url`, not `source_url`. 6th case of this pattern across recent
sessions.

**Applies to:** any brief verification that touches DB columns, JSON keys,
or named TypeScript fields. The principle generalizes: verification asserts
existence, so the verification step must be the same operation as the
intended use.

### Atomic CSV mutation: read → modify in memory → tmp → renameSync

**Pattern:** When patching an existing row in a CSV that other processes may
read (or that a launchd-style scheduler may overwrite later in the day), the
mutation must be atomic at the filesystem level. The recipe:

```typescript
const lines = readFileSync(csvPath, 'utf8').split('\n');
// ... mutate `lines` in memory (find target row, splice values)
const tmpPath = csvPath + '.tmp';
writeFileSync(tmpPath, lines.join('\n'));
renameSync(tmpPath, csvPath);
```

**Why this works:** `rename(2)` on the same filesystem is atomic at the OS
level — concurrent readers either see the old file or the new file, never
a partial write. Crash mid-write only orphans the `.tmp`, leaving the
original CSV untouched. No half-written state is reachable.

**Why this matters here:** `data/search-visibility-log.csv` is written by
launchd and read by `lastRowBefore()` / `getEnrichmentStats()` /
`getWrapperDiscrepancyStats()` from the same script. Without atomicity, a
manual `--update` run racing the daily launchd append could land a torn
row that breaks downstream `row.split(',')` invariants.

**Used in:**
- `migrateCsvIfNeeded` (scripts/monitor-search-visibility.ts:173-175) — schema migration
- `updateTodayRowManualMetrics` (scripts/monitor-search-visibility.ts:189+) — manual-metrics patch (Session 125)

**Applies to:** any in-place mutation of a flat-file artifact under `data/`
or `logs/` where readers run concurrently or the file is the source of
truth for an automated monitor.

### Pattern: Local file:// inspection of static-site output requires HTTP serving when CSS hrefs use absolute paths
First observed: Session 126
Symptom: Tests pass + markup correct + browser shows unstyled page (default fonts, raw underlines, no layout). Looks like total CSS load failure.
Cause: dist/*.html emits `<link rel="stylesheet" href="/styles/...">` with absolute path. file:// resolves `/` to filesystem root, not site root → CSS doesn't load.
Diagnosis before assuming bug:
1. Check `<link>` href in HTML — if starts with `/`, suspect path resolution
2. Run `cd dist && python3 -m http.server 8080` and inspect via http://localhost:8080
3. Only after HTTP serving still shows unstyled, suspect actual CSS bug
Cost saved: ~18 min diagnostic time the first time we hit this; future hits cost ~30 sec.

### Pattern: Class-name collisions across semantic roles are invisible in tests but catastrophic in cascade
First observed: Session 126
Symptom: Markup correct per spec, tests pass, but visual layout broken — elements overlap, content z-stacks, ghosts bleed through.
Cause: A class name reused with different semantic intent (e.g., `.card-image` for both `<img>` element AND wrapper `<div>`). Cascade resolves by file order at equal specificity, not by intent. Old rule's properties (e.g., `position: absolute; inset: 0`) leak onto the new wrapper role.
Diagnosis path:
1. Grep for ALL rules matching the disputed class: `grep -B 2 -A 10 '\.classname' design-system.css`
2. Check browser DevTools Computed panel — properties applied vs declared
3. Identify if the conflicting rule was authored for a different element/role than the new usage
Resolution preference (minimal-change ethic):
- Option A: tighten existing rule's selector with `:not()` — surgical, no markup or test change
- Option B: increase new rule's specificity + override conflicting properties — verbose
- Option C: rename in markup — cleanest but breaks spec compliance if spec mandates verbatim class names

### Pattern: Concurrent-session race on session numbering (S126, 2026-05-10)
First observed: Recurring failure mode (≥8 occurrences S100–S126).
Symptom: Two parallel Claude Code sessions claim the same Session-N number, producing an "Nb vs N+1" question at closeout time. Most recent: Tier-1 Image Fallback claimed Session 126 while the state audit was planned-but-unnumbered — produced a 126b/127 numbering question two days after the audit ran.
Cause: Numbers assigned (or "reserved") at session start. Parallel sessions can't see each other's reservations until a commit lands, so both end up claiming the same N.
Defense:
- Numbering is assigned at session close, not session start
- Diagnostic-only work (audits, state checks) does not consume a session number — log as a dated `### Audit — YYYY-MM-DD` entry instead
- Before assigning N, grep `docs/session-log.md` for that number and check `git log --since="N days ago"` for parallel-session indicators

### Pattern: Multi-repo environment requires explicit git-toplevel assertion before any git operation (S127, 2026-05-10)
First observed: Recurring across S122 + earlier sibling-project leak incidents.
Symptom: A `git push` from inside `agent-athens/` operated on a parent-directory `.git/` (the IoT project's repo at `~/.git/`) instead of agent-athens's repo, sweeping unintended commits to the wrong remote. Or: `git status` shows files from a sibling project as "modified" because the inherited git context is wrong.
Cause: `~/` (or any ancestor of multiple project subdirectories) hosts a `.git/` that masquerades as the active repo for any subdirectory that doesn't have its own `.git/` higher in its parent chain. CWD is not enough; git walks up.
Defense — preamble pattern:
```bash
test "$(git rev-parse --show-toplevel)" = "<expected absolute path>" \
  || { echo "ABORT: wrong git root — likely upstream ~/.git/ leak"; exit 1; }
test "$(git rev-parse --abbrev-ref HEAD)" = "<expected branch>" \
  || { echo "ABORT: not on <branch>"; exit 1; }
test -z "$(git status --porcelain)" \
  || { echo "ABORT: working tree not clean"; git status -sb; exit 1; }
git fetch origin <branch> --quiet
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/<branch>)" \
  || { echo "ABORT: out of sync"; exit 1; }
```
Run this **before** any session-work that includes git commands. Sequential `&&` short-circuits to surface the first failure. Failure → STOP, do not run session steps from a contaminated environment.

### Pattern: Briefs make falsifiable predictions; verification includes the brief's own predictions (S127, 2026-05-10; numeric-premise sub-rule added S128, 2026-05-10)
First observed: Recurring across S71, S82, S95, S100b, S101a, S127, S128.
Symptom: A brief asserts "the audit found X cornerstones, Y is gated, Z drift sites at lines L1-L2." The executor takes those as given, plans against them, and only at implementation time discovers the assertion was wrong. Plan invalidates mid-execution. S127 specifically: brief said 7 cornerstones, only 4 existed; brief said gating-block at lines 474-493, actual was 464-489; brief said `hub-page.ts:325/589` were drift sources, actual function was `buildPageMetadata` in `urls.ts:109`.
Cause: Briefs are written from a snapshot — Phase 1 reconnaissance ran sometime before, code changed since, or the brief author misread the source. Treating predictions as facts creates a build on a foundation that may have shifted.
Defense:
- For every load-bearing claim a brief makes (file path, line number, function name, count of N things, slug list, type signature), spend a parallel Phase 1 verifying it against current code BEFORE writing the implementation plan.
- Specifically: re-grep file:line references; cross-reference slug lists against canonical configs; verify type signatures by reading the function body.
- The cost of verifying the brief's predictions is small (a few minutes of `Read`/`grep`); the cost of building on wrong predictions is rework + plan thrash + sometimes reverted commits.
- This pattern earns its slot when a brief's framing would have triggered a false stop-rule or sent the implementation in a wrong direction. S127 hit both (false Class B stop, scope assumed 7 not 4).

**Numeric-premise sub-rule (S128, 2026-05-10 — Stale-Premise Pre-flight Rescue):** When a brief's premise is a *number* drawn from project memory — "63% pass rate", "n=9 sample", "34-point gap", "still failing at X events/day" — the verification has higher leverage than usual. A drifted file:line just causes re-grep; a drifted *premise* number can make the entire session tautological. S128 caught this at pre-flight: the brief's "63% pass rate / 34-pt gap" cited exhibition completeness from a prior audit, but `data/build-completeness.json` showed `passRate: 100`. Running the audit anyway would have produced an "all green" report against a question that no longer existed. **Rule:** every audit-style session whose premise is a numeric claim from project memory must verify the number in Step 0, before any diagnostic SQL or grep runs against it. The check is one `jq`/`grep`/`sqlite3` call. If the number has moved, ask the user whether the session still has a purpose before continuing — don't just adjust the methodology.

### Pattern: Sibling-project CLAUDE.md pollution via permissive un-ignore rules (S127, 2026-05-10 — earned earlier, formalized in this session's post-session updates)
First observed: Earlier sibling-leak incidents (pre-S127); earned during today's pre-session triage.
Symptom: A parent repo (e.g., a top-level workspace `.git/` covering multiple project subdirectories) has `.gitignore` rules like `!CLAUDE.md` (un-ignore CLAUDE.md). Every sibling project's CLAUDE.md becomes git-tracked from the parent repo's perspective. Modifications in any sibling propagate as "uncommitted changes" to the parent. Cross-session work in one project bleeds into another's git status.
Cause: Permissive un-ignore rules don't scope to a single project — they apply recursively. `!CLAUDE.md` in the workspace root un-ignores every CLAUDE.md anywhere below it, including in sibling project subdirectories.
Defense:
- For workspace-style repos covering multiple projects, prefer explicit per-project includes (e.g., `!project-a/CLAUDE.md`, `!project-b/CLAUDE.md`) over global un-ignores (`!CLAUDE.md`).
- When initializing a new project under an existing workspace, run `git status` from the workspace root and scan for unintended sibling-leak entries before committing anything.
- The git-toplevel assertion preamble (above) is a runtime defense; the per-project un-ignore is a structural defense. Use both.

### Pattern: Content-hash gating shape — canonical seam for cornerstone JSON-LD dateModified stability (S127, 2026-05-10)
First observed: S101a (this-weekend gating); generalized in S127 (today, this-month, open).
Use when: A surface emits a JSON-LD `dateModified` (or analogous "last updated" timestamp) that an external index consumes, and the surface's underlying content is stable across most builds but may change daily. Default `new Date().toISOString()` makes the timestamp advance every build, regardless of content change — index sees daily false-update signals.
Canonical seam:
1. **Hash function** — pure function over the surface's stable content. For event-driven hubs: `hashEventSet(events)` at `src/utils/event-set-hash.ts` (sorted SHA-256 of `id|title|startDate|endDate|venue.name`, 16 hex chars). Sort before hash so order doesn't affect the digest.
2. **Resolver** — `resolveLastModified(urlPath, currentHash, manifest)` at `src/sitemap/content-hasher.ts`. Returns the previous `lastModified` if the hash matches the manifest's stored hash for that URL, else returns today's date in the appropriate timezone (`DateTime.now().setZone('Europe/Athens').toISODate()`).
3. **Manifest** — `data/event-set-hashes.json`, persistent across builds. Per-URL entries: `{ hash, lastModified }`. Locale-paired surfaces (`/foo` and `/en/foo`) share the same hash (events are the same, only copy differs) but get separate manifest entries (locales can drift independently if one was previously seen and the other is new).
4. **Wiring** — populate a `lastUpdateOverrides[slug]` dict at the build's main entry point. Pass through to the renderer (e.g., `renderHubPage(..., lastUpdateOverrides[slug])`). Renderer applies via `metadata.lastUpdate = override` before the HTML emission. Final emission at `src/templates/page.ts:516` reads `metadata.lastUpdate`.
5. **Helper extraction** — for testability and to avoid duplication when adding more cornerstones, extract the loop-over-slugs-build-input-call-resolver block into a pure helper. S127 example: `gateCornerstoneHashes(inputs: {slug, events}[], manifest)` at `src/utils/gate-cornerstones.ts`. Test surface: 9 unit tests covering populate, preserve, advance, manifest write, locale-shared hash, sort independence, empty input, unrelated-entry preservation, independent locale drift.
6. **Opt-in slug list** — `GATED_CORNERSTONES = [...] as const` in the build entry point. Hardcoded, not derived from `config.cornerstone === true`. Adding a cornerstone is a deliberate edit here, preventing accidental enrollment when a new hub is added to config.
Defense — verify after wiring:
- Two consecutive builds with no DB change must produce byte-identical `dateModified` for every gated surface (CORE INVARIANT).
- Caveat: `writeHtmlIfChangedSync` strips `dateModified` before comparing old vs new HTML. If only `dateModified` changed, the file isn't rewritten — so observing the on-disk artifact is unreliable. The manifest is the canonical record; production HTTP response is the deployed truth.
Connects to: `decisions.md` S101a (original /this-weekend gating decision); S127 helper-extraction-for-testability decision; `specs/s127-residual.md` (4 deferred items: unbuilt cornerstone references, filter-correctness gap, datafeed/search-index drift, per-event meta).

### Pattern: Targeted stash for build-artifact preamble trips (S128, 2026-05-10; validated S129, 2026-05-11)
First observed: S128 pre-flight; second application S129 preamble.
Symptom: The defensive preamble (the "Multi-repo git-toplevel assertion" pattern above) requires `test -z "$(git status --porcelain)"` before any session work begins. A regenerated build artifact — `data/build-completeness.json`, `data/event-set-hashes.json`, sitemap snapshots, etc. — sitting dirty in the working tree trips this assertion even though it represents no decisional intent. The session can't proceed without resolving the dirty state.
Cause: Some artifacts in this repo are checked-in snapshots that are also produced by `bun run src/generate-site.ts`. Any prior session that ran a build will leave them dirty until the next commit (often the next daily-pipeline commit). The preamble doesn't and shouldn't distinguish derived from authored content — that distinction belongs to humans, not bash predicates.
Defense — targeted stash:
```bash
git stash push -m "<sessionN>-preamble: <file> regeneration" <path-to-artifact>
test -z "$(git status --porcelain)" || { echo "still dirty"; exit 1; }
echo "PREAMBLE OK"
# ... run session work ...
# At session end (before any post-session commits if the stash matters), one of:
#   git stash pop                 # restore for next session
#   git stash drop "stash@{0}"    # discard (working tree's newer build supersedes it)
```
- Pop, drop, or leave-parked the stash according to whether the artifact's pre-session state matters. S128 popped (pre-fix snapshot needed for closeout). S129 dropped (post-fix build had since regenerated the same file with newer content; pre-session version was stale and unwanted).
- The targeted form (`stash push <path>`) is critical. A bare `git stash push` would scoop up genuine in-progress source edits if any existed.
- Two stronger temptations to refuse:
  - **Carving an exception into the preamble** ("skip dirty-tree assertion when the only dirty file is `data/build-completeness.json`"). Every exception erodes the guard. The preamble's value comes from being strict; permissiveness defeats it. The right defense is a per-incident decision, not a permanent rule.
  - **Reactive commit of the artifact** to clean the tree. Treats build outputs as decisional content. Pollutes git history with non-decisional noise and creates a precedent that build artifacts get committed whenever a guard trips.
Connects to: "Multi-repo environment requires explicit git-toplevel assertion" pattern above (this is the resolution path when that guard trips on a derived file).

### Pattern: Asymmetric typed-dispatch bug = finishing-step gap (S128 diagnostic, S129 fix, with S31 historical evidence)
First observed: S31 (the original `matchesTimeRange` exhibition-endDate fix) added a typed exhibition branch to 4 of 6 sibling time-window cases (today / this-week / this-weekend / this-month) but missed `tomorrow` and `next-month`. ~98 sessions of silent loss between S31 and S129 (the eventual catch + fix). S128 audit quantified the loss; S129 fix shipped.
Symptom: A function dispatches on event/object type via `if (event.type === 'X' && event.someField) { ... }` inside multiple sibling branches of a `switch` or `case`-chain. Most branches have the dispatch correctly. A subset — usually 1 or 2 — are missing it. The buggy branches silently produce wrong results for the dispatched type, while non-dispatched types continue to work. Tests for the type-of-thing-being-dispatched-on exist for the *correct* branches but were never written for the *missing* branches. Bug is invisible to:
- Unit tests on the buggy type+value combination (none exist for that case)
- Unit tests on non-dispatched types (they're unaffected)
- Schema completeness reporters (the dispatched type still passes its schema rules; only its *visibility* is wrong)
- Smoke tests of the file as a whole (the file is mostly correct)
Cause: Incomplete copy-paste at the time a sibling case was added. The case-author copied the structure of a working sibling but missed the typed-dispatch block. Or: the typed-dispatch was added to most siblings via a deliberate fix pass that missed some. Either way, the failure mode is **finishing-step** — not a knowledge gap, not a wrong mental model, but an incomplete iteration that left siblings out of sync.
Diagnostic signature:
- N siblings have a multi-line typed-dispatch block at the head of each case.
- M < N siblings of the same shape are missing the block.
- The buggy siblings have only the non-dispatched return path; the correct siblings have both the dispatch and the fallthrough.
- Often: the corresponding test fixture *also* exercises N-M siblings but not the M buggy ones. The asymmetry mirrors on both sides — production code and test code drifted in lockstep, both incomplete.
Defense:
- When adding or modifying a `case`/sibling block, before committing run a diff of *all* sibling blocks against each other. If most siblings share a structural element your new/modified one doesn't, ask why.
- When fixing a `case`/sibling block bug, the search isn't "does my fix work?" — it's "does every sibling of the same shape have this fix?" Grep for the dispatch pattern across all sibling branches. If coverage is asymmetric, you have more fixes to land.
- For tests: ensure that every `case`/branch is exercised by at least one regression test against each type the function dispatches on. The S129 test gap was: `getTomorrowEvent()` was referenced ~7 times in `page.test.ts` (so tomorrow-window tests existed), but never against a *running exhibition* (a fixture combining `type === 'exhibition'` with `startDate < tomorrow < endDate`). The test fixture matrix had the same 4-of-6 asymmetry as the production code.
Strong evidence for the pattern: known-issues.md:554–555 documents Session 31 as the original fix for this bug class — applied to today/this-weekend/this-week/this-month, missing tomorrow/next-month. ~98 sessions of latent silent loss in production until S128 caught it. The pattern's defense (audit every sibling, every type combination) would have caught the gap at S31 if it had existed then.
Connects to: `mistakes.md` Session-31-era "Filtering out current exhibitions" entry (which documents the original bug class but not the asymmetric finishing-step nature); S129 fix commit `a009df2bc`.

### Pattern: Diagnostic-first, TDD-second, dist-verify-third (S131→S132, 2026-05-11)

First observed: S131 diagnostic → S132 implementation cycle.
Use when: A defect that touches multiple files/templates/generators (shotgun surgery shape), where the surface area of touch points is non-obvious from any single grep.

Canonical seam — three sequenced phases:
1. **Diagnostic phase (read-only):** Write a spec doc enumerating every emission/touch point. No source edits. Output template: `specs/sNNN-defect-X-emission-sites.md` with a checklist of `file:line` entries + classification (touch / leave-alone / schema-chain / display-only). **Crucially: triangulate by running BOTH source-grep AND dist-grep / sitemap-grep at this stage** — see this file's "Grep-target completeness check for Guard 6" pattern. If source-grep returns N hits but build artifacts include forms not explained by those N, there's a missing generator. Catching it here is cheaper than discovering it mid-implementation.
2. **TDD red phase:** Write failing tests at the OUTPUT layer (`dist/` files, sitemap contents, build artifacts) — NOT only the source layer. Output-layer tests catch generation paths the source-layer diagnostic missed (even after Phase 1's dist-grep, since output-layer tests assert structural properties that grep doesn't).
3. **Implement:** Edit only files identified in (1) plus any new paths surfaced by (2)'s failures.
4. **Dist-verify pre-deploy:** grep `dist/` for the defect's residue. Confirm zero hits BEFORE `netlify deploy --prod`. If the grep counts mismatch the fix's expected delta, the fix is incomplete — re-diagnose, don't patch forward.

Earned from: S132 diagnostic predicted 2 generators for the hub-form collision. TDD red phase failed on `dist/theater.html` → exposed `hub-page.ts:568` as a third generator. Source-only grep would have shipped an incomplete fix that left theater/theatre cannibalization in place. The output-layer test was load-bearing as a *discovery mechanism*, not just a verification checkbox.

Connects to: `mistakes.md` S132 "Multi-generator slug collision missed in source-grep diagnostic" (the failure this pattern defends against); this file's "Targeted stash for build-artifact preamble trips" S128 entry (paired hygiene pattern); this file's "Briefs make falsifiable predictions" S127 entry (broader theme — verify against the canonical source, not the brief's framing).

### Pattern: Output-layer tests as discovery (S132, 2026-05-11)

First observed: S132.
Use when: Writing tests for a defect fix where the same logical defect may have multiple emission paths in the codebase.

Canonical insight: A test asserting a property of the **build output** (e.g. "exactly one of `{a.html, b.html}` exists in `dist/`") will fail in ways source-layer reasoning didn't predict. The failure modes EXPOSE generation paths the diagnostic missed. Treat the TDD red phase as a discovery mechanism, not a checkbox.

Defense — when defining the red-phase test, ask:
- What property should hold of the final build output, regardless of which generator emits it?
- Phrase the assertion to be true iff the defect is fully closed across ALL emission paths (not "the source path I know about").
- Run the test BEFORE implementing the fix. The failure output names the file(s) violating the property — that's the missing-generator signal.

Earned from: S132 `tests/build/canonical-hub-forms.test.ts` failed on the theater/theatre pair mid-implementation, after the source-layer fix for the other 3 pairs was in. The failure named `dist/theater.html`, which was still being regenerated by an undiscovered third generator — exactly the discovery the source-grep diagnostic missed.

Connects to: this file's "Diagnostic-first, TDD-second, dist-verify-third" pattern (the parent cycle this is a step of); `mistakes.md` S132 entries (the failures this pattern defends against).

### Pattern: Grep-target completeness check for Guard 6 (S132, 2026-05-11)

First observed: S132 specialization of existing Guard 6 (shotgun surgery — enumerate every touch point).
Use when: Applying Guard 6 to enumerate every place a pattern is emitted, especially when "emitted" can mean both "in source code" and "in build artifacts."

Canonical seam — triangulate:
- **Source grep**: `grep -rn 'pattern' src/ templates/ config/ --include='*.ts' --include='*.json'`
- **Build-output grep**: `grep -rn 'pattern' dist/ --include='*.html'` + `grep 'pattern' dist/sitemap-*.xml`
- Compare counts. If source-grep returns N hits and dist-grep finds artifacts the N can't explain (different filenames, extra URLs, mismatched slugs), there's a missing generator OR a missing config-driven emission.

Defense — at diagnostic time (Phase 1, before implementation):
- Run BOTH greps. Don't assume source is sufficient.
- If the brief lists grep targets, treat them as a starting set, not a closed enumeration. The brief was written from one mental model of the codebase; the actual generation paths may exceed it.

Earned from: S132's brief specified `grep -rn ... src/ templates/ --include='*.ts'` for defect (C). That returned 2 generators. The third generator (`src/generators/hub-page.ts:568`) ALSO lived under `src/`, so a wider source-grep would have caught it — but the brief's filter-loop-vs-categories-loop framing primed the diagnostic to stop at 2. Output-layer test exposed the gap. Defense: at diagnostic time, also grep `dist/` and `dist/sitemap-*.xml` for the deprecated-form names — if any appear, count vs. source-grep emitters.

Connects to: this file's "Diagnostic-first, TDD-second, dist-verify-third" cycle (where this pattern is the Phase 1 specialization); this file's "Briefs make falsifiable predictions" S127 entry (broader theme that this is a specialization of for grep-target completeness).

### Pattern: Validator-depth calibration against external ground-truth (S132', 2026-05-11)

First observed: S132' validator-depth gap closure.
Use when: Designing or auditing an internal validator that scores the same artifact an external tool also inspects (Google Search Console, Lighthouse, browser dev tools, real crawlers).

Canonical insight: When an internal validator says PASS and an external validator says FAIL on the same artifact, the internal validator is wrong by default. External validators (Google, browsers, real crawlers) see exactly what production ships. Internal validators see what we think production ships. The disagreement is the diagnostic signal — read the validator's **extraction step** before its **assertion step**.

S132' specific instance: `src/validators/schema-completeness.ts:86` used `htmlContent.match(/<script…>/)` — JavaScript regex without the `g` flag returns the first match only. Every event page got scored as 100/100 because the validator extracted only the first JSON-LD block. If a second Event JSON-LD block had ever been emitted (broken or otherwise), the validator would not have seen it. Google's crawler would. The same shape existed at line 362 (`validateVenueSchema`). The fix: enumerate all blocks via the existing module-private `extractAllJsonLd` helper (already used by `validateHubSchema` for the same reason), then locate the block of the asserted `@type` family and validate it.

Defense — when writing a validator:
- Enumerate all matching elements; don't single-match. If the surface can emit more than one, the validator must inspect more than one.
- For JSON-LD, microdata, meta tags, link tags, og:* tags: each can legitimately appear multiple times per page. Validators that single-match are blind to dual emission.
- When the validator narrows to a specific `@type` family, identify members and reject "no member found among N blocks" with an error distinct from "no blocks at all" — the failure mode is different and operators need to tell them apart.

Defense — periodic external calibration:
- Once a sprint (or before any release that ships structured-data changes), pick one URL from production and run it through Google's Rich Results Test (or Lighthouse, or browser dev tools). Cross-reference against the internal validator's score for the same URL.
- If they disagree, the internal validator is the suspect first, the production output the suspect second. Read the validator's extraction step first.

Earned from: S132' diagnostic surfaced that the brief's "every event page emits two Event JSON-LD blocks, one broken" premise was not reproducible in current dist (0 / 5762 pages had ≥2 blocks). But the validator-depth gap that would have masked such an emission **if it ever occurred** was real and shippable as institutional infrastructure. The fix landed with 3 in-validator unit tests + 2 output-layer regression guards in `tests/build/`, all green against current dist; the guards protect a property that holds today and must keep holding.

Connects to: this file's "Diagnostic-first, TDD-second, dist-verify-third" cycle (the validator-depth fix is the institutional sibling of dist-verify); `mistakes.md` S132' entry on Dev-Planner pre-flight protocol (the brief-authoring failure this validator fix incidentally surfaces); the parallel `extractAllJsonLd` (line 257) which existed before S132' and proved the multi-block pattern was already in-house — just not applied where it was needed.

### Pattern: Predicate divergence between independent gates over the same conceptual set (S133, 2026-05-11)

First observed: S133 Item 2 investigation, generalized from the visibility-filter / lifecycle-classifier pairing.
Use when: A conceptual set ("visible events", "publishable users", "shippable orders") is gated by more than one predicate, each maintained in a different file. The set is defined by the intersection of all gates, but each gate evolves under its own pressures.

Canonical insight: When two predicates over the same conceptual set live in different files (different generators, different validators, different SQL queries), they will drift. Drift becomes visible when one predicate says SHOW and another says HIDE for the same row — but it's often invisible until someone runs a query that crosses the boundary.

In S133, three different "is this event visible?" predicates coexist:
- The brief author's **interactive SQL** for diagnostics: `WHERE (type != 'exhibition' OR end_date IS NULL OR end_date >= date('now')) AND (type = 'exhibition' OR start_date >= date('now'))`
- The production **upcomingEvents filter** in `src/generate-site.ts:174-186`: falls back to `startDate >= today` when `event.endDate` is falsy
- The production **classifyEventLifecycle** in `src/utils/event-lifecycle.ts:50`: same fallback shape (Tier 1 compliant)

The interactive SQL diverged from production by treating `end_date IS NULL` as "always visible." The production predicates agreed with each other but not with the SQL. The brief's "noindex on visible events" diagnostic was actually a divergence between the *measurement* (the brief's SQL) and the *production behavior* (the code's predicates) — not between two production behaviors.

The pattern generalizes beyond visibility:
- Validators vs build code (does the validator check the same thing the build emits?)
- Filters vs sorters (does the listing sort match the filter's notion of "current"?)
- Sitemap vs RSS vs hub-listing (do all three surfaces agree on "publishable"?)
- DB constraint vs application validation (does the DB allow what the app rejects, or vice versa?)

Defense — at diagnostic time:
- When investigating a discrepancy ("X says visible, Y says hidden"), list ALL predicates over the same conceptual set, not just the two named. There may be a third or fourth.
- Treat hand-written diagnostic SQL as a suspect, not an authority. The production predicate is the truth; SQL approximations are convenience.
- For exhibitions specifically (Tier 1): `COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) < date('now')` — and JS code paths must match: `(isExhibition && event.endDate) ? event.endDate : event.startDate`. Empty string ≠ NULL at the SQL layer but truthy-checks treat them the same; this asymmetry is itself a drift surface.

Defense — at design time:
- When a conceptual set has more than one gate, extract the predicate into a shared module (function or view). The two production predicates in S133 could share a single helper `isCurrentlyVisible(event): boolean`. The shared helper makes drift impossible by construction.
- If extraction isn't done, add a property-based test that exercises EVERY predicate pair over a shared dataset and asserts they agree on the same row classifications. The test fails when drift opens, not when someone notices.

Earned from: S133 spent significant verification time tracing what turned out to be a measurement-vs-reality mismatch. The production code was self-consistent; the brief's SQL was the outlier. The cost: most of one maintenance slot. The fix: never coded — the divergence was external to production. The defense (extract a shared helper) would have prevented even the *possibility* of this kind of drift between the two production predicates.

Connects to: `mistakes.md` S133 "Brief inflation" (the planner-side failure mode that surfaced this); `decisions.md` Tier 1 rule (`.claude/CLAUDE.md` exhibition end_date convention); `specs/s133-noindex-visibility-divergence.md` for the worked example.

### Pattern: Irreversibility ≠ safety in default-flip decisions for destructive ops (S133, 2026-05-11)

First observed: S133 Item 5 orphan-sweep default decision.
Use when: Evaluating whether a destructive default (delete, overwrite, force-publish) should be flipped from opt-in to default-on, or vice versa.

Canonical insight: "Safer" is symmetric framing — every default has a "safer" reading from one direction and a "less safe" reading from the other. The actual axis is asymmetric: **recoverability on false positive**.

- A destructive op that's opt-in: false positive cost = nothing happens (you have to opt in to trigger), correct activation cost = manual `rm` (cheap, recoverable from git/backup).
- A destructive op that's default-on: false positive cost = silent deletion of a file that should have been kept, no signal until someone notices it's missing. Correct activation cost = the op happens automatically.

The right question isn't "which is safer?" — both are "safer" against different failure modes. The right question is: "if this is wrong, how do we find out, and how much work is the recovery?"

For the orphan-sweep specifically (`src/generators/orphan-sweep.ts`):
- `SWEEP_ORPHANS=1` default would silently delete files in `dist/` that aren't generated by the current build.
- False-positive failure mode: a hand-edited file (GSC verification token, `_redirects`, `.og-cache.json`) gets deleted without warning. Detection: only when GSC verification fails on next check, or when Netlify routing breaks. Recovery: locate the original, re-add it, push redeploy.
- Opt-in failure mode: stale files accumulate. Detection: any time someone notices. Recovery: manual `rm`, or one-time `SWEEP_ORPHANS=1` run.
- The recovery cost asymmetry is the deciding factor — accumulation is observable and reversible; silent deletion is neither.

The pattern generalizes:
- Force-push defaults
- Cache-invalidation defaults
- Auto-merge defaults
- Schema-migration "drop column" defaults
- Cleanup-on-build defaults (the orphan-sweep family)

Defense — when proposing a default flip on a destructive op:
- Don't ask "which is safer?" Ask "if this default is wrong, what's the detection latency, and what's the recovery work?"
- Compare the two failure-mode recovery profiles. Symmetric "safety" framings smuggle in a preference that should be made explicit.
- Apply the "register the un-swept surface" pattern from S133: when the destructive op has a known-good carve-out (legitimate non-build artifacts in `dist/`), explicit allowlist beats implicit trust. Allowlist entries should carry provenance + removal trigger so they don't accumulate into bit rot.

Defense — when proposing reactivation triggers:
- Don't say "later" or "when we're ready." Specify the conditions whose joint truth means activation: (a) allowlist stable for N days, (b) upstream dependency migrated, (c) related workstreams shipped. The trigger should be checkable without re-debating the original decision.

Earned from: S133 Item 5's brief presented A/B/C options framed as "simplest / preserves incrementals / defer." The user's reframe surfaced that "preserves incrementals" was symmetric framing for "less likely to silently delete." The actual decision: keep opt-in, register the carve-out explicitly, set a three-condition reactivation trigger. Connects to S122 / S125 / S127's "assumption-from-snapshot" theme — defaults are assumptions made permanent; their costs are paid by future operations.

Connects to: `decisions.md` S133 "Orphan-sweep `SWEEP_ORPHANS` remains opt-in" (the worked instance); `src/generators/orphan-sweep.ts:42-83` (`KNOWN_NON_BUILD_ARTIFACTS` allowlist); S132 "manual cleanup precedent" (institutional behavior this pattern is now formalizing).

### Pattern: Maintenance batches reframe ~30–40% of items under verification — budget for it (S133, 2026-05-11)

First observed: S133 (3 of 5 items reframed under verification: Items 2, 3, 5).
Use when: Planning multi-item maintenance batches where each item came from a different observation source (GSC report, CI signal, user-reported bug, audit finding).

Canonical insight: Maintenance items aggregate observations from multiple snapshots in time. Each observation was true when made; some are no longer true. Verification will find this. Budget for reframing as a session feature, not a session bug.

Empirical rate (one data point, but consistent with prior briefs):
- S132 brief: 1 of 3 defects reframed under verification (defect-D was correctly diagnosed; defects-A and -C had partial verification but the fix scopes survived).
- S132' brief: 1 of 1 reframed (dual-emission premise didn't reproduce; the validator-depth fix that came out of the investigation was the actual ship-worthy work).
- S133 brief: 3 of 5 reframed (Items 2/3/5 working as designed; Items 1 and 4 had real work).

Aggregate: roughly a third to a half of maintenance items reframe. The cost of verification is the cost of catching this — and it's lower than the cost of executing against a misframed premise.

Defense — at planning time:
- Don't tighten time estimates to compensate for past overruns. The overrun came from reframing, not from execution. Reframing is the *correct* response when reality has moved; cutting verification budget defeats the protocol.
- Add an explicit "verification phase" to maintenance plans, sized at ~20% of total session budget. The verification phase outputs may be (a) "premise holds, proceed" or (b) "premise refuted, reframe." The plan should be ready for both.
- Frame the session deliverable as "items closed OR items reframed with specs." A reframed item is a closed maintenance item — just with the close being "no fix needed; here's why" instead of "fix landed."

Defense — at session-log time:
- Record both kinds of closure with equal status. "Reframed" should not look like "failed." Reframings prevent waste; they're observably valuable.
- Track the reframing rate over time. If it drops, briefs are getting more reliable; if it climbs, the planner-side pre-flight protocol needs strengthening.

Earned from: S133 maintenance batch was framed as ~50 minutes on 5 bounded items. Landed at ~75 minutes on 5 items, 3 of which reframed (Items 2/3/5 all "working as designed"). The reframing time was not waste — it produced 3 specs that prevent future sessions from re-running the same investigations. Without reframing, the session would have applied "fixes" to non-bugs.

Connects to: `mistakes.md` S133 "Brief inflation" (the upstream failure mode this pattern is the institutional acceptance of); `mistakes.md` S132' (the planner-side pre-flight protocol that, when paid, drives the reframing rate down).

### Pattern: Cross-project authored content + empirical drift (S134, 2026-05-12)

First observed: S134 Step 6 footnote pattern for the Strategist's "~84 events" figure (actual was 38 upcoming + 4,335 past-active noindex'd).
Use when: A specialist project (GEO Strategist, Editorial Director, Design Navigator) authors decision text the implementing project (Dev Planner) is committing to disk, and verification at implementation time finds the authored figures or facts have drifted from current reality.

Canonical insight: When a specialist project authors decision text that cites specific figures, and the implementing session finds the figures have drifted, the resolution is: **(a)** preserve the authored text unedited, **(b)** add a Dev-Planner-authored footnote with the empirical baseline, **(c)** verify the decision's reasoning is figure-illustrative not figure-decisional before proceeding without round-trip.

The footnote pattern preserves authorship boundaries while keeping the decision-log empirically honest. Edits to specialist-authored text — even small ones, even annotated ones — corrode the cross-project trust model. The future reader who sees a Strategist-authored block can trust it represents Strategist's analysis as Strategist made it; a Dev Planner-authored footnote alongside the block adds empirical context without obscuring whose reasoning is whose.

Three-location pattern (S134 reference instance):
1. **Step 0 spec file** (`specs/<session>-step-0-verifications.md`) — actual numbers as empirical baseline. Where executing-session finds drift.
2. **The decision-log entry itself** — Dev-Planner-authored footnote AFTER Strategist's `**Status:** Decided` line. NOT an edit; a separately attributed block. Preserves authorship.
3. **Build-time telemetry** (`logs/<metric>-latest.json` or equivalent) — schema persists the live count. The implicit reconciliation between authored figure and production count lives in the data itself; no additional note needed.

When to round-trip instead of footnote:
- Figure is decisional, not illustrative — the reasoning would change if the corrected number were used.
- Order-of-magnitude divergence with downstream implications (e.g., ~84 vs ~9,427 would warrant round-trip; ~84 vs ~38 with same OOM stays footnote).
- Specialist explicitly asked for confirmation, not just blessing.

Edits to specialist-authored text — even small ones, even annotated ones — corrode the cross-project trust model. Only round-trip the specialist if the figure is decisional.

Applies forward to: GEO Strategist, Editorial Director, Design Navigator, Growth, Enrichment — any project authoring decisions that the Dev Planner project implements.

Earned from: S134 Strategist authored "~84 with-ticket events lose Offer presence." S134 Step 0e verification found live count is 38 upcoming + 4,335 past-active (noindex'd, out of citation surface). Order of magnitude matches; reasoning rests on five non-figure anchors. Footnote pattern applied at three locations; Strategist text preserved verbatim everywhere.

Connects to: `mistakes.md` S134 "Planner-side spec hallucination" (cross-project memory drift); `.claude/notes/decisions.md` 2026-05-11 Unclassifiable-Merchant entry (the reference instance); `specs/s134-step-0-verifications.md` (the empirical baseline file); `docs/current-infrastructure-v2.md` (the parallel application to the Deferred Register entry).

### Pattern: Spec-phrase ambiguity around structural Schema.org decisions (S134, 2026-05-12)

First observed: S134 Step 0a — Dev Planner memory's "inline Organization seller emission" phrasing was misread of the locked spec's "seller Organization materialized inline" (which intended `@graph`-sibling with `@id` reference).
Use when: Writing or reading spec prose around structural choices in nested data (JSON-LD construction, microdata composition, GraphQL type unions, protobuf field placement).

Canonical insight: When a spec's prose uses a structurally-loaded word ("inline," "nested," "embedded," "reference," "containing") to mean one specific construction, future readers will misread it as the other plausible construction roughly half the time. The misread rate doesn't decay with familiarity; it can lock in across multiple readers if the partial reading is propagated forward (memory hallucination, second-hand brief authoring).

Mitigation: spec phrasing should name the construction concretely, not figuratively.

Example trap: 2026-04-28 Offers Implementation Spec phrase *"seller Organization materialized inline"* was intended as *"as a sibling `@graph` entry, referenced from `seller` via `@id`"* — and was misread by Dev Planner memory as *"as a literal nested Organization object inside `seller`."* The latter violates the locked `seller.@id` reference requirement. Same English, two opposite constructions.

When you catch a spec-phrase trap, fix it at the source AND log the trap here so the next misread costs minutes (re-read against this catalog), not a session (full Step-0-reframing cycle).

Defense — when authoring specs:
- Don't use "inline" if you mean "by-reference." Don't use "nested" if you mean "sibling-with-reference."
- Pair structural words with example code blocks the first time they appear; readers map the prose to the code, not to their priors.
- If a word's natural reading could go either way, write both readings and pick one explicitly: *"Materialized inline (literal nested object) — NOT as `@graph` reference"* or *"Materialized as `@graph` sibling referenced from this field — NOT as literal nested object."*

Defense — when reading specs:
- When a spec says "inline" or "nested" or "reference," ask "which construction concretely?" before forming a memory of the choice.
- If memory tells you the answer without verification, treat that memory as a suspect. Grep the spec for an example code block; let the code disambiguate the prose.

Earned from: S134 prep cycle had two parallel spec hallucinations across two projects (Dev Planner cited inline-not-@id; Strategist confirmed b-is-locked without checking acknowledged-interim). Both rooted in the same spec's ambiguous "inline" phrasing. Single phrase, two-project failure mode.

Connects to: `mistakes.md` S134 "Planner-side spec hallucination" (the worked instance); the Pattern below (Sprint-boundary acknowledged interims) which addresses the time-axis dimension that compounds this pattern.

### Pattern: Sprint-boundary acknowledged interims aren't drift (S134, 2026-05-12)

First observed: S134 — Sprint 1 closure authorized shape (a) inline seller emission as deliberate interim; subsequent briefs read spec language as production state, missing the closure's authorization of the interim.
Use when: Reasoning about whether production "matches" or "diverges from" a locked spec, especially across sprint boundaries.

Canonical insight: When a sprint closes with a deliberate sequencing decision that leaves spec and production temporarily out of alignment (validator rules at WARN instead of FAIL, partial implementations of a locked spec, deferred shape migrations), **the closure decision authorizing the interim is the canonical state — not the spec.** The spec describes the target; the closure describes what was deliberately shipped. Both are canonical; they describe different time points.

Before claiming "production must conform to spec," search the closure decisions of the relevant sprints for any authorized divergence. Spec citations are valid; spec-as-production-state assertions are not, especially across sprint boundaries.

Defense — when writing briefs:
- When citing a locked spec as authority for what production should be, also cite: (a) which sprint closed the implementation, (b) whether the closure authorized any interim divergence, (c) where the closure decision lives.
- "Locked spec says X" → valid claim about the target.
- "Production must be X because locked spec says X" → invalid claim without closure-state verification.

Defense — when implementing briefs:
- Before applying a "production must conform" amendment, search the relevant sprint's closure for authorized interims that would make the brief's premise wrong.
- Treat memory of "the spec says X" as suspect; treat memory of "the sprint closed with X authorized" as equally suspect. Verify both.

Earned from: S134 Step 0a found production at shape (a) inline; brief framed (a) as "STOP and ping Strategist" assuming spec (b) was canonical state. Sprint 1 closure (2026-04-30, commits 749de0fd5 et al.) had authorized (a) as interim; the migration to (b) was deferred to Sprint 3 by deliberate sequencing decision. Both planner memory and Strategist memory had flattened the time axis. Resolution: S134 stays in shape (a) per Sprint 1 closure; (a)→(b) migration consolidated into Sprint 3 envelope work.

Applies forward to all cross-project briefs that cite locked specs as if they describe shipping state. Memory and brief-writing should both flag this distinction explicitly.

Connects to: `mistakes.md` S134 "Planner-side spec hallucination" (the worked instance); the Pattern above (Spec-phrase ambiguity) which addresses the textual dimension that compounds this pattern; `decisions.md` 2026-05-11 entry's "Connects to" list of related Sprint decisions.

### Telemetry counter increment semantics (S134 follow-up)

When prescribing a counter or metric in a session plan, name the
increment trigger explicitly: "once per event," "once per emission
site," "once per build," or similar. S134's plan described the
offer-omission counter as "keyed by source domain" without specifying
when it increments. The plan reader (and the planner authoring it)
assumed once-per-event. The implementation correctly increments once
per emission site — each of the 3 emission sites (event-page JSON-LD,
hub JSON-LD, hub microdata) records its omission decision independently,
which is the structurally correct choice (each site can omit
independently, so each site is its own measurement surface). The plan's
"~4,373 expected" projection was therefore wrong by a 3× multiplier
plus the hub-emission fan-out; production baseline is 11,522 across
5 sources. Telemetry shape was correct; planner expectation was
incomplete. Mitigation: increment semantics are a required field in
any plan that prescribes a counter.

### Verify-the-premise protocol — two-shape split (S135)

The "repro-grep the defect premise" protocol (banked S132') and the "repro-grep the proposed fix surface" extension (banked S135) cover two adjacent failure modes that have distinct triggers, distinct mitigations, and distinct evidence shapes. Treating them as one pattern produces wider checks than needed in some cases and narrower checks than needed in others. Split into two named patterns:

**Pattern A: Wrong-edit-surface verification.**
- *Trigger:* Plan names a specific file, function, table, or config key as the edit target.
- *Failure mode:* The named target exists, but the data/code being modified actually lives elsewhere. Plan looks coherent; execution would touch the wrong place.
- *Mitigation:* `grep` for the actual data or code location before locking the edit target. Confirm the named target is in the read-write path for the property being changed.
- *Evidence shape:* Static — a grep against `src/`, `scripts/`, and `config/` will reveal whether the named target is in scope.
- *Cost:* 30 seconds.
- *Instances:* S71, S82, S95, S100b, S101a, S132', S135 geo-coverage path. Seven instances pre-S135.

**Pattern B: Stale-premise verification.**
- *Trigger:* Plan describes a current bug, missing behavior, or absent capability — "X doesn't emit Y," "Z is silent," "W needs to be added."
- *Failure mode:* The described state was true at premise-capture time but no longer holds. A successor session shipped the fix silently. Plan asks the executor to build a thing that already exists.
- *Mitigation:* Run the suspected-broken function, or observe the suspected-absent behavior, before prescribing the fix. Execution probe, not grep — the bug may be in the runtime path, not the source.
- *Evidence shape:* Dynamic — requires invoking the code path and observing actual output, not just reading source.
- *Cost:* 30–60 seconds (one build run, one query, one curl).
- *Instances:* S135 hard-stop summary path. First named instance; previously bundled under Pattern A.

**When both apply.** A brief that names a specific edit target *and* describes a current bug needs both checks. Pattern A first (cheaper, static), then Pattern B (more expensive, dynamic). If Pattern A's grep reveals the named target doesn't exist or isn't in the read-write path, Pattern B becomes moot — the premise is misframed, not stale.

**Recurrence count.** Pre-S135, the combined pattern fired 7 times (all Pattern A shape). S135 added one Pattern A instance and one Pattern B instance, bringing the verify-the-premise series to 9 total. Pattern B is the rarer shape; Pattern A is the dominant recurrence and is the one driving the workflow-side mitigation in the Dev Planner pre-brief checklist.

**2026-05-14 update:** Recurrence ledger holds at 9 across the 2026-05-13/14 cycle (mini-session bundle + Session B). Pre-flight discipline and execution-time invariant checks (Q5 mechanism) caught all candidate recurrences before they shipped. Multiple opportunities to tick the counter (parallel-session HEAD drift on `02dcc7c71` pre-flight; yellow budget +36 finding; Probe B schema adaptation; Step 4a Path B option choice) all surfaced through structured guards rather than silently propagating. Mitigation working.

### Type-union reconciliation across CLAUDE.md, code comments, and TypeScript declarations (S136)

When a constitutional rule lives in three places (rule doc, code comment, type system), drift between them is inevitable unless one is canonical. The S136 'tba' resolution found CLAUDE.md saying 2-value (`'open' | 'with-ticket'`), `src/db/database.ts:56` comment saying 4-value (`'open' | 'with-ticket' | 'tba' | 'donation'`), `src/db/schema.sql:29` saying pre-rename 3-value (`free|paid|donation`), and `src/types.ts:97` saying current 3-value (`'open' | 'with-ticket' | 'donation'`). Four sites, four different unions.

Mitigation: promote *code* as the source of truth; CLAUDE.md mirrors. New rules should be expressed as TypeScript literal unions *before* being added to CLAUDE.md, and the canonical type declaration should carry JSDoc pointing back at the Tier 1 rule. When reconciling drift, update CLAUDE.md and comments to match the canonical type, not the other way around.

### Data migration inside a transaction with explicit source list (S136)

When backfilling a column across many rows, wrap in `BEGIN TRANSACTION` / `COMMIT` so the migration is revertable as a unit. Never use a blanket `WHERE column = legacy_value`; enumerate sources/keys explicitly so unclassified writers can't be silently swept in. S136's 'tba' resolution would have miscoerced `more.com` and `halfnote` rows (not covered in the diagnostic's source breakdown) into 'with-ticket' without verification if a blanket WHERE had been used — those sources turned out to be safe to migrate, but the verification work that confirmed safety only happened because the explicit-source-list rule forced it.

Always back up the DB file before the transaction in case rollback isn't enough (e.g., if `COMMIT` runs before `remaining_rows = 0` is checked). Backup path: `data/events.db.pre-<migration-tag>-YYYYMMDD-HHMMSS.bak`.

### Domain-concept liveness check during type reconciliation (S136)

A type value's liveness is determined by union: `(data rows) ∨ (code references) ∨ (i18n strings) ∨ (branch logic)`. Zero on any single dimension is not sufficient for deletion.

S136 case study: the diagnostic found 0 DB rows with `price_type='donation'` and recommended deferring/removing the value. Pre-execution exploration revealed 23 code references, including 8 active branches (`if (price.type === 'open' || price.type === 'donation')`), 2 user-facing i18n labels (Greek + English), and a dedicated test asserting donation behavior. Count-based reasoning ("0 rows → deletable") would have removed ~25 lines of working code modeling a real Athens cultural pattern (donation-welcome cultural events) that just hadn't been wired to a scraper yet. The correct framing was "dormant-but-wired" — feature awaiting a writer, not orphaned code.

Before treating a type value as deletable, sweep all four dimensions. If any is nonzero, the value is live; deletion requires removing that surface area first.

### Subtype narrowing at stage boundaries is not drift (S136)

Pipeline stages legitimately operate on narrower subtypes of the canonical model. S136's enrichment and ingest stages declared `'open' | 'with-ticket'` (2-value) against a canonical `'open' | 'with-ticket' | 'donation'` (3-value). A naive reconciliation would have expanded the narrows to match the canonical "for consistency." That would have been wrong: enrichment never sees `'donation'` events (donations don't get enriched in the current pipeline design); ingest never sees post-normalization values (it operates on raw scraper rows before `normalizePriceType()`).

When reconciling type-union drift, distinguish (a) intentional stage-local narrows from (b) accidental declarations that fell out of sync. Test: does the narrow site have a meaningful invariant that holds at that boundary? Yes → intentional, leave alone. No → drift, align to canonical. The test forces explicit reasoning about why a narrow exists, which preserves the architectural distinction rather than steamrolling it.

---
## Pattern A — Assembly-time content access
**Banked:** 2026-05-12 (action-layer audit loop)
**Sibling of:** fix-rot guard
**Recurrence:** 3 instances in single audit loop (2026-05-12)

Briefs requiring content from disk, external systems, or unrecoverable prior
context must be assembled with content in-hand, or sent with explicit fetch
path. Never send `[paste here]` placeholders for content the planner doesn't
have. If content is unrecoverable, send skeletal — name the slot, don't fabricate
the slot's contents.

**Instances:**
1. Design Navigator brief — five code-span placeholders (`[paste X here]`)
   when source files were on disk, accessible via fetch path
2. Design Navigator close — `getComputedStyle` block placeholder when output
   was in prior chat, unrecoverable from current context
3. Design Navigator close (gate fabrication) — sub-case: planner had PASS
   verdicts + polish-flag names from end-of-session brief but not gate
   *definitions*. Filled in plausible dev-side framings (scope/contract/
   tests/a11y) instead of asking or sending skeletal. Wrong domain entirely
   — DN ran design-side (token/ceiling/receding/share). Gate definitions
   were content; plausibility is not sourcing.

**Mitigation:**
- If content exists on disk → fetch path in brief
- If content exists in current context → quote directly (see Pattern B)
- If content is unrecoverable → skeletal brief, name the missing slot
- Never: invent the slot's contents from plausible inference

**Detection:** Any `[paste X here]` token in a drafted brief, OR any sentence
in a close-message that describes specifics the planner cannot point to a source for.

---
## Pattern B — Relay-vs-self-quote
**Banked:** 2026-05-12 (action-layer audit loop)
**Sibling of:** Pattern A, fix-rot guard

If content is in the planner's own context window, quote directly. Don't ask
the relay (Christos) to copy from earlier in the thread. Relay is for content
outside context, not for content inside.

**Instance:** `getComputedStyle` block — placeholder asked Christos to paste
content that, if present anywhere, was in the prior chat (i.e., not in
planner's current context). Correct routing: either quote from current
context, or treat as Pattern A (unrecoverable → skeletal).

**Mitigation:**
- Content in current context → quote inline, no relay step
- Content in prior chat / outside context → Pattern A applies (fetch path
  or skeletal)
- Relay's job is human-side artifact retrieval, not in-thread copy-paste

---
## Routing-gap retrospective — action-layer audit (dev-side filing)
**Date:** 2026-05-12
**Counterpart entry:** Design Navigator's `design-decisions.md` (design-side)

**Routing gap:** Christos confirmed "action layer is MVP scope" to Dev Planner.
Confirmation didn't reach Design Navigator. Result: parallel audits, no shared
gate framework, near-miss on merged-ledger contamination (Option B in DN
close exchange).

**Resolution:** Option A — two-side framing. Each ledger captures its own
audit. No merge.

**Pattern surfaced:** When a scope claim crosses project territory, route
before sequencing. The cross-project deliverable claim is its own routing
event, distinct from the work it enables.

**Mitigation candidate (not yet a pattern):** Scope confirmations that name
a deliverable owned by multiple projects should trigger a routing check
before downstream work begins. One instance is not a pattern; flag on second
occurrence.

---
## Pattern C — Verify-the-premise of deferral decisions
**Banked:** 2026-05-12
**Sibling of:** Pattern A (assembly-time content access), Pattern B 
(relay-vs-self-quote), pre-brief checklist (brief-assembly verification)

Deferral decisions assume a current state. The assumed state must be 
probed against the deployed artifact, not inferred from prior 
decisions-log entries. Status fields in decisions-log drift from 
reality — entries marked "Status: Pending" may correspond to work 
that shipped and was never re-logged. Reading log-status as a 
state proxy is the failure mode.

The fix isn't "think harder about current state." It's "probe the 
deployed artifact, don't infer from log entries." That distinction 
is load-bearing; generic verify-the-premise advice collapses into 
Pattern A/B coverage.

**Applies whenever:** a decision is being formed against an assumed 
state, by anyone, in any artifact — decisions-log entries, briefs, 
session plans, cross-project routing.

**Instance:** May 8 bilingual-subset decision (decisions-log entry). 
Deferred 4 work items — hreflang tags, /en/ URL prefix scheme, 
sitemap per-locale split, canonical-link template restructure — 
based on assumed-absent bilingual state. Assumption was inferred 
from Feb 19 (hreflang Pending), Feb 20 (x-default reversal Pending), 
Feb 24 (inLanguage Pending) log entries. CC probe 2026-05-12 
confirmed: all four shipped, status fields never updated. The 
inference was wrong because the proxy was stale.

**Detection signal:** any decision sentence of the form "defer X 
because Y is absent/partial," where Y's state is sourced from 
"log entry says Y is pending" rather than "I just probed Y and 
observed its current state."

**Mitigation:**
- Before logging a deferral, probe the deployed artifact directly 
  (curl, grep dist/, sqlite query, GSC reading — whatever surface 
  the deferral concerns)
- Inline the probe result in the decision: "Deferred X. Probed 
  state 2026-MM-DD: [verbatim probe output]. Defer because [reason 
  grounded in probed state, not log inference]."
- If the deferral is being formed without access to probe the 
  artifact, the deferral is not ready to log. Either acquire probe 
  access or hand off to whoever has it.
- Status fields in prior log entries are not state evidence. They 
  are decision-time snapshots that may or may not match reality at 
  decision-N+K read time.

**Why not Pattern A/B coverage:** A and B are content-sourcing 
patterns (what's in the brief; what's quoted vs relayed). C is a 
decision-formation pattern (what state grounds the decision). 
Different abstraction layer.

**Why not pre-brief checklist:** the pre-brief checklist's six items 
are brief-assembly hygiene — what the brief tells the executor to 
do. Pattern C applies to decision formation at decisions-log entry 
time, often outside any brief. Checklist scope is too narrow.

**S137 instance (2026-05-13) — commit-message-as-state-proxy.** S136's
commit message asserted "DB: 0 remaining 'tba' rows post-migration."
That sentence was true at commit time and false 24 hours later. The
2026-05-13 audit's Step 1 took the commit message as a state claim
("S136 closed the regression") rather than probing the deployed
artifact. CC probe found 42 new tba rows from the next daily-pipeline
tick. Same failure mode as the May 8 bilingual instance, different
proxy: commit messages drift from production state on any schedule
where post-commit pipelines write to the same surface. The mitigation
extends cleanly: "Status fields in prior log entries are not state
evidence" → "Commit-message claims about deployed state are not
state evidence." Probe the artifact in both cases.

## Pattern D — Single-call-site normalizer fragility (export + detective control as a pair)
**Banked:** 2026-05-13
**Sibling of:** Guard 6 (shotgun-surgery), Pattern C (verify deployed artifact)

When introducing a normalizer at one write site, ship its detective
control in the same commit. A single un-exported normalizer with one
call site is a single-belt design despite the "belt-and-suspenders"
mental model — the metaphor obscures the topology because parallel
writers can't call what isn't exported, and silent bypass leaves no
test or build signal when both behaviors emit shape-valid output.

**Failure shape:** S136 added `normalizePriceType()` at
`src/db/database.ts:92` and migrated 1,155 'tba' rows in one
transaction. Function was un-exported; only the canonical
`upsertEvent` invoked it. `scripts/scrape-all.ts` is a parallel
writer that binds `$price_type: e.price_type` raw at line 1407
and never adopted the normalizer. Within 24 hours the next daily
pipeline regenerated 42 'tba' rows. The validator inspects only
emitted JSON-LD, where `'tba'` and `'with-ticket'-without-price`
produce identical output — no test failed, no build error fired.

**Why not just export and grep:** export alone fixes the symptom
but leaves the detective gap. Without a vocabulary check in the
build, the next un-routed writer (added by anyone, including future
sessions) reproduces the same regression silently. The pair is
load-bearing — neither half is sufficient.

**Mitigation (S137 implementation pattern):**
1. **Export** the normalizer so parallel writers CAN call it.
2. **Grep every writer** for the column (not the table): for
   price_type that's `grep -rn "price_type\s*[=:]" src/ scripts/`.
   Route each match through the normalizer.
3. **Detective control in build:** add a validator that fails on
   out-of-vocabulary data BEFORE emission. For S137 this was
   `validatePriceTypeVocabulary()` invoked over `locationFiltered`
   in `src/generate-site.ts` immediately after the publishable-set
   filter. Any future bypass aborts the build with a clear message
   naming the bypassed event ids.
4. **Test the normalizer's contract directly** (not just integration).
   `src/db/__tests__/normalize-price-type.test.ts` pins all 5 input
   shapes (canonical pass-through ×3, legacy mapping ×2). Any change
   to the contract requires updating these tests.

**Detection signal:** a normalizer with exactly one call site is the
red flag. `grep -rn "function normalizePriceType\|normalizePriceType("`
returning 2 lines (definition + 1 call) means parallel writers exist
or will exist; both must be addressed in the same commit.

**Why not pre-brief checklist:** pre-brief checklist is brief
hygiene; this is a design-pattern decision at fix time. The trigger
is "I am about to add a normalizer," not "I am about to write a
brief." Different surface.

---

## Audit Methodology

### Deferred-Gate Provisionality (DGP) (2026-05-13, S138)

When an audit gate explicitly defers enforcement to a different
layer (e.g. "style-agnostic at template; enforced centrally in
CSS"), the verdict is **provisional** until the deferred surface
is evaluated against the same constraint.

**Today's instance:** Gate 1's yellow accent budget PASS on
`src/templates/action-bar.ts` (template layer) was correct as
scoped — the template emits no color tokens, only structural
markup. But that PASS didn't lock the verdict for the action
layer overall. The deferred surface was the central CSS at
`src/styles/design-system.css:1242–1247`, where
`.card-save-btn.is-saved { color: var(--accent-primary); }` plus
`.card-save-btn.is-saved svg { fill: var(--accent-primary); }`
pushed the yellow budget from 5 contexts to 6 — a violation
invisible to the template-layer check.

The gate only closed cleanly once the deferred surface was read
and the two `--accent-primary` references were either removed or
substituted (Option 2: shape-based saved-state, see
`decisions.md` 2026-05-13).

**Closure rule:** re-check the gate against the deferred surface
before audit-loop closeout. A provisional PASS with deferred
enforcement is a deferred closure, not a closure.

**Detection signal:** if the audit verdict on layer A reads
"X is enforced at layer B" or "style-agnostic at A; centrally
at B," do not close the audit loop until layer B has been
independently verified against the same constraint X. The
deferral is meta-evidence that the gate spans both layers.

**Cross-references:** Pattern owned by Design Navigator (audit
methodology surface). Dev Planner patterns A and B (planner-side,
relay-layer) are downstream consumers — both rely on this closure
rule to avoid relaying provisional PASS verdicts as final.

---

### Sibling-Field Drift Detection (2026-05-14, S139)

When one metadata field in an Open Graph / Schema.org / `<head>` block
is locale-aware or state-aware, **every sibling field in the same
block must be asserted in the parity verifier**. Sibling absence from
the verifier = drift surface.

**Today's mechanism (concrete):** `src/templates/page.ts` lines
109–113 emit five OG fields back-to-back: `og:description`, `og:url`,
`og:type`, `og:locale`, `og:locale:alternate`. S138's parity verifier
asserted on `og:url` + canonical + JSON-LD url (caught D11's drift on
those). It did NOT assert on `og:locale` or `og:locale:alternate`.
Result: `og:locale` could be post-patched in hub-page.ts (silent
correction) and `og:locale:alternate` could be hardcoded `en_US`
on /en/ pages (silent wrong) — neither failing any test. The 2026-
05-13 audit close-out found both via SSR grep, not via test failure.

Additional confirmed sibling-drift instances surfaced same-day, out
of scope for S139, banked for next emission arm:
- `og:description` (page.ts:109) hardcoded Greek prose for both
  locales.
- `twitter:description` (page.ts:120) same hardcoded Greek.

**Closure rule:** before shipping any new locale/state-aware emission,
extend the parity verifier to assert *every* sibling in the same
block. Three checks minimum:
1. Locale-aware fields → assert correct value per locale across the
   page-family pair.
2. State-aware fields (e.g. is-saved, paginated) → assert correct
   value per state.
3. Symmetric-presence/absence fields (e.g. `og:locale:alternate`
   when alternate exists vs not) → assert presence on the right
   side and absence on the other.

**Detection signal:** if a parity verifier asserts on ≥1 field from a
block but not on the other fields in the same block, the unasserted
fields are drift candidates. Run a column-wise audit per block.

**Cross-reference:** Builds on **Deferred-Gate Provisionality (DGP)**
above — DGP catches gate-deferral-across-layers; Sibling-Field Drift
Detection catches gate-coverage-within-a-layer. Distinct surfaces,
complementary closure rules.

---

### Post-Ship Strategic-Decision Shock Absorber (2026-05-14, S139, meta-pattern)

Post-ship strategic decisions can retroactively narrow just-shipped
emission scope. Plan the parity verifier extension *before* shipping
the emission, not after the strategic re-decision.

**Today's mechanism:** Commit `7966e4455` (2026-05-13) shipped /en/
self-canonical posture for hubs (canonical + og:url + JSON-LD url
all locale-aware, /en/ → /en/ URL). Within 24 hours, GEO Strategist's
canonical-to-root decision walked it back: /en/ should canonicalize
to root counterparts (consolidation move for partial-coverage state
per §4 of `specs/en-deployment-state-2026-05-13.md`). S139 had to
re-touch the same template lines (page.ts:94/110/513) plus extend
to event-page.ts:165/403/411 plus revert two hub-page.ts post-patches.

**Why it happened:** S138's verifier was scoped to lock the existing
emission shape (locale-aware /en/ self-canonical) and ship green.
That locked the shape *as shipped* without leaving room for the
shape to flip without a verifier update. When Strategist decided the
shape should be different, the verifier needed (a) shape-update for
the new contract + (b) coverage extension to lock against further
drift. Both in the same session as the source fix.

**Closure rule (preventive):** when shipping locale/state-aware
emission for the first time, the parity verifier should be authored
to be *contract-flexible* — i.e., parameterize the expected URL
shape rather than hardcoding. So when the contract flips, only the
parameterization changes, not the entire test rewrite.

**Closure rule (reactive, when re-decision lands):** package three
things in the same commit:
1. Source fix to the new contract.
2. Verifier rewrite to the new contract (delete old assertions, add
   new ones).
3. Coverage extension if Session A surfaced gaps (e.g. content hubs
   beyond cornerstones).

Doing (1) without (2) ships the verifier asserting the old contract
against the new emission — silent green-by-stale-test.

**Detection signal:** a strategic decision document arriving within
the cache TTL window (24h) of a prior shipping commit's title
matching the same surface. If the decision says "actually, X should
be Y instead," check whether the X-locking verifier needs rewrite.

---

### Caller-Side Composition Blind Spot (2026-05-14, S139)

When probing emission, also probe callers — the field value lives in
the composition, not just the template.

**Today's mechanism (concrete):** `src/templates/content-page.ts:61`
emits canonical as `${BASE_URL}/${slug}/`. Probe-by-grep on
content-page.ts alone reported "no urlPrefix, always root URL." True
— but `src/generate-site.ts:715` passes `slug: 'en/about'` for /en/
content pages. The locale prefix was baked into the slug parameter
upstream, so /en/about/ shipped canonical = `/en/about/`
(self-canonical, not root). Bug invisible to per-template probe.

**Closure rule:** Emission-site probes must include caller-side
composition. For any template emitting URL fields, grep for the
template's invocations and inspect the parameter shape. Specifically:
1. If a template accepts `slug: string`, grep callers for `slug:`
   and verify whether locale prefix is in the slug or separate.
2. If a template accepts `url: string`, ditto for any URL-encoding
   conventions.
3. If a template's URL-field emission depends only on a parameter
   (no internal locale flag), the locale-awareness lives upstream
   in the caller.

**Detection signal:** template emits `${BASE_URL}/${param}/` with no
internal locale conditional. Trace `param` to the caller; if caller
constructs `param` with locale, that's the actual locale boundary.

**Cross-reference:** Variant of `feedback_verify_paths_in_briefs.md`
(precedent count now 7 with S139). Brief-vs-reality verification
typically focuses on file existence and structure; this pattern
extends it to data-flow shape between template and caller.

---

## 2026-05-14 — Session B Pattern Banking

### DGP (Deferred-Gate Provisionality) — third concrete instance

When an audit gate verdict explicitly defers enforcement to another layer ("style-agnostic at A; enforced centrally at B"), the verdict is **provisional** until layer B has been independently checked against the same constraint — AND until every parallel selector implementing the same affordance at layer B has also been checked.

**Today's grep anchor (pre-removal evidence, cite by commit hash for post-fix traceability):**

```
grep -n '\.edp-save-btn.*is-saved' src/styles/design-system.css  # at HEAD pre-Session-B (82aa4fd7d)
1209:.edp-save-btn.is-saved {
1214:.edp-save-btn.is-saved svg { fill: var(--accent-primary); }
```

These two lines were the third yellow-budget violation site (after the two `.card-save-btn` lines that d1cee688a removed). The original Gate 1 audit closed cleanly on `.card-save-btn` (S138) but the parallel selector `.edp-save-btn` — implementing the *same* save-affordance — was banked as out-of-scope. The bank held for ~24 hours; Session B closes it.

**The DGP instance specifically**: Gate 1's "yellow budget held at 5 named contexts" verdict deferred enforcement to "central CSS." S138 found the CSS surface for `.card-save-btn`; S139 ran the verification batch and surfaced `.edp-save-btn` at line 1214 as a residual; Session B closes the residual. Gate 1's verdict reached clean PASS only after all three save-affordance sites (card color, card svg fill, edp svg fill + container color + container border-color) were addressed — a 24-hour deferred-enforcement loop with three commits.

**Closure rule reaffirmed**: A gate that defers enforcement to a different layer must verify the deferred layer's coverage across *all* affordance instances, not just the first found. Parallel-selector enumeration is part of layer-B verification, not a separate concern.

**Cross-commit grep anchor for post-fix traceability**:
- d1cee688a: removed `.card-save-btn` yellow (S138)
- Session B (`<hash>`): removes `.edp-save-btn` yellow (today)
- Post-fix grep `grep -nE '\.(card|edp)-save-btn.*accent-primary' src/styles/design-system.css` returns zero matches.

### Pattern A sub-pattern (search-exhaustiveness) — locked at three instances

When grep-verifying a fix surface, count *all* matches, not just whether ≥1 exists. The search must enumerate every selector in the same class family / affordance family / emission block.

**Today's grep anchor (pre-removal evidence)**:

```
grep -nE '\.edp-save-btn.*is-saved' src/styles/design-system.css  # at HEAD pre-Session-B
1209:.edp-save-btn.is-saved {
1214:.edp-save-btn.is-saved svg { fill: var(--accent-primary); }
```

Two matches in the same class family. S138's earlier verification finding identified the same shape on `.card-save-btn.is-saved` (color rule + svg fill rule = two matches in the same family). Three instances confirmed across:

1. S138 — `.card-save-btn.is-saved` color + svg fill (two-rule family)
2. S139 verification — `.edp-save-btn.is-saved` color + border-color + svg fill (three-rule family — the third had been silently overlooked because Gate 1's grep mechanism never matched the parent `.is-saved` block on the `.edp-save-btn` selector)
3. Session B — closure across the entire save-affordance surface

**Three-instance recurrence locks the pattern class**. Sibling-selector exhaustiveness is recurrent, not coincidence.

**Cross-reference**: see decisions.md 2026-05-14 entry "Pattern A sub-pattern narrative" for full d1cee688a / S138 / S139 / Session B chain narrative + rationale. Bidirectional cross-reference is non-optional per Q7 fix-rot guard.

---

### Cross-Commit Retroactive-Touch Sequencing (2026-05-14)

A "retroactive touch on prior commit X" framing implies the new change must risk-budget against X's stability. That risk is often a sequencing artifact, not intrinsic to the change. When the touch can ride into the SAME commit as the consuming change, the cross-commit framing collapses to single-commit refactor — strictly easier auditability.

**Test (Gate 4 question, formalized):** can the touch be folded into the consuming commit's diff without adding scope? If yes, fold; the retroactive-touch concern dissolves. This is exactly what Gate 4 of Design Navigator's four-gate evaluation framework (sent on Session B greenlight, 2026-05-13) was probing — the pattern formalizes that gate's resolution path.

**Counter-condition — when ride-in is NOT viable**, the cross-commit framing is correct and should NOT be dissolved by reflex:

  (i) Rename touches reference sites outside the consuming commit's surface, requiring a wider scope than the consuming change can coherently absorb without adding semantic interpretation.

  (ii) Rename has independent value that warrants standalone commit history — e.g., the rename is a deprecation step toward a different end-state than the consuming commit, or the rename needs its own bisection target for future regression hunting.

  (iii) Consuming commit's surface is large enough that folding the rename obscures audit trail rather than collapsing it.

Apply the pattern as: "test ride-in feasibility against (i)/(ii)/(iii) before defaulting to cross-commit framing OR to ride-in framing." Default to neither; the test decides.

**Grep-anchored on commit `02dcc7c71`** — BOOKMARK_ICON rename rode into `.edp-save-btn` extension commit, collapsing Gate 4 retroactive-touch worry to single-commit pure refactor. Counter-conditions (i)/(ii)/(iii) all evaluated against today's surface: rename touched 4 lines in 1 file (no outside scope), had no independent value (no deprecation beyond the use-encoding fix), consuming commit was 141/8 line diff across 4 files (small enough that folding clarified rather than obscured). All three counter-conditions failed, ride-in was viable, pattern instantiated.

Pattern source: Design Navigator closeout observation + counter-condition extension, 2026-05-14.

---

### Multi-Signal State Probe Architecture (2026-05-14)

A visual or behavioral state change implemented through a single signal (class toggle alone, color flip alone, icon swap alone) passes test walks trivially — there's nothing for the walker to cross-check against. A multi-signal implementation, where state transitions through N independent signals at once, makes the walk a meaningful probe: the walker is checking that all N signals are in sync, and a silent regression in any one becomes detectable.

**Three-signal pattern instantiated on `.edp-save-btn` after Session B** (commit `02dcc7c71`):

  (a) Button class toggle (`.is-saved` on/off via JS click handler)

  (b) Text label swap (`data-save-label` / `data-unsave-label` attr-driven)

  (c) Icon shape flip (`.edp-save-btn__icon path` fill outline → solid)

The 4-state walk on production verified all three signals fire on every transition (unsaved → saved → reload-persisted → unsaved). Yellow budget Gate 1 also held across the full state cycle, not just resting state — confirming the 38-occurrence post-extension count is robust across interactive states, not just inspect-element snapshots.

**Rule:** when a state-bearing affordance ships, target N≥2 independent signals at the implementation layer. The cost is small (today's extension layered icon-shape-flip on top of pre-existing class+label signals — net cost was the CSS path-flip rules, ~12 lines). The benefit compounds: future regressions on any one signal surface during state-walk verification rather than silently in production.

If save-affordance extends to a third surface, this multi-signal contract carries forward — it's the contract, not the implementation.

Pattern source: Design Navigator visual-gate closeout observation, 2026-05-14.

---

### Code-Intent vs Implementation Divergence (2026-05-14)

When code defines a **named set, enum, or map that implies a property of its members**, verify the implication holds against the actual values. A name conveys intent ("these are X"); the values must satisfy that intent. Naming alone is not a verifiable contract — and an unverified contract becomes a silent bug surface.

**Pattern instantiated twice in two consecutive audits:**

1. **`LIGHT_TEXT_BADGES` at `src/templates/page.ts:45`** — name implies "these badges have backgrounds dark enough to need light text." Audited: the three included values (`performance #f5a742`, `cinema #b87ef7`, `screening #ef5350`) are all mid-luminance oranges/lavenders/reds. None are dark. All three FAIL WCAG AA contrast with light text by 2-3x. The set's premise is the inverse of reality. Detected by `specs/event-type-badge-color-audit-2026-05-14.md`.

2. **`tech.title_keywords` in `src/validators/event-categorizer.ts:73–79`** — name implies "these keywords identify tech/conference events." Actual contents include `'seminar'`, `'research talk'`, `'lecture series'`, `'συνέδριο'` — all talk-class indicators that are NOT semantically tech. The category became a catch-all for events lacking a proper bin (the missing `talk` EventType). Detected by `specs/categorizer-audit-2026-05-14.md`.

**Why this hides:** the name is its own claim ("these are X"). Code review tends to verify the *name* against the *intent* (does the name make sense?), not the *values* against the *name* (do the values satisfy the implication?). Test coverage typically checks behavior in/out of the set, not whether the set's members have the property the name asserts. So the bug ships, the set name reads correctly, and the failure shows up only when the world looks at the actual rendered/computed output.

**Rule:** for any named set/enum/map whose name implies a property of its members, write an assertion that **verifies the implication on every member**:
- `LIGHT_TEXT_BADGES`: assert each member's `--color-<member>` has L < some threshold (or contrast against `#f0f0f0` ≥ 4.5).
- Categorizer keyword categories: assert each keyword in a category's `title_keywords` actually describes an event of that category (harder — semantic, may need human review on each add).

Without that assertion, the set name is a comment that lies whenever someone adds the wrong value.

**Counter-condition:** purely descriptive names (`EVENT_TYPES_WITH_DESCRIPTIONS = …`, `PAYMENT_PROVIDERS = …`) are fine — they enumerate state, they don't claim a property holds. The pattern triggers only when the name asserts something true of every member.

Pattern source: post-audit synthesis across `specs/categorizer-audit-2026-05-14.md` (LIGHT_TEXT_BADGES analog) and `specs/event-type-badge-color-audit-2026-05-14.md` (contrast math confirming 3 failures).

**Mitigation landed (instance 1): 2026-05-18 (S142, commit `9487388a0`)** — `src/templates/__tests__/badge-contrast.test.ts` operationalizes the "verify the implication on every member" rule for `LIGHT_TEXT_BADGES`. CI-enforced: FAIL when ratio <4.5:1, WARN when 4.5 ≤ ratio < 5.0. Test iterates `EventType` union members with a `satisfies readonly EventType[]` compile-time drift guard, so adding a new EventType without adding it to the test fails tsc. Reusable shape — same regex-extraction + WCAG-helper pattern extends to focus-ring × surface variants, `--text-secondary` × `--bg-raised`, etc. (DN flagged these for v1.1 evaluation queue). **Instance 2 (`tech.title_keywords` semantic-mismatch) remains open** — semantic-check assertions are harder than numeric-contrast assertions; no obvious automated form.

---

### Trace One Example End-to-End Through the Data Path (2026-05-14)

Before naming a bug's location, trace one concrete example through the system end-to-end. The categorizer-audit session's brief named the categorizer's source-hint fallback as the proximate cause of Megaron talks being typed `'concert'`. The actual cause was upstream of the categorizer: the megaron.gr scraper's narrow `ScrapedEvent['type']` union + three `'concert'` defaults at `scripts/scrape-megaron.ts:38, 41, 107`. The categorizer never had a chance to disagree — by the time it ran, the row already had `type='concert'`.

**Why this hides:** the surface symptom (an event with wrong type in the DB) is observable downstream from many possible causes. Without tracing, the most-recently-touched component (the categorizer) reads as the natural suspect. Source-side defaults are invisible in the symptom and easy to miss because the *production* type column doesn't carry provenance.

**Rule:** when naming a bug's location in a brief, trace at least one specific example through the full data path — scraper → categorizer → DB → render. Quote the file:line where the value is *first set*, not where it's last seen. The first-set location is the root; everything downstream is propagation.

**Brief application:** for any bug brief that names a transformation/normalization step as the cause, ask: "where does the value enter the system?" If that point isn't checked, the brief is naming a possible cause, not a confirmed one.

Pattern source: `specs/categorizer-audit-2026-05-14.md` Section A.3 — the scraper's three concert defaults were the actual cause, not the categorizer's fallback. Brief assumed the categorizer; trace revealed the scraper. (S140-style audit, 2026-05-14.)

---

### Remembered Facts Count as Assumptions; Grep Them Anyway (2026-05-14)

When a brief carries a fact forward from a prior session ("this column has X behavior", "this function is named Y", "this file lives at Z"), treat the fact as an *assumption*, not as canonical state — and verify it against the current repo before relying on it. The S140 session's brief carried "use `bun run scripts/import-events.ts --source=megaron`" forward — that command does not exist in the codebase (verified zero hits via grep). The correct command is `bun run scripts/scrape-megaron.ts`. Memory crystallized the wrong shape; the brief inherited it.

Same shape in the same session: brief asserted `dedup_protected=1` would protect type from re-scrape overwrites. `upsertEvent` actually overwrites `type` unconditionally via `type = excluded.type` at `src/db/database.ts:236`; `dedup_protected` is only consulted by `src/quality/duplicate-detector.ts:52` and the `scripts/remove-duplicates.ts` / `scripts/merge-duplicates.ts` paths — none of which gate `upsertEvent`. Memory remembered the column exists; memory did NOT verify what the column actually gates.

**Rule:** repository memory is a starting point, not an authority. Before citing in a brief or executing on:
- File paths → `ls` or `find`
- Function/script names → `grep -rn "<name>" src/ scripts/`
- Column behavior → `grep -n "<column>" src/db/ src/quality/` to find every consumer
- Config schema → read the file fresh

The grep takes 30 seconds; an incorrect brief costs an hour of rework + an architecture decision made on wrong premise.

**Counter-condition:** facts that are tautologically stable (the project name, the language, the runtime) don't need re-verification. Facts that *describe code behavior or file locations* do. The split: "what the system IS" (stable across sessions) vs "what the system DOES" (drifts with every commit).

Pattern source: S140 session's two brief-vs-reality mismatches — non-existent import script + dedup_protected mis-modeled. Brief carried both facts forward from memory; pre-flight grep refuted both in <2 minutes. The `feedback_verify_paths_in_briefs.md` memory tracks this pattern across S71, S82, S95, S100b, S101a, S138, S140 — 7 instances and counting. (2026-05-14.)

---

### Pattern A'' — Wrong-Cardinality Assumption (2026-05-15)

When a brief describes a logical concept ("generate an ID for an event", "validate a price type", "produce a slug", "render a card") as a singular function, **verify the cardinality before relying on it.** In solo-dev codebases that grow organically, a logical concept often becomes physically dispersed across N files as new scrapers / writers / generators are added — each copy-pasting the implementation with small variations (signature drift, algorithm drift, separator drift, normalization drift).

The concept is still singular at the **contract level** but plural at the **site level**. A brief that says "we need to update the function" is implicitly asserting "there is one function." When there are 10, the brief is naming a contract dispersed across 10 sites — and the fix-session scope grows by 10×.

**Mitigation — single grep before describing the concept as singular:**
```bash
grep -rn "function <name>\|<name>\s*=" src/ scripts/ --include='*.ts'
```
If multiple definitions surface, the brief describes a **contract dispersed across N sites**, not "a function." Then the brief should:
- Cluster the sites by signature + algorithm + other distinguishing features
- Note which clusters are vulnerable to which failure modes
- Choose a fix vector that matches the dispersion shape (centralize? sympathy update across all sites? leave dispersion and fix downstream?)

**Anchor case:** S141 ID-stability audit preflight surfaced **10 sites** for `generateEventId` with **3 distinct contracts** (sha256+dash+3-param vs md5+pipe+3-param vs md5+dash+2-param). The brief said "likely a single function." The 3-cluster dispersion materially changed the fix-vector comparison: Vector A's blast radius grew from "1 file change" to "10 files + migration tooling + staged rollout"; Vector B/C (dedup-layer fixes) became proportionally more attractive specifically because they operate downstream of the dispersion.

**Pattern is a sub-case of Pattern A** (wrong path / wrong premise) — distinguished by the *logical-vs-physical cardinality* axis specifically. Pattern A covers "wrong file/function/mechanism named." Pattern A'' covers "right concept named, but cardinality (1 vs N) wrong." The mitigation is a single grep, but the failure mode hides because the brief's mental model of "the function" reads coherent until verification reveals the dispersion.

**Counter-condition:** facts about **purely-singleton concepts** don't trigger — `BASE_URL`, `--bg-primary`, the schema migration runner at `scripts/run-migrations.ts`, `upsertEvent` (one definition in `src/db/database.ts`). The pattern triggers only when the concept describes an *operation* that scrapers / writers / generators might want to invoke locally rather than import. Greenfield codebases with strong import discipline rarely show this; codebases that grew via copy-paste-and-tweak scaffolding routinely show it.

**Sibling examples worth checking with a single grep before naming as singular:**
- `parseDate` / `parseGreekDate` (likely dispersed across scrapers — each source has its own date format)
- Image extraction / Open Graph extraction (likely dispersed)
- Venue normalization (likely dispersed)
- Title slug generation (verified singular in this codebase via `slugify` at `src/generators/event-page.ts`, but worth re-verifying when next mentioned in a brief)

Pattern source: S141 ID-stability audit preflight, 2026-05-15. Brief said "single function"; reality was 10 sites across 3 clusters. Pattern is itself a sub-case of Pattern A — distinguished by logical-vs-physical cardinality specifically.

## 2026-05-17 — S136 (Bing pivot) Pattern Banking

### Pattern E — Two-tier failure markers (STALE / AUTH_FAIL)

Generalization of the single-tier `STALE` marker pattern banked in S91. Distinguishes **transient** failures (auto-recovers on next run) from **persistent** failures (needs human intervention).

**Single-tier (S91):** any API failure → write `STALE` to the CSV column. After 6 days of unchanged data the operator notices and investigates. Works for the case the original pattern was designed for: ping-indexnow.ts hitting a quota or 5xx.

**Two-tier (S136):** separate the two failure classes by signal:
- `STALE` → 5xx, network timeout, quota exhaustion, request abort. Fetcher continues; preserves last-good data; status surfaces so monitor can re-attempt next run.
- `AUTH_FAIL` → 401, 403, expired credentials, revoked property access, deleted-account. Fetcher continues (still exits 0 — observability cannot kill production), but the marker is loud and distinct so operator action is unambiguous.

The two-tier semantics matter when authentication flows are fragile (OAuth token expiry, service-account permission revocation) and would otherwise sit silently as "stale" for weeks while the operator waited for the API to "recover."

**Anchor case:** `scripts/fetch-bing-metrics.ts` emits `status: 'ok' | 'stale' | 'auth_fail'` to `logs/bing-latest.json`. `scripts/monitor-search-visibility.ts` reads the status field verbatim into the 4 bing_*_7d columns. Existing STALE markers at `scripts/monitor-search-visibility.ts:78, 136, 281` (`STALE`, `STALE_ENRICHMENT`, `STALE_WRAPPER`) remain single-tier — they don't have an authentication failure mode to distinguish, so two-tier would be over-engineering.

**Rule:** add the `AUTH_FAIL` second tier when (and only when) the data source has an authentication boundary that can persistently fail. Local-only signals (enrichment counts, log misreports) don't warrant the second tier — there's no auth to fail.

---

### Pattern F — Fetcher writes JSON, monitor reads JSON (observability decoupling)

The S91 IndexNow pattern (ping-indexnow.ts writes `logs/indexnow-latest.json`; monitor-search-visibility.ts reads it) generalized to a reusable shape:

1. **Fetcher** is the side that talks to external APIs. It owns timeouts, retries, error classification, and status semantics. It writes a small JSON file (kilobytes) atomically (tmp + renameSync).
2. **Monitor** is the side that talks to the CSV (or other observability sink). It reads the fetcher's JSON, projects the relevant fields into output columns, and translates status markers (STALE/AUTH_FAIL) into the column values. The monitor has zero knowledge of the external API.

**Decoupling benefits:**
- The fetcher can be scheduled independently (cron, plist, ad-hoc) without coupling to the monitor's daily cadence.
- The fetcher can be re-run for a specific window (e.g., re-fetch yesterday's window if the morning run hit a 5xx) without re-running the monitor.
- Testing the monitor doesn't require mocking the external API — fixture JSONs cover all the status states.
- The fetcher and monitor can be written by different sessions / authors — the JSON file is the contract.

**Anchor case S91:** `scripts/ping-indexnow.ts` writes `logs/indexnow-latest.json`; `scripts/monitor-search-visibility.ts:72-89` reads it via `getIndexNowStats()`.

**Anchor case S136:** `scripts/fetch-bing-metrics.ts` writes `logs/bing-latest.json`; `scripts/monitor-search-visibility.ts:getBingMetrics()` reads it. Same shape, same atomic-write discipline, same try/catch envelope (S91 rule: observability never kills production).

**Rule:** when integrating any new external API into the observability layer, default to this decoupling. Inlining the fetch call into the monitor couples cadence, blocks independent re-runs, and forces test-time mocking of the API into every monitor test.

---

### Pattern G — Drop-N-Add-K CSV migration (standalone, not in-place auto-migrator)

Generalization of S98's N→N+K column-add migration pattern. The S98 pattern was "add columns before notes" — `migrateCsvIfNeeded()` in monitor-search-visibility.ts auto-inserts empty fields before the trailing `notes` column when the header expands. That works for pure adds.

It does NOT work for DROP+ADD reshapes, because:
- In-place auto-migrators can't safely DROP columns: the column being dropped might have meaningful historical data that downstream consumers still read; deciding to discard it is a design call, not a transform.
- The transformation isn't reversible from header comparison alone — "this header has 27 cols and the file has 20 cols" doesn't tell the migrator whether index 16 should be dropped or whether 7 new cols should be inserted between indices 15 and 16.

**Pattern: standalone one-shot script for DROP+ADD.**
1. Hardcode the OLD and NEW header strings as constants. Idempotency check: if header == NEW, no-op.
2. Validate OLD header matches exactly before transforming. Refuse to operate on unexpected shapes.
3. Compute per-row transform: slice out the dropped column(s) by index, insert empties at the new positions, preserve trailing columns.
4. Backup original to `<file>.pre-<session>-backup` before atomic write.
5. Print row count + column count assertions ("rows unchanged, cols +N"); refuse to proceed if math doesn't match.
6. Provide `--dry-run` that prints the plan and a sample first-row transform without writing.
7. Delete the migration script after running successfully (or commit it as audit trail; depends on session size).

**Why standalone, not in-place:**
- Dry-run review is essential for DROP — operator should see the transformed sample row before committing the irreversible drop.
- Backup file is the rollback path.
- Audit trail (the script itself, post-deletion or committed) documents what shape was migrated to what.
- In-place migrators silently re-run on every daemon tick; standalone runs once.

**Anchor case:** `scripts/migrate-search-visibility-csv.ts` (S136, 2026-05-17). 20 → 27 cols (drop `ai_citations_count` at idx 16; insert 8 new cols at idx 16-23). Idempotent (re-run is no-op once migrated). The in-place `migrateCsvIfNeeded()` retains its S98 role for any future N→N+K addition.

**Rule:** any CSV schema change that includes a DROP gets a standalone migration script; any schema change that's pure ADD-before-notes can extend the in-place auto-migrator.

---

### Pattern H — Empty-file as distinct BLOCKED state (verify with `[ -s ]`, not `[ -f ]`)

Sub-case of `verify-assumptions`. When verifying the presence of a pre-staged credential file or any state-bearing file, distinguish three states, not two:

1. **Absent** — file doesn't exist at the path. Surface: BLOCKED (operator needs to create file).
2. **Present-but-empty** — file exists, mode is correct, but size is 0. Surface: BLOCKED (operator pre-staged the file but didn't populate it). The credential-handler downstream would receive empty input and either crash (good — fail loudly) or send the empty value to the API (bad — masquerades as auth failure).
3. **Present-and-populated** — file exists with content. Surface: READY.

Bare `[ -f ]` (file exists?) collapses states 2 and 3 into one. Operators commonly pre-stage credential files with `touch && chmod 600` to reserve the path with correct permissions before pasting the secret. The `[ -s ]` check (file is non-empty?) keeps the three states distinct.

**Anchor case:** S136 Step 0a. The Bing API key file at `~/.config/agentathens/bing-api-key` was 0 bytes when verification ran. Bare `[ -f ]` would have passed; the fetcher would have hit Bing with `apikey=` (empty value), gotten back 401, written `status='auth_fail'`, and the operator would have read this as "GSC silent-fail is now hitting Bing too" — a misdiagnosis that would have triggered a credential-rotation cycle.

**Rule for any credential-file or state-file presence check:**
```bash
if [ -s "$FILE" ]; then echo READY
elif [ -f "$FILE" ]; then echo "BLOCKED: $FILE exists but is empty"
else echo "BLOCKED: $FILE absent"
fi
```
The three-way split surfaces the right operator action for each state.

## 2026-05-18 — Pattern G Batch Banking

### Pattern I — Pattern G commit-splitting (one logical maintenance item per commit)

A "Pattern G maintenance batch" is multiple unrelated cleanup items bundled into a single session for efficiency. The temptation is to ship all items in one commit ("docs/chore: Pattern G batch 2026-05-18"). Don't.

**Rule:** one logical maintenance item per commit, even within a Pattern G batch. Audit-shape > commit-count economy.

**Why audit-shape matters more than commit-count:**
- Each commit's diff has a single audience: someone reviewing the cleanup hook doesn't care about the queue reset, and vice versa.
- Future bisects fire cleanly on the specific item that introduced a regression.
- Reverting one item doesn't require surgical re-staging of the others.
- Commit messages stay focused (one purpose per message); the why is comprehensible without parsing multiple unrelated diff hunks.

**The empty-commit subcase:** when an item is a data-only change (e.g., SQL UPDATE on a gitignored DB), `git commit --allow-empty` preserves the audit trail in git log without an artificial diff. Conservative tools that reject empty commits are rare in practice; the audit value outweighs the unusualness.

**Anchor cases:**
- S136 (2026-05-17): 3 commits — ship (`d951376a6`), notes (`16ebd4908`), session-log (`2b26cb555`). Each audience-targeted.
- Pattern G 2026-05-18: 4 commits — cleanup hook (`3c3b41fa3`), queue reset --allow-empty (`18f293435`), plist version-control (`20491f4c2`), notes (this commit).

**Counter-condition:** mechanical follow-on commits (typo fixes immediately following a feature commit, lockfile updates following a dep change) can bundle. The rule is "one logical item per commit," not "one file per commit."

---

### Pattern J — `temp-*` directory accumulation as silent throughput tax

Pipelines that write partial state to `temp-*` directories during multi-step subprocess work (Claude Code-style agents writing per-event description files mid-batch) often don't clean up between runs. Each run starts with the prior run's partials still on disk.

**Why this is a silent throughput tax:**
- Agents discovering existing partials downshift from "write fresh" mode to "load partial + fact-check + complete" mode. Fact-check is slower than write-fresh, especially when the partial is from a prior version of the prompt/schema.
- Stale partials confuse the "is this batch done?" heuristic — agents can mistake a 10-day-old `batch-999/` from a long-aborted run for current work, generating spurious activity.
- The slowdown is invisible per-run (each individual call still completes); only aggregate throughput drops over weeks.

**Mitigation pattern:**
- Cleanup hooks belong at script **start** (before subprocess invocation), not at end. Reason: if the prior run crashed mid-execution (panic, OOM, manual kill), end-of-script cleanup didn't run and the next start-of-script cleanup is the only safety net.
- Cleanup must be guarded by a single-instance lock so concurrent runs don't delete each other's working dirs. The auto-enrich.sh `.auto-enrich.lock.d` mkdir-based lock is the model.
- Don't over-clean: scope to the specific subdirectory pattern (`batch-*/`), not the parent (`temp-descriptions/`). Loose stale files in the parent dir may have other curation needs.

**Anchor case:** `scripts/auto-enrich.sh:268-271` (2026-05-18). Existing `temp-briefs/` cleanup (file-based, `rm -f` glob) at script start; new `temp-descriptions/batch-*/` cleanup (subdir-based, `rm -rf` glob) added in same block. Both gated by the single-instance lock at `:151-171`.

**Cross-reference:** S110 throughput-regression diagnosis flagged stale partials as a suspect long before this session shipped the fix. The cleanup hook closes that S110-era loop.

## 2026-05-18 (PM) — Citability Audit Follow-Through Pattern Banking

### Pattern K — Audit-driven planning loop is becoming load-bearing

Three consecutive sessions (S136 brief, Pattern G brief, citability audit brief) had brief premises invalidated by Phase 1 verification:
- S136: column name (`ai_citations` vs `ai_citations_count`), column count (28 vs 27), path (`/Users/chrism/dev/...` vs `/Users/chrism/Project with Claude/...`), 7 brief-vs-reality mismatches total
- Pattern G: stuck-row count (11 vs 19), SQL location ("from known-issues.md" — doesn't exist), plist diff target (config/launchd/ vs project root), temp-briefs mechanism (rm -f on files vs rm -rf on subdirs)
- citability audit: exhibition anomaly (100% pass, not 63%), 3 EN cornerstones (actually 4 true 404s + 3 redirects), build-completeness schema (different keys), dist/ paths missing
- /venues/ + EN cornerstone session: hub CollectionPage reference at page.ts (not hub-page.ts), HUB_EVENT_LIMIT cap (30, not 20/50), EN routing gate (answerCapsuleEn presence, not "en:true" flag), 6 brief-vs-reality findings total

The executor's Phase 1 verification has become the ground-truth oracle for whether briefs ship-as-stated or ship-with-corrections. Pre-session "verify-brief-premises" skill — escalated from post-May-29 to first-in-queue parked item.

**Anchor:** `specs/citability-audit-2026-05-18.md` (commit `d1c22272d`) was itself produced by an audit that invalidated 4 of 5 candidate framings. The downstream implementation session inherited the corrected list and shipped cleanly.

### Pattern L — Empty-array config fields trigger validator errors downstream

When adding new entries to `config/hub-pages.json`, an empty `faqs: []` array passes JSON-validity and TypeScript compilation but produces a runtime error at the validator step: "FAQPage: mainEntity (Question array) is missing or empty." Two failure paths:
1. Greek FAQ present but EN FAQ absent → EN page emits FAQPage with 0 Questions (the EN exhibitions case this session)
2. FAQs array empty in both languages → both pages emit empty FAQPage (the `faqs: []` initial state this session)

**Rule:** When a config schema accepts `faqs: []`, the generator/validator combo may emit a FAQPage shell that fails Schema.org structured-data validation. Either populate the FAQ list with at least 1 bilingual pair, OR guard the FAQPage emission to skip when faqs array is empty (template-side fix, out of scope for config-level Pattern G additions).

### Pattern M — Branch-name drift hardened

Repo uses `main`, not `master`. Planner-side templates referencing `master` cause executor-side adaptation overhead (10+ documented adaptations across recent sessions including S136, Pattern G, push session). Future planner templates use `main` verbatim. Mitigation banked here pending template revision.

## 2026-05-18 — S142 Deploy Verification + Gate Strictness Pattern Banking

### Pattern N — Verification gates distinguish over-stating from under-stating timestamps

**The citability-penalty failure mode is fraudulent freshness — claiming content is newer than it actually is.** Conservative understatement (claiming content is older than it actually is) is not the same failure class and should not block a deploy that otherwise restores correct freshness signals. Gate strictness must match the failure mode, not symmetrical-divergence.

**Anchor case (S142, 2026-05-18):** The author's own S101a three-signal gate ("visible string ↔ meta ↔ sitemap must all agree on today's date") was written symmetrically. During S142 Part-A verification, the gate would have *blocked* a deploy that:
- Visible "Τελευταία ενημέρωση": `18 Μαΐου 2026 στις 02:35 πμ` ✅ today (Athens)
- sitemap-events.xml lastmod: `2026-05-18` ✅ today
- `<meta name="date">`: `2026-05-17` (UTC date of the 02:35-Athens build moment, which is 23:35 UTC of the prior day)

The meta-date divergence is a real pre-existing TZ bug (queued as Session D), but the symptom is conservative understatement: the SEO meta tag claims the site is one UTC-day older than the visible/sitemap signals say. AI engines weight visible text + sitemap >> a single meta tag, and even if they read the meta, "site claims to be one day older than it is" carries no citation penalty — fabricating recency does.

**Rule for verification-gate design:**
- Identify the *direction* of the failure mode the gate prevents. Fraudulent freshness is asymmetric (over-stating bad, under-stating neutral).
- Write the gate against that direction, not against symmetric divergence. "today's date must appear in visible + sitemap" is asymmetric and correct; "all three must agree" is symmetric and over-stringent.
- Document acknowledged-but-non-blocking signals explicitly. S142 reframed `<meta name="date">` as ACKNOWLEDGED non-blocking and queued the underlying TZ bug as Session D.

**Counter-example (when symmetric IS right):** integrity-check gates where any divergence is signal (checksum mismatches, db replication lag with strict consistency requirements). These check that the system's internal state aligns, not that the system's external claims are accurate. Symmetric-divergence is the right rule there. The distinction is internal-state vs external-claim: external-claim gates should match the failure direction of the external party (AI engines, in this case).

### Pattern O — `--json` + state-poll + control-char-strip is the durable shape for any CLI-orchestrated cloud-platform deploy

**Three independent failure modes stack when a Bash script orchestrates a cloud CLI:**

1. **CLI exit code captures upload completion, not platform acceptance.** The CLI returns success on bytes-reached, not on platform-built-and-published. A canceled, errored, or rolled-back deploy produces no CLI failure code. (Banked as the May-14 gotcha at mistakes.md:622+; surfaced as silent rollback in S139.)
2. **CLI text output is for humans, not programs.** Parsing `deploy_id` from human-readable output requires regex against unstable formatting. The `--json` flag prints structured deploy metadata to stdout; the script captures it to a tmpfile for jq parsing. (Mandatory for any S142-shape integration.)
3. **Cloud API responses can embed C0 control characters in user-supplied description fields** (validation reports, build logs, errors). Strict `jq` aborts; lenient parsers (Python) accept silently. The fix is parser-robustness via `tr -d '\000-\010\013\014\016-\037' | jq …`, preserving `\t`/`\n`/`\r` and stripping the rest of the C0 control range.

**Durable script shape (S142 in `scripts/daily-automated.sh:run_deploy()`):**

```bash
local MAX_POLLS=36 POLL_INTERVAL=5
local tmpfile; tmpfile=$(mktemp); trap "rm -f '$tmpfile'" RETURN

for attempt in 1 2; do
    <cli> --json >"$tmpfile" 2>>"$LOG_FILE"
    cli_exit=$?
    cat "$tmpfile" >> "$LOG_FILE"  # also surface in human log
    DEPLOY_ID=$(tr -d '\000-\010\013\014\016-\037' <"$tmpfile" | jq -r '.deploy_id // .id // empty')
    [ -z "$DEPLOY_ID" ] && { log_error "[deploy] no id; cli_exit=$cli_exit"; return 1; }

    for i in $(seq 1 "$MAX_POLLS"); do
        resp=$(<api-state-query> | tr -d '\000-\010\013\014\016-\037')
        STATE=$(echo "$resp" | jq -r '.state // "unknown"')
        case "$STATE" in ready|error) break ;; *) sleep "$POLL_INTERVAL" ;; esac
    done

    log "[deploy] id=$DEPLOY_ID state=$STATE error=${ERR_MSG:-none} cli_exit=$cli_exit attempt=$attempt"
    [ "$STATE" = "ready" ] && return 0
    [ "$attempt" = "2" ] && return 1

    # retry-once gate: condition on platform state + concurrent-deploy count, NOT time-compare
    <gate check> && continue
    return 1
done
```

**Three load-bearing design choices:**
- **Two-attempt `for` loop, not recursion.** Easier to reason about, no stack tricks, retry budget visible at function top.
- **Single poll loop covers all non-terminal states.** Polling alone never retries; only the deploy+poll sequence retries. Separates transient-state waiting from cross-attempt boundaries.
- **Retry gate uses count predicate (no other deploys in any non-terminal state), not time-compare.** Avoids clock-skew edge cases between local clock and cloud API response timestamps. The count is the actual question — "is there another deploy currently in flight that might have caused our cancellation?" — and is what listSiteDeploys directly answers.

**Single forensic log line:** `[deploy] id=$DEPLOY_ID state=$STATE error=${ERR_MSG:-none} cli_exit=$cli_exit attempt=$attempt` — parseable contract for future visibility-monitor extension (S91-ext). Each component matters: id for cross-reference to platform logs, state for terminal classification, error for failure-mode discrimination, cli_exit to track when the CLI vs platform diverge, attempt to spot retry-rate trends.

**Generalization:** This pattern applies to any Bash↔cloud-CLI integration where the CLI exit code doesn't capture platform-level acceptance. AWS CLI `aws cloudformation deploy`, Vercel CLI `vercel --prod`, Heroku CLI `heroku releases:create`, GCP `gcloud run deploy` — all have similar exit-code-vs-platform-state divergences. The shape transfers; only the API method names change.

**Anchor case:** S142 (2026-05-18), commit `c9ae3b53f`. Applied at `scripts/daily-automated.sh:534-617`. Real-world verification: 1 manual unsalt deploy (`6a0a541aa93c71142d8aa653`) + 1 launchctl-triggered deploy (`6a0a5cf2db360d2fe10bfff4`), both state=ready, no retry needed. The retry gate is insurance for the rare silent-rollback case (the May-14 incident), not the common path.

**Interactive-CLI variant (Session 2b, 2026-05-20):** The script shape above is for `daily-automated.sh`. When the CLI is invoked **interactively** (an executor running `netlify deploy --prod --dir=dist` directly), the same exit-code-vs-platform-state divergence applies but the structured `--json` + state-poll machinery isn't present. Session 2b's first deploy returned exit code 0 from the CLI but the server-side deploy state was `error` / "Deploy canceled" (likely an upload interruption — the unique deploy URL `6a0d79fb5f8bfc9101d919a1--agentathens.netlify.app` was assigned but the deploy was not promoted). The executor caught it only because the **production live-CSS curl verification step** showed the old content still being served (CDN cache age 4756s on a path that should have been freshly invalidated by a successful deploy). Retry without any local change succeeded (`6a0d7cae68ed65a53443b00b`, state=ready).

**Interactive-CLI verification protocol (Session 2b discipline):** After any interactive `netlify deploy --prod`, always (1) verify the live URL serves the new content via `curl -s` (not `curl -sf`, see below) against a known-changed asset; (2) if curl returns the OLD content with a `cache-status: hit` and high `age`, the deploy did NOT successfully invalidate — check `netlify api listSiteDeploys --data '{"site_id":"…","per_page":3}'` for state; (3) if `state=error` with `error_message="Deploy canceled"`, retry the deploy (the canceled case is retry-safe; the content wasn't rejected, the upload was interrupted).

**Two operational gotchas adjacent to this pattern (Session 2b):**
- **CDN cache-bypass via `?cb=$(date +%s)` query param does NOT bypass Netlify's edge cache.** Netlify edges key cached objects path-only by default — query strings are stripped from the cache key. Reliable cache-bypass for diagnostic curls: use the **unique deploy-preview URL** (returned by the CLI on success, e.g., `6a0d7cae68ed65a53443b00b--agentathens.netlify.app`), not query-param games on the production domain. For the production domain, the only real invalidation is the deploy's publish-time edge purge.
- **`curl -sf` silently swallows non-200 responses.** `-f` causes curl to fail (exit non-zero, empty stdout) on any HTTP status ≥ 400 without printing the response body, which during diagnostic checks hides cache misses vs. genuine 404s vs. error pages. Use plain `curl -s` for diagnostics — accept the slightly noisier output to surface the actual response and status code. Reserve `-sf` for cases where you specifically want a silent fail on error and the body content is irrelevant (e.g., health-check exit-code probes).

### Pattern P — iOS `overscroll-behavior-x: contain` is the canonical rubber-band leak guard

**Category:** CSS / Mobile / iOS WebKit
**First documented:** 2026-05-14, QW-A

Any `overflow-x: auto` or `overflow-x: scroll` container on iOS will, by default, propagate its rubber-band bounce to the nearest scrolling ancestor (typically `body`). The single-declaration fix is `overscroll-behavior-x: contain` on that container. Pair with `touch-action: pan-x` when the container is intended for horizontal touch scrolling only — this resolves WebKit's gesture-axis-arbitration ambiguity that users perceive as "jitter" or "resistance" during diagonal swipes.

**Where this applies in our codebase today:**
- `.hero-picks` (`src/styles/design-system.css:2081`) — fixed 2026-05-14 (QW-A).
- `.filter-bar-scroll` (`:1382`) — fixed 2026-05-20 (Session 1.5, on-device complaint surfaced after Path D shipped). Both declarations at `:1389-1390`.
- `.category-nav` (`:1473` after Session 2b extraction; was inline in `src/templates/category-page.ts` until 2026-05-20) — fixed 2026-05-20 (Session 1.5 added guards inline; Session 2b extracted to CSS file alongside `.filter-pill` and carried the guards through).
- `.table-scroll-wrapper` (`:2547`) — not yet patched, no current symptom; only manifests on comparison-table touch. Backstopped by QW-B for now. Queued for a future preventive maintenance batch.

**Lesson reinforced across three fixes (QW-A → Session 1.5 → Session 2b extraction):** ANY `overflow-x: auto`/`scroll` container on iOS leaks rubber-band to the parent unless guarded. Audit new scroll containers for this **at creation time**, not after on-device complaints. The on-device complaint is a costly signal — Christos's filter-bar/category-nav report came 5 days after QW-A shipped and was the same defect class scoped out of QW-A because "not on homepage." If the audit at QW-A had enumerated ALL horizontal-scroll containers (not just the homepage one), the 1.5 fix would have shipped with QW-A.

Document-level QW-B (`html, body { overflow-x: clip }`, see Pattern Q below) currently catches anything that leaks, but it's a backstop, not a substitute. Container-level declarations are still the correct primary fix because they also resolve the gesture-axis ambiguity (the `touch-action: pan-x` half of the pair) that QW-B does not address.

**When to reach for it:** any time you add or audit a horizontal-scrolling region on a page that will be touched on iOS. Add both declarations together (`overscroll-behavior-x: contain` + `touch-action: pan-x`) — they address two related but distinct WebKit behaviors and the cost of adding both is one line each.

**Anchor case:** QW-A (2026-05-14). See [docs/known-issues.md](../../docs/known-issues.md) "iOS Mobile Horizontal Scroll / Touch Jitter on Hero Picks Carousel" for the user-visible symptoms and on-device verification matrix.

### Pattern Q — `overflow-x: clip` vs `hidden`: choose `clip` when sticky descendants exist

**Category:** CSS / Layout / Sticky
**First documented:** 2026-05-14, QW-B

`overflow-x: hidden` makes the element a scroll container, which disables `position: sticky` in **all** descendants — the sticky element silently degrades to non-sticky positioning. `overflow-x: clip` clips visible overflow **without** creating a scroll container, preserving sticky behavior throughout the descendant tree.

**Where this matters in our codebase:** `html, body { overflow-x: clip }` (QW-B, 2026-05-14, applied in `src/styles/design-system.css`). Four sticky descendants depend on this remaining `clip`-not-`hidden`:
- `.site-header` (`src/styles/design-system.css:584`) — `top: 0`; sitewide.
- `.filter-bar` (`:1363`) — `top: 56px`; hub pages.
- `.date-group-header` (`:528`) — `top: 64px`; hub pages with date-grouped lists.
- `.hub-comparison-table th` (`:2561`) — `top: 0`; hub comparison tables.

**When to reach for it:** any document-level horizontal-overflow guard. Never use `hidden` on `html` or `body` if `position: sticky` exists anywhere in the descendant tree — that's a silent regression with no console warning, only visible if someone scrolls a hub page long enough to notice the filter bar no longer sticks.

**Rollback path if browser support for `clip` is insufficient** (iOS Safari <16): narrow the rule from `html, body` to `body` only (often suffices because most layout-level horizontal overflow originates at body), or remove the `html` selector. Do NOT swap to `hidden` as the rollback — that breaks all four sticky descendants above and trades one defect class for another.

**Browser support note (as of 2026-05):** iOS Safari 16+, all modern Chrome/Edge/Firefox. iOS 15 falls back to no-clipping (acceptable — Pattern P handles the dominant source case-by-case anyway).

**Anchor case:** QW-B (2026-05-14). Connected decision: [decisions.md](decisions.md) "2026-05-14 — Use `overflow-x: clip` over `overflow-x: hidden` on `html`/`body`".

### Pattern R — Regex test anchoring: anchor on the target's distinguishing property, not surrounding structure

**Category:** Testing / TDD
**First documented:** 2026-05-14, QW-A executor correction

When asserting a property of a CSS rule via regex, **anchor the match on a unique property inside the rule's body**, not on the surrounding `@media` query or parent selector. The Agent Athens stylesheet has multiple `@media (max-width: 1024px)` blocks; a regex anchored on the media query matched the **first** such block, not the `.hero-picks` body inside one of them. Anchor instead on the rule's unique identifier — for the QW-A test, `flex-direction: row` was unique to mobile `.hero-picks` and unambiguously located the correct block.

Pre-edit sanity runs (where the test is expected to **fail** before the fix lands) catch this class of bug. If a TDD test passes before the fix is applied, the test is anchored to the wrong location — investigate the anchor before writing the fix. This is the dual of the "test passes when it shouldn't" failure mode: the test was technically valid CSS-regex but asserted against the wrong scope.

**Generalization:** when a test reads built output to verify a code-or-CSS change, prefer **property-anchored** matching over **structure-anchored**. Property anchors are robust to refactors that move the surrounding structure (e.g., reorganizing media-query nesting). Structure anchors silently match the first occurrence and rot when the structure they assume changes.

**Counter-example (when structure anchoring is right):** when the assertion is *about* structural placement — e.g., "this rule must be inside `@media (prefers-reduced-motion)`" — structure is the property under test. Anchor on it deliberately, not by accident.

**Anchor case:** QW-A (2026-05-14). The pre-edit run revealed the false-pass; correcting the regex from media-query-anchored to `flex-direction: row`-anchored produced an honest red→green transition.

**Instance count: 3** (updated 2026-05-19, Session 1 Path D):
1. **QW-A test regex (2026-05-14)** — media-query-anchored test caught pre-deploy by pre-edit sanity run.
2. **Capsule injection regex (`src/generators/hub-page.ts:400-402`, audit 2026-05-18, fixed 2026-05-19)** — `html.replace('</header>', …)` matched site-header's `</header>`, not page-header's. Production-shipped for an unknown duration before audit catch. Closed via composition through new `preFilterBarHtml` slot in renderPage (Path D).
3. **Category-page nav regex (`src/templates/category-page.ts:82`, fixed 2026-05-19)** — identical `html.replace('</header>', …)` pattern. Live in production for non-colliding category slugs (clubs, rebetiko, etc.). Closed in same session as instance 2 via same fix shape.

**Two of three production-shipped before catch** (instances 2 + 3). Only instance 1 was caught at TDD time. The TDD discipline ("pre-edit run must FAIL on differentiating assertions") works only for code written under that discipline; pre-existing production code with the same defect class slips through unless audited explicitly.

**Mitigation (refined):** prefer **composition** over post-render string-replace. If string-replace is unavoidable, anchor on a **uniquely identifying property** — an id, a class with a hash, or a value distinctive to the rule's body. **Never a bare tag name** that may appear multiple times in the document. The compose-via-renderPage-slot pattern (used by homepage and now by hubs + category pages) eliminates this defect class entirely at the source.

**Still-open Pattern R instance:** `src/generators/hub-page.ts:664` — overflow back nav uses the same `html.replace('</header>', …)` pattern. Same fix shape applies (compose via preFilterBarHtml slot or threading); deferred to follow-up session.

### Pattern S — Dual-emission count signature for schema-defect diagnosis

**Category:** Diagnostics / SEO-Schema
**First documented:** 2026-05-19, S137 GSC defect classification

When a site emits the same Schema.org entity through **two surfaces** (JSON-LD block + microdata `<article itemtype="…">`), Google Search Console defect counts carry a structural signature: a defect that affects both surfaces appears at **2N**; a defect that affects only one surface appears at **N**, where N is the unique-URL count for that shape.

Agent Athens EDP pages emit Event-shaped data through both a `<script type="application/ld+json">` block (`src/generators/event-page.ts:144` builder) and a microdata `<article itemtype="https://schema.org/MusicEvent">` element (`event-page.ts:442`). For 128 unique EDPs in the May 19 GSC export:

- `performer` and `organizer` each fire **256 times** at the EDP level (2N) → both JSON-LD AND microdata lack the field. Two emission surfaces to fix per defect.
- `endDate`, `eventStatus`, `location`, `image` each fire **128 times** at the EDP level (N) → one surface lacks the field. JSON-LD passes; microdata is the gap (microdata only emits `itemprop="name"/"startDate"/"description"`).
- `offers` fires **178 times** (~1.4N) → microdata always lacks it (128) + JSON-LD lacks it for the ~50 events S134's classifier omitted (intentional).

The 2N vs N vs intermediate ratio is **load-bearing diagnostic evidence** before opening any source file. It tells you (a) how many surfaces a fix must touch, and (b) whether the defect is structural (uniform N or 2N) or data-conditional (non-integer multiple). The intermediate ratio is the strongest signal — it implies one always-fails surface + one conditional surface, narrowing the surface map without needing to grep.

**When to apply:** any GSC/Bing/structured-data defect export where the page emits the same entity through multiple machine-readable surfaces (JSON-LD + microdata, JSON-LD + RDFa, two distinct JSON-LD blocks, etc.). Compute count ÷ unique-URL-count per defect; round-bucket to nearest 0.1×; classify as 1× / 2× / mixed before opening source.

**Anchor case:** S137 specs/gsc-schema-defects-2026-05-19-diagnostic.md — 12 defects classified using count-ratio as the first pass, then per-surface code grep as confirmation.

## Multi-tier denormalization storage surfaces

When data is stored across multiple surfaces (source-of-truth / config / denormalized cache), brief authoring must enumerate ALL surfaces before scoping edits. Single-surface assumption is the failure mode.

Current instance: venue address + geo data lives at three surfaces:
- `data/venues-master.json` — geo source of truth (lat/lng/full address research)
- `config/athens-venues.json` — registry with address only (no lat/lng), feeds Schema.org emission
- `data/events.db` — denormalized cache, populated via `scripts/backfill-venue-geo.ts` propagation pass

Brief authoring checklist: when modifying data that exists in multiple surfaces, explicitly enumerate the write surfaces and the propagation paths between them. Don't assume the data lives where the brief expects it; verify via `ls`/`grep`/`jq` before scoping the work.

Promoted from mistakes.md after 4th instance of forward-looking-spec-scoping shape (S103 `ticket_url_resolved`, S138-pre Editorial config-payload omission, S140 venues-master.json, plus one earlier).

### Pattern T — Audit self-disclosure not enforced downstream (rule class)

**Category:** Process / Specs / Briefs
**Rule class first documented:** 2026-05-19 (Session 1 Path D)
**Instance count:** 4 (extended 2026-05-20 to cover the generalized "diagnose-from-source-not-output" rule)

When an audit, decision, or upstream document **discloses a constraint inline**, downstream consumers (specs, briefs, executors) must **propagate that constraint** into their own scope. The rule class fails when the downstream document references the source audit but doesn't carry forward the audit's self-disclosed conditions — readers cite the audit's TL;DR but skip the details, and the unenforced constraint silently rots.

**Instance 1 — Q7 fix-rot guard (2026-05-13, Design Navigator process pattern).**
Bidirectional cross-references between `patterns.md` and `decisions.md` are non-optional. Without them, related entries rot independently — a pattern updates and its decision-side counterpart doesn't, or vice versa. The constraint was self-disclosed by Design Navigator's 2026-05-13 process-pattern review; downstream enforcement requires every cross-referenced write to update both sides in the same session. See `patterns.md:4107`, `:4140`, `:4521` and `decisions.md:3458`, `:3478`, `:3494` for the live cross-reference machinery.

**Instance 2 — Audit-flagged viewport constraints (2026-05-19, Session 1 Path D).**
**Measurements taken at non-target viewport widths require re-measurement at the target viewport before entering specs. Audit-flagged viewport constraints are not advisory.** The capsule-drift audit (`specs/capsule-drift-audit-2026-05-18.md` §3) anchored its rendered-height measurements to iPhone SE 375×667 — the target mobile viewport. A measurement taken at a different viewport (e.g., a desktop snapshot at 1024px+) does not transfer to the target viewport without re-measurement. The audit self-disclosed the viewport in §3 ("Above-fold math: ... iPhone SE viewport height 667px"); downstream specs and briefs must re-measure at this width when consuming the audit's height claims, not assume the numbers transfer.

**Shape of the rule class:** the source document discloses a constraint inline (cross-reference rule; viewport spec). Downstream consumers reference the source but trust its conclusions without carrying the constraint forward into their own scope. The shape generalizes beyond patterns.md/decisions.md and beyond viewport — any audit-derived constraint (date scope, sample size, measurement protocol, environment assumption) is at risk if the consuming document doesn't restate it.

**Mitigation (uniform across instances):** when invoking an audit's findings in a downstream document, **restate the audit's self-disclosed constraints inline** in the consuming document. Don't rely on the reader following the citation. Cheap audit at brief-review time: every audit reference should be followed by a one-line "audit constraints: …" restating the audit's quantitative or scope-bounding conditions.

**Detection:** a spec or brief that references an audit (`See specs/X.md`) but doesn't restate the audit's quantitative or viewport / sample / scope constraints inline is suspect. Cross-reference machinery (Q7 fix-rot guard) catches one sub-class; viewport-constraint restatement catches another; the rule class catches both.

**When to apply:** any new spec, brief, or session document that references an existing audit, decision, or pattern. Make the source's constraints visible in the consuming document — citation is necessary but not sufficient.

**Instance 3 — 595px capsule height: a measurement taken at the wrong viewport entered a spec as the right one (2026-05-18).**
A capsule rendered-height measurement of 595px was taken at a 199px-wide viewport (a Chrome extension panel confound, not the iPhone SE target). It entered Design Navigator's spec as if it were the 375px figure. Re-measurement at the true 375px viewport yielded 316px — a 47% over-estimate. The audit had self-disclosed iPhone SE 375×667 as the target viewport (instance 2 above is the audit-constraint version of this rule); the spec consumed the audit's narrative but the snapshot it used to derive the number wasn't at the target condition. Diagnose-from-rendered-output failure mode: the measurement is "from the output," but only correct if the output was rendered under the target condition.

**Instance 4 — Category-nav "circles": a screenshot drove a diagnosis that source disproved (2026-05-20).**
Design Navigator diagnosed the category-nav pills as circles from a rendered screenshot on `/concerts`, and bundled a spec for "circles → capsules" rewrite (including transparent bg + 1px border + `aria-current="page"` markup migration as a coupled visual restyle). Production source showed the pills were already 20px-radius capsules — the actual bug was missing `flex: 0 0 auto` + `white-space: nowrap` on `.category-nav-item`. Two-property fix. The unruled visual restyle was bundled with the bug fix justified by the wrong diagnosis; Dev Planner refused to ship it, routed it back to DN, who withdrew it on re-ruling (failed Receding Interface Test — the restyle would have made the category-nav read like the filter bar, contradicting that they're distinct controls).

**Generalized rule (covers all 4 instances + the viewport-measurement guard):**
**Any premise that prescribes changing existing code — whether a Dev Planner brief or a specialist spec — must be grounded against the actual production source (the rule, the function, the file, the measurement at the target condition) BEFORE the brief/spec is finalized.** Never inferred from:
- Rendered output / screenshots (instance 4)
- An audit's snapshot taken at a non-target condition (instance 3)
- Prior session documents or another agent's prior claim (instance 2: viewport restatement; the constraint was self-disclosed but downstream consumers trusted the narrative without restating it)
- A cross-reference rule that wasn't enforced bidirectionally (instance 1: Q7 fix-rot guard — patterns.md and decisions.md must both update in the same session, or one rots independently of the other)

Screenshots and audits are snapshots of OUTPUT; the source is the truth. Every premise that says "X is the case" about existing code must be verifiable against the file/measurement at the target condition.

**Structural mitigation (Dev Planner practice change, 2026-05-20):**
Briefs must stop **asserting** structural facts ("the pills are circles," "X is at line N," "homepage emits first-child-of-main") in their problem-framing. Instead, briefs must instruct the executor to **establish** these facts in an explicit recon step and report, then act on what's found. A brief that asserts a fact can be wrong (and silently propagate the wrongness into the executor's scope); a brief that says "locate X and report its current state before editing" cannot be wrong about X because it doesn't claim to know.

**All 4 instances were caught at the executor's recon step**, not at brief-write time — the verify-assumptions mitigation fired late and cost a recon round each time. Moving the grounding to **brief-write time** (or removing the assertion entirely from the brief) is the structural fix. Detection at brief-write time: any sentence in a brief that says "the current code does X" must be paired with a source citation (file:line) that was verified at brief-write, or rewritten as "locate the current shape of X and report."

**Cost ladder of this rule class (highest blast radius last):**
- Instance 1: rotted bidirectional references → silent doc drift, caught only on cross-read
- Instance 2: audit viewport constraint not restated → spec reasoned with a constraint that was correct upstream but mute downstream
- Instance 3: 47% measurement over-estimate at wrong viewport → would have shipped if executor hadn't re-measured at recon
- Instance 4: bundled visual restyle on top of misdiagnosed bug fix → would have shipped a permanent design change to 2,400+ pages days before demo, justified by the wrong diagnosis, if Dev Planner hadn't refused

The trend is upward — each instance has higher blast radius if it slips. The structural mitigation (recon-first briefs, not assert-first briefs) is the only one that scales because it doesn't depend on the executor catching it.

## Schema.org type-mapping tables — allowlist coupling, friction-as-feature

**Rule:** Any module-level `Record<string, string>` (or similar) mapping internal categories to Schema.org `@type` strings MUST be coupled to a **vendored static allowlist** in its colocated test file. Every value of the map is asserted to be in the allowlist; a permanent negative-control assertion locks the historical defect shape (the bad value the allowlist would have caught). The allowlist is a literal `Set` declared in the test — **no network fetch** to schema.org, no live validator.schema.org call.

Two principles, both load-bearing:

1. **Build-as-invariant.** Tests must run offline (Bun sandboxes, CI runners that may not have egress). A live schema.org lookup at test time fails flaky-by-construction for reasons unrelated to the actual invariant. The allowlist is deterministic.
2. **Friction-as-feature.** Adding a new mapping value requires a deliberate one-line allowlist update — the explicit human checkpoint that catches the next "is this a real Schema.org type?" miss. The whole S139-fix-2 defect happened because someone added `ExhibitionCenter` to `VENUE_TYPE_MAP` without checking it was real. The allowlist makes that check mandatory; it cannot be bypassed silently.

**Negative-control discipline.** The historical defect value must remain in the test permanently as a `expect(allowlist.has('BadValue')).toBe(false)` assertion. This proves the test catches the **class** of defect, not just passes the current corpus. Without the negative control, a future refactor could broaden the allowlist in a way that allows the original bad value back in — the negative control fails loudly if that happens.

**Canonical case:** `src/enrichment/__tests__/quality-gates.test.ts` → `describe('VENUE_TYPE_MAP — Schema.org type validity (S139-fix-2)')`. Seeded with `MusicVenue`, `PerformingArtsTheater`, `MovieTheater`, `EventVenue`, `Museum`, `ArtGallery`, `Place`. Negative control: `'ExhibitionCenter'`. Implicit-fallback lock: `'EventVenue'` (the `|| 'EventVenue'` fallback used at both call sites in `schema-graph-builders.ts:52` and `event-page.ts:167`).

**Where this pattern applies:**
- `VENUE_TYPE_MAP` (`src/enrichment/quality-gates.ts:858`) — venue location types ✓ coupled S139-fix-2.
- `SCHEMA_TYPE_MAP` (sibling export in `quality-gates.ts`) — event-type → Schema.org type mapping. NOT yet coupled; same risk class. **Add coupling next time `SCHEMA_TYPE_MAP` changes** (carrying the pattern forward without a dedicated session is more important than a one-off prophylactic pass).
- Any future type-mapping table — coupling required as part of the table's introduction, not as a follow-up.

**Anti-pattern:** "the values are obvious / well-known Schema.org types, the test would be overkill." That's the exact reasoning that let `ExhibitionCenter` ship — the other map values were obviously correct, so the map looked obviously correct, and no one checked the one that wasn't.

**Reference:** Strategist 2026-05-20 ruling (S139-fix-2). `docs/schema-coverage-manifest.md` discipline section codifies this rule project-wide.

## Schema changes require validator.schema.org gating on every affected page class

**Rule (elevated from session lesson to process invariant, 2026-05-20):** No Schema.org-affecting change ships to production without browser-checking **every affected page class** at https://validator.schema.org — homepage + hub + event-detail + venue + DataFeed as applicable, plus one sample of the **densest variant** within each class (densest-exhibition hub if the change touches exhibition typing, densest-paid hub if it touches Offer logic, etc.).

**Why:** the in-build validator (`src/validators/schema-completeness.ts` + `validateMicrodata`) is a **structural-presence checker**, not a Schema.org **vocabulary / property-validity checker**. It asks "does field X exist?" and "is value Y a non-empty string?" — never "is type X a real Schema.org type?" or "does field Y belong on this entity?" Every external-caught defect this sprint (S137 organizer, S139 Stage 5 @graph-flatten, S139-fix-1 nested-Offer-price, S139-fix-2 map-value-vocabulary — see `mistakes.md` → "Validator-coverage gap") was a vocabulary-validity miss that the in-build validator was structurally blind to.

validator.schema.org is the only external check that consistently catches this drift class:
- **RRT (Google Rich Results Test)** is useful for entity-detection but has known-ignorable `@id`-resolution artifacts on `@graph` envelopes (S139 mistakes.md note); flags valid markup as broken, passes invalid markup as long as the entity is detectable.
- **GSC reports** are useful for production-corpus surveys but arrive on a multi-day lag — too slow as a deploy-gate.
- **validator.schema.org** is fast, accurate, non-cacheable, and doesn't carry the parser-literalism of RRT. Use it as the gate.

**Constructive complement (the discipline part):** each external-caught defect MUST be paired with an **internal** check added in the same fix commit. The internal check can be:
- A new FAIL rule in the relevant validator function (S139-fix-1: "price OR priceSpecification required").
- A vendored static allowlist coupled to a type-mapping table (S139-fix-2: `VALID_SCHEMA_VENUE_TYPES`).
- A new coverage-manifest entry registering an emission surface previously uncovered (S139-fix-1: ListItem Offer surface in `docs/schema-coverage-manifest.md`).

The internal check closes the specific gap so the next regression of that shape fails the build instead of shipping. Without the paired internal check, validator.schema.org becomes a permanent crutch — catching the same class of defect at deploy time instead of at build time. The gap between in-build and external validation should narrow over time as each external catch is converted to an internal check.

**Anti-pattern:** "validator.schema.org passed, ship it." That's correct as a deploy-gate but incomplete as a discipline. The next deploy with a different defect-shape will fail the gate again unless the internal coverage caught up.

**Densest-variant sub-rule:** when the gate samples N pages of a page class, prefer the densest variant (most events, longest ItemList, most populated entities). A sparse-page pass + dense-page fail is a real failure mode — the rule that validator.schema.org caught happens to fire on a property that sparse pages don't emit. S139-fix-1's `concerts.html` (densest-paid hub) and S139-fix-2's `exhibitions.html` (densest-exhibition hub) were both deliberate densest-variant picks for this reason.

**Reference:** Strategist 2026-05-20 ruling (S139-fix-2). `mistakes.md` → "Validator-coverage gap" cluster entry documents the four-instance evidence base.

### Pattern U — Deferred-on-pivot items decay unless held by a durable artifact

**The shape:** A session plans changes A, B, C. The plan-mode discussion pivots to A only (B and C "deferred to a follow-on"). The follow-on session never happens; B and C live only in the session-log narrative ("we chose to ship A; the safe halves B and C are deferred"). The session-log isn't a tracker — it's a chronicle. Items mentioned only there evaporate from active tracking. A future session rediscovers them as if greenfield, sometimes weeks later. By then the original rationale, scope, and risk assessment are gone or stale.

**Two instances in this codebase:**

1. **S2a-impl filter-URL Clear gap (2026-05-20).** The hub-identity work shipped at `5623fc503` left a known dormant code path: `generate-site.ts:1176 generatePage()` doesn't pass `hubIdentity`, so filter-URL pages (e.g. `/open-concert.html`) still Clear→`/`. This was logged at deferral time in `docs/known-issues.md` as 🟡 with a fix plan, status, and cross-references. Survived; can be picked up cleanly. **Correct application of Pattern U.**

2. **Pre-S2a-impl "two safe halves" (filter-bar fade-mask + category-nav aria-current).** The earlier plan-mode session considered shipping these two CSS-/template-level fixes alongside the hub-identity work. The session pivoted to "ship the locked-pill model only; defer the safe halves." But the safe halves were NOT logged as a known-issues entry — only mentioned in plan-mode chatter. They evaporated. Today's session rediscovered them only because a user-driven verify-prior-fixes grep surfaced them ("did these ship?" — answer: no). **Failure of Pattern U:** rediscovered as if greenfield, the original "safe half" rationale was lost, and ~24h of decoupled-but-coupled risk sat in the codebase silently (the inflight CSS-move of category-nav rules from inline `<style>` to central CSS was sitting unstaged, and could easily have been overwritten or re-done by a parallel session).

**The rule:** when a session pivots away from a planned change, log the deferred change AT DEFERRAL TIME with a durable artifact — `docs/known-issues.md` entry (severity tier + fix plan + cross-references) OR `specs/<topic>-deferred.md` IF it's a multi-page scope. NOT the session-log narrative. The session-log is for "what happened in this session"; the deferred item is "what needs to happen in a future session" — different consumer, different home.

**Adjacent fix-rot anti-pattern:** the "we'll get to it later" mention in a plan-mode chat is the rot vector. Plan-mode discussion is ephemeral; durable tracking is a `docs/` or `specs/` file. When in doubt during plan mode: "if we shipped this plan and a future session asked 'what's left here?', would the answer be findable via grep?" If not, the deferral needs a durable artifact.

**Counterpart:** Pattern N (verification gates distinguish over-stating from under-stating). Pattern U is the bookkeeping side of the same discipline — both ask "is the claim about what's done / what's left findable later in a non-narrative artifact?"

**Reference:** S2a-impl session-log entry (good); the pre-S2a "safe halves" deferral (bad — required user-driven verify-prior-fixes grep to rediscover); this session's recovery (2026-05-20) which itself logs the meta-lesson in `mistakes.md`.

### Orphan-reference + member-ordering as enforced cross-entity validation (S141, 2026-05-20)

Two new FAIL rules in `schema-completeness.ts`, both operating on the flattened @graph across entities (not single-entity field presence):

- **checkOrphanReferences** — two-pass: Pass 1 builds the global canonical-URL set across all dist/ pages; Pass 2 computes `refs − definitions − whitelist` per page. Whitelist = external hosts + internal URLs matching a canonical-set member by origin+path. Scoped to Place/Performer/Organization/Organizer via @id fragment (`#venue`/`#place`/`#performer`/`#organization`/`#organizer`). Other fragments skipped.
- **checkMemberOrdering** — bookend-only: `flattened[0]['@type']` must match the page-class first type; `flattened[-1]['@id']` must equal `{BASE_URL}/#organization`. Middle order stylistic, unenforced.

Both forward-protective: Performer + Organizer have 0 emitter surface today, so the rules gate S142 (Organizer) and future Performer work the moment they emit. This is the constructive pattern — shrink the gap between what the in-build validator catches and what GSC/validator.schema.org catch, by adding internal cross-entity checks.

**Diagnostic-first paid off:** writing `specs/s141-orphan-diagnostic.md` BEFORE coding made the FAIL-vs-WARN-ratchet branch empirical (0 true orphans / 4142 refs / 5126 pages → FAIL directly, no ratchet config). Saved the ratchet-wiring step.

### verify-the-premise recurrence count

S141 introduced no new verify-the-premise failures. The edit-surface relocation in the parallel S143 brief (`schema-graph-builders.ts` → `event-page.ts`) was caught by Phase-1 verification PRE-implementation — STOP-gated, not asserted. **Count holds at 9.** If it climbs, the planner-side checklist is insufficient and mitigation escalates to executor-side brief-premise validation.

### verify-the-premise climbs to 10 (S143 finish-forward, 2026-05-21) — planner ledger

The S143 finish-forward plan's Step 6 added a `git add -p` patch-extraction procedure based on the stale tree-state model from yesterday's stop-report (which showed S141 hunks STAGED alongside A2 in `schema-completeness.ts`). Reality at session entry today: S141 had committed between sessions at `6be053b2b`, the staged-mixing model was no longer accurate, the patch-extraction was solving a non-problem. Caught by executor's Phase-1 `git log --oneline -5` + `git diff --cached --stat` + `git diff --stat` verification; plan rewritten BEFORE Step 6 ran. **Count climbs from 9 to 10.**

The S141-patch-extraction was ASSERTED in the planner's procedural step (not merely mentioned in chatter and STOP-gated like the S143 edit-surface case), so it counts toward the ledger.

**Mitigation now in place (planner-side):** re-run `git log --oneline -5` + `git diff --cached --stat` + `git diff --stat` at session entry, BEFORE any commit-step procedure locks. Treat any prior session's stop-report as a snapshot, not a model — verify against current HEAD. The cost is three read-only commands; the prevented near-miss is patch-extraction operating on a hallucinated tree.

**Ledger scope:** planner-side only. Tracks "premise assumed in the plan vs. actual tree state at execution." Distinct from the executor-side brief-vs-reality/vocabulary-misframe ledger (counted separately, currently 8 occurrences).

### Executor ledger — brief-vs-reality / vocabulary-misframe (8th occurrence, 2026-05-21)

Today's S143 finish-forward brief framed the geo-cascade as "the cascade promoted geo/sameAs to WARN universally" / "revert any geo/sameAs INFO→WARN promotion that the parallel edit introduced." On read: `schema-completeness.ts:382`'s `warnings.push('location.geo coordinates missing')` was already WARN in the prior baseline (`git log -p -S 'location.geo coordinates missing'` confirms — first appearance pre-S143, no recent severity bump). The cascade was real, but the **mechanism framing was off** — it came from the S143 emitter's inline-with-@id shape interacting with `resolveSamePageReferences`'s single-key-merge limitation, not from a severity bump.

Action was identical regardless (demote to INFO, restore build-green). But the framing-vs-reality gap is the recurrence signal: every brief that says "X was Y before edit Z" needs `git log -p -S 'string'` verification before treating it as a revert action.

**Ledger scope:** executor-side only. Tracks "framing in the brief vs. baseline reality" gaps — vocabulary, severity claims, scope estimates. Distinct from the planner-side verify-the-premise ledger (counted separately, currently 10). Do NOT conflate counts: the two failure modes have different escalation paths.

**Mitigation extension:** for any brief assertion of the form "X was Y before edit Z" or "the parallel edit introduced Q", spot-check via `git log -p -S 'X'` or `git log --oneline --follow path` against the baseline before acting. Cheap to verify; expensive if the framing turns into a wrong-direction fix.

### Parallel-session collision protocol that worked (S141 / S138 streetAddress / S143, 2026-05-20 → 2026-05-21)

Three sessions over two days touched one tree on overlapping concerns (S141 validator orphan/ordering, S138 streetAddress data+migration, S143 emitter+validator+spec). All three shared `schema-completeness.ts` as a write surface; S143 + streetAddress also overlapped on `config/athens-venues.json` / `venue-registry.ts`. Yesterday's S143 executor stopped committing when staging surfaced unclear ownership (S141 hunks staged in front of S143 A2 in the same validator file). Planner sequenced: S141 commits first separately (lands `6be053b2b`), today's finish-forward picks up the rest as two clean separate commits (`b0b24fb64` streetAddress, `369dfe905` S143).

**The `git add -p` patch-extraction escape hatch from yesterday's plan turned out unnecessary.** The natural commit-sequencing (each owner commits in turn, isolating their changes into history) made it moot — by the time the finish-forward ran, S141 was already in HEAD~ and the working tree contained only A2 + Step 2 demote in `schema-completeness.ts`. Whole-file `git add` was safe.

**Lesson:** when shared-file ownership is unclear, **stop-and-route** is the right reflex, not patch-extract. Patch-extraction is last-resort — reserved for cases where the other owner can't or won't commit independently. The natural-sequencing pattern is the cleanest path; sessions coordinate via commit order without inter-session protocols beyond stop-and-route.

**The S141-committed-between-sessions case is now the canonical example.** Two-day windows are forgiving — yesterday's executor stop bought 12+ hours during which S141's owner committed independently, dissolving the staging-collision problem before today's session resumed.

**Connects to:** `mistakes.md` → validator-coverage-drift entry (the technical defect S141/S143 were jointly closing); planner verify-the-premise ledger (the patch-extraction-on-stale-tree near-miss was a consequence of treating yesterday's tree-state report as a static model rather than a snapshot).

### Green by demote ≠ green by scope (S143 follow-up, 2026-05-21)

The right green build surfaces the routable signal, not the one that silences it. S143 `369dfe905` demoted `location.geo` WARN→INFO (3857 events green, 4 WARN — signal hidden); `292e97aee` superseded it with the scope-to-canonical `@id` lookup per GEO's ruling (3832 green, 25 actionable WARN → Component-B backfill — signal preserved). Both pass build gates; only the second carries diagnostic value forward. When picking between a stopgap demote and a structural scope-fix, prefer the one whose residual WARN count routes to a follow-up owner.

### Pattern T (spec-vs-source recon corrections, calendar disclosure / 2026-05-21)

Three recon-shape assertions in the calendar-disclosure pre-brief diverged from current source at consumption — all caught by Step 0 re-grep before edit:

1. **C1 — no grouped isolate list.** Pre-brief framing implied a grouped multi-selector `isolation` rule in `src/styles/design-system.css` that the new `.cal-disclosure` rule could join. Step 0 grep found **10 standalone `isolation` rules, NO grouped list** (lines 334, 387, 595, 687, 702, 839, 1374, 1860, 1910, 2242). Correct execution: add `.cal-disclosure { position:relative; isolation:isolate; }` as its OWN standalone rule, matching the 10-site pattern — NOT create a new grouped list.

2. **C3 — Save/Share/Calendar baseline CSS home.** Pre-brief implied per-template CSS in `action-bar.ts`. Step 0 grep confirmed the multi-selector group `.edp-save-btn, .edp-share-btn, .edp-calendar-btn` at `design-system.css:1184–1186` (with companion `:hover` 1202–1207 and `:focus-visible` 1209–1214). Correct execution: the new `<summary>` carries BOTH `cal-disclosure__summary` AND `edp-calendar-btn` classes; the baseline inherits via the existing design-system.css group — no per-component CSS duplication, no per-template CSS.

3. **`getAthensTimezone` path drift.** Pre-brief cited `src/utils/quality-gates.ts` as the home. Step 2 grep (`grep -rn 'getAthensTimezone' src/`) located it at `src/enrichment/quality-gates.ts:881`. Cross-directory drift, not just line-number drift. Import path corrected to `../enrichment/quality-gates` before the consumer was written.

**Pattern T = recon-claimed-shape vs. actual-source-shape divergence**, caught at Step-0 consumption. In all three cases above, the recon's CONCLUSION (inherit-don't-relist; isolate-is-per-component; reuse-existing-TZ-math) was correct — the recon's IMPLEMENTATION SHAPE was off. Two-day windows of categorizer-track commits between recon and execution introduce this drift class regularly. Pattern T is distinct from the brief-vs-reality / vocabulary-misframe ledger above: that tracks VOCABULARY drift ("X was Y before edit Z"); Pattern T tracks STRUCTURAL drift (where code lives, what shape it has).

**Mitigation in plan template:** Step 0 "Re-verify recon targets" block embedded in every brief that depends on line-anchored recon. **Trust the grep, not the recon's line numbers; if a target is GONE or refactored, STOP and report — parallel track may have touched it.** This pattern's three-instance signal in a single brief raised executor confidence enough to silently reconcile (correct call here — drift was small, the recon's conclusion preserved), but the boundary between silent-reconcile and stop-and-flag is "does the conclusion still hold". If the recon's CONCLUSION breaks under new shape, escalate; if only the path/line breaks, ground at consumption and proceed.

**Connects to:** `decisions.md` → 2026-05-21 "Calendar disclosure: build-time static targets replace client-side .ics Blob" (the work where Pattern T was triple-caught); `patterns.md` above → "Executor ledger — brief-vs-reality / vocabulary-misframe" (sibling pattern, different drift class).

### Slug-keyed override seam at the hub-page capsule render site (S151, 2026-05-23)

**First slug-keyed branch in `src/generators/hub-page.ts`.** Cornerstone variation in this codebase had been **config/data-driven, not strategy-driven** — a single `cornerstone: boolean` flag in `HubConfig` toggles 3 surfaces (Editor's Pick column at L423, cross-links at L498, `@graph` envelope at L542). No `switch (config.slug)`, no slug-keyed dispatcher, no renderer registry. All cornerstones (`today`, `this-weekend`, `concerts`, `theater`, `exhibitions`, `classical-music`, `kids`, etc.) shared one render path with variation expressed entirely through config fields plus pure data.

S151 introduced the first slug-gated branch — a tight `if (config.slug === 'this-weekend' && locale === 'en')` at the capsule render site (~L319) that swaps the `resolveTokens(rawCapsule)` text for a computed `buildWeekendCapsule(...)` output. All other slugs and the EL path fall through unchanged.

**Why the branch, not a registry:** demo-week scope. A registry refactor (mapping slugs → renderer functions) is the right abstraction once 2+ cornerstones need overrides; one cornerstone with a literal-string capsule doesn't justify the abstraction overhead. Three-similar-lines is still better than premature abstraction. When the second cornerstone needs an override (next sprint, candidate: `today` or `concerts`), promote the branch to a registry — but only then.

**Connects to:** `decisions.md` → 2026-05-23 "Weekend capsule architecture" (the consumer of this pattern); recon trace in plan `/Users/chrism/.claude/plans/session-goal-shiny-candy.md` Step 0 (Recon-1 surfaced the absent seam).

### Event-vs-raw-row selector — sort directly on Event camelCase fields (S151, 2026-05-23)

GEO's "raw rows" framing in the S151 brief was an instruction NOT to build a `scoreRichness`-style scorer on `Event[]`. The codebase has two distinct scoring axes that don't compose: **editorial rank** (hand-authored in `config/editorial-content.json`, queried via `getFeaturedPickRank(eventId, currentDate)` at `src/utils/editorial-content.ts:116-134`, date-windowed; drives the ★ comparison-table column on cornerstone hubs) vs. **algorithmic richness** (`scoreRichness(row)` at `src/quality/richness-scorer.ts:49`; operates on RAW DB ROWS in snake_case, used by dedup to pick "winners"). The renderer sees the typed `Event` (camelCase: `startDate`, `id`, `title`) — calling `scoreRichness` from `hub-page.ts` would need a row-shape adapter for no good reason.

For `buildWeekendCapsule`'s example selector ("first two by chronological order"), the correct shape is a total-order sort directly on Event fields: `[...events].sort((a,b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))`. Three-key total order makes the example selection **reproducible across builds with the same event set** — same `startDate` ties broken by title, same title broken by id (unique). No randomness, no time-of-build skew. Important for cache-invalidation hashing (`data/event-set-hashes.json`).

**Lesson:** when a brief uses framing that implies a particular code shape ("raw rows scorer"), Step 0 verification on the surface that consumes it tells you what the brief actually wants. The S151 selector spec `start_date ASC → title ASC → id ASC` was in DB-column-name form; the consumer was the typed `Event[]` — 1:1 translation to camelCase, no scorer needed. Pattern-T-class divergence between the brief's *frame* and the consumer's *type shape*.

**Connects to:** `decisions.md` → 2026-05-23 "Weekend capsule architecture"; `patterns.md` → Pattern T (same drift class — recon-frame vs. consumer-shape).

### Path-D h1Override — param-threading over html.replace splice (S151, 2026-05-23)

S151 added an optional 9th positional param `h1Override?: string` to `renderPage` (`src/templates/page.ts:69`), consumed at the `<h1>` emission site (`:159` → `${h1Override ?? title}`). Threaded from `hub-page.ts:339` only when `config.slug === 'this-weekend' && locale === 'en'`; everywhere else falls through to the `metadata.title` path (which is itself `buildPageTitle(filters)` — Greek-only today, see open known-issue).

**Why a param, not an html.replace splice.** The capsule itself uses `html.replace(/<title>[^<]*<\/title>/, ...)` at `hub-page.ts:360` to override `<title>` post-render. That's the legacy pattern the codebase is migrating *away from* — the "Path D, 2026-05-19" comment at `hub-page.ts:314-317` records the prior `html.replace('</header>', …)` capsule-splice as wrong-anchored (it matched site-header's `</header>` not page-header's). Path D = thread the override through `renderPage` as a typed param, consumed at the emission source.

Adding a new `html.replace('<h1>...', ...)` splice for the H1 would have been faster but doubled-down on the deprecated pattern in the same file the migration is actively pulling away from. The 9th-positional-param shape matches existing precedent (`preFilterBarHtml`, `hubIdentity` already use this pattern); refactoring `renderPage` to an options-object signature is correct eventually but out of session scope.

**The broader `buildPageTitle` localization gap is queued as a known-issue, not fixed here.** Every EN hub except `/en/this-weekend` (now patched via `h1Override`) renders a Greek H1 because `formatTimeRange` in `src/utils/urls.ts:22` only has Greek values. Full fix = thread `locale` into `buildPageTitle` and add an English map — larger blast radius (every EN hub).

**Connects to:** `decisions.md` → 2026-05-23 "Weekend capsule architecture" (calls out h1Override as the minimal-patch decision); `patterns.md` → 2026-05-19 Path-D anchoring (the deprecated `html.replace` pattern this entry's choice avoided).

### Infrastructure invariant unmasked sitewide defect — canonical-must-be-200 (S153, 2026-05-23)

**The discovery.** S153's brief was scoped to **one URL** (`/en/this-weekend`): canonical declared the no-slash form, Netlify served a 301 to the slash form, Bing refused to index. Fix the cornerstone, unblock the Perplexity-via-Bing demo bet. Step 0 verification confirmed event pages and venue pages already emitted slash-form *canonical in HTML* (`event-page.ts:437`, `venue-page.ts:201`), so scope locked to "hub-only + sitemap + IndexNow normalization."

When the new `dist-canonical-parity` invariant was wired into `generate-site.ts` after `generateSplitSitemaps`, it red-built on **3181 violations**: 3146 event sitemap entries + 35 venue sitemap entries, all directory-served pages declared in the *sitemap* as the no-slash 301-source form. The canonical-in-HTML was already correct (Step 0 verified); the **sitemap inflow** was wrong everywhere. `event-page.ts:841` pushed `events/${slug}` (no slash), `venue-page.ts:362` pushed `venues/${venue.slug}` (no slash) — both pages serve at directory layout (`dist/events/${slug}/index.html`, `dist/venues/${slug}/index.html`), so the sitemap was declaring 3181 URL forms that Netlify 301s. Bing was being told "canonical → 301" for essentially the entire site, not just the cornerstone.

**The pattern.** **Content-level fixes catch one URL; infrastructure-level invariants catch the class.** The brief, the recon agents, the GEO Strategist's ruling, and the planner's analysis all converged on "EN hub only — event/venue pages are clean." Three rounds of human verification all missed the sitemap-inflow path because the bug was on a *different surface* than the one being investigated (sitemap loc, not canonical HTML). Only the unconditional, walks-every-file validator surfaced it.

**Why this works structurally.** The invariant doesn't care about *which* surface emits the URL — it walks `dist/`, extracts every declared canonical from HTML and every `<loc>` from sitemaps, and asserts the declared form matches the backing file's on-disk layout. Whether the wrong form came from hub-page.ts, event-page.ts, venue-page.ts, or a future emitter not yet written, the validator catches it. The bug class is *declared ≠ served*; the invariant codifies the class, not any particular instance.

**Why the brief missed it.** Step 0 grep was `grep -rn "canonical\|og:url" src/generators/event-page.ts src/generators/*sitemap*` — focused on the *canonical/og:url* axis. Event canonical was slash; verdict "clean." But the *sitemap inflow* (where event URLs become sitemap `<loc>`s) lives in `generate-site.ts:598 generatedUrls.push(...eventPageUrls)` and the upstream `urls.push(urlPath)` at `event-page.ts:871` — none matched the Step 0 grep pattern. Pattern-recognition-by-keyword cannot enumerate every emitter; only walking the artifact (dist/) can.

**Standing rule.** When fixing a URL-form bug, write the **build invariant first**, let it red-build, then fix what it surfaces. Don't pre-scope the blast radius from recon alone — recon enumerates the emitters you can name, the invariant enumerates the emitters that *exist*. The two diverge.

**Cousin patterns:**
- Schema validator (Tier 1 in `.claude/CLAUDE.md`) is the same shape on a different axis (JSON-LD field completeness). Both walk every page; both fail the build on any violation; both have no allowlist.
- Pattern T (recon-frame vs. consumer-shape, 2026-05-23 weekend-capsule entry) is the *instance* version of this same drift class: recon spoke about "raw rows" but the consumer was typed `Event[]`. Here recon spoke about "canonical" but the latent surface was "sitemap loc."

**Connects to:** `decisions.md` → 2026-05-23 "Per-URL declared-equals-served parity" (the rule the invariant codifies); `mistakes.md` → 2026-05-23 "Sitemap no-slash push shipped silently for unknown duration" (the latent bug history this caught); existing memory `feedback_verify_paths_in_briefs.md` series (the executor-side discipline — the invariant is the build-side counterpart).

### Both-exist shadowing — Netlify Pretty URLs disambiguation (S153, 2026-05-23)

When both `dist/PATH/index.html` AND `dist/PATH.html` exist on disk, **Netlify serves the flat-file at `/PATH` (200) and 301s `/PATH/` → `/PATH`** — flat file wins. Empirically confirmed during S153 probes: `dist/this-weekend.html` and `dist/this-weekend/all/index.html` both exist; `curl https://agentathens.com/this-weekend` → 200, `curl https://agentathens.com/this-weekend/` → 301.

The `dist-canonical-parity` invariant does NOT detect this case. It checks whether the *expected* backing file exists, not whether a *shadowing* file wins over it. If a future page declares `/PATH/` while a `dist/PATH.html` shadow exists, the validator passes (PATH/index.html exists), but Netlify will 301 `/PATH/` → `/PATH`. Same bug class the invariant was built to catch, latent in the edge case.

**Not a current-codebase case.** No EN hub or directory-served surface has a shadowing flat file today (the EN-side and EL-side use disjoint path namespaces — EN under `dist/en/`, EL at `dist/` root). The class is latent, documented in `dist-canonical-parity.ts` with a `// LATENT:` inline comment.

**Mitigation paths (post-demo, not closed):**
- Extend the invariant to also check for inverse-form file existence and fail when both forms exist.
- Build-time prune: enforce mutual exclusion at write time (last-writer-wins detection in `writeHtmlIfChangedSync`).

**Connects to:** `decisions.md` → 2026-05-23 "Per-URL declared-equals-served parity" (Latent gaps section); `dist-canonical-parity.ts` source LATENT comment.

### Coextensive-chrome pattern — feature lives where the nav lives (S154, 2026-05-24)

**Context.** Adding a feature (the colophon "About me" dialog) that must reach every page in the site, including the 404. Two architectural options:

- **Option B (fan-out):** identify every generator that emits a page (5 in this codebase: page.ts, content-page.ts, event-page.ts, venue-page.ts ×2 sites), import the new feature into each, and call it at each injection point. Cheaper if the feature is heavy and only some pages should pay the weight.
- **Option A (coextensive):** put the feature inside `src/templates/site-chrome.ts` itself, riding with the existing `renderSiteNav` and `renderHamburgerScript` returns. The fan-out happens by construction — every caller of site-chrome (6 in this codebase, including the 404 page) gets the feature automatically.

**Standing rule.** When a feature must reach *every* nav-bearing page and the weight is small, default to Option A. The "single edit, automatic fan-out" property is structurally stronger than "five edits, manually maintained list" — the latter has a hidden assumption (the set of generators is closed) that the former does not. New page types added later automatically inherit. Test exists at `src/templates/__tests__/colophon.test.ts` asserting `renderSiteNav()` output contains both the trigger and the dialog markers; if a future refactor accidentally pulls the dialog out of site-chrome, the test red-builds before deploy.

**Why this beats the obvious "renderColophonChrome() called by every caller" sibling.** That sibling looks like Option A but is actually Option B in disguise — it requires every generator to opt-in. The genuine Option A appends to `renderSiteNav`'s and `renderHamburgerScript`'s return values, so callers don't change at all and the coextensiveness is enforced by string concatenation, not by convention.

**Concrete shape used this session:**
- Trigger HTML inserts inline inside `renderSiteNav()` between the search button and the hamburger button.
- Dialog markup appends to `renderSiteNav()`'s return string after `</header>` (sibling of the header, in body).
- Behavior script appends to `renderHamburgerScript()`'s return string after its own `</script>` (two adjacent script tags, end of body).
- Net edits: one file (`site-chrome.ts`), four edits inside it (import, trigger insert, dialog append, script append). Six generators unchanged.

**Cousin pattern (single-source content fanning to multiple surfaces):** `src/templates/colophon.ts` exports one `renderColophonContent()` consumed by BOTH the dialog (via `renderColophonDialog()`) AND the mirror page (via `contentPagePairs` entry in `generate-site.ts`). Editing the "over 3,800 static pages" figure once updates the dialog on every page AND the `/en/colophon/` page atomically — no drift possible. Tests assert the floor-claim marker appears in both render paths.

**Connects to:** `decisions.md` 2026-05-24 "Colophon emit strategy"; `src/templates/colophon.ts` source.

### Decode at the chokepoint, not at every entry (S154, 2026-05-25)

**The pattern.** When a transformation must apply to every value of a class (every venue name, every URL, every monetary amount), there are two valid placements: at every entry where the value originates (N scrapers, N importers), or at the next downstream chokepoint they all flow through (1 ingest function, 1 normalizer, 1 DB insert path). The chokepoint placement is almost always lower-blast-radius — *unless* there are multiple chokepoints, in which case Guard 6 forces an honest count.

**S154 instance.** Eight TypeScript scraper functions in `scripts/scrape-all.ts` (more.com, athinorama.gr, clubber.gr, ticketservices.gr, halfnote.gr, residentadvisor, snfcc internal, plus benaki/onassis/megaron via their own helpers) all converge on `src/db/database.ts:197 upsertEvent` as their write path. Decoding HTML entities at the upsertEvent entry — one function, one edit, one comment block — covers all 8+ scrapers transitively. The alternative (8+ per-scraper decoders) would have been 8× the surface, 8× the test coverage, and 8× the risk of a future scraper forgetting to call the decoder.

**Why this beat the obvious alternative.** The naive "fix it at the scraper" instinct comes from the principle "fix bugs at their source." That principle applies when there's *one source*. When there are N sources sharing one downstream — and the downstream is the ground truth (the DB) — fix at the downstream and the N sources become irrelevant. The DB is authoritative; everything before it is input data.

**Critical property: the chokepoint must be BEFORE any consumer that depends on the transformation.** In S154, `isAthensEvent` (the location-filter call inside upsertEvent at `:199`) reads `event.venue.name`. If the decoder ran AFTER isAthensEvent, the filter would receive the entity-encoded form and fail to match. Decoder placement at function-entry line `:197` (before `:199`) is load-bearing — not just "somewhere in upsertEvent."

**Guard 6 (shotgun-surgery) enumeration.** Three production INSERT paths exist:
1. `src/db/database.ts:197 upsertEvent` — main chokepoint (this is where the decoder lives)
2. `scripts/scrape-ai-tech.ts:1028` — bypass, but venue names are ASCII English (low entity-encoding risk by domain)
3. `scripts/scrape-snfcc.ts:567` — bypass, but venue name is hardcoded literal (zero entity risk)

Plus one homonym: `src/ingest/email-ingestion.ts:322` *also* named `upsertEvent`, partial-dead code, schema-divergent. Out of scope, logged in `known-issues.md`.

**When the chokepoint pattern fails.** If two chokepoints exist and they're both load-bearing (both must apply the transformation), you've fragmented the canonical form. S154 escaped this because the bypass paths carry no real entity-encoding risk by data shape — so "decode at the main chokepoint, skip bypasses" is honest. If athinorama events ever route through scrape-ai-tech (a hypothetical bypass) the decode would miss them. The mitigation isn't an allowlist; it's *the invariant on the dist artifact* (which S153's `dist-canonical-parity` invariant doesn't catch this class — venue-name validity isn't URL-shape validity — but the same principle applies: any downstream validator that checks decoded-form-equals-served-form would catch it).

**Cousin patterns:**
- `decisions.md` 2026-05-23 "Per-URL declared-equals-served parity" — same chokepoint logic at the dist-artifact validation level rather than the ingest level.
- `patterns.md` "Infrastructure invariant unmasked sitewide defect — canonical-must-be-200" (2026-05-23) — when content-level scoping misses class-wide bugs; chokepoint-at-validator is the cousin discovery mechanism.

**Connects to:** `mistakes.md` 2026-05-25 "HTML-entity decode at ingest was symptom-patched ≥1 prior session" (the recurrence that motivated this entry); `src/utils/decode-html-entities.ts` (the implementation); `src/db/database.ts:197` (the chokepoint).

### Locale-threading reaches all siblings + all call sites (S155, 2026-05-25)

**Pattern.** A shared renderer split across sibling functions (`renderSiteNav` / `renderHamburgerMenu` / `renderSiteFooter` in `site-chrome.ts`) only becomes locale-correct when the `locale` param is threaded into **every sibling AND every call site** in one pass. Partial application is worse than none: `renderSiteNav` had `locale` but the siblings didn't, and call sites invoked them bare (defaulting `'el'`) — so English pages rendered Greek nav with *no error*, just silent wrong output. This is the dual of the coextensive-chrome pattern (S154): there the property was "the element appears wherever chrome renders"; here it's "the locale flows wherever chrome renders."

**Mechanics that made the fix bounded.** Every English page funnels nav through exactly two forwarding points — `renderPage` (page.ts) and `renderContentPage` (content-page.ts) — both of which already *held* `locale` but dropped it when calling chrome. Hubs route through `renderPage` (hub-page.ts:721 passes locale); content pages through `renderContentPage`; event pages directly. So the whole class was fixable at: 2 sibling signatures + ~5 call-site files. **Verification invariant:** `grep -rn 'renderSiteNav()\|renderHamburgerMenu()\|renderSiteFooter()' src/` → 0 bare (argument-less) calls.

**Counterpart-aware link emission.** Where an English counterpart page does not exist, the locale-aware nav must *hide* the link, never point an English label at Greek content and never link a path that 404s. Applied here: Venues omitted on EN (no `/en/venues/`); home → evergreen `/en/this-week/` (no `/en/` homepage, `/en/today/` date-conditional). Same hide-where-absent rule a future language toggle would need.

**Cross-references:** `mistakes.md` 2026-05-25 "Nav locale-awareness — five reusable lessons"; `patterns.md` 2026-05-24 "Coextensive-chrome pattern" (the sibling pattern); `decisions.md` 2026-05-25 "Nav locale routing"; `src/templates/site-chrome.ts`.

### Enumerate chrome surfaces by OUTPUT, not by name (S156, 2026-05-25)

When localizing a shared shell, the failure mode is scoping the work to the components you can name. S155 fixed the nav trio; S156 found `filter-bar.ts` and `search-overlay.ts` still leaking Greek on `/en/` — same class, missed because the completeness check was "grep the known function names" instead of "grep the rendered output for the wrong-locale script."

**The reliable completeness check:** build an `/en/` page and grep its HTML for Greek characters — `grep -oE '[Α-Ωα-ω]{2,}' dist/en/<hub>/index.html | sort -u`. Every hit is a leak, regardless of which component emitted it. This is component-agnostic and catches the surface you forgot exists. (The reciprocal — Latin labels on a Greek page — is rarer but the same idea.)

**Connects to:** `mistakes.md` 2026-05-25 "Locale-aware chrome was not a complete set"; the coextensive-chrome pattern (S154) — anything coextensive with the shell must be locale-aware with it.
