# Schema Coverage Manifest

**Purpose:** enumerate every emission surface that produces Schema.org-typed
output, the validator(s) that gate it, and the FAIL rules each validator applies.
Closes the emission/validation-scope drift class — the gap where a single
emission rule is implemented in a shared builder but only ONE call site uses
it, leaving silent emitters on parallel surfaces.

S110's whole reason for existing is this discipline; this manifest is the
structured artifact the patterns.md prose has been calling for since S101a-A's
microdata-vs-JSON-LD audit (`specs/s101a-implementation.md`).

**Rule:** when a new FAIL rule lands in any validator, the author MUST
enumerate every emission surface that produces the same entity type and
either (a) confirm the rule reaches that surface via existing dispatch, or
(b) extend the validator to cover the surface explicitly. Both options
require a row added to this manifest.

---

## Surfaces

### 1. Event detail page — JSON-LD Event entity

**Emitter:** `src/generators/event-page.ts` → `buildEventSchemaObject` →
`schema.offers` via `buildOfferOrOmit` (`src/ticketing/offer-builder.ts`).
**HTML location:** `dist/events/<slug>/index.html` `<script type="application/ld+json">` (Event-typed block, may be inside `@graph` envelope).
**Validator:** `validateSchemaCompleteness` (`src/validators/schema-completeness.ts:113`).
**FAIL rules applied:**
- All `validateOfferShape` rules (S139-fix Strategist 2026-05-20):
  price OR priceSpecification required; price numeric format; priceCurrency
  required; availability required; seller required (Organization with name,
  or same-page @id reference).
- Event-level structural rules: `@type` valid, mandatory fields, location.name, etc.
- **S143 required-inline rule (Strategist 2026-05-20):** `Event.location` must
  materialize `name` + `address` inline on the Event entity (bare-`@id` to a
  same-page venue node FAILs as `LOCATION_NOT_INLINE`). Runs **pre-resolution**
  — before `resolveSamePageReferences()` inlines `@id` refs — closing the
  literal-vs-graph blind spot where bare-`@id` `Event.location` passed the
  build but lost GSC Events-rich-result eligibility. `geo`/`sameAs`/
  `containedInPlace` stay on the canonical venue node (separate @graph member,
  same @id) and reach graph consumers via @id merge. Negative-control fixture
  is permanent at `src/validators/__tests__/schema-completeness.test.ts`.
- **S144 CROSS_LOCALE_CANONICAL (GEO 2026-05-21, universal):** Every dist page
  (event, hub, venue, homepage) must have `<link rel="canonical">` matching the
  page's own locale. /en/ pages MUST canonicalize to `/en/...`; bare-root pages
  MUST canonicalize to bare-root. Locale detection via `isEnLocalePath` anchors
  on the `/en/` path-prefix segment (NOT bare substring — avoids false-positives
  on slugs like `athens-en-route`). Fires on ANY phase (active/just-passed/
  cooling). Closes the regression class where /en/ pages canonicalized to
  bare-root, excluding /en/ from GSC eligibility.
- **S144 NOINDEX_ON_INDEXABLE_PHASE (GEO 2026-05-21, phase-keyed, Event pages):**
  Event-bearing pages whose lifecycle phase is `active` or `just-passed` (Day
  1-14 past per 45-Day Lifecycle) MUST NOT emit `<meta name="robots" content=
  "noindex">`. Phase computed via `getLifecyclePhase` (`src/utils/event-lifecycle.ts`),
  the SAME classifier the emitter uses — single source of truth, no parallel
  phase predicate. Cooling-phase noindex is lifecycle-correct and skipped by
  this guard. Locale-agnostic predicate; dormant-Greek noindex is a separate
  policy layer (Sprint 3/4, out of scope here).
- **Geo-presence check surface (GEO 2026-05-20):** `location.geo` WARN reads
  off the canonical venue node by `@id` lookup, NOT off the inline
  `Event.location` projection (which carries only the rich-result-required
  set: `@type` + `@id` + `name` + `address`). Registered here so the surface
  cannot silently re-drift when future required-nested rules ship. Residual
  geo WARNs are real venue-data gaps and route to Component B sameAs/geo
  backfill, not to the validator.
