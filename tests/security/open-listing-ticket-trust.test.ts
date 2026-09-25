/**
 * Anti-phishing: on sources where anyone can list an event (Resident Advisor,
 * cometogether.live, Eventbrite/Meetup/Luma) — and since round 8 on every
 * other source too (ticket-trust-all-sources.test.ts) — a ticket link is published only
 * when its host is a known ticketing platform (getTicketHosts + the
 * classifier's known_merchants) or the source's own domain. Otherwise the
 * ticket link is dropped from the CTA, the JSON-LD Offer and the JSON files,
 * and the CTA falls back to the source listing URL. Round-3 judge A, aspect 8.
 */
import { describe, expect, test } from 'bun:test';
import { load } from 'cheerio';
import { isTrustedTicketUrl, applyTicketTrust } from '../../src/ticketing/ticket-trust';
import { resolveCtaForEvent } from '../../src/ticketing/cta';
import { buildOfferOrOmit } from '../../src/ticketing/offer-builder';
import { sanitizeEventUrlFields } from '../../src/utils/safe-url';
import { renderEventDetailPage } from '../../src/generators/event-page';
import { STRINGS } from '../../src/i18n/strings';
import { sampleConcert } from '../fixtures/events';
import type { Event } from '../../src/types';

const t = STRINGS.en;
const PHISH = [
  'https://ra-tickets.example/checkout?e=123',
  'https://more.com.evil.example/tickets/x',
  'https://evil-viva.gr/tickets/x',
  'https://viva.gr.pay-secure.example/x',
  'http://cometogether-live.example/buytickets/1',
];

const listed = (over: Partial<Event>): Event => ({
  ...sampleConcert,
  startDate: '2099-01-01T21:00:00+02:00',
  endDate: undefined,
  source: 'residentadvisor',
  url: 'https://ra.co/events/2000001',
  ticketUrlStatus: 'ai_discovered',
  ...over,
} as Event);

describe('isTrustedTicketUrl', () => {
  for (const source of ['residentadvisor', 'cometogether', 'eventbrite', 'meetup', 'luma', 'ra']) {
    for (const url of PHISH) {
      test(`${source}: refuses ${url}`, () => expect(isTrustedTicketUrl(url, source)).toBe(false));
    }
  }
  for (const url of ['https://www.viva.gr/tickets/x/', 'https://www.more.com/gr-el/tickets/x/', 'https://tickets.onassis.org/x', 'https://www.ticketservices.gr/event/x', 'https://ra.co/events/1']) {
    test(`residentadvisor: allows ticketing platform ${url}`, () => expect(isTrustedTicketUrl(url, 'residentadvisor')).toBe(true));
  }
  test('own domain is allowed: cometogether.live for cometogether, not for RA', () => {
    expect(isTrustedTicketUrl('https://cometogether.live/el/buytickets/1', 'cometogether')).toBe(true);
    expect(isTrustedTicketUrl('https://cometogether.live/el/buytickets/1', 'residentadvisor')).toBe(false);
  });
  // Round 8: the rule now covers every source (tests/security/ticket-trust-all-sources.test.ts);
  // an unregistered third-party host is refused on operator-listed sources too.
  test('operator-listed sources: a host off the platforms, the source domain and the venue registry is refused', () => {
    expect(isTrustedTicketUrl('https://tickets.venue.example/x', 'more.com')).toBe(false);
    expect(isTrustedTicketUrl('https://tickets.venue.example/x', 'athinorama.gr')).toBe(false);
    expect(isTrustedTicketUrl('https://www.athinorama.gr/theatre/x', 'athinorama.gr')).toBe(true);
  });
});

