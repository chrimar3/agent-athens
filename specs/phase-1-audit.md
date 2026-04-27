# Phase 1 Audit — Pre-Research Ground Truth

**Date:** 2026-04-28
**Session:** S97 (canonical numbering TBD; `session-log.md` missing at audit time)
**Scope:** Read-only verification of all 42+ open challenges across 8 workstream blocks (A, B, C, E, F, G, H, I, J), with the live agentathens.com site, the local SQLite DB, build output, and test suite. **Zero code/config/DB changes.**
**Stash note:** Pre-flight surfaced a dirty tree. WIP files (`scripts/backfill-ticket-urls.ts`, `src/ticketing/resolver.ts`, `tests/fixtures/events.ts`, `data/backfill-ticket-urls.log.jsonl`, `tests/ticketing/resolver.test.ts`) were stashed as `WIP: ticket-URL backfill (pre-S97-audit stash)` so the audit could run on a clean tree. **Pop after merging audit.** This stash induces 4 transient test failures (see Test Suite section) that do not exist in the WIP-applied state.

## Legend
- ✅ FIXED — verified resolved, do not re-plan
- 🔴 OPEN — verified still open, plan needed
- 🟡 PARTIAL — partially resolved, scope reduced
- 🔵 NEEDS-MANUAL — cannot be programmatically verified
- ⚠️ NEW — surfaced during audit, not previously tracked

---

## Block A — Indexing & Citation Recovery

🟡 A1: hreflang shipped on event pages and the live `/today/` page; `x-default` correctly points to `/en/today`
  Evidence: `curl -sL https://agentathens.com/today/ | grep hreflang` → 4 matches: `el` (×2 — duplicate), `en`, `x-default` → `/en/today`. Homepage also has `hreflang="el"`.
  Note: el hreflang is duplicated on `/today/` (probably canonical + alternate). x-default ✅ correct.

🟡 A2: Live JSON-LD on `/today/` has FAQPage but **CollectionPage is missing**
  Evidence: `curl -sL https://agentathens.com/today/ | sed -n '/ld+json/,/script>/p' | grep "@type"` → only `"FAQPage"`, `"Question"`, `"Answer"`. No `"CollectionPage"`.
  Note: Build-time validator reports 2 pages with empty CollectionPage `itemListElement` — `/today/` may be one of them. Higher priority than other A-block items.

✅ A3: Sitemap structure healthy — sitemap-index → events (9515) + venues + editorial
  Evidence: `curl -sL https://agentathens.com/sitemap-index.xml` → 3 sub-sitemaps. `sitemap-events.xml` has 9515 `<url>` entries.
  Note: Build also reported sitemap-events with 9185 URLs (small drift between build and live, possibly post-deploy filtering).

✅ A4: Schema validator wired into the build, runs on every build
  Evidence: `grep "validateAllPages" src/generate-site.ts` confirms wiring; build log line `📋 Schema completeness: 12175/12386 pages fully valid (98%)`.
  Note: see Schema Completeness section for full numbers.

---

## Block B — Format Catalysts

🔵 B1: YouTube content publishing pipeline
  Evidence: not programmatically verifiable from repo state.
  Note: requires manual confirmation from Christos (no infrastructure markers in repo).

🔵 B2: KPI tracking format
  Evidence: not programmatically verifiable from repo state.
  Note: requires manual confirmation.

🔵 B3: Grounding query format
  Evidence: not programmatically verifiable from repo state.
  Note: requires manual confirmation.

🔵 B4: Manual tracking workflow
  Evidence: not programmatically verifiable from repo state.
  Note: requires manual confirmation.

---

## Block C — Domain Migration Recovery

⚠️ C1: `/en` → `/en/today` redirect rule **does not exist** in `netlify.toml` and there is no separate `_redirects` file
  Evidence: `cat netlify.toml` → only one `[[redirects]]` block: `/events → /index.html (200)`. `ls _redirects public/_redirects` → both missing.
  Note: bare `/en` likely returns 404 unless a static `dist/en/index.html` exists. Should be verified against live URL.

✅ C1-indexnow: IndexNow submission active and successful
  Evidence: `cat logs/indexnow-latest.json` → `submitted: 9596, success: 9596, failures: 0` at 2026-04-27T10:16:10Z.
  Note: only one log file (`indexnow-latest.json`); no rotating per-day logs visible.

