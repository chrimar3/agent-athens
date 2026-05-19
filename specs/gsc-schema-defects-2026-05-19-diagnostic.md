# GSC Schema.org Defects — 2026-05-19 Diagnostic Classification

**Session:** S137 (Steps 0a–3)
**Mode:** Read-only diagnostic. No edits to `src/`, `tests/`, or `config/`.
**Author input:** GSC export 2026-05-19 (12 defect ZIPs, crawl window 2026-05-14 → 2026-05-19, 128 unique EDPs affected).
**Output role:** Input for GEO Strategist prioritization. Implementation deferred.
**Supersedes:** `specs/s137-gsc-schema-triage.md` (pre-export triage)

## Drift posture

PROCEED, FLAG PER-DEFECT (executor pick 1 + class-F refinement). The GSC export does
not perfectly reflect current production because three schema-relevant commits landed
after the crawl began. Per-defect drift impact is flagged inline; class F
(RESOLVED-IN-PRODUCTION-POST-CRAWL) is assigned only when Step 1 probes confirm the
field is now emitted.

### Surprise commits since 2026-05-13 (Step 0a)

| Commit  | Date       | Schema impact relevant to GSC export                                     |
|---------|------------|--------------------------------------------------------------------------|
| `c8be54049` | 2026-05-14 | `/en/` EDP JSON-LD `url` flipped to root URL (was self-canonical `/en/`). Live probe confirms: en-EDP JSON-LD `url` = `https://agentathens.com/events/<slug>/` with `inLanguage: "en"`. Defect rows with /en/ EDP populated are NOT shaped by this commit (no /en/ Event.url defect in the 12-row export). |
| `a9596b1cb` | 2026-05-13 | `price_type` normalize + Tier 1 vocabulary validator. 42 `tba`→`with-ticket` rows migrated. Affects defect #12 (`price in offers`) — events that gained an Offer after the normalize but still lack `price.amount`. |
| `83a13a9c8` | 2026-05-18 | New `CollectionPage` JSON-LD on `/venues/` index. No overlap with the 12 defect URL shapes — `/venues/` is not in the export. |

`733ad3f87` (S134, 2026-05-11 21:38 +0300) did not appear in the
`git log --since="2026-05-12"` audit window — date filter off-by-one in the brief, not
a missing commit. Brief mistake logged in `.claude/notes/mistakes.md`.

## Emission surface map (Step 0b)

| Surface                                    | Where                                                  | What it emits                                                                  |
|--------------------------------------------|--------------------------------------------------------|--------------------------------------------------------------------------------|
| EDP JSON-LD `Event`                        | `src/generators/event-page.ts:144` (`buildEventSchemaObject`) → serialized at `generateEventSchema`, injected at line 432 | Single Event block per EDP. Includes `@context`, `@type`, `name`, `description`, `startDate`, `endDate`, `eventStatus`, `eventAttendanceMode`, `inLanguage`, `url`, `location` (full Place + PostalAddress + containedInPlace), `isAccessibleForFree`, `image`, `doorTime`, sometimes `performer` (conditional via lookup), sometimes `offers` (S134 classifier-gated). Never emits `organizer`. |
| EDP microdata `<article itemtype="MusicEvent">` | `src/generators/event-page.ts:442` | Minimal: `itemprop="name"`, `itemprop="startDate"`, `itemprop="description"`. Nothing else. |
| Hub/homepage JSON-LD `CollectionPage` + `ItemList` | `src/templates/page.ts:466` (item builder) and `:514` (envelope) | Per-event ListItem with `@type`, `@id`, `name`, `description` (hardcoded `${event.type} event in Athens`), `startDate`, `endDate`, `eventStatus`, `isAccessibleForFree`, `location` (full Place + PostalAddress + containedInPlace), `offers` (gated; minimal — no `seller`, no `url`, no `validFrom`). Never emits `image`, `performer`, `organizer`, `url` (Event-level). |
| Hub/homepage card microdata `<article itemtype="…Event">` | rendered in `src/templates/page.ts` card markup | Itemprops emitted: `name`×2, `startDate`, `location` (scalar text, not nested Place), `eventStatus`, `description`, conditionally `endDate` (only ~2/24 cards emit this), conditionally `offers`/`price`/`priceCurrency`/`availability`. Never emits `image`, `performer`, `organizer`, address sub-microdata. |
| Homepage Organization JSON-LD              | unrelated to Event validation                          | Single Organization block (`name`, `url`, `description`, `areaServed`, `knowsLanguage`). |
| `/with-ticket` FAQPage                      | `src/generators/hub-page.ts:240`                       | FAQPage; not an Event surface — not in scope. |

