# Visibility Ceiling — Ranked Constraint Map (Phase 0)

**Date:** 2026-07-07 (Athens) · **Campaign:** find and lift the real visibility ceiling (human + AI-search citability)
**Model:** citability = enrichment quality × structured-data completeness × freshness (a product — any ~0 term collapses it)
**Method:** read-only diagnostic — HEAD artifacts, live-site probes, read-only DB queries, pipeline logs. No builds run, no state mutated.

---

## Baseline metrics (as measured 2026-07-07 ~02:00 Athens)

| Metric | Value | Source |
|---|---|---|
| Deploy cadence | **Last deploy 2026-07-04 09:39Z — 3-day drought**; June had a 20-day gap (Jun 8 → Jun 28) | `logs/deploy-cadence.log` |
| Live freshness | `/today` serves **July 5** events on July 7 | curl agentathens.com/today |
| Schema-valid ratio | **100% structural (fail=0, all 11 types)** at HEAD; passRate (completeness) 41–100% by type | `git show HEAD:data/build-completeness.json` |
| Sitemap surface | 1,936 URLs (710 events / 33 venues / 1,193 editorial); robots.txt declares `sitemap-index.xml` directly (no redirect in declared path) | live sitemaps |
| Grounded EN enrichment (upcoming) | **346/541 = 64%** — concert 205/328, dj_set 73/106, theater 36/65, festival 9/19, cinema 12/12 | events.db `full_description_en` >200 chars, start ≥ today |
| AI citations | **18 GA4 AI-referral rows all-time, ChatGPT-only, latest 2026-06-02** (import stale); `bwt_ai_citations`, `gsc_queries_long`, `server_log_ai_bots`, `manual_citation_log` all **empty**; fixed query set exists (`tracked_prompts`, 5+ prompts) but never logged against | data/kpi.db |
| Bing surface | 17 impressions / 1 click / avg pos 5.7 (7d, fetched Jul 6 07:37) | logs/bing-latest.json |
| SSR completeness | Sampled event page: full JSON-LD `@graph` (Event + EventVenue + Organization), title, canonical all in HTML source ✓ | curl sample |
| AI-crawler surface | robots.txt allows GPTBot/OAI-SearchBot/ChatGPT-User/ClaudeBot ✓ ; llms.txt live (4KB, regenerates per deploy — currently 3 days stale with everything else) | live probes |
| URL quality | **263/710 (37%) event URLs have degenerate slugs** `/events/{hash}--/` (zero semantic tokens) | live sitemap-events.xml |

---

## Ranked constraints

### C1 — Freshness is ZEROED: the daily build has failed since Jul 5 (binding constraint; gates the whole product)
**Term gated:** freshness (currently ×~0 — 3-day drought, `/today` two days stale, llms.txt stale, sitemap stale).
**Evidence:** two distinct build blockers, stacked:
- **C1a (Jul 5 12:51):** F2b schema hard-stop — 18 structural errors, all `streetAddress` missing on new SMUT / Skull Bar / El Chapo events (NULL `venue_address`, no config fallback at the time). **Already fixed** by parallel session commit `b76ad0ef8` (Jul 5 13:13) adding config addresses; verified tonight: all 7 failing events now resolve an address through `findVenueConfig`. **BUT this is the 3rd consecutive "backfill streetAddress — clears F2b gate" commit** (`810f64a97`, `204f5092c`, `b76ad0ef8`) — the class re-fires every time a new venue enters without an address, and the signal only surfaces at build time = a build-day freeze each time.
- **C1b (Jul 6 13:06):** `dedup-301: survivor 378ae10cd6d3de27 for loser 3290e52493fdb4bc is not in the emitted set — build FAIL per GEO Ruling 2026-07-05`. The dedup-301 emission implementation is an **uncommitted foreign strand** (`src/generate-site.ts` +68, `src/generators/event-page.ts` +83, untracked test file; no session-log entry; ruling text NOT in geo-decisions.md). Production builds read the working tree, so the nightly build runs this WIP. The failing pair's mark direction **flipped between runs** (Jul 6 morning: 3290→378a; tonight: 378a→3290; only one code site ever writes `merged_into` and nothing nulls it — clear/flip mechanism unattributed). The WIP resolves no `merged_into` chains and treats any survivor-not-emitted state as build-freeze. Tonight's data is clean (43 losers, 0 chains / 0 dangling / 0 expired / 0 excluded survivors), so tomorrow's 08:00 build *should* pass — but the freeze class recurs whenever mark-state is transiently inconsistent.
- **C1c:** nightly auto-enrichment killed at wall-clock (`KILL_CAUSE: wrapper-wall-clock elapsed=1204s exit=124, batch-1, no events saved`); "Auto-enrichment failed (non-fatal)" most nights since ~May 11. Doesn't block deploys but starves the freshness runs of new enriched content (see C3).
**Estimated lift:** restores the entire citability product from ~0. Nothing else matters until this holds.
**Ownership:** C1a durable fix (import-time missing-address signal) dev-owned. C1b hardening (terminal-survivor chain resolution + fail-open on unresolvable pairs, loud warn) dev-owned; **recording the 2026-07-05 ruling in geo-decisions.md + authorizing the 43-loser 301 wave = GEO-owned**. C1c dev-owned diagnosis.