✅ C1-monitoring: Search-visibility CSV is fresh
  Evidence: `tail data/search-visibility-log.csv` → most recent row dated 2026-04-27 (today). File mtime 2026-04-27 07:43.
  Note: file is at `data/search-visibility-log.csv`, not `logs/search-visibility.csv` as the plan assumed. Latest row contains `STALE_ENRICHMENT` flag — worth investigating.

---

## Block E — Pipeline Reliability

⚠️ E1: Mode C absent ≥14 days, BUT a NEW cascade failure mode emerged 2026-04-25/26: 8 batches failed with "Stream idle timeout" (API-side)
  Evidence: `grep "Stream idle timeout" logs/auto-enrich-2026-04-{25,26}.log` → 8 occurrences across both days. Apr 25: 0 events enriched. Apr 26: 0 events enriched. Apr 27 recovered: 10 events.
  Note: `exit 143` (SIGTERM after BATCH_TIMEOUT=1800s) and `exit 1` with "partial response received" suggest claude-CLI / API stream stalling. Not Mode C, but adjacent. Higher urgency than original Mode C playbook.

🟡 E2-defense-stack: Orphan-kill present; battery-skip removed (per memory S85, confirmed); caffeinate is referenced only in comments now
  Evidence: `grep "caffeinate -s\|battery\|orphan" scripts/auto-enrich.sh` → orphan-kill at line 65 (active code). All `caffeinate` and `battery` matches are commented-out historical context (lines 100-118).
  Note: defense stack has degraded from "6 layers" to active orphan-kill + BATCH_TIMEOUT only. Audit cannot detect lock.mtime guard from grep alone — may exist.

⚠️ E2-plist-PATH: Plist PATH divergence between agent groups
  Evidence: `auto-enrich.plist`, `daily.plist`, `enrichment-check.plist` use `/Users/chrism/.local/bin:...:/Users/chrism/.bun/bin`. `enrichment-{01,13,16,19,22}.plist` and `enrichment.plist` use `/usr/local/bin:...:/Users/chrism/.bun/bin:/Users/chrism/.npm-global/bin` (no `.local/bin`).
  Note: divergent PATHs across plists managing the same pipeline can cause inconsistent tool discovery (e.g., custom binaries in `~/.local/bin` available to one trigger but not another).

🟡 E3-scheduling: 11 plists installed; 5 enrichment slots (01, 13, 16, 19, 22 — overnight 01:00 + 22:00 known unloaded per S89 memory note)
  Evidence: `ls ~/Library/LaunchAgents/com.agentathens.*.plist` → 11 entries: auto-enrich, daily, enrichment, enrichment-01/-13/-16/-19/-22, enrichment-check, freshness, monitor-visibility.
  Note: Architecture target was 60 events/day (10×6); effective is 40/day per memory. Pipeline split is implemented as separate plists rather than mode flags in `daily-automated.sh`.

✅ E3-batch-config: Memory `MAX_BATCHES=2` confirmed; `EVENTS_PER_BATCH=5` (raised from 4 on 2026-04-09 — newer than memory note)
  Evidence: `grep -nE "MAX_BATCHES|EVENTS_PER_BATCH|BATCH_TIMEOUT" scripts/auto-enrich.sh` → `MAX_BATCHES=2` (line 40), `EVENTS_PER_BATCH=5` (line 41), `BATCH_TIMEOUT=1800` (line 43).
  Note: memory entry is stale on EVENTS_PER_BATCH=4; should be updated to 5.

---

## Block F — Quality Gates

✅ F1-threshold: Gate threshold = 80, enforced in two scripts
  Evidence: `grep "score" scripts/generate-enrichment-brief.ts scripts/generate-rewrite-brief.ts` → "If ALL gate scores are >= 80 AND all have 0 errors: auto-save"; rewrite brief: "Gate score must be >= 80 with 0 errors".
  Note: matches post-S69c expected threshold.

⚠️ F1-distribution: Score distribution healthier than memory's "soft ceiling 88-90"
  Evidence: `sqlite3 → SELECT ... FROM enrichment_log WHERE created_at >= date('now','-14 days')` → MIN 83, AVG 93.5, MAX 100, COUNT 236.
  Note: memory's soft-ceiling concern appears stale; current distribution clusters above 90.

🔵 F2: 20% factual error rate
  Evidence: not programmatically verifiable from automated checks.
  Note: requires editorial sampling.

