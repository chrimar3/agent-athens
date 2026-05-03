# Component A Pre-Flight — Verified Repo State for Plan Authoring

**Date:** 2026-05-02
**Scope:** Read-only verification of integration surface for Sprint 2 Component A (Schema.org DataFeed at `/api/events.json` + discovery touchpoints).
**Discipline rule activation:** Cross-Project rule (2026-05-02) — verify against `src/` before Dev Planner publication.

---

## ⚠️ TL;DR — Plan-blocking finding

**`/api/index.json` already exists and is a 56,974-byte events feed** (391 events in current build, not the 8 hub-manifest entries assumed). It uses the **internal Event shape** (`id`, `title`, `description`, `fullDescription*`, `tags`, …), NOT Schema.org DataFeed format. Two questions for Strategist before plan authoring:

1. **Endpoint name:** ship a *new* `/api/events.json` as Schema.org DataFeed, leaving `/api/index.json` untouched? Or convert `/api/index.json` to DataFeed (breaking change for existing JS-client consumers)?
2. **Layer surface:** is DataFeed coverage a new `datafeed_level` layer in `build-completeness.json`, or a sub-dimension of `event_level`?

Recommended default (deferring to Strategist): **new `/api/events.json` (additive)** + **new `datafeed_level` layer** (separate concern from per-event coverage). Rest of the plan is straightforward once these are answered.

---

## 1. Build pipeline write inventory

`src/generate-site.ts` is **1,351 lines**. Write helper imports at line 6.

**Write call sites by helper (line numbers):**

| Helper | Sites | Targets |
|---|---|---|
| `writeFileIfChangedSync` | 239, 568, 575, 1219, 1270, 1285 | `_redirects`, `llms.txt`, `robots.txt`, IndexNow keys |
| `writeHtmlIfChangedSync` | 331, 471, 491, 500, 548, 892, 924, 1055, 1093, 1346 | All HTML pages (homepage, hubs, EN mirrors, category pages, saved, 404) |
| `writeJsonApiIfChangedSync` | 338, 1073, 1120 | `/api/index.json` (line 338), per-page `/api/{url}.json` (1073), category `/api/categories/{slug}.json` (1120) |
| `copyFileIfChangedSync` | 111, 123, 135, 250, 1308 | Image assets, root static files |

**Insertion site for `/api/events.json` write:** cleanest slot is **adjacent to line 338** (existing `/api/index.json` write inside the homepage block) OR a new dedicated section just before line 1219 (llms.txt — where root-level discovery files cluster). Recommend the latter (own section labeled `// Sprint 2 Component A — Schema.org DataFeed`) so DataFeed reads as a sibling of llms.txt/robots.txt rather than as an appendix to the homepage block.

---

## 2. `/api/index.json` — actual current shape

**This is the plan-blocking finding.** Re-quoting in detail:

