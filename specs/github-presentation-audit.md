# GitHub Presentation Audit — 2026-05-29

Read-only audit of repo presentation surface (README + root hygiene), conducted as Phase 0 of the session. Findings drove the Phase 1 changes shipped in the same commit.

## Method

Every factual sentence in `README.md` was extracted, mapped to a runnable evidence command, and verdict-ed as **TRUE-NOW**, **DRIFTED**, **UNVERIFIABLE**, or **ASPIRATION**. Hygiene presence checks ran in parallel. Live URL probes confirmed which surfaces are 200-safe to link.

## Claim Ledger

| # | README claim (pre-session) | Evidence | Result | Verdict | Action |
|---|---|---|---|---|---|
| 1 | "Pages generated (last build) 10,275" | `find dist -name "*.html" \| wc -l` | 4,943 | DRIFTED + on-disk `dist/` likely stale | **Cut** (Option B) |
| 2 | "Event pages 8,644" | `find dist/events -name "*.html"` | 3,039 | DRIFTED + stale-`dist` risk | **Cut** |
| 3 | "Venue pages 89" | `find dist/venues -name "*.html"` | 64 | DRIFTED + stale-`dist` risk | **Cut** |
| 4 | "Hub / category pages ~50" | no single measurable definition | UNVERIFIABLE | — | **Cut** |
| 5 | "Events in database 9,389" | `sqlite3 data/events.db 'SELECT COUNT(*) FROM events'` | 13,478 *total records, all statuses* (site only shows `verified_athens` + `pass_through`) | DRIFTED + mis-labeled | **Cut** (recruiters would read "events on site") |
| 6 | "Upcoming events 412" | `WHERE date >= date('now')` failed silently | UNVERIFIABLE this session | — | **Cut** |
| 7 | "Verified Athens venues 409" | `jq '.venues \| length' config/athens-venues.json` | **346** | DRIFTED | **Refresh to 346** |
| 8 | "Build time ~11s" | no timing artifact | UNVERIFIABLE | — | **Cut** |
| 9 | "Pipeline runtime ~20 min" | conflicts with "~15–25 min" elsewhere in same README | DRIFTED + duplicated | **Unify to ~15–25 min, single location** |
| 10 | `src/generate-site.ts` exists | `ls src/generate-site.ts` | present | TRUE-NOW | **Keep** |
| 11 | `scripts/auto-enrich.sh` exists | `ls scripts/auto-enrich.sh` | present | TRUE-NOW | **Keep** |
| 12 | "70+ operational scripts" | `ls scripts/*.ts scripts/*.sh \| wc -l` | **90** | UNDERSTATED | **Refresh to ~90** |
| 13 | `athens-venues.json` "409 verified" | same as row 7 | DRIFTED | **Refresh to 346** |
| 14 | "3 split sitemaps … 10,275 URLs total" | sitemap-events.xml 200; total-URL claim depends on stale dist | DRIFTED on count | **Keep "3 split sitemaps," cut "10,275 URLs total"** |
| 15 | "Schema.org JSON-LD (Event, CollectionPage, FAQPage)" | `docs/MASTER-ENRICHMENT-TEMPLATE.md` (memory) | TRUE-NOW | **Keep** |
| 16 | "macOS launchd (daily 8 AM Athens time)" | `com.agentathens.daily.plist` at root | TRUE-NOW | **Keep** |
| 17 | "Bun (never Node.js)" | `bun.lock` + `package.json` + CLAUDE.md tier-1 rule | TRUE-NOW | **Keep** |
| 18 | "Hosting: Netlify (CDN + edge functions)" | `netlify.toml` present | TRUE-NOW | **Keep** |
| 19 | "Concerts, DJ sets, exhibitions, theater, festivals" | `dist/` subdirs match | TRUE-NOW | **Keep** |
| 20 | "17 phases in order" table | matches `scripts/` presence | TRUE-NOW (structural) | **Keep** |
| 21 | "License: MIT" footer | `ls LICENSE*` → MISSING | ASPIRATION-AS-FACT | **Add LICENSE file** (now TRUE-NOW) |
| 22 | "Live site: agentathens.com" | `curl /` → 200 | TRUE-NOW | **Keep** |
| 23 | "/llms.txt" | `curl /llms.txt` → 200 | TRUE-NOW | **Keep** |
| 24 | "Expand to agent-barcelona / agent-berlin / agent-cities … affiliate revenue" | no infra | ASPIRATION | **Quarantine in `## Vision` with intent verbs** |

### Live-URL probe results

| URL | Status | Linkable |
|---|---|---|
| `/` | 200 | ✓ |
| `/llms.txt` | 200 | ✓ |
| `/en/colophon/` | 200 | ✓ (added to header) |
| `/cv.pdf` | 200 | ✓ |
| `/sitemap.xml` | 301 → `/sitemap-index.xml` | use sitemap-index |
| `/sitemap-index.xml` | 200 | ✓ (linked as anti-drift "current scale" source) |
| `/sitemap-events.xml` | 200 | ✓ |
| `/proof` | **404** | ✗ — separate follow-up ticket |

### Cross-check finding (incidental — surfaced as a follow-up ticket)

DB event records grew **+44%** (9,389 → 13,478) while tracked `dist/` HTML dropped **−52%** (10,275 → 4,943). Those move in opposite directions. More data should not produce fewer pages. Two hypotheses, both worth a separate session:

