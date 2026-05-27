# GSC Defects Status — Post S139 Stages 1-5 + S141 — 2026-05-24

**Mode:** Read-only reconciliation. No src/ edits.
**Source diagnostic:** `specs/gsc-schema-defects-2026-05-19-diagnostic.md` (12 defects classified A-F + 1 deferred).
**Sessions covered:** S139 (stages 1+2+5 in commits `32bac9a0c` + `6ea0b264d`, stages 3+4 in `5623fc503`/`97e353c16`/related), S141 (commit `6be053b2b`), Path D (`41b913182`).
**Production state:** deploy `6a0d7cae` (2026-05-20 12:19 Athens) — stages 1+2+5 live. Stages 3+4 built locally (dist/ dated 2026-05-24 13:04) but NOT yet deployed to prod; tomorrow's 08:00 fire ships them.

---

## TL;DR — three direct answers to the reconciliation questions

### Q1: Did the hub-card microdata strip land? (GEO Strategist Q2 path a)

**NO.** `src/templates/page.ts` still emits hub-card microdata at the same line numbers (slightly shifted from pre-stage-3 readings due to other edits):

```
Line 178:  <section class="card-grid" itemscope itemtype=".../ItemList">
Line 336:  <span class="card-price" itemprop="offers" itemscope itemtype=".../Offer">
Line 340:  <article class="event-card" itemscope itemtype=".../{schemaType}">
Line 356:  <h3 class="card-title" itemprop="name">
Line 357:  <time itemprop="startDate">  + conditional <meta itemprop="endDate"> (exhibitions only)
Line 358:  <span class="card-venue" itemprop="location" itemscope itemtype=".../Place"><span itemprop="name">
Line 361:  <meta itemprop="eventStatus" content="...">
Line 362:  <meta itemprop="description" content="...">
```

Counts: **4 itemscope, 7 itemprop** — identical to pre-S139 readings. The Strategist's Q2 path (a) (strip hub-card microdata in favor of JSON-LD envelope authority) was NOT chosen. Stage 3 added the hub @graph envelope WITHOUT removing the microdata. **Hubs now dual-emit: JSON-LD `CollectionPage + ItemList` envelope AND per-card microdata on `.event-card` articles.**

Implication: Pattern S (dual-emission count signature for schema-defect diagnosis) banked from S137 remains the operative diagnostic frame. Every microdata-only defect (B-class on hub-card surface) persists.

### Q2: What did S141 decide about validFrom DDR? (GSC defect #6)

**HOLD.** Commit `6be053b2b` body, section 3, verbatim:

> "3. validFrom Deliberately Deferred Register entry
>    - Offer.validFrom omission (not editorial-content.validFrom) registered
>      as cosmetic optional-field warning per Strategist 2026-05-18.
>    - Reactivation trigger: merchant feed exposes structured on-sale
>      timestamp."

Matches the diagnostic spec's option (a) "hold" path. Classification: cosmetic optional-field warning, not eligibility-breaking. Reactivation gated on upstream merchant feed exposing structured on-sale timestamps (none of `more.com`, `ra.co`, `viva.gr`, `ticketservices.gr` currently expose this; not addressable by this codebase). **Defect #6 is now formally DEFERRED, not OPEN.**

### Q3: Stages 3+4 envelope vs hub-shape defects #1/#2/#3

**Image, performer, organizer ALL still ABSENT on hub ItemList items.** Live probe of built dist/ files:

`dist/concerts.html` (CollectionPage envelope, 30 items):
```
First item @type: MusicEvent
First item keys: ['@type', '@id', 'name', 'description', 'startDate', 'endDate',
                  'eventStatus', 'isAccessibleForFree', 'location', 'offers']
image present: False
performer present: False
organizer present: False
```

`dist/index.html` (homepage CollectionPage envelope, 24 items):
```
First item @type: ExhibitionEvent
First item keys: ['@type', '@id', 'name', 'description', 'startDate', 'endDate',
                  'eventStatus', 'isAccessibleForFree', 'location']
image: ABSENT
performer: False
organizer: False
(no 'offers' — exhibitions are open events, no offer surface)
```

