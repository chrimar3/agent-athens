/**
 * Tests for the import-time duplicate gate (dedup arc Phase 4).
 *
 * The gate runs inside upsertEvent for NEW ids only: an incoming event that
 * matches an existing live row (same canonical venue + date, 4-layer title
 * match) is rejected instead of inserted, so scrapers can no longer recreate
 * the duplicates the retroactive pass just merged.
 *
 * Required behaviors (mission brief):
 * 1. Exact re-import (same id)      → UPDATE path, never gated
 * 2. Title-variant re-import        → blocked, reports the existing id
 * 3. Typo re-import (edit dist. 1)  → blocked
 * 4. Legit second event same venue/day → passes through
 * Plus: rows already marked merged_into are invisible to the gate.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { upsertEvent } from '../../db/database';
import { checkImportDuplicate } from '../import-gate';
import { findDuplicates } from '../duplicate-detector';
import { createTestDB, cleanupDB } from '../../../tests/helpers/db-helpers';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

function makeEvent(overrides: Partial<Event>): Event {
  return {
    ...sampleConcert,
    ...overrides,
    venue: { ...sampleConcert.venue, ...(overrides.venue ?? {}) },
  } as Event;
}

const lineupListing = makeEvent({
  id: 'gate-existing-lineup',
  title: 'Jafari: Monolink + Nick Jojo + Magda Kay',
  type: 'dj_set',
  startDate: '2026-07-05T18:00:00+03:00',
  endDate: undefined,
  venue: { name: 'Island Athens Riviera', address: 'Varkiza, Athens' },
  source: 'clubber.gr',
});

describe('import-time duplicate gate', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
    const seeded = upsertEvent(lineupListing, db);
    expect(seeded.success).toBe(true);
    expect(seeded.isNew).toBe(true);
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test('exact re-import (same id) takes the UPDATE path, never gated', () => {
    const result = upsertEvent(
      makeEvent({
        ...lineupListing,
        description: 'refreshed description from re-scrape',
      }),
      db
    );
    expect(result.success).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.duplicateOf).toBeUndefined();
  });

  test('title-variant re-import under a new id is blocked', () => {
    const result = upsertEvent(
      makeEvent({
        id: 'gate-variant-bare-headliner',
        title: 'Monolink',
        type: 'concert',
        startDate: '2026-07-05T18:00:00+03:00',
        venue: { name: 'Island Athens Riviera', address: 'Varkiza, Athens' },
        source: 'athinorama.gr',
      }),
      db
    );
    expect(result.success).toBe(false);
    expect(result.isNew).toBe(false);
    expect(result.duplicateOf).toBe('gate-existing-lineup');

    const count = db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
    expect(count.n).toBe(1); // nothing inserted
  });

  test('typo re-import (edit distance 1) is blocked', () => {
    const result = upsertEvent(
      makeEvent({
        id: 'gate-typo-monilink',
        title: 'MONILINK | NICK JOJO | MAGDA KAY',
        type: 'dj_set',
        startDate: '2026-07-05T18:00:00+03:00',
        venue: { name: 'Island Athens Riviera', address: 'Varkiza, Athens' },
        source: 'residentadvisor',
      }),
      db
    );
    expect(result.success).toBe(false);
    expect(result.duplicateOf).toBe('gate-existing-lineup');
  });

  test('legitimate second event at same venue on same day passes through', () => {
    const result = upsertEvent(
      makeEvent({
        id: 'gate-legit-other-artist',
        title: 'Peggy Gou',
        type: 'dj_set',
        startDate: '2026-07-05T23:00:00+03:00',
        venue: { name: 'Island Athens Riviera', address: 'Varkiza, Athens' },
        source: 'residentadvisor',
      }),
      db
    );
    expect(result.success).toBe(true);
    expect(result.isNew).toBe(true);
    expect(result.duplicateOf).toBeUndefined();
  });

  test('rows already marked merged_into are invisible to the gate', () => {
    // Mark the seeded row as a merge loser — an incoming duplicate of it
    // must NOT be gated against a tombstone.
    db.prepare(
      "UPDATE events SET merged_into = 'some-survivor', merged_at = datetime('now') WHERE id = 'gate-existing-lineup'"
    ).run();

    const result = upsertEvent(
      makeEvent({
        id: 'gate-vs-tombstone',
        title: 'Monolink',
        startDate: '2026-07-05T18:00:00+03:00',
        venue: { name: 'Island Athens Riviera', address: 'Varkiza, Athens' },
        source: 'athinorama.gr',
      }),
      db
    );
    expect(result.success).toBe(true);
    expect(result.isNew).toBe(true);
  });

  test('same-day exhibition listings dedupe by range overlap, one-day events do not gate against exhibitions', () => {
    const exhibition = makeEvent({
      id: 'gate-exhibition',
      title: 'Barbara Kruger: Untitled',
      type: 'exhibition',
      startDate: '2026-06-01T10:00:00+03:00',
      endDate: '2026-09-30T20:00:00+03:00',
      venue: { name: 'ΚΠΙΣΝ', address: 'Λεωφόρος Συγγρού 364, Καλλιθέα' },
      source: 'snfcc',
    });
    expect(upsertEvent(exhibition, db).success).toBe(true);

    // Cross-source re-listing of the same exhibition, overlapping range → blocked
    const dupExhibition = upsertEvent(
      makeEvent({
        id: 'gate-exhibition-dup',
        title: 'BARBARA KRUGER: UNTITLED',
        type: 'exhibition',
        startDate: '2026-06-15T10:00:00+03:00',
        endDate: '2026-09-30T20:00:00+03:00',
        venue: { name: 'ΚΠΙΣΝ', address: 'Λεωφόρος Συγγρού 364, Καλλιθέα' },
        source: 'athinorama.gr',
      }),
      db
    );
    expect(dupExhibition.success).toBe(false);
    expect(dupExhibition.duplicateOf).toBe('gate-exhibition');

    // A concert during the exhibition's run at the same venue is NOT a dup
    const concert = upsertEvent(
      makeEvent({
        id: 'gate-concert-during-exhibition',
        title: 'Sunset Frequencies',
        type: 'concert',
        startDate: '2026-07-08T20:00:00+03:00',
        venue: { name: 'ΚΠΙΣΝ', address: 'Λεωφόρος Συγγρού 364, Καλλιθέα' },
        source: 'athinorama.gr',
      }),
      db
    );
    expect(concert.success).toBe(true);
    expect(concert.isNew).toBe(true);
  });
});

// A gate skip is permanent (the row is never written), so only layers proven
// safe for irreversible use may block imports. same_slot marks duplicates in
// the reversible mark-duplicates pass instead.
describe('import gate ignores the same_slot layer', () => {
  let db: Database;
  const at = '2026-11-05T21:00:00+03:00';
  const venue = { name: 'Εθνικό Θέατρο', address: 'Αγίου Κωνσταντίνου 22, Αθήνα' };

  beforeEach(() => {
    db = createTestDB();
    expect(upsertEvent(makeEvent({ id: 'dream-full', title: 'Όνειρο καλοκαιρινής νύχτας', type: 'theater', startDate: at, endDate: undefined, venue, source: 'athinorama.gr' }), db).success).toBe(true);
  });
  afterEach(() => cleanupDB(db));

  // Called the way scripts/scrape-all.ts calls it: naive Athens wall time, as stored.
  test('a candidate matched only by same_slot is not gated', () => {
    const stored = (db.prepare("SELECT start_date FROM events WHERE id = 'dream-full'").get() as { start_date: string }).start_date;
    const candidate = { id: 'dream-short', title: 'Όνειρο', startDate: stored, type: 'theater', source: 'more.com', venue: { name: venue.name } } as Event;
    expect(findDuplicates([{ ...candidate, start_date: stored, venue_name: venue.name }, { id: 'dream-full', title: 'Όνειρο καλοκαιρινής νύχτας', start_date: stored, venue_name: venue.name, type: 'theater', source: 'athinorama.gr' }], [])
      .map(p => p.layer)).toEqual(['same_slot']); // precondition: only same_slot links them
    expect(checkImportDuplicate(candidate, db)).toBeNull();
  });
});
