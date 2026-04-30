# GEO Sprint 1 — Diagnostic

**Date:** 2026-04-29
**Author:** Diagnostic agent (read-only inventory)
**Purpose:** Verify GEO Sprint 1 assumptions before any implementation. No `src/` files were modified.
**Hand-off:** Dev Planner (writes Session 1 plan from this); GEO Strategist (resolves open questions in §9).

---

## 1. addressCountry coverage

**Assumption being tested:** `addressCountry: "GR"` may be missing from Event `location.address` and Place schema; possibly only Organization emits it.

**Finding:** Already at 100% on the two page types that emit Schema.org Place/Event blocks.

| Page type | Files | Containing `addressCountry` | Missing |
|---|---|---|---|
| `dist/events/*/index.html` | 8,340 | 8,340 | **0** |
| `dist/venues/*/index.html` | 49 | 49 | **0** |

**Source emitters** (already hardcoded `'GR'`):
- `src/templates/page.ts:408` — Event `location.address` (homepage / hub blocks)
- `src/templates/page.ts:435` — `CollectionPage` Place block
- `src/generators/event-page.ts:169` — individual event detail Event schema
- `src/generators/venue-page.ts:71` — venue detail `LocalBusiness` schema
- `src/enrichment/quality-gates.ts:905` — quality-gate dummy fixture

**Implication:** The brief's worry about coverage is already solved. Sprint 1 should NOT re-add `addressCountry`; instead, the question is whether `'GR'` should be sourced from a city-config (see §6) rather than hardcoded in 5 files.

---

## 2. Merchant universe

Query: upcoming with-ticket events in `verified_athens` ∪ `pass_through`, grouped by ticket_url host.

**Top merchants:**

| Bucket | Count | Type |
|---|---|---|
| more.com | 73 | Real ticket merchant |
| megaron.gr | 30 | Venue-owned merchant (Athens Concert Hall) |
| ticketservices.gr | 29 | Real ticket merchant |
| **NULL** | 17 | No ticket_url at all |
| viva.gr | 15 | Real ticket merchant |
| **OTHER** | ~120 unique | See breakdown below |

**OTHER bucket breakdown** (long-tail patterns we have not categorized):

| Domain | Approx count | Nature |
|---|---|---|
| athinorama.gr (`/theatre/performance/`, `/music/gig/`) | ~80 | **Listing aggregator — NOT a ticket merchant.** URL points at Athinorama's program page, not a checkout. |
| ra.co (Resident Advisor) | ~18 | Global nightlife ticketing |
| halfnote.gr | ~14 | Jazz club, sells own tickets |
| clubber.gr | ~10 | Listing site, not a merchant |
| onassis.org | ~4 | Venue's own ticketing |
| tickets.in.gr | 1 | Real merchant |
| productledhub.com, athensseo.com | 2 | Conference/event sites |

**Key implication for validators:** ~80 events (the largest single bucket inside OTHER) currently emit `offers.url` pointing at **Athinorama listings**, not at the actual ticket vendor. A validator that treats `offers.url` as the merchant URL will flag these as low-quality citations. Either (a) the schema needs a `seller` field distinct from `offers.url`, or (b) Athinorama-sourced events need their `offers.url` rewritten via redirect resolution (see ticket_url_resolved_at column on the events table).

**Decision input needed:** Sprint 1 should declare which subset of merchants count as "first-party ticket vendors" for citation purposes. Recommended initial whitelist: more.com, viva.gr, ticketservices.gr, megaron.gr, ticketmaster, onassis.org, halfnote.gr, ra.co, tickets.in.gr.

---

## 3. Current schema shape

**Assumption being tested:** Whether emitter uses flat blocks or `@graph` aggregation.

**Finding:** **Flat.** One JSON-LD block per page, single root `@type`, no `@graph` envelope, no `@id` anchors.

```
dist/events/7c93210a--/index.html -> 1 JSON-LD block, @graph: 0
dist/events/8da7914b--/index.html -> 1 JSON-LD block, @graph: 0
dist/events/3faf2b28-104-/index.html -> 1 JSON-LD block, @graph: 0
```