**Stages 3+4 shipped the structural envelope (CollectionPage + ItemList wrap, location as nested Place subgraph) but did NOT extend the per-item field set.** The ItemList items have the same shape they had pre-S139, just now wrapped in an envelope with the publisher Organization node. Defects #1/#2/#3 hub-JSON-LD are STILL OPEN.

---

## Per-defect status table (12 defects + DDR)

Class column is the original diagnostic classification. Status column is the current state after stages 1-5 + S141.

| # | Defect | Original class | Surface(s) | Current status (2026-05-24) |
|---|---|---|---|---|
| 1 | performer | C (EDP JSON-LD) + B (everywhere else) | EDP JSON-LD, EDP microdata, hub JSON-LD ItemList items, hub-card microdata | **OPEN on all surfaces.** Hub JSON-LD items still lack `performer` post-stage-3. EDP JSON-LD lookup table coverage unchanged. Microdata untouched. |
| 2 | organizer | B (every surface) | EDP JSON-LD, EDP microdata, hub JSON-LD, hub microdata | **OPEN on all surfaces.** Probe confirms `organizer` absent on every emission shape. Pure template gap — never built. |
| 3 | image | B (everywhere except EDP JSON-LD = F) | EDP microdata, hub JSON-LD ItemList items, hub-card microdata | **EDP JSON-LD: F (pre-existing, unchanged via `event-page.ts:229` `getOgImage` chain).** Hub JSON-LD items still lack `image`. EDP + hub microdata untouched. |
| 4 | offers | B (microdata everywhere) + intentional S134 omission for ~50 EDPs | EDP JSON-LD, EDP microdata, hub JSON-LD ItemList items, hub-card microdata | **CLOSED for EDP JSON-LD (S139 stage 1: Offer inline-nested with seller `@id`-ref).** **CLOSED for hub JSON-LD ItemList items (S139 stage 3: items emit `offers` key on ticketed events, probe-confirmed on concerts.html first item).** **OPEN for EDP microdata** (no `itemprop="offers"` on EDP `<article>`). Hub-card microdata already emits offers at `page.ts:336`. |
| 5 | endDate | B (microdata only — JSON-LD always emits) | EDP microdata, hub-card microdata (partial) | **OPEN for EDP microdata.** Hub-card emits `endDate` for exhibitions only (line 357 conditional on `event.type === 'exhibition'`). |
| 6 | validFrom (in offers) | DEFER pending Strategist | Cross-surface (151 occurrences) | **DEFERRED per S141 DDR entry.** Strategist 2026-05-18 ruling: cosmetic optional-field warning, hold. Reactivation gated on merchant feeds exposing structured on-sale timestamps. **Not OPEN, not CLOSED — explicitly held.** |
| 7 | location | B (EDP microdata only) | EDP microdata | **OPEN.** No `itemprop="location"` anywhere in EDP `<article>` per source spec. JSON-LD location subgraph unchanged. |
| 8 | eventStatus | B (EDP microdata only) | EDP microdata | **OPEN.** Hub microdata emits at line 361; EDP `<article>` does not. |
| 9 | url (in offers) | B (hub JSON-LD + hub-card microdata) + DATA/EDGE on 1 EDP | EDP JSON-LD, hub JSON-LD ItemList Offer, hub-card microdata Offer | **CLOSED on EDP JSON-LD (S139 stage 1)** AND **CLOSED on hub JSON-LD ItemList (S139 stage 3, probe-confirmed 2026-05-25 against `/concerts.html` items 1+2: full Offer subtree with `url`, `price`, `priceCurrency`, `availability`, and inline-nested `seller.{name, url}`).** Seller is inline-nested on hub items (not `@id`-referenced), which is the correct shape: the hub `@graph` envelope contains only `{CollectionPage, Place, publisher-Org}` and intentionally omits per-seller Organization nodes, so an `@id`-ref would be orphan. Inline nesting aligns with S141's orphan-FAIL rule (`6be053b2b`) — the alternative (bare `@id`-ref into a graph that doesn't include the target) would now be rejected by the validator. **Hub-card microdata Offer (`page.ts:336`): still no `url`** — rolls into the broader microdata strip-or-parity decision. EDP edge case (1 row) unchanged. |
| 10 | description | C (24 gr-EDPs data gap) + F (hub: resolved) | EDP gr (data gap), hub (resolved) | **Hub: F unchanged** (probe confirms `description` present on hub ItemList items). **EDP gr (24 rows): OPEN as data gap** — requires DB-side fix (events where `fullDescriptionGr`/`fullDescription` is empty AND `event.description` is empty/whitespace). Not addressable by template work. |
| 11 | address (in location) | B (hub-card microdata only) | Hub-card microdata Place | **Hub JSON-LD: CLOSED (S139 stage 1: items emit full nested Place+PostalAddress, probe-confirmed).** **Hub-card microdata: OPEN** — `page.ts:358` emits `<span itemprop="location" itemscope Place><span itemprop="name">` only, no nested `address` sub-microdata. |
| 12 | price (in offers) | C (DATA GAP, ~9 events) | Hub Offer, EDP Offer (when `event.price.amount` is null) | **OPEN as data gap.** Hub-card Offer builder at `page.ts:498-502` doesn't emit `price` key when `amount` is null. ~9 events have null amount upstream (scrape/ingest). Backfill or scraper-side fix; not addressable by template work. |

