/**
 * S134 — Single emission gate for JSON-LD/microdata Offer construction.
 *
 * `buildOfferOrOmit(event)` composes:
 *   1. eventStatus → availability mapping (EventCompleted → omit)
 *   2. classifier-gated dispatch for with-ticket events (omit on
 *      listing_aggregator / unclassified; emit with appropriate seller
 *      on known_merchant / venue_direct_only)
 *   3. open/donation events emit with venue seller + price 0 + self-canonical URL
 *
 * Seller emission stays at shape (a) — nested-literal Organization. Sprint 3's
 * envelope migration will move callers to shape (b) `@id`-referenced; this
 * helper's contract is shape-agnostic at the call site (spread `decision.offer`
 * into JSON-LD regardless of the seller shape).
 *
 * Telemetry: a module-scoped counter records omissions by source domain so
 * `src/generate-site.ts` can write `logs/offer-omissions-latest.json` at build
 * end. Reset via `resetOfferOmissionsCounter()`; snapshot via
 * `snapshotOfferOmissions()`.
 */

import {
  classifyTicketSource,
  extractHost,
  type OfferSellerOrganization,
} from '../utils/ticket-source-classifier';
import { availabilityForEventStatus, getCurrencyCode } from '../utils/schema-geo';

export interface OfferObject {
  '@type': 'Offer';
  price?: string;
  priceCurrency: string;
  availability: string;
  url?: string;
  seller: OfferSellerOrganization;
}

export type OfferDecision = { omit: true } | { offer: OfferObject };

export interface OfferBuilderEvent {
  price: {
    type: 'open' | 'donation' | 'with-ticket';
    amount?: number;
    currency?: string;
  };
  ticketUrl?: string | null;
  ticketUrlResolved?: string | null;
  venue: {
    name: string;
    website?: string;
  };
  eventStatus?: string;
  /**
   * Caller-computed canonical URL for this event's detail page. Required only
   * for open/donation events (used as `offer.url`); ignored for with-ticket
   * events.
   */
  selfCanonicalUrl?: string;
}

// ----- Telemetry -----

const omissions = new Map<string, number>();

function incrementOmission(key: string): void {
  omissions.set(key, (omissions.get(key) ?? 0) + 1);
}

/**
 * Snapshot the current omission counts. Returns a new object each call (safe
 * to JSON-stringify). Caller is responsible for calling `resetOfferOmissionsCounter`
 * before a fresh build if accumulation across builds is undesired.
 */
export function snapshotOfferOmissions(): Record<string, number> {
  return Object.fromEntries(omissions);
}

/**
 * Reset the omissions counter to empty. Call at build start in `generate-site.ts`
 * so each build writes a clean baseline to `logs/offer-omissions-latest.json`.
 */
export function resetOfferOmissionsCounter(): void {
  omissions.clear();
}

// ----- Core decision -----

function venueSeller(venue: { name: string; website?: string }): OfferSellerOrganization {
  const seller: OfferSellerOrganization = {
    '@type': 'Organization',
    name: venue.name,
  };
  if (venue.website) {
    seller.url = venue.website;
  }
  return seller;
}

function omissionKeyForUrl(url: string | null | undefined): string {
  if (!url) return 'manual-source-no-url';
  const host = extractHost(url);
  return host ?? 'unparseable-url';
}

export function buildOfferOrOmit(event: OfferBuilderEvent): OfferDecision {
  // Past-event precedent: EventCompleted → omit entire Offer block.
  if (event.eventStatus) {
    const availability = availabilityForEventStatus(event.eventStatus);
    if (availability.kind === 'omit_offer') {
      incrementOmission('past-event');
      return { omit: true };
    }
  }

  // Open / donation events: emit with venue seller, price 0, self-canonical URL.
  if (event.price.type === 'open' || event.price.type === 'donation') {
    const availability = event.eventStatus
      ? availabilityForEventStatus(event.eventStatus)
      : { kind: 'emit' as const, value: 'https://schema.org/InStock' as const };

    // EventCompleted already handled above; this is defensive for unknown statuses.
    if (availability.kind === 'omit_offer') {
      incrementOmission('past-event');
      return { omit: true };
    }

    const offer: OfferObject = {
      '@type': 'Offer',
      price: '0',
      priceCurrency: event.price.currency || getCurrencyCode(),
      availability: availability.value,
      seller: venueSeller(event.venue),
    };
    if (event.selfCanonicalUrl) {
      offer.url = event.selfCanonicalUrl;
    }
    return { offer };
  }

  // with-ticket — classifier-gated dispatch.
  const decision = classifyTicketSource(event);
  if ('omit_offer' in decision) {
    incrementOmission(omissionKeyForUrl(event.ticketUrlResolved ?? event.ticketUrl));
    return { omit: true };
  }

  const availability = event.eventStatus
    ? availabilityForEventStatus(event.eventStatus)
    : { kind: 'emit' as const, value: 'https://schema.org/InStock' as const };

  if (availability.kind === 'omit_offer') {
    incrementOmission('past-event');
    return { omit: true };
  }

  const effectiveUrl = event.ticketUrlResolved ?? event.ticketUrl ?? undefined;
  const offer: OfferObject = {
    '@type': 'Offer',
    priceCurrency: event.price.currency || getCurrencyCode(),
    availability: availability.value,
    seller: decision.merchant,
  };

  // Known-merchant Offer emits the ticket URL; venue_direct_only does not
  // (venue is the seller, but the URL isn't a merchant checkout).
  const isVenueDirectSeller = decision.merchant.name === event.venue.name;
  if (effectiveUrl && !isVenueDirectSeller) {
    offer.url = effectiveUrl;
  }

  const priceStr = event.price.amount != null ? String(event.price.amount).trim() : '';
  // Phase-2 B (visibility 2026-07-08): amount 0 on a with-ticket event is a
  // data contradiction (a truly free event is price.type 'open'), and price:"0"
  // asserts "free" on a paid event — a trust defect (live example: Release
  // Athens/Sabaton, an €80 festival, shipped price:"0"). Same policy as
  // price-less: omit the Offer rather than assert an unsourced price.
  if (priceStr === '' || Number(priceStr) === 0) {
    // Schema.org Offer without a price field is malformed. Omit the whole
    // Offer block rather than emit a price-less merchant Offer.
    incrementOmission('no-price-amount');
    return { omit: true };
  }
  offer.price = priceStr;

  return { offer };
}