- **File size:** 56,974 bytes
- **Top-level keys:** `["events", "filters", "meta"]`
- **`events`:** array of 24 full Event objects (in current build snapshot — note: this is a small slice; per llms.txt the full count is 391 events). **Internal Event shape**, not Schema.org Event:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "ExhibitionEvent",
    "id": "5864d4f58bcccd88",
    "title": "...",
    "description": "...",
    "fullDescription": "...",        // 4-paragraph rich enrichment
    "fullDescriptionEn": "...",
    "fullDescriptionGr": "...",
    "hasNativeGreek": false,
    "startDate": "2026-02-11T10:00:00",
    "endDate": "2026-05-24",
    "type": "exhibition",
    "genres": [...],
    "tags": [...],
    ...
  }
  ```
- **Hybrid surface:** has `@context` + `@type` (Schema.org-flavored) but also internal-only fields (`fullDescriptionGr`, `hasNativeGreek`, `genres`, `tags`). Not a clean DataFeed — closer to "internal model + Schema.org annotations".

**Implication for Component A:**
- The Schema.org DataFeed at `/api/events.json` should contain `dataFeedElement[]` of **clean Schema.org Events** (the same objects rendered in per-page JSON-LD blocks — see §3), not internal model objects.
- `/api/index.json` and `/api/events.json` serve different consumers:
  - `/api/index.json` → JS clients via `<link rel="alternate" type="application/json">` (already wired into every page template at line 127)
  - `/api/events.json` → AI agents + structured-data consumers via DataFeed semantics

Recommended: ship as additive new endpoint. Strategist confirm.

---

## 3. Per-event JSON-LD shape

Sample: `00013a1f--phantom-spell` (MusicEvent type). JSON-LD block dumped from `dist/events/{slug}/index.html`:

```json
{
  "@context": "https://schema.org",
  "@type": "MusicEvent",
  "name": "PHANTOM SPELL",
  "description": "PHANTOM SPELL",
  "startDate": "2026-10-25T19:00:00+03:00",
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "inLanguage": "el",
  "url": "https://agentathens.com/events/00013a1f--phantom-spell/",
  "location": {
    "@type": "MusicVenue",
    "name": "Κύτταρο",
    "address": { "@type": "PostalAddress", "streetAddress": "...", "addressLocality": "Athens", "addressRegion": "Attica", "addressCountry": "GR" },
    "containedInPlace": {
      "@type": "Place", "name": "Municipality of Athens", "sameAs": "https://www.wikidata.org/wiki/Q1524",
      "geo": { "@type": "GeoCoordinates", "latitude": 37.9838, "longitude": 23.7275 },
      "containedInPlace": { /* Attica */ "containedInPlace": { /* Greece */ } }
    },
    "geo": { "@type": "GeoCoordinates", "latitude": 37.990675, "longitude": 23.726265 }
  },
  "endDate": "2026-10-25T19:00:00+03:00",
  "doorTime": "2026-10-25T19:00:00+03:00",
  "isAccessibleForFree": false,
  "offers": {
    "@type": "Offer",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "seller": { "@type": "Organization", "name": "Ticketservices.gr", "url": "https://ticketservices.gr/" },
    "url": "https://www.ticketservices.gr/event/14350/",
    "price": "22"
  },
  "image": "https://agentathens.com/images/events/00013a1fb92ea469.webp"
}
```

**Observations:**
- Single Event object per page. **No `@graph` wrapping** — confirmed at `event-page.ts:254` (`// Inline seller (no @id, no @graph — that's Sprint 3+).`).
- DataFeed wrap is structurally clean — no nested `@graph` collision.
- This sample is `known_merchant` (Ticketservices.gr seller). Three-lane seller observation deferred to §4.
- No `performer` field on this sample (PHANTOM SPELL didn't match the performer-sameAs registry); when present, it lives at the top level of the Event.
- Place hierarchy: Venue → Municipality of Athens → Attica → Greece, each with `sameAs` Wikidata IDs and geo.

---

## 4. Per-event JSON-LD generation function

**Function:** `generateEventSchema(event: Event, locale: Locale = 'el'): string` at `src/generators/event-page.ts:140`.

**Return type:** `string` (serialized JSON via `JSON.stringify(schema, null, 2)` at line 299). The function builds the schema as an object internally then stringifies on return.

**Three-lane seller logic** lives at lines **242-268** (excerpt):
```typescript
const sellerTypeForVenue: 'Organization' | ['Place', 'Organization'] =
  classification === 'venue_direct_only' ? ['Place', 'Organization'] : 'Organization';
const seller = sellerHost
  ? { '@type': 'Organization', 'name': hostToName(sellerHost), 'url': `https://${sellerHost}/` }
  : { '@type': sellerTypeForVenue, 'name': event.venue.name, ...(event.venue.website ? { url: event.venue.website } : {}) };
```

**`@graph` status:** confirmed not in use this Sprint. Comment at line 254: `// Inline seller (no @id, no @graph — that's Sprint 3+).`

**Call sites in event-page.ts:**
- Line 314 (`renderEventDetailPage`, locale='el'): primary Greek render
- Line 708 (`generateEventPages` loop): per-event generation
- Exported at line 790

**DataFeed integration question (decision-shaped):** function returns a **string**. Three options for Component A:

a) **Re-parse the string when wrapping** — DataFeed's build calls `JSON.parse(generateEventSchema(event))` for each event. Cheapest to write, ~1ms/event overhead × 7,744 events ≈ 8 sec extra build time. Acceptable but wasteful.