---

## Aggregate close-rate by intervention

| Intervention | Defects fully closed | Defects partially closed | Defects no-op |
|---|---|---|---|
| S139 stages 1+2+5 (EDP + venue @graph envelope) | #4 (EDP JSON-LD), #9 (EDP JSON-LD) | #11 (added hub JSON-LD address indirectly via item Place subgraph) | #1, #2, #3, #5, #7, #8, #10, #12 |
| S139 stages 3+4 (hub + homepage envelope) | #4 (hub JSON-LD ItemList items), #9 (hub JSON-LD ItemList Offer.url, probe-confirmed 2026-05-25), #11 (hub JSON-LD address) | — | #1, #2, #3, #5, #7, #8, #10, #12 |
| S141 (orphan-reference + member-ordering + validFrom DDR) | #6 (DEFERRED) | — | None directly; adds validator-level guards |
| Path D (capsule placement) | — | — | None (orthogonal to schema defects) |

**Net closure across all four interventions: 5 of 12 defects closed on primary JSON-LD surface** (#4 across both shape paths; #9 across both shape paths — EDP stage 1 + hub stage 3, hub probe-confirmed 2026-05-25; #11 hub JSON-LD address; #10 hub already F pre-S139; #3 EDP JSON-LD already F pre-S139). **1 of 12 deferred** (#6 validFrom DDR per Strategist hold, S141 commit `6be053b2b`). **6 of 12 remain OPEN** — split between hub-shape JSON-LD gaps (#1 hub, #2 hub, #3 hub), EDP-microdata gaps (#5, #7, #8, plus #4 EDP-microdata partial), hub-card microdata residue (#11-microdata, #9-microdata-url roll into strip-or-parity decision), and data gaps (#1-EDP-data, #10-EDP-gr, #12-price-9-events).

---

## The dual-emission residue — what the choice not-to-strip means

The Strategist's Q2 path (a) [strip hub-card microdata] would have closed 5 microdata-only defects (#5, #7, #8, #11-microdata) in a single edit (deletion). Path (b) [keep both, treat JSON-LD as authoritative] keeps the dual-emission topology and accepts that GSC will continue to surface microdata-shape defects until either:

1. The hub-card microdata is stripped in a future session, OR
2. The hub-card microdata is brought to parity with JSON-LD (add `image`, `performer`, `organizer`, `address` sub-microdata, `offers.url`).

Stage 3 implicitly took path (b) by NOT stripping. The microdata gaps persist. The Pattern S (dual-emission count signature) banked from S137 is now load-bearing — every microdata-only defect class will have a 2× count vs JSON-LD-only counterpart in future GSC exports until one emission path is consolidated.

**Recommendation worth surfacing for the next Strategist session:** with stage 3+4 now shipping and the hub envelope authoritative, the strip-vs-bring-to-parity decision is sharper than it was in May. Stripping is one commit (~30 LoC deletion in `page.ts`); bringing to parity is L (~150 LoC addition across 4 field types). Strip closes 5 defects directly. Parity closes the same 5 but doubles emission surface for every future schema addition.

---

## Defects that remain genuinely unaddressed by any 2026-05-X session

These need a template fix in src/ (not closeable by S139/S141 alone):

- **#1 performer (hub JSON-LD ItemList items + all microdata):** add `performer` to the hub item builder when `performer-sameAs.ts` returns a match. Template surface: `src/templates/page.ts:466-` (per source spec).
- **#2 organizer (every surface):** decide on the source-of-truth (probably `event.venue.organizer` if curated, else absent). Then add to EDP JSON-LD builder, hub ItemList item builder, and microdata templates.
- **#3 image (hub JSON-LD ItemList items + all microdata):** add `image` to hub item builder via the same `getOgImage`-equivalent fallback chain that EDP JSON-LD uses. Microdata: add `<meta itemprop="image" content="...">` to hub-card + EDP article.
- **#5 endDate (EDP microdata):** add `<meta itemprop="endDate">` to EDP `<article>`, mirroring the JSON-LD fallback to `startDate`.
- **#7 location (EDP microdata):** add nested `itemscope` Place + `itemprop="location"` to EDP article.
- **#8 eventStatus (EDP microdata):** add `<meta itemprop="eventStatus">` to EDP article.
- **#11 address sub-microdata (hub-card):** convert `<span itemprop="location" itemscope Place><span itemprop="name">` to include `<span itemprop="address" itemscope PostalAddress><span itemprop="streetAddress">...` mirror.

Defects requiring data work (not template):

- **#1 performer (EDP JSON-LD):** expand `performer-sameAs.ts` lookup coverage.
- **#10 description (24 gr-EDPs):** DB-side enrichment for events with empty `fullDescriptionGr` AND empty `event.description`. List of 24 can be derived from GSC URL export + `sqlite3` query.
- **#12 price (9 events):** scrape-side fix or backfill for `with-ticket` events with null `event.price.amount`.

---

## Cross-references

- `specs/gsc-schema-defects-2026-05-19-diagnostic.md` — source diagnostic with original 12-defect table
- `specs/s138-graph-envelope-spec.md` — envelope migration spec (S139 stages 1-4)
- `specs/s139-checkpoint.md` — stages 1+2+5 checkpoint (now stale; stages 3+4 also landed in `5623fc503`/`97e353c16`)
- `specs/s141-orphan-diagnostic.md` — S141 orphan-reference + member-ordering rules
- `specs/2026-05-20-deploy-pipeline-diagnostic.md` + `specs/2026-05-20-plist-deconflict.md` — deploy-reliability arc (parallel work; orthogonal to schema)
- Commit `6be053b2b` — S141 validFrom DDR + orphan + member-ordering
- `.claude/notes/patterns.md` Pattern S — dual-emission count signature (parked; await clean window)

---

## Boundary statement

Read-only reconciliation. NO src/ edits made. Reads:
- `src/templates/page.ts` (grep only)
- `dist/concerts.html`, `dist/index.html` (JSON-LD parse only)
- `git show 6be053b2b` (commit body + stat)
- `specs/gsc-schema-defects-2026-05-19-diagnostic.md` (defect table reference)

Out of scope (queued for Strategist):
- Strip-vs-parity decision for hub-card microdata
- Hub item builder additions (#1, #2, #3 hub JSON-LD)
- EDP microdata gap closure (#5, #7, #8)
- Hub-card microdata address sub-microdata (#11)
- Data-side: #1 performer-sameAs coverage, #10 description gr-EDPs, #12 price backfill
