/**
 * Anti-phishing rule for ticket links from open-listing sources.
 *
 * On some sources anyone can list an event (promoter accounts on Resident
 * Advisor, organiser submissions on cometogether.live, the Eventbrite /
 * Meetup / Luma tech listings). A ticket URL that reaches us from such an
 * event — scraped, AI-discovered from the listing text, or cross-referenced —
 * is attacker-choosable, and publishing it would lend agentathens.com's
 * reputation to a look-alike payment page.
 *
 * Rule: for an event from an open-listing source, a ticket URL is published
 * only when its host is a known ticketing platform (getTicketHosts() in
 * validator.ts plus the classifier's known_merchants,
 * config/ticket-source-classification.json) or the source's own domain.
 * Otherwise the ticket link is dropped; the CTA then falls back to the
 * source listing URL (event.url), which itself must be on the source's own
 * domain. Events from other sources are unaffected.
 */
import { getTicketHosts, hostOf } from './validator';
import { KNOWN_MERCHANT_HOSTS } from '../utils/ticket-source-classifier';

/**
 * Sources where third parties publish listings, with the domains each
 * scraper builds its listing URLs on (scripts/scrape-all.ts residentadvisor,
 * scripts/scrape-cometogether.ts, scripts/scrape-ai-tech.ts).
 */
const RA_DOMAINS = ['ra.co', 'residentadvisor.net'] as const;
export const OPEN_LISTING_SOURCES: Readonly<Record<string, readonly string[]>> = {
  residentadvisor: RA_DOMAINS,
  ra: RA_DOMAINS, // SOURCES key in scrape-all.ts / active-source-ids.ts
  'ra.co': RA_DOMAINS,
  cometogether: ['cometogether.live'],
  eventbrite: ['eventbrite.com'],
  meetup: ['meetup.com'],
  luma: ['lu.ma'],
};

function sourceDomains(source: string | null | undefined): readonly string[] | null {
  const key = source?.trim().toLowerCase();
  return key && Object.prototype.hasOwnProperty.call(OPEN_LISTING_SOURCES, key) ? OPEN_LISTING_SOURCES[key] : null;
}

export function isOpenListingSource(source: string | null | undefined): boolean {
  return sourceDomains(source) !== null;
}

/** host equals one of `domains` or is a subdomain of one. */
function onDomain(host: string, domains: Iterable<string>): boolean {
  for (const d of domains) if (host === d || host.endsWith(`.${d}`)) return true;
  return false;
}

/** The URL is https/http on the source's own domain. */
export function isOnSourceDomain(url: string | null | undefined, source: string | null | undefined): boolean {
  const host = url ? hostOf(url) : null;
  const domains = sourceDomains(source);
  return !!host && !!domains && onDomain(host, domains);
}

/**
 * Whether `url` may be published as the ticket link of an event from
 * `source`. Always true for sources that are not open-listing.
 */
export function isTrustedTicketUrl(url: string | null | undefined, source: string | null | undefined): boolean {
  if (!url) return false;
  if (!isOpenListingSource(source)) return true;
  const host = hostOf(url);
  if (!host) return false;
  return onDomain(host, getTicketHosts()) || onDomain(host, KNOWN_MERCHANT_HOSTS) || isOnSourceDomain(url, source);
}

export interface TicketTrustFields {
  source?: string | null;
  url?: string;
  ticketUrl?: string;
  ticketUrlResolved?: string | null;
}

/**
 * Clears ticket URLs (and an off-domain listing URL) that an open-listing
 * source may not publish. Returns the number of fields cleared. Applied once
 * per event at build load (sanitizeEventUrlFields) so HTML, JSON-LD offers,
 * api/*.json and the search index all see the same values; the CTA and the
 * Offer builder check again for callers that render events directly.
 */
export function applyTicketTrust(event: TicketTrustFields): number {
  if (!isOpenListingSource(event.source)) return 0;
  let cleared = 0;
  if (event.ticketUrl && !isTrustedTicketUrl(event.ticketUrl, event.source)) {
    event.ticketUrl = undefined;
    cleared++;
  }
  if (event.ticketUrlResolved && !isTrustedTicketUrl(event.ticketUrlResolved, event.source)) {
    event.ticketUrlResolved = null;
    cleared++;
  }
  if (event.url && !isOnSourceDomain(event.url, event.source)) {
    event.url = undefined;
    cleared++;
  }
  return cleared;
}
