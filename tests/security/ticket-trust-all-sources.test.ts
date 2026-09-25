/**
 * Ticket-link anti-phishing for every source (security loop round 8).
 *
 * A ticket URL is published only when it is https, has no credentials and no
 * explicit port, and its host is (a) a known ticketing platform, (b) the
 * event source's own registrable domain (from the base URL its scraper is
 * configured with), or (c) a domain the reviewed venue registry lists for the
 * event's venue. Everything else is dropped at build load (and logged), in the
 * CTA, in the JSON-LD Offer and at the Tier-4 save path.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  SOURCE_BASE_URLS,
  applyTicketTrust,
  isTrustedTicketUrl,
  registrableDomain,
  resetTicketTrustDrops,
  snapshotTicketTrustDrops,
  sourceDomains,
  ticketTrustReason,
} from '../../src/ticketing/ticket-trust';
import { resolveCtaForEvent } from '../../src/ticketing/cta';
import { buildOfferOrOmit } from '../../src/ticketing/offer-builder';
import { sanitizeEventUrlFields } from '../../src/utils/safe-url';
import { renderEventDetailPage } from '../../src/generators/event-page';
import { saveBatch } from '../../scripts/save-batch';
import { STRINGS } from '../../src/i18n/strings';
import { sampleConcert } from '../fixtures/events';
import type { Event } from '../../src/types';

const ROOT = join(import.meta.dir, '..', '..');
const t = STRINGS.en;

describe('registrableDomain (conservative eTLD+1)', () => {
  const cases: Array<[string, string | null]> = [
    ['www.athinorama.gr', 'athinorama.gr'],
    ['athinorama.gr', 'athinorama.gr'],
    ['tickets.shop.example.com.gr', 'example.com.gr'],
    ['com.gr', null],
    ['www.more.com', 'more.com'],
    ['lu.ma', 'lu.ma'],
    ['co.ma', null],
    ['www.starttech.vc', 'starttech.vc'],
    ['www.greeksin.ai', 'greeksin.ai'],
    ['cometogether.live', 'cometogether.live'],
    ['foo.co.uk', null], // TLD outside the known set → no guess
    ['1.2.3.4', null],
    ['gr', null],
    ['athinorama.gr.', null],
    ['xn--thinorama-8of.gr', 'xn--thinorama-8of.gr'],
  ];
  for (const [host, want] of cases) test(`${host} → ${want}`, () => expect(registrableDomain(host)).toBe(want));
});

describe('every source has its own domain derived from its configured base URL', () => {
  test('source domains', () => {
    expect(sourceDomains('athinorama.gr')).toEqual(['athinorama.gr']);
    expect(sourceDomains('ticketservices')).toEqual(['ticketservices.gr']);
    expect(sourceDomains('residentadvisor')).toEqual(['ra.co', 'residentadvisor.net']);
    expect(sourceDomains('snfcc')).toEqual(['snfcc.org']);
    expect(sourceDomains('luma')).toEqual(['lu.ma']);
    expect(sourceDomains('manual')).toEqual([]);
    expect(sourceDomains(undefined)).toEqual([]);
    expect(sourceDomains('toString')).toEqual([]); // no prototype keys
  });

  // A new scraper that writes a source id absent from SOURCE_BASE_URLS would
  // silently lose its own-domain ticket links; this pins the table to the code.
  test('every literal source id written by a scraper or newsletter parser is listed', () => {
    const files = [
      ...readdirSync(join(ROOT, 'scripts')).filter((f) => /^scrape-.*\.ts$/.test(f)).map((f) => join(ROOT, 'scripts', f)),
      ...readdirSync(join(ROOT, 'src/ingest/newsletter-formats')).filter((f) => f.endsWith('.ts')).map((f) => join(ROOT, 'src/ingest/newsletter-formats', f)),
    ];
    const ids = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf-8').matchAll(/\bsource:\s*'([^']+)'/g)) ids.add(m[1]);
    ids.delete('manual');
    expect(ids.size).toBeGreaterThan(10);
    const missing = [...ids].filter((id) => !Object.prototype.hasOwnProperty.call(SOURCE_BASE_URLS, id));
    expect(missing).toEqual([]);
  });

  test("each configured base URL's domain appears in the scraper / newsletter code or config it is derived from", () => {
    const corpus = [
      ...readdirSync(join(ROOT, 'scripts')).filter((f) => /^scrape-.*\.ts$/.test(f)).map((f) => readFileSync(join(ROOT, 'scripts', f), 'utf-8')),
      readFileSync(join(ROOT, 'config/newsletter-formats.json'), 'utf-8'),
    ].join('\n');
    for (const [id, urls] of Object.entries(SOURCE_BASE_URLS)) {
      for (const u of urls) {
        const host = new URL(u).hostname.replace(/^www\./, '');
        if (id === 'residentadvisor' || id === 'ra' || id === 'ra.co') {
          if (host === 'residentadvisor.net') continue; // pre-existing reviewed RA domain (validator.ts getTicketHosts)
        }
        expect({ id, host, found: corpus.includes(host) }).toEqual({ id, host, found: true });
      }
    }
  });
});

describe('isTrustedTicketUrl — each source class', () => {
  test('(a) a known ticketing platform is trusted for any source, including unlisted ones', () => {
    for (const source of ['athinorama.gr', 'clubber.gr', 'snfcc', 'manual', 'meetup', undefined]) {
      expect(ticketTrustReason('https://www.viva.gr/tickets/music/x/', source)).toBe('ticket-platform');
      expect(ticketTrustReason('https://www.more.com/gr-el/tickets/x/', source)).toBe('ticket-platform');
      expect(ticketTrustReason('https://tickets.onassis.org/x', source)).toBe('ticket-platform');
    }
  });

  test("(b) the source's own domain (and its subdomains) is trusted for that source only", () => {
    expect(ticketTrustReason('https://www.athinorama.gr/theatre/play/x', 'athinorama.gr')).toBe('source-domain');
    expect(ticketTrustReason('https://athinorama.gr/x', 'athinorama.gr')).toBe('source-domain');
    expect(ticketTrustReason('https://www.clubber.gr/events/x', 'clubber.gr')).toBe('source-domain');
    expect(ticketTrustReason('https://www.benaki.org/el/tickets', 'benaki')).toBe('source-domain');
    expect(ticketTrustReason('https://shop.snfcc.org/x', 'snfcc')).toBe('source-domain');
    expect(ticketTrustReason('https://lu.ma/abc', 'luma')).toBe('source-domain');
    expect(ticketTrustReason('https://www.starttech.vc/events/x', 'starttech.vc')).toBe('source-domain');
    expect(ticketTrustReason('https://cometogether.live/el/buytickets/1', 'cometogether')).toBe('source-domain');
    // another source's domain is not trusted
    expect(isTrustedTicketUrl('https://www.athinorama.gr/x', 'more.com')).toBe(false);
    expect(isTrustedTicketUrl('https://www.benaki.org/x', 'snfcc')).toBe(false);
    expect(isTrustedTicketUrl('https://lu.ma/abc', 'meetup')).toBe(false);
  });

  test("(c) a domain the venue registry lists for the event's venue is trusted for that venue only", () => {
    expect(ticketTrustReason('https://www.emst.gr/en/tickets', 'athinorama.gr', 'EMST')).toBe('venue-domain');
    expect(ticketTrustReason('https://shop.cycladic.gr/x', 'manual', 'Museum of Cycladic Art')).toBe('venue-domain');
    expect(ticketTrustReason('https://aggelonvima.com/x', 'athinorama.gr', 'Αγγέλων Βήμα')).toBe('venue-domain');
    expect(ticketTrustReason('https://www.ilionplus.gr/x', 'more.com', 'ΙΛΙΟΝ plus')).toBe('venue-domain'); // name folding
    expect(isTrustedTicketUrl('https://www.emst.gr/en/tickets', 'athinorama.gr', 'Museum of Cycladic Art')).toBe(false);
    expect(isTrustedTicketUrl('https://www.emst.gr/en/tickets', 'athinorama.gr', 'Unknown venue')).toBe(false);
    expect(isTrustedTicketUrl('https://www.emst.gr/en/tickets', 'athinorama.gr')).toBe(false);
  });

  test('anything else is refused, whatever the source', () => {
    for (const source of ['athinorama.gr', 'more.com', 'clubber.gr', 'halfnote', 'snfcc', 'benaki', 'manual', 'eventbrite', 'this-is-athens', undefined, null]) {
      expect(isTrustedTicketUrl('https://tickets.venue.example/x', source, 'Test Venue')).toBe(false);
    }
  });
});

describe('look-alikes and URL tricks are refused', () => {
  const REFUSED: Array<[string, string]> = [
    ['https://athinorama.gr.evil.com/pay', 'athinorama.gr'],
    ['https://www.athinorama.gr.evil.com/pay', 'athinorama.gr'],
    ['https://evilathinorama.gr/pay', 'athinorama.gr'],
    ['https://athinorama-gr.com/pay', 'athinorama.gr'],
    ['https://athinorama.gr-tickets.com/pay', 'athinorama.gr'],
    ['https://www.athinorama.com/pay', 'athinorama.gr'], // other TLD
    ['https://athinorama.com.gr/pay', 'athinorama.gr'],
    ['https://viva.gr.evil.com/x', 'athinorama.gr'],
    ['https://evil-viva.gr/x', 'athinorama.gr'],
    ['https://myviva.gr/x', 'athinorama.gr'],
    ['https://snfcc.org.evil.example/x', 'snfcc'],
    ['https://evilsnfcc.org/x', 'snfcc'],
    ['https://emst.gr.evil.com/x', 'athinorama.gr'],
    // IDN / punycode homographs: Cyrillic "а" / "о", Greek "ο"
    ['https://аthinorama.gr/pay', 'athinorama.gr'],
    ['https://xn--thinorama-8of.gr/pay', 'athinorama.gr'],
    ['https://www.vivа.gr/tickets/x', 'athinorama.gr'],
    ['https://snfcс.org/x', 'snfcc'],
    ['https://more.cοm/x', 'athinorama.gr'],
    // http is refused, even on a trusted host
    ['http://www.viva.gr/tickets/x', 'athinorama.gr'],
    ['http://www.athinorama.gr/x', 'athinorama.gr'],
    ['http://www.emst.gr/x', 'athinorama.gr'],
    // userinfo and port tricks
    ['https://www.viva.gr@evil.com/tickets/x', 'athinorama.gr'],
    ['https://athinorama.gr:x@evil.com/pay', 'athinorama.gr'],
    ['https://user:pw@www.viva.gr/tickets/x', 'athinorama.gr'],
    ['https://evil.com@www.athinorama.gr/x', 'athinorama.gr'],
    ['https://www.viva.gr:8443/tickets/x', 'athinorama.gr'],
    ['https://www.athinorama.gr:444/x', 'athinorama.gr'],
    ['https://evil.com\\@www.viva.gr/x', 'athinorama.gr'],
    ['https://evil.com\\.viva.gr/x', 'athinorama.gr'],
    ['https://www.viva.gr./tickets/x', 'athinorama.gr'],
    ['https://1.2.3.4/pay', 'athinorama.gr'],
    ['https://[::1]/pay', 'athinorama.gr'],
    ['//www.viva.gr/tickets/x', 'athinorama.gr'],
    ['javascript:alert(1)//www.viva.gr', 'athinorama.gr'],
    ['data:text/html,https://www.viva.gr', 'athinorama.gr'],
    ['https://www.viva.gr/x y', 'athinorama.gr'],
    ['https://www.viva.gr/x"onmouseover=1', 'athinorama.gr'],
    ['', 'athinorama.gr'],
  ];
  for (const [url, source] of REFUSED) {
    test(`${source}: refuses ${JSON.stringify(url)}`, () => expect(isTrustedTicketUrl(url, source, 'EMST')).toBe(false));
  }

  test('the default https port is the same origin and stays trusted; uppercase host is normalised', () => {
    expect(isTrustedTicketUrl('https://www.viva.gr:443/tickets/x', 'athinorama.gr')).toBe(true);
    expect(isTrustedTicketUrl('https://WWW.VIVA.GR/tickets/x', 'athinorama.gr')).toBe(true);
  });
});

const event = (over: Partial<Event>): Event => ({
  ...sampleConcert,
  startDate: '2099-01-01T21:00:00+02:00',
  endDate: undefined,
  source: 'athinorama.gr',
  url: 'https://www.athinorama.gr/music/concert/x',
  ticketUrlStatus: 'direct',
  price: { type: 'with-ticket', amount: 20, currency: 'EUR' },
  ...over,
} as Event);

describe('render path: build load, CTA, JSON-LD Offer, event page', () => {
  beforeEach(() => resetTicketTrustDrops());

  test('build load clears an untrusted ticket URL on an operator source, keeps the rest, and logs source + host', () => {
    const e = event({ ticketUrl: 'https://athinorama.gr.evil.com/pay?x=1', ticketUrlResolved: 'http://www.viva.gr/x' });
    expect(sanitizeEventUrlFields(e)).toBe(2);
    expect(e.ticketUrl).toBeUndefined();
    expect(e.ticketUrlResolved).toBeNull();
    expect(e.url).toBe('https://www.athinorama.gr/music/concert/x');
    expect(e.title).toBe(sampleConcert.title);
    expect(snapshotTicketTrustDrops()).toEqual({ 'athinorama.gr athinorama.gr.evil.com': 1, 'athinorama.gr www.viva.gr': 1 });
  });

  test('build load keeps trusted URLs untouched (no rewriting)', () => {
    for (const [ticketUrl, venueName] of [
      ['https://www.viva.gr/tickets/music/x/?a=1', 'Test Venue'],
      ['https://www.athinorama.gr/tickets/x', 'Test Venue'],
      ['https://www.emst.gr/en/tickets', 'EMST'],
    ] as const) {
      const e = event({ ticketUrl, venue: { ...sampleConcert.venue, name: venueName } });
      expect(applyTicketTrust(e)).toBe(0);
      expect(e.ticketUrl).toBe(ticketUrl);
    }
    expect(snapshotTicketTrustDrops()).toEqual({});
  });

  test('the drop log key is sanitised and bounded', () => {
    applyTicketTrust({ source: 'weird source\n<x>', ticketUrl: 'not a url' });
    expect(Object.keys(snapshotTicketTrustDrops())).toEqual(['weird_source__x_ unparseable-url']);
  });

  test('CTA: an untrusted ticket link on an operator source falls back to the source listing', () => {
    const cta = resolveCtaForEvent(event({ ticketUrl: 'https://evilathinorama.gr/pay' }), t);
    expect(cta).toMatchObject({ kind: 'tickets', href: 'https://www.athinorama.gr/music/concert/x', label: t.findTicketsArrow });
  });

  test("CTA: a venue-registry domain ticket link still renders 'Buy tickets'", () => {
    const cta = resolveCtaForEvent(event({ ticketUrl: 'https://www.emst.gr/en/tickets', venue: { ...sampleConcert.venue, name: 'EMST' } }), t);
    expect(cta).toMatchObject({ kind: 'tickets', href: 'https://www.emst.gr/en/tickets', label: t.buyTicketsArrow });
  });

  test('Offer: an untrusted URL yields no offers.url; a platform URL keeps it', () => {
    const offer = (ticketUrl: string, source: string) => buildOfferOrOmit({
      price: { type: 'with-ticket', amount: 20, currency: 'EUR' }, ticketUrl, ticketUrlResolved: null, source,
      venue: { name: 'Test Venue' }, eventStatus: 'https://schema.org/EventScheduled',
    });
    expect(JSON.stringify(offer('https://more.com.evil.example/x', 'more.com'))).not.toContain('evil');
    expect(JSON.stringify(offer('http://www.more.com/gr-el/tickets/x/', 'more.com'))).not.toContain('http://');
    const ok = offer('https://www.more.com/gr-el/tickets/x/', 'more.com');
    expect('offer' in ok && ok.offer.url).toBe('https://www.more.com/gr-el/tickets/x/');
  });

  test('a rendered operator-source event page carries the look-alike host nowhere', () => {
    for (const lang of ['el', 'en'] as const) {
      const html = renderEventDetailPage(event({ source: 'more.com', url: 'https://www.more.com/gr-el/tickets/music/x/', ticketUrl: 'https://www.more.com.pay-secure.example/x', ticketUrlResolved: 'https://www.more.com.pay-secure.example/x' }), [], lang);
      expect(html).not.toContain('pay-secure.example');
    }
  });
});

describe('save path: Tier-4 ticket_url_discovered (scripts/save-batch.ts)', () => {
  const dir = join('temp-descriptions', 'sec-ticket-trust-all-sources');
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('stores platform and registered-venue links; refuses look-alikes, http, credentials, ports and the source domain', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT, type TEXT, venue_name TEXT, price_type TEXT,
      start_date TEXT, end_date TEXT, genres TEXT, description TEXT, full_description TEXT, full_description_gr TEXT,
      full_description_en TEXT, tags TEXT, source TEXT, needs_enrichment INTEGER DEFAULT 1, location_status TEXT,
      enriched_at TEXT, updated_at TEXT, ticket_url TEXT, ticket_url_status TEXT, ticket_url_source TEXT, ticket_url_resolved_at TEXT);
      CREATE TABLE enrichment_log (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, enrichment_version TEXT,
      word_count_en INTEGER, created_at TEXT DEFAULT (datetime('now')));`);
    const cases: Array<[string, string, string, string | null]> = [
      ['t-platform', 'Test Venue', 'https://www.viva.gr/tickets/music/y/', 'https://www.viva.gr/tickets/music/y/'],
      ['t-venue', 'EMST', 'https://www.emst.gr/en/tickets', 'https://www.emst.gr/en/tickets'],
      ['t-lookalike', 'EMST', 'https://emst.gr.evil.com/tickets', null],
      ['t-http', 'Test Venue', 'http://www.viva.gr/tickets/music/y/', null],
      ['t-port', 'Test Venue', 'https://www.viva.gr:8443/tickets/y/', null],
      ['t-idn', 'Test Venue', 'https://www.vivа.gr/tickets/y/', null],
      ['t-source', 'Test Venue', 'https://www.athinorama.gr/music/x', null],
    ];
    const insert = db.prepare(`INSERT INTO events (id, title, type, venue_name, price_type, start_date, source, location_status)
      VALUES (?, 'T', 'concert', ?, 'with-ticket', '2099-06-15T21:00:00', 'athinorama.gr', 'verified_athens')`);
    mkdirSync(dir, { recursive: true });
    for (const [id, venue, url] of cases) {
      insert.run(id, venue);
      writeFileSync(join(dir, `${id}.md`), `Prose.\n\nticket_url_discovered: ${url}\n`);
    }
    saveBatch(db, cases.map((c) => c[0]), 'sec', 0, false, dir);
    for (const [id, , , want] of cases) {
      const row = db.prepare('SELECT ticket_url FROM events WHERE id = ?').get(id) as { ticket_url: string | null };
      expect({ id, stored: row.ticket_url }).toEqual({ id, stored: want });
    }
  });
});
