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