- **S142 organizer bare-`@id` emission (Strategist 2026-05-22, validated:partial):**
  `Event.organizer` emits as a bare-`@id` reference to the canonical venue
  node (`${BASE_URL}/venues/<slug>/#venue` — member 2). Two-fold gate:
  (a) `event.venue.sameAs?.length > 0` (Component-B identity-refs present),
  AND (b) `venueSlug` non-empty. The second gate is the **S146 entity-graph
  collision guard** — `slugify` on Greek-only canonical names returns ''
  (`normalize-greek.ts` strips diacritics but does not transliterate), and
  attaching organizer refs to `${BASE_URL}/venues//#venue` would converge
  every Greek-named venue's Wikidata identity graph onto a single corrupted
  node. The corresponding pre-existing corruption on the venueEntity push
  itself (`event-page.ts:~297` — `@id` colliding when slug empty) is the
  S146 cleanup target; S142 deliberately does not extend additional
  references onto it. Current coverage: ~41 emissions on Onassis Stegi
  events (the only Component-B venue with a Latin canonical name today);
  Megaron, GNO, Τεχνόπολη unlock once S146 lands a config-driven slug.
  S141 orphan-rule scope includes `'organizer'` in `ORPHAN_SCOPED_FRAGMENTS`,
  so an unresolved `#venue` ref would FAIL the build — pointing at the
  already-pushed canonical venue node sidesteps that. **Validator coverage
  status: partial.** `validateEventSchema` (`schema-validator.ts`) runs on
  `buildEventSchemaObject` (flat Event) and never sees @graph-only fields;
  per-field tier-add for `organizer` is deferred to the Stage 5 `flattenGraph`
  refactor (referenced in `event-page.ts:798-799` comment). Bare-`@id` is
  intentional — organizer is OPTIONAL per Schema.org so an unresolved `@id`
  would be cosmetic, not eligibility-breaking (the opposite side of the
  inline-required line that `Event.location` sits on per S143).
- **S146 venue-id-empty-slug rule (GEO 2026-05-22, FAIL):** Every emitted
  `@id` in dist HTML must have a non-empty slug segment. The class of bug
  this catches: `"@id": "https://agentathens.com/venues//#venue"` — empty
  slug between adjacent `//`. Pre-S146, ~172 Greek-named venues emitted
  this shape (slugify on Greek-only names returned `''`), collapsing every
  Greek venue's identity onto one corrupted graph node and breaking
  Component-B's `sameAs`→Wikidata identity strategy. Layer-1 fix (in
  `src/utils/venue-identity.ts`) makes empty slugs mathematically impossible
  at the helper output (cascade: config.slug → latin slugify → Greek
  transliteration → `venue-{hash}` fallback). Layer-2 (`validateVenueIdAndSlug`,
  `schema-completeness.ts`) is the build-time net catching any future site
  that bypasses the helper. Regex matches `//` AFTER the host segment only,
  so `https://` scheme `//` does NOT false-positive. Dry-run 2026-05-23
  validated 0 violations across 3,808 event pages before WARN→FAIL flip.
  Negative-control tests permanent in `schema-completeness.test.ts`.

### 2. Event detail page — microdata Event element  ⛔ `removed:2026-05-25:strip-post-s139`

**Status:** retired (commit `f02043922`, 2026-05-25). Microdata stripped from both event-detail (`src/generators/event-page.ts`) and hub-card (`src/templates/page.ts`) surfaces on 2026-05-25 per GEO Strategist ruling. JSON-LD is authoritative on both surfaces post-S139. `validateMicrodata` retired in the same commit (function deleted from `src/validators/schema-completeness.ts`; 4 call sites removed; test block deleted). Microdata is no longer emitted or validated on any surface; do not resurrect `validateMicrodata`.

**Why retired:**
- GSC counts JSON-LD + microdata as separate items, inflating field-completeness denominators and producing parallel-emission drift bugs (S101a price-vs-availability rules existed only because microdata had to mirror JSON-LD).
- Post-S139, JSON-LD covers every rich-result-eligible field with stronger structural guarantees (`@graph` envelope, same-page `@id` references, S143 inline-required rule, S139-fix Offer shape).
- The May EDP carve-out (which had left EDP microdata in place) was reversed by GEO Strategist 2026-05-25 ruling: strip both surfaces. Organizer/performer additions stay post-demo.

