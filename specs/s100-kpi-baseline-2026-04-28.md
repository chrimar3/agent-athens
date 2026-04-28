# S100 KPI Pre-Amplification Baseline

**Captured:** 2026-04-28 (S100 land date, before any S101 cornerstone work)
**Path:** Path B (minimum viable checkpoint) — schema + seeded prompts + honest baseline. Automated importers (GSC, GA4, server-log) deferred to S100b pending Google Cloud auth setup.

This baseline is the **watchdog-floor analog for the citation arc.** Without it, "first citation appeared on May X" becomes ambiguous between "first citation ever" and "first citation we noticed." The honest empty-state IS the deliverable.

---

## Manual citation log

```
sqlite3 data/kpi.db "SELECT COUNT(*) AS rows, SUM(cited) AS cited, COUNT(DISTINCT prompt_id) AS prompts, COUNT(DISTINCT engine) AS engines FROM manual_citation_log;"
```

| Metric | Value |
|---|---|
| Total observations | 0 |
| Cited (cited=1) | 0 |
| Distinct prompts logged | 0 of 5 seeded |
| Distinct engines logged | 0 of 4 |

**First weekly logging session scheduled:** Friday 2026-05-01 (per `docs/kpi-manual-logging-template.md`). Cadence: weekly Fridays. ~10 min × 4 weeks pre-I/O (May 19) = ~80 observations before the comparison window.

---

## BWT AI Performance (3M window 2026-01-28 → 2026-04-28)

Operator-verified Apr 28 screenshot.

| Metric | Value |
|---|---|
| Total Citations | 0 |
| Avg. Cited Pages | 0 |
| Grounding Queries imported into `bwt_grounding_queries` | 0 rows |
| Pages imported into `bwt_ai_citations` | 0 rows |

**Importer status:** scaffold deferred to S100b. CSV download workflow documented in `docs/kpi-setup.md` § 1.

**First non-zero citation event:** must be timestamped immediately when observed. It's the watchdog-floor crossing.

---

## GSC long-query — n/a (auth pending — S100b)

```
sqlite3 data/kpi.db "SELECT COUNT(*) FROM gsc_queries_long;"
# 0 rows
```

| Metric | Value |
|---|---|
| Long-query rows imported | n/a (auth pending — S100b) |
| Total GSC rows imported | n/a (auth pending — S100b) |
| Long-query share | n/a (auth pending — S100b) |

**S91's `data/search-visibility-log.csv`** has aggregate `gsc_indexed` counts (manually entered via `--gsc-indexed=` flag), but those don't decompose into per-query rows. The GSC API importer in S100b will populate `gsc_queries_long` directly from the API.

---

## GA4 AI-referral sessions (last 30 days) — n/a (auth pending — S100b)

```
sqlite3 data/kpi.db "SELECT referrer_engine, SUM(sessions) FROM ga4_ai_referrals GROUP BY referrer_engine;"
# 0 rows
```

| Engine | Sessions (last 30d) |
|---|---|
| ChatGPT | n/a (auth pending — S100b) |
| Perplexity | n/a (auth pending — S100b) |
| Gemini | n/a (auth pending — S100b) |
| Copilot | n/a (auth pending — S100b) |
| Claude | n/a (auth pending — S100b) |

**Expected baseline state:** zero or near-zero referral sessions from AI engines. This matches BWT and is the correct pre-amplification floor.

---

## Server logs AI-bot fetches (last 30 days) — n/a (auth pending — S100b)

```
sqlite3 data/kpi.db "SELECT bot_name, COUNT(*) FROM server_log_ai_bots GROUP BY bot_name ORDER BY 2 DESC;"
# 0 rows
```

| Bot | Fetches (last 30d) |
|---|---|
| Bingbot | n/a (manual CSV import pending — S100b) |
| GPTBot | n/a |
| ClaudeBot | n/a |
| PerplexityBot | n/a |
| OAI-SearchBot | n/a |
| Google-Extended | n/a |
| Applebot-Extended | n/a |
| CCBot | n/a |

**Expected baseline state:** Bingbot non-zero (constant crawler), AI-specific bots near-zero. The S100b manual-CSV importer will populate from a Netlify dashboard export.

⚠️ Zero AI-bot fetches in 30 days **is itself a finding** — captures that the domain's AI-bot visibility is at the floor. This is the pre-amplification baseline GEO will reference post-I/O.

---

## Cornerstone state at baseline

| Cornerstone | Schema state | Editorial state | First S101 land target |
|---|---|---|---|
| `/this-weekend` | pre-S101 (current; CollectionPage primary verified S100a) | pre-rewrite | this week (S101a) |
| `/today` | pre-S101 (CollectionPage primary verified S100a) | pre-rewrite | next week (S101b) |
| `/open` | pre-S101 (CollectionPage primary verified S100a) | pre-rewrite | next week (S101c) |
| `/this-week` | pre-S101 (CollectionPage primary verified S100a) | pre-rewrite | week of May 12 (S101d) |
| `/<month>-2026` (e.g. `/exhibitions`) | pre-S101 (CollectionPage primary verified S100a sample) | pre-rewrite | post-I/O |

**Schema verification:** S100a audit (commit `b24937bc2`) confirmed Class 0 (clean) — 0 misclassified primary @type across 200 events / 49 venues / 51 hubs / 7 cornerstones / 2 home. Cornerstones currently emit CollectionPage as primary block correctly.

---

## Re-evaluation criteria (post-I/O, ~2026-05-20)

Targets are deliberate signal-anchors, not aggressive growth metrics. The first-citation event is the binary hit.

| Metric | Target | Source |
|---|---|---|
| BWT Total Citations | ≥1 (any non-zero is signal) | Manual CSV |
| Manual citation log | ≥1 cited observation across 4 engines × 5 prompts × 3 weekly logs = 60 cells | `manual_citation_log` |
| AI-bot fetches | PerplexityBot or OAI-SearchBot non-zero in 30 days | `server_log_ai_bots` (post-S100b) |
| GA4 AI-referral sessions | Non-zero from any of 5 engines | `ga4_ai_referrals` (post-S100b) |
| GSC long-query | ≥10 long-query rows that match an `expected_lead_engines` page | `gsc_queries_long` (post-S100b) |

---

## Triggers for follow-up sessions

| Condition | Action |
|---|---|
| Zero non-zero deltas by 2026-05-26 (1 week post-I/O) | Investigate prompt selection (P5 first per GEO's flag); schema completeness; IndexNow re-submission cadence. May warrant prompt rotation. |
| Citations land but rank 4+ | Cornerstone amplification not enough; investigate cornerstone-to-cornerstone internal linking (S102 territory). |
| One engine dominates | Rebalance Editorial sequence to align with engine affinity. |
| Recovery-asymmetry diagnostic (S97a known-issues entry) becomes relevant during BWT data review | If kpi.db data shows volume but rank consistently weak, the issue may be content-side (Editorial), not infra. |

---

## Out-of-scope of this baseline (deferred to S100b)

- GSC importer + first 30-day pull
- GA4 importer + first 7-day pull
- Server-log importer + first 30-day Netlify dashboard CSV import
- Weekly digest report (`scripts/kpi-report.ts`) — deferred because most sections would print "n/a (auth pending)" until S100b lands

---

## Update protocol

This file is **read-only after S100 land**. Updates to the watchdog-era observation results go in:

- `manual_citation_log` rows themselves (GEO Strategist's weekly logs)
- `decisions.md` post-I/O retro entry
- `docs/known-issues.md` if any criterion crosses a trigger condition
- A new `specs/s100-kpi-amplification-results.md` if a follow-up session writes a structured retro
