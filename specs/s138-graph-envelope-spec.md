# S138 — `@graph` Envelope Migration Spec

**Status:** audit-only. No code, no tests, no config changes from this session.
**Output:** navigational. Locks decisions that S139 (implementation), S141 (orphan-FAIL + canonical-page sequencing + validFrom register), and S142 (organizer emission + validator extension) all depend on.
**Authority:** Strategist closure on S134 (`specs/s134-step-0-verifications.md` §0a, §3) defining Sprint 3 scope as the consolidated `@graph envelope + @id scheme + canonical-page sequencing + orphan-seller validator promotion to FAIL across Place, Performer, Organization, Organizer`. Diagnostic provenance: `specs/gsc-schema-defects-2026-05-19-diagnostic.md:143`.

---

## Section 1 — Current state (audit findings)

### 1.1 Per-page-class emission inventory

Sampled HTML output 2026-05-19 against `dist/` from latest build. All four page classes emit **flat, single-rooted JSON-LD with no `@id` and no `@graph` envelope** today.

| Page class | Sample path | Blocks | Top-level `@type` | `@id` | `@graph` | Notable nested |
|---|---|---|---|---|---|---|
| Event | `dist/events/4fb6b551--ejekt-festival-2026-florence-the-machine/index.html` | 1 | `Festival` | ✗ | ✗ | `EventVenue` → `containedInPlace` → `Place` (3-deep neighborhood→city→region chain), `Offer`, `Organization` (seller) |
| Venue | `dist/venues/171-187/index.html` | 1 | `LocalBusiness` | ✗ | ✗ | `PostalAddress`, nested `Place` (containedInPlace chain), `MusicEvent` (upcoming event reference, inline) |
| Hub | `dist/ai-tech.html` | 1 | `CollectionPage` | ✗ | ✗ | `mainEntity` → `ItemList` → `ListItem` → event objects with `@id` to canonical event URL |
| Homepage | `dist/index.html` | **2** | `CollectionPage` + `Organization` | ✗ | ✗ | CollectionPage with `ItemList`; second flat block is `Organization` (publisher) |

**Key observation:** the homepage already proves that nothing in the consumer stack (Googlebot, GSC, AI crawlers) breaks on multiple flat blocks — but cross-block `@id` resolution is not portable. Per the locked Yoast guidance referenced in S134 closure (§3), same-page `@graph` is the canonical envelope.

### 1.2 Emitter site inventory

Source map of every `application/ld+json` script-tag emitter and every `@context` construction site:

| Emitter | File:line | `@type` emitted | Notes |
|---|---|---|---|
| Event detail page | `src/generators/event-page.ts:154` (`buildEventSchemaObject`) → `:432` (script tag) | `Event` / `MusicEvent` / `Festival` / `ExhibitionEvent` / `TheaterEvent` / `EducationEvent` etc. via `SCHEMA_TYPE_MAP` | Flat root; nested `location` (EventVenue), `containedInPlace` chain (via `buildContainedInPlace`), optional `Offer` with inline `seller` Organization |
| Venue detail page | `src/generators/venue-page.ts:64` (schema) → `:176` (script tag) | `LocalBusiness` | Includes `containedInPlace` chain; inline upcoming-events listing |
| Venues index | `src/generators/venue-page.ts:344` → `:373` | `ItemList` (of venues) | Separate emitter; emits at `dist/venues/index.html` |
| Hub page | `src/generators/hub-page.ts:239` → `:251` (`generateSchemaMarkup`) | `CollectionPage` with `mainEntity` `ItemList` | Each `ListItem.item` already carries `@id` per `src/templates/page.ts:467` — partial precedent for URL-based `@id` |
| Hub FAQ | `src/generators/hub-page.ts` (`renderFaqSchema`) | `FAQPage` | Currently emitted as a separate flat block on cornerstone hubs |
| Editor picks | `src/templates/editor-picks.ts:55,61,82` | `ItemList` | **Only existing `@id` emitter in the project**: emits `@id: ${pageUrl}#editor-picks` plus per-item `ListItem.item.@id` pointing at canonical event URL. Establishes the URL-with-fragment precedent. |
| Homepage Organization | `src/templates/page.ts:141` (gated `url === 'index'`) | `Organization` | **Source: `ORGANIZATION_SCHEMA` constant at `src/utils/schema-geo.ts:186`.** Brief misattributed this to `generate-site.ts`; only generate-site reference is `:669-670` which reads the constant for sitemap context, not JSON-LD emission. |
| Site CollectionPage shell | `src/templates/page.ts:138` | varies — passed in by caller as `schemaMarkup` template var | This is the universal injection point; per-page-class generators produce the inner schema |
| Content page | `src/templates/content-page.ts:38` | varies — `options.schemaJson` | Used for static content pages (about, etc.); minimal emission |
| DataFeed | `src/generators/datafeed.ts:21,36` | `DataFeed` | Emits to `dist/api/events.json` (file, not HTML); `dataFeedElement` is array of Event objects. **Out of HTML envelope scope** — consumer reads it as a list, not a page. |
| Editor-picks `<link rel="alternate">` | `src/templates/page.ts:135` (homepage only) | n/a (link tag) | Sprint 2 A — points crawlers at the DataFeed |

