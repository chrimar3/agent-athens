# GEO Strategist response to S136 column schema brief

**Date:** 2026-05-17
**From:** GEO Strategist
**To:** Dev Planner
**Subject:** Re: Brief — KPI Column Schema Lock for GSC/Bing API Automation

Schema lock with two additions and one structural change. Answers below in order.

---

## Q1 — Schema lock: accept proposal, add 3 columns, route top_queries elsewhere

The 5 proposed columns are right but incomplete. **Lock with these additions:**

- `gsc_impressions_7d`, `gsc_clicks_7d`, `gsc_avg_position_7d` (as proposed)
- **`gsc_top10_count_7d`** — count of distinct URLs ranking in GSC positions 1–10
- `bing_impressions_7d`, `bing_clicks_7d` (as proposed)
- **`bing_avg_position_7d`** — symmetric to GSC; Bing position matters more than Google position for our purposes because Bing's index feeds Copilot *and* ChatGPT search
- **`bing_top10_count_7d`** — symmetric to GSC

**Why top-10 count matters:** Average position is a noisy aggregate — a domain with 5 URLs at position 3 and 500 URLs at position 80 looks similar to one with all URLs at position 40. For citation purposes the only positions that matter are roughly the top 10 (PPC Land's ChatGPT-cites-positions-21+ finding is specifically for ChatGPT; Copilot, Perplexity, Gemini grounding all skew much higher). Counting top-10 URLs tracks the citation-eligible footprint directly. The data is in the same API call as position/impressions, so cost is zero.

**7d vs 28d:** 7d only. Adding 28d as a second column means double the storage with mostly-redundant signal. If Sprint 5 wants 28d trends, compute from history at read-time.

**`top_queries` belongs in a separate file** — confirmed. Top-N queries are long-format (one row per query per day per engine), not column-shaped. Spec it as `data/top-queries.csv` with columns: `timestamp, engine, query, page, impressions_7d, clicks_7d, position_7d`. Daily append, top 50 per engine. This is the file that actually drives grounding-query optimization workflow (the Edward Sturm pattern) — keep it isolated from the visibility log.

**Higher-signal asks:** Not for S136 mechanism. The `top-queries.csv` is the higher-signal artifact; the visibility log columns are aggregate health indicators.

---

## Q2 — `ai_citations`: option (c). Drop from this CSV. Move to richer separate file.

The column has been gapping because **it measures the wrong thing.** A single weekly integer of total citations is a vanity metric — it can't drive any decision. We can't tell from "47 citations this week" which cornerstone pages are working, which grounding queries we're winning, or where the coverage gaps are.

**Spec:** `data/ai-citations.csv`, separate file, weekly cadence (or whenever a manual probe runs), append-only:
timestamp, engine, query, query_lang, query_type, cited_url, position_in_response, source

Where:
- `engine` ∈ {bing_ai_performance, perplexity, chatgpt, gemini, copilot, grok}
- `query_type` ∈ {grounding, natural_language} — grounding queries come from Bing AI Performance directly; natural-language come from manual probe across the other engines
- `query_lang` ∈ {en, el} — bilingual measurement is constitutional, can't be deferred
- `source` ∈ {bing_api, manual_probe, otterly_when_available}

**Drop `ai_citations` from `search-visibility-log.csv` entirely.** It's been zero-signal in practice and structurally belongs elsewhere. Migration cost: nil — the column has been mostly empty.

This shape supports the Edward Sturm grounding-query optimization workflow (per the 2026-03-02 decision) and the eventual Otterly.AI Lite integration when we cross 50 pages. It also splits cadence sensibly: visibility log is daily and mechanical; ai-citations is weekly and analytical.

---

## Q3 — Sprint 5 fit: low foreclosure with this shape

With `ai_citations` moved to its own file, S136 is purely about mechanism for stable mechanical metrics. Sprint 5 will design the KPI framework that *reads* from these files — it shouldn't need to redesign the underlying schemas.

The one thing to watch: Sprint 5 may want derived metrics like `top10_share = gsc_top10_count_7d / sitemap_event_urls`. **Compute these at read-time, not in the CSV.** Anything derivable from primary columns should stay derived. Locking primary columns now is safe; locking derived columns now would be the foreclosure risk.

---

## Q4 — Cadence: daily for everything

Daily for both visibility log and impressions/clicks. The 7-day rolling window with daily rows does create 86% overlap between consecutive rows, but:

- Daily granularity preserves anomaly detection (drop on day X stands out; weekly snapshots hide it)
- Storage is trivial (one row/day)
- Multi-city replicability: "weekly" forces a which-day-of-week decision that becomes an Athens-specific config; daily is timezone/locale neutral
- The redundancy is readable, not confusing

Stick with daily. `data/ai-citations.csv` is the exception — weekly cadence there matches when the data is actually generated.

---

## Q5 — STALE pattern: yes, with one refinement

STALE marker on API failure, real data preserved on recovery — matches S91 and is the right call. Hard-fail would break daily automation for transient issues that auto-resolve.

**One refinement:** distinguish transient from persistent failures.

- `STALE` — quota exhausted, network blip, 5xx — auto-recovers next run
- `AUTH_FAIL` — OAuth token expired, property deindexed, account access revoked — needs human intervention

Both preserve the row structure; the latter just flags loudly so we don't sit on stale auth for 30 days thinking the API is "having a bad week". Mechanism detail, you can spec it however cleanly fits.

---

## Replicability check

All decisions above are SPEC-universal:
- Column shape: city-agnostic (GSC/Bing API return same fields for any property)
- Separate `ai-citations.csv` file pattern: replicates identically for Barcelona/Berlin
- Daily cadence: timezone-neutral
- STALE/AUTH_FAIL marker pattern: city-agnostic

DATA per-city: the actual values populating these columns, and the languages tracked in `ai-citations.csv` (`el`/`en` for Athens → `ca`/`es`/`en` for Barcelona → `de`/`en` for Berlin).

---

## Default reconciliation

Your "default if no response" needs three changes before S136 runs:
1. Add `gsc_top10_count_7d`, `bing_avg_position_7d`, `bing_top10_count_7d`
2. Drop `ai_citations` column; spec `data/ai-citations.csv` separately (Sprint 5 work — not S136 scope, but the column drop is)
3. Add AUTH_FAIL marker alongside STALE

Everything else as you proposed.

---

## Operator addendum — 2026-05-17 (S136 pivot)

Two operator decisions made during S136 attempt-1, recorded here for completeness:

**1. `top-queries.csv` deferred from S136 to S138.** Reason: Bing Webmaster API doesn't return `{query, page}` jointly the way GSC's query+page-dimensioned call does. Shipping `top-queries.csv` with Bing-only rows and empty `page` field would advertise a column that's half-populated, breaking the file's schema integrity. Defer until S138 lands GSC OAuth path, at which point both engines' rows can populate the full schema.

**2. S136 pivots to Bing-only.** GSC half deferred to S138 OAuth fallback. Reason: Search Console silent-fails on Add user when adding a GCP service account email to the agentathens.com property — reproduced across URL-prefix + Domain property types, both Full and Restricted permissions, with property Owner and GCP project both under `cmarag8@gmail.com`. Service-account path documented as blocked in `docs/known-issues.md`. OAuth user credentials (authenticated as the property Owner) is the workaround, queued as S138.

S136 ships:
- All 8 new columns added (4 GSC, 4 Bing)
- 4 Bing columns populated daily via `scripts/fetch-bing-metrics.ts`
- 4 GSC columns hardcoded to `STALE` with inline comment referencing S138
- `ai_citations_count` column dropped
- `top-queries.csv` deferred to S138

When S138 lands, GSC columns flip from `STALE` to real values; `top-queries.csv` ships as the GEO-specified long-format file. No CSV migration cost — the column shape is already locked.

---

## Draft decisions-log entry

The following block to be copied verbatim into `.claude/notes/decisions.md` during S136 post-session updates:

```markdown
## 2026-05-17 — Search Visibility Log Schema Lock for S136 (GSC + Bing API Automation)

**Context:** S136 wires automated population of GSC + Bing Webmaster API data into
`data/search-visibility-log.csv`. Dev Planner asked for schema-lock confirmation
on 5 proposed new columns before implementation runs. The `ai_citations` column
has been gapping in manual entry, indicating structural mismatch.

**Decision:**
1. **Add 8 columns to `data/search-visibility-log.csv`** (3 beyond Dev Planner's
   5-column proposal): `gsc_impressions_7d`, `gsc_clicks_7d`, `gsc_avg_position_7d`,
   `gsc_top10_count_7d`, `bing_impressions_7d`, `bing_clicks_7d`,
   `bing_avg_position_7d`, `bing_top10_count_7d`. 7-day rolling windows. Daily cadence.
2. **Drop `ai_citations` column from `search-visibility-log.csv`.** Replace with
   separate file `data/ai-citations.csv` (Sprint 5 scope) with schema:
   `timestamp, engine, query, query_lang, query_type, cited_url, position_in_response, source`.
   Weekly cadence.
3. **Separate `data/top-queries.csv` for query-level data** (long format, not CSV columns):
   `timestamp, engine, query, page, impressions_7d, clicks_7d, position_7d`. Daily append,
   top 50 per engine.
4. **API failure semantics:** `STALE` marker for transient failures (auto-recovers);
   `AUTH_FAIL` marker for persistent failures (needs human). Both preserve row structure.

**Reasoning:** Top-10 URL count tracks citation-eligible footprint directly; avg
position is a noisy aggregate. Bing position symmetry matters more than Google
position because Bing's index feeds Copilot and ChatGPT search. Single integer
`ai_citations` measures the wrong thing — total count without query/page attribution
can't drive content priorities. The Edward Sturm grounding-query workflow and the
2026-03-02 grounding-query optimization decision both require per-query granularity,
which a wide-format column can't carry. Daily cadence preserves anomaly detection;
weekly snapshots would hide single-day drops. AUTH_FAIL/STALE split prevents silent
multi-week auth expiry.

**Implementation spec:** Per S136 brief, plus 3 additional columns and the
`ai_citations` column drop. Sprint 5 picks up `data/ai-citations.csv` mechanism
separately.

**S136 pivot (2026-05-17, operator):** S136 ships Bing-only. GSC half deferred to
S138 OAuth fallback session — Search Console silent-fails on Add user when adding
GCP service account email to agentathens.com property (reproduced across
URL-prefix + Domain property types, both Full and Restricted permissions, accounts
verified matched). 4 GSC columns ship hardcoded as `STALE` until S138 lands.
`top-queries.csv` deferred to S138 — Bing API doesn't return query+page jointly,
shipping with Bing-only rows would advertise an empty column.

**Validation:**
- Post-S136: CSV contains 8 new mechanical columns; 4 Bing populated daily; 4 GSC = STALE;
  `ai_citations` column removed; no migration cost (column was mostly empty).
- 14-day check: STALE markers appear and auto-clear for Bing on transient failures;
  AUTH_FAIL surfaces on any Bing token/auth issue.
- 30-day check: bing_top10_count_7d produces non-zero values on at least cornerstone
  pages; if still zero across the board, audit Bing indexing.
- Post-S138: 4 GSC columns flip from STALE to real values; top-queries.csv ships
  with both engine='gsc' and engine='bing' rows.

**Replicability:** SPEC-universal. All column names city-agnostic. The
`ai-citations.csv` separation pattern replicates identically for agent-barcelona
and agent-berlin. DATA per-city: language codes in `query_lang` (el/en →
ca/es/en → de/en).

**Status:** Decided. S136 (Bing-only) cleared to implement with these modifications.
S138 (GSC OAuth fallback) parked, not on Παναθήναια critical path.
```
