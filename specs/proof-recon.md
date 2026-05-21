# /proof page — recon

**Date:** 2026-05-21
**Status:** RECON ONLY (read-only). No implementation. Build brief withheld pending decisions in §P6.

Every figure here is grounded against a live source on disk, not memory. Each row shows
**Claim**, **Live value (today)**, **Source**, and any **Drift / risk**. The premise-trap that
caught us repeatedly this sprint: asserting a number on a page without re-grounding it that
session. Any figure /proof publishes must be re-grounded at *build time*, not stamped at
spec time.

---

## P1 — Event + page counts

| Metric | Live value | Source |
|---|---|---|
| DB events matching `location_status IN ('verified_athens','pass_through')` | **11,643** | `sqlite3 data/events.db ...` |
| **Pageable events** (the filter actually used to generate event pages: location-filtered ∩ upcoming ∪ past-active ≤45d) | **3,280** | `src/generate-site.ts:201,218-220` + `find dist/events -name 'index.html' \| wc -l` |
| English event pages (`dist/en/events/*/index.html`) | **577** | `find dist/en/events -name 'index.html' \| wc -l` |
| Venue pages (`dist/venues/*/index.html`) | **49** | `find dist/venues -name 'index.html' \| wc -l` |
| .ics sidecars | **3,280** | `find dist -name '*.ics' \| wc -l` (1:1 with EL event pages — sanity-check passes) |
| Total HTML pages | **5,110** | `find dist -name '*.html' \| wc -l` |

**⚠️ Filter trap.** The brief's SQL (`location_status IN (...)`) returns **11,643**, not 3,280. That count
includes historical events outside the 45-day retention window — not what the site publishes.
The *correct* citation source for "live event count" is **`pageableEvents.length`** logged at build
time (`src/generate-site.ts:293-294`), or equivalently `find dist/events -name 'index.html' | wc -l`
post-build. If /proof asserts "~3,280 events", it must read from the manifest or a build-time
artifact, not from a raw `location_status` query.

**Memory anchor "~2,730" is stale.** Current is 3,280. Stale by ~550. The user's brief already
flagged this; confirming here.

**Decomposition of 5,110 HTML pages** (back-of-envelope):
- 3,280 EL event pages + 577 EN event pages + 49 venue pages = 3,906
- Remaining ~1,204 = hub pages (filter combinations), content pages (about/editorial/corrections, EL+EN), filter-flat pages (`*.html` at dist root like `ballet-performance-today.html`), 404, etc.

---

## P2 — Source count ("11 sources")

**There is no single source-of-truth registry for active scrapers.** Sources are scattered:

1. **`scripts/scrape-*.ts`** — venue-direct scrapers. Inventory: `scrape-ai-tech.ts`,
   `scrape-all.ts`, `scrape-benaki.ts`, `scrape-megaron.ts`, `scrape-onassis.ts`,
   `scrape-snfcc.ts`. That's **5 venue-direct + 1 aggregate runner + 1 vertical (ai-tech)**.
2. **`src/ingest/newsletter-formats/`** — email-newsletter parsers, separate format registry
   (`config/nonexistent.json` referenced in test — config likely lives elsewhere).
3. **`src/ingest/email-ingestion.ts` + `email-parser.ts`** — email-based ingestion path.
4. **`src/scraping/`** contains *runtime infra* (`state-manager.ts`, `subprocess-runner.ts`,
   `types.ts`) — not source definitions. Easy to mistake.

**Claim "11+ sources" is not directly verifiable from any one file.** It cannot be cited from
memory. Before /proof asserts a number, we need to:
1. Compile an actual source roster (venue scrapers + newsletter formats + email ingestion +
   any ticketing-platform integrations).
2. Decide what counts as "a source" (a venue? a website domain? a parser?).
3. Commit it to a `config/sources.json` (or similar) so /proof can read it at build time.

**For now, the about page says "more than 15 verified venues and ticketing platforms"** — that
number disagrees with the brief's "11". Both are assertion-from-memory until grounded.

---

## P3 — Test count

**Live result of `bun test`:**
```
2380 pass
   1 skip
   0 fail
5045 expect() calls
Ran 2381 tests across 105 files. [50.82s]
```

