/**
 * Anti-phishing rule for ticket links — every source.
 *
 * A ticket URL reaches us scraped from a listing, AI-discovered from listing
 * text (save-batch Tier 4), cross-referenced from another event, or resolved
 * from the venue registry. On open-listing sources (Resident Advisor promoter
 * accounts, cometogether.live organiser submissions, Eventbrite / Meetup /
 * Luma) anyone can choose it outright; on the other sources an edited or
 * compromised listing page, or a wrong AI discovery, can plant it. Publishing
 * it lends agentathens.com's reputation to whatever payment page it points at.
 *
 * Rule (security loop round 8): for an event from ANY source, a ticket URL is
 * published only when it is https, carries no credentials and no explicit
 * port, and its host is
 *   (a) a known ticketing platform — getTicketHosts() (validator.ts:
 *       config/ticketing-mapping.json platforms + the hard-coded Greek hosts)
 *       or the classifier's known_merchants
 *       (config/ticket-source-classification.json), host or subdomain; or
 *   (b) the event source's own registrable domain (eTLD+1 of the base URL the
 *       source's scraper or newsletter is configured with, SOURCE_BASE_URLS
 *       below), host or subdomain; or
 *   (c) a domain the reviewed venue registry (config/athens-venues.json)
 *       lists for the event's venue — its `website`, `ticketing.url` host or
 *       `ticketing.provider` — host or subdomain.
 * Anything else is dropped: the event keeps its other data, the URL is never
 * rewritten, and the CTA falls back to the listing URL / venue website
 * (src/ticketing/cta.ts). Look-alikes (source-domain.evil.com,
 * evilsource-domain.com, punycode/IDN homographs) never equal a trusted
 * domain or end in ".<domain>", so they fail.
 *
 * On open-listing sources the listing URL (event.url) must also be on the
 * source's own domain (it is the CTA fallback target there).
 *
 * Applied at: build load (sanitizeEventUrlFields → applyTicketTrust, which
 * also records every drop for logs/ticket-trust-drops-latest.json), the CTA
 * (cta.ts), the JSON-LD Offer (offer-builder.ts) and the Tier-4 save path
 * (scripts/save-batch.ts).
 */
import { getTicketHosts } from './validator';
import { getVenueByName } from './venue-registry';
import { KNOWN_MERCHANT_HOSTS } from '../utils/ticket-source-classifier';

// ============================================================================
// Registrable domain (eTLD+1) — conservative, for the TLDs our sources use.
// ============================================================================

/**
 * Top-level domains for which "last two labels" is the registrable domain,
 * except where the second-level label is itself a public suffix listed in
 * SECOND_LEVEL_SUFFIXES (Public Suffix List, ICANN section, for these TLDs).
 * A host under any other TLD gets no computed eTLD+1; its configured host
 * (minus "www.") and that host's subdomains are trusted instead.
 */
const KNOWN_TLDS = new Set(['gr', 'com', 'org', 'net', 'eu', 'live', 'ai', 'vc', 'ma']);
const SECOND_LEVEL_SUFFIXES = new Set([
  'com.gr', 'edu.gr', 'net.gr', 'org.gr', 'gov.gr', 'mil.gr', 'mod.gr', 'sch.gr',
  'com.ai', 'net.ai', 'off.ai', 'org.ai',
  'com.vc', 'net.vc', 'org.vc', 'gov.vc', 'mil.vc', 'edu.vc',
  'ac.ma', 'co.ma', 'gov.ma', 'net.ma', 'org.ma', 'press.ma',
]);

const LDH_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * eTLD+1 of a lower-case ASCII hostname, or null when it cannot be computed
 * conservatively (IP address, single label, trailing dot, TLD outside
 * KNOWN_TLDS, or the host is itself a public suffix).
 */
export function registrableDomain(host: string): string | null {
  const h = host.toLowerCase();
  if (!h || h.endsWith('.') || h.includes('..')) return null;
  const labels = h.split('.');
  if (labels.length < 2 || !labels.every((l) => LDH_LABEL.test(l))) return null;
  if (!KNOWN_TLDS.has(labels[labels.length - 1])) return null;
  const lastTwo = labels.slice(-2).join('.');
  if (SECOND_LEVEL_SUFFIXES.has(lastTwo)) return labels.length >= 3 ? labels.slice(-3).join('.') : null;
  return lastTwo;
}

/** The domain a configured base URL trusts: its eTLD+1, else its exact host (minus "www."). */
function trustedDomainOf(baseUrl: string): string | null {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  return registrableDomain(host) ?? (host.replace(/^www\./, '') || null);
}

// ============================================================================
// Source → configured base URL
// ============================================================================

