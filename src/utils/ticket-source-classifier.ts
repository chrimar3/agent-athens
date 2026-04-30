/**
 * Ticket source classifier
 *
 * Classifies a ticket URL by host into one of four lanes that drive
 * JSON-LD `offers` emission decisions (Sprint 1 Session 2):
 *
 *   - known_merchant:     online checkout — emit offers.url + Organization seller derived from host
 *   - listing_aggregator: editorial / program page — omit offers.url (host is not the seller)
 *   - venue_direct_only:  venue site, no online checkout — omit offers.url, venue is the seller
 *   - unclassified:       host not in config — emit ticket_url as-is + log for next audit
 *
 * Host config lives in `config/ticket-source-classification.json` so per-city
 * agents (agent-barcelona, agent-berlin) can ship their own without code changes.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export type TicketSourceClass =
  | 'known_merchant'
  | 'listing_aggregator'
  | 'venue_direct_only'
  | 'unclassified';

interface ClassificationConfig {
  known_merchants: string[];
  listing_aggregators: string[];
  venue_direct_only: string[];
}

const config: ClassificationConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/ticket-source-classification.json'), 'utf-8')
);

const knownMerchants = new Set(config.known_merchants.map((h) => h.toLowerCase()));
const listingAggregators = new Set(config.listing_aggregators.map((h) => h.toLowerCase()));
const venueDirectOnly = new Set(config.venue_direct_only.map((h) => h.toLowerCase()));

/**
 * Extract a normalized hostname from a URL.
 * Returns null if the input is null, empty, or unparseable.
 * Strips `www.` prefix and lowercases. Port numbers are stripped by the URL constructor
 * when they match the protocol's default (e.g. `:443` for https).
 */
export function extractHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Classify a ticket URL by host. Returns 'unclassified' for any host not
 * present in the config, including null/undefined/invalid URLs.
 */
export function classifySource(url: string | null | undefined): TicketSourceClass {
  const host = extractHost(url);
  if (!host) return 'unclassified';
  if (knownMerchants.has(host)) return 'known_merchant';
  if (listingAggregators.has(host)) return 'listing_aggregator';
  if (venueDirectOnly.has(host)) return 'venue_direct_only';
  return 'unclassified';
}

/**
 * Convert a host to a display name for `seller.name` in JSON-LD.
 * Capitalizes the first character of the host; leaves the rest as-is.
 *   'more.com'      → 'More.com'
 *   'viva.gr'       → 'Viva.gr'
 *   'tickets.in.gr' → 'Tickets.in.gr'
 *
 * NOTE: deliberately mechanical. Don't try to fetch real organization names
 * from anywhere — that's fabrication risk. schema.org accepts a host-derived name.
 */
export function hostToName(host: string): string {
  if (host.length === 0) return host;
  return host.charAt(0).toUpperCase() + host.slice(1);
}
