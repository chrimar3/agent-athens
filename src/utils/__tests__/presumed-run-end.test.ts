import { describe, test, expect } from 'bun:test';
import { DateTime } from 'luxon';
import { selectPublishedPopulation } from '../event-populations';
import { resolveEffectiveEnd } from '../event-lifecycle';
import { isCurrentlyOpen, formatExhibitionDateRange } from '../filters';
import { formatDateRange } from '../i18n-date';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

// snfcc lists some exhibitions as one row per open day with no end_date
// ("Μαζί, Ορατές": 79 rows, 26 May–29 Aug 2026). Each row alone presumed a
// 90-day run, so the show read "Τώρα ανοιχτή … Συνεχίζεται" into November.
// The last listed day is NOT a stated end (Kruger's daily rows stopped on
// 23 Jun while the show runs to 1 Nov), so it is only ever a presumption:
// no EventCompleted, no invented end date on the page.
const day = (o: number) => DateTime.now().setZone('Europe/Athens').plus({ days: o }).toISODate()!;
const ev = (over: Partial<Event>): Event => ({ ...sampleConcert, locationStatus: 'verified_athens', ...over } as Event);
const inst = (id: string, date: string, over: Partial<Event> = {}) =>
  ev({ id, type: 'exhibition', title: 'Μαζί, Ορατές', venue: { ...sampleConcert.venue, name: 'ΚΠΙΣΝ' }, source: 'snfcc', startDate: date, endDate: undefined, createdAt: `${date} 09:00:00`, ...over });
// Source activity after the run's last listed day: the scraper kept listing, the show did not reappear.
const laterRow = ev({ id: 'later', source: 'snfcc', title: 'Άλλη εκδήλωση', startDate: day(3), createdAt: `${day(-1)} 09:00:00` });

describe('presumed end of a run of dated exhibition instances', () => {
  const run = () => selectPublishedPopulation([inst('a', day(-60)), inst('b', day(-20)), inst('c', day(-10)), laterRow]).events;

  test('every instance presumes the run ended on its last listed day', () => {
    const events = run().filter(e => e.type === 'exhibition');
    expect(events).toHaveLength(3); // precondition
    expect(events.every(e => e.presumedEndDate === day(-10))).toBe(true);
    expect(events.every(e => e.endDate === undefined)).toBe(true);
  });

  test('the presumed end is a presumption, and a stated end wins', () => {
    expect(resolveEffectiveEnd({ startDate: day(-60), type: 'exhibition', presumedEndDate: day(-10) })).toEqual({ date: day(-10), presumed: true });
    expect(resolveEffectiveEnd({ startDate: day(-60), type: 'exhibition', endDate: day(30), presumedEndDate: day(-10) })).toEqual({ date: day(30), presumed: false });
  });

  test('a run whose last listed day has passed is no longer open', () => {
    const a = run().find(e => e.id === 'a')!;
    expect(isCurrentlyOpen({ ...a, presumedEndDate: undefined })).toBe(true); // precondition: the 90-day presumption alone kept it open
    expect(isCurrentlyOpen(a)).toBe(false);
  });

  test('no presumption while the source has not listed anything since (still being listed)', () => {
    const events = selectPublishedPopulation([inst('a', day(-4)), inst('b', day(0))]).events;
    expect(events.map(e => e.presumedEndDate)).toEqual([undefined, undefined]);
  });

  test('a lone row, another venue, or theatre nights get no presumed end', () => {
    const lone = selectPublishedPopulation([inst('solo', day(-10)), laterRow]).events;
    expect(lone.find(e => e.id === 'solo')!.presumedEndDate).toBeUndefined();
    const venues = selectPublishedPopulation([inst('a', day(-20)), inst('b', day(-10), { venue: { ...sampleConcert.venue, name: 'Μπενάκη' } }), laterRow]).events;
    expect(venues.filter(e => e.type === 'exhibition').map(e => e.presumedEndDate)).toEqual([undefined, undefined]);
    const theatre = selectPublishedPopulation([inst('a', day(-20), { type: 'theater' }), inst('b', day(-10), { type: 'theater' }), laterRow]).events;
    expect(theatre.filter(e => e.type === 'theater').map(e => e.presumedEndDate)).toEqual([undefined, undefined]);
  });

  // Round-2 review: snfcc Kruger has one row ending 1 Nov and 23 daily rows
  // that stop on 23 Jun; the stated end outranks the silence of the daily rows.
  test('a stated end on any row of the run means nothing is presumed', () => {
    const without = selectPublishedPopulation([inst('b', day(-20)), inst('c', day(-10)), laterRow]).events;
    expect(without.find(e => e.id === 'b')!.presumedEndDate).toBe(day(-10)); // precondition: the rule fires without the stated row
    const events = selectPublishedPopulation([inst('a', day(-60), { endDate: day(30) }), inst('b', day(-20)), inst('c', day(-10)), laterRow]).events;
    expect(events.map(e => e.presumedEndDate)).toEqual([undefined, undefined, undefined, undefined]);
  });

  test('one missed listing day does not end a run (the source must have moved on by 2+ days)', () => {
    const oneDay = ev({ id: 'next', source: 'snfcc', title: 'Άλλη', startDate: day(3), createdAt: `${day(-1)} 09:00:00` });
    const events = selectPublishedPopulation([inst('a', day(-5)), inst('b', day(-2)), oneDay]).events;
    expect(events.filter(e => e.type === 'exhibition').map(e => e.presumedEndDate)).toEqual([undefined, undefined]);
    const twoDays = selectPublishedPopulation([inst('a', day(-5)), inst('b', day(-3)), oneDay]).events;
    expect(twoDays.find(e => e.id === 'b')!.presumedEndDate).toBe(day(-3)); // boundary: 2 days later does presume
  });
});

describe('"Ongoing" is said only while the run is presumed open', () => {
  const open = ev({ type: 'exhibition', startDate: day(-10), endDate: undefined });
  const lapsed = ev({ type: 'exhibition', startDate: day(-120), endDate: undefined });

  test('Greek', () => {
    expect(formatExhibitionDateRange(open)).toContain('Συνεχίζεται');
    expect(formatExhibitionDateRange(lapsed)).not.toContain('Συνεχίζεται');
  });

  test('English', () => {
    expect(formatDateRange(open, 'en')).toContain('Ongoing');
    expect(formatDateRange(lapsed, 'en')).not.toContain('Ongoing');
  });
});