### C2 — 37% of event URLs carry zero semantic signal (degenerate Greek-title slugs)
**Term gated:** structured-data / human-search relevance (URL is a ranking + citation-selection signal; 263/710 live event URLs are `/events/{8-hex}--/`).
**Evidence:** `generateEventSlug` = `{idPrefix}-{slugify(venue)}-{slugify(title)}`; `slugify` drops non-Latin, so Greek-only titles/venues (e.g. "Έκθεση φωτογραφίας | Μαζί, Ορατές" at ΚΠΙΣΝ → `5a34e4ee--`) produce empty tokens. ~37% of the event surface — Greek titles dominate Athens listings.
**Fix shape (dev-ready):** transliteration in `slugify` (the repo already has transliteration normalization in the entity-resolution layer); existing slug-history machinery (`loadSlugHistory`/`generateRedirects`) already 301s old→new slugs automatically.
**Estimated lift:** high — whole-page-class fix (infrastructure beats content) touching 263 indexed URLs + all future Greek-titled events.
**Ownership:** implementation dev-owned, **but a 263-URL migration wave is a canonical-URL disposition event → GEO sign-off required before executing.** Surfaced, not executed.

### C3 — Enrichment coverage gap: 36% of upcoming events unenriched (REVISED after Phase-3 probe: throughput is healthy; the gap is eligibility + one dead slot)
**Term gated:** enrichment quality/coverage — 195/541 (36%) upcoming events have no grounded EN description; theater 55%, festival 47% coverage.
**Evidence (revised same-session):** save-rate is 30–43/day through Jul 5 — the pipeline is NOT stalled. The nightly "Auto-enrichment failed" is specifically the **01:00 slot idle-hanging** (`server-stream-idle` + `wrapper-wall-clock` both fire at ~1204s, 0 saved) while the 12:30/13/16/19/22 slots save normally. Loss ≈ one slot/day. The deeper, still-open constraint is **S181's queue-eligibility finding** (2026-06-09): events stranded at `location_status='unverified'` are structurally invisible to the enrichment selector — that routing fork (which stranded venues are Athens) was left for Editorial and remains unchosen.
**Estimated lift:** moderate — fixing the 01:00 hang recovers ~1 slot/day; resolving the eligibility fork unlocks the majority of the unenriched backlog.
**Ownership:** 01:00-slot hang dev-owned (network/laptop state at that hour is the prime suspect — same class as the S89 lid-closed finding). Eligibility fork = Editorial/GEO ruling. Content itself routes through the Enrichment Writer (grounded-only).

### C4 — Structured-data completeness warns (not validity): geo coords missing on 20% of pages; venue sameAs missing on 32%
**Term gated:** structured-data completeness (warn-level; validity is 100% and must stay).
**Evidence:** Jul 5 build report: 685/3387 pages missing `location.geo`; 1088 INFO `location.sameAs` missing; venueSameAs ratchet at 6/170. passRate by type: show 41%, other 42%, exhibition 49%.
**Estimated lift:** moderate — completeness feeds citation selection; but per the ratified F2b dispositions (2026-06-30/07-01), these are recommended-not-required fields.
**Ownership:** geo-coord backfill for known venues dev-owned (venues-master parent-pointer model, D8); **sameAs QIDs resolver-only — never generated** (S177/S180 fabrication incidents). Which fields to prioritize for citability = GEO input useful but not blocking.