### 1.3 Validator topology

| Validator | File:line | Consumes | Severity registry |
|---|---|---|---|
| `validateSchemaCompleteness` | `src/validators/schema-completeness.ts:113` | Event detail HTML | `MANDATORY_FIELDS` / `RECOMMENDED_FIELDS` / `INFO_FIELDS` at `src/utils/schema-validator.ts:24,44,57` (flat dot-path arrays); inline seller shape check at `:265-279` |
| `validateHubSchema` | `src/validators/schema-completeness.ts:349` | Hub HTML | Inline rules: CollectionPage + ItemList + FAQPage presence and shape |
| `validateVenueSchema` | `src/validators/schema-completeness.ts:427` | Venue HTML | Inline rules: LocalBusiness shape, `addressRegion` lock (Q-B6), `sameAs` severity gate (Q-B1/Q-B5, ratchet-driven) |
| `validateDataFeed` | `src/validators/schema-completeness.ts:492` | `dist/api/events.json` | Inline rules per Schema.org DataFeed spec |
| `validateMicrodata` | `src/validators/schema-completeness.ts:545` | Hub + event HTML (microdata, parallel emission surface) | Inline rules; S101a-B post-mortem closure |
| `extractAllJsonLd` | `src/validators/schema-completeness.ts:332` | All HTML | **Already iterates all `<script type="application/ld+json">` blocks.** Returns `Record<string, any>[]`. Graph-aware refactor is additive, not rewriting. |

### 1.4 Existing `@id` and cross-reference state

- **Two emitters use `@id` today.** Hub `ListItem.item.@id` (`src/templates/page.ts:467`) and editor-picks `ItemList.@id` + per-item `@id` (`src/templates/editor-picks.ts:55,61`). Both follow URL-based fragment-identifier scheme: `${BASE_URL}/events/{slug}/` for items, `${pageUrl}#editor-picks` for the list root. **This is the project's emerging convention** — Section 2 locks it as canonical.
- **No `@id` on Event root, Place root, LocalBusiness root, Organization root, or seller.** Sample audit confirmed zero occurrences of `@id` in event detail JSON-LD across the Florence sample and a probe of an Offer-bearing event (`dist/events/00013a1f--phantom-spell/`).
- **No orphan-reference validation exists.** Direct verification (s134-step-0-verifications.md:158): `grep -nE "orphan|seller\.@id|seller-shape" src/validators/*.ts` → no matches. Sprint 1's seller work (offer-validator at schema-completeness.ts:265-279) checks `@type === 'Organization'` and `name` non-empty only — no `@id`, no cross-reference resolution.
- **`containedInPlace` chain is already nested inline** (S27, `src/utils/schema-geo.ts:76` `buildContainedInPlace`). Inline nesting survives the envelope migration unchanged: Place entities in the chain don't need their own `@id` unless they correspond to a canonical page elsewhere. S139 should not flatten the chain.

---

## Section 2 — Target shape: the `@graph` envelope

### 2.1 LOCKED: Per-page `@graph`, not page-class-shared `@graph`

