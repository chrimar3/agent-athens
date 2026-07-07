/**
 * Import-time duplicate gate at the saveEvents seam (campaign Phase 4).
 *
 * The gate (src/quality/import-gate.ts) was wired only into upsertEvent —
 * but the daily pipeline writes ~95% of rows through scrape-all's saveEvents
 * raw INSERT (an allowlisted bypass with only ON CONFLICT(id)). Cross-source
 * re-listings and title-variant re-hashes entered ungated every morning and
 * were only mopped up post-hoc by mark-duplicates (16 fresh losers marked on
 * 2026-07-06 alone, AFTER the upsertEvent gate shipped).
 *
 * Contract mirrored from upsertEvent (load-bearing, per campaign brief):
 * - NEW ids only — same-id re-scrapes take the ON CONFLICT UPDATE path untouched
 * - fail OPEN on gate error — a false positive must never silently drop a
 *   genuinely new event; every skip emits a visible [import-gate] line
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { saveEvents } from '../scrape-all';
import { createTestDB } from '../../tests/helpers/db-helpers';

function scraped(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sv-gate-existing',
    title: 'Jafari: Monolink + Nick Jojo + Magda Kay',
    description: 'lineup night on the riviera',
    start_date: '2026-07-25',
    end_date: null,
    time: '21:00',
    type: 'dj_set',
    genres: 'Electronic',
    venue_name: 'Island Athens Riviera',
    url: 'https://example.com/events/jafari',
    price_type: 'with-ticket',
    price_amount: 20,
    price_range: '€20',
    source: 'clubber.gr',
    location_status: 'verified_athens',
    ...overrides,
  };
}

describe('saveEvents import-time duplicate gate', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
    // Seed the existing live row through the same seam under test.
    const seeded = saveEvents([scraped()] as any, false, db);
    expect(seeded.saved).toBe(1);
  });

  afterEach(() => {
    db.close();
  });

  test('known-duplicate fixture: title-variant under a NEW id is skipped, not inserted', () => {
    const result = saveEvents(
      [scraped({
        id: 'sv-gate-variant',
        title: 'Monolink',
        source: 'athinorama.gr',
        url: 'https://example.com/events/monolink-solo',
      })] as any,
      false,
      db,
    );
    expect(result.dupSkipped).toBe(1);
    expect(result.saved).toBe(0);
    const row = db.prepare("SELECT id FROM events WHERE id = 'sv-gate-variant'").get();
    expect(row).toBeNull();
  });

  test('known-new fixture: different show same day/venue passes through', () => {
    const result = saveEvents(
      [scraped({
        id: 'sv-gate-new',
        title: 'Άλκηστις Πρωτοψάλτη — Καλοκαιρινή Συναυλία',
        type: 'concert',
        genres: 'Greek',
        url: 'https://example.com/events/protopsalti',
        source: 'more.com',
      })] as any,
      false,
      db,
    );
    expect(result.saved).toBe(1);
    expect(result.dupSkipped).toBe(0);
    const row = db.prepare("SELECT id FROM events WHERE id = 'sv-gate-new'").get();
    expect(row).not.toBeNull();
  });

  test('same-id re-scrape takes the UPDATE path, never gated', () => {
    const result = saveEvents(
      [scraped({ description: 'refreshed description' })] as any,
      false,
      db,
    );
    expect(result.saved).toBe(1);
    expect(result.dupSkipped).toBe(0);
    const count = db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number };
    expect(count.c).toBe(1);
  });

  test('rows already marked merged_into are invisible to the gate', () => {
    db.prepare("UPDATE events SET merged_into = 'some-survivor' WHERE id = 'sv-gate-existing'").run();
    const result = saveEvents(
      [scraped({
        id: 'sv-gate-variant2',
        title: 'Monolink',
        source: 'athinorama.gr',
        url: 'https://example.com/events/monolink-2',
      })] as any,
      false,
      db,
    );
    expect(result.saved).toBe(1);
    expect(result.dupSkipped).toBe(0);
  });
});
