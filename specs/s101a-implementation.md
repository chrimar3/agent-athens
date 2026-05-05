# S101a Implementation Spec — Event-subtype Schema Audit

**Audit date:** 2026-05-04
**Sub-session:** S101a-A (audit + spec). S101a-B follows for implementation.
**Stream:** GEO/SEO infrastructure. GEO Strategist greenlit two FAIL rules: numeric-only `Offer.price` and present `Offer.availability`.

---

## §1 — Generator path map

### Type mapping

`SCHEMA_TYPE_MAP` at `src/enrichment/quality-gates.ts:832` is the **single source of truth** for DB `type` → schema.org `@type`:

| DB `type`                | schema.org `@type`     | Corpus count (non-cancelled) |
|--------------------------|------------------------|------------------------------|
| theater                  | TheaterEvent           | 10,197 (85%)                 |
| concert, dj_set          | MusicEvent             | 2,132                        |
| show, other              | Event (generic)        | 98                           |
| festival                 | Festival               | 33                           |
| performance              | DanceEvent             | 31                           |
| workshop, tech           | EducationEvent         | 30                           |
| exhibition               | ExhibitionEvent        | 16                           |
| cinema, screening        | ScreeningEvent         | 4                            |
| dance                    | (no map — falls to `Event`) | 1                       |

Imported by 6 sites: `src/utils/normalize.ts:6`, `src/db/database.ts:8`, `src/validators/schema-completeness.ts:11`, `src/generators/event-page.ts:20`, `src/generators/venue-page.ts:18`, plus self-reference in `quality-gates.ts:931`.

### Schema emission sites (Offer construction)

Three live emitters (one dead):

| # | Function                          | File:line                                      | Used by                                    | Offer source                  | eventStatus                                   | availability        |
|---|-----------------------------------|------------------------------------------------|--------------------------------------------|-------------------------------|-----------------------------------------------|---------------------|
| 1 | `buildEventSchemaObject()`        | `src/generators/event-page.ts:144`             | event-detail JSON-LD + DataFeed (`/api/events.json`) | `event.price.amount` (numeric) | `resolveEventStatus()` (dynamic, date-derived) | `availabilityForEventStatus()` (dynamic, omit on past) |
| 2 | `generateSchemaMarkup()` (hub)    | `src/templates/page.ts:395`                    | hub CollectionPage JSON-LD (this-weekend, theater, etc.) | `event.price.amount.toString()` (numeric) | `resolveEventStatus()` (dynamic) | **hardcoded `InStock`** (line 429) |
| 3 | `renderEventCard()` **microdata** | `src/templates/page.ts:283`                    | hub event cards (HTML microdata, `itemprop="price"`) | `priceText` from `prepareCardData()` — **`'€${event.price.amount}'`** at line 247 | `resolveEventStatus()` via `<meta itemprop="eventStatus">` line 303 | **not emitted at all** in microdata |
| — | `generateSchemaOrg()` (DEAD)      | `src/enrichment/quality-gates.ts:929`          | **No production callers.** Exported but unused. Safe to remove or treat as test-only. | n/a                          | n/a                                           | n/a                 |

### Card variants (no microdata schema)

`src/templates/card-variants.ts` (`renderEventCardList`, `renderFeatureCard`, `renderFeaturedEventCard`) reuses `prepareCardData()` but emits `priceText` as plain text `<span class="card-price">${priceText}</span>` — **no `itemprop="price"`**. These do not produce schema violations.

### Unification target

GEO Strategist flagged Offer assembly duplication. Confirmed: emitters #1 and #2 both build Offer objects independently. Offer construction is not factored into a shared helper. priceCurrency centralization exists (`getCurrencyCode()` at `src/utils/schema-geo.ts:170`). availability centralization exists (`availabilityForEventStatus()` at `src/utils/schema-geo.ts:143`) **but only emitter #1 calls it.**

`priceSpecification` / `UnitPriceSpecification`: **no emit branch exists in any emitter.** DB has `price_advance` and `price_door` REAL columns with tier data — currently unused infrastructure. Out of scope for S101a-B unless GEO Strategist requests; flag in §7.

---

## §2 — Validator coverage map

### File

`src/validators/schema-completeness.ts` — single validator file for event/hub/venue/datafeed pages. Called from `generate-site.ts` build pipeline at session-end.

### Coverage matrix

