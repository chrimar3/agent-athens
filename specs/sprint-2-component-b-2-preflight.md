# Sprint 2 Component B-2 Pre-Flight — Repo State + B-2 Shape Foundations

**Date:** 2026-05-03
**Scope:** Read-only verification of post-B-1 repo state. Surfaces three repo-derived shapes B-2 needs (events.byType precedent, events-per-venue resolution, INFO-tier insertion mechanics) before the B-2 session plan is written.
**Method:** Pure observation. Zero edits to `src/`, `config/`, `tests/`, or `data/` during this pre-flight.
**Mirrors:** `specs/sprint-2-component-b-preflight.md` structure (B-1 pre-flight).

---

## ⚠️ TL;DR — Plan-blocking findings

Two findings need explicit handling in the B-2 session plan:

1. **`result.info[]` is write-only today.** The validator populates it (`schema-completeness.ts:185` for `offers.url`) but the reporter does NOT consume it (zero matches for `.info` or `info[` in `completeness-reporter.ts`) AND `printSchemaSummary` does NOT print it (zero matches in lines 489–545). For B-2's INFO-tier sameAs findings to surface anywhere beyond the per-page result object, the plan must include reporter-consumption wiring (and likely a `printSchemaSummary` extension). This was implicit in pre-flight P3 of B-1 ("severity machinery already supports WARN/INFO/ERROR") — true at the per-page level, but the *aggregation* path is unwired. Strategist Q-B1 lock if it chose INFO needs this wiring as a B-2 scope item.

2. **No existing ratchet/threshold config in repo.** Grep across `config/*.json` and `src/validators/*.ts` returns one descriptive mention only (`scrape-list.json:32`, irrelevant). B-2 introduces the first ratchet config — there's no precedent shape to mirror, just the cohesion choice between extending `city-geodata.json` vs new dedicated file. P6 enumerates options; Planner picks during plan write.

The rest of the surface is in great shape: B-1 deviations are stable in repo (P1), `events.byType[]` is exactly the BucketReport[] precedent Q-B2 hybrid lock assumed (P2), events-per-venue grouping already exists in two places (P3), layer flag flip is one-line (P5), and city-geodata.json shape is unchanged from B-1 (P6).

---

## Step 0 — Baseline confirmation

**Commands:**
```bash
bun test 2>&1 | tail -5
bun -e "const m = await import('./src/validators/schema-completeness.ts'); const r = m.validateAllPages('dist'); m.printSchemaSummary(r);" 2>&1 | tail -10
head -30 data/build-completeness.json
ls -d dist/venues/*/ | wc -l
```

**Output (verbatim):**
```
 1857 pass
 1 skip
 0 fail
 3889 expect() calls
Ran 1858 tests across 74 files. [35.67s]

📋 Schema completeness: 7724/7963 pages fully valid (97%)
   📊 7894 event + 22 hub + 46 venue + 1 datafeed pages
   ✅ 7724 pass  ⚠️  239 warnings  ❌ 0 errors

   Top data gaps:
     236/7963 (3%) location.geo coordinates missing
     219/7963 (3%) streetAddress is empty
     3/7963 (0%) FAQPage JSON-LD block missing
     2/7963 (0%) CollectionPage: itemListElement is empty

  "layers": {
    "event_level": "measured",
    "offer_level": "measured",
    "place_level": "not_measured",
    "aria_level": "measured",
    "datafeed_level": "measured"
  },
```
`ls -d dist/venues/*/ | wc -l` = **46**.

**Baseline holds:** 1857/0 tests, 97% pass-rate, 0 errors, 239 warnings, 46 venues, `place_level: "not_measured"`. All match B-1 closeout exactly.

**Counting-method note:** `ls dist/venues/ | wc -l` (script-suggested form) returns 47, NOT 46. The +1 is `dist/venues/index.html` (the venue listing page), which is a file alongside the 46 venue subdirectories. B-1 closeout used `ls -d dist/venues/*/ | wc -l` (subdirectory count). Same dist state; different counting method. No drift.

