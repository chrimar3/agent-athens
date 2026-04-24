/**
 * Tests for scripts/monitor-search-visibility.ts
 *
 * Covers the enrichment-throughput extension added in Session A (S91 follow-up):
 * - getEnrichmentStats() emits integer / STALE_ENRICHMENT / '' per contract
 * - lastRowBefore() scans CSV backwards for most recent date != today
 * - migrateCsvIfNeeded() handles 18→19 column schema migration atomically
 * - Column count invariant: every row has exactly 19 fields after extension
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
} from '../scripts/monitor-search-visibility';

const TMP_DIR = join(import.meta.dir, 'tmp/monitor-search-visibility');
const TMP_CSV = join(TMP_DIR, 'test.csv');
const TMP_DB = join(TMP_DIR, 'test.db');
const MISSING_DB = join(TMP_DIR, 'does-not-exist.db');

const OLD_HEADER =
  'date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,robots_http,sitemap_http,llms_http,sample_accessible,sample_size,gsc_indexed,bing_indexed,ai_citations_count,notes';

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
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('CSV_HEADER', () => {
  test('has 20 columns with observability fields before notes', () => {
    const cols = CSV_HEADER.split(',');
    expect(cols.length).toBe(20);
    expect(cols[17]).toBe('enriched_last_24h');
    expect(cols[18]).toBe('wrapper_discrepancy_last_24h');
    expect(cols[19]).toBe('notes');
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
      CSV_HEADER +
        '\n' +
        '2026-04-21,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,5,\n' +
        '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,0,\n' +
        '2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,0,\n',
    );
    const row = lastRowBefore('2026-04-23', TMP_CSV);
    expect(row).not.toBeNull();
    expect(row![0]).toBe('2026-04-22');
    expect(row![17]).toBe('0');
  });

  test('skips today even if only row', () => {
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' + '2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,0,\n',
    );
    expect(lastRowBefore('2026-04-23', TMP_CSV)).toBeNull();
  });
});

describe('getEnrichmentStats', () => {
  test('returns integer count when DB has rows in last 24h', () => {
    setupEventsDb(TMP_DB, [
      new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),  // 2h ago
      new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(), // 10h ago
      new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 48h ago — excluded
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
      CSV_HEADER + '\n' + '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,0,\n',
    );
    const stats = getEnrichmentStats('2026-04-23', TMP_DB, TMP_CSV);
    expect(stats.enrichedLast24h).toBe('STALE_ENRICHMENT');
  });

  test('returns 0 (not STALE) when DB empty but prior row had nonzero', () => {
    setupEventsDb(TMP_DB, []);
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' + '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,33,\n',
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
    // Production DB is WAL mode. Prior implementation used readonly:true
    // and hit SQLITE_CANTOPEN. This test creates a WAL-mode DB to prevent
    // anyone re-adding that flag in a refactor.
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

  test('does not trigger STALE when prior row was in old 18-col format (no enriched_last_24h field)', () => {
    // Prior row has 18 cols, index 17 is `notes` (empty), not an enriched_last_24h value.
    // `notes` field is '' (empty), so priorEnrich === '' (not '0'); STALE must not fire.
    setupEventsDb(TMP_DB, []);
    writeFileSync(
      TMP_CSV,
      CSV_HEADER + '\n' + '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,\n',
    );
    const stats = getEnrichmentStats('2026-04-23', TMP_DB, TMP_CSV);
    expect(stats.enrichedLast24h).toBe(0);
  });
});

describe('migrateCsvIfNeeded', () => {
  test('creates fresh CSV with new header when file missing', () => {
    migrateCsvIfNeeded(TMP_CSV);
    expect(existsSync(TMP_CSV)).toBe(true);
    expect(readFileSync(TMP_CSV, 'utf-8')).toBe(CSV_HEADER + '\n');
  });

  test('is a no-op when CSV already has new 20-col header', () => {
    const content =
      CSV_HEADER + '\n' + '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,33,0,\n';
    writeFileSync(TMP_CSV, content);
    migrateCsvIfNeeded(TMP_CSV);
    expect(readFileSync(TMP_CSV, 'utf-8')).toBe(content);
  });

  test('migrates 18-col header → 20-col, inserts two empties before notes (skip one, skip two)', () => {
    const oldContent =
      OLD_HEADER +
      '\n' +
      '2026-04-20,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,hello\n' +
      '2026-04-21,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,\n';
    writeFileSync(TMP_CSV, oldContent);
    migrateCsvIfNeeded(TMP_CSV);
    const migrated = readFileSync(TMP_CSV, 'utf-8');
    const lines = migrated.split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toBe('2026-04-20,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,,,hello');
    expect(lines[2]).toBe('2026-04-21,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,,,');
    for (const line of lines) {
      if (line.length === 0) continue;
      expect(line.split(',').length).toBe(20);
    }
  });

  test('migrates 19-col header → 20-col, inserts one empty before notes (S97 CSV → S98)', () => {
    // Simulates a CSV that was already migrated to 19 cols during Session A
    // and now needs a single additional column for Session 98.
    const S97_HEADER =
      'date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,robots_http,sitemap_http,llms_http,sample_accessible,sample_size,gsc_indexed,bing_indexed,ai_citations_count,enriched_last_24h,notes';
    const oldContent =
      S97_HEADER +
      '\n' +
      '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,15,note-a\n' +
      '2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,0,\n';
    writeFileSync(TMP_CSV, oldContent);
    migrateCsvIfNeeded(TMP_CSV);
    const migrated = readFileSync(TMP_CSV, 'utf-8');
    const lines = migrated.split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toBe('2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,15,,note-a');
    expect(lines[2]).toBe('2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,0,,');
    for (const line of lines) {
      if (line.length === 0) continue;
      expect(line.split(',').length).toBe(20);
    }
  });

  test('leaves tmp file removed after successful migration', () => {
    writeFileSync(
      TMP_CSV,
      OLD_HEADER + '\n' + '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,\n',
    );
    migrateCsvIfNeeded(TMP_CSV);
    expect(existsSync(TMP_CSV + '.tmp')).toBe(false);
  });
});

describe('column count invariant', () => {
  test('full migration + simulated append yields 20-col rows throughout', () => {
    // Start with old 18-col CSV
    writeFileSync(
      TMP_CSV,
      OLD_HEADER +
        '\n' +
        '2026-04-21,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,\n' +
        '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,\n',
    );
    migrateCsvIfNeeded(TMP_CSV);
    // Simulate appending today's row (20 fields)
    const todayRow =
      '2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,15,0,';
    const appended = readFileSync(TMP_CSV, 'utf-8') + todayRow + '\n';
    writeFileSync(TMP_CSV, appended);

    const lines = readFileSync(TMP_CSV, 'utf-8').split('\n');
    for (const line of lines) {
      if (line.length === 0) continue;
      expect(line.split(',').length).toBe(20);
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
      CSV_HEADER +
        '\n' +
        '2026-04-21,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,15,2,\n' +
        '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,20,1,\n' +
        '2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,18,0,\n',
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
    // Monitor may write multiple rows on the same day (manual reruns). lastTwoRowsBefore
    // collapses same-date rows by taking only the newest per date.
    writeFileSync(
      TMP_CSV,
      CSV_HEADER +
        '\n' +
        '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,20,0,\n' +
        '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,20,0,\n' +
        '2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,18,0,\n',
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
    expect(stats.wrapperDiscrepancyLast24h).toBe(3); // 1 from yesterday + 2 from today
  });

  test('fires STALE_WRAPPER when count>0 AND prior 2 daily rows both had nonzero discrepancy', () => {
    setupLogs({
      'auto-enrich-2026-04-24.log': 'batch-1 WARN: subprocess exited 1 but 5 events saved successfully\n',
    });
    writeFileSync(
      TMP_CSV,
      CSV_HEADER +
        '\n' +
        '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,20,3,\n' +
        '2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,18,2,\n',
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
      CSV_HEADER +
        '\n' +
        '2026-04-22,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,20,0,\n' +
        '2026-04-23,1,2,3,6,10,10,1,t,200,200,200,10,10,0,0,0,18,2,\n',
    );
    const stats = getWrapperDiscrepancyStats('2026-04-24', TMP_CSV, TMP_LOGS);
    expect(stats.wrapperDiscrepancyLast24h).toBe(1);
  });

  test('returns 0 today (no STALE) when today has discrepancy but prior rows empty (new deployment)', () => {
    setupLogs({
      'auto-enrich-2026-04-24.log': 'batch-1 WARN: subprocess exited 1 but 5 events saved successfully\n',
    });
    writeFileSync(TMP_CSV, CSV_HEADER + '\n');
    const stats = getWrapperDiscrepancyStats('2026-04-24', TMP_CSV, TMP_LOGS);
    expect(stats.wrapperDiscrepancyLast24h).toBe(1);
  });
});