| Surface                          | Function                          | Subtypes covered | Iterates JSON-LD only? | Microdata? |
|----------------------------------|-----------------------------------|------------------|------------------------|------------|
| Event detail pages               | `validateSchemaCompleteness()`    | All (via `VALID_SCHEMA_TYPES = Set(values(SCHEMA_TYPE_MAP))` at line 16) | Yes (line 86 regex `<script type="application/ld+json">`) | **No** |
| Hub pages                        | `validateHubSchema()`             | CollectionPage + ItemList structural only | Yes | No |
| Venue pages                      | `validateVenueSchema()`           | LocalBusiness | Yes | No |
| DataFeed (`/api/events.json`)    | `validateDataFeed()`              | DataFeed structural | Yes (parses JSON file) | n/a |

### Existing FAIL rules (Strategist 2026-04-29 spec)

`schema-completeness.ts:166-209` already enforces on `offers.*`:

- **Line 170-175:** `offers.price` must be numeric; `/[€$£¥]/.test(price)` rejects symbols → `errors.push('offers.price must be numeric, got "${price}"')`. **This rule already exists.**
- **Line 178-180:** Empty price string → warning ("should be numeric or omitted").
- **Line 182-184:** `offers.priceCurrency` missing → error.
- **Line 186-188:** `offers.availability` missing → error. **This rule already exists.**
- **Line 192-203:** `offers.seller` must be Organization-typed with non-empty name → error.

### Gap categorization (per spec template)

- (a) Validator runs on TheaterEvent but rule has hole — **NO**, the rule exists for JSON-LD.
- (b) Validator never runs on TheaterEvent — **NO**, all subtypes covered uniformly.
- (c) Validator runs but `priceSpecification` path has no rule — **YES** (latent: no emitter currently emits `priceSpecification[]` either, so dormant gap).
- **(d, new) Validator scope < emission scope** — **YES, primary gap.** The validator parses JSON-LD only. Microdata at `renderEventCard()` is invisible to the validator. The 11,217 microdata violations on hub cards never appear in `printSchemaSummary` output, so build "passes" while emitting violation-prone microdata.

---

## §3 — Normalization layer location

### Canonical price normalizer

`normalizePrice()` at `src/utils/normalize.ts:125-225`. Parses raw scraper price strings into `{ type, amount, currency, range }`:
- `amount`: number (clean, parsed via `parseFloat`/`parseInt`)
- `currency`: `'EUR'` (always)
- `range`: **intentionally a display-formatted string** with `€` symbols (e.g., `range: '€${match[1]}'` at lines 150, 161, 170, etc.)

`range` is **a display field, not a schema field.** It exists for the user-facing card text. Schema should always pull from `amount` + `currency`. The bug is downstream consumers using `range` (or formatting `amount` with `€` prefix) for schema attributes.

### DB columns and cleanliness

| Column                 | Type        | Cleanliness                          | Use                                  |
|------------------------|-------------|--------------------------------------|--------------------------------------|
| `price_amount`         | REAL        | **100% clean** (0 contaminated rows) | Numeric value for schema             |
| `price_currency`       | TEXT (`EUR` default) | Clean (single currency)      | Schema priceCurrency                 |
| `price_range`          | TEXT        | Display-formatted (contains `€`)     | UI display only; **never schema**    |
| `price_type`           | TEXT NOT NULL (`with-ticket` \| `tba` \| `open`) | Clean enum   | Decides Offer presence               |
| `price_advance` / `price_door` | REAL | Clean numeric                       | Currently unused in schema (potential `priceSpecification[]` source) |

### Per-source variance

All 11,217 violations flow through the same `renderEventCard` template regardless of source. Source distribution drives **frequency**, not fix shape:
- athinorama.gr — 10,205 (91%)
- more.com — 530
- residentadvisor — 164
- ticketservices — 137
- halfnote — 61
- megaron.gr — 58
- clubber.gr — 53
- onassis — 7
- manual — 2

**Conclusion:** No new normalization helper needed. Data is pristine. Fix is purely emitter-side at the template layer. `normalize.ts` does not need to change.

---

## §4 — Hub ItemList state

**Verified against live https://agentathens.com/this-weekend (2026-05-04):**

```jsonc
// First ListItem on this-weekend hub:
{
  "@type": "ExhibitionEvent",
  "@id": "https://agentathens.com/events/<slug>/",       // ✓ present
  "name": "...",
  "description": "...",
  "startDate": "...",
  "endDate": "...",                                       // ✓ present
  "eventStatus": "https://schema.org/EventScheduled",
  "isAccessibleForFree": false,
  "location": { ... },
  "offers": {
    "@type": "Offer",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock"
  }
}
```