**Total Event-shaped surfaces validated by GSC on each URL shape:**

| URL shape       | JSON-LD Event blocks | Microdata Event blocks |
|-----------------|----------------------|------------------------|
| EDP gr (single) | 1                    | 1                      |
| EDP en (single) | 1                    | 1                      |
| Homepage        | 24 (ListItem items)  | 24 (hub cards)         |
| /with-ticket    | 30 (ListItem items)  | 30 (hub cards)         |

The 2× signal in defects #1 (performer) and #2 (organizer) at the EDP level is
exactly the JSON-LD + microdata dual emission. The 1× signal in defects #5/7/8
EDP-level is JSON-LD passing + microdata failing.

## Live probe summary (Step 1)

Block counts and field presence from 2026-05-19 fetches of the four representative URLs:

```
EDP-gr  https://agentathens.com/events/d0852901-island-athens-riviera-the-gosha/
  JSON-LD: 1 block (MusicEvent). Keys present: @context, @type, name, description,
  startDate, eventStatus, eventAttendanceMode, inLanguage, url, location, endDate,
  doorTime, isAccessibleForFree, image. Keys absent: offers (S134 omit), performer
  (lookup miss), organizer (never emitted).
  Microdata: 1 block (MusicEvent). Itemprops: name, startDate, description only.

EDP-en  https://agentathens.com/en/events/e3e49595--the-two-sides-of-the-atlantic-…
  JSON-LD: 1 block (MusicEvent). Identical key set to EDP-gr. inLanguage: "en".
  url: root URL (NOT /en/) — c8be54049 flip confirmed in effect.
  Microdata: 1 block, same minimal itemprop set.

Homepage  https://agentathens.com/
  JSON-LD: 2 parsed blocks (CollectionPage with 24-item ItemList; standalone
  Organization). Application/ld+json string occurs 3× in HTML, but only 2 are
  valid <script> blocks — third is non-script reference. No malformed JSON.
  Microdata cards: 24 hub cards with Event itemtype variants (21 are
  Music/Event, 3 are ExhibitionEvent/TheaterEvent/etc).
  Field presence on the 24 ItemList Event items:
    @type, @id, name, description, startDate, endDate, eventStatus,
    isAccessibleForFree, location: 24/24
    location.address (PostalAddress with streetAddress/locality/country): 24/24
    offers: 19/24 (5 S134 classifier-omits)
    offers.price: 14/24    offers.priceCurrency: 19/24    offers.availability: 19/24
    offers.url: 0/24       offers.seller: 0/24             offers.validFrom: 0/24
    image, performer, organizer, url: 0/24

/with-ticket  https://agentathens.com/with-ticket
  JSON-LD: 2 parsed blocks (CollectionPage with 30 items; FAQPage).
  Microdata cards: 30. ItemList field presence mirrors homepage shape; offers
  19/30; offers.url 0/30; image/performer/organizer 0/30.

EDP sample with paid ticket (probed separately, half-note jazz club):
  Offer keys: @type, priceCurrency, availability, seller, url, price.
  seller: {"@type": "Organization", "name": "More.com", "url": "https://more.com/"}
  Confirms S134 acknowledged interim — inline nested Organization, not orphan @id.
```

## Defect classification (Step 2)

Classes (per brief + class-F amendment):

