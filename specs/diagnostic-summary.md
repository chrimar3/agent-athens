# Diagnostic Summary — Session 95

**Date:** 2026-04-28
**Scope:** Categorization + price/ticket triage diagnostic. Read-only. Zero source files modified.
**Inputs:** `specs/categorization-audit.md`, `specs/price-ticket-audit.md`.
**Output:** quantified problem scope + recommended fix order for the Planner.

---

## Quantified problem scope

### Problem 1 — Categorization quality

| metric                                    | value | scope  |
|-------------------------------------------|------:|--------|
| Catalog size (active filter)              |   483 |  total |
| Manually classified sample                |    30 |   ~6% |
| Sample correct                            |    25 |  83.3% |
| Sample ambiguous                          |     3 |  10.0% |
| Sample wrong                              |     2 |   6.7% |
| Dominant failure class (5 non-correct)    | keyword (3/5) | qualitative |
| Sources with zero failures in sample      | residentadvisor, clubber.gr, halfnote, megaron.gr, ticketservices, snfcc, onassis | single-purpose / venue-locked |
| Sources with most failures in sample      | more.com (2/5 sampled), athinorama.gr (2/13 sampled) | aggregators |

Two sub-patterns inside the keyword failure class:
- Festival-umbrella miss (e.g., `Release Athens 2026 X SNF NOSTOS` classified as `concert`)
- Low-cardinality category fragility (`show` and `performance` types fire on rare keywords; misclassify edge cases like a Greek opera as `show`)

Sample size caveat: 30 is small. Confidence bounds on the 7% wrong rate are wide. The "aggregators have problems, single-purpose sources don't" pattern matches the categorizer's design and is robust to sample size.

### Problem 2 — Price + ticket coverage

| metric                                       |    value |
|----------------------------------------------|---------:|
| Tier A (`price_type` populated)              |   100.0% |
| Tier B (numeric when ticketed) — meaningful sources | ≥96.7% |
| Tier C (`ticket_url` populated) — meaningful sources | 84–100% |
| **Tier 1 vocabulary violation: `price_type='tba'`** | **169/483 = 35.0%** |
| `tba` concentration (athinorama + RA)        | 167/169 = 98.8% |
| **Data integrity: athinorama `tba` with extracted price_amount** | **51/100 athinorama-tba rows** |
| Tier C true gaps (≥5 missing rows)           | athinorama 20, residentadvisor 15, snfcc 7 |
| Tier C gaps that are legitimate (free events, no ticketing exists) | snfcc 7/7 + RA ≥2/15 |

Cardinality violation findings (the headline):
- `'tba'` is a third price_type value not in the documented `'open' | 'with-ticket'` vocabulary.
- 51 athinorama events tagged `tba` carry valid extracted price values matching the natural with-ticket price distribution — extraction works, classification logic is wrong.
- Two sources (athinorama, RA) drive 99% of `tba` occurrences; fixing them moves the violation rate from 35% to <1%.

## Recommended fix order (impact × effort)

Ranked from highest to lowest expected ROI.

### 1. **HIGH impact / LOW effort — fix athinorama price-type classification logic**

- Symptom: 51 athinorama events have `price_type='tba'` while `price_amount` holds a real price (15.0, 10.0, 20.0…).
- Root cause hypothesis: post-extraction logic that maps `price_amount` → `price_type` doesn't fire on the athinorama path (or has a broken predicate).
- Likely fix scope: 1 file, 1 function in the athinorama-specific path of `src/scraping/` or its post-processing layer. NOT in the scraping/extraction itself — that's working.
- Quantified gain: drops `tba` violation from 169 to ~118; brings athinorama into vocabulary compliance for 51 events.
- Risk: low. Changing the classification logic affects only the `tba`/`with-ticket` boundary; no downstream contract change.
- **Planner note:** scope this BEFORE attempting Tier C ticket_url fixes — the `tba` rows that get reclassified to `with-ticket` may then need ticket_url enrichment, so the order matters.

### 2. **HIGH impact / MEDIUM effort — RA `tba` audit and reclassification**