**Both `@id` and `endDate` are already emitted.** S101a Phase 0 hypothesis is stale (silently fixed in some prior session — likely the same session that introduced `resolveSchemaEndDate()` at `templates/page.ts:387`).

**Sample TheaterEvent on `/theater` hub JSON-LD:** `{"@type":"Offer","price":"15","priceCurrency":"EUR","availability":"https://schema.org/InStock"}` — clean numeric, no symbol.

**Sample TheaterEvent detail page JSON-LD:** Also clean. Uses `buildEventSchemaObject` → `event.price.amount` directly.

**§6 narrows accordingly:** No hub ItemList work needed in S101a-B.

---

## §5a — Price format violation analysis

### Violation surface

**Location:** `src/templates/page.ts:301` (microdata) — the only emitter that reuses `priceText` (display string with `€`) inside `<span itemprop="price">${priceText}</span>`. Source of `priceText` is `prepareCardData()` line 247: `priceText = '€${event.price.amount}'`.

JSON-LD on hub (line 423-430) and detail pages (`event-page.ts:284`) both pull from numeric `price.amount` and emit clean values.

### Counts

```
Total violation surface (microdata cards with € symbol): 11,217
Confirmed live on /theater hub: 18 of 21 cards have € in <span itemprop="price">

Distribution by event type:
  theater       9,580 (85.4%)
  concert       1,271 (11.3%)
  dj_set          217  (1.9%)
  show             94
  performance      25
  festival         17
  exhibition        7
  cinema            3
  tech              2
  workshop          1

Distribution by source:
  athinorama.gr    10,205 (91.0%)
  more.com            530
  residentadvisor     164
  ticketservices      137
  halfnote             61
  megaron.gr           58
  clubber.gr           53
  onassis               7
  manual                2

Secondary surface (price_range fallback when amount is null):  114 events
  Sample fallback values: "Δωρεάν", "with-ticket", "Door price", "€0 - €8", "€0"
```

### Data-vs-emitter-layer fix shape

**Diagnostic:** Step F confirmed `price_amount` is 100% clean numeric (0 contaminated rows). The generator at `prepareCardData()` formats numeric → display string with `€`, then reuses that string for the schema attribute. Both feasibility conditions for the emitter-side path are met:

1. **`price_amount` is clean numeric across the corpus** ✓ (REAL column, 0 violations on `CAST(price_amount AS TEXT) GLOB '*[a-zA-Z€$£]*'`)
2. **Generator can be redirected** ✓ — split display from schema in `renderEventCard`. Pass `String(event.price.amount)` to `<span itemprop="price">`, keep `€${event.price.amount}` in the user-visible portion. Estimated change: ~5 lines in `templates/page.ts`.

### Recommendation

**`emitter-side-fix-zero-backlog`**

Rationale: data layer is pristine; fix is one ~5-line change at `templates/page.ts:283-306`; next nightly build emits clean microdata for all 11,217 events at once; no back-validation session needed; no scraper changes; no DB migration. Single-source-dominated source distribution (91% athinorama.gr) is irrelevant when the fix is downstream of all sources.

---

## §5b — Availability mapping analysis

### Mechanism status

`availabilityForEventStatus()` at `src/utils/schema-geo.ts:143-156` **fully implements the Strategist 2026-04-29 spec**:

| eventStatus                                  | Result                              |
|----------------------------------------------|-------------------------------------|
| `EventScheduled` / `EventPostponed` / `EventRescheduled` | `{ kind: 'emit', value: InStock }` |
| `EventCancelled`                             | `{ kind: 'emit', value: Discontinued }` |
| `EventCompleted`                             | `{ kind: 'omit_offer' }`            |
| default                                      | `{ kind: 'emit', value: InStock }`  |

### Caller wiring (the gap)

