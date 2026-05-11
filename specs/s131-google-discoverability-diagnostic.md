# Google Discoverability Diagnostic — S131

**Session date:** 2026-05-11
**Stream:** Minor — GEO infrastructure diagnostic
**Scope:** Findings only, no fixes (Guard 3). Each finding classified before any prescription (Guard 4).
**Companion doc:** `specs/s131-gsc-inspection-list.md` (11-URL checklist for Christos's manual GSC pass).

---

## Context

- **Domain age:** 26 days (registered ~2026-04-15)
- **GSC indexed** (2026-05-11 baseline): 8
- **GSC discovered** (sitemaps total): 7,532 (editorial 1,226 + venues 43 + events 6,263)
- **Bing indexed:** 605
- **7-day GSC impressions:** 6
- **7-day Bing AI citations:** 1

**DB ↔ build ↔ sitemap reconciliation discovered in this session:**

| Layer | Count | Notes |
|---|---|---|
| `events.db` rows visible (verified_athens + pass_through, not cancelled, future or open exhibition) | **368** | "Should be on the site right now" |
| `dist/events/` directories | **5,762** | All-time events ever built; mostly past |
| `dist/en/events/` directories | **501** | English mirrors (subset of Greek) |
| `sitemap-events.xml` URLs | **6,263** | 5762 GR + 501 EN — matches filesystem exactly |
| Visible-in-DB **AND** built to dist/ | **339** | 92% of visible events have a page |
| Visible-in-DB but **NOT** built | **29** | 🟡 7.9% miss rate — see Repo-side defect #B |
| Visible-built **AND** indexable (no noindex) | **332** | 98% of built visible events are indexable |
| Visible-built but **noindex** | **7** | 🟡 ~2% of visible events misflagged |

---

## Repo-side technical defects

Severity: 🔴 critical (block discoverability), 🟡 medium (degrades signal), 🟢 working as intended.

### A. 🔴 Broken `/neighborhoods/*` internal links at scale

**Evidence:**
- `/neighborhoods` → **404** in production
- `/neighborhoods/kerameikos/`, `/exarchia/`, `/kolonaki/`, `/psyrri/`, `/monastiraki/`, `/plaka/`, `/koukaki/` → **all 404**
- `dist/neighborhoods/` directory does **not exist** anywhere
- Not in any sitemap (events / editorial / venues)
- **134 of 200 (67%)** randomly-sampled event pages contain at least one `href="/neighborhoods/{name}/"` link
- Extrapolation: **≈3,858 broken internal links** across the 5,762-page event corpus

**Why it matters:** Internal 404s at this scale are a meaningful crawl-budget and PageRank-dilution signal. Every Googlebot crawl wastes a fraction of its budget on dead links, and link equity flowing into 404 destinations is lost.

**Classification:** Defect on our side, actionable.

### B. 🟡 29 visible-in-DB events not built to `dist/`

**Evidence:**
- DB has 368 currently-visible events (verified_athens / pass_through / not cancelled / future or open exhibition)
- Filesystem has 339 of those built — **29 missing**
- Verified examples: `9b851e1758017362` (dj_set @ SMUT Athens, 2026-06-06) and `a92af4c9291ede1a` (dj_set @ Cantina Social, 2026-05-11 — that's today!) are in DB as `verified_athens` but have no `dist/events/{id-slug}/` directory and no sitemap entry.

**Why it matters:** These ~29 events cannot be indexed because they don't exist as pages. Root cause not investigated this session (Guard 3) — could be staleness of last build, a filter dropping certain sources/types, or a slug-generation edge case.

**Classification:** Defect on our side, but smaller in absolute impact than (A). Investigate root cause in a future session.

### C. 🔴 Keyword cannibalization: `/concert` ⇄ `/concerts`, `/theater` ⇄ `/theatre`, etc.

**Evidence:**
- `dist/concert.html` and `dist/concerts.html` both exist
- Both have **identical title**: `<title>Συναυλίες στην Αθήνα | agent-athens</title>`
- Each declares its own URL as canonical (not consolidated to a single version)
- Both appear in `sitemap-editorial.xml` (concert: 2 occurrences, concerts: 1; theater: 2, theatre: 1)
- Same pattern for `/theater` vs `/theatre`

**Why it matters:** Two URLs with identical title and content compete for the same Greek query "Συναυλίες στην Αθήνα", splitting link equity and confusing Google's canonical selection.

**Classification:** Defect on our side, actionable (decide which is canonical, point the other at it OR drop one).

### D. 🟡 Hub-page explosion: 1,171 flat hub `.html` files in `dist/`

**Evidence:**
- 1,171 top-level `.html` files in `dist/` (e.g. `ai-tech.html`, `ballet-performance.html`, `cabaret-show.html`, `classical-music.html`, `cloud-tech.html`, `clubs.html`, `comedy.html`, `comedy-theater.html`, `contemporary-art-exhibition.html`, `contemporary-dance-dance.html` ← duplicate word, `concert.html`, `concerts.html`, ...)
- Each subgenre exists in 7 variants (bare + today/tomorrow/this-week/this-weekend/this-month/next-month)
- `contemporary-dance-dance.html` has duplicated word — likely a build-script bug joining type "dance" with subgenre "contemporary-dance"

**Why it matters:** Many thin subgenre hubs without distinctive content compete for crawl budget and risk being classified as "doorway pages" by Google. The duplicated-word filename suggests at least one outright build bug.

**Classification:** Strategy + minor defect. The Velocity vs. consolidation trade-off (more hubs = more keyword coverage but lower per-page authority) is a GEO Strategist call. The `contemporary-dance-dance.html` duplicate-word bug is actionable independently.

### E. 🟡 Hreflang split: 91% of events emit self-referencing `hreflang="el"` only

**Evidence:**
- Of 100 sampled event pages: **9** emit full bilingual hreflang (el + en + x-default, bidirectional and matching with `/en/events/{slug}/`), **91** emit only `<link rel="alternate" hreflang="el" href="...">` self-reference
- Matches the 501/5,762 (~8.7%) ratio of events that have English mirrors
- An EN-mirrored example (`006bf4e8-bolivar-adam-beyer-i-bart-skils-i-sat-may-2`) has clean bidirectional hreflang on both GR and EN sides ✅

**Why it matters:** Self-referencing-only hreflang is technically valid but adds no signal. Either emit no hreflang for monolingual events, or emit a full bilingual block (which requires generating the EN mirror).

**Classification:** Strategy: do we want every event to have an EN mirror? That's a build-volume / enrichment-cost trade-off. Not a discoverability blocker.

### F. 🟡 Title duplication on recurring theater performances

**Evidence (200-event sample):**
- 1 title × 4 occurrences: `The Velvet Night - Ζαχαράτος & Παπαρίζου | NOX | agent-athens`
- 6 titles × 3 occurrences each
- 8 titles × 2 occurrences each
- Pattern: same play, same venue, multiple performance dates → identical `<title>`. Meta descriptions DO differentiate via the date, so Google's crawler has some signal to disambiguate.

**Classification:** Strategy. Could be addressed by including the date in `<title>` (e.g. `Ο πατέρας μου · 28 Μαρτίου | Στοά | agent-athens`), or by canonicalizing all dates of one play to a single URL (with date listed inside) — both are GEO Strategist calls.

### G. ✅ Canonical tags

**Evidence:** 200/200 sampled events have a `<link rel="canonical">` pointing to their own URL. Hub pages tested also have correct self-canonicals.

### H. ✅ Noindex policy on past events

**Evidence:**
- 5,428 `noindex` meta tags across `dist/events/*` (out of 5,762 GR event pages = 94%)
- BUT only 7 of the 339 currently-visible-AND-built events carry noindex
- Conclusion: noindex is correctly applied to past events; current/upcoming events are mostly indexable

**Minor concern:** The 7 currently-visible events flagged as noindex may be misclassified. Worth investigating but not critical.

### I. ✅ `robots.txt` is well-configured for the AI-search era

```
Allow: Googlebot, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
       PerplexityBot, anthropic-ai, AppleBot-Extended, Amazonbot, meta-externalagent
Disallow: Google-Extended (blocks AI training, preserves search)
Sitemap: https://agentathens.com/sitemap-index.xml
```

**Why this matters:** This is exactly the right modern stance — open to AI search crawlers (which drive citations) while blocking AI training (which provides no return). Worth flagging to the GEO Strategist as **already done correctly** so they don't re-prescribe.

---

## Internal linking sample

Three event pages were inspected (all near/mid-window, all confirmed built):

| Event | Total internal hrefs | Unique | Notable links |
|---|---|---|---|
| `9454cac8-christmas-theater-...` (theater, near) | 35 | 24 | 6× sibling /events/, 4× /venues/, 5× home, 3× /today + /this-weekend + /this-month, 2× /theatre, 3× /llms.txt, 1× **/neighborhoods/{name}/** 🔴 |
| `a47a1c7c-floyd-tinariwen` (concert, near) | 35 | 24 | 6× sibling /events/, 4× /venues/, 5× home, time-hubs (3), 2× /concerts, 3× /llms.txt, 1× **/neighborhoods/{name}/** 🔴 |
| `c3fe4ec6-gazarte-telenova-live-in-athens` (concert, mid) | 35 | 24 | identical link footprint to above |

**Observations:**
- ✅ **Dense and well-shaped internal linking**: every event reaches venue + parent type-hub + 3 time-hubs + 6 sibling events. Far from a dead-end.
- ✅ **`llms.txt` linked** 3× per page — confirms presence (`dist/llms.txt`, 78 lines, 4 KB) as a structured hint file for AI crawlers.
- 🔴 **Broken `/neighborhoods/*` link** appears on most event pages (67% of 200-sample). See Repo-side defect (A).
- 🟡 **Linked hub variants** suggest plural/singular collision: pages link to `/concerts` and `/theatre`, but the editorial sitemap submits `/concert` and `/theater`. See defect (C).

---

## Manual GSC findings

**[Christos to populate after running the URL Inspection pass — see `specs/s131-gsc-inspection-list.md`]**

Format suggestion:
- Per-URL row: indexed Y/N, last crawl date, user vs Google-selected canonical, coverage reason
- Pages-report drilldowns: for each "Why pages aren't indexed" reason, list the actual URL(s) Google flagged
- Pay special attention to: the **1 noindex** Google flagged (is it intentional?) and the **1 crawled-not-indexed** (is it a content-quality signal?)

---

## Classification

**[Filled after Step 5 manual GSC pass. Initial draft based on Claude Code findings only:]**

### Defects on our side (actionable — ordered by impact)

1. **🔴 (A) Broken `/neighborhoods/*` internal links** across ~67% of event pages (≈3,858 dead links). Highest impact: crawl-efficiency hit + PageRank dilution. *Fix shape:* either generate the missing neighborhood hub pages, or remove the broken links from event-page templates. Touch points TBD (likely a template in `src/generate-site.ts` or sibling).
2. **🔴 (C) `/concert` ⇄ `/concerts` (and `/theater` ⇄ `/theatre`) cannibalization** — identical title competing for same query, both indexed. *Fix shape:* pick one as canonical, point the other at it, remove from sitemap. Investigate why both exist before deciding.
3. **🟡 (B) 29 visible-in-DB events missing from `dist/`** — investigation needed; could be build-staleness, filter bug, or slug-generation edge case.
4. **🟡 (D) `contemporary-dance-dance.html` duplicate-word build bug** — narrow, isolated. Probably one-liner in hub-generation script.
5. **🟡 (H minor) 7 visible-built events carry noindex** — worth checking whether the "is this event still current" predicate has a corner case.

### Domain-age artifacts (wait)

- **GSC indexed = 8** at 26 days old is well within normal — Google typically takes 4–8 weeks to crawl and index a new site's full URL inventory. The discoverability ceiling here is partly time, not technique. With ~7,500 discovered URLs, expect indexed count to climb steadily even without fixes; the defects above would accelerate but not unlock indexing.
- **Bing indexed = 605** in the same window suggests technical reachability is fine — Bingbot has no trouble getting the pages. This is evidence that the GSC index gap is Google-side patience + the defects above, not a fundamental block.

### Quality signals (escalate to GEO Strategist)

- **No `/guide/*` cornerstone pages** exist (e.g. "Best Live Music Venues in Athens", neighborhood guides). Cornerstones are typically the highest-EEAT pages a site has, and their absence means there's nothing for time-hubs and type-hubs to point at as the "authority page". Strategy: should we build cornerstones? Where do they sit in the IA?
- **No `/neighborhoods/*` hub pages** despite event pages linking to them as if they did. Strategic gap: neighborhood is one of the strongest user-intent axes for an Athens events site (people search "events in Exarchia").
- **1,171 flat subgenre hubs** is a Velocity vs. Authority trade-off. Currently leaning hard toward Velocity (many thin pages); GEO Strategist should weigh whether to consolidate.
- **91% of events use self-referencing hreflang only.** The choice to expand to bidirectional bilingual coverage is a build-cost / enrichment-quality decision (English enrichment is currently dormant per the project's English-only enrichment policy).
- **Title format** could be tuned to include date for recurring shows (see defect F).

### Unknown / needs follow-up

- Why are the 29 visible-in-DB events missing from `dist/`? (Defect B)
- Why does `contemporary-dance-dance.html` exist with duplicated word? (Defect D)
- What exact GSC error appears for the `sitemap-editorial.xml` entry? (S130's still-open question)
- After remove + re-add cycle, will GSC fetch error resolve? (S130 recommendation)
- Are the 7 visible-built noindex events genuinely current, or is the "is this past?" check buggy?
- Live impressions are 6/week. Once defects (A) and (C) are fixed, will Google re-crawl quickly enough to see uplift, or is impression growth bottlenecked by domain age?

---

## What the GEO Strategist brief should say

In one sentence: **The site is mostly technically sound (canonicals correct, sitemaps reachable + valid, robots.txt modern, noindex policy working), but two defects are throttling discoverability — ~3,858 internal links pointing to a non-existent `/neighborhoods/*` namespace, and `/concert`-vs-`/concerts` cannibalization — while the larger strategic question is whether to invest in cornerstone and neighborhood hubs (currently absent).**

The discoverability story is not "Google is ignoring us"; it is "we have a 26-day-old site with two real defects, no cornerstones, and a reasonable indexing trajectory that the defects are dragging on."
