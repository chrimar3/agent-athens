import { describe, test, expect } from 'bun:test';
import { DateTime } from 'luxon';
import { selectPublishedPopulation, selectUpcomingListing } from '../event-populations';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

// The build's population pipeline, extracted from generate-site.ts so each
// stage is guarded: round-1 review found the rollover filter and the public
// view could be deleted from the build with the whole suite still green.
const day = (o: number) => DateTime.now().setZone('Europe/Athens').plus({ days: o }).toISODate()!;
const ev = (over: Partial<Event>): Event => ({ ...sampleConcert, locationStatus: 'verified_athens', ...over } as Event);

describe('selectPublishedPopulation', () => {
  test('keeps publishable statuses only', () => {
    const { events } = selectPublishedPopulation([
      ev({ id: 'ok' }), ev({ id: 'pass', locationStatus: 'pass_through' }),
      ev({ id: 'unv', locationStatus: 'unverified' }), ev({ id: 'rej', locationStatus: 'rejected_non_athens' }),
    ]);
    expect(events.map(e => e.id)).toEqual(['ok', 'pass']);
  });

  test('holds back athinorama rollover suspects and counts them', () => {
    const r = selectPublishedPopulation([
      ev({ id: 'phantom', source: 'athinorama.gr', createdAt: '2026-02-02 10:00:00', startDate: '2027-01-30T21:00:00' }),
      ev({ id: 'real', source: 'athinorama.gr', createdAt: '2026-09-01 10:00:00', startDate: '2026-10-01T21:00:00' }),
    ]);
    expect(r.events.map(e => e.id)).toEqual(['real']);
    expect(r.rolloverHeld).toBe(1);
  });

  test('applies the public view (default price amounts and markers removed)', () => {
    const { events } = selectPublishedPopulation([ev({
      id: 'p', priceSource: 'venue_default', price: { type: 'with-ticket', amount: 25, currency: 'EUR' },
      fullDescription: 'Real text. <!-- timeliness-expires: x -->',
    })]);
    expect(events[0].price.amount ?? null).toBeNull();
    expect(events[0].fullDescription).toBe('Real text.');
  });
});

describe('selectUpcomingListing', () => {
  test('drops past events, keeps running exhibitions, one per duplicate group', () => {
    const out = selectUpcomingListing([
      ev({ id: 'past', startDate: `${day(-3)}T21:00:00`, endDate: undefined }),
      ev({ id: 'soon', startDate: `${day(2)}T21:00:00`, endDate: undefined }),
      ev({ id: 'dup', startDate: `${day(2)}T21:00:00`, endDate: undefined, mergedInto: 'soon' }),
      ev({ id: 'run', type: 'exhibition', startDate: day(-30), endDate: day(10) }),
    ], new Date());
    expect(out.map(e => e.id)).toEqual(['soon', 'run']);
  });
});