/**
 * The base URL each source's scraper builds its listing URLs on (for the
 * newsletter sources: the site of the sender domain in
 * config/newsletter-formats.json). Keys are the values written to
 * events.source. A source missing here (e.g. 'manual') trusts only (a) and
 * (c). tests/security/ticket-trust-all-sources.test.ts fails when a scraper
 * or newsletter parser writes a source id that is not listed.
 */
const RA = ['https://ra.co', 'https://www.residentadvisor.net'] as const;
export const SOURCE_BASE_URLS: Readonly<Record<string, readonly string[]>> = {
  // scripts/scrape-all.ts
  'more.com': ['https://www.more.com'],
  more: ['https://www.more.com'],
  'athinorama.gr': ['https://www.athinorama.gr'],
  athinorama: ['https://www.athinorama.gr'],
  'clubber.gr': ['https://www.clubber.gr'],
  clubber: ['https://www.clubber.gr'],
  ticketservices: ['https://www.ticketservices.gr'],
  halfnote: ['https://www.halfnote.gr'],
  residentadvisor: RA,
  ra: RA,
  'ra.co': RA,
  // scripts/scrape-onassis.ts, scrape-benaki.ts, scrape-megaron.ts, scrape-snfcc.ts
  onassis: ['https://www.onassis.org'],
  benaki: ['https://www.benaki.org'],
  'megaron.gr': ['https://www.megaron.gr'],
  megaron: ['https://www.megaron.gr'], // src/ingest/newsletter-formats/megaron.ts
  snfcc: ['https://www.snfcc.org'],
  // scripts/scrape-cometogether.ts
  cometogether: ['https://cometogether.live'],
  // scripts/scrape-ai-tech.ts
  eventbrite: ['https://www.eventbrite.com'],
  meetup: ['https://www.meetup.com'],
  luma: ['https://lu.ma'],
  'starttech.vc': ['https://www.starttech.vc'],
  'greeksin.ai': ['https://www.greeksin.ai'],
  'devoxx.gr': ['https://devoxx.gr'],
  'archimedesai.gr': ['https://archimedesai.gr'],
  'hackathongreece.ai': ['https://hackathongreece.ai'],
  'productledhub.com': ['https://productledhub.com'],
  // src/ingest/newsletter-formats (sender domains in config/newsletter-formats.json)
  'this-is-athens': ['https://www.thisisathens.org'],
  'lifo-guide': ['https://www.lifo.gr'],
};

/**
 * Sources where third parties publish listings. Their listing URL (event.url)
 * is also held to the source's own domain.
 */
export const OPEN_LISTING_SOURCES: ReadonlySet<string> = new Set([
  'residentadvisor', 'ra', 'ra.co', 'cometogether', 'eventbrite', 'meetup', 'luma',
]);

const sourceDomainCache = new Map<string, readonly string[]>();

/** Registrable domains the source's own site lives on ([] for an unlisted source). */
export function sourceDomains(source: string | null | undefined): readonly string[] {
  const key = source?.trim().toLowerCase();
  if (!key || !Object.prototype.hasOwnProperty.call(SOURCE_BASE_URLS, key)) return [];
  let domains = sourceDomainCache.get(key);
  if (!domains) {
    domains = [...new Set(SOURCE_BASE_URLS[key].map(trustedDomainOf).filter((d): d is string => !!d))];
    sourceDomainCache.set(key, domains);
  }
  return domains;
}

export function isOpenListingSource(source: string | null | undefined): boolean {
  const key = source?.trim().toLowerCase();
  return !!key && OPEN_LISTING_SOURCES.has(key);
}

// ============================================================================
// Matching
// ============================================================================

