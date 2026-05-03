# Sprint 2 Component B Pre-Flight — Place-Layer Infrastructure Map

**Date:** 2026-05-03
**Scope:** Read-only verification of place-layer infrastructure for Sprint 2 Component B (place-layer schema completeness validator + Tier 1 venue `sameAs` WARN-fallback path).
**Discipline rule activation:** Cross-Project rule (2026-05-02) — verify against `src/` before Dev Planner publication. Mirrors `component-a-preflight.md` structure.
**Method:** Pure observation. Zero edits to `src/`, `config/`, or `tests/` during this pre-flight.

---

## ⚠️ TL;DR — Plan-blocking findings

Three findings need Strategist resolution before Component B's session plan is authored:

1. **The "drop sameAs into config = zero code change" assumption is WRONG.** Both `src/generators/venue-page.ts:64-77` and `src/generators/event-page.ts:170+` build their Place schema as a literal that does NOT read `sameAs` from venue records. Adding sameAs requires:
   - Add `sameAs?: string[]` field to `VenueRecord` (`src/ticketing/venue-registry.ts:25-33`)
   - Add `sameAs?: string[]` field to `Venue` interface (`src/types.ts:83-93`)
   - Wire athens-venues.json → `event.venue.sameAs` attach in `src/generate-site.ts:218-222` (mirror existing `venue.website` attach)
   - Emit `sameAs` in BOTH `venue-page.ts` LocalBusiness builder AND `event-page.ts` location builder
   This is a Component B implementation scope item, not a downstream paste.

2. **A naive `location.sameAs missing → WARN` check would crater the pass rate from 97% → ~3%.** Currently 7,734/7,973 pages PASS. If Component B adds sameAs as an unconditional WARN, virtually every currently-passing event page flips to WARN (since 0/408 venues in `config/athens-venues.json` have `sameAs` populated). Component B needs strategist-locked scoping: Tier-1-only WARN, INFO-level severity until coverage is meaningful, or accept a re-baselined metric. **Recommended (deferring to Strategist): INFO-level for sameAs until ≥X% venue coverage, then promote to WARN per ratchet pattern.**

3. **Place schema emits from at least 5 sites with divergent shapes.** Validator must inspect all of them or undercount:
   - `src/templates/page.ts:415,442,445` — Place + PostalAddress literals (used by hub-page + event-page via inclusion)
   - `src/utils/schema-geo.ts` — `buildPlaceLevel()` builder (geo hierarchy, sameAs-populated to Wikidata)
   - `src/generators/venue-page.ts:84` — emits its OWN Place block (does NOT call templates/page.ts)
   - `src/generators/event-page.ts:199` — emits its OWN GeoCoordinates inside location block
   - `src/enrichment/quality-gates.ts:69` — type annotation only, no runtime emission
   Plus a known divergence: event-page hardcodes `addressRegion: "Attica"` while venue-page uses `venue.neighborhood || "Attica"`. One source of truth needed (Q-B candidate).