describe('CTA (event page button + practical block)', () => {
  for (const url of PHISH) {
    test(`RA listing with ticket ${url} → "Find tickets" on the RA listing`, () => {
      const cta = resolveCtaForEvent(listed({ ticketUrl: url }), t);
      expect(cta).toMatchObject({ kind: 'tickets', href: 'https://ra.co/events/2000001', label: t.findTicketsArrow });
    });
  }
  test('cometogether listing with a phishing ticket → the cometogether listing', () => {
    const cta = resolveCtaForEvent(listed({ source: 'cometogether', url: 'https://cometogether.live/el/events/9', ticketUrl: PHISH[0], ticketUrlStatus: 'direct' }), t);
    expect(cta.href).toBe('https://cometogether.live/el/events/9');
  });
  test('an off-domain listing URL is not a fallback either', () => {
    const cta = resolveCtaForEvent(listed({ source: 'meetup', url: 'https://evil.example/meetup-copy', ticketUrl: PHISH[0], venue: { ...sampleConcert.venue, website: undefined } }), t);
    expect(cta.href ?? '').not.toContain('evil');
  });
  test('a trusted platform link from RA still renders "Buy tickets"', () => {
    const cta = resolveCtaForEvent(listed({ ticketUrl: 'https://www.viva.gr/tickets/music/x/', ticketUrlStatus: 'direct' }), t);
    expect(cta).toMatchObject({ kind: 'tickets', href: 'https://www.viva.gr/tickets/music/x/', label: t.buyTicketsArrow });
  });
  // Round 8: an unregistered venue host is no longer published for operator-listed
  // sources either; the CTA falls back to the source listing (rule 4.4).
  test('an operator-listed source with an unregistered ticket host falls back to its listing', () => {
    const cta = resolveCtaForEvent(listed({ source: 'more.com', url: 'https://www.more.com/gr-el/tickets/music/x/', ticketUrl: 'https://tickets.venue.example/x', ticketUrlStatus: 'direct' }), t);
    expect(cta).toMatchObject({ kind: 'tickets', href: 'https://www.more.com/gr-el/tickets/music/x/', label: t.findTicketsArrow });
  });
});

describe('JSON-LD Offer', () => {
  const offerFor = (source: string, ticketUrl: string) => buildOfferOrOmit({
    price: { type: 'with-ticket', amount: 20, currency: 'EUR' }, ticketUrl, ticketUrlResolved: null, source,
    venue: { name: 'Test Venue' }, eventStatus: 'https://schema.org/EventScheduled',
  });
  test('a phishing URL disguised on a merchant-looking host yields no Offer url', () => {
    for (const url of PHISH) expect(JSON.stringify(offerFor('residentadvisor', url))).not.toMatch(/evil|example|pay-secure/);
  });
  test('an untrusted ticketUrlResolved is not used either', () => {
    const d = buildOfferOrOmit({
      price: { type: 'with-ticket', amount: 20 }, ticketUrl: null, ticketUrlResolved: PHISH[1], source: 'cometogether',
      venue: { name: 'Test Venue' }, eventStatus: 'https://schema.org/EventScheduled',
    });
    expect(d).toEqual({ omit: true });
  });
  test('RA event on ra.co keeps its merchant Offer', () => {
    const d = offerFor('residentadvisor', 'https://ra.co/events/2000001');
    expect('offer' in d && d.offer.url).toBe('https://ra.co/events/2000001');
  });
});

describe('build load (sanitizeEventUrlFields → HTML, JSON-LD, api/*.json, search index)', () => {
  test('clears untrusted ticket fields (every source) and an off-domain listing URL (open-listing sources only)', () => {
    const ra: { source: string; url?: string; ticketUrl?: string; ticketUrlResolved?: string | null } = { source: 'residentadvisor', url: 'https://ra.co/events/1', ticketUrl: PHISH[0], ticketUrlResolved: PHISH[1] };
    expect(sanitizeEventUrlFields(ra)).toBe(2);
    expect(ra).toEqual({ source: 'residentadvisor', url: 'https://ra.co/events/1', ticketUrl: undefined, ticketUrlResolved: null });

    const meetup: { source: string; url?: string; ticketUrl?: string } = { source: 'meetup', url: 'https://evil.example/copy', ticketUrl: 'https://www.viva.gr/tickets/x/' };
    applyTicketTrust(meetup);
    expect(meetup).toEqual({ source: 'meetup', url: undefined, ticketUrl: 'https://www.viva.gr/tickets/x/' });

    // Round 8: the ticket rule applies to operator-listed sources too; their
    // listing URL is still not held to the source domain.
    const more: { source: string; url?: string; ticketUrl?: string } = { source: 'more.com', url: 'https://www.more.com/x', ticketUrl: 'https://tickets.venue.example/x' };
    expect(sanitizeEventUrlFields(more)).toBe(1);
    expect(more).toEqual({ source: 'more.com', url: 'https://www.more.com/x', ticketUrl: undefined });
  });

  test('a rendered RA event page carries the phishing host nowhere (CTA, practical block, JSON-LD)', () => {
    for (const lang of ['el', 'en'] as const) {
      const html = renderEventDetailPage(listed({ ticketUrl: 'https://ra-tickets.example/checkout?e=123', ticketUrlResolved: 'https://ra-tickets.example/checkout?e=123' }), [], lang);
      expect(html).not.toContain('ra-tickets.example');
      const $ = load(html);
      expect($('a.edp-cta').first().attr('href')).toBe('https://ra.co/events/2000001');
    }
  });
});