1. The on-disk `dist/` is a stale or partial build — a clean `bun run build` may yield more pages than 4,943.
2. Page generation has regressed (empty-page rendering disabled, a generator branch broken, hub-page emission turned off, status-filter changes excluding more events than intended).

This is why Option B was chosen: cutting volatile per-build counts entirely until the regression is investigated, rather than enshrining either number.

## Hygiene Table

| Item | Pre-session state | Action | Post-state |
|---|---|---|---|
| `LICENSE` | MISSING | Create MIT, 2026, Christos Maragkoudakis | Present; README footer claim now TRUE-NOW |
| `.gitattributes` | MISSING | Create with `*.html linguist-generated=true` | Present; GitHub language stats unbroken |
| `package-lock.json` | tracked alongside `bun.lock` | `git rm --cached`, append to `.gitignore` | Untracked, kept on disk; Bun-only lockfile policy |
| `agent-events.db` (root) | tracked, 0 bytes, mtime 2026-03-13 | `git rm --cached`, append `/agent-events.db` to `.gitignore` | Untracked, kept on disk; distinct from live `data/events.db` |
| `design-system-audit.html` (root) | tracked, 16 KB, mtime 2026-03-31 | `git rm --cached`, append `/design-system-audit.html` | Untracked, kept on disk |
| `diagnostic-report.md` (root) | tracked, 22 KB, mtime 2026-02-28 | `git rm --cached`, append `/diagnostic-report.md` | Untracked, kept on disk |
| Tracked `.html` by dir | `data/` 546, `static/` 2, `tests/` 1, root 1 | Linguist rule fixes language bar | Fixed |
| `gh auth status` | not logged in | Skip `gh repo edit`; document for operator | Operator manual step |
| `docs/assets/hero.png` | not on disk | **OMIT** image markdown this session (deferred to operator follow-up commit) | Hero ships in same commit as PNG |
| `.github/workflows/` | MISSING | No CI badge added | Honest — no CI claim |
| WIP files (7) | `data/venues-master.json` modified + 6 untracked `specs/*.md` | **Never staged** | Untouched |
| Stashes (2) | pre-schema-deploy WIP | **Never popped/dropped** | Untouched |

## Verified Replacements in README

Slow-drift facts only — re-probed at commit time:

| Fact | Source command | Value |
|---|---|---|
| Verified Athens venues | `jq '.venues \| length' config/athens-venues.json` | 346 |
| Pass-through (multi-venue) entries | `jq '.pass_through_venues \| length' config/athens-venues.json` | 6 |
| Neighborhoods catalogued | `jq '.neighborhoods \| length' config/athens-venues.json` | 90 |
| Active scraper sources | `jq '.sites \| length' config/scrape-list.json` | 7 |
| Operational scripts | `ls scripts/*.ts scripts/*.sh \| wc -l` | ~90 |
| Pipeline runtime | existing "Daily Pipeline" range; qualitative | ~15–25 min |

Plus an anti-drift sentence pointing to the live [sitemap index](https://agentathens.com/sitemap-index.xml) as the current-scale source — so per-build counts never need to be re-baselined in the README again.

## Per-Step Result

| Step | Go/No-Go decision | Outcome |
|---|---|---|
| 1.1 `.gitattributes` | GO | Shipped (1 line, `*.html linguist-generated=true`) |
| 1.2 `LICENSE` | GO | Shipped (MIT, 2026, Christos Maragkoudakis) |
| 1.3 Single lockfile | GO (Netlify builds-from-source disabled — confirmed via `netlify.toml`) | `package-lock.json` untracked + .gitignored |
| 1.4a `agent-events.db` | GO (0 bytes, mtime 2.5 months old, distinct from `data/events.db`) | Untracked |
| 1.4b `design-system-audit.html` | GO | Untracked |
| 1.4c `diagnostic-report.md` | GO | Untracked |
| 1.5 README rewrite | GO | Option B applied; all 6 drifted stats removed; verified slow-drift facts only; Vision quarantined; verified-200 surfaces linked; **hero image omitted this session** |
| 1.6 `gh repo edit` (About + topics) | **NO-GO** (gh not authed) | Operator manual step |
| 1.7 Audit spec | GO | This file |

## Out-of-Scope — Follow-up Tickets

1. **`/proof` returns 404.** Contradicts expectation that the anti-drift proof page is live. Investigate routing (`/proof/`? `/proof/index.html`?) or actual deploy state separately.
2. **Possible page-generation regression.** +44% DB / −52% `dist/` HTML is not explained by drift. Run a clean `bun run build`; if the new count is also ~4,943, page generation has regressed (candidates: empty-page rendering disabled, generator branch broken, hub-page emission off, status-filter excluding more events than intended).

## Out-of-Scope — Operator Manual Steps

1. **Hero image follow-up commit:** create `docs/assets/`, drop `hero.png` (~1280×720), add `![Agent Athens — what's on in Athens tonight](docs/assets/hero.png)` line under the README intro, commit + push in one shot.
2. **Social preview image:** GitHub → Settings → Social preview (1280×640).
3. **`gh repo edit` after `gh auth login`:**
   ```
   gh repo edit chrimar3/agent-athens \
     --homepage "https://agentathens.com" \
     --description "AI-curated Athens cultural events, engineered for citation by AI answer engines. Bun + TypeScript SSG, SQLite, Schema.org, daily automated pipeline." \
     --add-topic bun --add-topic typescript --add-topic static-site-generator \
     --add-topic schema-org --add-topic llms-txt --add-topic generative-engine-optimization \
     --add-topic sqlite --add-topic netlify --add-topic athens
   ```