**Decision:** Each HTML page emits exactly one `<script type="application/ld+json">` block wrapping all entities the page references in a single `@graph` array.

**Rationale:**
- Yoast canonical reading (referenced in S134 §3 closure): cross-page `@id` resolution is unreliable; crawlers resolve `@id` only within the same JSON-LD block.
- Multiple flat blocks (current state on homepage) are tolerated but force consumers to do reference resolution across blocks, which most don't.
- Single-block-per-page collapses ambiguity. Every `@id` reference in the block resolves either (a) to another entity in the same `@graph`, or (b) to a canonical URL that consumers can dereference if they choose.

**Consequence for homepage:** the two currently-flat blocks (CollectionPage + Organization) collapse into one `@graph` with both entities as members.

### 2.2 LOCKED: URL-based `@id` with fragment identifiers

**Canonical scheme:**
```
Event:        https://agentathens.com/events/{slug}/#event
Venue:        https://agentathens.com/venues/{slug}/#venue
Organization: https://agentathens.com/#organization
WebSite:      https://agentathens.com/#website
ItemList:     {pageCanonicalUrl}#itemlist  (or #editor-picks where applicable)
CollectionPage: {pageCanonicalUrl}#collectionpage
FAQPage:      {pageCanonicalUrl}#faqpage
```

**Rationale:**
- URLs are dereferenceable — debugging is "open the URL," not "look up an opaque UUID."
- Fragment identifiers scope identity to the page context, satisfying Yoast's same-page-resolution rule while leaving the URL stem pointing at the canonical entity page.
- Stable across rebuilds (UUIDs would force a registry; URLs derive from the same slug pipeline that already produces canonical URLs).
- Multi-city replicability: the URL prefix (`agentathens.com`) varies per city deployment; the fragment scheme is universal.
- Already partial-precedent in `editor-picks.ts` (`${pageUrl}#editor-picks`). Migration extends an existing pattern; it doesn't introduce a new one.

**`{slug}` source rule:** event `@id` derives from `generateEventSlug(event)` (existing helper used at `src/generators/event-page.ts` and `src/templates/page.ts:467`). Venue `@id` derives from the canonical venue page slug (`dist/venues/{slug}/`), **not** from the venue registry `canonical_name` — Section 5 notes this as a potential ambiguity to confirm if dist-slug and registry-name diverge.

### 2.3 `@graph` member inventory per page class

**Event page `@graph` members:**
1. `Event` (was top-level). `@id`: `{eventCanonicalUrl}#event`.
2. `MusicVenue` / `EventVenue` / `Place` (location entity). `@id`: `{venueCanonicalUrl}#venue` **when** the venue corresponds to a canonical venue page; otherwise no `@id` (anonymous inline entity). `containedInPlace` chain stays nested inline — those Place entities are not canonical pages.
3. `Offer` (S134 classifier-gated). No `@id` (anonymous; Offer identity is event-scoped).
4. **Seller** — inline `Organization` or dual-typed `['Place', 'Organization']` per S134 venue_direct_only branch. Migration target: `Organization` becomes a `@graph` member with `@id` (`https://{seller-domain}/#organization` for known sellers; per-seller registry to be defined in S139 if not already implicit). `Offer.seller` becomes `{ "@id": "..." }` reference.
5. **Organizer** (S142). `@type: Organization` or `Place`+`Organization` dual when the event venue is Component-B-eligible (institutional canonical). `Organizer.@id` references the same venue entity's `@id` already present in the `@graph` as member 2 — **this is the cross-reference that motivates putting venue in the same `@graph` even though it also has a canonical page**.
6. `Organization` — site publisher. `@id: https://agentathens.com/#organization`. Present on every page (singleton, repeated by URL identity).

**Venue page `@graph` members:**
1. `LocalBusiness` / `MusicVenue` / etc. (was top-level). `@id: {venueCanonicalUrl}#venue`.
2. `containedInPlace` chain — inline nested, no `@id` (matches event page).
3. `Organization` — site publisher (singleton, `@id` to homepage).
4. Inline upcoming-events listing — current shape preserved (each event a flat member with `@id` reference to canonical event page). Whether to materialize each event as a full `@graph` member or keep the lightweight reference-only entries is a S139 implementation question; both are valid Schema.org and both satisfy crawler expectations.

