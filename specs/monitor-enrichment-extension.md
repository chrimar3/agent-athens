# Monitor Enrichment Extension — Spec

**Session:** S91 follow-up (Session A)
**Date:** 2026-04-23
**Target files:** `scripts/monitor-search-visibility.ts`, `data/search-visibility-log.csv`, `tests/monitor-search-visibility.test.ts` (new)

## Why

S91 visibility monitor covers sitemap freshness and IndexNow submission health but does not observe enrichment throughput. Between 2026-04-16 and 2026-04-20 the enrichment pipeline produced zero events for 5 consecutive days without a single signal reaching a human — the daily enrichment-check logged warnings to `logs/enrichment-check.log` but that log has no reader. This extension reuses the S91 CSV (which the user checks every 3-4 days) as the surface for an enrichment staleness marker.

## Verified facts (pre-implementation)

- `events.enriched_at TEXT` column exists and is nullable. Populated by the enrichment pipeline.
- Population verified for the last 10 days (counts: 04-15=61, 04-16=24, 04-20=10, 04-21=29, 04-22=33, 04-23=0). 04-17/18/19 empty — matches the silent-failure window.
- Primary query `SELECT COUNT(*) FROM events WHERE enriched_at > datetime('now','-1 day');` returns 15 at the time of check.
- No fallback to `enrichment_log.created_at` needed.

## Schema change

Current CSV header (18 columns):
```
date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,robots_http,sitemap_http,llms_http,sample_accessible,sample_size,gsc_indexed,bing_indexed,ai_citations_count,notes
```

Proposed header (19 columns):
```
date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,robots_http,sitemap_http,llms_http,sample_accessible,sample_size,gsc_indexed,bing_indexed,ai_citations_count,enriched_last_24h,notes
```

`enriched_last_24h` is inserted **before** `notes` (column index 17, 0-based). `notes` stays last to preserve its role as the free-text column.

## Migration

Historical CSV rows have 18 columns. On first run after ship, detect old header and migrate:

1. Read existing file.
2. If first line == old header (18 cols) → rewrite with new header and insert empty field at position 17 of every data row.
3. Write migrated content to `data/search-visibility-log.csv.tmp`, then `renameSync` atomically to `data/search-visibility-log.csv`. Atomic swap prevents partial-write corruption.
4. If migration fails → catch, log, append today's row to whatever state the CSV is in (never throw — observability must not kill production).

Subsequent runs see new header → no-op.

## Value semantics

- **Normal:** integer count from the DB query.
- **STALE:** literal string `STALE_ENRICHMENT` when both today's count is 0 AND the most recent prior row (different date) also has `enriched_last_24h = 0`. Two consecutive zero-days = trigger.
- **Error:** empty string `''` when DB access throws. Never propagates.

Matches the existing type-overloading pattern of `indexnow_submitted` / `indexnow_success` / `indexnow_batches` (line 74 of the monitor script).

## Known non-coverage

If the enrichment queue legitimately empties — all pending events enriched, no new imports for 2+ days — `STALE_ENRICHMENT` false-positives. Current queue depth is 519+ pending (per 04-22 enrichment-check), so this scenario is not reachable in practice. If queue depth drops below 48h of throughput (~180 events), revisit with queue-aware logic (e.g. `AND queue_size > 0` gate).

## Alert class: PASSIVE

This marker lands in a CSV the user checks every 3-4 days. Strictly better than a warning buried in `logs/enrichment-check.log` that nobody reads, but it is not an active alert. Weekend silent-failure windows remain a known gap until an active-alert path ships (separate session, gated on the gap biting again).

## Implementation sketch

