/**
 * health-check scraping verdicts (input-pipeline audit B2).
 *
 * From 2026-09-27 six sources returned 0 events on every container run with
 * success=1 and the report printed them "v" (ok): the glyph only flagged a
 * drop against calendar-yesterday, which was 0 on non-daily runs. The exit
 * code was always 0, so the pipeline logged "Health check completed".
 */

import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  scrapeStatusGlyph,
  scrapeAlerts,
  healthExitCode,
  getPreviousScrapeStats,
  HEALTH_EXIT_CRITICAL,
  constantYieldAlerts,
} from '../scripts/health-check';

const row = (source: string, events_found: number, success = 1, error_message: string | null = null) =>
  ({ source, events_found, success, error_message }) as any;

describe('scrapeStatusGlyph', () => {
  test('a 0-event success with no previous run is not ok', () => {
    expect(scrapeStatusGlyph(row('halfnote', 0), 0)).toBe('!');
  });
  test('a 0-event success after a productive run is not ok', () => {
    expect(scrapeStatusGlyph(row('halfnote', 0), 23)).toBe('!');
  });
  test('a failed run is x', () => {
    expect(scrapeStatusGlyph(row('halfnote', 0, 0, 'ESERVFAIL'), 23)).toBe('x');
  });
  test('a >50% drop is !', () => {
    expect(scrapeStatusGlyph(row('megaron', 40), 113)).toBe('!');
  });
  test('a steady source is v', () => {
    expect(scrapeStatusGlyph(row('megaron', 110), 113)).toBe('v');
  });
});

describe('scrapeAlerts', () => {
  test('0-event success → CRITICAL; failure → CRITICAL naming the error; drop → WARNING', () => {
    const prev = new Map([['megaron', 113]]);
    const alerts = scrapeAlerts([row('halfnote', 0), row('snfcc', 0, 0, 'ESERVFAIL'), row('megaron', 40), row('ra', 89)], prev);
    expect(alerts).toEqual([
      { level: 'CRITICAL', message: 'halfnote returned 0 events' },
      { level: 'CRITICAL', message: 'snfcc scrape failed: ESERVFAIL' },
      { level: 'WARNING', message: 'megaron dropped 65% - investigate' },
    ]);
  });
});

describe('healthExitCode', () => {
  test('any CRITICAL → non-zero, distinct from a crash (1)', () => {
    expect(HEALTH_EXIT_CRITICAL).not.toBe(0);
    expect(HEALTH_EXIT_CRITICAL).not.toBe(1);
    expect(healthExitCode([{ level: 'WARNING', message: 'w' }, { level: 'CRITICAL', message: 'c' }])).toBe(HEALTH_EXIT_CRITICAL);
  });
  test('warnings only → 0', () => {
    expect(healthExitCode([{ level: 'WARNING', message: 'w' }])).toBe(0);
    expect(healthExitCode([])).toBe(0);
  });
});

describe('getPreviousScrapeStats — previous successful run, not calendar-yesterday', () => {
  function db(): Database {
    const d = new Database(':memory:');
    d.run(`CREATE TABLE scrape_stats (source TEXT, scraped_at TEXT, events_found INTEGER, success INTEGER, error_message TEXT)`);
    const ins = d.prepare(`INSERT INTO scrape_stats VALUES (?,?,?,?,NULL)`);
    // halfnote: productive 21 days before its latest run, nothing in between (non-daily runs)
    ins.run('halfnote', '2026-09-25T05:00:00', 23, 1);
    ins.run('halfnote', '2026-10-16T05:00:00', 0, 1);
    // megaron: a failed run between two successes — the failure is not a baseline
    ins.run('megaron', '2026-10-05T21:00:00', 113, 1);
    ins.run('megaron', '2026-10-06T06:00:00', 0, 0);
    ins.run('megaron', '2026-10-16T05:00:00', 75, 1);
    // ra: only one run ever
    ins.run('ra', '2026-10-16T05:00:00', 89, 1);
    return d;
  }

  test('fixture precondition: no halfnote row on the calendar day before its latest run', () => {
    const c = (db().query(`SELECT COUNT(*) c FROM scrape_stats WHERE source='halfnote' AND date(scraped_at)='2026-10-15'`).get() as { c: number }).c;
    expect(c).toBe(0);
  });

  test('uses each source\'s last successful run before its latest run', () => {
    const prev = getPreviousScrapeStats(db());
    expect(prev.get('halfnote')).toBe(23);
    expect(prev.get('megaron')).toBe(113);
    expect(prev.has('ra')).toBe(false);
  });
});

describe('constantYieldAlerts — a constant yield is a dead sensor (audit B5)', () => {
  function db(): Database {
    const d = new Database(':memory:');
    d.run(`CREATE TABLE scrape_stats (source TEXT, scraped_at TEXT, events_found INTEGER, success INTEGER, error_message TEXT)`);
    const ins = d.prepare(`INSERT INTO scrape_stats VALUES (?,?,?,?,NULL)`);
    const at = (i: number) => `2026-10-${String(1 + i).padStart(2, '0')}T05:00:00`;
    for (let i = 0; i < 14; i++) ins.run('benaki', at(i), 4, 1);          // the 238-run case
    for (let i = 0; i < 14; i++) ins.run('halfnote', at(i), i === 7 ? 22 : 23, 1); // one change → alive
    for (let i = 0; i < 13; i++) ins.run('newsrc', at(i), 9, 1);          // too short a history to judge
    for (let i = 0; i < 14; i++) ins.run('dead', at(i), 0, 1);            // zero is B2's CRITICAL, not this rule
    ins.run('benaki', '2026-10-20T05:00:00', 0, 0);                        // the newest run failed: failures are not yield samples
    return d;
  }

  test('fixture precondition: benaki has 14 successful runs, all at 4', () => {
    const r = db().query(`SELECT COUNT(*) c, MIN(events_found) lo, MAX(events_found) hi FROM scrape_stats WHERE source='benaki' AND success=1`).get() as any;
    expect(r).toEqual({ c: 14, lo: 4, hi: 4 });
  });

  test('warns only for a source whose last 14 successful runs all reported the same non-zero count', () => {
    expect(constantYieldAlerts(db())).toEqual([
      { level: 'WARNING', message: 'benaki reported exactly 4 events on each of its last 14 successful runs — a constant yield usually means fixed rows, not a live source; check the scraper' },
    ]);
  });
});