**What replaced it:** Surface #1 (Event JSON-LD) and Surface #3 (hub CollectionPage JSON-LD) carry the full rich-result-required field set. The S145 EVENT_MICRODATA_MISSING_LOCATION rule is moot — `Event.location` inline-with-`@id` requirement on Surface #1 (S143) is the equivalent invariant on the surviving surface.

### 3. Hub page — JSON-LD CollectionPage entity

**Emitter:** `src/utils/schema-graph-builders.ts buildCollectionPageMember` →
`mainEntity.itemListElement[].item` event objects with optional `offers`.
ListItem-nested Offers route through `buildOfferOrOmit` (S139-fix unification, 2026-05-20).
Per-item `image` field added 2026-05-25 via `getOgImage` (`src/utils/og-image-fallback.ts`),
mirroring the EDP JSON-LD image emission so hub items and EDP Event entities cannot drift on image presence (omit-on-empty: helper returns non-empty paths; absolute-URL guard kept explicit).
**HTML location:** `dist/<hub-slug>.html` `@graph` envelope, CollectionPage member.
**Validator:** `validateHubSchema` (`schema-completeness.ts:426`).
**FAIL rules applied:**
- CollectionPage structural: `@context`, name, mainEntity, ItemList type, inLanguage.
- **S139-fix nested-ListItem Offer FAIL rule (2026-05-20):** walks
  `CollectionPage.mainEntity.itemListElement[].item.offers` and applies all
  `validateOfferShape` rules with per-index context prefix
  (`CollectionPage.itemListElement[N].item.`). Closes the drift that produced
  15 price-less ListItem Offers in the 2026-05-20 production deploy.
- FAQPage structural (when present): `@context`, mainEntity Question array shape.
- **Per-item `image`** (2026-05-25): emitted by `buildItemListElements` via
  `getOgImage`. No FAIL rule on the validator side today — image is OPTIONAL
  per Schema.org Event; the omit-beats-fabricate posture keeps it that way.
  Test invariant in `page.test.ts` asserts non-empty absolute-URL string on
  every item, so emitter regressions surface at unit-test time.

### 4. Homepage — JSON-LD CollectionPage entity (inside @graph with WebSite + Organization)

**Emitter:** `src/utils/schema-graph-builders.ts buildHomepageGraph`.
**HTML location:** `dist/index.html` `@graph` envelope.
**Validator:** Currently NONE — homepage is not iterated by `validateAllPages`. **Coverage gap, registered as known-issue, slated for follow-up.** The shape comes from the same shared builders as the hub surface, so structural drift is unlikely, but the manifest must reflect the reality: no build-time check fires on the homepage envelope today.
**FAIL rules that WOULD apply if a validator covered it:**
- WebSite shape, CollectionPage shape, Organization shape
- ListItem-nested Offer shape (identical to surface 3)

### 5. Venue page — JSON-LD LocalBusiness entity

**Emitter:** `src/generators/venue-page.ts` (Stage 2 of S139 envelope migration).
**HTML location:** `dist/venues/<slug>/index.html` `@graph` envelope.
**Validator:** `validateVenueSchema` (`schema-completeness.ts:506`).
**FAIL rules applied:**
- LocalBusiness structural: `@type`, name, address.addressRegion (canonicalized),
  geo when present.
- Venue `sameAs`: severity decided by ratchet (Q-B1 + Q-B5).
- Nested `event[]` Offers: NOT currently validated. Coverage gap — venue pages emit upcoming-events with offers; the ListItem-style walk has not been added here. Slated for follow-up if Strategist confirms the venue surface is in-scope for the S139-fix rule (the venue-event Offers route through the same `buildOfferOrOmit`, so structural drift is unlikely, but the manifest must note the coverage gap).

### 6. DataFeed — `dist/api/events.json`