b) **Refactor to split** — extract `buildEventSchemaObject(event, locale): Record<string, any>` + keep `generateEventSchema(event, locale): string` as `JSON.stringify(buildEventSchemaObject(event, locale), null, 2)`. DataFeed uses the object form directly. Existing call sites unchanged. Small clean refactor, ~30 lines moved.

c) **Both forms exported** — export the object-builder AND the stringifier. Same as (b) but explicit.

Recommend **(b)**. Cleanest separation; existing string-returning callers don't change; DataFeed integration is a thin wrapper. Plan should fold the refactor into Component A's first step (TDD: extract object-builder, lock existing string behavior, then add DataFeed using object form).

---

## 5. Homepage template — alternate-link insertion site

**Template file:** `src/templates/page.ts` (also `src/templates/content-page.ts` for editorial pages).

**Existing `<link rel="alternate">` entries in `page.ts`:**
- Line 95: `<link rel="alternate" hreflang="el" href="${BASE_URL}/${url}">` (hreflang, all pages)
- Line 127: `<link rel="alternate" type="application/json" href="/api/${url}.json">` (JSON alt, all pages — comment: "For AI agents")

**No existing `<link rel="alternate" type="application/ld+json">` anywhere.** Insertion is greenfield.

**Recommended insertion site:** `src/templates/page.ts:128` (immediately after line 127), conditional on homepage:

```typescript
  <!-- For AI agents: alternate formats -->
  <link rel="alternate" type="application/json" href="/api/${url}.json">
  ${url === 'index' ? `<link rel="alternate" type="application/ld+json" href="/api/events.json">` : ''}
```

**Mirrors the existing `${url === 'index'}` conditional pattern at line 133** (Organization JSON-LD also only fires on homepage). Same idiom; same expected reader interpretation.

**Watch-for:** test at `src/templates/__tests__/page.test.ts:132` already asserts the JSON alt link. New test should assert the DataFeed link appears **only when `url === 'index'`** and is absent on hub/category pages.

---

## 6. Sitemap-index — DataFeed reference feasibility

**Current sitemap-index.xml:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://agentathens.com/sitemap-events.xml</loc></sitemap>
  <sitemap><loc>https://agentathens.com/sitemap-venues.xml</loc></sitemap>
  <sitemap><loc>https://agentathens.com/sitemap-editorial.xml</loc></sitemap>
</sitemapindex>
```

**Spec compliance:** sitemap-index uses the `<sitemapindex>` element per sitemaps.org schema. Each `<sitemap>` entry references **another sitemap XML file**, not arbitrary resources. **DataFeed JSON cannot be referenced from sitemap-index per spec.**

**Conclusion:** sitemap-index path is **infeasible**. Falling back to brief's contingency: discovery via homepage `<link rel="alternate" type="application/ld+json">` (§5) + llms.txt mention (§7). This is a finding; not a blocker.

(Aside: `dist/sitemap.xml` does not exist as a separate file; only `sitemap-index.xml` plus the three split sitemaps. The legacy `/sitemap.xml` URL is 301-redirected to `/sitemap-index.xml` per `_redirects` line at generate-site.ts:568.)

---

## 7. llms.txt structure + DataFeed mention slot

**Generator:** `src/generate-site.ts:1140-1221` (function builds `content` template literal, writes via `writeFileIfChangedSync` at 1219).

**Current "JSON API" section (lines 1185-1191 in the template literal):**
```markdown
## JSON API

Every HTML page has a JSON counterpart at `/api/{slug}.json`.

- [All Events](${base}/api/index.json)
- [Today](${base}/api/today.json)
- [Category example](${base}/api/categories/concerts.json)
```

**Recommended insertion:** add a sibling section immediately after (or new bullet within), e.g.:

```markdown
## Schema.org DataFeed

Machine-readable Schema.org DataFeed of all current events:

