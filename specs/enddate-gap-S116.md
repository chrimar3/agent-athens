# endDate Gap Diagnosis — S116 (next-candidate, folded into Session 161)

**Filed:** 2026-05-27 (Session 161)
**Status:** Diagnostic only. No finder warranted. No code.
**Why here:** After the geo finder was refuted, the next candidate gap (`endDate`) was diagnosed in the same warm context (read-only). It is also refuted as a finder target. Held to the same standard: *verify the gap is open AND that absence is actually a defect, before any finder talk.*

---

## 1. No fatal state

No event has `end_date = ''` (empty string) anywhere in `data/events.db`. The validator-ERROR condition (empty-string coord/date) is absent → **no deploy-blocker**.

## 2. Corpus-wide `endDate` absence is EXPECTED, not a gap

Among currently-pageable events (`location_status IN ('verified_athens','pass_through')`, Tier-1 exhibition-aware date filter), nearly every type lacks `endDate`:

| type | pageable total | no endDate |
|------|----:|----:|
| concert | 250 | 250 |
| theater | 128 | 128 |
| dj_set | 95 | 95 |
| festival | 16 | 16 |
| exhibition | 3 | 3 |
| tech | 1 | 0 |

A concert/theater/dj_set has **no meaningful end date** — its absence is correct. Validator treats `endDate` as additional/`warn`, load-bearing only for `exhibition` (Tier-1 keys exhibition lifecycle on `end_date`). **A corpus-wide endDate percentage is noise here.** Segment by type first.

## 3. The exhibition-specific gap is 3 events — and not cleanly fixable

19 exhibitions total; 6 have `end_date` (already-closed, filtered out by `COALESCE(end_date,start_date) >= today`); 13 lack it, of which **3 are currently pageable**:

| id | title | source | classification |
|----|-------|--------|----------------|
| 1e5dcbc8 | Έκθεση φωτογραφίας \| Μαζί, Ορατές | snfcc | **B/C** — end date NOT in captured text; needs re-fetch or genuinely open-ended |
| c772e2c4 | Barbara Kruger: Untitled (Pride and Contempt) | snfcc | **B/C** — same |
| 3c9f7063 | *(mangled filter-string title)* | onassis | **A-derivable but corrupted** — raw text has "28 Jun → 2026-06-28", yet the parser put the **end** date into `start_date`; title is a scraped filter-UI artifact |

**3 events ≠ a finder** (Guard 3/4). Not a clean Class-A parse gap (only 1/3 derivable, and that one is doubly corrupted). Hand-fixable or a tiny per-source parse patch at most. No finder built.

## 4. Real open gap = `image` (next finder, measured)

| field | pageable coverage | gap |
|-------|----|----|
| `location.geo` | **full** | none (closed via venues-master.json) |
| `endDate` | expected-absence by type | 3 exhibitions only |
| **`image`** | **64.2% (191/534 missing)** | **concert 174 missing (30.4%)**, festival 5, dj_set 9 |

`image` is the genuinely open, citation-driving gap. It is the next finder — but its *source/fallback policy* routes to GEO Strategist + Design Navigator before any capture-layer spike (see `specs/geo-finder-residual-S116.md`).

## 5. Incidental data-quality defect surfaced (sized separately — see known-issues)

The 3 pageable exhibitions exposed a scraper defect bigger than the endDate gap:
- **3 live `verified_athens` artifact rows**: 2 titled with a filter-string (`"εμφανίζονται όλες οι εκδηλώσεις … όλες τις ημερομηνίες"`), 1 bare `"Onassis Stegi"` (homepage). These are garbage pages crawlers can index — they dilute citability.
- Onassis "ongoing-*" exhibitions show **start_date=end_date confusion** and **daily-rescrape duplication** (same exhibition across multiple scrape-date `start_date`s).
- **2-minute fix:** targeted reject/hide of the 3 rows (`location_status='problematic'`, reversible). **Root-cause session (separate):** filter-string leaking into title capture + Onassis date parsing. Logged to `docs/known-issues.md`.