```typescript
import { Database } from 'bun:sqlite';
import { renameSync } from 'fs';

interface EnrichmentStats {
  enrichedLast24h: number | string;
}

function getEnrichmentStats(): EnrichmentStats {
  try {
    const db = new Database(join(PROJECT_DIR, 'data/events.db'), { readonly: true });
    const row = db.query<{ c: number }, []>(
      "SELECT COUNT(*) as c FROM events WHERE enriched_at > datetime('now','-1 day');"
    ).get();
    db.close();
    const count = row?.c ?? 0;

    const todayStr = athensDate();
    const priorRow = lastRowBefore(todayStr);
    const priorEnrich = priorRow?.[17];  // column index 17 = enriched_last_24h
    const priorWasZero = priorEnrich === '0';

    if (count === 0 && priorWasZero) return { enrichedLast24h: 'STALE_ENRICHMENT' };
    return { enrichedLast24h: count };
  } catch {
    return { enrichedLast24h: '' };
  }
}

function lastRowBefore(today: string): string[] | null {
  try {
    if (!existsSync(CSV_PATH)) return null;
    const lines = readFileSync(CSV_PATH, 'utf-8').trim().split('\n').slice(1);
    for (let i = lines.length - 1; i >= 0; i--) {
      const fields = lines[i].split(',');
      if (fields[0] !== today) return fields;
    }
    return null;
  } catch {
    return null;
  }
}

function migrateCsvIfNeeded(): void {
  if (!existsSync(CSV_PATH)) {
    writeFileSync(CSV_PATH, CSV_HEADER + '\n');
    return;
  }
  try {
    const content = readFileSync(CSV_PATH, 'utf-8');
    const firstNewline = content.indexOf('\n');
    const existingHeader = content.slice(0, firstNewline);
    if (existingHeader === CSV_HEADER) return;

    const oldCols = existingHeader.split(',').length;
    const newCols = CSV_HEADER.split(',').length;
    if (newCols - oldCols !== 1) return;  // only handle the 18→19 case

    const rest = content.slice(firstNewline + 1);
    const migratedLines = rest.split('\n').map(line => {
      if (line.length === 0) return line;
      const fields = line.split(',');
      if (fields.length !== oldCols) return line;  // skip malformed
      fields.splice(oldCols - 1, 0, '');  // insert blank before notes
      return fields.join(',');
    });
    const tmpPath = CSV_PATH + '.tmp';
    writeFileSync(tmpPath, CSV_HEADER + '\n' + migratedLines.join('\n'));
    renameSync(tmpPath, CSV_PATH);
  } catch {
    // never throw — observability must not kill production
  }
}
```

Row assembly in `main()` inserts `enrichmentStats.enrichedLast24h` at position 17 (before trailing `''` notes cell). `migrateCsvIfNeeded()` replaces the current `if (!existsSync(CSV_PATH))` block at line 192.

## Tests (all in `tests/monitor-search-visibility.test.ts`)

1. `getEnrichmentStats` returns integer when DB has rows in last 24h.
2. `getEnrichmentStats` returns `0` (not STALE) when DB has no rows AND no prior CSV row with 0.
3. `getEnrichmentStats` returns `'STALE_ENRICHMENT'` when DB has 0 AND prior row's `enriched_last_24h` is `'0'`.
4. `getEnrichmentStats` returns `''` when DB query throws (simulate by pointing at missing file or mocking).
5. `migrateCsvIfNeeded` leaves a new-format CSV untouched.
6. `migrateCsvIfNeeded` migrates an 18-col header + rows to 19-col, with empty field inserted before `notes`.
7. `migrateCsvIfNeeded` creates a fresh file with new header when no CSV exists.
8. Column count invariant: after a full run, header and every data row have exactly 19 comma-separated fields.

Tests use a temp CSV path (not production) via env var or constructor injection.

## Boundary

**Touch:** `scripts/monitor-search-visibility.ts`, `tests/monitor-search-visibility.test.ts`, `data/search-visibility-log.csv` (migration on first run).
**Do not touch:** `scripts/auto-enrich.sh`, `scripts/run-enrichment-pipeline.ts`, `src/enrichment/*`, any plist, any other monitor.
