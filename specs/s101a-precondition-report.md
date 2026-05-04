# S101a Discovery — Precondition Report

**Generated:** 2026-05-04
**Session type:** Read-only discovery (Guard 7 / Prerequisite Discovery)
**Working directory:** `/Users/chrism/Project with Claude/AgentAthens/agent-athens`
**Files modified during discovery:** 1 (this report). No source/CSS/template/DB/config edits.

---

## 1. /this-weekend rendering

- **Greek path:** `dist/this-weekend.html` exists (192,202 bytes, 2026-05-04 14:50)
  — flat-file convention, NOT `dist/this-weekend/index.html`.
- **English path:** `dist/en/this-weekend/index.html` exists (189,674 bytes, 2026-05-04 08:16)
  — directory-with-index convention.
- **Greek variant cause** (Section-1 augmentation): **(d) different file convention**
  — neither (a) intentional config / (b) silent build failure / (c) never built. Greek hubs
  are written to `dist/<slug>.html` at `src/generate-site.ts:535` while English hubs go to
  `dist/en/<slug>/index.html` at `src/generate-site.ts:516`. The directory `dist/this-weekend/`
  exists only because the `/all/` overflow page is rendered into it (`src/generate-site.ts:535-540`).
- **Generator:** `src/generators/hub-page.ts`
  - `renderHubPage(...)` at line 242
  - `generateHubPages(...)` at line 496
- **Current rendered structure** (Greek `dist/this-weekend.html`, source order):
  1. `<section class="hub-answer-capsule">` (Part 1 — line 2013)
  2. `<h1>Εκδηλώσεις στην Αθήνα Αυτό το Σαββατοκύριακο</h1>` (line 2077)
  3. `<section class="hub-comparison-table-section">` with `<h2>Επισκόπηση</h2>` and `<table class="hub-comparison-table">` (Part 2 — line 2165)
  4. `<section class="card-grid" itemscope itemtype="https://schema.org/ItemList">` with date-grouped `<h2 class="date-group-header">` headers and event cards (line 2196)
  5. `<section class="hub-event-blocks">` with `<h2>Αναλυτικά</h2>` (Part 3 — line 2757)
  6. `<section class="hub-faq">` with `<h2>Συχνές Ερωτήσεις</h2>` and 8 `<details>` children (Part 4 — line 2786)
  7. `<section class="hub-seasonal-narrative">` with `<h2>Τι να Περιμένετε</h2>` (Part 5 — line 2797)
  8. `<h2>Σχετικές Σελίδες</h2>` (line 2807) — site-chrome related-pages section from `src/templates/page.ts:374`, NOT the cross-links section
- **English structure:** identical (English headings: "Overview", "What to Expect", etc.).
  No structural divergence between locales.