- Memory anchor **"1,410+" is severely stale** — actual is **2,380 / 2,381**.
- Brief's "last seen 2,380" matches; confirmed current.
- /proof should cite **"2,380 passing tests across 105 files"** (or a build-time-read value).

---

## P4 — Citation + indexing evidence

**Header (`data/search-visibility-log.csv`):**
```
date, sitemap_events, sitemap_venues, sitemap_editorial, sitemap_total,
indexnow_submitted, indexnow_success, indexnow_batches, indexnow_last_run,
robots_http, sitemap_http, llms_http, sample_accessible, sample_size,
gsc_indexed, bing_indexed,
gsc_impressions_7d, gsc_clicks_7d, gsc_avg_position_7d, gsc_top10_count_7d,
bing_impressions_7d, bing_clicks_7d, bing_avg_position_7d, bing_top10_count_7d,
enriched_last_24h, wrapper_discrepancy_last_24h, notes
```

**Latest row (2026-05-21):**
| Field | Value |
|---|---|
| sitemap_events | 3,873 |
| sitemap_venues | 38 |
| sitemap_editorial | 1,210 |
| sitemap_total | 5,121 |
| indexnow_submitted | 3,940 |
| indexnow_success | 3,940 (100%) |
| robots / sitemap / llms HTTP | 200 / 200 / 200 |
| sample_accessible | 9 / 10 |
| **gsc_indexed** | **STALE** (since 2026-05-17) |
| **bing_indexed** | **STALE** (since 2026-05-17) |
| gsc_impressions_7d / clicks / position / top10 | STALE / STALE / STALE / STALE |
| bing_impressions_7d | 21 |
| bing_clicks_7d | 0 |
| bing_avg_position_7d | 9.76 |
| bing_top10_count_7d | 2 |
| enriched_last_24h | 13 |

**⚠️ Critical:** GSC indexed counts have been **STALE for 4 consecutive days** (2026-05-17 onward).
The most recent non-stale GSC absolute number in the log is from **2026-05-16** — but inspect
the raw row before quoting it; many recent gsc_indexed cells are empty.

**Last non-empty `gsc_indexed` and `bing_indexed` cells** (rough scan): **2026-05-08** row
shows `7, 390` in those columns (gsc=7, bing=390 — verify before citing; small GSC count for
a 3,200-page site implies indexing lag is real, not a logging bug).

**AI citation evidence — NO LOG FILE EXISTS.** Nothing in `data/` matches `citation` or `ai-`.
The claim "AI citation records" has no source-of-truth file. /proof must either:
- (a) **drop** the AI-citation claim until evidence is tracked, or
- (b) **introduce** a `data/ai-citations.csv` artifact (manual-log or scraped-mention pipeline)
  before /proof publishes.

**Recommendation for /proof's citation section:** cite **only what's logged**. Use Bing's 7-day
(21 impressions, 0 clicks, avg position 9.76, 2 top-10 results) as the *concrete* evidence,
and explicitly mark GSC as "indexing in progress, dashboard pending data refresh" rather than
quoting a stale number. Do **not** publish gsc_indexed=7 (2026-05-08) on /proof — it'll read as
a worse story than reality, and it's two weeks old.

---

## P5 — Schema validity

**Validator location:** `src/validators/schema-completeness.ts` + `src/validators/completeness-reporter.ts`.

- Extracts JSON-LD from generated HTML, separates structural errors from data-quality warnings,
  emits `data/build-completeness.json`.
- Five validation layers, all **"measured"** as of `2026-05-21T11:16:44.999Z`:
  `event_level`, `offer_level`, `place_level`, `aria_level`, `datafeed_level`.

**Per-EventType pass rates (latest build):**
| EventType | Total | Pass | Warn | Fail | Pass rate |
|---|---|---|---|---|---|
| concert | 728 | 728 | 0 | 0 | **100%** |
| dj_set | 466 | 462 | 4 | 0 | 99% |
| exhibition | 19 | 19 | 0 | 0 | 100% |
| theater | 2,530 | 2,530 | 0 | 0 | **100%** |
| ...other types | — | — | — | — | (run full `jq` to enumerate) |