**Emitter:** `src/generators/datafeed.ts`.
**Validator:** `validateDataFeed` (`schema-completeness.ts:572`).
**FAIL rules applied:**
- DataFeed top-level structural: `@context`, `@type`, name, description, dateModified, dataFeedElement array shape.
- **Nested per-event Offers: NOT validated.** Coverage gap (same class as surface 5). DataFeed events route through `buildEventSchemaObject` which uses `buildOfferOrOmit`, so structural drift is unlikely, but the manifest must note this for completeness.

---

## Coverage gaps (open follow-ups)

| Surface | Gap | Severity | Trigger |
|---|---|---|---|
| Homepage (#4) | No build-time validator iterates `dist/index.html` JSON-LD | 🟡 | Add a `validateHomepageSchema` next session; reuse `validateHubSchema`'s ListItem walk. |
| Venue nested-events (#5) | `validateVenueSchema` doesn't walk `LocalBusiness.event[]` for nested Offers | 🟢 | Apply same walk pattern as #3 when next venue-page change lands. |
| DataFeed nested-events (#6) | `validateDataFeed` doesn't walk per-event Offers | 🟢 | Apply same walk pattern as #3 if a DataFeed-Offer drift incident surfaces. |
| Event JSON-LD (#1) — organizer field tiering | `validateEventSchema` cannot tier `organizer` (lives only in `@graph` envelope; validator reads flat `buildEventSchemaObject` output) | 🟢 | After Stage 5 `flattenGraph` refactor lands in `validateEventSchema`, add `organizer` to RECOMMENDED_FIELDS (warn-only). S142 emission already validated end-to-end via S141 orphan-rule (FAIL on unresolved `#venue` ref). |

These are catalogued, not blockers. Each gap's risk is mitigated by the
shared `buildOfferOrOmit` builder; the manifest exists so a future caller
that bypasses the builder will be caught by an explicit validator extension
rather than a silent production violation.

---

## Discipline

Before adding any new emission surface that produces a Schema.org entity:
1. Identify the entity type emitted.
2. Find the existing validator for that entity (or note that none exists).
3. Confirm the validator covers all FAIL rules that apply to other emitters of the same entity.
4. If a rule is missing on the new surface, extend the validator BEFORE the emitter ships.
5. Add a row to this manifest.

Before adding any new FAIL rule to any validator:
1. List every emission surface in this manifest that produces the entity type.
2. Confirm the rule reaches each surface (via shared validator dispatch OR explicit walk).
3. If a surface is uncovered, extend the validator to cover it in the same commit.

### Schema.org type-mapping tables — allowlist coupling (S139-fix-2)

Any module-level `Record<string, string>` mapping internal types to
Schema.org `@type` strings — `src/enrichment/quality-gates.ts`
`VENUE_TYPE_MAP` is the canonical case — MUST be coupled to a vendored
static allowlist in its colocated test file:

- The allowlist is a literal `Set` declared in the test. NO network
  fetch (no live schema.org / validator.schema.org lookup at test
  time). Build-as-invariant: tests must run offline + in CI sandboxes.
- A coverage assertion iterates `Object.values(MAP)` and asserts each
  is in the allowlist.
- A permanent negative-control assertion locks the historical defect
  shape (e.g. `'ExhibitionCenter'` not in the allowlist).

The friction is the feature. Adding a new mapping requires a deliberate
one-line allowlist addition; the explicit allowlist update is the
human checkpoint that catches the next "is this a real Schema.org
type?" miss. Pre-S139-fix-2: `VENUE_TYPE_MAP` shipped `'ExhibitionCenter'`
(not a Schema.org type) on three production surfaces because no test
asserted map values against the vocabulary.

Reference: `src/enrichment/__tests__/quality-gates.test.ts` →
`describe('VENUE_TYPE_MAP — Schema.org type validity (S139-fix-2)')`.

The 2026-05-20 incident (15 price-less ListItem Offers shipping past clean
build, caught only by validator.schema.org) is the canonical case study.
The `buildOfferOrOmit` shared builder was correct; the validator-side
emitted-Offer-shape rule covered the event-page surface only; the ListItem
emitter constructed Offer inline, drifted, and shipped silently.

**Reference:** Strategist ruling 2026-05-20 (`specs/s139-fix-diagnostic.md`).
