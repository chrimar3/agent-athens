import { describe, test, expect } from 'bun:test';
import { classifySource, extractHost, classifyTicketSource } from '../../src/utils/ticket-source-classifier';

describe('classifySource', () => {
  test('viva.gr is a known_merchant', () => {
    expect(classifySource('https://www.viva.gr/gr-el/tickets/music/autechre/')).toBe('known_merchant');
  });

  test('athinorama.gr is a listing_aggregator', () => {
    expect(classifySource('https://www.athinorama.gr/music/gig/some-event-12345/')).toBe('listing_aggregator');
  });

  test('halfnote.gr is venue_direct_only', () => {
    expect(classifySource('https://www.halfnote.gr/en/calendar/')).toBe('venue_direct_only');
  });

  test('benaki.org is venue_direct_only', () => {
    expect(classifySource('https://www.benaki.org/some/event/path/')).toBe('venue_direct_only');
  });

  test('host not in config is unclassified', () => {
    expect(classifySource('https://example-not-in-config.com/foo')).toBe('unclassified');
  });

  test('null url is unclassified', () => {
    expect(classifySource(null)).toBe('unclassified');
  });

  test('garbage string is unclassified (no throw)', () => {
    expect(() => classifySource('not a url')).not.toThrow();
    expect(classifySource('not a url')).toBe('unclassified');
  });

  test('hostname normalization: www prefix stripped', () => {
    expect(classifySource('https://www.viva.gr/x')).toBe('known_merchant');
    expect(classifySource('https://viva.gr/x')).toBe('known_merchant');
  });

  test('hostname normalization: explicit port treated equivalently', () => {
    expect(classifySource('https://viva.gr:443/x')).toBe('known_merchant');
  });

  test('path/query/fragment irrelevant to classification', () => {
    expect(classifySource('https://viva.gr/x?y=1#z')).toBe('known_merchant');
    expect(classifySource('https://viva.gr/')).toBe('known_merchant');
  });

  test('protocol-relative URLs not supported (returns unclassified)', () => {
    // Defensive: //viva.gr is technically valid but new URL() needs base
    expect(classifySource('//viva.gr/x')).toBe('unclassified');
  });

  test('empty string is unclassified', () => {
    expect(classifySource('')).toBe('unclassified');
  });
});

describe('classifyTicketSource (S134 — emit-or-omit decision wrapper)', () => {
  // Minimal event shape — the wrapper only reads ticketUrl/ticketUrlResolved + venue.{name, website}.
  const baseEvent = {
    ticketUrl: undefined as string | null | undefined,
    ticketUrlResolved: null as string | null | undefined,
    venue: { name: 'Some Venue', website: undefined as string | undefined },
  };

  test('known_merchant → emit with host-derived Organization seller', () => {
    const decision = classifyTicketSource({
      ...baseEvent,
      ticketUrl: 'https://www.viva.gr/gr-el/tickets/music/foo/',
    });
    expect(decision).toEqual({
      merchant: { '@type': 'Organization', name: 'Viva.gr', url: 'https://viva.gr/' },
    });
  });

  test('venue_direct_only → emit with venue-derived Organization seller (url populated)', () => {
    const decision = classifyTicketSource({
      ...baseEvent,
      ticketUrl: 'https://www.halfnote.gr/en/calendar/',
      venue: { name: 'Half Note Jazz Club', website: 'https://halfnote.gr/' },
    });
    expect(decision).toEqual({
      merchant: {
        '@type': 'Organization',
        name: 'Half Note Jazz Club',
        url: 'https://halfnote.gr/',
      },
    });
  });

  test('venue_direct_only without venue.website → url omitted from seller', () => {
    const decision = classifyTicketSource({
      ...baseEvent,
      ticketUrl: 'https://www.halfnote.gr/x',
      venue: { name: 'Half Note Jazz Club', website: undefined },
    });
    expect(decision).toEqual({
      merchant: { '@type': 'Organization', name: 'Half Note Jazz Club' },
    });
  });

  test('listing_aggregator → omit Offer', () => {
    expect(
      classifyTicketSource({
        ...baseEvent,
        ticketUrl: 'https://www.athinorama.gr/music/gig/some-event/',
      }),
    ).toEqual({ omit_offer: true });
  });

  test('unclassified → omit Offer (S134 behavior change from Sprint 1)', () => {
    // Sprint 1 behavior: emit URL as-is + log warning.
    // S134: omit the entire Offer block; isAccessibleForFree:false carries the signal.
    expect(
      classifyTicketSource({
        ...baseEvent,
        ticketUrl: 'https://unknown-host.example.com/tickets/foo',
      }),
    ).toEqual({ omit_offer: true });
  });

  test('null/undefined/empty ticketUrl → omit Offer', () => {
    expect(classifyTicketSource({ ...baseEvent, ticketUrl: undefined })).toEqual({ omit_offer: true });
    expect(classifyTicketSource({ ...baseEvent, ticketUrl: null })).toEqual({ omit_offer: true });
    expect(classifyTicketSource({ ...baseEvent, ticketUrl: '' })).toEqual({ omit_offer: true });
  });

  test('ticketUrlResolved takes precedence over ticketUrl', () => {
    // Aggregator ticketUrl, resolver populated with merchant URL → emit with merchant.
    const decision = classifyTicketSource({
      ...baseEvent,
      ticketUrl: 'https://www.athinorama.gr/music/gig/some-event/',
      ticketUrlResolved: 'https://www.viva.gr/tickets/event/123',
    });
    expect(decision).toEqual({
      merchant: { '@type': 'Organization', name: 'Viva.gr', url: 'https://viva.gr/' },
    });
  });

  test('ticketUrlResolved precedence applies even when classifier would omit on raw URL', () => {
    // Aggregator raw + venue-direct resolved → emit with venue seller.
    const decision = classifyTicketSource({
      ...baseEvent,
      ticketUrl: 'https://www.athinorama.gr/x',
      ticketUrlResolved: 'https://www.halfnote.gr/y',
      venue: { name: 'Half Note', website: 'https://halfnote.gr/' },
    });
    expect(decision).toEqual({
      merchant: { '@type': 'Organization', name: 'Half Note', url: 'https://halfnote.gr/' },
    });
  });

  test('null ticketUrlResolved falls back to ticketUrl', () => {
    const decision = classifyTicketSource({
      ...baseEvent,
      ticketUrl: 'https://www.viva.gr/x',
      ticketUrlResolved: null,
    });
    expect(decision).toEqual({
      merchant: { '@type': 'Organization', name: 'Viva.gr', url: 'https://viva.gr/' },
    });
  });
});

describe('extractHost', () => {
  test('returns lowercase host without www prefix', () => {
    expect(extractHost('https://www.More.com/event/123')).toBe('more.com');
  });

  test('returns hostname for various URLs', () => {
    expect(extractHost('https://ra.co/events/2314979')).toBe('ra.co');
    expect(extractHost('https://www.ticketservices.gr/')).toBe('ticketservices.gr');
  });

  test('returns null for null input', () => {
    expect(extractHost(null)).toBe(null);
  });

  test('returns null for invalid URL', () => {
    expect(extractHost('not a url')).toBe(null);
    expect(extractHost('')).toBe(null);
  });

  test('strips port number from host (parity with classifier)', () => {
    expect(extractHost('https://viva.gr:443/x')).toBe('viva.gr');
  });
});
