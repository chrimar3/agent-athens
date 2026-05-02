import { describe, test, expect } from 'bun:test';
import { classifySource, extractHost } from '../../src/utils/ticket-source-classifier';

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