**Build artifact age:** `data/build-completeness.json lastUpdate: 2026-05-03T16:59:33.622Z`. Post-dates B-1 closeout commits. Likely a daily-pipeline build ran between B-1 closeout and this preflight. Schema metrics, layer flags, and test counts all match B-1 — automation is benign.

---

## P1 — B-1 deviations stable in repo

All five deviations from the B-1 session script are present and discoverable today:

| Deviation | Location | Verbatim |
|---|---|---|
| `validateVenueSchema` signature with `expectedAddressRegion` parameter | `src/validators/schema-completeness.ts:319,328,350,351` | `* expectedAddressRegion is the canonical city.region.name from city-geodata.json` (jsdoc); `expectedAddressRegion: string,` (param); `if (typeof got === 'string' && got !== expectedAddressRegion)` (rule); `errors.push('addressRegion mismatch: got "${got}", expected "${expectedAddressRegion}" per city-geodata.json')` (message) |
| `getRegionName()` helper | `src/utils/schema-geo.ts:179` | `export function getRegionName(): string {` |
| `sameAs` field on `Venue` interface | `src/types.ts:93` | `sameAs?: string[];  // Identity links emitted as Schema.org sameAs; populated from VenueRecord via generate-site.ts attach.` |
| `sameAs` field on `VenueRecord` interface | `src/ticketing/venue-registry.ts:32-33` | `/** Identity links (Wikidata QID URI, Google Place URL, official URL) emitted as Schema.org sameAs. */` `sameAs?: string[];` |
| `sameAs` attach in build pipeline | `src/generate-site.ts:218,226-227` | `// Attach venue.website + venue.sameAs from athens-venues.json.` … `if (venueRecord?.sameAs && venueRecord.sameAs.length > 0) { event.venue.sameAs = venueRecord.sameAs; }` |
| `VenueData` internal interface (5th wiring site) | `src/generators/venue-page.ts:35,41,76,258` | `interface VenueData {` … `sameAs?: string[];` (line 41) … `...(venue.sameAs && venue.sameAs.length > 0 ? { sameAs: venue.sameAs } : {})` (line 76) … `sameAs: event.venue.sameAs,` (line 258, init) |

**B-2 builds on a stable foundation.** No reverts detected.

---

## P2 — `events.byType[]` shape (Q-B2 hybrid precedent)

### Where byType is computed

`src/validators/completeness-reporter.ts`, function `buildCompletenessReport()` (lines 102–203). Key sites:

- Type declaration: line 74 — `byType: BucketReport[];` inside `events` slot of `CompletenessReport`.
- Accumulator init: line 156 — `const byType: BucketReport[] = [];`.
- Bucket push: lines 162–169 — only fires when `group.total > 0` (lean artifact — empty buckets are omitted).

### Construction algorithm (verbatim, lines 102–172)

```typescript
export function buildCompletenessReport(
  summary: SchemaValidationSummary,
  events: Event[],
  ariaAggregate: AriaAggregate,
): CompletenessReport {
  // Build slug → EventType map. generateEventSlug is the canonical join key
  // shared with the page generator.
  const slugToType = new Map<string, EventType>();
  for (const event of events) {
    slugToType.set(generateEventSlug(event), event.type);
  }

  // Per-EventType accumulators, one per bucket. Only buckets with total > 0
  // appear in the final byType output.
  const buckets = new Map<EventType, PageGroupReport>();
  for (const type of BUCKET_ORDER) {
    buckets.set(type, emptyGroup());
  }

  const hubs = emptyGroup();
  const venues = emptyGroup();
  const datafeed = emptyGroup();
  const orphanSlugs: string[] = [];

  for (const result of summary.details) {
    const verdict = classify(result.errors, result.warnings);

    if (result.slug.startsWith('hub:'))      { tally(hubs, verdict); continue; }
    if (result.slug.startsWith('venue:'))    { tally(venues, verdict); continue; }
    if (result.slug.startsWith('datafeed:')) { tally(datafeed, verdict); continue; }

    // Event slug. Strip optional en/ mirror prefix before lookup; the English
    // page validates the same Event row.
    const lookupSlug = result.slug.startsWith('en/')
      ? result.slug.slice(3)
      : result.slug;

    const type = slugToType.get(lookupSlug);
    if (!type) {
      orphanSlugs.push(result.slug);
      continue;
    }

    tally(buckets.get(type)!, verdict);
  }

  const byType: BucketReport[] = [];
  // ... iterate BUCKET_ORDER, push only non-empty buckets
}
```

