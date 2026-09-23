/**
 * Synthetic events for locale tests. Every title, venue and description is
 * ASCII so that ANY Greek character in an English render is interface copy,
 * not data. Dates are relative to "today" in Europe/Athens so each card
 * branch (dated, running, implied run, open exhibition) is exercised whatever
 * day the suite runs.
 */
import { DateTime } from 'luxon';
import type { Event, EventType } from '../../../types';

function athensDay(offsetDays: number): string {
  return DateTime.now().setZone('Europe/Athens').plus({ days: offsetDays }).toISODate()!;
}

function base(id: string, type: EventType, overrides: Partial<Event>): Event {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    id,
    title: `Fixture ${id}`,
    description: 'A synthetic listing used by locale tests.',
    hasNativeGreek: false,
    startDate: `${athensDay(3)}T21:00:00`,
    type,
    genres: [],
    tags: [],
    venue: { name: 'Fixture Hall', address: '1 Test Street', neighborhood: 'Koukaki', coordinates: { lat: 37.97, lon: 23.72 } },
    price: { type: 'with-ticket' },
    ticketUrlResolved: null,
    source: 'fixture',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    language: 'en',
    ...overrides,
  } as Event;
}

export function localeFixtures(): Event[] {
  return [
    // Dated, timed, ticketed without an amount → "at HH:MM", ticketed label
    base('dated-concert', 'concert', {}),
    // Open entry
    base('open-workshop', 'workshop', { price: { type: 'open' } }),
    // Priced
    base('priced-theater', 'theater', { price: { type: 'with-ticket', amount: 15 } }),
    // Currently open exhibition with an end date → range + open badge
    base('open-exhibition', 'exhibition', { startDate: athensDay(-10), endDate: athensDay(20), price: { type: 'open' } }),
    // Same, with an image: cards render the image and tile branches separately
    base('open-exhibition-imaged', 'exhibition', { startDate: athensDay(-10), endDate: athensDay(20), price: { type: 'open' }, imageUrl: 'https://example.org/fixture.jpg' }),
    // Exhibition with no end date → "Ongoing" label
    base('ongoing-exhibition', 'exhibition', { startDate: athensDay(-10), endDate: undefined }),
    // Non-exhibition run already under way → "now running"
    base('running-festival', 'festival', { startDate: `${athensDay(-2)}T20:00:00`, endDate: athensDay(5) }),
    // Started before today, no end date → "From <date>"
    base('implied-run-performance', 'performance', { startDate: `${athensDay(-2)}T20:00:00`, endDate: undefined }),
    // Every remaining badge type
    ...(['dj_set', 'cinema', 'show', 'tech', 'dance', 'other'] as EventType[]).map(t => base(`badge-${t}`, t, {})),
  ];
}
