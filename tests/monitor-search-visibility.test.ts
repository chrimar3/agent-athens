/**
 * Tests for scripts/monitor-search-visibility.ts (post-S136 27-col shape)
 *
 * Covers:
 * - CSV_HEADER is 27 cols with gsc_*_7d at 16-19, bing_*_7d at 20-23
 * - getEnrichmentStats() emits integer / STALE_ENRICHMENT / '' (ENRICHED_COL_INDEX=24)
 * - lastRowBefore() scans CSV backwards for most recent date != today
 * - getWrapperDiscrepancyStats() with WRAPPER_DISCREPANCY_COL_INDEX=25
 * - updateTodayRowManualMetrics() patches gsc_indexed (14) + bing_indexed (15) only
 * - getBingMetrics() reads logs/bing-latest.json with STALE / AUTH_FAIL semantics
 * - migrateCsvIfNeeded() is a no-op on the current 27-col shape
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import {
  CSV_HEADER,
  getEnrichmentStats,
  lastRowBefore,
  migrateCsvIfNeeded,
  getWrapperDiscrepancyStats,
  lastTwoRowsBefore,
  yesterdayAthensDate,
  countMisreportsInLog,
  updateTodayRowManualMetrics,
  getBingMetrics,
} from '../scripts/monitor-search-visibility';

const TMP_DIR = join(import.meta.dir, 'tmp/monitor-search-visibility');
const TMP_CSV = join(TMP_DIR, 'test.csv');
const TMP_DB = join(TMP_DIR, 'test.db');
const TMP_BING = join(TMP_DIR, 'bing-latest.json');
const MISSING_DB = join(TMP_DIR, 'does-not-exist.db');

// Standard 27-col row template. Adjust trailing fields (enriched, wrapper, notes)
// per test. Cols 16-23 are the new gsc/bing 7d aggregates (empty here unless test
// explicitly populates them).
function row27(date: string, opts: { enriched?: string | number; wrapper?: string | number; notes?: string } = {}): string {
  const enriched = opts.enriched ?? '';
  const wrapper = opts.wrapper ?? '';
  const notes = opts.notes ?? '';
  return [
    date, 1, 2, 3, 6,           // 0-4
    10, 10, 1, 't',              // 5-8
    200, 200, 200,               // 9-11
    10, 10,                      // 12-13
    0, 0,                        // 14-15 gsc_indexed, bing_indexed
    '', '', '', '',              // 16-19 gsc_*_7d
    '', '', '', '',              // 20-23 bing_*_7d
    enriched, wrapper,           // 24-25
    notes,                       // 26
  ].join(',');
}

function setupEventsDb(path: string, enrichedAtValues: (string | null)[]): void {
  if (existsSync(path)) unlinkSync(path);
  const db = new Database(path);
  db.run(`CREATE TABLE events (id TEXT PRIMARY KEY, enriched_at TEXT)`);
  const insert = db.prepare(`INSERT INTO events (id, enriched_at) VALUES (?, ?)`);
  enrichedAtValues.forEach((v, i) => insert.run(`event-${i}`, v));
  db.close();
}

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  if (existsSync(TMP_CSV)) unlinkSync(TMP_CSV);
  if (existsSync(TMP_CSV + '.tmp')) unlinkSync(TMP_CSV + '.tmp');
  if (existsSync(TMP_DB)) unlinkSync(TMP_DB);
  if (existsSync(TMP_BING)) unlinkSync(TMP_BING);
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('CSV_HEADER', () => {
  test('is 27 cols with S136 shape (gsc_*_7d at 16-19, bing_*_7d at 20-23)', () => {
    const cols = CSV_HEADER.split(',');
    expect(cols.length).toBe(27);
    expect(cols[14]).toBe('gsc_indexed');
    expect(cols[15]).toBe('bing_indexed');
    expect(cols[16]).toBe('gsc_impressions_7d');
    expect(cols[19]).toBe('gsc_top10_count_7d');
    expect(cols[20]).toBe('bing_impressions_7d');
    expect(cols[23]).toBe('bing_top10_count_7d');
    expect(cols[24]).toBe('enriched_last_24h');
    expect(cols[25]).toBe('wrapper_discrepancy_last_24h');
    expect(cols[26]).toBe('notes');
    expect(cols).not.toContain('ai_citations_count');
  });
});

describe('lastRowBefore', () => {
  test('returns null when CSV missing', () => {
    expect(lastRowBefore('2026-04-23', TMP_CSV)).toBeNull();
  });

  test('returns null when CSV has only header', () => {
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    expect(lastRowBefore('2026-04-23', TMP_CSV)).toBeNull();
  });

  test('returns the most recent row with date != today', () => {
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' +
        row27('2026-04-21', { enriched: 5 }) + '\n' +
        row27('2026-04-22', { enriched: 0 }) + '\n' +
        row27('2026-04-23', { enriched: 0 }) + '\n',
    );
    const row = lastRowBefore('2026-04-23', TMP_CSV);
    expect(row).not.toBeNull();
    expect(row![0]).toBe('2026-04-22');
    expect(row![24]).toBe('0'); // enriched_last_24h at new idx 24
  });

  test('skips today even if only row', () => {
    writeFileSync(TMP_CSV, CSV_HEADER + '\n' + row27('2026-04-23') + '\n');
    expect(lastRowBefore('2026-04-23', TMP_CSV)).toBeNull();
  });
});

describe('getEnrichmentStats', () => {
  test('returns integer count when DB has rows in last 24h', () => {
    setupEventsDb(TMP_DB, [
      new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
      new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // excluded
    ]);
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const stats = getEnrichmentStats('2026-04-23', TMP_DB, TMP_CSV);
    expect(stats.enrichedLast24h).toBe(2);
  });

  test('returns 0 (not STALE) when DB empty and no prior row exists', () => {
    setupEventsDb(TMP_DB, []);
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const stats = getEnrichmentStats('2026-04-23', TMP_DB, TMP_CSV);
    expect(stats.enrichedLast24h).toBe(0);
  });

  test('returns STALE_ENRICHMENT when DB empty and prior row had 0', () => {
    setupEventsDb(TMP_DB, []);
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' + row27('2026-04-22', { enriched: 0 }) + '\n',
    );
    const stats = getEnrichmentStats('2026-04-23', TMP_DB, TMP_CSV);
    expect(stats.enrichedLast24h).toBe('STALE_ENRICHMENT');
  });

  test('returns 0 (not STALE) when DB empty but prior row had nonzero', () => {
    setupEventsDb(TMP_DB, []);
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' + row27('2026-04-22', { enriched: 33 }) + '\n',
    );
    const stats = getEnrichmentStats('2026-04-23', TMP_DB, TMP_CSV);
    expect(stats.enrichedLast24h).toBe(0);
  });

  test('returns empty string when DB path is missing', () => {
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const stats = getEnrichmentStats('2026-04-23', MISSING_DB, TMP_CSV);
    expect(stats.enrichedLast24h).toBe('');
  });

  test('works against a WAL-mode DB (regression — readonly:true breaks WAL open)', () => {
    const db = new Database(TMP_DB);
    db.run(`PRAGMA journal_mode=WAL`);
    db.run(`CREATE TABLE events (id TEXT PRIMARY KEY, enriched_at TEXT)`);
    const now = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString();
    db.run(`INSERT INTO events (id, enriched_at) VALUES (?, ?)`, ['evt', now]);
    db.close();
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const stats = getEnrichmentStats('2026-04-23', TMP_DB, TMP_CSV);
    expect(stats.enrichedLast24h).toBe(1);
  });
});

describe('migrateCsvIfNeeded', () => {
  test('creates fresh CSV with new 27-col header when file missing', () => {
    migrateCsvIfNeeded(TMP_CSV);
    expect(existsSync(TMP_CSV)).toBe(true);
    expect(readFileSync(TMP_CSV, 'utf-8')).toBe(CSV_HEADER + '\n');
    expect(CSV_HEADER.split(',').length).toBe(27);
  });

  test('is a no-op when CSV already has new 27-col header', () => {
    const content = CSV_HEADER + '\n' + row27('2026-04-22', { enriched: 33 }) + '\n';
    writeFileSync(TMP_CSV, content);
    migrateCsvIfNeeded(TMP_CSV);
    expect(readFileSync(TMP_CSV, 'utf-8')).toBe(content);
  });

  test('leaves tmp file removed after no-op run', () => {
    writeFileSync(TMP_CSV, CSV_HEADER + '\n' + row27('2026-04-22') + '\n');
    migrateCsvIfNeeded(TMP_CSV);
    expect(existsSync(TMP_CSV + '.tmp')).toBe(false);
  });
});

describe('column count invariant', () => {
  test('appending a fresh row to header-only CSV yields 27 cols throughout', () => {
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const appended = readFileSync(TMP_CSV, 'utf-8') + row27('2026-04-23', { enriched: 15, wrapper: 0 }) + '\n';
    writeFileSync(TMP_CSV, appended);
    const lines = readFileSync(TMP_CSV, 'utf-8').split('\n');
    for (const line of lines) {
      if (line.length === 0) continue;
      expect(line.split(',').length).toBe(27);
    }
  });
});

describe('yesterdayAthensDate', () => {
  test('returns the prior day in YYYY-MM-DD', () => {
    expect(yesterdayAthensDate('2026-04-24')).toBe('2026-04-23');
    expect(yesterdayAthensDate('2026-03-01')).toBe('2026-02-28');
    expect(yesterdayAthensDate('2027-01-01')).toBe('2026-12-31');
  });
});

describe('countMisreportsInLog', () => {
  const TMP_LOG = join(TMP_DIR, 'test-auto-enrich.log');

  test('returns 0 when log file missing', () => {
    expect(countMisreportsInLog(join(TMP_DIR, 'nonexistent.log'))).toBe(0);
  });

  test('counts WARN subprocess-exited-but-saved lines', () => {
    const content = `
[2026-04-24 10:12:20] batch-1 OK: 5 events saved in 847s
[2026-04-24 10:15:33] batch-2 WARN: subprocess exited 143 but 4 events saved successfully (918s)
[2026-04-24 10:20:00] batch-3 ERROR: subprocess failed (exit 1) and no events saved (120s)
[2026-04-24 14:01:00] batch-1 WARN: subprocess exited 1 but 5 events saved successfully (850s)
[2026-04-24 14:10:00] batch-2 OK: 5 events saved in 900s
`;
    writeFileSync(TMP_LOG, content);
    expect(countMisreportsInLog(TMP_LOG)).toBe(2);
  });

  test('does not match OK or ERROR lines', () => {
    const content = 'batch-1 OK: 5 events saved in 800s\nbatch-2 ERROR: subprocess failed (exit 1) and no events saved';
    writeFileSync(TMP_LOG, content);
    expect(countMisreportsInLog(TMP_LOG)).toBe(0);
  });
});

describe('lastTwoRowsBefore', () => {
  test('returns the two most recent rows before today', () => {
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' +
        row27('2026-04-21', { enriched: 15, wrapper: 2 }) + '\n' +
        row27('2026-04-22', { enriched: 20, wrapper: 1 }) + '\n' +
        row27('2026-04-23', { enriched: 18, wrapper: 0 }) + '\n',
    );
    const [prior1, prior2] = lastTwoRowsBefore('2026-04-24', TMP_CSV);
    expect(prior1).not.toBeNull();
    expect(prior2).not.toBeNull();
    expect(prior1![0]).toBe('2026-04-23');
    expect(prior2![0]).toBe('2026-04-22');
  });

  test('returns [null, null] when CSV missing', () => {
    const [a, b] = lastTwoRowsBefore('2026-04-24', join(TMP_DIR, 'none.csv'));
    expect(a).toBeNull();
    expect(b).toBeNull();
  });

  test('skips duplicate-date rows (returns first seen per date)', () => {
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' +
        row27('2026-04-22', { enriched: 20 }) + '\n' +
        row27('2026-04-22', { enriched: 20 }) + '\n' +
        row27('2026-04-23', { enriched: 18 }) + '\n',
    );
    const [prior1, prior2] = lastTwoRowsBefore('2026-04-24', TMP_CSV);
    expect(prior1![0]).toBe('2026-04-23');
    expect(prior2![0]).toBe('2026-04-22');
  });
});

describe('getWrapperDiscrepancyStats', () => {
  const TMP_LOGS = join(TMP_DIR, 'logs');

  function setupLogs(files: Record<string, string>): void {
    mkdirSync(TMP_LOGS, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(TMP_LOGS, name), content);
    }
  }

  test('returns 0 when no logs exist for today/yesterday', () => {
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const stats = getWrapperDiscrepancyStats('2026-04-24', TMP_CSV, TMP_LOGS);
    expect(stats.wrapperDiscrepancyLast24h).toBe(0);
  });

  test('sums misreport counts from today and yesterday logs', () => {
    setupLogs({
      'auto-enrich-2026-04-23.log': 'batch-1 WARN: subprocess exited 1 but 3 events saved successfully\n',
      'auto-enrich-2026-04-24.log': 'batch-1 WARN: subprocess exited 1 but 5 events saved successfully\nbatch-2 WARN: subprocess exited 143 but 4 events saved successfully\n',
    });
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const stats = getWrapperDiscrepancyStats('2026-04-24', TMP_CSV, TMP_LOGS);
    expect(stats.wrapperDiscrepancyLast24h).toBe(3);
  });

  test('fires STALE_WRAPPER when count>0 AND prior 2 daily rows both had nonzero discrepancy', () => {
    setupLogs({
      'auto-enrich-2026-04-24.log': 'batch-1 WARN: subprocess exited 1 but 5 events saved successfully\n',
    });
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' +
        row27('2026-04-22', { enriched: 20, wrapper: 3 }) + '\n' +
        row27('2026-04-23', { enriched: 18, wrapper: 2 }) + '\n',
    );
    const stats = getWrapperDiscrepancyStats('2026-04-24', TMP_CSV, TMP_LOGS);
    expect(stats.wrapperDiscrepancyLast24h).toBe('STALE_WRAPPER');
  });

  test('does not fire STALE_WRAPPER if prior day had 0 discrepancy', () => {
    setupLogs({
      'auto-enrich-2026-04-24.log': 'batch-1 WARN: subprocess exited 1 but 5 events saved successfully\n',
    });
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' +
        row27('2026-04-22', { enriched: 20, wrapper: 0 }) + '\n' +
        row27('2026-04-23', { enriched: 18, wrapper: 2 }) + '\n',
    );
    const stats = getWrapperDiscrepancyStats('2026-04-24', TMP_CSV, TMP_LOGS);
    expect(stats.wrapperDiscrepancyLast24h).toBe(1);
  });

  test('returns count (not STALE) when prior rows empty (new deployment)', () => {
    setupLogs({
      'auto-enrich-2026-04-24.log': 'batch-1 WARN: subprocess exited 1 but 5 events saved successfully\n',
    });
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const stats = getWrapperDiscrepancyStats('2026-04-24', TMP_CSV, TMP_LOGS);
    expect(stats.wrapperDiscrepancyLast24h).toBe(1);
  });
});

describe('updateTodayRowManualMetrics', () => {
  const MANUAL = { gscIndexed: '7', bingIndexed: '390' };

  test('returns no-row when CSV has no row for today (does not insert)', () => {
    const before =
      CSV_HEADER + '\n' +
      row27('2026-05-06', { enriched: 5, wrapper: 0 }) + '\n' +
      row27('2026-05-07', { enriched: 5, wrapper: 0 }) + '\n';
    writeFileSync(TMP_CSV, before);
    const result = updateTodayRowManualMetrics('2026-05-08', MANUAL, false, TMP_CSV);
    expect(result).toBe('no-row');
    expect(readFileSync(TMP_CSV, 'utf8')).toBe(before);
  });

  test('returns updated and writes values when manual columns are empty', () => {
    // Override row27's default gsc/bing values (0,0) with empties so populated=false
    const emptyRow = row27('2026-05-08', { enriched: 15, wrapper: 0 })
      .split(',')
      .map((v, i) => (i === 14 || i === 15 ? '' : v))
      .join(',');
    writeFileSync(TMP_CSV, CSV_HEADER + '\n' + emptyRow + '\n');
    const result = updateTodayRowManualMetrics('2026-05-08', MANUAL, false, TMP_CSV);
    expect(result).toBe('updated');
    const row = readFileSync(TMP_CSV, 'utf8').split('\n')[1].split(',');
    expect(row[14]).toBe('7');
    expect(row[15]).toBe('390');
  });

  test('returns clobber-blocked when manual columns populated and force=false', () => {
    // row27 default: gsc=0, bing=0 — already populated
    const before = CSV_HEADER + '\n' + row27('2026-05-08', { enriched: 15, wrapper: 0 }) + '\n';
    writeFileSync(TMP_CSV, before);
    const result = updateTodayRowManualMetrics('2026-05-08', MANUAL, false, TMP_CSV);
    expect(result).toBe('clobber-blocked');
    expect(readFileSync(TMP_CSV, 'utf8')).toBe(before);
  });

  test('returns updated when manual columns populated and force=true', () => {
    writeFileSync(TMP_CSV, CSV_HEADER + '\n' + row27('2026-05-08', { enriched: 15, wrapper: 0 }) + '\n');
    const result = updateTodayRowManualMetrics('2026-05-08', MANUAL, true, TMP_CSV);
    expect(result).toBe('updated');
    const row = readFileSync(TMP_CSV, 'utf8').split('\n')[1].split(',');
    expect(row[14]).toBe('7');
    expect(row[15]).toBe('390');
  });

  test('atomic write hygiene: no .tmp leftover and row count unchanged', () => {
    const emptyRow = row27('2026-05-08', { enriched: 15, wrapper: 0 })
      .split(',')
      .map((v, i) => (i === 14 || i === 15 ? '' : v))
      .join(',');
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' +
        row27('2026-05-06', { enriched: 5, wrapper: 0 }) + '\n' +
        emptyRow + '\n',
    );
    const beforeLines = readFileSync(TMP_CSV, 'utf8').split('\n').length;
    const result = updateTodayRowManualMetrics('2026-05-08', MANUAL, false, TMP_CSV);
    expect(result).toBe('updated');
    expect(existsSync(TMP_CSV + '.tmp')).toBe(false);
    expect(readFileSync(TMP_CSV, 'utf8').split('\n').length).toBe(beforeLines);
  });
});

describe('getBingMetrics', () => {
  test('returns STALE for all 4 fields when JSON file missing', () => {
    const result = getBingMetrics(join(TMP_DIR, 'absent.json'));
    expect(result.impressions).toBe('STALE');
    expect(result.clicks).toBe('STALE');
    expect(result.avgPosition).toBe('STALE');
    expect(result.top10).toBe('STALE');
  });

  test("status='ok' → 4 numeric values from aggregate", () => {
    writeFileSync(TMP_BING, JSON.stringify({
      timestamp: '2026-05-17T12:00:00+03:00',
      status: 'ok',
      aggregate: { impressions_7d: 142, clicks_7d: 8, avg_position_7d: 5.3, top10_count_7d: 4 },
    }));
    const result = getBingMetrics(TMP_BING);
    expect(result.impressions).toBe(142);
    expect(result.clicks).toBe(8);
    expect(result.avgPosition).toBe(5.3);
    expect(result.top10).toBe(4);
  });

  test("status='stale' → 4 STALE markers", () => {
    writeFileSync(TMP_BING, JSON.stringify({
      timestamp: '2026-05-17T12:00:00+03:00',
      status: 'stale',
      aggregate: { impressions_7d: 0, clicks_7d: 0, avg_position_7d: 0, top10_count_7d: 0 },
    }));
    const result = getBingMetrics(TMP_BING);
    expect(result.impressions).toBe('STALE');
    expect(result.clicks).toBe('STALE');
    expect(result.avgPosition).toBe('STALE');
    expect(result.top10).toBe('STALE');
  });

  test("status='auth_fail' → 4 AUTH_FAIL markers (distinct from stale)", () => {
    writeFileSync(TMP_BING, JSON.stringify({
      timestamp: '2026-05-17T12:00:00+03:00',
      status: 'auth_fail',
      aggregate: { impressions_7d: 0, clicks_7d: 0, avg_position_7d: 0, top10_count_7d: 0 },
    }));
    const result = getBingMetrics(TMP_BING);
    expect(result.impressions).toBe('AUTH_FAIL');
    expect(result.clicks).toBe('AUTH_FAIL');
    expect(result.avgPosition).toBe('AUTH_FAIL');
    expect(result.top10).toBe('AUTH_FAIL');
  });

  test('unparseable JSON → STALE markers', () => {
    writeFileSync(TMP_BING, 'not json at all');
    const result = getBingMetrics(TMP_BING);
    expect(result.impressions).toBe('STALE');
  });
});
