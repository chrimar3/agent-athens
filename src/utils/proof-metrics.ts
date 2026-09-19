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
 *   - indexing:  data/search-visibility-log.csv (latest fresh row, Bing 7d columns only)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DateTime } from 'luxon';

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
  now?: DateTime;
}

export function proofMetrics({ pageableCount, dataDir, now = DateTime.now() }: ProofMetricsOptions): ProofMetrics {
  const dir = dataDir ?? join(PROJECT_DIR, 'data');

  return {
    eventCount: pageableCount,
    tests: readTestSummary(join(dir, 'test-summary.json')),
    schema: readSchemaCompleteness(join(dir, 'build-completeness.json')),
    indexing: readLatestIndexingRow(join(dir, 'search-visibility-log.csv'), now),
  };
}

function readArtifact(path: string): any {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}
const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validStamp = (value: unknown): value is string => typeof value === 'string' && DateTime.fromISO(value).isValid;

function readTestSummary(path: string): TestSummary | '—' {
  if (!existsSync(path)) return '—';
  const raw = readArtifact(path);
  if (!raw || ![raw.pass, raw.skip, raw.fail, raw.expects, raw.files].every(validCount) || !validStamp(raw.ranAt)) return '—';
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
  const raw = readArtifact(path);
  if (!raw || typeof raw !== 'object') return { passClean: null, validatedAt: '—' };
  const byType = raw.events?.byType;
  const failAggregates: unknown[] = [
    ...(Array.isArray(byType) && byType.length ? byType.map((t: any) => t?.fail) : [undefined]),
    raw.hubs?.fail, raw.venues?.fail,
    raw.aria?.hub_template?.fail, raw.aria?.event_template?.fail,
    raw.place?.venue_template?.fail, raw.place?.event_template?.fail,
  ];
  const validatedAt = validStamp(raw.meta?.lastUpdate) ? raw.meta.lastUpdate : '—';
  // A known failure remains a failure; incomplete evidence can never mean success.
  const passClean = failAggregates.some(n => validCount(n) && n > 0) ? false
    : validatedAt !== '—' && failAggregates.every(validCount) ? true : null;
  return { passClean, validatedAt };
}

// Keep the existing Bing-only proof contract. The monitor records other sources
// separately. A missing, invalid or old latest row is honest absence; never
// substitute an earlier row or a different measurement population.
function readLatestIndexingRow(path: string, now: DateTime): IndexingSummary | '—' {
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

  const date = DateTime.fromISO(col('date'), { zone: 'Europe/Athens' });
  const age = now.setZone('Europe/Athens').startOf('day').diff(date.startOf('day'), 'days').days;
  if (!date.isValid || age < 0 || age > 1) return '—';

  const impressions7d = numOrNaN(col('bing_impressions_7d'));
  const avgPosition7d = numOrNaN(col('bing_avg_position_7d'));
  const top10_7d = numOrNaN(col('bing_top10_count_7d'));

  if (!validCount(impressions7d) || !Number.isFinite(avgPosition7d) || avgPosition7d < 0 || !validCount(top10_7d)) {
    return '—';
  }

  return {
    bing: { impressions7d, avgPosition7d, top10_7d },
    status: 'underway',
  };
}