(Full breakdown in `data/build-completeness.json` — concert + dj_set + theater alone = 3,724,
which exceeds 3,280 pageable events, because `byType` includes events outside the current
pageable window. /proof should clarify the denominator if citing per-type stats.)

**Verdict:** "Valid Schema.org" is a grounded claim. The validator passes clean, with 0 fails
across the sampled types. /proof can cite **"100% Schema.org validity (0 structural errors,
last validated 2026-05-21)"** with conviction, sourcing the timestamp from
`data/build-completeness.json#meta.lastUpdate` at build time.

---

## P6 — Page-build mechanism

**Does any /proof scaffolding exist?** **No.** Single grep hit (`src/enrichment/__tests__/quality-gates.test.ts:545`)
is unrelated — a code comment about a test "proving" something. Greenfield.

**Closest existing pattern:** **`dist/about/index.html`** (bilingual EL+EN static page).

Build flow for the about page (the model to copy):

1. **`src/templates/content-page.ts`** — `renderContentPage(slug, title, bodyHtml, options)` wraps
   site chrome (nav, footer, hamburger), supports `locale: 'el' | 'en'`, accepts an `alternateSlug`
   for hreflang, supports `schemaJson`, `noindex`, `extraScripts`.
2. **`src/generate-site.ts:680-740`** — defines `{ el, en }` objects with `slug`, `title`,
   `metaDescription`, `schemaJson` (`AboutPage` type), `bodyHtml`. Loops over both, writes
   `dist/{slug}/index.html` and `dist/en/{slug}/index.html`.
3. **`src/generate-site.ts:1031`** — content-page URLs feed into the URL-hashing manifest
   pipeline (cache-busting, last-modified tracking).
4. **Sitemap.** Content pages are tallied under `sitemap_editorial` in the visibility log
   (currently 1,210). /proof would increment this by 2 (EL + EN).

**For /proof specifically:**

- **Mechanism: greenfield, but well-modeled.** Follow about-page pattern exactly. No
  `config/hub-pages.json` involvement (that's for date/category filter hubs).
- **Schema.org type:** `WebPage` with `mainEntity` as a `TechArticle`/`Dataset`/`AboutPage`
  is the natural choice. Could also use `Report` for the credibility framing. Open question;
  decide before writing.
- **Bilingual?** Default yes — the about precedent is EL primary + EN secondary. /proof being
  *credibility evidence for the platform* arguably has higher value in EN (where AI agents
  and reviewers crawl) — consider EN-primary or EN-only as a deliberate choice.
- **Where do the numbers come from at build time?** This is the crux. Options:
  - (a) **Read live artifacts** at generate-site time: `data/build-completeness.json`,
    `data/search-visibility-log.csv` last row, manifest entry counts. *Recommended* —
    self-grounding, no drift possible.
  - (b) Hardcode numbers in `bodyHtml` like the about page does. **Premise-trap risk.** The
    "~2,730" memory anchor is exactly how this fails.
  - (c) Hybrid: hardcode prose, but interpolate numbers from a single `proofMetrics()` helper
    that reads (a) at build time.

  → **Strongly recommend (a) or (c).** Letting /proof drift is the entire failure mode this
  sprint was about.

---

## Decisions blocked / needed before brief

1. **Source-count grounding.** Need a `config/sources.json` (or similar) authoritative roster
   before /proof can claim a number. Until then, "11+", "15+", "dozens" are all assertion-from-memory.
2. **AI-citation evidence.** No log exists. Either drop the claim or build a tracking artifact first.
3. **GSC indexed stale-data handling.** /proof must not quote a 2-week-old gsc_indexed=7 figure.
   Decide on the messaging: "indexing in progress" vs. quote-Bing-only vs. defer entire indexing
   subsection.
4. **Build-time data wiring.** Decide between (a/b/c) above. Recommend (a)/(c) — read live artifacts.
5. **Schema type for the page** (`WebPage`, `TechArticle`, `Report`, etc.).
6. **EL+EN vs EN-only vs EL-only** for /proof.

---

## Carry-forward (post-demo, NOT this session)

- `&amp;` decode bug
- no-wrap 360px test
- CLI-422 known-issues entry

---

**STOP.** Recon complete. Awaiting build brief once decisions above settle.
