/**
 * resetMegaronDefaultTimes — undoes the scraper's hardcoded 20:30 on rows that
 * already exist. The daily upsert never rewrites start_date and COALESCE-keeps
 * time_doors, so without this the invented clock survives every re-scrape.
 */

import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { resetMegaronDefaultTimes } from '../fix-megaron-default-times';

function fixtureDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE events (id TEXT PRIMARY KEY, source TEXT, start_date TEXT, time_doors TEXT, time_source TEXT)`);
  const ins = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?)');
  ins.run('default', 'megaron.gr', '2026-10-30T20:30:00', '20:30', 'scraped_listing'); // invented clock
  ins.run('no-doors', 'megaron.gr', '2026-11-01T20:30:00', null, null);               // invented clock, no doors
  ins.run('real-doors', 'megaron.gr', '2026-11-02T20:30:00', '20:00', null);          // doors from elsewhere — keep
  ins.run('backfilled', 'megaron.gr', '2026-11-03', '19:00', 'scraped_detail');       // already honest
  ins.run('other-src', 'athinorama.gr', '2026-10-30T20:30:00', '20:30', 'scraped_listing');
  return db;
}

const row = (db: Database, id: string) =>
  db.prepare('SELECT start_date, time_doors, time_source FROM events WHERE id = ?').get(id) as {
    start_date: string; time_doors: string | null; time_source: string | null;
  };

describe('resetMegaronDefaultTimes', () => {
  test('dry run reports the affected rows and writes nothing', () => {
    const db = fixtureDb();
    expect(resetMegaronDefaultTimes(db, { apply: false })).toBe(3);
    expect(row(db, 'default').start_date).toBe('2026-10-30T20:30:00');
  });

  test('apply strips the clock and clears the invented doors time so enrich-time re-selects the row', () => {
    const db = fixtureDb();
    expect(resetMegaronDefaultTimes(db, { apply: true })).toBe(3);
    expect(row(db, 'default')).toEqual({ start_date: '2026-10-30', time_doors: null, time_source: null });
    expect(row(db, 'no-doors')).toEqual({ start_date: '2026-11-01', time_doors: null, time_source: null });
  });

  test('a doors time that is not the 20:30 default is preserved', () => {
    const db = fixtureDb();
    resetMegaronDefaultTimes(db, { apply: true });
    expect(row(db, 'real-doors')).toEqual({ start_date: '2026-11-02', time_doors: '20:00', time_source: null });
  });

  test('other sources and already-backfilled rows are untouched', () => {
    const db = fixtureDb();
    resetMegaronDefaultTimes(db, { apply: true });
    expect(row(db, 'other-src').start_date).toBe('2026-10-30T20:30:00');
    expect(row(db, 'backfilled')).toEqual({ start_date: '2026-11-03', time_doors: '19:00', time_source: 'scraped_detail' });
  });

  test('idempotent: a second apply changes nothing', () => {
    const db = fixtureDb();
    resetMegaronDefaultTimes(db, { apply: true });
    expect(resetMegaronDefaultTimes(db, { apply: true })).toBe(0);
  });
});
