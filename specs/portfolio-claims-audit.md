# Portfolio Claims Audit — README vs CV vs Email vs Measured Reality

**Date:** 2026-06-04 (Session: read-only audit)
**Scope:** Audit live/current state of agent-athens against README.md, `static/root-files/cv.pdf`, and planner-provided email claims. No edits to README/CV/source — this file is the only write.
**Measurement basis:** dist/ from today's automated run (built 2026-06-04 08:19, deployed — local dist == live exactly), live agentathens.com, `bun test` run today, `data/events.db` as of today.

---

## Audit conditions (read before trusting numbers)

- **Tree was dirty at audit time** — proceeded per planner amendment. Dirty set: `data/parsed/newsletter-events.json` (+130), `data/venues-master.json` (+11), `docs/known-issues.md` (+11), 7 untracked `specs/*.md`. **README.md and cv.pdf were NOT dirty** — claim columns reflect committed = GitHub-live text.
- **No fresh build was run.** Raw `bun run build` has a documented false-halt (dual-build-path divergence, known-issues 2026-05-29); `daily-automated.sh` would trigger a real deploy. Instead the **existing dist/ was measured** — mtime confirms it is today's 08:19 automated production run, and its sitemap counts match live exactly, so it IS the deployed artifact.
- **Page counts (Steps 1–3) reflect last-build state (08:19 today); DB counts (Step 5) reflect current drifted state.** Two different moments — do not reconcile against each other.
- **Brief premise corrections:** (1) brief said probe `agentathens.netlify.app` — production is `agentathens.com` since S81; netlify.app 301-redirects there (stale links still land on production, good). (2) brief's Step 1 `bun run build` would have false-halted. (3) CV is not just a local file — it is **live at https://agentathens.com/cv.pdf (HTTP 200)**, served from `static/root-files/`, i.e. publicly clickable.

---

## Measured reality (Steps 1–5)

