import { describe, test, expect } from 'bun:test';
import { parseMusicDayMonth } from '../scripts/scrape-all';

// athinorama music cards print "DD/MM" with no year. Live 2026-09-22: 148 of
// 218 current athinorama rows sat 300–370 days after their first scrape —
// passed dates rolled a year forward, and January scrapes reading last
// December's leftover cards as this December. Same 10-month window as
// parseTheaterDateRange.
const ref = new Date('2026-09-22T12:00:00Z');

describe('parseMusicDayMonth', () => {
  test('a date later this year is kept', () => {
    expect(parseMusicDayMonth(25, 9, ref)).toBe('2026-09-25');
  });

  test('a date early next year rolls forward (real advance listing)', () => {
    expect(parseMusicDayMonth(15, 2, ref)).toBe('2027-02-15');
  });

  test('a date that passed two days ago is NOT rolled to next year', () => {
    expect(parseMusicDayMonth(20, 9, ref)).toBeNull();
  });

  test('a date last month is NOT rolled 11 months forward', () => {
    expect(parseMusicDayMonth(30, 8, ref)).toBeNull();
  });

  test('a January scrape of a leftover "4/12" card is not read as this December', () => {
    expect(parseMusicDayMonth(4, 12, new Date('2026-01-19T12:00:00Z'))).toBeNull();
  });

  test('a December scrape of a "4/12" card later this month is kept', () => {
    expect(parseMusicDayMonth(14, 12, new Date('2026-12-04T12:00:00Z'))).toBe('2026-12-14');
  });
});
