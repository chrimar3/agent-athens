/**
 * Tests for src/ticketing/offer-builder.ts — buildOfferOrOmit() single emission gate.
 *
 * Behavior contract:
 *   - open / donation events → emit Offer with venue as seller, price 0
 *   - with-ticket + EventCompleted → omit (precedent: past events get no Offer)
 *   - with-ticket + known_merchant → emit Offer with host-derived merchant seller
 *   - with-ticket + venue_direct_only → emit Offer with venue seller, no offers.url
 *   - with-ticket + listing_aggregator → omit (S134 behavior change)
 *   - with-ticket + unclassified → omit (S134 behavior change)
 *
 * Shape (a) — nested-literal Organization seller. No @id, no @graph. Sprint 3
 * envelope migration will move to shape (b); this helper's contract is shape-
 * agnostic at the call site (callers spread `decision.offer` into the JSON-LD
 * structure regardless of seller shape).
 */

import { describe, test, expect } from 'bun:test';
import { buildOfferOrOmit } from '../../src/ticketing/offer-builder';

// Minimal event shape — buildOfferOrOmit reads only these fields.
type TestEvent = {
  id: string;
  price: { type: 'open' | 'donation' | 'with-ticket'; amount?: number; currency?: string };
  ticketUrl?: string | null;
  ticketUrlResolved?: string | null;
  venue: { name: string; website?: string };
  eventStatus?: string;
  selfCanonicalUrl?: string;
};

const baseVenue = { name: 'Some Venue', website: 'https://somevenue.example/' };

const baseEvent: TestEvent = {
  id: 'test-event-1',
  price: { type: 'with-ticket', amount: 15, currency: 'EUR' },
  ticketUrl: 'https://www.viva.gr/tickets/foo',
  ticketUrlResolved: null,
  venue: baseVenue,
  eventStatus: 'https://schema.org/EventScheduled',
  selfCanonicalUrl: 'https://agentathens.com/events/test-event-1/',
};

describe('buildOfferOrOmit', () => {
  describe('open / donation events', () => {
    test('open event → emit Offer with venue seller, price 0, self-canonical URL', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        price: { type: 'open' },
        ticketUrl: null,
        venue: { name: 'Gagosian Athens', website: 'https://gagosian.com/' },
      });
      expect(decision).toEqual({
        offer: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
          url: 'https://agentathens.com/events/test-event-1/',
          seller: {
            '@type': 'Organization',
            name: 'Gagosian Athens',
            url: 'https://gagosian.com/',
          },
        },
      });
    });

    test('donation event → same shape as open', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        price: { type: 'donation' },
        ticketUrl: null,
      });
      expect('offer' in decision).toBe(true);
      if ('offer' in decision) {
        expect(decision.offer.price).toBe('0');
        expect(decision.offer.seller.name).toBe('Some Venue');
      }
    });

    test('open event with venue lacking website → seller url omitted', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        price: { type: 'open' },
        venue: { name: 'Venue No Web', website: undefined },
      });
      if ('offer' in decision) {
        expect(decision.offer.seller).toEqual({
          '@type': 'Organization',
          name: 'Venue No Web',
        });
      } else {
        throw new Error('expected emit');
      }
    });
  });

  describe('with-ticket — lifecycle precedence', () => {
    test('EventCompleted → omit Offer (past-event precedent preserved)', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        eventStatus: 'https://schema.org/EventCompleted',
      });
      expect(decision).toEqual({ omit: true });
    });

    test('EventScheduled with known merchant → emit', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        eventStatus: 'https://schema.org/EventScheduled',
        ticketUrl: 'https://www.viva.gr/tickets/foo',
      });
      expect('offer' in decision).toBe(true);
    });
  });

  describe('with-ticket — classifier dispatch', () => {
    test('known_merchant → emit with host-derived seller + offers.url', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        ticketUrl: 'https://www.viva.gr/tickets/foo',
      });
      expect(decision).toEqual({
        offer: {
          '@type': 'Offer',
          price: '15',
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
          url: 'https://www.viva.gr/tickets/foo',
          seller: {
            '@type': 'Organization',
            name: 'Viva.gr',
            url: 'https://viva.gr/',
          },
        },
      });
    });

    test('venue_direct_only → emit with venue seller, no offers.url', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        ticketUrl: 'https://www.halfnote.gr/calendar/',
        venue: { name: 'Half Note Jazz Club', website: 'https://halfnote.gr/' },
      });
      if (!('offer' in decision)) throw new Error('expected emit');
      expect(decision.offer.seller).toEqual({
        '@type': 'Organization',
        name: 'Half Note Jazz Club',
        url: 'https://halfnote.gr/',
      });
      expect(decision.offer.url).toBeUndefined();
    });

    test('listing_aggregator → omit Offer (S134 behavior change)', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        ticketUrl: 'https://www.athinorama.gr/music/gig/abc/',
      });
      expect(decision).toEqual({ omit: true });
    });

    test('unclassified → omit Offer (S134 behavior change)', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        ticketUrl: 'https://unknown-host.example.com/x',
      });
      expect(decision).toEqual({ omit: true });
    });

    test('null ticketUrl on with-ticket → omit Offer', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        ticketUrl: null,
      });
      expect(decision).toEqual({ omit: true });
    });

    test('ticketUrlResolved takes precedence over ticketUrl in dispatch', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        ticketUrl: 'https://www.athinorama.gr/x',  // would omit on its own
        ticketUrlResolved: 'https://www.viva.gr/y', // known_merchant → emit
      });
      if (!('offer' in decision)) throw new Error('expected emit');
      expect(decision.offer.url).toBe('https://www.viva.gr/y');
      expect(decision.offer.seller.name).toBe('Viva.gr');
    });
  });

  describe('price handling', () => {
    test('with-ticket without amount → omit entire Offer (Schema.org requires price on merchant Offer)', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        price: { type: 'with-ticket', currency: 'EUR' },
        ticketUrl: 'https://www.viva.gr/x',
      });
      // Prior behavior emitted a price-less Offer block, which is Schema.org-invalid.
      // Fix (2026-05-12, s-tba-resolution): omit the whole Offer + record telemetry.
      expect(decision).toEqual({ omit: true });
    });

    test('with-ticket with numeric amount → price as string', () => {
      const decision = buildOfferOrOmit({
        ...baseEvent,
        price: { type: 'with-ticket', amount: 25, currency: 'EUR' },
        ticketUrl: 'https://www.viva.gr/x',
      });
      if (!('offer' in decision)) throw new Error('expected emit');
      expect(decision.offer.price).toBe('25');
    });
  });
});