- **Cornerstone treatment visible:**
  - 8 FAQs (vs 4 for non-cornerstones — confirmed against `config/hub-pages.json`)
  - `hub-seasonal-narrative` section present (only cornerstones populate `seasonalNarrativeEl`/`En`)
  - Custom `metaDescriptionEl`/`metaDescriptionEn` present in config
  - hreflang link to English variant present
  - `hub-cross-links` section NOT rendered (cornerstones don't render this)
- **5-part GEO template structure: PRESENT.** `src/generators/hub-page.ts:375-451` literally
  comments the parts:
  - `// Part 1: Answer Capsule` (line 375)
  - `// Part 2: Comparison Table` (line 388)
  - `// Part 3: Event Blocks` (line 409)
  - `// Part 4: FAQ Section` (line 429)
  - `// Part 5: Seasonal Narrative` (line 439)
  - `// Part 6: Cross-links` (line 453) — non-cornerstone only

---

## 2. Comparison table

- **Status:** **BUILT** (rendering live, has test coverage).
- **File location:**
  - Render code: `src/generators/hub-page.ts:388-407` (function-local, inline JSX-style template literals)
  - Row helper: `renderComparisonRow(e, locale)` referenced at line 393 (definition elsewhere in same file)
  - CSS: `src/styles/design-system.css:2525-2554`
  - Test: `src/generators/__tests__/hub-page.test.ts:108` asserts `class="hub-comparison-table"` is present
- **Editor's Pick ★ column: NOT PRESENT in code.** Zero matches for `Editor's Pick`,
  `editor's pick`, `editorsPick`, `editors-pick`, or `★` across `src/`. Current header row is
  fixed at 4 columns (`hub-page.ts:399`):
  `Event | Venue | Date | Entry` (Greek strings: equivalent translations via i18n).
- **Currently rendered on:** every hub page that passes the `MIN_EVENTS_THRESHOLD` filter
  (cornerstone AND non-cornerstone — universal). Both Greek and English variants when
  `answerCapsuleEn` is set.
- **Implication for §1 Path A:** Since the ★ column does NOT exist in code, the §1 amendment
  in S101a can be written *as part of building the column*, not as a retroactive doc fix.

---

## 3. CSS idioms

- **`.hub-seasonal-narrative`:** defined at `src/styles/design-system.css:2628-2629`:
  ```css
  .hub-seasonal-narrative { margin: var(--space-xl) 0; }
  .hub-seasonal-narrative:empty { display: none; }
  ```
  (Note: my grep was for `hub-seasonal` — full class is `.hub-seasonal-narrative`. There is
  NO bare `.hub-seasonal` class.)
- **`.section-label`:** **NOT DEFINED.** Zero matches across `src/`, `dist/`, or `config/`.
  This idiom does not currently exist anywhere — not in CSS, not in templates, not in
  rendered output. If S101a's plan references it, S101a is *introducing* it, not matching
  existing convention.
- **`--accent-primary` actual usage:** **43 occurrences** across `src/styles/design-system.css`
  (single CSS file — there are no other CSS files; `src/styles/` contains only `design-system.css`).
  - Variable definition: line 22
    ```
    --accent-primary: #f5e642;   /* Limit to: CTAs, active states, links, highlights, badges */
    ```
    The comment enumerates **5 thematic categories**: CTAs, active states, links, highlights, badges.
  - Only ONE selector explicitly labels its category: line 2437
    ```
    /* Answer Capsule — accent-primary left border (context 5 of 5) */
    ```
    No comments for "context 1 of 5" through "context 4 of 5" exist — the convention is
    partially documented.
  - Selectors using `--accent-primary` (grouped/abbreviated):
    - Site chrome / nav: `.error-home-link`, `.search-trigger`, `.action-link.is-active`, etc.
      (lines 199, 204, 266, 515, 520)
    - Event detail page (EDP): `.edp-*` selectors at lines 801, 872, 906, 915, 993, 1001, 1217-1221
    - Cards: `.card-*` selectors at lines 1251-1254, 1411-1412, 1608-1609
    - Filter bar: `.filter-*` at lines 1697, 1704
    - Misc components: `.practical-table a` (1107), `.saved-event-item` (1315), error states
    - Hub pages: `.hub-answer-capsule` border-left (2441), `.hub-stats a:hover` (2458),
      `.hub-card:hover` (2486-2487), `.hub-comparison-table` (2512), `.hub-event-block h3 a:hover` (2566),
      and lines 2641, 2643, 2648
- **Discrepancy with §1 documented (5 contexts):** **No, but interpretation matters.**
  The "5 contexts" in §1 documentation refers to the **5 thematic categories**
  (CTAs / active states / links / highlights / badges) declared in the `--accent-primary`
  variable comment, NOT 5 raw CSS selectors. Actual selector-level usage spans ~43 occurrences
  grouped under those 5 categories. If S101a's §1 amendment treats "context" as
  "thematic category" the count is correct; if it treats "context" as "selector" the count
  is significantly off. **Dev Planner needs to clarify this interpretation in the §1 amendment.**

---

## 4. DB schema

- **`events` table column count:** 53 columns (full schema below).
- **Existing editorial/priority/featured columns:**
  - `is_featured INTEGER DEFAULT 0` — **PRE-EXISTING binary flag.** Status of population
    not verified (out of read-only discovery scope), but the column itself exists.
  - `is_cancelled INTEGER DEFAULT 0` — boolean, distinct from featured.
  - `dedup_protected INTEGER DEFAULT 0` — manual edit protection, semantically adjacent.
  - `enrichment_tier TEXT DEFAULT 'stub'` — graded enum (stub/basic/...). Editorial-weight-adjacent.
  - `view_count INTEGER DEFAULT 0` — engagement metric, could be misused as proxy for popularity.
  - **No graded `priority` / `editorial_weight` / `pick_rank` column exists.**
- **Implication for S101a:** if editorial picks need a single binary flag, **`is_featured`
  could be reused** (semantic redefinition required). If they need ordered ranking
  (1st pick / 2nd pick / 3rd pick), a new column is needed — recommend
  `editorial_pick_rank INTEGER` to match conventions, ideally NULL-default (no pick) with
  positive integers for ranked picks.
- **Naming convention:** **snake_case** (universal across all 53 columns).
- **NULL convention for new optional columns:** majority of columns use `DEFAULT 0`,
  `DEFAULT 'stub'`, `DEFAULT 'EUR'`, etc. — explicit defaults rather than NULL. NULL is used
  for inherently optional fields (`venue_lat`, `venue_lng`, `enriched_at`, `image_url`).
  Pattern: **default-value preferred for booleans/enums; NULL for optional foreign data**.
- **Date storage convention:** `TEXT` (ISO 8601 strings). Examples: `start_date TEXT NOT NULL`,
  `created_at TEXT NOT NULL`, `enriched_at TEXT` (nullable). No `DATE`/`TIMESTAMP` types used.
- **Booleans:** `INTEGER DEFAULT 0` (SQLite-idiomatic — there is no native BOOLEAN). Multiple
  examples: `is_cancelled`, `is_featured`, `dedup_protected`, `all_day`, `permanent_collection`,
  `needs_enrichment`, `schema_valid`.
- **All 18 tables:** `_migrations`, `artist_info`, `dedup_merges`, `enrichment_log`,
  `enrichment_queue`, `entity_knowledge`, `events`, `events_fts` (+ 4 FTS subtables),
  `generation_stats`, `knowledge_feedback`, `processed_emails`, `rejected_events`,
  `scrape_stats`, `sqlite_sequence`, `venue_context`.
- **Total events:** 12,542.

---

## 5. Authoring path precedents

- **`config/hub-pages.json` structure:**
  - Top-level: `{ "hubs": [ {...}, {...}, ... ] }`
  - 16 hubs, 4 cornerstones (`today`, `this-weekend`, `open`, `this-month`).
  - Per-hub fields (HubConfig type — `src/types.ts:156-169`):
    - `slug: string`
    - `cornerstone?: boolean`
    - `titleEl: string`, `titleEn: string`
    - `filter: HubFilter` (discriminated union: `date`/`event_type`/`event_types`/`tag`/`price_type`)
    - `answerCapsuleEl: string`, `answerCapsuleEn?: string`
    - `faqs: HubFaq[]` — each FAQ has `questionEl`/`answerEl`/`questionEn?`/`answerEn?`
    - `metaDescriptionEl?`, `metaDescriptionEn?`
    - `seasonalNarrativeEl?`, `seasonalNarrativeEn?` (HTML strings — `<p>...</p>`)
- **Bilingual field pattern:** `*El`/`*En` suffix camelCase (e.g., `titleEl`, `answerCapsuleEn`,
  `seasonalNarrativeEl`). Matches HubConfig type. **NOT** nested `el`/`en` objects.
- **Loader paths (3 places):**
  - `src/generators/hub-page.ts:31` — `CONFIG_PATH` constant, used in `generateHubPages()`
  - `src/utils/cornerstone-links.ts:14` — `CONFIG_PATH` constant, used in `getCornerstoneLinks()`
  - `src/generate-site.ts:323-324` — top-level loader passing config into pipeline
- **Other JSON-in-repo authoring patterns for structured editorial content:**
  - **`config/editorial-content.json`** — *existing* editorial surface, 32 lines, has 3 maps:
    - `pullQuotes[]`: array of `{ textEl, textEn, hubs[], season: null|"summer" }` — soft seasonal tagging
    - `featuredEvents{ <event_id>: { vignetteEl, vignetteEn } }` — keyed by event ID, this is the
      **exact precedent for editorial picks**
    - `sectionEditorials{ <hub_slug>: { textEl, textEn } }` — per-hub editorial intro text
    - All current entries are `[PLACEHOLDER]`-prefixed; structure is built but not populated.
    - Loader: `src/utils/editorial-content.ts` (functions `getPullQuotes`, `getFeaturedVignette`, `getSectionEditorial`).
    - `getSectionEditorial(config.slug, locale)` is already wired into `hub-page.ts:418` (renders inside Part 3 event blocks).
    - **`getFeaturedVignette` is exported but currently has zero callers in `src/`** (test references only).
  - `config/seasonal-rules.json` — month-integer based (`"months": [5,6,7,8,9]`), 139 lines.
  - `config/enrichment-priority.json` — has explicit `start`/`end` ISO date window for tier priority (closest precedent for date-windowed entries).
- **Date-windowed content precedent:**
  - **NO** existing JSON-in-repo file uses per-entry ISO `start_date`/`end_date` for editorial content with date windows.
  - Closest analogues: `enrichment-priority.json` (single project-level window) and `seasonal-rules.json` (month integers).
  - `editorial-content.json` uses soft tagging (`season: null|"summer"`) — NOT date windows.
  - **If S101a needs date-windowed editorial picks (e.g., "this is the pick for May 1–7"), there is no direct precedent.** S101a is establishing the convention; naming and field shape decisions are load-bearing.

---

## 6. S60 cornerstone treatment

- **`HubConfig.cornerstone` field:** EXISTS at `src/types.ts:164`:
  ```ts
  cornerstone?: boolean;
  ```
  (optional; absence = false.)
- **Cornerstone hubs in config (4):**
  - `today` (line 5 of `hub-pages.json`)
  - `this-weekend` (line 71)
  - `open` (line 361)
  - `this-month` (line 553)
  Confirmed redundantly via the `CORNERSTONE_LABELS` map in `src/utils/cornerstone-links.ts:17-22`
  (4 entries: today, this-weekend, open, this-month).
- **Behavioral differences in code (cornerstone vs non-cornerstone):**
  - **8 FAQs vs 4 FAQs** — counted per-hub: all 4 cornerstones have `faqs.length === 8`,
    all 12 non-cornerstones have `faqs.length === 4`. (Convention enforced via authoring,
    not code — no length validator found.)
  - **`seasonalNarrativeEl`/`seasonalNarrativeEn` populated** — only on cornerstones (4/4).
    All 12 non-cornerstones have these fields absent. Code at `hub-page.ts:441-451` renders
    `Part 5: Seasonal Narrative` only when present, so non-cornerstones omit the section entirely.
  - **Custom `metaDescriptionEl`/`metaDescriptionEn`** — only populated on cornerstones (4/4).
    Non-cornerstones fall back to the generic generator at `src/utils/meta-descriptions.ts:135` (`generateHubMetaDescription`).
  - **`renderHubCrossLinks(locale)` injection** — `hub-page.ts:455`:
    ```ts
    if (!config.cornerstone) {
      crossLinksHtml = renderHubCrossLinks(locale);
    }
    ```
    Non-cornerstones get a `<section class="hub-cross-links">` with links TO all 4 cornerstones.
    **Cornerstones do NOT render this section.**
  - **Event-set hash gate for `/this-weekend`** — `generate-site.ts:464` pre-computes a hash
    of the weekend event set to set `lastModified` correctly; this is `/this-weekend`-specific
    cornerstone handling, not shared across all cornerstones.
- **Structural template differences (in rendered HTML):**
  - **Cross-links section** (`<section class="hub-cross-links">` with `<h2>`) is conditionally
    present (non-cornerstones have it, cornerstones don't). This IS a structural difference.
  - The "Σχετικές Σελίδες" `<h2>` seen at line 2807 of `dist/this-weekend.html` comes from
    `src/templates/page.ts:374` (universal page chrome), NOT the cornerstone cross-links —
    so it's not a cornerstone-vs-non-cornerstone difference.
- **Cross-reference with Step 2 (comparison table):**
  - **The comparison table is UNIVERSAL** — rendered for every hub regardless of cornerstone flag.
    `hub-page.ts:388-407` has no cornerstone gate. Confirmed by inspection.
  - Implication: Design Navigator's "5-part template" reference is accurate FOR cornerstones,
    but ALL parts 1-5 (and the table) also render on non-cornerstones — there is no
    "cornerstone-only" structural distinguisher beyond seasonal narrative population and
    the cross-links inversion.

---

## Incidental findings

(Noted but not investigated — fixes are out of scope.)

1. **Placeholder editorial content**: `config/editorial-content.json` is 100% `[PLACEHOLDER]`
   strings — pullQuotes (2 entries), featuredEvents (1 stub keyed `PLACEHOLDER_EVENT_001`),
   sectionEditorials (2 hubs: `concerts`, `exhibitions`). The structure has been live for some
   time but never populated. `getFeaturedVignette` is exported and tested but has no production
   callers in `src/`.
2. **Inconsistent context-of-5 documentation**: only `(context 5 of 5)` is labeled in
   `src/styles/design-system.css:2437`. Contexts 1-4 are not labeled, making the "5 contexts"
   convention partially documented and brittle to future edits.
3. **`section-label` does not exist anywhere**: zero matches in source, dist, or config.
   If any documentation references this idiom, it's referencing a class that has never been built.
4. **`view_count` exists but population unknown**: `events.view_count INTEGER DEFAULT 0` —
   discovery did not check whether this is wired to anything (analytics, sorting). If
   editorial picks ever consider engagement signals, this column's status matters.
5. **Date-grouping insertion site is non-standard**: `hub-page.ts:470-478` finds the
   `class="card-grid"` substring and inserts content after the next `</section>` — a string-search
   anchor rather than a structural template marker. Position-1.5 insertion (between Parts 1 and 2)
   would use a similar string-search at `<main id="main-content">` per existing line 407.
6. **`HUB_EVENT_LIMIT` and overflow handling**: there's a separate overflow page system
   (`renderOverflowPage`) for hubs exceeding the limit, written to `dist/<slug>/all/index.html`.
   Editorial picks rendered in the main hub may need to be excluded or duplicated on overflow
   pages — out of S101a scope but worth noting.

---

## Open questions for Dev Planner

1. **§1 amendment interpretation**: Does "context" in §1 mean (a) thematic category — count
   stays at 5 — or (b) raw CSS selector — count is ~43? If the ★ column adds a new selector
   under the existing "highlights/badges" category, the count stays at 5. If it adds a new
   category, the count goes to 6. This affects the wording of the §1 amendment.
2. **`is_featured` reuse vs new column**: should S101a reuse the existing `is_featured INTEGER`
   binary flag (semantic redefinition risk: existing rows may already have data) or add a
   new graded `editorial_pick_rank INTEGER`? Discovery did not check current `is_featured`
   population — that's an S101a sub-task.
3. **Editorial picks via existing `featuredEvents` map vs new surface**: `config/editorial-content.json`
   already has `featuredEvents { <event_id>: { vignetteEl, vignetteEn } }` — exactly the shape
   needed. Should S101a extend this file (add date-windowing fields like `validFrom`/`validUntil`
   per entry) or create a new file? Extension matches the existing precedent and reuses the
   loader; new file establishes a date-windowed convention.
4. **Date-windowing for editorial picks**: there is no precedent for per-entry ISO date windows
   in JSON-in-repo editorial content. Naming choice (`validFrom`/`validUntil` vs `startDate`/`endDate`
   vs `effective`/`expires`) is load-bearing as it sets the precedent. Note that the *DB* uses
   snake_case `start_date`/`end_date`, while *JSON configs* use camelCase — so JSON likely wants
   `validFrom`/`validUntil` or `startDate`/`endDate` camelCase.
5. **Comparison table: which events make the table?**: code at `hub-page.ts:392` slices the first
   `MAX_TABLE_ROWS` events by date-ascending order. If editorial picks should pin to the top of
   the comparison table, that's a sort change, not a structural change.
6. **Greek-vs-English file convention**: should the Greek `/this-weekend` migrate to a directory-
   with-index path matching English (`dist/this-weekend/index.html`), or is the flat-file path
   intentional? Not an S101a concern, but worth flagging — if S101a adds editorial picks, the
   path divergence is locked in further.