Rest of the place-layer surface is in good shape: severity machinery already supports WARN/INFO/ERROR (zero arch change needed for Component B's chosen severity), Sprint 1 baseline already includes some place-adjacent checks (location.name ERROR, geo WARN, streetAddress WARN), and per-template aggregate slot is reserved in `data/build-completeness.json` as `place_level: "not_measured"` waiting to flip.

---

## Step 0 — Baseline confirmation

**Commands:**

```bash
bun test 2>&1 | tail -10
# (validator script in user's task does not exist as standalone; validator runs inside src/generate-site.ts and persists aggregate to data/build-completeness.json)
cat data/build-completeness.json
bun -e "const m = await import('./src/validators/schema-completeness.ts'); const r = m.validateAllPages('dist'); m.printSchemaSummary(r);"
```

**Test output:**
```
1853 pass
 1 skip
 0 fail
 3880 expect() calls
Ran 1854 tests across 74 files. [36.24s]
```

**Validator output (inline against existing dist/):**
```
📋 Schema completeness: 7734/7973 pages fully valid (97%)
   📊 7894 event + 24 hub + 54 venue + 1 datafeed pages
   ✅ 7734 pass  ⚠️  239 warnings  ❌ 0 errors

   Top data gaps:
     236/7973 (3%) location.geo coordinates missing
     219/7973 (3%) streetAddress is empty
     3/7973 (0%) FAQPage JSON-LD block missing
     2/7973 (0%) CollectionPage: itemListElement is empty
```

**Build artifact:** `data/build-completeness.json` (last modified 2026-05-03T05:13:58Z, today). Confirms layer surface:
```json
"layers": {
  "event_level": "measured",       // Sprint 1 / Component D
  "offer_level": "measured",       // Sprint 1 Session 3
  "place_level": "not_measured",   // ← Component B target
  "aria_level": "measured",        // Component C
  "datafeed_level": "measured"     // Component A
}
```

**Baseline holds:** 1853/0 tests, 97% pass rate, 0 errors, 239 warnings (236 events + 3 hubs). Matches user-stated expected baseline.

**Note:** User's task referenced `bun run scripts/validate-schema-completeness.ts` — that script does not exist. The validator runs inside `bun run src/generate-site.ts` (called at lines 1042–1043 of generate-site.ts) and writes its aggregate into `data/build-completeness.json`. The inline `bun -e` invocation above is the read-only equivalent. P9 below uses the same pattern.

---

## P1 — Place schema emission sites

**Initial commands (literal `@type` grep):**
```bash
grep -rn '"@type":\s*"Place"' src/ --include='*.ts' -l
grep -rn '"@type":\s*"PostalAddress"' src/ --include='*.ts' -l
grep -rn '"@type":\s*"GeoCoordinates"' src/ --include='*.ts' -l
grep -rn '"@type":\s*"Organization"' src/ --include='*.ts' -l
grep -rnE 'containedInPlace|buildContainedInPlace' src/ --include='*.ts' -l
```

Returned only:
- `@type: Place` → `src/templates/page.ts`
- `@type: PostalAddress` → `src/templates/page.ts`
- `@type: GeoCoordinates` → ZERO matches at the literal level
- `@type: Organization` → ZERO matches at the literal level
- `containedInPlace` → ZERO matches

**Initial finding was misleading** — the literal grep missed helper-generated Place schemas. Broadened grep:
```bash
grep -rnE 'buildPlace|placeSchema|geoCoordinates|GeoCoordinates|"@type":\s*"(Place|GeoCoordinates|Organization|PostalAddress|VirtualLocation)"' src/ --include='*.ts'
```

**Full enumeration of Place emission sites:**

| File | Line | Emission | Notes |
|---|---|---|---|
| `src/templates/page.ts` | 415 | PostalAddress (literal) | Used by hub-page.ts + event-page.ts via inclusion |
| `src/templates/page.ts` | 442 | Place (literal) | Same |
| `src/templates/page.ts` | 445 | PostalAddress (literal) | Same |
| `src/utils/schema-geo.ts` | 53 | `buildPlaceLevel()` builder | Returns `{@type: Place, name, sameAs (Wikidata QID), geo: {@type: GeoCoordinates, lat, lng}, containedInPlace?}` |
| `src/utils/schema-geo.ts` | 80–82, 90 | calls `buildPlaceLevel()` | Builds Greece → Attica → Athens → neighborhood chain |
| `src/utils/schema-geo.ts` | 184 (`ORGANIZATION_SCHEMA`) | Organization (literal) | Homepage-only, used by `src/generate-site.ts:31` |
| `src/generators/venue-page.ts` | 84 | GeoCoordinates literal inside its own Place block | Builds LocalBusiness directly, does NOT call templates/page.ts |
| `src/generators/event-page.ts` | 199 | GeoCoordinates literal inside event.location | Uses `buildContainedInPlace()` helper but builds the surrounding location block directly |
| `src/enrichment/quality-gates.ts` | 69 | TypeScript type annotation for GeoCoordinates | No runtime emission |

**Helper usage trace** (`grep -rn 'buildPlaceLevel\|buildContainedInPlace\|schema-geo' src/`):
- `templates/page.ts:12` imports `buildContainedInPlace, resolveEventStatus, ORGANIZATION_SCHEMA, getCountryCode, getCurrencyCode`
- `enrichment/quality-gates.ts:15` imports `getCountryCode, getCurrencyCode`
- `generators/venue-page.ts:21` imports `buildContainedInPlace, getCountryCode`
- `generators/event-page.ts:25` imports `buildContainedInPlace, resolveEventStatus, getCountryCode, getCurrencyCode, availabilityForEventStatus`
- `generate-site.ts:31` imports `ORGANIZATION_SCHEMA`

**Boundary check (per user task):**

| Expected emitter | Actual? | How |
|---|---|---|
| hub-page.ts | ✓ via inclusion | Uses templates/page.ts which emits Place + PostalAddress |
| venue-page.ts | ✓ direct | Builds its own LocalBusiness with PostalAddress + containedInPlace + GeoCoordinates |
| event-page.ts | ✓ direct + helper | Builds location.MusicVenue with PostalAddress + GeoCoordinates inline; uses `buildContainedInPlace()` for hierarchy |
| search-index.ts | ✗ no Place emission | Confirmed via grep — list items are minimal, no Place |
| sitemap (`src/sitemap/generate-sitemaps.ts`) | ✗ no Place emission | Confirmed via grep |
| schema-geo.ts | ✓ central helper | `buildPlaceLevel()` is the only source of geo-hierarchy Place blocks; `ORGANIZATION_SCHEMA` is the only Organization emission |

**Validator coverage cross-ref (vs P3):** Validator inspects event-page (`validateSchemaCompleteness`), hub-page (`validateHubSchema`), venue-page (`validateVenueSchema`), and DataFeed (`validateDataFeed`). All 5 emission sites are covered transitively. The DataFeed at `/api/events.json` also wraps per-event JSON-LD and so transitively includes Place blocks — Component B should decide whether DataFeed Place coverage gets its own check or inherits the per-event check.

---

## P2 — Current Place shape (rendered JSON-LD samples)

### Event detail page sample
Path: `dist/events/030d1241-onassis-stegi-stegi-radio-takeover-2026/index.html` (Onassis Stegi MusicEvent)

```json
{
  "@context": "https://schema.org",
  "@type": "MusicEvent",
  "name": "STEGI.RADIO TAKEOVER 2026",
  "startDate": "2027-02-13",
  "eventStatus": "https://schema.org/EventScheduled",
  ...
  "location": {
    "@type": "MusicVenue",
    "name": "Onassis Stegi",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Leof. Andrea Siggrou 107-109, Athens 117 45",
      "addressLocality": "Athens",
      "addressRegion": "Attica",
      "addressCountry": "GR"
    },
    "containedInPlace": {
      "@type": "Place",
      "name": "Municipality of Athens",
      "sameAs": "https://www.wikidata.org/wiki/Q1524",
      "geo": { "@type": "GeoCoordinates", "latitude": 37.9838, "longitude": 23.7275 },
      "containedInPlace": {
        "@type": "Place",
        "name": "Attica",
        "sameAs": "https://www.wikidata.org/wiki/Q178517",
        "geo": { "@type": "GeoCoordinates", "latitude": 37.9908, "longitude": 23.7033 },
        "containedInPlace": {
          "@type": "Place",
          "name": "Greece",
          "sameAs": "https://www.wikidata.org/wiki/Q41",
          "geo": { "@type": "GeoCoordinates", "latitude": 39.0742, "longitude": 21.8243 }
        }
      }
    },
    "geo": { "@type": "GeoCoordinates", "latitude": 37.954, "longitude": 23.7404 }
  },
  ...
}
```

### Venue page sample
Path: `dist/venues/onassis-stegi/index.html`

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Onassis Stegi",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Leof. Andrea Siggrou 107-109, Athens 117 45",
    "addressLocality": "Athens",
    "addressRegion": "Neos Kosmos",
    "addressCountry": "GR"
  },
  "url": "https://agentathens.com/venues/onassis-stegi/",
  "containedInPlace": { /* Same Athens → Attica → Greece chain as above */ },
  "geo": { "@type": "GeoCoordinates", "latitude": 37.954, "longitude": 23.7404 },
  "event": [ /* up to 10 upcoming events with @type, name, startDate, url */ ]
}
```

### Place vocabulary field presence

| Field | Event-page location | Venue-page LocalBusiness | Notes |
|---|---|---|---|
| `name` | ✓ | ✓ | Both required |
| `address.streetAddress` | ✓ | ✓ | |
| `address.addressLocality` | ✓ "Athens" | ✓ "Athens" | |
| `address.addressRegion` | ⚠️ "Attica" (HARDCODED) | "Neos Kosmos" (uses neighborhood) | **Divergence — Q-B candidate** |
| `address.addressCountry` | ✓ "GR" | ✓ "GR" | Single source: `getCountryCode()` |
| `containedInPlace` | ✓ full hierarchy | ✓ full hierarchy | Both via `buildContainedInPlace()` |
| `geo` (GeoCoordinates) | ✓ when coords known | ✓ when not generic Athens center | venue-page omits geo if coords match generic 37.9838/23.7276 fallback (`venue-page.ts:80-87`) |
| `url` | ✗ MISSING (location.url) | ✓ url | Event-page location lacks venue page URL link |
| `sameAs` | ✗ MISSING (the Tier-1 target) | ✗ MISSING | **Component B target** |
| `image` | ✗ | ✗ | |
| `telephone` | ✗ | ✗ | |
| `hasMap` | ✗ | ✗ | |
| `identifier` | ✗ | ✗ | |
| `branchOf` | ✗ | ✗ | |
| `openingHours` | ✗ | ✗ | |

**Important asymmetry:** Of 408 venues in `config/athens-venues.json`, only **1 (Onassis Stegi)** has a standalone venue page in `dist/venues/`. Megaron, Benaki, Zappeion etc. have NO venue page — their place-layer signal lives ONLY in event-detail location blocks. Reason unverified (likely venue-page.ts requires `venue.address` which most venue records lack). This means Component B's place-layer aggregate is dominated by event-page surface area, not venue-page.

Verification: `ls dist/venues/ | wc -l` returns 54 venue pages (matches build-completeness.json). The 408−54 = 354 venues have no standalone page even though they have config records; their place schema appears only embedded in event-detail location blocks.

---

## P3 — Validator architecture

**File:** `src/validators/schema-completeness.ts` (545 lines)
**Companion:** `src/validators/completeness-reporter.ts` (233 lines, Component D)

### Table of contents (functions exported / internal)

| Lines | Symbol | Role |
|---|---|---|
| 19–29 | `SchemaValidationResult` interface | `{slug, errors[], warnings[], info?[]}` — ERROR / WARN / INFO tiers |
| 31–37 | `SchemaValidationSummary` interface | `{total, passCount, warnCount, failCount, details[]}` |
| 42–50 | `extractJsonLd()` | Single-block JSON-LD extractor |
| 55–57 | `isNonEmpty()` | String guard |
| 62–65 | `isPlaceholder()` | Detects 'tba'/'unknown'/'n/a'/'tbd'/'none' |
| 70–229 | `validateSchemaCompleteness()` | **Per-event-page validator** — mandatory + data-quality + placeholder checks |
| 234–246 | `extractAllJsonLd()` | Multi-block extractor (hubs have CollectionPage + FAQPage) |
| 251–313 | `validateHubSchema()` | **Per-hub-page validator** — CollectionPage + FAQPage |
| 318–342 | `validateVenueSchema()` | **Per-venue-page validator** — LocalBusiness |
| 356–386 | `validateDataFeed()` | **Per-DataFeed validator (Sprint 2 Component A)** — `datafeed:events` slug prefix |
| 391–484 | `validateAllPages()` | Orchestrator: walks `dist/events/`, `dist/en/events/`, `dist/{HUB_SLUGS}.html`, `dist/en/{slug}/`, `dist/venues/`, then DataFeed |
| 489–545 | `printSchemaSummary()` | Console output: top errors + top 5 warnings by frequency |

### Severity machinery (already supports WARN/INFO/ERROR cleanly)

```typescript
// src/validators/schema-completeness.ts:19-29
export interface SchemaValidationResult {
  slug: string;
  errors: string[];     // ERROR — counts as failCount, page is FAIL
  warnings: string[];   // WARN — counts as warnCount, page downgrades to WARN
  info?: string[];      // INFO — surfaced for awareness, not blocking, not warning
                        // Per Strategist 2026-04-29: offers.url is INFO when omitted
}
```

The `info[]` tier is the precedent for "legitimate omission" cases. **Component B can use INFO for sameAs at non-Tier-1 venues without architectural change.**

### Existing place-adjacent rules (Sprint 1 baseline)

The validator already inspects some Place fields. Component B is *extending*, not creating from scratch.

| Line | Severity | Rule | Scope |
|---|---|---|---|
| 117–120 | ERROR | `location.name` missing or empty | event-page |
| 195–197 | WARN | `location.address.streetAddress` empty | event-page |
| 200–202 | WARN | `location.geo` missing | event-page |
| 219, 222–225 | WARN | `streetAddress` placeholder ('tba' etc.) | event-page |
| 333 | ERROR | `@type` is not "LocalBusiness" | venue-page |
| 334 | ERROR | `name` missing | venue-page |
| 335 | ERROR | `address` missing | venue-page |
| 338 | WARN | `geo coordinates missing` | venue-page |
| 339 | WARN | `url` missing | venue-page |

### D/A/C structural pattern (for B to mirror)

Component A's `validateDataFeed()` (lines 356–386) is the cleanest precedent for adding a new layer:
- Standalone validation function with its own slug-prefix (`datafeed:events`)
- Reads from the dist/ filesystem (in A's case the DataFeed file; B reads dist/events/{slug}/index.html which is already done)
- Integrated into orchestrator at line 467: `details.push(validateDataFeed(distDir));`
- Reporter routes the slug-prefix into a dedicated bucket (Component D)

Component B has TWO defensible structural shapes (Q-B candidate):
- **Shape 1 (extend existing checks):** Add place-vocab WARN/INFO checks inside `validateSchemaCompleteness()` for event-page location and inside `validateVenueSchema()` for venue-page. Reporter slot stays at `place_level` flag flip from "not_measured" → "measured".
- **Shape 2 (new standalone function):** Add `validatePlaceCompleteness(htmlContent, slug)` mirroring `validateDataFeed()` shape. Returns its own `SchemaValidationResult` rows with `place:{slug}` prefix. Reporter aggregates as a separate dimension.

**Confirm/refute hypothesis:** Place layer is currently NOT measured at the `place_level` aggregate flag. But place-adjacent fields ARE inspected at the per-page level (5 rules listed above). Component B's job is to (a) extend the per-page place checks AND (b) flip the layer flag.

---

## P4 — Sprint 2 D/A/C component pattern reuse

**Commit map (newest first):**

| SHA | Date | Component | Title |
|---|---|---|---|
| `addeb9230` | 2026-05-03 | C closeout | sprint-2-session-4 closeout: session log + decisions + patterns |
| `98db28207` | 2026-05-03 | **C** | sprint-2-session-4: ARIA audit + reporter integration (Component C) |
| `118bc810c` | 2026-05-03 | **A** | sprint-2-session-3: /api/events.json Schema.org DataFeed (Component A) |
| `b6274644b` | 2026-05-03 | **D** | sprint-2-session-2: per-EventType schema completeness reporter (Component D) |

**Per-component delta summary** (from `git show --stat` commit messages, full text in decisions.md):

- **Component D** (commit `b6274644b`): Splits aggregate "Schema completeness X/Y" surface into per-EventType bucket report. Validator unchanged. Adds `data/build-completeness.json` artifact. Locks layered surface contract: `event_level + offer_level marked "measured"; place_level + aria_level marked "not_measured"`.
- **Component A** (commit `118bc810c`): Adds `validateDataFeed()` to validator (lines 356–386). Adds `src/generators/datafeed.ts`. Refactors `generateEventSchema` into `buildEventSchemaObject` + thin stringifier. Adds discovery via `<link rel="alternate" type="application/ld+json">` in templates/page.ts and llms.txt bullet.
- **Component C** (commit `98db28207`): Adds `scripts/audit-aria.ts` (Pa11y-based, 4-way concurrency). Writes `data/build-aria-report.json` (per-page) + `data/build-aria-aggregate.json` (per-template). Reporter consumes aggregate via `existsSync` gate. Per-template aggregation locked by Q-C1 (see P7).

**Per-template aggregate pattern (the C precedent — locked by Q-C1):**

From `src/validators/completeness-reporter.ts` (per Component D + C integration):
```
aria.hub_template:   { total, pass, warn, fail }  // all dist/*.html top-level pages
aria.event_template: { total, pass, warn, fail }  // dist/events/*/index.html + dist/en/events/*/index.html
```

The C decision rationale: "ARIA findings are template-systemic, not page-systemic. A missing form-control label on event-detail repeats 7,451× across event pages — that's one finding, not 7,451 findings."

**Application to Component B:** Place-layer findings are partially template-systemic (e.g. "venue X is missing sameAs" repeats on every event at venue X) AND partially page-systemic (e.g. specific addresses are empty on individual event pages). This raises Q-B candidate: per-template, per-venue, or hybrid?

---

## P5 — Tier 1 venue `sameAs` state

**Venue config inventory:**
```
Total venues:        408
With sameAs:         0
Tier 1 (Megaron, Onassis, Benaki×3, Zappeion, Rabbithole, etc.):
                     ALL have website + ticketing where applicable; ZERO have sameAs
