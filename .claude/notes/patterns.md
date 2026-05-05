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
