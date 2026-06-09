# Dormant-locale robots-meta sweep — design + ruling

**Status:** implemented + build-verified (local), pending prod deploy + Bing rescan.
**Origin:** Bing Webmaster Tools flagged `agentathens.com/today` as "missing from sitemaps."

## Root cause

S144 (GEO 2026-05-21) dropped bilingual **bare-root** pages from the sitemap
(sitemap = `/en/`-only for bilingual content) on the premise that the Greek
alternate is dormant/noindex. The sitemap-drop shipped; the **noindex never
did**. Result: ~22 indexable bare-root pages absent from every sitemap — an
indexable-orphan contradiction Bing flags. `/today` was the surfaced instance.

## Ruling (operator, full-22 scope, output-keyed invariant)

Close the drift by **noindexing** the dormant bare-roots (NOT re-including them in
the sitemap — S144 D3 stands). Two binding refinements:

1. **Drive noindex off the runtime signal, never the static `answerCapsuleEn`
   flag.** A hub with `answerCapsuleEn` but a low-event day emits no `/en/` twin
   and stays in the sitemap → it must stay indexable. So per surface, noindex
   reads the same test that drives the sitemap-drop:
   - hub-page → `answerCapsuleEn && events ≥ MIN_EVENTS_THRESHOLD` (= the
     `bilingualHubSlugs` membership condition), gated by `!HREFLANG_GATE_OPEN`.
   - content-page → `BILINGUAL_CONTENT_SLUGS` (imported from generate-sitemaps),
     gated by `!HREFLANG_GATE_OPEN`.

2. **Build-FAIL invariant is output-keyed (biconditional over emitted artifacts),
   not a class list.** Two rules:
   - **Rule 1** — present in any sitemap ⟹ NOT noindex.
   - **Rule 2** — has a LIVE `/en/` twin ⟹ noindex AND absent from all sitemaps.

   "Live twin" = `en/<slug>/` present in a (freshly regenerated) sitemap — this is
   how the invariant distinguishes a live twin from a **stale** `dist/en/<slug>/`
   artifact left by a hub that dropped below the event threshold. (Caught exactly
   this on `dance` during bring-up; orphan-sweep owns the stale-file cleanup, not
   this invariant.)

## Page class (live-verified, supersedes GEO's from-memory "24")

**22 pages in the drift class**, 2 templates:
- **19 hub slugs** (hub-page.ts): today, tomorrow, this-week, this-weekend,
  this-month, next-month, concerts, theatre, nightlife, festivals, kids,
  exhibitions, open, cinema, dance, classical-music, with-ticket, comedy,
  greek-music. (On any given build, the subset with ≥3 events is noindexed; the
  rest stay indexable — e.g. `dance` was indexable on the verifying build.)
- **3 content slugs** (content-page.ts): about, editorial, corrections.

**Not in the class:** proof/colophon/saved already noindex (saved had the inverse
defect — see below); ~160 combo pages (`/concert-today` …) are Greek-only (no
twin) → correctly indexable + in sitemap; `/en/` pages untouched; 404 excluded.

## Adjacent defect found + fixed: `/saved/` inverse drift

`saved` (both locales) was `noindex` **AND** listed in the sitemap — a noindex URL
advertised for crawling. Fixed by excluding it from the sitemap (not pushed to
`generatedUrls`, same policy as `/all/` overflow). Caught by Rule 1.

## Files

- `src/validators/dormant-locale-noindex.ts` — invariant (pure core + IO pass).
- `src/validators/__tests__/dormant-locale-noindex.test.ts` — TDD + stale-twin
  regression.
- `src/generators/hub-page.ts` — el dormant-hub noindex emission.
- `src/templates/content-page.ts` — `noindex` → `noindex, follow`.
- `src/sitemap/generate-sitemaps.ts` — `BILINGUAL_CONTENT_SLUGS` hoisted/exported.
- `src/generate-site.ts` — content-page noindex wiring, saved sitemap exclusion,
  build-FAIL hard-stop after `generateSplitSitemaps`.

## Inverse-on-flip (future)

noindex reads `!HREFLANG_GATE_OPEN`, so it flips to index when Greek launches. The
sitemap-drop (generate-sitemaps.ts:136-139) does NOT yet read the gate — a known
gap. The invariant **enforces** the coupling: flipping the gate without also
lifting the sitemap-drop build-FAILs (page becomes indexable but still
sitemap-absent → Rule 2). This makes the codebase's "reactivate every surface
together" doctrine build-enforced. Reactivation is a separate coordinated change.

## Open follow-up (NOT this task)

Stale `dist/en/<slug>/` twins (e.g. `en/dance` from a prior build) persist because
prod does not arm the non-event orphan-sweep (`SWEEP_ORPHANS=1`). They are
served (stale, indexable) but sitemap-invisible, so the invariant ignores them.
Arming the sweep needs the protect-registry wired first (orphan-sweep.ts:43).
