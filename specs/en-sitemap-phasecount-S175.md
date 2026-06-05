# S175 — /en/ Sitemap Phase-Partition + Indexing Recon

**Date:** 2026-06-05 (read-only recon)
**Hinge question:** how many sitemap-absent /en/ pages are in Active/Just-passed phases? That integer fires or kills the dark-engine P1 sitemap brief (GEO ruling 2026-06-05).

## The trigger integer: 0 — premise dissolved, NO P1

- `dist/en/events/` holds **655** pages (brief said 674 — stale by two sessions of builds). **All 655 are present in `sitemap-events.xml`.** Absent /en/ event pages = **0**.
- Whole-/en/ sweep: 690 pages on disk vs 679 sitemap URLs → delta **11**, all hub `/all` overflow variants (`en/concerts/all`, `en/today/all`, …) carrying `noindex, follow` + `canonical` → parent hub. **Intentional by design** (overflow pages are deliberately unlisted).
- Phase partition: trivially clean — empty absent set, zero unclassifiable rows.
- **Consequence (per the ruling's own branch):** resolved-intentional. Tier-B starvation is NOT explained by sitemap coverage. Dark engines move to the next candidate (schema completeness / brand-mention / engine ramp). The P1 sitemap-coverage brief is killed.

## Premise corrections (ledger)

1. **"674 absent /en/ pages"** → 0 absent event pages. The S171 open-item figure described a state that no longer exists (if it ever did — S144's sitemap design *prefers* /en/ for bilingual slugs).
2. ~~"The ruling's 4-phase taxonomy does not exist in code"~~ — **CORRECTED same-day (S176): it DOES exist.** `getLifecyclePhase` at `src/utils/event-lifecycle.ts:107` is exactly `active | just-passed | cooling | archive` (past-active splits at day 14), coexisting below the 3-phase `classifyEventLifecycle` in the same file. The original claim was a false negative from a truncated (lines 1-60) file read — itself a ledger lesson: a negative existence claim from a partial read is an unverified measurement. The hinge integer (0) is unaffected: an empty absent set partitions identically under either taxonomy.
3. **`data/search-visibility-log.csv` is gitignored** — the brief's `git show HEAD:` read is a phantom query path; the disk file is canonical.

## Step 2 — operator manual readings (out-of-band, owed by Christos)

Manual `gsc_indexed` / `bing_indexed` columns confirmed **empty since 2026-05-11** (last known 8 Google / 605 Bing, now 25 days stale). Fresh GSC Pages-report count + Bing Webmaster count (+ AI Performance grounding count if surfaced) → append to the CSV manual columns. File is gitignored — no commit involved.

## Step 3 — S144 hreflang state: REGRESSION FLAGGED (not fixed this session)

- **Live emitters bypassing S144's gate:** `src/generators/hub-page.ts:457-459` (unconditional `hreflang` el/en/**x-default** on hubs), `src/generators/venue-page.ts:242,455` (`hreflang="el"`). Present in current dist (e.g. `dist/en/concerts/index.html`).
- The `el` alternates point at bare-root Greek hubs — the "dormant Greek alternates pollute the crawl signal" case S144's sitemap change removed ("re-add bare-root + hreflang when Greek launches", generate-sitemaps.ts comment).
- S144's gated-hreflang fix landed in `templates/page.ts`; hub/venue generators are the **lagged parallel surface** — the same scope-drift class the Sprint-3 retrospective named ("page-template metadata + route-state lifecycle + canonical + hreflang, all four move together").
- `src/generate-site.ts:1417` llms.txt claim ("Each English page has bidirectional hreflang tags") sides with the surviving emitters against the ruling — doc/code drift on the same axis.
- **Routed:** GEO Strategist adjudication → resolved 2026-06-05 as P1: gate all surfaces to mirror page.ts + paired S110 validator (brief S176, executes after S174 close-out).

## Routing summary for Planner

1. Trigger integer **0** → P1 sitemap brief killed; dark-engine investigation moves to next candidate.
2. Fresh GSC/Bing manual pulls still owed by Christos (CSV columns 25 days stale).
3. Per-engine diagnostic row → Sprint-5 dashboard (GEO ruling 2, reporting-only).
4. hreflang lagged-surface regression → S176 brief (gate + S110 invariant), sequenced after S174 close-out.