| Probe | Result |
|---|---|
| dist/ HTML pages (total) | **4,468** (built 2026-06-04 08:19) |
| — events | 2,549 |
| — venues | 64 |
| — /en/ mirrors | 674 (of which 639 en/events) |
| — other Greek pages (hubs, editorial, date/price/genre combos) | 1,181 |
| Local sitemap URLs (excl. index) | **3,785** = 2,549 events + 1,195 editorial + 41 venues |
| **Live sitemap URLs (agentathens.com)** | **3,785 — identical to local; zero deploy lag** |
| Live site | HTTP/2 200; netlify.app → 301 → agentathens.com |
| Sitemap vs HTML gap | 4,468 − 3,785 = 683 ≈ /en/ mirrors (674) + misc — /en/ pages are built but not sitemap-listed |
| `bun test` (run 1) | **2,660 pass / 1 skip / 1 fail — 2,662 tests, 125 files, 5,711 expect(), 55.8s** |
| `bun test --coverage` (run 2) | **2,661 pass / 1 skip / 0 fail** — the single fail is flaky (`processEventImage > returns null… on failed download`, 5001ms ≈ network-timeout test) |
| Coverage (bun, All files) | **80.73% functions / 79.29% lines** — measurable, tooling works |
| `bunx tsc --noEmit` | **exit 2** — ~25 errors, ALL confined to `scripts/scrape-*.ts` (DOM-in-page-eval typing, missing Event fields in 2 scrapers); **zero errors in src/** |
| launchd automation | 11 active `com.agentathens.*` plists (daily, auto-enrich, 6 enrichment slots, deploy-cadence check, enrichment-check, monitor-visibility) |
| DB total events | 13,945 |
| DB enriched (`full_description` non-empty) | 1,331 |
| DB source tags | 16 distinct; **8 sources produced events in last 7 days** |
| Registered scrapers | **10** = 9 in `scrape-all.ts` SOURCES registry (more.com, athinorama.gr, clubber.gr, ticketservices, halfnote, residentadvisor, onassis, benaki, megaron.gr) + snfcc (separate script). Matches known-issues S162 "all 10 sources". |
| `config/scrape-list.json` sites | 7 — **stale config, source of README's wrong "7"** |
| `config/athens-venues.json` venues | 346 |
| `data/venues-master.json` entries | 296 |
| Unique neighborhoods | 49 (athens-venues.json) / 72 (venues-master.json) — neither is 90 |
| `scripts/` file count | 95 |
| DB pass_through events | 8 |
| Python scrapers | **none live** — all `.py` under `scripts/_archive/` only |

---

## Discrepancy matrix

Verdict ∈ {accurate, stale-low, inflated-high, unsupported}. Email column is [planner-provided], unverified.

| Claim | README says | CV says | Email says [planner-provided] | MEASURED reality | Verdict | Defensible value to use |
|---|---|---|---|---|---|---|
| Page count | — (no number) | "~2,820 static pages generated daily" | "~12,000 pages" | **4,468 HTML built; 3,785 live sitemap URLs** (Steps 1–3, local==live) | CV: **stale-low** (−37% vs HTML). Email: **inflated-high** (2.7–3.2×; possibly conflated with 13,945 DB events — events ≠ pages) | "~4,500 static pages (3,800 sitemap-indexed URLs)" — live-verified today |
| Scraper sources | "Active scraper sources: 7" | "ten scrapers feed a SQLite store" | — | **10 registered scrapers**; 8 active in last 7 days; README's 7 traces to stale `config/scrape-list.json` (Step 5) | README: **stale-low**. CV: **accurate** | "10 scraper sources" (or "10 sources, 8 active this week" if being precise) |
| Production status | "publishes a static site to Netlify", daily pipeline | "redeploys on a schedule with zero human touch" | "production" | Live HTTP 200; today's 08:19 build auto-deployed; 11 launchd agents; zero deploy lag (Steps 1,3,5) | **accurate** (all three) | "in production — automated daily build + deploy, live at agentathens.com" |
| Test coverage | — (lists test areas, no %) | — | "full test coverage" | **2,662 tests / 125 files; 80.73% func / 79.29% line coverage; 1 flaky test; tsc has ~25 errors in scripts/ (0 in src/)** (Step 4) | Email: **inflated-high** — "full" is falsified by a measured ~80% | "2,660+ passing tests across 125 files, ~80% measured coverage" |
| Subagent pipelines | — (says "multi-agent orchestration") | "AI enrichment layer rewrites raw data" | "Claude Code subagent pipelines" | Enrichment runs headless `claude -p` batches via `auto-enrich.sh` + launchd — Claude Code CLI automation, but no Task/subagent fan-out in the pipeline itself (Step 5 + repo) | Email: **unsupported as phrased** (CLI ≠ subagents). README "multi-agent orchestration": borderline — defensible only re: dev process | "automated AI enrichment via headless Claude Code (claude -p), zero external API cost" |
| Daily / unattended | "runs automatically every morning" | "generated daily and unattended… zero human touch" | — | dist built 08:19 today by launchd, deployed without intervention; 11 active agents (Steps 1,5) | **accurate** | keep as-is |
| Zero external API cost | — | "zero external API cost (enrichment runs inside Claude)" | — | Enrichment is `claude -p` (subscription CLI), no API key billing in pipeline (Step 5) | **accurate** | keep as-is |
| Verified Athens venues | "346" | — | — | `config/athens-venues.json` = 346 exactly (Step 5 probes) | **accurate** | "346" |
| Pass-through entries | "6" | — | — | DB shows 8 pass_through events today | **stale-low (minor)** — drifts daily; shouldn't be a README stat | drop the stat, or "~8 multi-venue entries" |
| Neighborhoods | "90 catalogued" | — | — | 49 unique (athens-venues.json), 72 (venues-master.json) — 90 not reproducible from either catalog | **unsupported** | "70+ neighborhoods" (venues-master basis) or locate the 90 source before reusing |
| Operational scripts | "~90" | — | — | 95 files in scripts/ | **accurate** ("~90" rounds fine) | "~95 operational scripts" |
| Pipeline runtime | "~15–25 min" | — | — | Not measured this session (no pipeline run — read-only) | **unverified** (plausible; today's run logs could confirm) | verify from today's log before citing |
| Tech stack: Python scraping | "Bun + Python (Puppeteer, Cheerio, BeautifulSoup)" | — | — | All `.py` files in `scripts/_archive/` only; live scraping is Bun/TS (Step 5; confirms S100b ledger) | **stale-high** (claims tech no longer in use) | "Bun + TypeScript (Cheerio, Puppeteer)" — drop Python/BeautifulSoup |
| Events in DB | — | — | — (context: email's "12,000" may be this) | 13,945 total; 12,470 verified_athens; 1,331 enriched | n/a | "13,900+ events ingested; 2,549 currently-live event pages" |

---

## Recommended single source of truth

Strings README and CV should converge on (live-verified 2026-06-04):

- **Pages:** "~4,500 static pages, 3,800 sitemap-indexed URLs, rebuilt and deployed daily" — cite the LIVE number; today local == live so either basis is currently safe, but sitemap (3,785) is the conservative, recruiter-verifiable one (`agentathens.com/sitemap-index.xml`).
- **Sources:** "10 scraper sources" (fix README's 7; CV already correct).
- **Production:** "Live at agentathens.com — fully automated daily pipeline (scrape → enrich → build → deploy) via launchd, zero human touch." All evidenced.
- **Tests:** "2,660+ passing tests across 125 files, ~80% measured coverage." NEVER "full test coverage" — measured 80.73%/79.29%. The flaky `processEventImage` network test should be stabilized before anyone runs `bun test` from the README.
- **Enrichment:** "AI enrichment via headless Claude Code (claude -p) at zero external API cost." Avoid "subagent pipelines" — not evidenced in the production pipeline.
- **Events:** "13,900+ events ingested, 2,500+ live event pages" — never present DB event count as a page count (likely origin of the email's ~12,000 inflation).
- **Tech stack:** drop "Python (BeautifulSoup)" from README — archive-only.
- **Stats table hygiene:** README's per-day-drifting stats (pass-through count) should be removed or rounded; exact-but-stale numbers age worse than ranges.

## Open items for the README+CV sync session (separate session — do not fix here)

1. README: 7 → 10 sources; drop Python; fix/drop neighborhoods 90; refresh "As of" date.
2. CV: ~2,820 → ~4,500 pages (or "3,800 indexed URLs"); CV is LIVE at /cv.pdf so the fix redeploys with next daily run once committed.
3. Email template: replace "~12,000 pages" → live number; "full test coverage" → "2,660+ tests, ~80% coverage"; "subagent pipelines" → "headless Claude Code automation".
4. Optional: stabilize flaky `processEventImage` test (5s network timeout) so a recruiter's `bun test` is green.
5. Optional: investigate why /en/ mirrors (674 pages) are excluded from sitemaps — intentional canonical strategy or gap?