| Emitter                                  | Calls `availabilityForEventStatus()`? | Actual behavior                            |
|------------------------------------------|---------------------------------------|--------------------------------------------|
| `buildEventSchemaObject` (event-page #1) | ✓ (line 227)                          | Correctly omits Offer on past events       |
| `generateSchemaMarkup` (hub #2)          | ✗ — hardcoded `availability: 'InStock'` (line 429) | Past events on hub still emit InStock |
| `renderEventCard` microdata (#3)         | ✗ — no availability emitted at all     | No `<meta itemprop="availability">`        |

### Upstream signal status

`resolveEventStatus()` at `src/utils/schema-geo.ts:99-129` **only ever returns `EventScheduled` or `EventCompleted`**. There is no upstream path producing `EventPostponed`, `EventRescheduled`, or `EventCancelled`:

- **`EventPostponed` / `EventRescheduled`:** No DB column for postponement. The branches in `availabilityForEventStatus` are dormant.
- **`EventCancelled`:** DB has `is_cancelled` (INTEGER, default 0). Currently the canonical query at `src/db/database.ts` filters `WHERE is_cancelled = 0` — cancelled rows never reach emission. So `EventCancelled` is also dormant.

### Distribution

```
is_cancelled = 0  : ~12,540  (emitted)
is_cancelled = 1  :     ~30  (filtered, never emitted)
```
Exact counts:
- `is_cancelled=0`: 12,510
- `is_cancelled=1`: estimated <50 — small population, see §7 for question on whether to surface as `EventCancelled`/`Discontinued` instead of filtering.

### Recommendation

**`fits-S101a-B`** — but reframed as **architectural unification, not violation count.**

Scope for S101a-B:
1. Make `generateSchemaMarkup` (hub) call `availabilityForEventStatus(resolveEventStatus(...))` instead of hardcoding `InStock`.
2. Make `renderEventCard` microdata emit `<meta itemprop="availability">` using the same helper.
3. Detail-page emitter (`buildEventSchemaObject`) is already correct — leave it alone.

Out of scope for S101a-B (defer to GEO Strategist Q3, see §7):
- Whether `is_cancelled=1` rows should reach emission as `EventCancelled` instead of being filtered.
- Whether to introduce a `postponement_status` DB column to ever emit `EventPostponed`/`EventRescheduled`.

---

## §6 — Proposed S101a-B sequence

### Files to modify

| Order | File                                                            | Change scope    | Purpose                                                                                                    |
|-------|-----------------------------------------------------------------|-----------------|------------------------------------------------------------------------------------------------------------|
| 1     | `src/templates/page.ts`                                         | ~10 lines       | (a) `renderEventCard:301` — emit numeric in `<span itemprop="price">`, keep display string elsewhere. (b) `:303` add `<meta itemprop="availability">` derived from `availabilityForEventStatus(resolveEventStatus(...))`. (c) `generateSchemaMarkup:429` replace hardcoded `'https://schema.org/InStock'` with helper call. (d) Handle the 114 `price_range`-fallback edge case: omit `<span itemprop="price">` entirely when no numeric amount. |
| 2     | `src/templates/page.ts` (`prepareCardData`)                     | ~3 lines        | Add `numericPriceForSchema: string \| null` field (returns `String(event.price.amount)` or `null`) so `renderEventCard` can use it without re-deriving.                                              |
| 3     | `src/validators/schema-completeness.ts`                         | ~30 lines (new function) | Add `validateMicrodata(html)` that scans `<span itemprop="price">` and `<meta itemprop="availability">` on hub/event pages. Apply same `[€$£¥]` regex + presence check as JSON-LD rules. Wire into `validateAllPages` for hub pages. Closes the §2 gap (d). |
| 4     | `src/templates/__tests__/page.test.ts` (or new)                 | ~40 lines (new tests) | TDD red→green: (i) `renderEventCard` emits numeric `itemprop="price"`, no `€` symbol; (ii) `<meta itemprop="availability">` present and valid for scheduled/cancelled/past events; (iii) hub `generateSchemaMarkup` Offer.availability matches helper output; (iv) `price_range`-fallback events omit `itemprop="price"` rather than emitting garbage. |
| 5     | `src/validators/__tests__/schema-completeness.test.ts`          | ~20 lines (new tests) | Microdata validator: (i) symbol in `itemprop="price"` → error; (ii) missing `itemprop="availability"` on with-ticket card → error; (iii) past-event card with `EventCompleted` legitimately omits availability → no error. |

### Estimated total

~100 lines including tests. Single session. Zero data layer / scraper / DB changes. Zero migrations. No back-validation needed — next `bun run src/generate-site.ts && bun run scripts/audit-aria.ts && bun run src/generate-site.ts` cycle emits clean output for all 11,217 violations at once.

### TDD red→green per FAIL rule

**Rule 1 (numeric `Offer.price`):**
1. Write microdata-validator test asserting current `renderEventCard` output fails new regex check → **red**
2. Add `validateMicrodata` rule scanning `itemprop="price"` for `[€$£¥]` → still red (test scaffolding works)
3. Modify `renderEventCard:301` to emit `String(event.price.amount)` in microdata → **green**
4. Verify by running `bun test` + `bun run src/generate-site.ts && grep '<span itemprop="price">€' dist/theater.html` returns 0 hits

**Rule 2 (present `Offer.availability`):**
1. Write microdata-validator test asserting current `renderEventCard` lacks `<meta itemprop="availability">` → **red**
2. Add validator rule requiring `itemprop="availability"` on cards where `itemprop="price"` is present → still red
3. Modify `renderEventCard:303` to emit `<meta itemprop="availability" content="${availabilityForEventStatus(resolveEventStatus(...)).value or omit}">` → **green**
4. In parallel, fix hub JSON-LD at `generateSchemaMarkup:429` to call helper instead of hardcoding → existing JSON-LD validator catches if regression introduced

### priceSpecification handling

Out of scope for S101a-B. No emitter currently produces `priceSpecification[]`. The validator gap (c) remains latent. If GEO Strategist later asks for `UnitPriceSpecification[]` emission from `price_advance`/`price_door` (DB infra exists), spec it as S101a-D or later.

### Back-validation closure

**Closes in S101a-B.** No need for S101a-C. Verification command after the build:
```bash
bun run src/generate-site.ts \
  && grep -c '<span itemprop="price">€' dist/*.html  # expect 0
  && grep -c '<span itemprop="price">€' dist/en/**/*.html  # expect 0
  && grep -oE '"availability":"[^"]*"' dist/api/events.json | sort -u  # expect only InStock and (sometimes) Discontinued
```

---

## §7 — Open questions for GEO Strategist

1. **`is_cancelled=1` events** are currently filtered at query time and never reach schema. The `availabilityForEventStatus` helper supports `EventCancelled` → `Discontinued`, and Google's rich-results spec recommends keeping cancelled events visible with a clear status. Should S101a-B introduce a path that emits cancelled events with `eventStatus=EventCancelled` + `availability=Discontinued` instead of hiding them? (Or split into a separate session?)

2. **`EventPostponed` / `EventRescheduled` infrastructure.** The helper supports both, but no DB field exists to feed them. Is this a planned future capability (would need a `postponement_status` column + scraper signal), or are these helper branches intentionally dormant for symmetry with the Strategist 2026-04-29 spec? If the former, scope it as S101b.

3. **`priceSpecification[]` / tier pricing.** `price_advance` and `price_door` REAL columns exist with data but are unused by all emitters. Should S101a-B emit `UnitPriceSpecification[]` when both are present (advance vs door tier)? This would be a new emit branch in `buildEventSchemaObject` and require a corresponding validator rule (gap §2(c)). Or defer to S102?

4. **Dead code removal:** `generateSchemaOrg` at `src/enrichment/quality-gates.ts:929` has no production callers. Safe to remove in S101a-B, or keep for tests / documentation? (Confirms `SCHEMA_TYPE_MAP` consumers.)

5. **`<dance>` event type → no SCHEMA_TYPE_MAP entry**, falls through to generic `Event`. Single corpus row, but a one-line fix to add `dance: 'DanceEvent'` to the map. In scope for S101a-B or out?

---

## Verification (the audit is complete when)

- [x] `specs/s101a-implementation.md` exists
- [x] All 7 sections present (§1 / §2 / §3 / §4 / §5a / §5b / §6 / §7 — count is 8 because §5 split)
- [x] §5a contains explicit integers (11,217 / 9,580 / 1,271 / 10,205 / etc.)
- [x] §5a recommendation is one of: `scraper-fix-self-corrects` | `fits-S101a-B` | `needs-S101a-C` | `emitter-side-fix-zero-backlog` → **`emitter-side-fix-zero-backlog`** (both feasibility conditions confirmed)
- [x] §5b uses one of the four recommendations OR explicit "architectural-gap, no count" framing → **`fits-S101a-B`** (architectural unification, not violation count)
- [x] §6 lists files with paths and estimated change scope (5 entries: 1 source file modified at 2 functions, 1 validator extended, 2 test files)
- [x] §7 lists 5 open questions