- [DataFeed](${base}/api/events.json) — Schema.org `DataFeed` with per-event `Event` objects
- Updated daily; `dataModified` reflects the latest event change
```

OR the lighter touch — extend the existing JSON API section with one bullet:

```markdown
- [All Events as Schema.org DataFeed](${base}/api/events.json)
```

Both readable. Strategist call. Lighter touch is simpler and keeps the section count flat; dedicated section is more discoverable for AI agents that grep for "DataFeed".

---

## 8. `writeJsonApiIfChangedSync` signature + reuse plan

**Full signature** (`src/utils/write-if-changed.ts:109-131`):
```typescript
export function writeJsonApiIfChangedSync(
  filePath: string,
  payload: Record<string, any>
): boolean
```

**Behavior:** compares prior file vs new payload with `meta.lastUpdate` stripped. If everything else matches, **preserves the prior `meta.lastUpdate`** in the new payload (mutates it!) before writing — preventing daily clock-drift rewrites. Returns true if file was actually written.

**Requirement for DataFeed payload:** must have `meta: { lastUpdate: string }` at the top level for the timestamp-preservation path to fire. If absent, falls through to plain `writeFileIfChangedSync` on the raw JSON (still cheap, just no clock-drift protection).

**Recommended DataFeed payload shape:**
```json
{
  "@context": "https://schema.org",
  "@type": "DataFeed",
  "name": "Agent Athens Cultural Events",
  "description": "Cultural events in Athens, Greece. Updated daily.",
  "dateModified": "2026-05-02T08:00:00+03:00",
  "dataFeedElement": [
    /* per-event Event objects */
  ],
  "meta": { "lastUpdate": "2026-05-02T08:00:00+03:00" }
}
```

**Note:** Schema.org's own `dateModified` and the helper's `meta.lastUpdate` are different fields. Both should reflect the same timestamp on each build. The helper's `meta.lastUpdate` triggers cache preservation; `dateModified` is the consumer-facing freshness signal. Recommend keeping both, computed from the same `new Date().toISOString()` call.

**Content-hash mechanism:** `writeHtmlIfChangedSync` (line 92-102) uses `stripVolatileContent` from `src/sitemap/content-hasher.ts` for HTML. JSON path uses the simpler `meta.lastUpdate` strip. Good enough for DataFeed — no special hashing needed.

---

## 9. `pageableEvents` → JSON-LD pipeline

**`pageableEvents` definition:** `src/generate-site.ts:188-191`:
```typescript
const pageableEvents = locationFiltered.filter(event => {
  const lifecycle = classifyEventLifecycle(event);
  return lifecycle !== 'past-expired';
});
```

**Consumed at:**
- Line 211, 219 (image preload)
- Line 510 (`generateEventPages(pageableEvents)` — per-event HTML generation)
- Line 517 (`englishEvents = pageableEvents.filter(e => e.fullDescriptionEn)`)
- Line 526 (sitemap entry generation)
- Line 556 (`generateEventOgImages(pageableEvents)`)
- Line 987 (orphan-sweep slug-set)
- Line 1036 (`buildCompletenessReport(schemaResults, pageableEvents)` — Component D)

**`generateEventPages` signature** (`src/generators/event-page.ts:662`):
```typescript
export async function generateEventPages(events: Event[]): Promise<{
  urls: string[];
  slugMap: Map<string, string>;
  pastEventUrls: Set<string>;
}>
```

Inside that loop, `generateEventSchema(event, locale)` is called twice per event:
- Once for Greek page (locale='el', line 314 path)
- Once for English page (locale='en', for events with `fullDescriptionEn`)

**JSON-LD reuse for DataFeed:**
- The **string** is computed inside `renderEventDetailPage` and immediately embedded in HTML — never returned upward to `generate-site.ts` for reuse.
- DataFeed building has to call `generateEventSchema` (or its object-form sibling per §4 recommendation) again for each pageable event.
- Cost: 7,744 events × small object construction ≈ negligible (current Greek pass already does this 7,744 times in <1 sec out of 15 sec total build).
- **Locale choice for DataFeed:** Greek (`'el'`) is the canonical locale for the project (homepage is Greek-primary). DataFeed should use `locale='el'`. English mirrors are already discoverable per-page; not duplicating in DataFeed is fine.

**No wasteful regeneration concern.** The "compute twice (Greek + English)" pattern is intentional — different `inLanguage`, different URL, different description. DataFeed adding a third object-form pass for canonical Greek is consistent.

---

## 10. Existing DataFeed surface

```bash
grep -rnE "DataFeed|dataFeedElement" src/ --include='*.ts'   # (no matches — confirmed)
grep -rnE "DataFeed|dataFeedElement" config/                  # (no matches — confirmed)
```

**Greenfield.** No existing DataFeed code, types, validators, or fixtures. Component A is creating this surface from scratch.

**Schema-completeness validator extension:** the existing validator (`src/validators/schema-completeness.ts:347-437`) iterates `dist/events/`, `dist/en/events/`, `dist/{hub}.html`, `dist/venues/`. It does **not** scan `/api/` JSON files. Component A should either:

a) Add a `validateDataFeed(distDir)` path that reads `dist/api/events.json`, parses it, and validates DataFeed mandatory fields (`name`, `description`, `dateModified`, `dataFeedElement`).
b) Defer validation to a separate session (treat ship-only as Sprint 2 A; validation as Sprint 2 A.1 or fold into Component E if scope allows).

Recommend **(a) inside Component A** — it's small (~30 lines), keeps the build's "if it shipped, it's validated" invariant. Without it, DataFeed could silently regress and the build would continue green.

---

## 11. `build-completeness.json` layered-surface check

```json
{
  "event_level": "measured",
  "offer_level": "measured",
  "place_level": "not_measured",
  "aria_level": "not_measured"
}
```

**Decision-shaped question:** does Component A flip a layer to `"measured"`, or add a new layer?

**Recommendation: add `datafeed_level`.** Reasoning:
- `event_level` measures **per-event JSON-LD coverage** (each Event page has valid schema). DataFeed wraps existing per-event JSON-LD — its presence doesn't change per-event coverage.
- DataFeed-specific concerns (DataFeed mandatory fields populated, alternate-link wired, llms.txt updated, dateModified fresh) are a **different measurement axis**. Lumping into `event_level` would make `event_level` mean two unrelated things.
- New layer fits the "Pre-create contract surface, populate data later" pattern (filed in `.claude/notes/patterns.md` 2026-05-02 from Component D): future SEO/GEO work that adds new measurement dimensions stubs the layer first, populates later.

Final layer set after Component A:
```json
{
  "event_level": "measured",
  "offer_level": "measured",
  "place_level": "not_measured",      // Component B
  "aria_level": "not_measured",       // Component C
  "datafeed_level": "measured"        // Component A (this session)
}
```

Strategist confirm.

---

## 12. DataFeed file size estimate

**Inputs:**
- Pageable events (DB query, 45-day retention + Athens-verified): **7,744 unique events**
- Sample per-event JSON-LD block: **2,185 bytes** (PHANTOM SPELL, MusicEvent — typical with-ticket event with offer + seller + image)

**Estimate:** 7,744 × 2,185 = **~16.9 MB raw**

**Brief assumption:** 5-15 MB raw, 10-20% gzip ratio.

**Reality vs brief:**
- **Raw size:** marginally above the upper bound (16.9 MB vs 15 MB ceiling). Within tolerance for a single resource on Netlify (no hard cap; CDN handles fine). Not a blocker.
- **Gzip:** JSON-LD with repetitive keys (`@context`, `@type`, `addressCountry`, `https://schema.org/...`) compresses very well. Realistic served size **~1.5-2.5 MB gzipped**.

