/**
 * getNextBatch (the `run-enrichment-pipeline --prompts --count=N` selector)
 * must serve the events people will open SOONEST first.
 *
 * Before: ORDER BY q.priority_score DESC, e.start_date ASC with no date
 * filter. priority_score is frozen at --sync time and awards venue tier up to
 * +50 against a time factor of at most +40, so a far-future premium-venue
 * event outranked a plain event two days out; and a past event scores the
 * full +40 "imminent" (negative days-until <= 3), so expired rows headed the
 * queue (1661 of 1911 pending rows were past-dated on 2026-09-22).
 *
 * After: only still-current events (effective end >= today, the shared
 * effectiveEndSql rule — exhibitions/theater runs by end_date); ordered by
 * effective next date = max(start, today), so a running exhibition counts as
 * "today". The stored priority_score only breaks ties WITHIN a near-term band
 * (0-3, 4-7, 8-14 days — the calculatePriority time bands); beyond 14 days
 * order is by date alone.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getNextBatch } from '../priority-queue-manager';

const TODAY = '2026-09-22';

function plusDays(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function makeDb(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      venue_name TEXT,
      type TEXT,
      genres TEXT,
      price_type TEXT,
      price_advance REAL,
      price_door REAL,
      venue_neighborhood TEXT,
      venue_metro_station TEXT,
      venue_metro_line TEXT,
      door_policy TEXT,
      door_policy_note TEXT,
      time_doors TEXT,
      time_peak TEXT,
      ticket_url TEXT,
      source TEXT,
      location_status TEXT DEFAULT 'verified_athens',
      needs_enrichment INTEGER DEFAULT 1,
      full_description TEXT,
      merged_into TEXT
    )
  `);
  db.exec(readFileSync(join(import.meta.dir, '../../db/migrations/002-enrichment-queue-table.sql'), 'utf-8'));
  return db;
}

function seed(
  db: Database,
  e: { id: string; start: string; end?: string | null; type: string; venue: string; score: number; mergedInto?: string | null },
): void {
  db.prepare(
    `INSERT INTO events (id, title, start_date, end_date, venue_name, type, price_type, merged_into)
     VALUES (?, ?, ?, ?, ?, ?, 'with-ticket', ?)`,
  ).run(e.id, `Title ${e.id}`, e.start, e.end ?? null, e.venue, e.type, e.mergedInto ?? null);
  // Scores mirror what calculatePriority would have stored at --sync time.
  db.prepare(
    `INSERT INTO enrichment_queue (event_id, priority_score, tier, status) VALUES (?, ?, 'standard', 'pending')`,
  ).run(e.id, e.score);
}

/** The pre-change ordering, used only to assert the fixture exercises the rule. */
function oldOrder(db: Database): string[] {
  return (
    db
      .prepare(
        `SELECT e.id FROM enrichment_queue q JOIN events e ON q.event_id = e.id
         WHERE q.status = 'pending' AND e.merged_into IS NULL
         ORDER BY q.priority_score DESC, e.start_date ASC`,
      )
      .all() as Array<{ id: string }>
  ).map((r) => r.id);
}

describe('getNextBatch serves soonest events first', () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    // imminent (40) + concert (15) + price (10)
    seed(db, { id: 'plus2', start: `${plusDays(2)}T21:00:00`, type: 'concert', venue: 'Small Bar', score: 65 });
    // running since months ago, closes in 5 days: imminent (40, negative days) + price (10); exhibition type = 0
    seed(db, { id: 'exhib-running', start: plusDays(-120), end: plusDays(5), type: 'exhibition', venue: 'Some Gallery', score: 50 });
    // within 2 weeks (15) + concert (15) + price (10)
    seed(db, { id: 'plus10', start: `${plusDays(10)}T21:00:00`, type: 'concert', venue: 'Small Bar', score: 40 });
    // far future but premium venue: venue (50) + concert (15) + price (10)
    seed(db, { id: 'plus90', start: `${plusDays(90)}T20:30:00`, type: 'concert', venue: 'Megaron Mousikis', score: 75 });
    // past: negative days-until scored as "imminent"
    seed(db, { id: 'past', start: `${plusDays(-30)}T21:00:00`, type: 'concert', venue: 'Megaron Mousikis', score: 100 });
    // merged loser, upcoming and top-scored
    seed(db, { id: 'loser', start: `${plusDays(1)}T21:00:00`, type: 'concert', venue: 'Small Bar', score: 100, mergedInto: 'plus2' });
  });

  afterEach(() => db.close());

  test('fixture precondition: the old ordering puts past and far-future ahead of near-term', () => {
    const old = oldOrder(db);
    expect(old[0]).toBe('past');
    expect(old.indexOf('plus90')).toBeLessThan(old.indexOf('plus2'));
    expect(old.indexOf('plus90')).toBeLessThan(old.indexOf('plus10'));
  });

  test('returns +2, running exhibition, +10, +90 — never the past event or the merged loser', () => {
    const ids = getNextBatch(db, { limit: 10, today: TODAY }).map((e) => e.id);
    expect(ids).toEqual(['plus2', 'exhib-running', 'plus10', 'plus90']);
  });

  test('--count=N takes the N soonest', () => {
    const ids = getNextBatch(db, { limit: 2, today: TODAY }).map((e) => e.id);
    expect(ids).toEqual(['plus2', 'exhib-running']);
  });

  test('priority breaks ties inside a near-term band, but not across bands or beyond 14 days', () => {
    const db2 = makeDb();
    try {
      // Same 0-3 band: higher priority at +3 outranks lower priority at +1.
      seed(db2, { id: 'b0-plus1-low', start: `${plusDays(1)}T21:00:00`, type: 'concert', venue: 'x', score: 40 });
      seed(db2, { id: 'b0-plus3-high', start: `${plusDays(3)}T21:00:00`, type: 'concert', venue: 'x', score: 90 });
      // 4-7 band: a very high score cannot jump the 0-3 band.
      seed(db2, { id: 'b1-plus4-top', start: `${plusDays(4)}T21:00:00`, type: 'concert', venue: 'x', score: 100 });
      // Beyond 14 days: date alone decides.
      seed(db2, { id: 'far-plus20-low', start: `${plusDays(20)}T21:00:00`, type: 'concert', venue: 'x', score: 10 });
      seed(db2, { id: 'far-plus40-high', start: `${plusDays(40)}T21:00:00`, type: 'concert', venue: 'x', score: 95 });

      const ids = getNextBatch(db2, { limit: 10, today: TODAY }).map((e) => e.id);
      expect(ids).toEqual(['b0-plus3-high', 'b0-plus1-low', 'b1-plus4-top', 'far-plus20-low', 'far-plus40-high']);
    } finally {
      db2.close();
    }
  });
});
