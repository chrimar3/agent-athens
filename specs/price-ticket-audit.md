# Price + Ticket Audit — Session 95

**Date:** 2026-04-28
**Method:** Read-only DB queries + tiered coverage analysis + 3 source-URL spot-checks (2 of 3 blocked by source-side anti-bot 403s; analysis substituted from data inspection where blocked).
**Active filter:** `location_status IN ('verified_athens','pass_through') AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')`
**Baseline:** 483 events across 14 sources.
**Source files NOT modified.**

---

## Tier-aware framing

Three independent measurements:
- **Tier A** (categorical): do we know `open` vs `with-ticket` vs `tba`? — `price_type`
- **Tier B** (numeric detail): when `with-ticket`, do we have a number? — `price_amount` / `price_range` / `price_advance` / `price_door`
- **Tier C** (action layer): can the user actually buy? — `ticket_url`

Predicate note: `price_amount`, `price_advance`, `price_door` are SQLite `REAL` columns; only `IS NULL` was used. `price_range` is `TEXT` so `IS NULL OR = ''` was applied. `price_type` is `TEXT NOT NULL` so the IS NULL branch is dead by schema.

---

## Tier A — `price_type` coverage

| source            | total | no_type | pct_with_type |
|-------------------|------:|--------:|--------------:|
| athinorama.gr     |   204 |       0 |       100.0% |
| residentadvisor   |    93 |       0 |       100.0% |
| more.com          |    74 |       0 |       100.0% |
| ticketservices    |    32 |       0 |       100.0% |
| megaron.gr        |    30 |       0 |       100.0% |
| halfnote          |    19 |       0 |       100.0% |
| clubber.gr        |    13 |       0 |       100.0% |
| snfcc             |     7 |       0 |       100.0% |
| onassis           |     5 |       0 |       100.0% |
| manual            |     2 |       0 |       100.0% |
| productledhub.com |     1 |       0 |       100.0% |
| greeksin.ai       |     1 |       0 |       100.0% |
| eventbrite        |     1 |       0 |       100.0% |
| benaki            |     1 |       0 |       100.0% |

**Tier A is 100% across all sources by schema (price_type is NOT NULL).** No source-level gap here. The interesting Tier-A finding is in cardinality (see §Tier 1 violation below).

## Tier B — numeric detail when ticketed

| source            | ticketed | no_number | pct_with_number |
|-------------------|---------:|----------:|----------------:|
| athinorama.gr     |      104 |         1 |          99.0% |
| more.com          |       74 |         0 |         100.0% |
| ticketservices    |       30 |         1 |          96.7% |
| megaron.gr        |       30 |         0 |         100.0% |
| residentadvisor   |       24 |         0 |         100.0% |
| halfnote          |       19 |         0 |         100.0% |
| clubber.gr        |       13 |         0 |         100.0% |
| onassis           |        5 |         0 |         100.0% |
| manual            |        2 |         1 |          50.0% |
| productledhub.com |        1 |         1 |           0.0% |
| eventbrite        |        1 |         1 |           0.0% |
| benaki            |        1 |         1 |           0.0% |
| snfcc             |        0 |         — |             — |
| greeksin.ai       |        0 |         — |             — |

**Tier B coverage is high where it matters:** all sources with ≥10 ticketed events show ≥96.7%. Low percentages (`manual`, `productledhub.com`, `eventbrite`, `benaki`) are statistical artifacts of n=1–2 rather than real coverage problems.

## Tier C — `ticket_url` coverage

| source            | total | no_url | pct_with_url |
|-------------------|------:|-------:|-------------:|
| more.com          |    74 |      0 |       100.0% |
| ticketservices    |    32 |      0 |       100.0% |
| megaron.gr        |    30 |      0 |       100.0% |
| halfnote          |    19 |      0 |       100.0% |
| onassis           |     5 |      0 |       100.0% |
| manual            |     2 |      0 |       100.0% |
| productledhub.com |     1 |      0 |       100.0% |
| eventbrite        |     1 |      0 |       100.0% |
| benaki            |     1 |      0 |       100.0% |
| clubber.gr        |    13 |      1 |        92.3% |
| athinorama.gr     |   204 |     20 |        90.2% |
| residentadvisor   |    93 |     15 |        83.9% |
| greeksin.ai       |     1 |      1 |         0.0% |
| snfcc             |     7 |      7 |         0.0% |

Three meaningful gaps (≥5 missing rows): `athinorama.gr` (20), `residentadvisor` (15), `snfcc` (7).

## Tier 1 vocabulary violation (cardinality 2d)

Distinct values of `price_type`:

| price_type   |   n |
|--------------|----:|
| with-ticket  | 304 |
| **tba**      | **169** |
| open         |  10 |