**However**, the existing flat block is already deeply enriched with a `containedInPlace` chain that carries Wikidata QIDs at three tiers:

```
location.containedInPlace
  -> Place "Municipality of Athens" (Q1524) + lat/lng
    -> Place "Attica" (Q178517) + lat/lng
      -> Place "Greece" (Q41) + lat/lng
```

**Source:** `src/generators/event-page.ts:139-238` — `generateEventSchema()` builds a single `Record<string, any>` and `JSON.stringify`s it. Same pattern in `src/generators/venue-page.ts` and `src/templates/page.ts`.

**Implication:** Moving to `@graph` is a **structural reframe**, not an addition. Each entity (Event, Place×3, Offer, Performer) would need an `@id` URI, and the generator must change from "build one nested object" to "build a node array and merge by `@id`." This affects:
- 4 generators (event-page, venue-page, page.ts CollectionPage block, future hub pages)
- 2 validators (schema-completeness.ts in particular asserts on root `@type`, see §4)
- 1 quality-gate fixture
- All 8,340 + 49 + N output pages

Sprint 1 should treat `@graph` migration as an **explicit decision**, not a default. The current flat shape already carries the GEO signal we need.

---

## 4. Validator surface area

| File | Lines | Function-like declarations |
|---|---|---|
| `src/utils/schema-validator.ts` | 135 | 3 |
| `src/validators/schema-completeness.ts` | 445 | 9 |

**Adjacent validators not in scope yet but worth knowing:**
- `src/utils/venue-validation.ts`
- `src/utils/url-validator.ts`
- `src/ticketing/validator.ts`

**Implication:** Extension surface is small (580 lines, 12 functions across the two primary validators). Sprint 1 can add new GEO validators inside `schema-completeness.ts` without restructuring.

---

## 5. robots.txt delta

**File:** `dist/robots.txt`. Sitemap declared: `https://agentathens.com/sitemap-index.xml`.

**Currently declared User-agents (12 total):**

| Group | User-agents | Rule |
|---|---|---|
| Search | Googlebot, Bingbot | Allow |
| AI search citations | GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, anthropic-ai, AppleBot-Extended, Amazonbot, meta-externalagent | Allow |
| AI training (blocked) | Google-Extended | Disallow |
| Default | `*` | Allow |

**Delta vs. the 8 citation-critical bots in the brief:** **0 missing.** All 8 are present (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, AppleBot-Extended, Amazonbot), plus a 9th bonus (`meta-externalagent`).

**Implication:** robots.txt does NOT need expansion in Sprint 1. The diff (if any) should be limited to ordering / comments / sitemap correctness rather than adding new agents.

---

## 6. City-config status

**Assumption being tested:** Does a `country_code` field already live somewhere, or does it need to be created?

**Finding:** **Does not exist.** No file in `config/` defines `country_code` or `currency_code`. Wikidata QIDs only exist for **performers** (`config/performer-sameAs.json`) and inline in `config/city-geodata.json`.

`config/city-geodata.json` (full content):
```json
{
  "municipality": { "name": "Municipality of Athens", "qid": "Q1524", "lat": 37.9838, "lng": 23.7275 },
  "region":       { "name": "Attica",                  "qid": "Q178517", "lat": 37.9908, "lng": 23.7033 },
  "country":      { "name": "Greece",                  "qid": "Q41",     "lat": 39.0742, "lng": 21.8243 }
}
```

It has `country.name` and `country.qid` but no ISO-3166-2 `country_code` ("GR") and no ISO-4217 `currency_code` ("EUR"). Currently `'GR'` is hardcoded in 5 source locations (see §1) and `'EUR'` is hardcoded in `event-page.ts:206, 214` plus DB column default.

**Implication:** If Sprint 1 wants a single source of truth, it must **extend** `city-geodata.json` (add `country.code: "GR"`, `country.currency: "EUR"`) rather than create a new config file. There is no existing `config/cities/<city>.json` directory pattern in this repo.

---

## 7. christmastheater.gr presence

**Result: clean.** 0 references in `src/`, `dist/`, `config/`, `docs/`, `scripts/`.

