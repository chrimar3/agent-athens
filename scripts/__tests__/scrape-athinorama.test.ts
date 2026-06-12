/**
 * Tests for scripts/scrape-all.ts parseTheaterDateRange() (S-F2a).
 *
 * Card fixtures mirror real athinorama.gr theater-guide markup: the date labels
 * are "Πρεμιέρα: </strong>DD/MM" and "Εως: </strong>DD/MM". The capture fix
 * routes the parsed end date into ScrapedEvent.end_date (structured), never
 * into description prose — these tests pin the parsing contract.
 */

import { describe, test, expect } from 'bun:test';
import { parseTheaterDateRange } from '../scrape-all';

// Fixed reference date: 2026-06-12 (June). Months < 6 roll into 2027.
const REF = new Date('2026-06-12T10:00:00Z');

const card = (inner: string) =>
  `<h3><a href="/theater/123/show">Τίτλος</a></h3>${inner}<h4><a href="/theater/halls/9/x">Θέατρο Χ</a></h4>`;

describe('parseTheaterDateRange', () => {
  test('premiere + end date (range)', () => {
    const r = parseTheaterDateRange(
      card('<strong>Πρεμιέρα: </strong>20/6 <strong>Εως: </strong>30/6'),
      REF
    );
    expect(r).toEqual({ startDate: '2026-06-20', endDate: '2026-06-30' });
  });

  test('ongoing show — end date only, start = today', () => {
    const r = parseTheaterDateRange(card('<strong>Εως: </strong>30/6'), REF);
    expect(r).toEqual({ startDate: '2026-06-12', endDate: '2026-06-30' });
  });

  test('premiere only — single performance, no end date', () => {
    const r = parseTheaterDateRange(card('<strong>Πρεμιέρα: </strong>25/10'), REF);
    expect(r).toEqual({ startDate: '2026-10-25', endDate: null });
  });

  test('end month behind current month rolls into next year', () => {
    const r = parseTheaterDateRange(card('<strong>Εως: </strong>25/01'), REF);
    expect(r).toEqual({ startDate: '2026-06-12', endDate: '2027-01-25' });
  });

  test('range wrapping the year boundary', () => {
    const r = parseTheaterDateRange(
      card('<strong>Πρεμιέρα: </strong>17/12 <strong>Εως: </strong>25/01'),
      REF
    );
    expect(r).toEqual({ startDate: '2026-12-17', endDate: '2027-01-25' });
  });

  test('no date labels — both null (caller skips the card)', () => {
    const r = parseTheaterDateRange(card('<p>Χωρίς ημερομηνίες</p>'), REF);
    expect(r).toEqual({ startDate: null, endDate: null });
  });
});