**Reconciliation with Component D numbers:**
- DB pageable: 7,744
- Component D `events.totals.total`: 7,896 (counts Greek pages + English mirrors as separate page validations)
- `dist/events/` Greek dir: 7,451 (7,896 - 445 English = 7,451)
- 7,744 - 7,451 = 293 events in DB but no Greek page — possibly events in 45-day window but classified `past-expired` by `classifyEventLifecycle` (DB query and lifecycle classifier use different logic; not a finding for Component A but worth a separate audit some other time)

**Ship-day expectation:** ~16-17 MB raw, ~2 MB over the wire. Safely under Netlify's free-tier transfer ceilings even with daily rebuilds.

---

## 13. Open questions surfaced

1. **Q-A1: `/api/events.json` vs `/api/index.json` overlap.** New endpoint (additive) or convert existing? Recommend new. → Strategist
2. **Q-A2: `datafeed_level` as new layer vs extension of `event_level`.** Recommend new layer per separation-of-concerns reasoning in §11. → Strategist
3. **Q-A3: `generateEventSchema` return-type refactor.** Split into object-builder + stringifier (§4 option b)? Recommend yes; small refactor folded into Component A's first step. → Implementation detail; Plan agent can decide
4. **Q-A4: llms.txt — dedicated section vs single bullet.** Both readable. Recommend single-bullet first; dedicated section if signal demands it later. → Strategist (low-stakes)
5. **Q-A5: schema-completeness validator extension.** Add `validateDataFeed` inline in Component A, or defer? Recommend inline (~30 lines, preserves "if shipped, validated" invariant). → Implementation detail
6. **Discrepancy noted (no action this Sprint):** 7,744 DB-pageable vs 7,451 Greek-page count = 293-event gap. Likely `classifyEventLifecycle` difference. Not a Component A blocker; flag for a separate measurement-audit session.