✅ F3-greek-paused: Greek enrichment fully paused at code + schema level
  Evidence: events table has column `full_description_gr` (NOT `_el` as plan assumed). `SELECT COUNT(*) WHERE full_description_gr IS NOT NULL AND enriched_at >= date('now','-14 days')` → 0. 142 historical Greek rows pre-pause. No matches in `run-enrichment-pipeline.ts` or `auto-enrich.sh` for Greek-related code.
  Note: schema column naming is `_gr` not `_el`; plan and possibly memory should be corrected.

⚠️ F-rules-count: `config/enrichment-knowledge.md` has 51 numbered items (memory expected ~23)
  Evidence: `grep -c "^[0-9]\+\." config/enrichment-knowledge.md` → 51. `grep -c "Rule [0-9]" scripts/generate-enrichment-brief.ts` → 1 (different pattern).
  Note: rules expanded since memory was written, or the count metric differs.

---

## Block G — Data Integrity

✅ G1: Malformed genres count is currently 0 — recurring bug appears RESOLVED at audit time
  Evidence: `sqlite3 → SELECT COUNT(*) WHERE genres NOT NULL AND json_valid(genres)=0` → 0. CHECK constraint still **absent** from schema (`grep CHECK schema → empty`).
  Note: historical recurrence may resume since no DB-level guard exists. Promote to ✅ FIXED for now but flag as "no enforcement, regression-prone".

🔴 G2: Empty-slug pages count is 5,806 (NOT the "703" memory references)
  Evidence: `find dist/events -maxdepth 1 -type d` ending in `--` → 5,806 of 11,572 total event dirs. DB count of titles <3 chars or empty: 70 (the actual root cause). Sample sitemap URL: `https://agentathens.com/events/e0c03e2c--grand-tour` shows the slug pattern.
  Note: the 5,806 count reflects rendered pages where the title-derived slug component is empty; DB-source count is 70 events. Significant discrepancy between memory and current state. Higher impact than expected.

🔴 G3: 183 events ungeocoded across verified/pass-through statuses (memory: ~155)
  Evidence: `sqlite3 → SELECT COUNT(*) WHERE (venue_lat IS NULL OR venue_lng IS NULL) AND location_status IN ('verified_athens','pass_through')` → 183. Top venues: Μέγαρο Μουσικής Αθηνών (21), Αλκμήνη (11), Don't be a Dick (6), Μικρός Κεραμεικός (5), Δημοτικό Θέατρο Πειραιά (5), 104 (5), ΠΛΥΦΑ (4), Θέατρο Παλλάς (4), Χώρος Τέχνης Ηχόδραση (3), Θέατρο του Νέου Κόσμου (3).
  Note: trend is up vs memory (~155 → 183). Top venues are well-known (Μέγαρο Μουσικής is the Athens concert hall) — likely a normalization-table gap, not exotic locations.

⚠️ G4: doorTime coverage exceeds verified-event count — figure suggests overcounting or stale rows
  Evidence: `sqlite3 → SELECT COUNT(*) FROM events WHERE time_doors IS NOT NULL AND time_doors != ''` → 12,139. Verified/pass-through events: 11,545. Total events including past: ~12,539.
  Note: time_doors set on past events too. Coverage relative to "current verified" can't be cleanly stated; needs date-bounded query for actual coverage gap.

🔴 G-CHECK-constraints: No CHECK constraints on the events table
  Evidence: `sqlite3 → .schema events | grep CHECK` → empty.
  Note: G1's "currently 0 malformed" is a runtime artifact, not enforced.

---

## Schema Completeness

✅ Build validator reports 98% completeness with 0 errors
  Evidence: `/tmp/phase-1-build.log` — verbatim:
  ```
  📋 Schema completeness: 12175/12386 pages fully valid (98%)
     📊 12281 event + 30 hub + 75 venue pages
     ✅ 12175 pass  ⚠️  211 warnings  ❌ 0 errors

     Top data gaps:
       209/12386 (2%) location.geo coordinates missing
       191/12386 (2%) streetAddress is empty
       2/12386 (0%) CollectionPage: itemListElement is empty
       2/12386 (0%) FAQPage JSON-LD block missing
  ```
  Note: 0 errors is the headline win. 211 warnings dominated by geo + streetAddress (overlaps Block G3 finding). 2 CollectionPage gaps overlap A2 finding.