**Hub page `@graph` members:**
1. `CollectionPage` (was top-level). `@id: {hubCanonicalUrl}#collectionpage`.
2. `ItemList` — already a child of CollectionPage's `mainEntity`. Keep nested (no need for top-level promotion); but the inner `ListItem.item.@id` URLs continue to point at canonical event pages (cross-page reference, dereferenceable).
3. `FAQPage` (when cornerstone). `@id: {hubCanonicalUrl}#faqpage`.
4. `ItemList` (editor picks, when cornerstone, per S114). `@id: {hubCanonicalUrl}#editor-picks`.
5. `Organization` — site publisher (singleton).

**Homepage `@graph` members:**
1. `WebSite`. `@id: https://agentathens.com/#website`. (Introduce; not currently emitted.)
2. `Organization` — canonical publisher entity (already emitted, becomes `@graph` member). `@id: https://agentathens.com/#organization`.
3. `CollectionPage` — homepage's existing CollectionPage block (becomes member). `@id: https://agentathens.com/#collectionpage`.
4. DataFeed `<link rel="alternate">` stays as-is (HTML link element, not part of `@graph`).

### 2.4 Same-page-materialization rule (cross-page references)

When an event page references a venue that has a canonical page:
- **Always** include the venue as a full `@graph` member with `@id` matching the canonical venue page URL (`{venueCanonicalUrl}#venue`).
- The `Event.location` field uses `{ "@id": "..." }` reference syntax (Schema.org-valid; resolves same-page).
- The full venue entity is duplicated minimally (name, address, geo, containedInPlace) — this lets same-page resolution succeed without crawlers having to fetch the venue page.
- The canonical venue page's `@graph` is the authoritative source if a crawler does dereference.

**Rationale:** Yoast same-page resolution + Schema.org cross-page resolution both succeed. Duplication is cheap (a few hundred bytes per event page) and resolves the entity-identity question unambiguously.

---

## Section 3 — Validator topology changes

### 3.1 Extraction layer (already graph-compatible)