---

## 14. Recommended Component A session structure

Pending Strategist answers to Q-A1 and Q-A2, the session shape would be:

**Step 0** — verification (paths haven't drifted since pre-flight)

**Step 1** — refactor `generateEventSchema` (event-page.ts:140) into `buildEventSchemaObject` + `generateEventSchema = obj → JSON.stringify(...)`. Existing call sites unchanged. Tests lock current string-output behavior. (Per Q-A3)

**Step 2** — write failing tests for `buildDataFeed(events, locale)` in `src/generators/datafeed.ts` (or `src/api/datafeed.ts` — placement TBD by Plan agent). Coverage: empty input, mandatory fields present, dataFeedElement length matches input length, locale='el', dateModified reflects latest event update.

**Step 3** — implement `buildDataFeed` + `writeDataFeed(report, outputPath)` using `writeJsonApiIfChangedSync` per §8 shape.

**Step 4** — wire into `src/generate-site.ts` near line 1219 (sibling of llms.txt block) using `pageableEvents`.

**Step 5** — add homepage `<link rel="alternate" type="application/ld+json">` in `src/templates/page.ts:128` (conditional on `url === 'index'` per §5). Test asserts presence on homepage, absence elsewhere.

**Step 6** — extend `dist/llms.txt` content (generate-site.ts:1185-1191) per §7. Test asserts new bullet present.

**Step 7** — extend schema-completeness validator with `validateDataFeed` (per Q-A5) — reads `dist/api/events.json`, validates `name`, `description`, `dateModified`, `dataFeedElement` mandatory fields.

**Step 8** — extend Component D's reporter to flip `datafeed_level: "measured"` (per Q-A2) — one-line change in `src/validators/completeness-reporter.ts` layers block + a test.

**Step 9** — full build verification: `bun run src/generate-site.ts`. Confirm `/api/events.json` written, ~17 MB raw, alternate-link in dist/index.html, llms.txt mentions DataFeed, build-completeness.json shows `datafeed_level: "measured"`.

**Step 10** — full test suite + tsc.

**Step 11** — single commit, paired commit-message format mirroring Component D's.

**Estimated session size:** larger than Component D (refactor + new generator + 3 discovery touchpoints + validator extension + layer flip). Pre-spec'd cut between Step 4 (DataFeed live in build) and Step 5 (discovery touchpoints). Two sessions if scope forces.

---

## What did NOT change during pre-flight

No `src/`, `config/`, or `dist/` files modified. Only `specs/component-a-preflight.md` created (this file).

Sprint 2 substrate intact:
- Sprint 1 contract (per-event JSON-LD shape, three-lane seller logic) preserved
- Component D measurement surface intact (baseline 7735/7974, 97% pass, 0 errors)
- ticket_url_resolved column untouched; Sprint 2.5 still unblocked

---

## Hand-off

Spec ready for Strategist (answer Q-A1, Q-A2, optionally Q-A4). Once confirmed, Dev Planner authors Component A session plan against the verified values in §1-§12.