```

**Tier 1 venue records (excerpt from `config/athens-venues.json`):**

```json
{
  "canonical_name": "Μέγαρο Μουσικής Αθηνών",
  "variations": ["Μέγαρο Μουσικής", "Megaro Mousikis", "Athens Concert Hall", ...],
  "neighborhood": "Ilisia",
  "website": "https://www.megaron.gr",
  "ticketing": { "provider": "megaron.gr", "search_pattern": "..." }
  // NO sameAs field
},
{
  "canonical_name": "Onassis Stegi",
  "variations": ["Στέγη Ιδρύματος Ωνάση", "Στέγη", "Stegi", "Onassis Foundation"],
  "neighborhood": "Neos Kosmos",
  "website": "https://www.onassis.org",
  "ticketing": { "provider": "onassis.org", "search_pattern": "..." }
  // NO sameAs field
},
{
  "canonical_name": "Μουσείο Μπενάκη Ελληνικού Πολιτισμού",
  "variations": ["Benaki Museum", "Μουσείο Μπενάκη"],
  "neighborhood": "Syntagma"
  // NO sameAs / website / ticketing
},
{
  "canonical_name": "Μουσείο Μπενάκη - Πινακοθήκη Γουλανδρή", ...},
{
  "canonical_name": "Μουσείο Μπενάκη - Πειραιώς 138", ...},
{
  "canonical_name": "Ζάππειο Μέγαρο",
  "variations": ["Zappeion", ...],
  "address": "Leoforos Vasilissis Olgas, Athens 105 57",
  "neighborhood": "Syntagma"
}
```

**Note:** The Benaki entries fragment into THREE separate venues (Goulandris / Pireos 138 / Ελληνικού Πολιτισμού) — entity resolution non-trivial. Tier 1 sameAs would need separate Wikidata QIDs per branch (or a `branchOf` relationship to a parent organization, which is itself absent from the schema).

### Generator chain — config → JSON-LD

The chain has **three handoffs**, each of which currently DROPS sameAs because the field doesn't exist:

1. **Config:** `config/athens-venues.json` `VenueRecord` (defined at `src/ticketing/venue-registry.ts:25-33`):
   ```typescript
   export interface VenueRecord {
     canonical_name: string;
     variations: string[];
     neighborhood?: string;
     website?: string;
     ticketing?: TicketingInfo;
     // NO sameAs field
   }
   ```
2. **Runtime venue object:** `Venue` interface (`src/types.ts:83-93`):
   ```typescript
   export interface Venue {
     name: string;
     address: string;
     neighborhood?: string;
     coordinates?: { lat: number; lon: number; };
     capacity?: number;
     website?: string;
     // NO sameAs field
   }
   ```
3. **Schema builder:** Both `venue-page.ts:64-77` and `event-page.ts:170+` build the Place block as a literal that doesn't read sameAs.

**Wiring precedent already in place:** `src/generate-site.ts:218-222` shows the exact pattern Component B should mirror for sameAs:
```typescript
const { getVenueByName } = await import('./ticketing/venue-registry');
for (const event of pageableEvents) {
  const venueRecord = getVenueByName(event.venue.name);
  if (venueRecord?.website) event.venue.website = venueRecord.website;
}
```

**Strongest precedent for sameAs handling**: `src/utils/performer-sameAs.ts` already implements sameAs lookup for performers via a SEPARATE config file (`config/performer-sameAs.json`). It uses `PerformerEntry { type: 'Person'|'MusicGroup'; sameAs: string[] }` with a lowercase index for fuzzy matching. **This is a Q-B candidate**: should venue sameAs live in `config/venue-sameAs.json` (mirror performer-sameAs) or be added inline to `athens-venues.json` (mirror Tier 5 `website` pattern)?

**Refute strategist's "zero code change" assumption:** Adding sameAs requires touching 4 files at minimum (VenueRecord schema in venue-registry.ts, Venue interface in types.ts, attach loop in generate-site.ts, schema emission in venue-page.ts AND event-page.ts). This is a Component B implementation scope item.

---

## P6 — WARN-as-fallback semantics

**Existing severity model** (verbatim from `validateSchemaCompleteness` and DataFeed at lines 19–29, 184–185):
- `errors[]` → ERROR — page counts as `failCount`
- `warnings[]` → WARN — page downgrades from PASS to `warnCount`
- `info?[]` → INFO — "Surfaced for awareness; not blocking, not warning. Per Strategist 2026-04-29: `offers.url` is INFO when omitted (legitimate for listing-aggregator and venue-direct-only ticket sources)."

**Confirm: severity machinery supports sameAs WARN-as-fallback with zero arch change.** Adding a one-liner like:
```typescript
if (!isNonEmpty(location.sameAs)) warnings.push('venue sameAs missing');
```
inside `validateSchemaCompleteness` is sufficient — no new severity tier needed.

But see TL;DR finding #2: **a naive WARN check craters the pass rate.** Real options:

| Option | Pass-rate impact | Strategist consideration |
|---|---|---|
| WARN unconditionally for missing `location.sameAs` | 97% → ~3% | Catastrophic; needs re-baseline |
| WARN only for Tier 1 venues (curated allowlist in code) | 97% → ~96% | Tractable; requires "Tier 1" definition |
| INFO unconditionally | 97% unchanged | Best for surface-without-noise; aligns with offers.url precedent |
| INFO universally + WARN gate flips when ≥X% Tier 1 coverage achieved | 97% → ratchet | Aligns with "ticket_url_resolved S103" deferred-data pattern noted in D's commit message |

**Recommended (deferring to Strategist): Option 4 — INFO with ratchet.** Mirrors the "contract surface ships first, data lands later" pattern used by Component D for `place_level`/`aria_level` flags themselves.

### Current 239 warnings — sameAs/place/geo/address findings

From `printSchemaSummary` output (P9 detail):
- 236× "location.geo coordinates missing" — events
- 219× "streetAddress is empty" — events
- 0× sameAs-related findings (validator does not check sameAs today)
- 0× containedInPlace findings (validator does not check containedInPlace today)

The current 239 warnings include ZERO sameAs-related findings because the validator doesn't check it. Component B's WARN delta would be entirely additive on top of 239 (modulo currently-passing pages that flip).

---

## P7 — Q-Lock precedent (Q-A1, Q-A2, Q-C1) and draft Q-B questions

### Existing locks (from `.claude/notes/decisions.md`)

**Q-A1 (Endpoint name, locked 2026-05-02, lines ~2150–2170 in decisions.md):**
> **Decision:** Ship `/api/events.json` as additive new endpoint with full Schema.org DataFeed envelope. `/api/index.json` untouched.
>
> **Reasoning:** Two consumers, two endpoints, two semantic roles. `/api/index.json` serves alternate-link contract for JS clients. `/api/events.json` serves Schema.org DataFeed for AI agents. Breaking the alternate-link contract (reshaping `/api/index.json`) would carry silent BC risk; additive endpoint is the safe path.
>
> **Pre-flight evidence (`specs/component-a-preflight.md`):** `/api/index.json` wired into every page via alternate-link at `page.ts:127`. Existing consumers exist; zero-consumer assumption disconfirmed.
>
> **Status:** Active (mechanism shipped 2026-05-02, commit `118bc810c`).

**Q-A2 (Layer surface, locked together with Q-A1):**
> **Layer surface (per Strategist Q-A2):** new `datafeed_level` layer in `build-completeness.json`. Separate axis from `event_level` (per-event coverage) — DataFeed-specific concerns are per-feed measurements. Lumping would conflate two unrelated quality dimensions.

**Q-C1 (Aggregate granularity, locked 2026-05-03, line ~2194 in decisions.md):**
> **Decision:** Per-template aggregate in CompletenessReport slot; per-page detail in separate `data/build-aria-report.json` artifact.
>
> **Architecture:**
> - `aria.hub_template`: `{total, pass, warn, fail}` — all `dist/*.html` top-level pages
> - `aria.event_template`: `{total, pass, warn, fail}` — `dist/events/*/index.html` + EN mirror (English aggregates under same template; accessibility contract identical regardless of locale)
> - Per-page detail: `data/build-aria-report.json` keyed by URL with full Pa11y issue arrays
>
> **Reasoning:** ARIA findings are template-systemic, not page-systemic. A missing form-control label on event-detail repeats 7,451× across event pages — that's one finding, not 7,451 findings. Per-page aggregation in reporter would surface 7,451 rows of the same actionable issue (reporter noise, not signal). Per-template surfaces it as one row with count under hub_template or event_template — count gives volume, bucket gives location, team can act on a single finding.
>
> **Status:** Active (mechanism shipped 2026-05-03, commit `98db28207`).

### Draft Q-B questions (Strategist owns answers)

These mirror the Q-A/Q-C phrasing pattern. **No answers proposed.**

- **Q-B1 (Severity for missing venue sameAs):** Should missing `location.sameAs` register as ERROR / WARN / INFO at the per-event-page validator level? A naive WARN cratera the pass rate from 97% to ~3% (since 0/408 venues have sameAs in config). Options on the table: WARN unconditionally (catastrophic), WARN-only-for-Tier-1 (requires Tier 1 definition), INFO universal (no pass-rate impact, aligns with `offers.url` precedent), INFO universal + WARN ratchet at coverage threshold (mirrors S103 ticket_url_resolved deferred-data pattern).
- **Q-B2 (Aggregate granularity):** Place-layer findings have hybrid character — sameAs/website are per-venue (template-systemic across all events at venue X), but address/geo are per-event (page-systemic). Mirror Q-C1's per-template aggregate (place.event_template + place.venue_template), or introduce a new per-venue aggregate (place.byVenue[] like events.byType[]), or hybrid? What's the team's actionable surface — is "fix venue X's address" the unit of work, or "fix this event's missing geo"?
- **Q-B3 (Config storage for venue sameAs):** Should venue sameAs values live inline in `config/athens-venues.json` (mirror Tier 5 `website` pattern, single config file), or in a separate `config/venue-sameAs.json` (mirror existing `config/performer-sameAs.json` precedent at `src/utils/performer-sameAs.ts`)? Trade-off: single file = one editorial workflow; separate file = clean separation between operational venue data and identity-graph data.
- **Q-B4 (Validator structural shape):** Component B has two defensible shapes (P3 detail). Shape 1 — extend existing `validateSchemaCompleteness`/`validateVenueSchema` with new place-vocab checks; place_level flag flips. Shape 2 — new standalone `validatePlaceCompleteness()` mirroring `validateDataFeed()`, with `place:{slug}` prefix routing to a dedicated reporter bucket. Q-A precedent went Shape-2-style (datafeed got its own function). Same here, or different?
- **Q-B5 (Place vocabulary scope):** Of the absent Place fields (sameAs, image, telephone, hasMap, identifier, branchOf, openingHours, location.url-on-event-page), which become validator rules in this session vs deferred? Strategist's Tier 1 sameAs ask is the floor; ceiling is open.
- **Q-B6 (`addressRegion` divergence resolution):** Event-page hardcodes `"Attica"` (`event-page.ts:174`); venue-page uses `venue.neighborhood || "Attica"` (`venue-page.ts:69`). For Component B's checks to converge, pick one canonical interpretation: addressRegion = administrative region (Attica) and addressLocality stays "Athens" with neighborhood as separate metadata, OR addressRegion = neighborhood-level granularity. Schema.org docs allow either; consistency matters more than specific choice.
- **Q-B7 (DataFeed Place inheritance):** `/api/events.json` (Component A) wraps per-event JSON-LD which transitively includes the location/Place block. Does Component B's place-layer measurement count DataFeed Place coverage separately, inherit the per-event check, or skip DataFeed entirely (single-source-of-truth via per-event)?

---

## P8 — Test surface for Sprint 2 validators

**Test inventory:**

| File | `it`/`test` count | Scope |
|---|---|---|
| `src/validators/__tests__/schema-completeness.test.ts` | 49 | All event/hub/venue/datafeed validation rules |
| `src/validators/__tests__/completeness-reporter.test.ts` | 14 | Per-EventType bucketing + slug normalization + layer-flag behavior |
| `src/validators/__tests__/scope-filter.test.ts` | (not in scope) | Unrelated |
| `src/validators/__tests__/event-categorizer.test.ts` | (not in scope) | Unrelated |

D, A, C tests live INSIDE `schema-completeness.test.ts` (no dedicated layer-test files). The pattern is: each new rule gets its own `it('warns when X is missing', ...)` test block. ARIA tests for Component C live separately in `scripts/__tests__/` (per CLAUDE.md mention of `scripts/audit-aria.ts`).

**Proposed home for Component B tests:**

| Test category | File | Pattern |
|---|---|---|
| Per-event-page place-vocab rules (sameAs, image, etc.) | Add to `schema-completeness.test.ts` | Mirror Sprint 1 streetAddress/geo test patterns |
| Per-venue-page place-vocab rules | Add to `schema-completeness.test.ts` | Mirror existing `validateVenueSchema` tests |
| Layer flag `place_level` flip from "not_measured" → "measured" | Add to `completeness-reporter.test.ts` | Mirror existing aria_level test if present |
| Venue sameAs lookup wiring | Either `src/utils/__tests__/venue-sameAs.test.ts` (if new module created per Q-B3) OR extend `src/ticketing/__tests__/venue-registry.test.ts` (if added to existing schema) | Depends on Q-B3 answer |

**Total tests added (estimated):** 8–15 new tests, depending on Q-B5 scope answer.

---

## P9 — Place-layer warning audit (sizing the iceberg)

**Command:** Validator does not have a `--json` flag. Inline invocation captures top-warnings output:
```bash
bun -e "const m = await import('./src/validators/schema-completeness.ts'); const r = m.validateAllPages('dist'); m.printSchemaSummary(r);"
```

**Output (verbatim, 2026-05-03 evening):**
```
📋 Schema completeness: 7734/7973 pages fully valid (97%)
   📊 7894 event + 24 hub + 54 venue + 1 datafeed pages
   ✅ 7734 pass  ⚠️  239 warnings  ❌ 0 errors

   Top data gaps:
     236/7973 (3%) location.geo coordinates missing
     219/7973 (3%) streetAddress is empty
     3/7973 (0%) FAQPage JSON-LD block missing
     2/7973 (0%) CollectionPage: itemListElement is empty