`extractAllJsonLd` at `src/validators/schema-completeness.ts:332` already iterates all blocks. The S139 change is **additive**: after extraction, introduce a graph-flattening step that, for each block, checks for `@graph` and yields each member as if it were a top-level block (preserving the rest of the validator's filter-by-`@type` pattern).

Pseudo-shape (descriptive only, not for implementation in this spec):
```
blocks = extractAllJsonLd(html)            # existing
entities = flattenGraph(blocks)            # new: yields @graph members + flat blocks
eventEntity = entities.find(@type=Event)   # existing pattern, unchanged
```

This is **~30 lines of new code** in schema-completeness.ts plus a helper, not a rewrite. The flat-path lookups in `MANDATORY_FIELDS` / `RECOMMENDED_FIELDS` / `INFO_FIELDS` continue to work against individual entities post-flattening.

### 3.2 Orphan-reference validation (new in S141)

S138 spec scope: define what S141 implements; S141 implements it.

**Rule:** Whenever an entity emits an `@id` reference (`Event.location.@id`, `Event.organizer.@id`, `Offer.seller.@id`, `ListItem.item.@id`, etc.), the validator must confirm that a matching `@id` exists either (a) in the same page's `@graph` (preferred), or (b) at a canonical URL that the validator can recognize as an internal site URL (the URL stem matches a dist page). External `@id` references (e.g., Wikidata QIDs) are out of scope for orphan validation.

**Severity:**
- Current state: WARN level for the seller specifically, deferred from Sprint 1 — but the audit confirms this WARN doesn't actually exist yet (no orphan rule exists at all, per s134-step-0-verifications.md:158).
- S141 lands the rule at **FAIL** severity directly, scoped to: Place, Performer, Organization, Organizer (the four entity types named in S134 §3 closure).
- Initial rollout may require a transitional ratchet (similar to Q-B1/Q-B5 venue-sameAs ratchet at completeness-ratchets.json) if more than ~5% of pages fail post-migration.

**Implementation outline (informational, not binding for S139):**
- Single-pass collection of all `@id` values per page → set.
- Single-pass collection of all `@id` *references* (anywhere a `{"@id": "..."}` object appears without other fields) → set.
- Set difference: references minus definitions = orphan references.
- Whitelist: external URLs (not under `agentathens.com`) and same-page fragment-only references (the @id-collection step handles these correctly when the canonical-URL form is also defined).

### 3.3 Microdata stays flat

Microdata (`itemscope` / `itemprop` HTML) emission is item-scoped. There is no `@graph` analog in microdata syntax — `itemscope` is the scope marker. **JSON-LD is the canonical AI-crawler surface; microdata stays flat** per S101a-B closure.

`validateMicrodata` (schema-completeness.ts:545) needs no changes from this migration. It continues to validate per-item microdata blocks independently.

### 3.4 DataFeed stays flat

`dist/api/events.json` is consumed by AI crawlers as a feed (an array of Event entities). It does not need `@graph` wrapping. Per Schema.org DataFeed spec, the `@type: DataFeed` is the envelope; `dataFeedElement` is the array. No change to `validateDataFeed` (schema-completeness.ts:492).

---

## Section 4 — Migration mechanics (S139 implementation)

### 4.1 Stage-by-page-class commit strategy

Parallel to S140's stage-by-bucket strategy. Each stage is a separate commit; if Google Rich Results Test fails on one page class, the rollback is surgical.

1. **Stage 1: event-page.ts.** Largest emission surface (~8,000 pages), most cross-references (venue, seller, organizer). Land first because (a) the foundation is most exercised here, (b) failure here is most observable.
2. **Stage 2: venue-page.ts.** Independent of stage 1 except via the cross-page `@id` reference — which works in both directions only after both pages emit `@graph`. Until then, the cross-reference is a same-page-materialized duplicate (Section 2.4 rule) on the event page; no dependency.
3. **Stage 3: hub-page.ts + page.ts (hub schema injection).** Hub `ListItem.item.@id` already exists; the change is wrapping the CollectionPage + FAQPage + editor-picks-ItemList in a single `@graph`.
4. **Stage 4: homepage (page.ts:138-143 `url === 'index'` branch + ORGANIZATION_SCHEMA flattening).** Collapses the two current flat blocks into one `@graph`. Adds the `WebSite` member.
5. **Stage 5: validator extensions.** `flattenGraph` helper + orphan-reference rule (latter deferred to S141, but the helper is needed in S139 because validators must keep passing post-migration).

### 4.2 Test surface

Existing tests (in `__tests__/templates/`, `__tests__/generators/`, `__tests__/validators/`) assert against flat-block JSON-LD shape. Expected impact: ~30-50 test updates.

**Test pattern (locked):** assertion helper functions that extract entities from the `@graph` by `@id` or by `@type`, then assert per-entity fields. **Do not mirror the full `@graph` shape in test fixtures.** S101a-B post-mortem lesson: test fixtures that mirror the production data structure are an anti-pattern (they re-encode the bug rather than catch it). Tests should assert on properties, not on shape.

Helper sketch:
```
findEntity(graph, '@type', 'Event')       // returns the Event member
findEntity(graph, '@id', '.../#venue')    // resolves a specific reference
```

### 4.3 Build-completeness baseline

Brief-cited baseline (latest): **7,974 / 8,282 valid (97%), 0 errors, 239 warnings.** Sprint 2 retrospective historical: 7,734 / 7,973 (97%) — same percentage, larger absolute scale reflects ~309 added pages since.

**Post-S139 acceptable threshold:** 95% valid, 0 errors. Warnings may rise short-term as the validator gains the orphan-reference whitelist coverage. Error count must stay at 0 — any new error class indicates a migration defect, not a latent issue.

### 4.4 Rollback plan

- **Per-stage rollback:** each stage is one commit. If Google Rich Results Test fails on >10% of sampled pages for that page class, `git revert` the stage commit and re-spec.
- **Per-entity-type rollback:** if specifically the venue cross-reference duplication causes issues (page size bloat, validator complexity), the Section 2.4 same-page-materialization rule can be relaxed to "reference-only" without rolling back the envelope itself.
- **Per-validator rollback:** if the orphan-reference rule (S141) over-flags, the rule lands at WARN initially and the FAIL promotion is a ratchet-gated follow-up (S141's own scope).

---

## Section 5 — Open questions for Dev Planner / Strategist routing

1. **DataFeed `@graph` decision — confirm out of scope.** Section 3.4 recommends DataFeed stays flat (array of Events under `dataFeedElement`). Confirm with Strategist; no change expected.
2. **Canonical-page sequencing — what's the target?** The brief lists "canonical-page sequencing" as Sprint 3 scope per S134 §3 closure. The audit did not find an existing canonical-page sequencing implementation (no matches in src/ for "canonical-page" patterns beyond the URL-as-canonical convention already in place). **Routing question for Strategist:** is "canonical-page sequencing" referring to the order in which entities appear within the `@graph` array (e.g., publisher Organization first, page-scoped entity second, child entities last), or to a different concept (e.g., navigation-link sequencing between cornerstone pages)? **Recommendation:** if the former, S141 spec should lock the order; if the latter, route to dedicated session.
3. **Microdata + `@graph` — confirm decoupling.** Section 3.3 recommends microdata stays flat. Confirm with Strategist or accept as Dev Planner ruling.
4. **Venue-slug authority for `@id`.** Section 2.2 derives venue `@id` from `dist/venues/{slug}/` URL, not from venue registry `canonical_name`. **Confirm**: are dist-slug and registry canonical_name always in sync? If not, S139 needs to pin which one is authoritative for `@id`.
5. **Seller `@id` registry.** Section 2.3 member 4 names `https://{seller-domain}/#organization` as the seller `@id` pattern. The actual seller domain (more.com, ticketservices.gr, etc.) is sourced from where? Per-event ticket-source classifier (S134) already knows; S139 needs to either (a) reuse the classifier output, or (b) maintain a seller-domain → canonical-`@id` map. **Recommendation:** (a) — keep classifier as the source of truth, derive `@id` deterministically from seller URL.
6. **Brief-vs-reality drift in S138 brief.** Three items in the brief (seller.@id from Sprint 1, homepage Organization emitter location, organizer emission state) do not match current source. Documented in this spec; noted for the post-session mistakes.md per the brief's post-session checklist. **No routing required**, but flagged for awareness — Strategist memory should reflect the s134-step-0-verifications.md closure, not the older "Sprint 1 landed seller.@id" framing.

---

## Section 6 — Sequencing

```
S138 (this spec) ───┬──→ S139: stage-by-page-class envelope implementation (5 stages, ~30-50 test updates)
                    │
                    ├──→ S141: orphan-reference FAIL promotion (Place, Performer, Organization, Organizer)
                    │         + canonical-page sequencing (definition + lock pending Section 5 Q2)
                    │         + validFrom Deliberately Deferred Register entry (151 GSC occurrences per
                    │           gsc-schema-defects diagnostic; not re-emitted, but registered)
                    │
                    └──→ S142: organizer emission (introduces Event.organizer for Component-B venues)
                              + validator coverage extension for organizer entity
```

**Hard dependency direction:**
- S141 requires envelope live (orphan rules only make sense once `@graph` materializes the same-page entity set).
- S142 requires envelope live (organizer's `@id` reference resolves to the venue member in the event page's `@graph`).
- S141 and S142 are independent of each other and can run in parallel post-S139.

**Soft dependency:**
- S141's canonical-page sequencing definition (Section 5 Q2) is a Strategist routing item — if it lands before S139, the answer can shape S139 stage 1 (event-page `@graph` member ordering). If it lands after S139, S141 may need to reorder members in stage 1 retroactively (~5 LOC change).

---

## Appendix — Boundary attestation

This session touched only `specs/s138-graph-envelope-spec.md`. No changes to `src/`, `config/`, `tests/`, `dist/`. No build, no deploy. Findings derived from:
- HTML sample audit of 4 page classes (event, venue, hub, homepage)
- Source audit of 8 emitter sites and 5 validator entry points
- Cross-reference against `specs/s134-step-0-verifications.md` and `specs/gsc-schema-defects-2026-05-19-diagnostic.md` for Sprint 3 scope authority
- Cross-reference against `specs/sprint-2-retrospective.md` for baseline numbers