### Emitted JSON shape (verbatim from `data/build-completeness.json`)

```json
{
  "type": "concert",
  "total": 1212,
  "pass": 1171,
  "warn": 41,
  "fail": 0,
  "passRate": 97
}
```

Per bucket: `{type: EventType, total, pass, warn, fail, passRate}`. `passRate` is whole percent, rounded.

### Test precedent (12 dedicated tests in completeness-reporter.test.ts)

Lines 66, 75, 86, 92, 100, 101, 102, 115, 116, 122, 133, 134, 154, 194, 204, 205, 210, 226, 229, 242, 243 — covering: empty corpus, lean omission, orphan routing, hub/venue/datafeed slug-prefix routing, EventType declaration order preservation, totals reconciliation.

### B-2 byVenue mirror (template)

For Q-B2's `place.byVenue[]` lock, the template is **near-identical**:

```typescript
// Per-venue accumulators
const venueBuckets = new Map<string, PageGroupReport>();  // key: normalized venue name

// Build slug → venueKey map (same shape as slugToType above)
const slugToVenue = new Map<string, string>();
for (const event of events) {
  slugToVenue.set(generateEventSlug(event), normalizeVenueKey(event.venue.name));
}

// Iterate summary.details (same routing as byType — but now route event slugs
// to per-venue buckets via slugToVenue lookup instead of slugToType)
// ...

const byVenue: BucketReport[] = [];
// iterate venueBuckets, push only non-empty
```

**Key differences from byType:**
- No `BUCKET_ORDER` analog — venues don't have a declared order. Most natural: alphabetical by venue slug (deterministic, stable across builds).
- Bucket key is `string` (normalized venue name), not `EventType`. The `BucketReport` type field becomes `venueSlug` or `venueName` — the planner picks the canonical name.
- Orphan handling: events whose venue isn't in `athens-venues.json` go to a separate orphan slug list (mirror existing `orphanSlugs` for events).

**`normalizeVenueKey` precedent** (already in repo): `src/ticketing/venue-registry.ts:56`, used by `getVenueByName(name)` at line 95. NFD-decomposition + diacritic strip + lowercase + whitespace collapse. **Use this same canonicalizer for byVenue keys** — guarantees consistency with venue-registry lookups elsewhere.

---

## P3 — Events-per-venue resolution path

### Two existing groupings (no new aggregation needed)

| Site | Code | Purpose |
|---|---|---|
| `src/generators/venue-page.ts:243-280` | `const venueMap = new Map<string, VenueData>();` then loop over events appending to `venueData.events` | Per-venue page generation (groups events by venue slug, also tracks address/neighborhood/coordinates/sameAs) |
| `src/generate-site.ts:532-547` | `const eventsByVenueEn = new Map<string, Event[]>();` then loop appending events; later `eventsByVenueEn.get(event.venue.name) || []` | Related-events display on English event pages |

### Implication for B-2

The `pageableEvents` array IS available at `buildCompletenessReport()`'s call site (`src/generate-site.ts:1064`):

```typescript
const completenessReport = buildCompletenessReport(schemaResults, pageableEvents, ariaAggregate);
```

So B-2's reporter can build its own `slugToVenue` Map (mirror of slugToType) without needing a new arg. **No signature change to `buildCompletenessReport` required for byVenue alone** — unlike Component C which needed `ariaAggregate` because aria came from a separate post-build process.

If B-2 also surfaces a per-venue `events_affected` count beyond what the validator detail rows give (e.g., "venue X has 12 events, 3 of which lack sameAs"), that count derives from grouping `events` by venue inline in the reporter — same pattern as `slugToType` build at line 110 of completeness-reporter.ts.

