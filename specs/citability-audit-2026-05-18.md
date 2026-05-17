# Citability State Audit — 2026-05-18

## Context

- Demo deadline: **2026-05-29** (Παναθήναια, 11 days out)
- Google I/O: **2026-05-19** (tomorrow)
- 8 commits on master unpushed at audit time:
  - `b23a20a60 docs(notes): Pattern G 2026-05-18 institutional updates`
  - `20491f4c2 chore(launchd): version-control monitor-visibility plist`
  - `18f293435 chore(queue): reset 19 stuck in_progress enrichment_queue rows`
  - `3c3b41fa3 fix(auto-enrich): clean temp-descriptions/batch-* between runs`
  - `2b26cb555 docs(session-log): S136 entry — Bing API wiring, GSC deferred to S138`
  - `16ebd4908 docs(notes): S136 institutional memory updates`
  - `d951376a6 S136: Bing API integration + visibility CSV schema lock (GSC deferred to S138)`
  - `7f19d639f chore: daily pipeline update 2026-05-16` (pre-existing drift, not from S136/Pattern G)
- `origin/main` HEAD: **`5ba52268a chore: daily pipeline update 2026-05-16`** — what AI crawlers currently see on `agentathens.com`.
- Live site reflects `origin/main` (8 commits behind); `dist/` reflects last local build (S136 + Pattern G). Where they diverge, **`origin/main` is the citability surface**. Findings flag divergence explicitly.

## Build State Baseline (Phase 1)