- Symptom: 67/93 RA events (72%) carry `price_type='tba'`. Some are legitimate (event genuinely not yet priced); some are extraction failures.
- Root cause hypothesis: mixed. Need to disambiguate by spot-checking RA pages with successful HTML access (current diagnostic blocked by RA anti-bot 403).
- Likely fix scope: depends on disambiguation outcome. If primarily extraction-bug → scraper change. If primarily legitimate → leave as-is and decide what `tba` means in the data model.
- Quantified gain: bounded by 67 events. Best case drops `tba` violation from ~118 (post #1) to <5; worst case confirms `tba` as a legitimate third value and motivates a model change instead of a code fix.
- **Planner note:** this fix needs an HTML-accessible spot-check before the fix is scoped. Consider an authenticated fetch path or manual review of 10-15 RA event URLs.

### 3. **MEDIUM impact / LOW effort — categorization festival/show priority pass**

- Symptoms (from categorization-audit §3):
  - `Release Athens 2026 X SNF NOSTOS` → `concert` (should be `festival`)
  - `Τρισεύγενη` → `show` (should be `concert` — Greek opera)
- Root cause hypothesis: keyword-priority order in `config/categorization-keywords.json` and missing festival-brand whitelist.
- Likely fix scope:
  - Add a small festival-brand whitelist (Release Athens, Athens Open Air, Plissken, etc.) for early high-confidence match
  - Re-order or add a negative-keyword guard to prevent `show` from firing on opera/operetta titles when venue is `Μέγαρο Μουσικής` etc.
- Quantified gain: directly fixes the 2 wrong rows in the 30-sample (extrapolated: ~13 events catalog-wide if rate holds, but with high uncertainty).
- Risk: medium. Touching the priority order is a shotgun-surgery hazard — a re-order can surface latent miscategorizations elsewhere. Each fix needs paired before/after counts.

### 4. **LOW impact / LOW effort — Tier C scraper fallback for athinorama and RA `with-ticket` events without ticket_url**

- Symptom: athinorama 20 events and a portion of RA 15 events with `price_type='with-ticket'` but `ticket_url=NULL`.
- Root cause hypothesis: scraper extracts price but doesn't fall back to event URL when no per-event ticket URL is available.
- Likely fix scope: 1-2 lines in scraper to set `ticket_url = url` when no specific ticket URL is found AND `price_type='with-ticket'`. Has the side-effect of making the "buy" UX go to the source page; needs UX agreement.
- Quantified gain: ~25–30 events get a usable buy-link.
- **Planner note:** Tier C 90% / 84% is operationally usable today; this is a polish-tier fix that should come AFTER the Tier-A/`tba` work so the affected rows are correctly tagged `with-ticket` first.

### 5. **LOW impact / EVALUATION ONLY — formalize `tba` or fold it**

- Symptom: vocabulary documentation says `'open' | 'with-ticket'` but reality is three-valued.
- Decision required: either (a) update the documented vocabulary to include `tba` as a legitimate intermediate state, or (b) treat `tba` as always-a-bug and refuse to write it.
- Recommendation: this is a model-design decision that belongs in `docs/SYSTEM-REFERENCE.md` and `.claude/notes/decisions.md`, not a code fix. After fixes #1 and #2, the residual `tba` count will inform whether (a) or (b) is appropriate.

---

## Hand-back to Planner

Three concrete fix-sessions emerge from this diagnostic:

| session | scope | files likely touched | depends on |
|---------|-------|----------------------|------------|
| **S96** | athinorama price-classification logic | 1-2 files in `src/scraping/` or post-processor for athinorama | — |
| **S97** | RA `tba` disambiguation + reclassification | RA scraper or post-processor; possibly model-design note | S96 (so we know the residual `tba` shape) |
| **S98** | categorization festival-brand + show-keyword priority pass | `config/categorization-keywords.json`, possibly `src/categorizer/categorize-event.ts` | independent of S96/S97 (but coordinate timing if both touch shared validation tests) |

Tier-C polish (#4) and `tba` model-design decision (#5) are deferrable to a later session once the high-impact fixes have shifted the data shape.

**Open items the diagnostic could not resolve:**
- RA HTML-level spot-check (blocked by 403) — needs auth path or manual visit
- SNFCC HTML-level spot-check (blocked by 403) — but data shape strongly suggests the absence is correct (free events)
- Whether the 3 ambiguous categorization rows in the sample (Vaginahood, Flamecore, Release Athens sub-event) reflect a model gap (need new types) or a labeling judgment call

**Files created this session:** `specs/categorization-audit.md`, `specs/price-ticket-audit.md`, `specs/diagnostic-summary.md`. No source files modified.
