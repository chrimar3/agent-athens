# Onassis Ingestion Defects — S117 Classification

**Filed:** 2026-05-27 (Session 162)
**Goal:** Diagnose the 3 Onassis ingestion defects behind the hidden garbage rows; ship the recurrence-killer (Defect 1) at the save seam before the daily pipeline can re-publish.
**Status:** Diagnostic complete. Defect 1 → fix this session. Defect 2 → checkpoint (reasoned deviation, below). Defect 3 → checkpoint.

---

## Confirmed ingestion path (Step 0 — verified, not assumed)

- **Daily entrypoint:** `scripts/daily-automated.sh:161` runs `bun run scripts/scrape-all.ts --crossref` (NOT the standalone `scrape-onassis.ts`). Memory caveat (`scrape-all.ts` vs `scrape-all-sources.ts`) resolved → it's **`scrape-all.ts`**, source token `onassis`.
- **Onassis scraper:** `scripts/scrape-onassis.ts` (`scrapeOnassis()`), wired into `scrape-all.ts` via `scrapeOnassisAdapter()` (`:1464`) registered at `:1538`.
- **Save seam:** `scrape-all.ts:saveEvents()` (`:1321`) does the `INSERT ... ON CONFLICT(id) DO UPDATE` (`:1330-1354`). The scope filter runs per-event at `:1359` and **skips the insert on exclusion** (`:1366-1370` `if (!inScope) { outOfScope++; continue; }`).
- **Scope mechanism (Defect 1 home — VERIFIED LIVE):** `src/validators/scope-filter.ts` `shouldExcludeEvent({title,venue,description,url})` + `config/event-scope.json`. Imported at `scrape-all.ts:36`, called at `:1359`. It is the single chokepoint for **all 10 sources** → a fix here protects every future scrape. ✅ Brief's fix-surface assumption holds.

## The hidden rows (Step 1a)

3 Onassis rows flagged `problematic` in S161 (among a larger pre-existing problematic bucket of unrelated athinorama/meetup/RA events):

| id | title | start_date | end_date | type |
|----|-------|-----------|----------|------|
| f92abefd4ae109e7 | εμφανίζονται όλες οι εκδηλώσεις … | 2026-05-17 | (empty) | exhibition |
| 3c9f7063afd49ec0 | εμφανίζονται όλες οι εκδηλώσεις … | 2026-06-28 | (empty) | exhibition |
| b00148abc2468cfa | Onassis Stegi | 2026-05-17 | (empty) | exhibition |

Note: end_date is **empty** on all 3; `3c9f7063` has the *end* date ("28 Jun", from raw "17 May → 28 Jun") sitting in `start_date`. So Defect 2's real shape is "single/wrong date → `start_date`, `end_date` empty," not literally `start==end` as the brief framed it.

## Root cause (Step 1, static — recurrence confirmed without a live scrape)

`scrape-onassis.ts:111-146` extracts with **over-broad selectors** (`.card`, `article`, `h2,h3,.title,[class*="title"]`) on `/el/whats-on`. These match navigation / filter-status chrome:
- "εμφανίζονται όλες οι εκδηλώσεις σε όλες τις τοποθεσίες από όλες τις ημερομηνίες" = a filter-status UI string ("showing all events in all locations from all dates").
- "Onassis Stegi" = the site header/logo text, captured as a title; `venue_name` is hardcoded to `'Onassis Stegi'` (`:169`) → **title === venue**.
The only guards are `title.length > 3` (`:149`) and a weak keyword test (`:136-138`). Nothing rejects filter-chrome or title===venue. **Every scrape re-captures these** → live recurrence.

*(Live `--source onassis --dry-run` skipped: `saveEvents` short-circuits on `dryRun` (`:1322`) before the scope check, so it wouldn't exercise the filter anyway; static analysis + the deterministic unit test below are the proof. Documented deviation from brief Step 1b.)*

---

## Defect classification + edit surfaces

### Defect 1 — filter-string / bare-venue titles saved as events  → **FIX THIS SESSION**
- **Surface:** `src/validators/scope-filter.ts` + `config/event-scope.json` + test. Save-seam reject, not per-scraper (protects all sources — infrastructure-beats-content).
- **Mechanism gap:** current `shouldExcludeEvent` is keyword/venue/URL-substring only — no title-pattern and no title===venue logic. Must EXTEND (config-driven), not rebuild.
- **Plan:** add `excludedTitlePatterns` (precise substring for the filter-string) + `rejectTitleEqualsVenue` flag (exact normalized title===venue). Run early (after URL deny-list, before override keywords) so artifacts can't be rescued by an override. **Guard test:** a legit short title (e.g. "Eivor", venue ≠ title) and a title that merely *contains* the venue ("… at Onassis Stegi") must NOT be excluded.

### Defect 2 — single/wrong date → start_date, end_date empty  → **CHECKPOINT (reasoned deviation from brief Step 4)**
- **Surface:** bounded to `scrape-onassis.ts` date parsing (`parseGreekDate` + range regex `:154-160`) — local to that file, does not touch shared parsing.
- **Why not fixed now, despite being bounded:**
  1. **Every observable instance is a Defect-1-rejected row** — once Defect 1 ships, the filter-string/bare rows never save, so their date confusion is moot.
  2. **Legit victims need a real input sample.** A correct fix depends on the actual `dateText` shape on the live page; a blind regex tweak is speculative and touches **Tier-1** date logic (`COALESCE(end_date,start_date)` pageability) — risk > reward without a verified sample.
  3. It is **tangled with the broad-selector capture problem** (same fragile scraper) — the brief's Step 4 says "if tangled, fold into the checkpoint." It belongs with the scraper-quality rewrite, not a date-only patch.
- Folded into the Defect 3 checkpoint (scraper-quality scope).

### Defect 3 — daily-rescrape duplication  → **CHECKPOINT (Guard 6 — do NOT touch)**
- **Surface:** the dedup/upsert **identity key** — `ON CONFLICT(id)` in `saveEvents` (`:1340`), where `id` is `md5(title.toLowerCase().trim() + '-' + startDate)` (`scrape-onassis.ts:41-44`, and the equivalent in `scrape-all.ts`). Because `id` includes `start_date`, the same exhibition scraped on different days (with start_date = scrape-influenced date) yields **different ids → duplicate rows** instead of an upsert.
- **Blast radius:** the id scheme is the shared write path for **all 10 sources**. Changing the identity key is high-risk shotgun-surgery. Its own session — see `specs/onassis-dedup-S117-checkpoint.md`.

### Incidental finding (not in brief's 3) — type mis-assignment
`scrape-onassis.ts:223` hardcodes `type: 'exhibition'` for everything; e.g. "By Heart | Tiago Rodrigues" (theater) and "ONX Showcase" are mis-typed exhibition. Note for the scraper-quality session; not fixed here.