- `data/build-completeness.json` mtime: **2026-05-17 23:40** (~26h old, under brief's 36h staleness threshold).
- Actual top-level schema: `aria`, `datafeed`, `events`, `hubs`, `layers`, `meta`, `place`, `venues` (NOT `summary/byType/layers` as brief assumed; structure documented below).
- `.meta` only carries `lastUpdate` timestamp. Totals are scoped per-layer.

**Per-layer pass rates:**

| Layer | Total | Pass | Warn | Fail | Pass rate |
|---|---:|---:|---:|---:|---:|
| events | 4731 | 4643 | 88 | 0 | 98% |
| hubs | 27 | 25 | 2 | 0 | 93% |
| venues | 46 | 46 | 0 | 0 | 100% |
| datafeed | 1 | 1 | 0 | 0 | 100% |
| aria.hub_template | 1168 | 1166 | 0 | **2** | 99.8% |
| aria.event_template | 490 | 490 | 0 | 0 | 100% |

**Per-EventType pass rates (`.events.byType`):**

| EventType | Total | Pass | Warn | Pass rate |
|---|---:|---:|---:|---:|
| concert | 867 | 853 | 14 | 98% |
| **dj_set** | 473 | 409 | **64** | **86%** ← real anomaly |
| theater | 3242 | 3240 | 2 | 100% |
| exhibition | 19 | 19 | 0 | 100% |
| festival | 32 | 32 | 0 | 100% |
| performance | 18 | 18 | 0 | 100% |
| show | 46 | 46 | 0 | 100% |
| workshop | 16 | 14 | 2 | 88% |
| tech | 6 | 6 | 0 | 100% |
| dance | 2 | 2 | 0 | 100% |
| other | 10 | 4 | **6** | **40%** ← high warn-ratio, small bucket |

Errors: 2 (aria.hub_template). Warnings: 88 (events) + 2 (hubs) + 0 (everywhere else).

## Item 2: Exhibition Bucket Anomaly (Phase 2)

**Brief's premise was wrong.** Exhibition is at **100% pass rate** (19/19 pass, 0 warn, 0 fail). The "63% mystery" doesn't exist in the current build-completeness data.

**Actual per-type anomalies (in descending leverage):**

1. **dj_set: 86% pass (64 warnings out of 473)** — the dominant anomaly. Sample evidence: `dist/events/150421f1-don-t-be-a-dick-harris-markou/index.html` emits valid `MusicEvent` JSON-LD but has `streetAddress: ""` and `location.geo` only nested in `containedInPlace` (not at `MusicVenue` level). Compared to `dist/events/1239b09f-burger-disco-club-house-on-the-beach/` which has proper streetAddress + `MusicVenue.geo` and emits cleanly. The 64 warnings track **long-tail dj_set venues with weak address/geo data** — a data-quality issue (operator-side venue curation), not a structural emission bug.

2. **other: 40% pass (6 warnings out of 10)** — small bucket, low absolute impact. Worth a glance, not a session.

3. **workshop: 88% pass (2 warnings out of 16)** — small bucket, low absolute impact.

**Hypothesis:** Validator warnings at `src/validators/schema-completeness.ts:289-303` fire on missing `description`, empty `streetAddress`, missing `location.geo`, missing `image`. The dj_set 64 cluster is dominated by 1-2 of these (most likely `streetAddress` empty + `location.geo` missing — both apply to weakly-curated venues like Skullbar, Japanese Park of Athens, etc.).

**Estimated scope of fix:** Data-quality session — curate 10-20 long-tail dj_set venues with proper addresses + geocoding. NOT a code change. Pages affected: 64 warnings → likely 40-60 unique venues if dedup'd.

## Item 3: EN Cornerstone 404s (Phase 3)

**Brief's "3 URLs" claim was incomplete.** `docs/known-issues.md:157-160` names 7+ URLs. Live + dist/ + sitemap triple-check:

| Path | Live (agentathens.com) | dist/ | Sitemap | Failure mode |
|---|---|---|---|---|
| `/en/tomorrow` | **404** | MISSING | not declared | **true build gap** |
| `/en/this-week` | **404** | MISSING | not declared | **true build gap** |
| `/en/next-month` | **404** | MISSING | not declared | **true build gap** |
| `/en/exhibitions` | **404** | MISSING | not declared | **true build gap** |
| `/en/today` | 301 → `/en/today/` | `dist/en/today/index.html` present | not in sitemap | **trailing-slash redirect — page exists** |
| `/en/this-weekend` | 301 → `/en/this-weekend/` | present | not in sitemap | trailing-slash redirect — page exists |
| `/en/this-month` | 301 → `/en/this-month/` | present | not in sitemap | trailing-slash redirect — page exists |
| `/en/` | 302 → `/en/today` | n/a | n/a | intentional canonical redirect (per `dist/_redirects:3`) |

**Trailing-slash versions confirmed:**
- `/en/today/` → 200
- `/en/this-weekend/` → 200
- `/en/this-month/` → 200

**Sitemap state:** `sitemap-events.xml` has 5267 total URLs, 573 with `/en/` prefix — but those are all `/en/events/<slug>/` (individual event pages). No `/en/` hub cornerstones are declared.

**Real gap count: 4 URLs (not 7).** The 4 true build gaps share a pattern — they're the "extended-window" hub variants (tomorrow, this-week, next-month) plus exhibitions. The "core" EN cornerstones (today, this-weekend, this-month) ARE present in dist/ (just need trailing-slash normalization on the inbound link).

## Item 4: /venues/ Index JSON-LD (Phase 4)

- **Emitter:** `src/generators/venue-page.ts:318` — `function generateVenueIndex(venues: VenueData[]): void`
- **Current emission state:** `dist/venues/index.html` has **0 `<script type="application/ld+json">` blocks**. Confirmed gap.
- Current head has: title, meta description (entity-dense), canonical, font/css/favicon links, language alternates. No structured data.
- **Recommended @type pattern:** `CollectionPage` with `mainEntity: ItemList` of `Place` items, mirroring the Greek main hub pattern at `/today` (which emits CollectionPage + ItemList of 17 events). The data needed (`sortedVenues` with `slug`, `name`, `eventCount`, `neighborhood`) is already in scope at the emit site — single-template-change to inject `<script type="application/ld+json">` before `</head>`.
- **Estimated scope:** ~1 session. New helper function (e.g., `renderVenuesIndexJsonLd(venues)`) mirroring the hub-page pattern, ~30-50 LOC, single-file edit in `src/generators/venue-page.ts` + possibly a templated helper. Adds 1 structured-data block to a single page; impact concentrated but real (the /venues/ page is the entry point for venue-list citation queries).

## Item 5: Meta Description Coverage (Phase 5)

- **Total HTML pages: 4810** (`find dist -name "index.html" | wc -l`)
- **Pages missing meta description: 0** (`find dist -name "index.html" -exec grep -L '<meta name="description"' {} \;`)
- **Coverage: 100%.** This is a **quality-not-coverage** problem.

**Sample evidence:**

| Page type | Sample description | Style |
|---|---|---|
| root (`dist/index.html`) | "24 εκδηλώσεις στην Αθήνα. Ενημέρωση κάθε μέρα από 10+ χώρους. Συναυλίες, θέατρο, εκθέσεις, DJ sets." | entity-dense, count-bearing |
| `/venues/` | "39 event venues in Athens with upcoming concerts, exhibitions, performances. Updated daily." | entity-dense, count-bearing |
| `/en/today/` | "What's on in Athens today: concerts, exhibitions, theatre, DJ sets and free events. Updated daily with verified listings." | mostly generic, no event count |
| `/en/this-weekend/` | "Weekend events in Athens: concerts, exhibitions, theatre and free entry. Updated weekly with verified Friday-to-Sunday listings." | mostly generic, no event count |
| event page sample 1 | "The Velvet Night - Ζαχαράτος &amp; Παπαρίζου — NOX — Apr 19, 2026 — From €20" | dense |
| event page sample 2 | "In motion: Ένα άγαλμα που το ’σκασε — Δημοτικό Θέατρο Πειραιά, Piraeus — Apr 2, 2026 — Tickets available" | dense |
| event page sample 3 | "Live Warrel Dane tribute — AN Club, Exarchia — Apr 18, 2026 — From €12" | dense |
| event page sample 4 | "Οικογένεια Άνταμς - Το μιούζικαλ — Θέατρο Βέμπο — Apr 9, 2026 — From €17" | dense |

**Quality classification:** Event pages and the Greek root are dense. English hubs use a more generic template ("X in Athens..." without counts or specific venues). Possible future optimization: lift EN hubs to count-bearing entity-dense pattern. **Not a coverage problem; low priority for demo window.**

## Indexing Posture (Phase 6)

**Sitemap:**
- `sitemap-index.xml`: 200, `cache-status: hit`, content-length 373.
- Children: `sitemap-events.xml`, `sitemap-venues.xml`, `sitemap-editorial.xml`. No separate EN sitemap.
- Total URLs in `sitemap-events.xml`: 5267 (573 with /en/ prefix — all individual event pages).

**IndexNow (`logs/indexnow-latest.json`):**
- Last run: 2026-05-17T08:48:12 UTC (~16h before audit)
- Submitted: 5063 / Success: 5063 / Failures: 0 / Batches: 1
- **Stale by ~16h.** Consistent with the 8-commit unpushed backlog — daily pipeline hasn't fired since.

**Bing fetcher (`logs/bing-latest.json`):**
- Last fetch: 2026-05-18T00:52:17+03:00 Athens (~1h before audit — fresh from last night's `launchctl kickstart` post-S136)
- Status: `ok`
- Aggregate over 7d window: `impressions_7d=0, clicks_7d=0, avg_position_7d=0, top10_count_7d=0`
- Site has zero recent Bing traffic in window. API healthy; data sparse (consistent with prior S136 runs).

**Visibility log (last 3 rows of `data/search-visibility-log.csv`):**

```
2026-05-17,4996,42,1206,6244,STALE,STALE,STALE,2026-05-15T05:30:05.401Z,200,200,200,10,10,,,,,,,,,,,0,0,
2026-05-17,4996,42,1206,6244,5063,5063,1,2026-05-17T08:48:12.794Z,200,200,200,9,10,,,STALE,STALE,STALE,STALE,0,0,0,0,9,0,
2026-05-18,4731,39,1206,5976,5063,5063,1,2026-05-17T08:48:12.794Z,200,200,200,10,10,,,STALE,STALE,STALE,STALE,0,0,0,0,9,0,
```

- May 17 row 1: 27-col S136 shape with **IndexNow STALE markers at cols 5-7** — the S91 STALE pattern fired correctly on an early Saturday tick when `indexnow_last_run` (col 8, value 2026-05-15) was >25h old.
- May 17 row 2: 27-col, IndexNow recovered (5063/5063), 4 GSC=`STALE` (S138-pending), 4 Bing=0 (fetcher ok with empty 7d window). Enrichment=9, wrapper=0.
- May 18 row: 27-col, same shape as May 17 row 2. This is the row produced by yesterday's manual `launchctl kickstart` (Step 8a verification post-S136 ship).

**Manual counters (`gsc_indexed` col 14, `bing_indexed` col 15):** **empty across all 3 rows.** Operator hasn't pasted the GSC/Bing UI-sourced numbers for 2026-05-17 or 2026-05-18.

⚠️ **GSC indexed-count is the one number we can't fetch automatically** (S138 OAuth fallback deferred per Session 139). Operator UI action remains the only path until S138.

## Live-Site Sanity (Phase 7)

5 high-value URL probes (post-redirect-follow where relevant):

| URL | First-hop status | Final destination | Final status |
|---|---|---|---|
| `https://agentathens.com/` | 200 | (no redirect) | 200 ✓ |
| `https://agentathens.com/today/` | 301 | `/today` | 200 ✓ |
| `https://agentathens.com/this-weekend/` | 301 | `/this-weekend` | 200 ✓ |
| `https://agentathens.com/exhibitions/` | 301 | `/exhibitions` | 200 ✓ |
| `https://agentathens.com/en/today/` | 200 | (no redirect) | 200 ✓ |

**`/today` JSON-LD inspection (after redirect-follow):**
- **2 JSON-LD blocks emitted.**
- @type set: `CollectionPage`, `ItemList`, `ListItem`, `ExhibitionEvent`, `ExhibitionCenter`, `MusicEvent`, `MusicVenue`, `PerformingArtsTheater`, `TheaterEvent`, `Place`, `PostalAddress`, `GeoCoordinates`, `Offer` + `FAQPage`, `Question`, `Answer`.
- First block is `CollectionPage` with `mainEntity: ItemList` of 17 events (`name: "Εκδηλώσεις στην Αθήνα Σήμερα | Cultural Events in Athens"`, `numberOfItems: 17`). Each item has full event detail (name, dates, location with full venue + address + geo, offers).
- Second block is `FAQPage` (Question/Answer pairs).
- **Verdict: Greek main hubs (`/today`, by sample) are richly cited. Schema emission is healthy.**

**Trailing-slash asymmetry (open observation):**
- Greek main hubs use **NO trailing slash** as canonical (`/today`, `/this-weekend`, `/exhibitions`). Inbound `/today/` 301s to `/today`.
- English hubs use **trailing slash** as canonical (`/en/today/`, `/en/this-weekend/`). Inbound `/en/today` 301s to `/en/today/`.
- Inverse URL normalization between locales. Likely intentional (hreflang considerations) but worth confirming with a `head src/generate-site.ts` if any consumer cares.

## Synthesis for Planner

Ranked by **demo-window leverage** (highest first). "Session count" estimates assume ~half-day each.

1. **`/venues/` index JSON-LD emission (Item 4) — 1 session, high leverage.** Confirmed gap (0 blocks). Single-file edit in `src/generators/venue-page.ts`. Adds CollectionPage+ItemList of 46 Place items. /venues/ becomes the citation source for "venues in Athens" queries. Bounded, low-risk, ships cleanly before demo.

2. **EN cornerstone 4 true 404s (Item 3, narrowed) — 1-2 sessions, medium leverage.** `/en/tomorrow`, `/en/this-week`, `/en/next-month`, `/en/exhibitions` are real build gaps. Generator probably mirrors the Greek equivalents (which DO exist) — adding 4 EN hubs to the build is bounded. Lifts EN citability for the same time-window queries Greek hubs already serve. Also: add to `sitemap-events.xml` if not auto-included.

3. **dj_set venue data-quality (Item 2 pivoted) — 1-2 sessions, medium leverage IF citation matters for music queries.** 64 warnings concentrated on long-tail dj_set venues with empty streetAddress + missing top-level geo. Operator curation work, not code. Lifts dj_set bucket from 86% to ~98% (matching concert/theater). Skippable if Παναθήναια demo prioritizes the hub story over individual-event citability.

4. **Push 8 unpushed commits + IndexNow refresh (Item 5/operations) — 0.5 session, immediate effect.** `git push` → daily pipeline runs → IndexNow re-submits → search engines see S136 + Pattern G state. Currently `origin/main` is at `5ba52268a`, the last May 16 daily pipeline tick — none of the recent work is on the live site. **This is a prerequisite to any other improvement showing up in demo-time citation results.**

5. **Meta description quality on EN hubs (Item 5) — DEFER.** Coverage is 100%; EN hub copy is functional but generic. Not on critical path. Worth a polish pass after the bigger items.

**Item 1 (the brief's "exhibition anomaly") is dismissed** — exhibition is at 100% pass. The brief's premise didn't survive verification. Recommend the planner re-allocate the slot.

## Open observations (not in original 5 candidates)

- **8 commits unpushed; live site is ~36h behind local state.** S136, Pattern G, and a pre-existing daily-pipeline chore are all sitting locally. The visibility audit's signal ("AI crawlers see X") is bottlenecked by this — none of the recent improvements (Bing fetcher writing real values, plist version-control, queue reset) reach the live surface until push happens.
- **Greek vs English URL normalization asymmetry.** `/today` (Greek, no trailing slash) vs `/en/today/` (English, trailing slash). Both work; trailing-slash inbound 301s in both directions to the canonical. May confuse a naive citation harness expecting URL parity. Documented for awareness.
- **One pre-existing visibility-log row from 2026-05-17 has S91 STALE markers** correctly firing on a stale `indexnow_last_run` field. The S91 mechanism works as designed.
- **Manual counters (`gsc_indexed`, `bing_indexed`) empty for both 2026-05-17 and 2026-05-18.** Operator hasn't pasted the UI-sourced numbers. GSC remains manual until S138; Bing could go either way (manual or fetcher; the fetcher currently writes the 7d aggregates but not the indexed-count counter).
- **`/today` `name` field is bilingual:** `"Εκδηλώσεις στην Αθήνα Σήμερα | Cultural Events in Athens"`. Dual-language schema name is a useful citation signal — flags the page as bilingual without requiring hreflang traversal.

## What this audit did NOT cover

- **GSC indexed-count** — S138 dependency. Operator UI action remains the only path.
- **Enrichment Writer scope** — bilingual content coverage of event descriptions.
- **Editorial Director scope** — cornerstone content quality (the 4 EN gaps and the existing Greek hubs both have body-content questions outside JSON-LD).
- **Design Navigator scope** — CSS, design tokens, save-button shape-state, etc.
- **Παναθήναια ingestion** — parallel content track for the May 29 demo's anchor events.
- **Any actual fix or implementation** — strictly diagnostic.
- **Σ91 / Session 91 wrapper-discrepancy ratchet** — the auto-enrich pipeline observability is a separate health signal not surfaced here.
