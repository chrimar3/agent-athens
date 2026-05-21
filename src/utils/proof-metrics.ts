/**
 * proofMetrics — anti-drift reader for the /proof credibility page.
 *
 * Reads live build artifacts and returns grounded numbers. Never carries a default
 * for a missing source — missing artifact → that field renders as '—' so the page
 * is honest-as-of-snapshot, not falsely confident.
 *
 * Sources:
 *   - eventCount: passed in (the only correct denominator is pageableEvents.length
 *     in generate-site.ts; the raw `location_status IN (...)` SQL is the 11,643 trap)
 *   - schema:    data/build-completeness.json
 *   - tests:     data/test-summary.json (regenerated pre-deploy by scripts/snapshot-test-count.ts)
 *   - indexing:  data/search-visibility-log.csv (last row, Bing 7d cols only — GSC is STALE)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = join(import.meta.dir, '..', '..');

export interface TestSummary {
  pass: number;
  skip: number;
  fail: number;
  expects: number;
  files: number;
  ranAt: string;
}

export interface IndexingSummary {
  bing: {
    impressions7d: number;
    avgPosition7d: number;
    top10_7d: number;
  };
  status: 'underway';
}

export interface ProofMetrics {
  eventCount: number;
  tests: TestSummary | '—';
  schema: { passClean: boolean | null; validatedAt: string };
  indexing: IndexingSummary | '—';
}

export interface ProofMetricsOptions {
  pageableCount: number;
  dataDir?: string;
}

export function proofMetrics({ pageableCount, dataDir }: ProofMetricsOptions): ProofMetrics {
  const dir = dataDir ?? join(PROJECT_DIR, 'data');

  return {
    eventCount: pageableCount,
    tests: readTestSummary(join(dir, 'test-summary.json')),
    schema: readSchemaCompleteness(join(dir, 'build-completeness.json')),
    indexing: readLatestIndexingRow(join(dir, 'search-visibility-log.csv')),
  };
}

function readTestSummary(path: string): TestSummary | '—' {
  if (!existsSync(path)) return '—';
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  return {
    pass: raw.pass,
    skip: raw.skip,
    fail: raw.fail,
    expects: raw.expects,
    files: raw.files,
    ranAt: raw.ranAt,
  };
}

function readSchemaCompleteness(path: string): { passClean: boolean | null; validatedAt: string } {
  if (!existsSync(path)) return { passClean: null, validatedAt: '—' };
  const raw = JSON.parse(readFileSync(path, 'utf-8'));

  // passClean: includes EVERY grounded fail aggregate. Step 0 jq (2026-05-22)
  // confirmed all of: events.byType[].fail, hubs.fail, venues.fail,
  // aria.{hub,event}_template.fail, place.{venue,event}_template.fail.
  // Excluding any of these would silently flip true when a real fail exists
  // (e.g. aria.hub_template.fail today is non-zero — that's a real signal).
  const failAggregates: number[] = [
    ...((raw.events?.byType ?? []) as Array<{ fail?: number }>).map(t => Number(t.fail ?? 0)),
    Number(raw.hubs?.fail ?? 0),
    Number(raw.venues?.fail ?? 0),
    Number(raw.aria?.hub_template?.fail ?? 0),
    Number(raw.aria?.event_template?.fail ?? 0),
    Number(raw.place?.venue_template?.fail ?? 0),
    Number(raw.place?.event_template?.fail ?? 0),
  ];
  const passClean = failAggregates.every(n => n === 0);

  return {
    passClean,
    validatedAt: raw.meta?.lastUpdate ?? '—',
  };
}

// Bing-only per D2 ruling. GSC indexed-count cols have been STALE since 2026-05-17;
// quoting any GSC number would mislead. The reader reads ONLY the four Bing 7d
// fields and emits a status sentinel of 'underway'. If any Bing cell is empty/NaN
// or the file is missing, return '—' (honest-absence; never fall back to a prior
// row). Drift-guard: nothing in the returned object should match /gsc/i.
function readLatestIndexingRow(path: string): IndexingSummary | '—' {
  if (!existsSync(path)) return '—';
  const text = readFileSync(path, 'utf-8').trimEnd();
  const lines = text.split('\n');
  if (lines.length < 2) return '—';

  const header = lines[0].split(',');
  const lastRow = lines[lines.length - 1].split(',');

  const col = (name: string) => {
    const i = header.indexOf(name);
    return i === -1 ? '' : (lastRow[i] ?? '');
  };
  // Empty string must NOT coerce to 0 — Number("") === 0 in JS, which would let
  // empty Bing cells silently render as valid zeros. Treat empty/whitespace as NaN.
  const numOrNaN = (s: string) => {
    if (s.trim() === '') return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  if (!col('date')) return '—';

  const impressions7d = numOrNaN(col('bing_impressions_7d'));
  const avgPosition7d = numOrNaN(col('bing_avg_position_7d'));
  const top10_7d = numOrNaN(col('bing_top10_count_7d'));

  if (!Number.isFinite(impressions7d) || !Number.isFinite(avgPosition7d) || !Number.isFinite(top10_7d)) {
    return '—';
  }

  return {
    bing: { impressions7d, avgPosition7d, top10_7d },
    status: 'underway',
  };
}
