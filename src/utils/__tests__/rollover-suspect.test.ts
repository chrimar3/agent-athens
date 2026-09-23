import { describe, test, expect } from 'bun:test';
import { isRolloverSuspect } from '../event-lifecycle';

// athinorama prints DD/MM with no year; a row dated >300 days after its first
// scrape can only have come from a stale card (see parseMusicDayMonth).
// Real rows 2026-09-22: created 2026-02-02 → 2027-01-30 (Vincent Peirani);
// created 2026-01-19 → 2026-12-04 (last December's leftovers).
const row = (source: string, createdAt: string, startDate: string) => ({ source, createdAt, startDate });

describe('isRolloverSuspect', () => {
  test('athinorama row a year after its first scrape', () => {
    expect(isRolloverSuspect(row('athinorama.gr', '2026-02-02 10:00:00', '2027-01-30T21:00:00'))).toBe(true);
  });

  test('January scrape of last December\'s card', () => {
    expect(isRolloverSuspect(row('athinorama.gr', '2026-01-19 09:00:00', '2026-12-04'))).toBe(true);
  });

  test('athinorama row a few months ahead is fine', () => {
    expect(isRolloverSuspect(row('athinorama.gr', '2026-09-01 09:00:00', '2027-02-15'))).toBe(false);
  });

  test('other sources carry explicit years and are never suspected', () => {
    expect(isRolloverSuspect(row('megaron.gr', '2026-01-19 09:00:00', '2026-12-04'))).toBe(false);
  });

  test('missing createdAt is never suspected', () => {
    expect(isRolloverSuspect({ source: 'athinorama.gr', startDate: '2027-01-30' })).toBe(false);
  });
});