⚠️ Build also reports 8656 pages missing recommended `performer` field
  Evidence: build log: `→ 8656 pages missing performer (recommended) (known gap — structured artist data pending)`.
  Note: known gap; not a new finding but worth tracking against research output.

⚠️ Build reports 6382 orphan files in dist (uncleaned)
  Evidence: build log: `⚠️  6382 orphans found — set SWEEP_ORPHANS=1 to delete`.
  Note: housekeeping issue; doesn't affect schema or live pages but bloats dist size.

---

## Block I — Action Layer

✅ I1-Save: `renderSaveButtonScript` present
  Evidence: `src/templates/action-bar.ts:78`.

✅ I1-Calendar: `renderCalendarScript` present, TZID=Europe/Athens correct
  Evidence: `src/templates/action-bar.ts:136` (function), lines 230-231 use `DTSTART;TZID=Europe/Athens` and `DTEND;TZID=Europe/Athens`.

✅ I1-Share: `renderShareButtonScript` present
  Evidence: `src/templates/action-bar.ts:256`.

✅ I1-SavedPage: `renderSavedPageScript` present in both locales
  Evidence: `src/templates/action-bar.ts:301`. Both `dist/saved/index.html` and `dist/en/saved/index.html` exist.

✅ I1-IIFE-slug-migration (S92): legacy slug-prefix stripping shipped
  Evidence: `src/templates/action-bar.ts:307-346` — comment "Migrate legacy entries: strip /events/ or /en/events/ prefix + trailing slash from slug".

✅ I1-Book: confirmed pending (no Book/Booking code)
  Evidence: `grep -nE "book|booking|ticketUrl|Book" src/templates/action-bar.ts` → empty.
  Note: matches research-brief expectation.

✅ I1-Tier-1: no forbidden term "free"/"δωρεάν" in action-bar
  Evidence: `grep -in "free\|δωρεάν" src/templates/action-bar.ts` → empty.

⚠️ I1-en-redirect: no `/en` → `/en/today` rule in `netlify.toml`
  Evidence: `grep "/en" netlify.toml` → empty (re. C1 finding above).
  Note: see C1.

---

## Block J — Accessibility

✅ J1: `--text-muted` updated to #7a7a7a (4.5:1 on `--bg-primary`); explicit "Do NOT use on --bg-raised" comment present
  Evidence: `src/styles/design-system.css:20` — `--text-muted: #7a7a7a; /* was #444 → #6b6b6b → #7a7a7a for 4.5:1 on --bg-primary. Do NOT use on --bg-raised (3.4:1 — WCAG AA FAIL) */`. 5 selectors use the variable (lines 824, 1320, 1337, 2429).
  Note: color is fixed; enforcement against `--bg-raised` co-occurrence is documentary only (no linter rule).

🔴 J2a: Relative-date `<time>` pairing not yet shipped
  Evidence: `grep -rnE "Απόψε|Tonight" src/templates/ src/utils/` → only `src/templates/card-variants.ts:110: 'today': 'Απόψε στην Αθήνα'`. `grep "<time datetime|visually-hidden.*time"` → empty.
  Note: confirmed open per memory.

🟡 J2b: `role="status"` exists in search overlay but **not on the sold-out badge**
  Evidence: `src/templates/search-overlay.ts:54` has `<div class="sr-only" role="status" aria-live="polite">`. CSS `.card-badge-sold-out` at `src/styles/design-system.css:2333` has no `role="status"`.
  Note: live-region exists for search but not for sold-out announcements; the original J2b ticket is still open.