**DB:** 0 rows in `events` where `source`, `ticket_url`, or `title` references christmastheater.

**Adjacent finds (NOT problematic):**
- `data/html-to-parse/*.html` — 13 raw scraped HTML files contain the word "christmastheater" inside body text. These are crawler input artifacts, never published.
- `config/athens-venues.json:117` — canonical name "Christmas Theater" (Olympiakó Akínita Galatsiou) is a **real Athens venue**, distinct from the christmastheater.gr domain the brief flags. This is correctly modeled.

**Implication:** No remediation needed. Sprint 1 can skip this concern.

---

## 8. Sample offers shape

5 with-ticket events sampled (`73982319…`, `d51218bc…`, `a113a32c…`, `e87832f8…`, `9fea2b93…`). JSON-LD dumped from 3 dist HTML files. **All five share an identical `offers` skeleton** (single Offer, never an array).

**Pattern observed:**
```json
"offers": {
  "@type": "Offer",
  "priceCurrency": "EUR",
  "availability": "https://schema.org/InStock",
  "url": "<event.ticketUrl || event.url || self-canonical>",
  "validFrom": "<event.createdAt or startDate>",
  "price": "<string>"
}
```

**Source:** `src/generators/event-page.ts:200-224` — branches on `price.type === 'open' || 'donation'` (free) vs. with-ticket.

**Three issues already visible without writing a single validator:**

1. **`validFrom` is not ISO-8601.** Sample value: `"2026-03-25 11:47:49"` (sqlite local datetime, no `T`, no timezone). Schema.org `validFrom` expects ISO-8601 datetime. Source: `event.createdAt` from DB, which is stored as sqlite text.

2. **`availability` is hardcoded `InStock` regardless of event lifecycle.** Sample event `7c93210a` has `eventStatus: "https://schema.org/EventCompleted"` (start_date 2026-03-25, in the past) yet `offers.availability: "InStock"`. Inconsistent.

3. **`offers.url` is a listing URL for ~80 events**, not a ticket merchant URL (see §2). Specifically, when `event.ticketUrl` resolves to `athinorama.gr/...`, that URL is currently presented as the offer location — but Athinorama is a program aggregator, not a checkout.

**Other shape details:**
- `price` is a **string** (`"25"`), not a number — Schema.org accepts both, but consistency matters for validators.
- Free/donation events use `'price': '0'` and `offers.url = self-canonical event page` (so we have a non-null offers block on free events too).
- No `seller`, `priceValidUntil`, `validThrough`, or `availabilityStarts`/`availabilityEnds` are emitted.

---

## 9. Open questions for GEO Strategist

These are the two assumption-checks the brief flagged plus one new finding. Sprint 1 plan cannot finalize until these are resolved.

### Q1. `validFrom` proxy
Currently `offers.validFrom = event.createdAt || startDate`. `createdAt` is "when our DB row was inserted" — it has no semantic relationship to "when the offer became purchasable." Three options:

| Option | Behavior | Trade-off |
|---|---|---|
| A. Keep `createdAt`, fix to ISO-8601 | Lower lift — only format change | Semantically misleading (DB insert ≠ ticket on-sale date) |
| B. Use ticket vendor's listing date if available, else omit | Honest | Requires a new field (or re-scrape); most sources don't expose it |
| C. Drop `validFrom` entirely | Simplest | Loses one signal, but a wrong signal is worse than no signal |

### Q2. Default `availability`
Currently always `InStock`. Should validators enforce a mapping from `eventStatus` → `availability`?

| eventStatus | Proposed availability |
|---|---|
| `EventScheduled` | `InStock` (default) |
| `EventCompleted` | `Discontinued` (or omit Offer entirely) |
| `EventCancelled` | `Discontinued` |
| `EventPostponed` | `PreOrder`? `LimitedAvailability`? |

