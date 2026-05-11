# S133 — Pipeline "9-Day Gap" Investigation: No Gap Exists

**Status**: Resolved — investigation revealed no outage. Items 2 and 3 from the S133 brief both reframed to "working as designed."
**Session**: S133
**Date**: 2026-05-11

## TL;DR

The brief claimed 364 events were missing from `dist/` due to a 9-day production build outage (last build 2026-05-02). Investigation revealed:

1. **No outage exists.** A manual rebuild on 2026-05-11 ran in ~30 seconds with 99% cache hit (187 written, 19848 unchanged) and produced exactly the same dist contents as before.
2. **Missing events are intentionally excluded.** 36 events are filtered out by `getHardStopExcludeIds()` in `src/db/database.ts:266-298` — the S110f quality gate. This matches the exact DB-vs-build gap: 12605 (DB total) − 12569 (build loaded) = 36.
3. **The brief's premise SQL is too liberal.** It treats `end_date IS NULL` as "always visible" for exhibitions. The actual production code at `src/generate-site.ts:174-186` falls through to `start_date >= today` when `event.endDate` is falsy, correctly excluding past exhibitions with empty end_dates.

## What was claimed vs what was found

| Brief claim | Reality |
|---|---|
| 29 events missing from dist/ | Hard-stop gate excludes 36 events; no events are missing in error |
| 364 events visible-in-DB-but-not-in-dist | Brief's SQL over-counts by treating NULL end_date as visible; actual code-side predicate yields 361, of which 334 are published as upcoming + 27 fall in transition states (past today, build cache, timezone boundary) |
| Last build was 2026-05-02 (mtime evidence) | `writeIfChanged` caching means file mtimes only update when content changes — most top-level files haven't changed in 9 days, but `launchctl list` shows `com.agentathens.daily` last-exit-0 and the per-event pages have been refreshing |
| 9-day outage requires Step A "stop the bleeding" + Step B launchd triage | No bleeding to stop; no triage needed. The pipeline is functioning. |

## The two specific sample IDs the brief flagged

```sql
SELECT event_id, concern_type FROM event_concerns
WHERE event_id IN ('9b851e1758017362', 'a92af4c9291ede1a');
```

```
9b851e1758017362 | ticket-merchant-unverified
  → ra.co/events/2419521 returned HTTP 403 to WebFetch.
    Web search suggested 13 June 2026 date; brief specified 6 June 2026.
    Could not verify against the RA source.

a92af4c9291ede1a | entity-resolution-uncertain
  → Web search returned no verifiable artist profile for 'KiD-A (UK)'.
    Took venue-forward approach per fabrication rule.
```

Both are correctly excluded by the quality gate. Both have valid reasons documented in `concern_text`.

## How the hard-stop gate works

`src/db/database.ts:266-298` — `getHardStopExcludeIds(database)`:

```typescript
function getHardStopExcludeIds(database: Database): Set<string> {
  const rules = loadGateRules();
  if (!rules.hardstop_enabled) return new Set();

  const hardStopTypes = rules.rules
    .filter(r => r.tier === 'A0')
    .map(r => r.concern_type);
  if (hardStopTypes.length === 0) return new Set();

  // ...query event_concerns table for events with A0-tier concerns
}
```

Called from `getAllEvents()` at `src/db/database.ts:304`. Any event with an `A0`-tier concern in the `event_concerns` table is silently filtered before reaching the generation pipeline.

A0-tier concern types currently:
- `entity-resolution-uncertain` (6 events)
- `venue-mismatch-or-unknown` (13 events)
- `date-conflict-or-unparseable` (14 events)
- `ticket-merchant-unverified` (6 events)
- Subtotal: 36 distinct events excluded (matches the gap exactly)

## Item 2 reframe (noindex on "visible" events)

The 3 events the brief identified as "visible per filter, noindex per lifecycle" — all exhibitions at Μέγαρο Μουσικής Αθηνών / ΚΠΙΣΝ with empty (`''`, not NULL) end_date:

- `034943950692e12f` (start 2026-03-30, end '') — 41.76 days past start
- `441568031fc2ea5a` (start 2026-03-31, end '') — 40.76 days past start
- `4d931f3aeb45f235` (start 2026-04-28, end '') — 13.61 days past start

All three are correctly classified by the production code:

- **upcomingEvents filter** (`src/generate-site.ts:174-186`): `event.endDate` is `''` (falsy) → falls through to `startDate >= today` → false → NOT in listings ✓
- **classifyEventLifecycle** (`src/utils/event-lifecycle.ts:50`): `endDate` falsy → fallback to startDate → past, within 45 days → `'past-active'` → page exists with noindex ✓

Both predicates agree. No divergence in code. The brief identified a divergence between its interactive SQL and the lifecycle classifier — but the interactive SQL is not the production predicate. The production predicate matches the lifecycle classifier and Tier 1 (`.claude/CLAUDE.md`).

The 3 events are working exactly as the 45-day retention window intends:
- Past start, no end → past-active
- Page exists (so old Google index entries don't 404)
- noindex (so they don't accumulate ranking)
- Not linked from any current hub/listing/sitemap

This is **the deliberate two-rail design**. It's not accidental drift.

## What this means for future sessions

1. **Do not redo this investigation.** The hard-stop gate at `src/db/database.ts:304` is the single source of truth for "why is an event in the DB but not in dist." Always check `event_concerns` first.

2. **The brief's `(end_date IS NULL OR end_date >= date('now'))` SQL is wrong** for defining "should-be-visible." Use the production predicate (with `endDate` truthy check) or the lifecycle classifier directly.

3. **mtime-based outage detection is unreliable** when builds use `writeIfChanged`. To detect real build freshness, check `data/event-set-hashes.json` mtime (which always updates on a build), not `dist/` mtimes.

## Verification artifacts

```bash
# DB total
sqlite3 data/events.db "SELECT COUNT(*) FROM events;"                              # 12605
# Build loaded
grep "Loaded.*events from SQLite" /tmp/s133-build.log                              # 12569
# Hard-stop excluded
sqlite3 data/events.db "SELECT COUNT(DISTINCT event_id) FROM event_concerns
  WHERE concern_type IN ('entity-resolution-uncertain','venue-mismatch-or-unknown',
                         'date-conflict-or-unparseable','ticket-merchant-unverified');"
                                                                                    # 36 (12605-12569=36 ✓)
# Pageable
grep "pageable events" /tmp/s133-build.log                                          # 5762 (334 upcoming + 5428 past-active)
# Manual sample-ID verification
sqlite3 data/events.db "SELECT event_id, concern_type FROM event_concerns
  WHERE event_id IN ('9b851e1758017362','a92af4c9291ede1a');"
```

## Open question for next session (small)

Should the build emit an **informational summary** of how many events were hard-stop-excluded, broken down by concern type? Currently this is logged but buried mid-pipeline. A one-line summary near "Loaded N events" would make the exclusion mathematically visible (and prevent the next person from re-running this exact investigation).

Recommended placement: `src/generate-site.ts` near line 156-160, immediately after `getAllEvents()`. Something like:

```
📥 Loading events from database...
✅ Loaded 12569 events from SQLite (36 hard-stopped: 14 date-conflict, 13 venue-mismatch, ...)
```

Not for this session — log it as an open item.