### Construction site (if B-2 wants to centralize)

The reporter is the natural home — keeps the grouping local to where it's consumed. Alternative: extract a `groupEventsByVenue(events: Event[]): Map<string, Event[]>` helper into `src/utils/venue-grouping.ts` if B-2 anticipates other consumers. Likely overkill for a one-consumer use case; defer to multi-consumer demand.

---

## P4 — INFO-tier insertion mechanics

### Per-page insertion: WIRED (offers.url precedent)

`src/validators/schema-completeness.ts:182-186` (verbatim):

```typescript
// offers.url: INFO-level — surfaced for awareness, not blocking, not warning
if (!isNonEmpty(offers.url)) {
  info.push('offers.url is omitted (legitimate for non-merchant ticket sources)');
}
```

The `info` array is initialized at line 74 (`const info: string[] = [];`), pushed at line 185, returned at line 229 as part of `SchemaValidationResult`. Type is declared at lines 23–28:

```typescript
/**
 * INFO-level signals. Surfaced for awareness; not blocking, not warning.
 * Per Strategist 2026-04-29: `offers.url` is INFO when omitted (legitimate
 * for listing-aggregator and venue-direct-only ticket sources).
 */
info?: string[];
```

### Aggregate consumption: NOT WIRED ⚠️

- `grep -n '\.info\|info\[' src/validators/completeness-reporter.ts` → **zero matches**. The reporter ignores `result.info[]` entirely.
- `grep -i 'info' src/validators/schema-completeness.ts | sed -n '489,545p'` (within `printSchemaSummary` body) → **zero matches**. The console summary ignores it too.

**Practical state today:** INFO findings exist on `result.info[]` but are dropped at the reporter boundary. They don't reach `data/build-completeness.json`, don't reach the console output, don't reach any consumer. The field is write-only.

### B-2 implications