```

### Warning bucketing

| Warning | Count | Place-adjacent? | Already measured? |
|---|---|---|---|
| `location.geo coordinates missing` | 236 | YES | Yes (Sprint 1) |
| `streetAddress is empty` | 219 (subset of above 236) | YES | Yes (Sprint 1) |
| `FAQPage JSON-LD block missing` | 3 | NO | Yes (hub-page) |
| `CollectionPage: itemListElement is empty` | 2 | NO | Yes (hub-page) |
| **Total page-warnings** | **239** | | |

**Of 239 current warnings, 236 (98.7%) are place-adjacent.** Place is already the dominant warning category — Component B is amplifying signal in the noisiest existing bucket.

### Component B's expected warning DELTA (estimates, depend on Q-B answers)

| New rule | If WARN universally | If WARN Tier-1-only | If INFO universally |
|---|---|---|---|
| `location.sameAs missing` (event-page) | +7,894 finding-instances; ~7,734 currently-passing pages flip to WARN; pass rate 97% → ~3% | +~50 finding-instances (Tier 1 events only); ~50 pages flip; pass rate 97% → ~96% | +7,894 finding-instances (info[]); 0 pass-rate change |
| `venue sameAs missing` (venue-page) | +54 finding-instances; ~54 venue pages flip to WARN; pass rate 97% → ~96% | +~6 finding-instances (Tier 1 venue pages); pass rate 97% (within rounding) | +54 finding-instances (info[]); 0 pass-rate change |
| `containedInPlace structure missing/malformed` | +0 (all current pages have full chain via `buildContainedInPlace`) | same | same |
| `location.image missing` (Place subtype docs) | +7,894; pass rate 97% → ~3% | +~50; pass rate 97% → ~96% | +7,894; 0 pass-rate change |
| `location.url missing on event-page` | +7,894 (event-page lacks venue URL link); pass rate 97% → ~3% | n/a | +7,894; 0 pass-rate change |

**Expected warning delta line for the eventual Component B session plan:**
- If Strategist locks INFO-only for Component B place-vocab additions: **+7,894–~16,000 INFO-level finding-instances; pass rate stays at 97%; warn count stays at 239.**
- If Strategist locks Tier-1-only WARN: **+~100 WARN finding-instances; pass rate 97% → 95–96%; warn count 239 → ~330.**
- If Strategist locks unconditional WARN: **pass rate craters to ~3%; warn count balloons to ~7,894+.**

**Recommended baseline for plan authoring:** assume INFO-only path until Q-B1 lock arrives, with explicit re-baseline note if Strategist chooses WARN.

---

## Verification: post-pre-flight baseline re-check

To confirm no drift introduced during this read-only session, re-run baseline at session exit (this section reserved — see "Verification commands" below). Pre-flight wrote ZERO files outside this spec file; no edits to `src/`, `config/`, `tests/`, or `data/`.

**Verification commands** (to run at handoff):
```bash
bun test 2>&1 | tail -5   # expect 1853 pass / 0 fail
bun -e "const m = await import('./src/validators/schema-completeness.ts'); const r = m.validateAllPages('dist'); m.printSchemaSummary(r);" 2>&1 | tail -10   # expect 7734/7973 (97%) / 0 errors / 239 warnings
git status --short specs/sprint-2-component-b-preflight.md   # expect: ?? (new file only)
git diff --stat src/ config/ tests/ data/   # expect: empty (no changes)
```

---

## Critical files referenced (paths for next session)

**Validator core (Component B will modify):**
- `src/validators/schema-completeness.ts:70-229` — `validateSchemaCompleteness` (event-page rules)
- `src/validators/schema-completeness.ts:318-342` — `validateVenueSchema` (venue-page rules)
- `src/validators/completeness-reporter.ts` — `place_level` flag flips here

**Schema emission (Component B will modify if sameAs wires through):**
- `src/templates/page.ts:412-450` — Place + PostalAddress block
- `src/utils/schema-geo.ts:53-93` — `buildPlaceLevel` and `buildContainedInPlace` helpers
- `src/generators/venue-page.ts:60-100` — LocalBusiness builder
- `src/generators/event-page.ts:170-210` — event location MusicVenue/EventVenue builder

**Wiring (Component B mirrors website-attach pattern):**
- `src/generate-site.ts:218-222` — venue.website attach loop (template for sameAs attach)
- `src/ticketing/venue-registry.ts:25-33` — `VenueRecord` interface (add sameAs field here)
- `src/types.ts:83-93` — `Venue` interface (add sameAs field here)

**Precedent for separate sameAs config file (Q-B3 path):**
- `src/utils/performer-sameAs.ts` — full sameAs lookup module pattern
- `config/performer-sameAs.json` — separate config file structure

**Tests (Component B extends):**
- `src/validators/__tests__/schema-completeness.test.ts` — 49 existing tests
- `src/validators/__tests__/completeness-reporter.test.ts` — 14 existing tests

**Specs precedents:**
- `specs/component-a-preflight.md` — structural template this file mirrors
- `.claude/notes/decisions.md` — Q-A1/Q-A2/Q-C1 lock entries (line 2150+, 2194)
- `data/build-completeness.json` — current layer flags artifact

---

## Hand-off notes for the Planner

1. **Three Strategist locks needed before plan authoring**: Q-B1 (severity), Q-B2 (aggregate granularity), Q-B3 (config storage). Q-B4–Q-B7 can be Planner-decided with Strategist veto.
2. **Plan-blocking**: TL;DR finding #1 (zero-code-change assumption is wrong) and TL;DR finding #2 (naive WARN craters pass rate). Plan must address both explicitly.
3. **Baseline to lock in plan**: 7734/7973 (97%) / 0 errors / 239 warnings (236 events + 3 hubs). Component B's expected warning delta line in the plan depends on Q-B1 answer.
4. **Tier 1 venue sameAs data is NOT in repo yet** — Editorial brief is upstream of this work. Component B can ship the validator + wiring with empty sameAs arrays (Tier-1-only WARN would silently pass until data lands; INFO-only would surface immediately as actionable signal).
5. **No mistakes.md / patterns.md / decisions.md updates from this pre-flight per user instructions** — those are session-outcome files; pre-flight is not a session.