### Q3. (NEW from this diagnostic) Athinorama-sourced `offers.url`
~80 events have `offers.url = athinorama.gr/...`, which is a listing aggregator and not a ticket merchant. This was not in the brief but surfaced in §2 and §8. Three options:
- **A.** Treat Athinorama URLs as `seller` (Organization) and emit `offers.url = self-canonical event page`.
- **B.** Resolve `ticket_url` redirects nightly into a `ticket_url_resolved` column (the `ticket_url_resolved_at` column already exists) and only emit `offers.url` when resolution lands on a known merchant.
- **C.** Emit Athinorama URLs as-is and accept the citation-quality penalty.

---

## Appendix A — Sample JSON-LD blocks

Three full JSON-LD blocks captured 2026-04-29 (verbatim, including HTML entity escapes in venue names):

### Sample 1 — `7c93210a--` (TheaterEvent, EventCompleted, athinorama-sourced)
```json
{
  "@context": "https://schema.org",
  "@type": "TheaterEvent",
  "name": "Πόσο χρόνο έχω;",
  "startDate": "2026-03-25T21:30:00+02:00",
  "eventStatus": "https://schema.org/EventCompleted",
  "location": {
    "@type": "PerformingArtsTheater",
    "name": "Θεατράλε",
    "address": {"@type": "PostalAddress", "streetAddress": "Θεατράλε, 30",
                "addressLocality": "Athens", "addressRegion": "Attica", "addressCountry": "GR"},
    "containedInPlace": { "@type": "Place", "name": "Municipality of Athens",
      "sameAs": "https://www.wikidata.org/wiki/Q1524",
      "containedInPlace": { "@type": "Place", "name": "Attica",
        "sameAs": "https://www.wikidata.org/wiki/Q178517",
        "containedInPlace": { "@type": "Place", "name": "Greece",
          "sameAs": "https://www.wikidata.org/wiki/Q41" } } }
  },
  "offers": {
    "@type": "Offer",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "url": "https://www.athinorama.gr/theatre/performance/poso_xrono_exo-10077868/",
    "validFrom": "2026-03-25 11:47:49",
    "price": "25"
  }
}
```

### Sample 2 — `73982319` (MusicEvent, athinorama-sourced)
```json
{
  "@type": "MusicEvent",
  "startDate": "2026-04-29T20:30:00+03:00",
  "eventStatus": "https://schema.org/EventScheduled",
  "offers": {
    "@type": "Offer", "priceCurrency": "EUR", "availability": "https://schema.org/InStock",
    "url": "https://www.athinorama.gr/music/gig/oi_eleutheroi_poliorkimenoi-10089832/",
    "validFrom": "2026-04-10 18:08:12",
    "price": "5"
  }
}
```

### Sample 3 — `a113a32c` (TheaterEvent, more.com-sourced — well-formed)
```json
{
  "@type": "TheaterEvent",
  "startDate": "2026-04-29T19:00:00+03:00",
  "eventStatus": "https://schema.org/EventScheduled",
  "offers": {
    "@type": "Offer", "priceCurrency": "EUR", "availability": "https://schema.org/InStock",
    "url": "https://www.more.com/gr-el/tickets/theater/tzeni-tzeni/",
    "validFrom": "2026-04-27 09:57:56",
    "price": "25"
  }
}
```

---

## Summary table

| # | Section | Headline finding | Sprint 1 implication |
|---|---|---|---|
| 1 | addressCountry | 100% coverage on events + venues | Skip — already done |
| 2 | Merchants | 5 known + ~120 in OTHER (~80 are athinorama listings) | Define merchant whitelist |
| 3 | Schema shape | Flat, no @graph; already has Wikidata QID chain | @graph migration is structural; treat as explicit decision |
| 4 | Validator surface | 580 lines / 12 functions across 2 files | Extension is low-risk |
| 5 | robots.txt | All 8 critical bots present | Skip — already done |
| 6 | City config | No country_code/currency_code anywhere | Extend `city-geodata.json` (don't create new file) |
| 7 | christmastheater.gr | Clean | Skip |
| 8 | Offers shape | validFrom non-ISO; availability hardcoded; ~80 events have listing-URL not merchant-URL | New validator scope clear |
| 9 | Open Qs | validFrom proxy / availability mapping / Athinorama URL policy | **Block Sprint 1 plan until resolved** |
