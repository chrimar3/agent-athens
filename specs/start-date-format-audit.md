# `start_date` Format Audit

**Date:** 2026-04-21
**Scope:** `events` table, rows with `location_status IN ('verified_athens','pass_through')`
**Purpose:** Scope a future ingestion-fix session. **No fix proposed here.** Do not implement.

---

## 1. Trigger

A GROUP BY on `start_date` fragmented a single calendar day into ~19 groups, because `start_date` is stored as a string in three different shapes. Normalizing with `substr(start_date, 1, 10)` gave plausible daily totals (Apr 21 = 149 events). The raw-value grouping masked this by making each day look sparse.

## 2. Format taxonomy observed

Three shapes coexist in the same column:

| Tag | Shape | Example |
|---|---|---|
| `date-only` | `YYYY-MM-DD` (length 10) | `2026-04-21` |
| `naive-ts` | ISO timestamp, no offset (length ≥ 19) | `2026-04-21T21:00:00` |
| `tz-aware` | ISO timestamp with offset | `2026-04-22T20:00:00+03:00` |

Implication for queries: `date()` / `>=` range comparisons across these shapes are lexicographic and mostly work by luck. Any filter that slices at midnight or compares across DST boundaries is at risk.

## 3. Source × format breakdown

Raw counts from the diagnostic query (in-window set: `verified_athens` + `pass_through`).

| Source | date-only | naive-ts | tz-aware | Total | Notes |
|---|---:|---:|---:|---:|---|
| **athinorama.gr** | 278 | **9090** | 20 | 9388 | Dominant source. Mostly naive-ts; small leaks of the other two. |
| **more.com** | 27 | 344 | 59 | 430 | **All three shapes present.** Highest format entropy per row. |
| **megaron.gr** | 0 | 31 | 31 | 62 | **Exact 50/50 split** → smells like two code paths emitting concurrently. |
| **ticketservices** | 69 | 53 | 0 | 122 | Split date-only vs naive-ts; no tz-aware. |
| residentadvisor | 0 | 276 | 0 | 276 | Consistent (naive-ts). |
| clubber.gr | 0 | 129 | 4 | 133 | Mostly naive-ts; 4 tz-aware outliers. |
| halfnote | 0 | 56 | 0 | 56 | Consistent (naive-ts). |
| snfcc | 16 | 0 | 0 | 16 | Consistent (date-only). |
| ticketservices → already listed | | | | | |
| onassis | 1 | 4 | 0 | 5 | Small sample, mixed. |
| benaki | 1 | 2 | 0 | 3 | Small sample, mixed. |
| eventbrite | 0 | 4 | 0 | 4 | Consistent. |
| manual | 2 | 0 | 1 | 3 | Human-entered — expected inconsistency. |
| devoxx.gr | 1 | 0 | 0 | 1 | Single row. |
| greeksin.ai | 1 | 0 | 0 | 1 | Single row. |
| hackathongreece.ai | 1 | 0 | 0 | 1 | Single row. |
| productledhub.com | 1 | 0 | 0 | 1 | Single row. |

## 4. Findings

1. **Blast radius is concentrated.** `athinorama.gr` alone is ~90% of the dataset. Any fix that normalizes formats at write time ships most of its value through that one scraper.
2. **Three types of inconsistency, not one:**
   - **Mostly-consistent-with-leaks** (athinorama, clubber, residentadvisor-adjacent): a dominant format with a small minority of stragglers. Suggests a fallback path in the parser that triggers on malformed upstream data.
   - **Genuine two-path emitters** (megaron 50/50, more.com 3-way): same source writing multiple formats concurrently. Likely two scrapers or two code branches for the same source name.
   - **Small-sample sources** (benaki, onassis, devoxx, …): not enough rows to distinguish "intentional" from "accidental"; treat as noise for scoping.
3. **Timezone semantics are unresolved.** Only a subset of rows carry `+03:00`. The naive-ts rows are presumably Athens-local, but that's an inference — nothing in the schema enforces it. DST transitions (late-Mar, late-Oct) would be the failure mode to worry about.
4. **Downstream impact already visible.** The original GROUP BY bug (§1) is one observed consequence. Any range filter, dedup key, or ordering that relies on `start_date` as a string is a candidate for silent breakage.

## 5. Suggested scope for the follow-up session

(Scope only — not a fix plan.)

- Start with `megaron.gr` (smallest, cleanest 50/50 smell) to pin down the two-path cause.
- Then `more.com` (all three formats, mid-size).
- Then `athinorama.gr` (largest, most impact).
- Defer small-sample sources until a schema/validator exists — they'll be caught by whatever rule the larger sources land on.
- Open question to resolve before touching scrapers: **what is the canonical on-disk format?** (Naive local? ISO-with-offset? Separate `start_date DATE` + `start_time TIME` columns?) The answer dictates whether this is a write-path fix, a migration, or both.

## 6. Raw diagnostic output

Normalized daily counts (14-day window from 2026-04-21):

```
2026-04-21  149
2026-04-22   17
2026-04-23   21
2026-04-24   52
2026-04-25   48
2026-04-26   16
2026-04-27   12
2026-04-28   12
2026-04-29    9
2026-04-30   15
2026-05-01    8
2026-05-02    9
2026-05-03    1
2026-05-04    2
2026-05-05    4
```

Source × format query: see §3 table.

---

**Status:** Audit only. No code changes. Ingestion investigation deferred to a separate session (Guard 3).
