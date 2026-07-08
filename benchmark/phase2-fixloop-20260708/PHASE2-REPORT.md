# Phase 2 fix loop — indexing correctness + data cluster (2026-07-08)

Branch `fix/visibility-phase2-20260708` (worktree, off `fable-impact` @ `3e69470b6`). **Nothing merged,
nothing deployed** — both remain the operator's decision. Baseline branch and frozen `instrument/`
untouched. All measurement here is LOCAL-anchored: unfixed build of this branch captured first
(`anchor/`), fixed build after (`after-final/`), same serving path, same frozen judge persona (Fable,
3 blind judges/page), Class-1 rules identical to the baseline validator. Comparisons to the live-site
5.84 baseline are directional only and labeled as such.

## Disposition of every scoped item

| # | Item | Disposition |
|---|---|---|
| A1a | `/` canonical → `/index` | **FIXED** (`1f9a683d7`): `pageUrl()` single source; canonical, og:url, JSON-LD url all self-referential. Validator: home-el ac 6→8 |
| A1b | `/en/` canonical → `/en/today/` | **REFUTED**: `/en/` is a deliberate 302 to `/en/today/` (`_redirects`); the baseline capture followed the redirect — `/en/today/` is correctly self-canonical. No defect |
| A2a | EL/EN noindex asymmetry (time hubs, editorial) | **REFUTED as policy → decision for operator**: "dormant-locale noindex" (S144 D3, `hub-page.ts:498`, `BILINGUAL_CONTENT_SLUGS`) deliberately noindexes EL pages with published /en/ twins while Greek is dormant. Flipping it = product decision (Greek launch), not a bug fix |
| A2b | Empty hubs indexable ("gate the empty") | **FIXED** (`1f9a683d7`): **1,035 empty combinatorial filter pages** were indexable, sitemap-advertised dead ends. Now noindex,follow + sitemap-excluded, recomputed per build (a hub regains indexability the day it has inventory). sitemap-editorial: 1,193 → 151 locs |
| A3a | Enriched event in no sitemap, thin in sitemap | **REFUTED as policy**: S144 D3 drops EL URLs whose /en/ twin exists (enriched has one; thin doesn't). English-primary crawl strategy operating correctly |
| A3b | 33/64 venue pages absent from sitemap | **FIXED** (`bfa885c73`): they were 36 stale ORPHAN dirs from prior builds (incl. the baseline's venue-thin instance `/venues/el-chapo/`) — deployed, indexable, never regenerated/advertised. Venue dir sweep added (no archive policy exists for venues; event pages' GEO Ruling 2 archive untouched). Verified: planted orphan swept |
| B1 | No ItemList/BreadcrumbList on listings; thin venues zero JSON-LD | **PART FIXED / PART REFUTED** (`93c6cda93`): ItemList always existed (nested `mainEntity`) — baseline validator artifact, documented. BreadcrumbList added to hub graphs, venue graphs, and the flat filter path, which now emits the full hub-style envelope (CollectionPage → BreadcrumbList → Organization); genre-hub sd 0→5, venue sd 6→8, time-hub/home-en sd 2.5→5. "Thin venues zero JSON-LD" REFUTED for current emission — that was the el-chapo orphan; all fresh venue pages emit JSON-LD |
| B2a | Placeholder JSON-LD descriptions | **FIXED** (`93c6cda93`): ListItem description = real locale-appropriate excerpt (≤200 chars) or OMITTED. 0 stubs in dist (was: every listing item site-wide) |
| B2b | Paid events omit `offers` | **REFUTED as policy**: `buildOfferOrOmit` deliberately omits price-less with-ticket Offers (omit-beats-fabricate — the exact behavior the brief demands). A judge on the fixed build independently praised "price omitted rather than fabricated" |
| B2c | False `price: 0` on ticketed event | **FIXED emitter + FLAGGED data** (`93c6cda93`): with-ticket + amount 0 now omits the Offer (Release Athens €80 festival shipped `price:"0"`). Remaining zero-price offers verified all `open`-type (genuinely free). ⚠ **Production DB repair needed**: Release Athens/Sabaton row has `price_amount=0, price_range='Δωρεάν'` on a with-ticket event — this worktree's DB is a snapshot; fix at the source |
| B3 | Self-contradicting counts | **FIXED** (`93c6cda93`): capsule chips read `getHubEvents` (Θέατρο 33-vs-37 → 37/37); capsule total re-scoped "επερχόμενες" (245 was being claimed as "this week" vs the hub's 40); homepage meta/og count = Athens-wide; "15+ sources" → `ACTIVE_SOURCE_COUNT` (10) in all 3 hardcoded spots. Residual (new, minor): JSON-LD CollectionPage `description` string says "24 cultural events" (its own ItemList size) next to the 245 headline — flagged below |
| B4 | Address corruption | **FIXED emitter + FLAGGED data** (`93c6cda93`): config-first precedence at all 3 emitters — curated whitelist beats scraped rows (malformed ΚΠΙΣΝ scrape used to win; dist now emits the correct Syngrou 364 everywhere). ⚠ **Bios/Ρομάντσο FLAGGED, not guessed**: config maps "Bios Ρομάντσο" to Anaxagora 3 (Romantso's address) while DB rows also carry Pireos 84 (Bios's) — the venue *name* conflates two partner venues; splitting the identity is an operator decision |
| B5 | Related-rail duplicates + past-as-upcoming | **FIXED / half REFUTED** (`93c6cda93`): dedupe by folded title (+date for non-run-implying types so residencies survive; title-only for exhibitions) — Kruger 3 cards → 1 (root cause: one canonical run row + ~25 daily date-instance rows, the dedup-arc class; rows untouched per the merged_into freeze). "Past item under upcoming" REFUTED: running exhibition, correct per the end_date Tier-1 rule |

## Movement — vs the LOCAL anchor (the honest numbers)

Six pages re-judged (their judge-scored dims were targeted). 18+18 blind Fable judges, zero errors,
**zero spread flags** (>2) on either side. Class-1 from the parameterized frozen validator; performance
held at baseline values on both sides (out of scope — cancels in the delta).

| page | anchor | after | Δ | what moved |
|---|---|---|---|---|
| home-el | 7.19 | 8.00 | **+0.81** | ac 6→8 (canonical), ae 6→8 + fd 7→8 (counts coherent), sf 7→8 |
| home-en | 6.69 | 7.31 | **+0.62** | sd 2.5→5 (breadcrumb), ae 7→8, fr 5→6, fd 6→7 |
| hub-time-el | 5.26 | 5.88 | **+0.62** | sd 2.5→5, ae 7→8, fr 6→7, fd 5→6 (still ac=0: dormant-locale policy) |
| hub-time-en | 6.86 | 7.21 | **+0.35** | sd 2.5→5, fd 6→7 |
| event-el-rich | 6.76 | 6.91 | **+0.15** | sf 6→7, fd 6→7 (rail dedupe, descriptions) |
| event-en-rich | 7.14 | 7.59 | **+0.45** | ae 7→8, sf 6→7, ec 4→5, fr 3→4 |

Class-1-only movement on non-rejudged pages: genre hubs sd 0→5, venue-rich sd 6→8.

**Directional vs live baseline 5.84:** the 13-page construct computes to **5.73 — DOWN, by design.**
Two sampled instances stopped being indexable surfaces at all: the empty genre hubs are now noindexed
(ac 10→0 under the rubric — they were dead ends being advertised) and the orphan venue page now
correctly 404s. Every page with actual content moved UP. This is the "correctness, not the number"
trade the brief mandates; the construct penalizes honesty about empty inventory. For future regression
runs, re-sample the genre-hub and venue-thin instances from NON-empty, currently-generated pages —
the baseline's instances no longer measure what they were chosen to measure.

## Gates (fix branch, final state)

`bun run src/generate-site.ts` exit 0 (armed hard-stops pass) · `bunx tsc --noEmit` clean ·
`bun test`: 2,974 pass / **1 fail = pre-existing environmental**: `en-cornerstone-presence`
(dist-state test; this DB snapshot has 2 gate-eligible exhibitions < the ≥3 EN-hub gate — fails
identically on unfixed code). Stale test pins updated with rationale: scraped-first address,
pre-S139 "no Organization off homepage", flat JSON-LD shape, old capsule wording.

## Explicit confirmations

- **No empty hub was made indexable** — the reverse: 1,035 empty pages were gated.
- **No content page was deindexed** — the new noindex applies only to zero-event filter pages;
  dormant-locale EL noindex was left exactly as policy dictates.
- **`instrument/` and the baseline branch are untouched**; fix branch never touched the main worktree.
- **Nothing merged, nothing deployed.**

## Flags for the operator

1. **Dormant-locale policy decision**: EL time hubs + `/editorial/` stay noindexed while their EN twins
   are indexable (S144 D3). If Greek-locale visibility now matters, that's the switch to design — not
   a Phase-2 bug.
2. **Production DB repairs** (this branch's DB is a snapshot): Release Athens/Sabaton
   `price_amount=0/'Δωρεάν'` on with-ticket; Kruger daily-instance duplicate rows (dedup-arc
   authorization pending); Bios/Ρομάντσο venue-identity split.
3. **Minor residual**: CollectionPage JSON-LD `description` states its own 24-item list size next to
   the 245-event page headline; judges read it as a count contradiction. One-line fix in
   `buildCollectionPageMember` if wanted — left out as it emerged post-scope.

**What this loop proves — and doesn't:** Class-1/2 movement on the same instrument, same serving path.
Real-citation validation still waits on the Class-3 (Perplexity/search API key) and Class-4 (GSC/Bing/
GA4) credentials, plus an engine recrawl after these fixes eventually deploy.

## Artifacts

`anchor/` + `after-final/` (captures, validators.json, judges/) · `after-A/`, `after-B/` (intermediate
Class-1 evidence) · `deltas.json` · `sample-local.json` · `tooling/` (serve.ts + parameterized ports of
the frozen capture/validate). Commits: `1f9a683d7` (A1+A2), `bfa885c73` (A3), `93c6cda93` (B cluster).