- **A. ENVELOPE** — Resolved by Sprint 3 `@graph` migration (dual-emission cases).
- **B. TEMPLATE GAP** — Emission surface exists; field is unconditionally absent.
- **C. DATA GAP** — Surface conditional; DB row lacks the value.
- **D. SHAPE** — Field emitted in a shape GSC rejects.
- **E. PLACEHOLDER** — `isPlaceholder()` doesn't catch it (per S136 Step 7 deferred work).
- **F. RESOLVED-IN-PRODUCTION-POST-CRAWL** — Live emission satisfies the requirement; defect reflects a stale crawl.

| # | Defect                  | URL shapes affected (count)              | Class      | Edit surface (file:line)                                                                              | Fix size | Drift note |
|---|-------------------------|------------------------------------------|------------|-------------------------------------------------------------------------------------------------------|----------|------------|
| 1 | performer               | EDP gr (198) + EDP en (58) + home (44) + ticket (52) = 352 | C (JSON-LD EDP) + B (microdata everywhere + hub JSON-LD) | `src/generators/event-page.ts:232-236` (EDP JSON-LD, conditional on `getPerformerSameAs` lookup); `src/generators/event-page.ts:442` (EDP microdata, never emits); `src/templates/page.ts:466-` (hub ListItem, never emits); hub-card microdata template in `page.ts` | L | None — lookup-table coverage in `src/utils/performer-sameAs.ts` is the C surface |
| 2 | organizer               | EDP gr (198) + EDP en (58) + home (44) + ticket (52) = 352 | B (every surface) | `src/generators/event-page.ts` builder (never sets `schema.organizer`); same hub ListItem builder; both microdata templates | L | Memory reconciliation: organizer is NOT emitted anywhere in production (`grep -rn "organizer" src/ --include='*.ts'` returned zero non-test matches). This is a pure template gap, not a regression. |
| 3 | image                   | EDP gr (99) + EDP en (29) + home (44) + ticket (52) = 224 | B (every surface except EDP JSON-LD) | `src/generators/event-page.ts:442` (EDP microdata — no `itemprop="image"`); `src/templates/page.ts:466-` (hub JSON-LD — `image` never added to item); hub-card microdata | S | EDP JSON-LD already always emits `schema.image` at `event-page.ts:229` with full fallback chain (`getOgImage`) — pre-dates initial commit. Microdata + hub gap is the live defect. |
| 4 | offers                  | EDP gr (144) + EDP en (34) + home (10) + ticket (13) = 201 | B (microdata, every Event surface) + intentional S134 omission for ~50 EDPs | `src/generators/event-page.ts:442` (EDP microdata — no `itemprop="offers"`); intentional S134 classifier omissions at `src/ticketing/offer-builder.ts` are out of scope | M (microdata add); S134 omissions are deliberate and not a defect | The EDP `144+34` count is the sum of (128 microdata always-miss) + (~50 S134 JSON-LD classifier-omits). The S134 omissions are intended; only the microdata gap is in scope to "fix." |
| 5 | endDate                 | EDP gr (99) + EDP en (29) + home (22) + ticket (26) = 176 | B (microdata only) | `src/generators/event-page.ts:442` (EDP microdata, no `itemprop="endDate"`); hub-card microdata in `src/templates/page.ts` (only 2/24 home + 1/30 ticket cards emit) | S | JSON-LD always emits `endDate` (EDP fallback to `startDate` at `event-page.ts:222`; hub at `page.ts` always set). Pure microdata gap. |
| 6 | validFrom (in offers)   | EDP gr (54) + EDP en (24) + home (34) + ticket (39) = 151 | **DEFER — GEO Strategist call** | S134 (commit `733ad3f87`) explicitly removed `Offer.validFrom`. Probe confirms 0/24 home items and 0/30 ticket items emit `validFrom`; EDP paid-ticket probe also lacks it. | N/A pending decision | Per brief: "if GSC wants it back, that's a GEO Strategist call before any add-back." Not classified A–F until directional decision. |
| 7 | location                | EDP gr (99) + EDP en (29) = 128 (EDP-only) | B (EDP microdata only) | `src/generators/event-page.ts:442` — no `itemprop="location"` anywhere in EDP `<article>` block | S | JSON-LD emits full `location` Place+PostalAddress. Microdata structurally lacks any location itemprop on EDPs. |
| 8 | eventStatus             | EDP gr (99) + EDP en (29) = 128 (EDP-only) | B (EDP microdata only) | `src/generators/event-page.ts:442` — no `itemprop="eventStatus"` in EDP `<article>` block | S | JSON-LD always emits `eventStatus` via `resolveEventStatus()`. Hub-card microdata 24/24 home + 30/30 ticket DO emit `eventStatus` — only EDP microdata gap. |
| 9 | url (in offers)         | EDP gr (1) + home (34) + ticket (39) = 74 | B (hub JSON-LD + microdata Offer) + DATA/EDGE on 1 EDP | `src/templates/page.ts:496-502` — hub-card Offer builder emits only `@type/price/priceCurrency/availability`, no `url`. EDP outlier likely a venue-direct event where `buildOfferOrOmit` produced an Offer but `ticketUrl/ticketUrlResolved` were null. | S | Hub-card Offer is asymmetric vs EDP Offer (which DOES include `url` + `seller`). Mismatch is intentional Sprint 1 pattern per S134, awaiting Sprint 3 envelope migration. |
| 10 | description            | EDP gr (24) + home (21) + ticket (24) = 69 | C (24 gr-EDPs: data gap) + F (hub: resolved-in-production) | EDP code path at `src/generators/event-page.ts:157-164` always falls back to `event.title` non-empty — the 24 gr-EDP misses suggest `stripInfoTable()` (used at line 285+) is returning empty narrative for these specific events. Hub cards: live probe shows 24/24 home + 30/30 ticket emit `itemprop="description"`. | M (EDP); none (hub) | Suggests DB-side: 24 specific gr events where `fullDescriptionGr`/`fullDescription` is empty AND `event.description` is empty/whitespace. List of 24 should be derived from GSC URL export and inspected against the DB. |
| 11 | address (in location)  | home (22) + ticket (26) = 48 | B (hub-card microdata only) | hub-card microdata template in `src/templates/page.ts` — `itemprop="location"` is a scalar text span, not a nested `itemscope` Place with `itemprop="address"` sub-microdata | S–M | Hub JSON-LD ItemList items have full nested PostalAddress (24/24 home, 30/30 ticket). Pure microdata structural gap on hub cards. |
| 12 | price (in offers)      | home (4) + ticket (5) = 9 | C (DATA GAP) | `src/templates/page.ts:498-502` Offer builder: for `with-ticket` events with `event.price.amount` null, no `price` key is emitted. Source of the null amounts is upstream (scrape/ingest didn't capture price for these events). | M | Tightly correlated with `a9596b1cb` post-normalize state — events that gained an Offer when `tba`→`with-ticket` migrated, but never had `amount` populated. Backfill or scraper-side fix. |

**Row count verification:** 12 defect rows + 1 header row = 13. Passes brief check (`grep -c '^|' ≥ 13`; expected to be higher because the surface-map and probe tables also use pipes).

## Memory reconciliation (Step 3)

### Organizer

Memory state and S134 record carry no claim that `Event.organizer` is emitted.
Production grep confirms:

```
$ grep -rn "organizer" src/ --include='*.ts' | grep -v __tests__
(zero matches)
```

`Event.organizer` is **never emitted** on any surface. Defect #2 is therefore a
pure class B (TEMPLATE GAP), not a regression. No memory update needed — memory
correctly did not claim emission.

### Seller (S134 acknowledged interim)

S134 commit message: "Seller emission stays at shape (a) inline nested Organization
per Sprint 1 acknowledged interim. Sprint 3 envelope migration is the consolidated
path for @graph envelope + @id scheme + canonical-page sequencing + orphan-seller
validator promotion back to FAIL across all four entity types (Place, Performer,
Organization, Organizer)."

Live probe (paid-ticket EDP sample at `/events/65d3b366-half-note-jazz-club-…/`):

```json
"offers": {
  "@type": "Offer",
  "priceCurrency": "EUR",
  "availability": "https://schema.org/InStock",
  "seller": {"@type": "Organization", "name": "More.com", "url": "https://more.com/"},
  "url": "…",
  "price": 12
}
```

Confirmed: seller is inline nested Organization (not orphan `@id`). S134 acknowledged
interim is intact. No drift from memory's [enrichment patterns] or S134 closure.

### c8be54049 /en/ canonical flip

Memory entry `agent_athens_en_deployment_state_routing` notes locale-aware OG
metadata centralized in `src/templates/page.ts` since `7966e4455`. The `c8be54049`
follow-up flipped /en/ canonical/og:url/JSON-LD url targets to **root** URLs. Live
probe confirms: en-EDP JSON-LD `url` = `https://agentathens.com/events/<slug>/`
(NOT `/en/events/<slug>/`) with `inLanguage: "en"`.

For the 12-defect classification: this drift affects **only `Event.url`-bearing
defects on /en/ surfaces**. The 12-row export has zero such rows — `Event.url` is
not in the defect list, and `url in offers` (defect #9) shows 0 /en/ EDP rows.

No memory update needed. The existing memory pointer to S87a `c8be54049` is current.

## Open questions for GEO Strategist

1. **Defect #6 (validFrom in offers) — re-emit or hold?** S134 deliberately removed
   `Offer.validFrom`. GSC reports 151 occurrences requiring it. Possible answers:
   (a) hold — GSC will re-evaluate after recrawl; (b) re-emit with current `dateModified` as a transitional shim; (c) implement true `validFrom` from `event.publishedAt` or scrape-time. Strategist call needed before any code touch.
2. **Defect #1 (performer) — extend lookup or derive from event.title?** The
   `getPerformerSameAs` table currently misses most events. Two paths: (a) curate
   table to higher coverage (manual); (b) emit minimal `performer: {"@type":
   "PerformingGroup", "name": <derived-from-title>}` for music event types.
   Path (b) needs name-extraction heuristic — substring before "@", parenthetical
   removal, transliteration rules. Sprint-scope decision.
3. **Defect #2 (organizer) — map to venue or to a distinct organizer column?**
   Currently the DB has no `event.organizer` column. Three options: (a) emit
   `organizer = location.name` (venue-as-organizer, accurate for venue-direct
   events but wrong for promoter-driven events at hired venues); (b) add an
   `organizer` column and require scrape-side capture; (c) classifier-gated
   emission (emit when source is known curator/promoter). Path (a) is the
   smallest fix but may misattribute.
4. **Hub-card microdata — keep dual-emission or strip and rely on JSON-LD only?**
   The microdata cards on hubs are the source of 5 of the 12 defects (3 outright,
   2 partially). Sprint 3 envelope migration consolidates JSON-LD; if hub
   microdata is also consolidated away, defects #5/#7/#8/#11 disappear without
   per-field fixes. Pre-Sprint-3 work on these defects may be wasted effort.
5. **Defect-priority ordering.** Suggested ranking by total occurrence × fix size
   (smaller = priorities first): #5 (176, S) > #3 (224, S) > #7 (128, S) >
   #8 (128, S) > #9 (74, S) > #11 (48, S–M) > #2 (352, L; mostly B) > #1 (352, L;
   B+C) > #4 (201, M; B-portion only). Defects #10 + #12 need DB inspection
   before sizing.
6. **/en/ canonical drift — recrawl posture.** Should we file a GSC URL-inspection
   recrawl request for /en/ EDPs, or wait for natural recrawl? No defects in the
   current export hinge on the flip, but next export will likely reflect it.

---

**Status:** Diagnostic complete. Ready to route to GEO Strategist for prioritization.
No code touched. Edits to `src/`, `tests/`, `config/`, DB: none.