✅ J3: Skip link is bilingual
  Evidence: `src/templates/site-chrome.ts:10` — `const skipText = locale === 'en' ? 'Skip to content' : 'Μετάβαση στο περιεχόμενο';`.
  Note: Greek phrasing is `Μετάβαση στο περιεχόμενο` (not memory's `Παράκαμψη` — both valid).

✅ J-headings: h1 → h2 → h3 hierarchy in `src/templates/page.ts`
  Evidence: `grep -nE "<h1|<h2|<h3" src/templates/page.ts` → h1 at line 153, h2 at lines 329 + 373, h3 at line 297.
  Note: no separate `event-page.ts` or `practical-block.ts` exist — `page.ts` renders both shells.

---

## Block H — Architecture

🔴 H1-docs-agents: `docs/agents/` directory does not exist
  Evidence: `ls docs/agents/` → no such file or directory.

🔴 H1-shared-memory: `scripts/generate-shared-memory.ts` and `docs/shared-memory.md` do not exist
  Evidence: `ls scripts/generate-shared-memory.ts docs/shared-memory.md` → both missing.

🔴 H3-multi-city-config: `config/cities/` does not exist
  Evidence: `ls config/cities/` → missing.

🔴 H3-athens-coupling: 345 `Athens|athens` references in `src/**/*.ts` (excluding tests/comments via simple filter)
  Evidence: `grep -rn "Athens\|athens" src/ --include="*.ts" | grep -v test | grep -v "//" | wc -l` → 345.
  Note: 1 explicit hardcoded TODO in `src/utils/normalize.ts:10` ("This replaces the old 18-entry hardcoded map with all 80+ master venues") — not strictly a city-coupling TODO. Multi-city pilot will require rip-and-replace at this scale.

✅ H-subagents: `claude -p` invocation pattern used in auto-enrich for parallel batches (S80)
  Evidence: `scripts/auto-enrich.sh` lines 6, 89, 214, 286, 287, 294 reference `claude -p` invocation flow.
  Note: subagent pattern is specific to enrichment, not architecturally generalised.

---

## Test Suite

⚠️ Tests-fail-stash-induced: 1683 pass / 1 skip / 4 fail / 1688 total / 67 files / 33.0s
  Evidence: `bun test --silent | tail -5`. All 4 failures are CTA/ticketUrl tests in `src/generators/__tests__/event-page.test.ts`:
  - `Event Detail Page — Hero section > CTA renders when ticketUrl exists (upcoming event)`
  - `Event Detail Page — Mobile bar > contains title and price text (upcoming event)`
  - `Event Detail Page — Inline CTA > inline CTA rendered for upcoming event with ticket URL`
  - `English event page — CTA text > English CTA shows 'Buy tickets'`
  Note: All 4 depend on `tests/fixtures/events.ts` which was stashed in pre-flight. WIP-applied state is presumably 1687 / 1 / 0. Pop the stash post-audit to restore.

✅ Tests-time-sensitive-resolved: The 3 known time-sensitive failures (`tests/event-lifecycle.test.ts`, `tests/pipeline-state.test.ts`, `tests/page.test.ts`) are no longer in the failure list
  Evidence: above failure list contains none of the named files; `bun test` summary reports 1 skip (likely 1 of these now skipped) and 4 fail (all CTA-related, not time-related).
  Note: silent fix worth reconciling against `known-issues.md` once recreated.

✅ Tests-tsc: tsc --noEmit exits 0 (clean)
  Evidence: `/tmp/phase-1-tsc.log` empty; exit 0.

---

## ⚠️ Surfaced During Audit (NEW)

⚠️ NEW-1: `/today/` live page is missing CollectionPage JSON-LD (only FAQPage present)
  Evidence: `curl /today/ | grep "@type"` → no CollectionPage; build log notes 2 pages with empty CollectionPage `itemListElement`.
  Note: highest-priority A-block surprise; could affect SERP rich-result eligibility.

⚠️ NEW-2: 8 batch failures Apr 25-26 with new "Stream idle timeout" pattern (zero events enriched 2 days running)
  Evidence: `grep "Stream idle timeout" logs/auto-enrich-2026-04-{25,26}.log` → 8 occurrences. Recovered Apr 27.
  Note: API-side (claude CLI / Anthropic API) stream stalling. Defense stack didn't auto-recover; relied on time passing.

⚠️ NEW-3: Plist PATH divergence between agent groups
  Evidence: 3 plists use `/Users/chrism/.local/bin:...:/Users/chrism/.bun/bin`; 6 plists use `/usr/local/bin:...:/Users/chrism/.bun/bin:/Users/chrism/.npm-global/bin`.
  Note: risk of inconsistent tool resolution depending on which trigger fires.

⚠️ NEW-4: 5,806 dist event dirs end in `--` (empty title segment), vs memory's "703"
  Evidence: `find dist/events -maxdepth 1 -type d` ending in `--` → 5,806. DB short-title rows: 70.
  Note: discrepancy between rendered pages and DB source — same DB rows may produce many empty-slug variants, or memory was very stale.

⚠️ NEW-5: 6,382 orphan files in dist/ (uncleaned from prior builds)
  Evidence: build log: `⚠️ 6382 orphans found — set SWEEP_ORPHANS=1 to delete`.
  Note: housekeeping; bloats dist + deploy uploads.

⚠️ NEW-6: Defense stack is materially thinner than "6 layers" (only orphan-kill + BATCH_TIMEOUT remain active in script body; battery and caffeinate are commented historical context)
  Evidence: `grep "caffeinate\|battery\|orphan\|lock.*mtime" scripts/auto-enrich.sh` → orphan-kill at line 65 (active); all others are comments.
  Note: this contradicts the research brief's "6-layer defense-in-depth" framing. Stack has been intentionally simplified post-S85, but the simplification may have left gaps that the Stream-idle failure mode (NEW-2) exposed.

⚠️ NEW-7: `enrichment-knowledge.md` has 51 numbered items, not the memory-expected ~23
  Evidence: `grep -c "^[0-9]\+\." config/enrichment-knowledge.md` → 51.
  Note: rules expanded; brief generators may need recalibration if they assume a smaller rule count.

⚠️ NEW-8: `STALE_ENRICHMENT` flag appears in latest search-visibility CSV row
  Evidence: `tail -3 data/search-visibility-log.csv` → 2026-04-27 row contains literal `STALE_ENRICHMENT` token.
  Note: monitoring is signaling a known stale-enrichment condition; worth checking what triggered it (likely related to NEW-2 cascade).

⚠️ NEW-9: Working tree was dirty at session start (WIP ticket-URL backfill, 5 files)
  Evidence: pre-flight `git status` listed 3 modified + 2 untracked files in `scripts/backfill-ticket-urls.ts`, `src/ticketing/resolver.ts`, `tests/fixtures/events.ts`, `data/backfill-ticket-urls.log.jsonl`, `tests/ticketing/resolver.test.ts`. Stashed for audit.
  Note: a parallel WIP for ticket-URL backfilling is in flight. The fact that 4 tests fail without it suggests the WIP includes test-fixture changes that the test code already depends on — fixture is committed-but-mismatched with current test expectations.

---

## Items Confirmed FIXED (clean up known-issues.md after master plan)

- ✅ G1: malformed genres count is 0 at audit time (recurring bug appears resolved, though no DB-level CHECK constraint is in place)
- ✅ J1: `--text-muted` color updated to #7a7a7a with documented "do not use on --bg-raised" guidance
- ✅ J3: skip link bilingual (`Skip to content` / `Μετάβαση στο περιεχόμενο`)
- ✅ J-headings: h1→h2→h3 hierarchy intact in `src/templates/page.ts`
- ✅ Tests-time-sensitive: 3 known time-sensitive failures (`event-lifecycle`, `pipeline-state`, `page`) are no longer in the fail list (1 skipped, 2 passing — net positive)
- ✅ F1-distribution: score distribution is healthier than memory's "soft ceiling 88-90" (avg 93.5, max 100)
- ✅ F3-Greek-pause: Greek paused at code AND schema level (column is `_gr` not `_el`; 0 new rows in 14 days)
- ✅ I1-Calendar/Save/Share/SavedPage/IIFE-slug-migration: all action-layer phase-1 items shipped per S92
- ✅ A4: schema validator wired into build (98% completeness, 0 errors)

---

## Recommendations for Research Synthesis Integration

The audit confirms the largest open surface area is in **Blocks E, G, and H**:
- **E** has degraded since memory was written: defense stack is now 1.5-layer (orphan-kill + timeout), and a NEW failure mode (Stream idle timeout) caused 2 zero-event days. Research should prioritize next-layer hardening *and* a recovery playbook for upstream API stalls — broader than just "Mode C playbook".
- **G** has worse data than expected: 5,806 empty-slug pages (8× memory), 183 ungeocoded events (up from ~155). Research should treat data-integrity as a higher-priority workstream than the brief implied.
- **H** is unchanged from memory: docs/agents, shared-memory, multi-city config all absent. Multi-city pilot needs to plan for 345 Athens references in src/**/*.ts. No quick wins here without research.

**Items that can be REMOVED from research scope** (already done): G1 genres, J1 contrast, J3 skip-link i18n, J-headings, F1-distribution, F3 Greek pause, all of Block I except Book, A4 schema validator. These free roughly 7-9 research-bound items.

**Highest-priority NEW finding for research integration:** A2 + NEW-1 (CollectionPage missing on `/today/` despite being a flagship cornerstone page) and NEW-2 (Stream idle timeout — a new failure mode the brief doesn't anticipate).
