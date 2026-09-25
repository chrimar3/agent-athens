import { describe, test, expect } from 'bun:test';
import { buildDataFeed } from '../datafeed';
import { DateTime } from 'luxon';
import {
  sampleConcert as historicalConcert,
  sampleConcertWithTicket,
  sampleFreeExhibition as historicalExhibition,
  sampleTheaterPerformance as historicalTheater,
} from '../../../tests/fixtures/events';
import type { Event } from '../../types';

// Feed membership now follows lifecycle eligibility; historical examples must
// explicitly be upcoming for tests that exercise their emitted fields.
const startDate = DateTime.now().setZone('Europe/Athens').plus({ days: 14 }).toISODate()!;
const sampleConcert: Event = { ...historicalConcert, startDate, endDate: undefined, fullDescriptionEn: historicalConcert.fullDescription };
const sampleFreeExhibition: Event = { ...historicalExhibition, startDate, endDate: undefined };
const sampleTheaterPerformance: Event = { ...historicalTheater, startDate, endDate: undefined };

describe('buildDataFeed', () => {
  test('empty input returns valid DataFeed with empty dataFeedElement', () => {
    const feed = buildDataFeed([], 'el');
    expect(feed['@type']).toBe('DataFeed');
    expect(feed['@context']).toBe('https://schema.org');
    expect(feed.dataFeedElement).toEqual([]);
    expect(feed.name.length).toBeGreaterThan(0);
    expect(feed.description.length).toBeGreaterThan(0);
    expect(feed.dateModified.length).toBeGreaterThan(0);
  });

  test('mandatory Schema.org DataFeed fields are present', () => {
    const feed = buildDataFeed([sampleConcert], 'el');
    expect(feed).toHaveProperty('@context', 'https://schema.org');
    expect(feed).toHaveProperty('@type', 'DataFeed');
    expect(feed).toHaveProperty('name');
    expect(feed).toHaveProperty('description');
    expect(feed).toHaveProperty('dateModified');
    expect(feed).toHaveProperty('dataFeedElement');
    expect(Array.isArray(feed.dataFeedElement)).toBe(true);
  });

  test('dataFeedElement includes each eligible upcoming event', () => {
    const events = [sampleConcert, sampleFreeExhibition, sampleTheaterPerformance];
    const feed = buildDataFeed(events, 'el');
    expect(feed.dataFeedElement).toHaveLength(3);
  });

  test('feed entries retain their Event fields and stable public identifiers', () => {
    const events = [sampleConcert, sampleFreeExhibition];
    const feed = buildDataFeed(events, 'el');
    expect(feed.dataFeedElement[0]).toMatchObject({
      '@id': 'https://agentathens.com/events/jazz-nig-half-note-jazz-club-jazz-night-at-half-note/#event',
      name: 'Jazz Night at Half Note', '@type': 'MusicEvent', inLanguage: 'en',
    });
    expect(feed.dataFeedElement[1]).toMatchObject({
      name: 'Contemporary Art at Gagosian', '@type': 'ExhibitionEvent', isAccessibleForFree: true,
    });
    // Spot-check that the wrapped Event carries the canonical fields
    expect(feed.dataFeedElement[0]).toHaveProperty('@type');
    expect(feed.dataFeedElement[0]).toHaveProperty('name');
    expect(feed.dataFeedElement[0]).toHaveProperty('startDate');
    expect(feed.dataFeedElement[0]).toHaveProperty('location');
  });

  test('venue_direct_only emits scalar Organization seller inside dataFeedElement (S134 simplification)', () => {
    // benaki.org is in the venue_direct_only classifier per Sprint 1 Canonical Entity Graph spec.
    // S134 simplifies seller from dual-type ['Place', 'Organization'] to scalar 'Organization'
    // per Strategist's 2026-05-11 verbatim contract. Dual-type was a Sprint 1 acknowledged-interim
    // detail not preserved in the consolidated S134 rewrite.
    const venueDirectEvent: Event = {
      ...sampleConcertWithTicket,
      startDate: new Date(Date.now() + 86400000 * 14).toISOString(),
      endDate: undefined,
      // Round 8 ticket trust (src/ticketing/ticket-trust.ts): a benaki.org ticket
      // URL is published only for an event whose source is Benaki (its own
      // domain) — the way such URLs reach the site — not for any source.
      source: 'benaki',
      ticketUrl: 'https://www.benaki.org/event/123/',
      venue: {
        ...sampleConcertWithTicket.venue,
        website: 'https://www.benaki.org/',
      },
    };
    const feed = buildDataFeed([venueDirectEvent], 'el');
    const wrappedEvent = feed.dataFeedElement[0];
    expect(wrappedEvent.offers.seller['@type']).toBe('Organization');
    expect(wrappedEvent.offers.seller.name).toBe(venueDirectEvent.venue.name);
    expect(wrappedEvent.offers.url).toBeUndefined();
  });

  test('dateModified is a valid ISO timestamp', () => {
    const feed = buildDataFeed([sampleConcert], 'el');
    expect(feed.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(feed.dateModified).toString()).not.toBe('Invalid Date');
  });

  test('meta.lastUpdate is present (required for writeJsonApiIfChangedSync timestamp preservation)', () => {
    const feed = buildDataFeed([sampleConcert], 'el');
    expect(feed.meta).toBeDefined();
    expect(typeof feed.meta.lastUpdate).toBe('string');
    expect(feed.meta.lastUpdate.length).toBeGreaterThan(0);
  });

  test('meta.lastUpdate matches dateModified at build time', () => {
    const feed = buildDataFeed([sampleConcert], 'el');
    // Both timestamps are taken from the same `new Date().toISOString()` call.
    expect(feed.meta.lastUpdate).toBe(feed.dateModified);
  });

  test('default feed retains root URLs without relabelling English prose as Greek', () => {
    const feedDefault = buildDataFeed([sampleConcert]);
    const feedExplicit = buildDataFeed([sampleConcert], 'el');
    expect(feedDefault.dataFeedElement[0]).toEqual(feedExplicit.dataFeedElement[0]);
    expect(feedDefault.dataFeedElement[0].inLanguage).toBe('en');
    expect(feedDefault.dataFeedElement[0].url).toContain('https://agentathens.com/events/');
  });

  test('locale=en propagates into wrapped events', () => {
    const feed = buildDataFeed([sampleConcert], 'en');
    expect(feed.dataFeedElement[0].inLanguage).toBe('en');
  });
});