// Whitespace, controls, backslashes, quotes and angle brackets are never in a
// URL we publish (the class safeHttpUrl rejects).
const UNSAFE_URL_CHARS = /[\u0000-\u0020\u007f-\u009f\u2028\u2029"'<>`\\]/;

/**
 * Lower-case hostname of `url` when it is a plain web URL: no credentials, no
 * explicit port, no IP-literal or trailing-dot host, no unsafe characters, and
 * https (or http too when `allowHttp`). Otherwise null.
 */
function plainHost(url: string | null | undefined, allowHttp: boolean): string | null {
  if (typeof url !== 'string' || !url || url.length > 2048 || UNSAFE_URL_CHARS.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const schemeOk = parsed.protocol === 'https:' || (allowHttp && parsed.protocol === 'http:');
  if (!schemeOk || parsed.username || parsed.password || parsed.port) return null;
  const host = parsed.hostname.toLowerCase();
  if (!host || host.endsWith('.') || host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return null;
  return host;
}

/** Hostname of a publishable ticket URL (https, no credentials, no port), or null. */
export function ticketUrlHost(url: string | null | undefined): string | null {
  return plainHost(url, false);
}

/** host equals one of `domains` or is a subdomain of one. Entries without a dot are ignored. */
function onDomain(host: string, domains: Iterable<string>): boolean {
  for (const raw of domains) {
    const d = raw.toLowerCase().replace(/^www\./, '');
    if (!d.includes('.')) continue;
    if (host === d || host.endsWith(`.${d}`)) return true;
  }
  return false;
}

/** Domains the reviewed venue registry lists for this venue name (website, ticketing.url, ticketing.provider). */
export function venueDomains(venueName: string | null | undefined): string[] {
  const venue = getVenueByName(venueName ?? null);
  if (!venue) return [];
  const out: string[] = [];
  for (const u of [venue.website, venue.ticketing?.url]) {
    if (!u) continue;
    try {
      const h = new URL(u).hostname.toLowerCase().replace(/^www\./, '');
      if (h) out.push(h);
    } catch {
      /* a malformed registry URL contributes nothing */
    }
  }
  const provider = venue.ticketing?.provider?.trim().toLowerCase();
  if (provider && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(provider)) out.push(provider.replace(/^www\./, ''));
  return out;
}

/** The URL is http(s) on the source's own registrable domain (listing-URL check). */
export function isOnSourceDomain(url: string | null | undefined, source: string | null | undefined): boolean {
  const host = plainHost(url, true);
  return !!host && onDomain(host, sourceDomains(source));
}

export type TicketTrustReason = 'ticket-platform' | 'source-domain' | 'venue-domain';

/** Why `url` is trusted as the ticket link of an event from `source` at `venueName`, or null. */
export function ticketTrustReason(
  url: string | null | undefined,
  source: string | null | undefined,
  venueName?: string | null,
): TicketTrustReason | null {
  const host = ticketUrlHost(url);
  if (!host) return null;
  if (onDomain(host, getTicketHosts()) || onDomain(host, KNOWN_MERCHANT_HOSTS)) return 'ticket-platform';
  if (onDomain(host, sourceDomains(source))) return 'source-domain';
  if (onDomain(host, venueDomains(venueName))) return 'venue-domain';
  return null;
}

/** Whether `url` may be published as the ticket link of an event from `source` at `venueName`. */
export function isTrustedTicketUrl(
  url: string | null | undefined,
  source: string | null | undefined,
  venueName?: string | null,
): boolean {
  return ticketTrustReason(url, source, venueName) !== null;
}

// ============================================================================
// Drop log (build telemetry → logs/ticket-trust-drops-latest.json)
// ============================================================================

const drops = new Map<string, number>();

/** Log-safe token: lower-case [a-z0-9._-], bounded. */
function logToken(value: string | null | undefined, fallback: string): string {
  const t = (value ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 80);
  return t || fallback;
}

/** "<source> <host>" key for a dropped URL; host is 'unparseable-url' when the URL has none. */
export function ticketDropKey(source: string | null | undefined, url: string): string {
  let host: string;
  try {
    host = logToken(new URL(url).hostname, 'no-host');
  } catch {
    host = 'unparseable-url';
  }
  return `${logToken(source, 'no-source')} ${host}`;
}

/** Drops recorded by applyTicketTrust since the last reset, as { "<source> <host>": count }, largest first. */
export function snapshotTicketTrustDrops(): Record<string, number> {
  return Object.fromEntries([...drops].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function resetTicketTrustDrops(): void {
  drops.clear();
}

// ============================================================================
// Build-load application
// ============================================================================

export interface TicketTrustFields {
  source?: string | null;
  url?: string;
  ticketUrl?: string;
  ticketUrlResolved?: string | null;
  venue?: { name?: string | null } | null;
}

/**
 * Clears untrusted ticket URLs (every source) and an off-domain listing URL
 * (open-listing sources). Returns the number of fields cleared and records
 * each dropped ticket URL (source + host) for review. Applied once per event
 * at build load (sanitizeEventUrlFields) so HTML, JSON-LD offers, api/*.json
 * and the search index all see the same values; the CTA and the Offer
 * builder check again for callers that render events directly.
 */
export function applyTicketTrust(event: TicketTrustFields): number {
  let cleared = 0;
  const venueName = event.venue?.name ?? null;
  for (const field of ['ticketUrl', 'ticketUrlResolved'] as const) {
    const value = event[field];
    if (!value || isTrustedTicketUrl(value, event.source, venueName)) continue;
    const key = ticketDropKey(event.source, value);
    drops.set(key, (drops.get(key) ?? 0) + 1);
    if (field === 'ticketUrl') event.ticketUrl = undefined;
    else event.ticketUrlResolved = null;
    cleared++;
  }
  if (isOpenListingSource(event.source) && event.url && !isOnSourceDomain(event.url, event.source)) {
    event.url = undefined;
    cleared++;
  }
  return cleared;
}