If Strategist Q-B1 lock chooses **INFO-level** for missing venue sameAs (Recommended in B-1 pre-flight TL;DR finding #2), B-2 must include reporter consumption + summary surfacing in scope. Estimated additional work:
- Add `info: number` field to `PageGroupReport` (mirror of pass/warn/fail counts) — affects 1 type definition + tally function + emptyGroup helper.
- Update `tally()` to count info presence.
- Update `printSchemaSummary` to include INFO line in the top-finding block (or a dedicated INFO bucket).
- Update existing tests that assert empty/zero info counts (mostly additive — current tests don't check info, so additions, not modifications).

If Strategist Q-B1 chooses **WARN-with-Tier-1-only** instead, INFO wiring is out of scope for B-2 (defer). Pre-flight P9 of B-1 estimated INFO-only path adds 7,894 finding-instances with 0 pass-rate change; WARN-Tier-1-only adds ~50–100 with ~1% pass-rate dip.

---

## P5 — `place_level` flag flip mechanics

### Current state (completeness-reporter.ts:67-71, 186-190)

Type declaration:
```typescript
event_level: 'measured' | 'not_measured';
offer_level: 'measured' | 'not_measured';
place_level: 'measured' | 'not_measured';
aria_level: 'measured' | 'not_measured';
datafeed_level: 'measured' | 'not_measured';
```

Return literal:
```typescript
event_level: 'measured',
offer_level: 'measured',
place_level: 'not_measured',
aria_level: 'measured',
datafeed_level: 'measured',
```

### Component A (datafeed_level) diff (commit `118bc810c`)

```diff
@@ -58,6 +58,7 @@ export interface CompletenessReport {
     offer_level: 'measured' | 'not_measured';
     place_level: 'measured' | 'not_measured';
     aria_level: 'measured' | 'not_measured';
+    datafeed_level: 'measured' | 'not_measured';
   };

@@ -168,6 +175,7 @@ export function buildCompletenessReport(
       offer_level: 'measured',
       place_level: 'not_measured',
       aria_level: 'not_measured',
+      datafeed_level: 'measured',
     },
```

Plus a new top-level `datafeed: PageGroupReport` aggregate (flat shape, mirrors hubs/venues).

### Component C (aria_level) diff (commit `98db28207`)

Same one-line flag flip — changed `aria_level: 'not_measured'` to `aria_level: 'measured'` in the return literal.

Plus structural additions:
- New `AriaAggregate` interface (split shape — `hub_template + event_template`, NOT flat).
- New `aria: AriaAggregate` top-level slot.
- `buildCompletenessReport` signature added required `ariaAggregate: AriaAggregate` parameter (gated by `existsSync` read in generate-site.ts).
- All 12 existing test callers updated via `emptyAria()` helper.

### Pattern consistency

**Flag flip is identical in both A and C**: change one line in the return literal. No divergence.

**Aggregate shape diverges**: A used flat (datafeed = PageGroupReport), C used split (aria = AriaAggregate with hub_template + event_template). The shape is per-component design choice, not a pattern question.

### B-2 application

Layer flag flip itself: change line 188 from `place_level: 'not_measured'` to `'measured'`. One line. ✓

Aggregate shape: per Q-B2 hybrid lock (assumed `byVenue[]`-style per pre-flight script), the natural shape is `place: { byVenue: BucketReport[], totals: ..., orphanVenues: string[] }` — mirrors `events: { byType, totals, orphanSlugs }` exactly. This is the third precedent shape (per-key-array), distinct from A's flat and C's split.

If buildCompletenessReport needs new args for B-2 (e.g., a per-venue coverage map computed pre-call), follow C's gating pattern — `existsSync` check + zero-aggregate fallback in generate-site.ts. If B-2 derives everything from `pageableEvents` (already passed) + `summary.details` (already passed), no signature change. Likely the latter.

---

## P6 — Ratchet config home + city-geodata.json post-B-1 shape

### city-geodata.json post-B-1 (verbatim)

```json
{
  "municipality": {
    "name": "Municipality of Athens",
    "qid": "Q1524",
    "lat": 37.9838,
    "lng": 23.7275
  },
  "region": {
    "name": "Attica",
    "qid": "Q178517",
    "lat": 37.9908,
    "lng": 23.7033
  },
  "country": {
    "name": "Greece",
    "code": "GR",
    "currency": "EUR",
    "qid": "Q41",
    "lat": 39.0742,
    "lng": 21.8243
  }
}
```

**B-1 did NOT modify this file.** The new `getRegionName()` helper reads existing `cityGeodata.region.name` ("Attica"). Shape (b) per B-1 pre-flight P5 holds.

### Existing config files (relevant)

```
config/athens-venues.json           # Venue whitelist + Q-B3 sameAs lives here
config/banned-phrases.yaml
config/categories.json
config/categorization-keywords.json
config/city-geodata.json            # Geo + administrative names (P6 candidate)
config/editorial-content.json
config/enrichment-knowledge.md
config/entity-locking.json
config/event-scope.json
config/hub-pages.json
config/indexnow.json
config/launchd/                     # plist directory
config/neighborhood-geodata.json    # Neighborhood-level geo
config/newsletter-formats.json
config/orchestrator-config.json
config/performer-sameAs.json        # Performer identity links
config/rejected-locations.json
config/scrape-list.json
config/scraping-sources-ai-tech.md
config/seasonal-rules.json
config/source-attribution.json
config/ticket-source-classification.json
config/ticketing-mapping.json
config/tracked-prompts.json
config/url-category-patterns.json
config/venue-categories.json
config/venue-intelligence.md
```

**No existing ratchet/threshold config in repo.** `grep -rn 'ratchet\|threshold\|coverage' config/ src/validators/` returns one descriptive mention only (`scrape-list.json:32` — irrelevant comment). B-2 introduces the first.

### Three candidate homes for ratchet config

| Option | File | Cohesion argument |
|---|---|---|
| **(a) Extend `city-geodata.json`** | Same file gains a `measurement_thresholds` (or similar) block per layer. | Groups all city-specific quality measurements with all city-specific geographic data. Single file per city is the editorial unit; ratchets *are* per-city (Athens may pass-rate at 97%, Barcelona may baseline differently). When forking agent-athens → agent-barcelona, one file replacement carries everything. |
| **(b) New `config/completeness-ratchets.json`** | Dedicated file keyed by city, with per-layer threshold blocks. | Separates measurement concerns from geographic data. Ratchets evolve independently of geo (geo is stable; thresholds tighten over time). Editorial workflows that touch geo don't need to think about thresholds. |
| **(c) New per-layer file** | e.g., `config/place-coverage-thresholds.json` (and future `config/aria-coverage-thresholds.json`, etc.) | Most granular. One concern per file. Avoids one large config file if many layers eventually have ratchets. Trade-off: file proliferation + multi-city setup requires N file edits per city. |

**Cohesion question for Planner:** do thresholds belong with city geo data (single source of truth per city), as a separate measurement-config file (separate concern from geo), or split per-layer (single concern per file)? **No recommendation here — Planner picks during plan write.**

Per-city replicability is satisfied by all three (each can be keyed by city or replaced per-deployment). The choice is purely about cohesion.

---

## P7 — Test surface delta sizing

### Current test counts (post-B-1)

| File | Lines | `it`/`test` count |
|---|---|---|
| `src/validators/__tests__/schema-completeness.test.ts` | 598 | 53 |
| `src/validators/__tests__/completeness-reporter.test.ts` | 267 | 14 |
| Total | 865 | 67 |

Deltas vs B-1 closeout match exactly: schema-completeness was 49 + 4 new = 53 ✓; completeness-reporter unchanged at 14 ✓.

### Estimated B-2 additions

| Category | Estimate | Notes |
|---|---|---|
| INFO-tier sameAs rule (validator) | 3–4 | If Q-B1 = INFO: missing → INFO; present → no finding; per-page result.info[] populated. If Q-B1 = WARN-Tier-1-only: similar 3–4 covering Tier 1 hit/miss + non-Tier-1 silent. |
| Ratchet config (validator + reporter) | 3 | Under threshold → INFO; at threshold → WARN; over threshold → WARN (or pass — depends on direction of ratchet). |
| `place.byVenue[]` aggregate (reporter) | 4–5 | Mirror byType test pattern: empty corpus, lean omission of empty buckets, orphan venue routing, totals reconciliation, hub/venue/datafeed slug routing not affected. |
| `place_level` flag flip (reporter) | 1 | Asserts `report.layers.place_level === 'measured'` post-build. |
| INFO reporter consumption + summary surfacing (if Q-B1 = INFO) | 2–3 | Test that info count reaches reporter aggregate; test that printSchemaSummary surfaces INFO bucket. ONLY if reporter consumption is in scope (see P4). |
| **Total** | **10–13 (Q-B1=WARN) or 12–16 (Q-B1=INFO)** | Lower estimate matches script's 10–12 prediction; upper if INFO consumption wiring lands. |

### Post-B-2 final test count estimate

- Q-B1 = INFO path: **1857 + 12–16 = 1869–1873/0**
- Q-B1 = WARN-Tier-1-only path: **1857 + 10–13 = 1867–1870/0**

Either way, well within the script's "1867–1869/0" prediction band on the WARN path; INFO path slightly above it.

---

## Critical files referenced (paths for B-2)

**Core validator/reporter (B-2 modifies):**
- `src/validators/schema-completeness.ts:23-29,74,182-186,229` — INFO field type + per-page insertion (extend with sameAs INFO if Q-B1 = INFO)
- `src/validators/schema-completeness.ts:318-355` — `validateVenueSchema` (extend with sameAs check if Q-B1 chooses to fire on venue pages too)
- `src/validators/schema-completeness.ts:489-545` — `printSchemaSummary` (extend to surface INFO if reporter consumption lands)
- `src/validators/completeness-reporter.ts:67-71` — layer-flags type
- `src/validators/completeness-reporter.ts:74` — `byType: BucketReport[]` precedent for `byVenue: BucketReport[]`
- `src/validators/completeness-reporter.ts:102-203` — `buildCompletenessReport` (add place aggregate)
- `src/validators/completeness-reporter.ts:186-190` — layer-flag literal (flip `place_level` to `'measured'`)

**Wiring + helpers B-2 reuses:**
- `src/ticketing/venue-registry.ts:56` — `normalizeVenueKey()` (canonical venue name keying)
- `src/ticketing/venue-registry.ts:95` — `getVenueByName()` (lookup pattern)
- `src/generate-site.ts:218-227` — venue.website + venue.sameAs attach loop
- `src/generate-site.ts:1064` — `buildCompletenessReport(schemaResults, pageableEvents, ariaAggregate)` call site (events available for byVenue derivation)
- `src/generators/venue-page.ts:243-280` — venueMap pattern (existing per-venue events grouping precedent)

**Config:**
- `config/city-geodata.json` — unchanged from B-1; ratchet candidate (Option a)
- `config/athens-venues.json` — Q-B3 sameAs target (Editorial brief upstream of B-2 data)
- `config/performer-sameAs.json` — separate-file precedent if ratchet picks Option b/c

**Tests B-2 extends:**
- `src/validators/__tests__/schema-completeness.test.ts:53 tests` — add INFO sameAs tests, ratchet boundary tests
- `src/validators/__tests__/completeness-reporter.test.ts:14 tests` — add byVenue tests, place_level flip test, INFO consumption tests (if in scope)

**Specs precedent:**
- `specs/sprint-2-component-b-preflight.md` — B-1 pre-flight; structural template this file mirrors
- `.claude/notes/decisions.md` — Q-B3 + Q-B6 lock entries (lines ~2214+)

---

## Hand-off notes for the Planner

1. **Q-B1 lock determines whether INFO consumption wiring is in scope.** P4 surfaced that `result.info[]` is write-only today (validator pushes; reporter and printSchemaSummary both ignore). If Strategist Q-B1 chose INFO for missing venue sameAs, B-2 must wire reporter consumption + summary surfacing as part of the session. If Strategist chose WARN-Tier-1-only (or another non-INFO option), INFO wiring is deferred.
2. **`byType` precedent is exactly the BucketReport[] shape Q-B2 hybrid lock assumed.** P2 documents the verbatim construction; B-2's `place.byVenue[]` is a near-mechanical mirror with `slugToVenue` (using `normalizeVenueKey`) replacing `slugToType`. `BUCKET_ORDER` analog = alphabetical venue slug order (no declared canonical order for venues).
3. **No new aggregation needed for events-per-venue.** P3 confirms `pageableEvents` is already passed to `buildCompletenessReport` and two existing groupings exist (venueMap in venue-page.ts, eventsByVenueEn in generate-site.ts) that B-2 can reference for shape.
4. **Layer flag flip is a one-line change.** P5 confirms both A and C used identical pattern: change `place_level: 'not_measured'` to `'measured'` at completeness-reporter.ts:188.
5. **Ratchet config introduces a new file in repo.** P6 enumerates 3 cohesion options without recommendation — Planner picks. No existing ratchet precedent to mirror; this is a greenfield decision.
6. **Test surface estimate aligns with script** (10–13 new tests on WARN path, 12–16 on INFO path; final 1867–1873/0).
7. **city-geodata.json shape unchanged from B-1.** B-2 can read existing fields via `getRegionName()` / `getCountryCode()` / `getCurrencyCode()` helpers without config edits.
8. **No mistakes.md / patterns.md / decisions.md updates from this pre-flight per user instructions** — those are session-outcome files; pre-flight is not a session.

---

## Verification: post-pre-flight baseline re-check

To confirm no drift introduced during this read-only session, run at handoff:
```bash
bun test 2>&1 | tail -5   # expect 1857 pass / 0 fail
bun -e "const m = await import('./src/validators/schema-completeness.ts'); const r = m.validateAllPages('dist'); m.printSchemaSummary(r);" 2>&1 | tail -10   # expect 7724/7963 (97%) / 0 errors / 239 warnings
git status --short specs/sprint-2-component-b-2-preflight.md   # expect: ?? (new file only)
git diff --stat src/ config/ tests/ data/   # expect: empty (no changes)
```