### C5 — The measurement layer is empty: lifts cannot be attributed
**Term gated:** none directly — but the campaign's own metrics (citations per engine on the fixed query set, indexed-page counts) are unmeasurable today.
**Evidence:** kpi.db instrumentation tables all empty; GA4 AI-referral import stale since Jun 3; Bing fetcher works (fresh JSON Jul 6); GSC scripting exists but had OAuth fallback issues (S138). No server-log AI-bot ingestion.
**Estimated lift:** enabling — required to prove/disprove every other lever.
**Ownership:** dev-owned (run/repair existing import scripts; log citation checks for `tracked_prompts` into `manual_citation_log`).

### C6 — Indexing reality per engine: partially unmeasurable from this seat
Bing aggregate (17 impressions/7d on a 1,936-URL site) says the Bing/Tier-B surface is ~zero — consistent with the 2026-06-05 ruling's Tier-B starvation hypothesis. GSC index counts not fetchable in this session. Noted, not ranked — needs C5 first.

---

## GEO-owned items surfaced (not executed — routed to GEO Strategist)

1. **HIGHEST-LEVERAGE GEO ITEM: the dedup-301 ruling's paper trail + the 43-loser 301 wave.** The build enforces "GEO Ruling 2026-07-05 (Option 2 — 301-to-terminal-survivor)" but geo-decisions.md ends at 2026-07-04 and `specs/dedup-url-disposition-proposal.md` is still titled "for GEO Strategist ruling," unratified. The next successful deploy ships 43 suppressed loser pages + a force-301 wave authored by an unlogged, uncommitted strand. GEO must: record the ruling (append-only, their pen), confirm Option 2 + the gate's freeze-on-anomaly disposition, and rule on fail-open-vs-freeze for unresolvable (mutual/dangling) mark states.
2. The **111 theater per-date duplicate pages** — untouched per standing order.
3. **263-URL Greek-slug migration wave** (C2) — dev-ready, awaiting canonical-disposition sign-off.
4. Theater/festival enrichment prioritization (largest grounded-coverage gaps) — Enrichment Writer routing.
5. llms.txt "263 events" headline vs 710 sitemap events vs 803 EN pages — three different counts on the AI entry surface; which is the canonical claim is a positioning call.

## Phase plan (dev-owned, in order) — status at session end 2026-07-07
- **Phase 1 (C1b): ✅ DONE.** `resolveTerminalSurvivors` added to `src/generators/event-page.ts` + wired into the `generate-site.ts` caller: chains resolve to terminal (the ruling's own disposition, implemented faithfully); cyclic mark-groups fail OPEN per-group (pages emit, no rule, loud `⚠️ dedup-301` warn) instead of freezing the site; dangling/non-emitting terminals still build-FAIL per ruling. Tests first: 6 new cases in the strand's `dedup-redirects.test.ts` (15/15 green). `tsc` clean; full suite 2,945 pass (5 pre-existing environmental timeouts in `precommit-tsc.test.ts` — spawns real `bunx tsc` under a 5s cap, unrelated). **Full `bun run build` verified exit 0** with tonight's data: 0 schema fails, 37 dedup-301 bare rules + /en/ variants emitted.
  **Before → after:** daily build FAIL Jul 5 (schema) and Jul 6 (dedup-301 raw-map freeze) → build exit 0 verified locally; next 08:00 Athens automation run is expected to deploy. Deploy NOT triggered manually and src NOT committed — see GEO item 1 (the 301 wave + suppression ships with the next deploy and its ruling is unrecorded; the whole dedup-301 implementation is an uncommitted foreign strand and landing it belongs to its owner/user).
- **Phase 3 (C3): probed, re-scoped** (see revised C3) — no fix applied; 01:00-slot idle-hang is the dev-ownable piece.
- **Phase 2 (C5): NOT STARTED** — re-baseline measurement (GA4/Bing/GSC imports, first fixed-query citation log).
- **Phase 4 (C1a-durable): NOT STARTED** — import-time missing-address surfacing.
- **NOT executing:** C2 (awaits GEO), anything in the GEO list.
