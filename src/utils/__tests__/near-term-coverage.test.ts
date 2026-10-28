/**
 * Near-term coverage ratchet (input-pipeline audit, Phase 2 gate).
 *
 * The 2026-09-27 outage was visible to visitors long before any monitor: the
 * homepage "Σήμερα" block ran out of dates while every count stayed large
 * (349 shown rows months ahead, mostly year-rollover artifacts). The user-facing
 * predicate is "shown rows happening in the next 7 days, per source", and a
 * source that drops to 0 there is the alarm.
 */

import { describe, test, expect } from 'bun:test';
import { nearTermCoverage, nearTermRegressions, nearTermSection } from '../near-term-coverage';

const ev = (source: string, startDate: string, extra: { type?: string; endDate?: string } = {}) =>
  ({ source, startDate, type: extra.type ?? 'concert', endDate: extra.endDate }) as any;

const TODAY = '2026-10-27';

describe('nearTermCoverage', () => {
  const events = [
    ev('megaron.gr', '2026-10-27T20:30:00+02:00'),          // today
    ev('megaron.gr', '2026-11-02'),                         // day 7 (last day of window)
    ev('megaron.gr', '2026-11-03'),                         // day 8 — outside
    ev('athinorama.gr', '2027-04-10'),                      // rollover-style far future — outside
    ev('snfcc', '2026-09-01', { type: 'exhibition', endDate: '2026-11-01' }), // running exhibition
    ev('snfcc', '2026-09-01', { type: 'exhibition', endDate: '2026-10-26' }), // closed yesterday
    ev('residentadvisor', '2026-10-26'),                    // yesterday — outside
  ];

  test('fixture precondition: the window edges and the exhibition rule are all exercised', () => {
    expect(events.filter((e) => e.source === 'megaron.gr').length).toBe(3);
    expect(events.filter((e) => e.type === 'exhibition').length).toBe(2);
  });

  test('counts rows that happen within today … today+6, per source (exhibitions by end date)', () => {
    const c = nearTermCoverage(events, TODAY, 7);
    expect(c.from).toBe('2026-10-27');
    expect(c.to).toBe('2026-11-02');
    expect(c.bySource).toEqual({ 'megaron.gr': 2, snfcc: 1 });
    expect(c.total).toBe(3);
  });

  test('an empty population gives total 0 and no sources', () => {
    expect(nearTermCoverage([], TODAY, 7)).toMatchObject({ total: 0, bySource: {} });
  });
});

describe('nearTermRegressions', () => {
  test('a source with near-term rows last build and none now is a regression; a growing or new source is not', () => {
    const prev = { 'megaron.gr': 12, halfnote: 3, ticketservices: 5 };
    const curr = { 'megaron.gr': 9, ticketservices: 7, cometogether: 4 };
    expect(nearTermRegressions(prev, curr)).toEqual(['halfnote']);
  });

  test('no previous report → no regressions (first build cannot ratchet)', () => {
    expect(nearTermRegressions(null, { a: 1 })).toEqual([]);
  });

  test('an explicit 0 now counts as dropped', () => {
    expect(nearTermRegressions({ a: 2 }, { a: 0 })).toEqual(['a']);
  });
});

describe('nearTermSection — what build-completeness.json carries', () => {
  const now = [ev('megaron.gr', '2026-10-28')];

  test('reads the previous report\'s nearTerm.bySource and names the sources that went dark', () => {
    const prev = { meta: {}, nearTerm: { bySource: { 'megaron.gr': 4, halfnote: 2 } } };
    const s = nearTermSection(prev, now, TODAY);
    expect(s.windowDays).toBe(7);
    expect(s.bySource).toEqual({ 'megaron.gr': 1 });
    expect(s.droppedToZero).toEqual(['halfnote']);
  });

  test('a source stays flagged on later builds until it has near-term rows again (review finding S235)', () => {
    const second = nearTermSection({ nearTerm: { bySource: { 'megaron.gr': 1 }, droppedToZero: ['halfnote'] } }, now, TODAY);
    expect(second.droppedToZero).toEqual(['halfnote']);
    const back = nearTermSection({ nearTerm: { bySource: { 'megaron.gr': 1 }, droppedToZero: ['halfnote'] } }, [...now, ev('halfnote', '2026-10-29')], TODAY);
    expect(back.droppedToZero).toEqual([]);
  });

  test('a previous report without nearTerm, or a malformed one, ratchets nothing', () => {
    for (const prev of [null, undefined, {}, { nearTerm: 'x' }, { nearTerm: { bySource: [1, 2] } }, { nearTerm: { bySource: { a: 'many' } } }, { nearTerm: { bySource: {}, droppedToZero: 'halfnote' } }, { nearTerm: { bySource: {}, droppedToZero: [3] } }]) {
      expect(nearTermSection(prev, now, TODAY).droppedToZero).toEqual([]);
    }
  });
});
