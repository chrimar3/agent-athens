/**
 * Tests for src/ticketing/cta.ts — resolveCtaForEvent.
 *
 * Validates:
 *   - D7: CTA decision table (status × price × venue.website → CtaResult)
 *   - D8: secondary venue link rule (platform_search/venue_registry_search + cross-host website)
 *   - Legacy: undefined status treated as 'unresolved'
 */

import { describe, test, expect } from 'bun:test';
import { resolveCtaForEvent } from '../../src/ticketing/cta';
import { STRINGS } from '../../src/i18n/strings';
import type { Event } from '../../src/types';

const t = STRINGS.en;

/**
 * Minimal Event factory. Only fields consulted by resolveCtaForEvent are meaningful;
 * the rest get harmless defaults cast through `as Event` to satisfy the signature.
 */
function mkEvent(overrides: {
  ticketUrl?: string;
  ticketUrlStatus?: Event['ticketUrlStatus'];
  priceType?: Event['price']['type'];
  venueWebsite?: string | null;
}): Event {
  return {
    venue: { name: 'Test Venue', website: overrides.venueWebsite ?? undefined },
    price: { type: overrides.priceType ?? 'with-ticket' },
    ticketUrl: overrides.ticketUrl,
    ticketUrlStatus: overrides.ticketUrlStatus,
  } as unknown as Event;
}

describe('resolveCtaForEvent — D7 decision table', () => {
  // --- price guards (highest priority) ---
  test('price=open suppresses CTA regardless of status', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        priceType: 'open',
        ticketUrl: 'https://more.com/tickets/abc',
        ticketUrlStatus: 'direct',
      }),
      t
    );
    expect(r.kind).toBe('none');
  });

  test('price=donation suppresses CTA regardless of status', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        priceType: 'donation',
        ticketUrl: 'https://more.com/tickets/abc',
        ticketUrlStatus: 'direct',
      }),
      t
    );
    expect(r.kind).toBe('none');
  });

  // --- Buy tickets (high-confidence statuses) ---
  test('direct → Buy tickets', () => {
    const r = resolveCtaForEvent(
      mkEvent({ ticketUrl: 'https://more.com/tickets/abc', ticketUrlStatus: 'direct' }),
      t
    );
    expect(r.kind).toBe('tickets');
    expect(r.label).toBe(t.buyTicketsArrow);
    expect(r.href).toBe('https://more.com/tickets/abc');
  });

  test('detail_page → Buy tickets', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://more.com/tickets/abc',
        ticketUrlStatus: 'detail_page',
      }),
      t
    );
    expect(r.label).toBe(t.buyTicketsArrow);
  });

  test('venue_registry_direct → Buy tickets', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://megaron.gr/event/x',
        ticketUrlStatus: 'venue_registry_direct',
      }),
      t
    );
    expect(r.label).toBe(t.buyTicketsArrow);
  });

  test('crossref → Buy tickets', () => {
    const r = resolveCtaForEvent(
      mkEvent({ ticketUrl: 'https://ra.co/events/xyz', ticketUrlStatus: 'crossref' }),
      t
    );
    expect(r.label).toBe(t.buyTicketsArrow);
  });

  test('ai_discovered → Buy tickets', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://viva.gr/tickets/x',
        ticketUrlStatus: 'ai_discovered',
      }),
      t
    );
    expect(r.label).toBe(t.buyTicketsArrow);
  });

  // --- Find tickets (search-style statuses) ---
  test('venue_registry_search → Find tickets', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://more.com/search?q=x',
        ticketUrlStatus: 'venue_registry_search',
      }),
      t
    );
    expect(r.kind).toBe('tickets');
    expect(r.label).toBe(t.findTicketsArrow);
  });

  test('platform_search → Find tickets', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://more.com/search?query=lah',
        ticketUrlStatus: 'platform_search',
      }),
      t
    );
    expect(r.label).toBe(t.findTicketsArrow);
  });

  // --- Venue fallback ---
  test('venue_fallback with venue.website → Check venue website + host subLabel', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrlStatus: 'venue_fallback',
        venueWebsite: 'https://gazarte.gr',
      }),
      t
    );
    expect(r.kind).toBe('venue');
    expect(r.label).toBe(t.checkVenueArrow);
    expect(r.href).toBe('https://gazarte.gr');
    expect(r.subLabel).toBe('gazarte.gr');
  });

  test('venue_fallback without venue.website → none', () => {
    const r = resolveCtaForEvent(mkEvent({ ticketUrlStatus: 'venue_fallback' }), t);
    expect(r.kind).toBe('none');
  });

  // --- Door only ---
  test('door_only → door CTA, href=null', () => {
    const r = resolveCtaForEvent(mkEvent({ ticketUrlStatus: 'door_only' }), t);
    expect(r.kind).toBe('door');
    expect(r.label).toBe(t.doorOnly);
    expect(r.href).toBeNull();
  });

  // --- Unresolved + legacy undefined ---
  test('unresolved with venue.website → venue CTA', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrlStatus: 'unresolved',
        venueWebsite: 'https://ilionplus.gr',
      }),
      t
    );
    expect(r.kind).toBe('venue');
  });

  test('unresolved without venue.website → none', () => {
    const r = resolveCtaForEvent(mkEvent({ ticketUrlStatus: 'unresolved' }), t);
    expect(r.kind).toBe('none');
  });

  test('legacy undefined status with venue.website → venue CTA (treat as unresolved)', () => {
    const r = resolveCtaForEvent(
      mkEvent({ venueWebsite: 'https://six-dogs.gr' }),
      t
    );
    expect(r.kind).toBe('venue');
  });

  test('legacy undefined status without venue.website → none', () => {
    const r = resolveCtaForEvent(mkEvent({}), t);
    expect(r.kind).toBe('none');
  });
});

describe('resolveCtaForEvent — D8 secondary venue link', () => {
  test('platform_search with cross-host venue.website → secondary set', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://more.com/search?q=x',
        ticketUrlStatus: 'platform_search',
        venueWebsite: 'https://ilionplus.gr',
      }),
      t
    );
    expect(r.kind).toBe('tickets');
    expect(r.secondaryHref).toBe('https://ilionplus.gr');
    expect(r.secondaryHost).toBe('ilionplus.gr');
  });

  test('venue_registry_search with cross-host venue.website → secondary set', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://ticketservices.gr/search?q=x',
        ticketUrlStatus: 'venue_registry_search',
        venueWebsite: 'https://gazarte.gr',
      }),
      t
    );
    expect(r.secondaryHref).toBe('https://gazarte.gr');
    expect(r.secondaryHost).toBe('gazarte.gr');
  });

  test('direct status does NOT set secondary link (high-confidence, no user backup needed)', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://more.com/tickets/abc',
        ticketUrlStatus: 'direct',
        venueWebsite: 'https://ilionplus.gr',
      }),
      t
    );
    expect(r.secondaryHref).toBeUndefined();
  });

  test('platform_search with SAME-host venue.website does NOT set secondary (dedupe)', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://more.com/search?q=x',
        ticketUrlStatus: 'platform_search',
        venueWebsite: 'https://more.com',
      }),
      t
    );
    expect(r.secondaryHref).toBeUndefined();
  });

  test('venue_registry_search without venue.website → no secondary (nothing to link to)', () => {
    const r = resolveCtaForEvent(
      mkEvent({
        ticketUrl: 'https://more.com/search?q=x',
        ticketUrlStatus: 'venue_registry_search',
      }),
      t
    );
    expect(r.secondaryHref).toBeUndefined();
  });
});