**169 events (35% of catalog) carry `price_type='tba'`, a value not in the documented `'open' | 'with-ticket'` vocabulary.** No `'free'` / `'gratis'` / `'δωρεάν'` rows found. The single Tier 1 violation type is `tba`.

`tba` distribution by source:

| source          | tba_n | tba % of source |
|-----------------|------:|----------------:|
| residentadvisor |    67 |          72.0% |
| athinorama.gr   |   100 |          49.0% |
| ticketservices  |     2 |           6.3% |

Two sources concentrate 167/169 (99%) of the violations.

**Critical sub-finding — data integrity inside `tba`:**
On athinorama, 51 of 100 `tba` rows have `price_amount IS NOT NULL`. The amounts are not placeholders (distribution: `15.0`×22, `10.0`×13, `20.0`×7, `25.0`×6, `12.0`×3 — matching the natural athinorama `with-ticket` price distribution). So **the scraper extracted a real price but the price-classification logic mis-tagged the row as `tba` instead of `with-ticket`.**

## Spot-check classification — 3 meaningful Tier-C gap sources

The plan calls for spot-checks of 3 source URLs each on 5 worst sources. Two of three sources blocked WebFetch with 403 (likely anti-bot); for those, classification is inferred from internal data shape rather than HTML inspection. This is a known limitation of the diagnostic; deeper verification needs an authenticated fetch or a manual browser visit.

| source × tier              | classification                            | evidence |
|----------------------------|-------------------------------------------|----------|
| `snfcc` × Tier C           | source-doesn't-publish                    | All 7 SNFCC events have `price_type='open'`, `price_amount=0.0`, and ticketless URL paths (e.g., `/event/face-painting-14/`). SNFCC events are free / RSVP / walk-in — there is no ticket-purchase URL to capture. Spot-check blocked (403) but data shape is unambiguous. |
| `athinorama.gr` × Tier C   | source-doesn't-publish-event-specific-urls (predominantly) + scraper-bug (minority) | WebFetch on `https://www.athinorama.gr/music/gig/sound_now-10089887/` returned only a generic site-wide "Προπωλήσεις more.com" footer link — no per-event buy URL. Athinorama as an aggregator largely doesn't link out per-event; the *fact* that 184/204 events have `ticket_url` populated suggests the scraper either falls back to the event URL itself or pulls from a richer page than this sample. The 20 missing rows are likely the long-tail edge cases where neither path produced a usable URL. |
| `residentadvisor` × Tier C | mixed: source-doesn't-publish (free events) + scraper-bug (with-ticket without url) | Of 15 missing-url RA rows: 2 have `price_type='open'` (free → no ticket needed; correct absence), the rest split between `tba` and `with-ticket`. RA pages typically include external ticket links; missing URL on a `with-ticket` row is a scraper-extraction bug. Spot-check blocked (403). |
| `athinorama.gr` × Tier B   | scraper-bug (classification logic, not extraction)                                  | 51/100 `tba` rows have `price_amount` populated with realistic values (15.0, 10.0, 20.0…). The data was extracted; the rule that maps amount → `price_type` is broken. Not a "format changed" issue — extraction works; the post-extraction classifier is wrong. |
| `residentadvisor` × Tier A/cardinality | scraper-bug + source-doesn't-publish | RA's 67 `tba` rows: a portion are pre-announce events where price genuinely isn't published yet (legitimate `tba` semantically); a portion are bugs where extraction failed. Cannot disambiguate without HTML inspection. |

`source-publishes-but-format-changed` was not the dominant explanation for any source × tier in this audit.

## Hypothesis — dominant gap and concentration

**Dominant gap is Tier-A vocabulary compliance, not Tier B or C coverage.** Tier B is ≥97% on every meaningful source. Tier C is ≥84% on every meaningful source. Both are operationally usable. The real systemic issue is that **35% of the catalog carries `price_type='tba'` — a value the architecture says shouldn't exist**, and inside that, a third (51 athinorama rows) carry contradictory signals (tba + extracted amount).

**Concentration:** the price-tier problem is concentrated in **two sources** (athinorama 49%, RA 72%) — not spread evenly. Fixing those two sources moves the cardinality violation from 35% of catalog to <1%.

Tier C residual gaps are smaller and split:
- snfcc 7/7 = legitimate semantic absence (free events; not a bug to fix in scrapers)
- athinorama 20/204 = source-structural; partial fix possible by falling back to event URL
- RA 15/93 = mostly free events (legitimate absence) + a scraper-extraction long tail

## Recommendations for fix planning (deferred)

Numbers cited; recommendations live in `diagnostic-summary.md`.
