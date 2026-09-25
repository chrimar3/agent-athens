import he from 'he';
import { applyTicketTrust } from '../ticketing/ticket-trust';

/**
 * Safe URL helpers for values that come from scraped or AI-supplied data.
 *
 * Every href/src built from event or venue data goes through one of these,
 * then through escapeAttr at the emission point. Both layers are required:
 * the validator fixes the scheme and canonical form, the escaper fixes the
 * attribute context.
 */

/** Longest URL accepted from data; longer values are dropped, not truncated. */
export const MAX_DATA_URL_LENGTH = 2048;

// Controls, whitespace, quotes, angle brackets, backtick and backslash never
// appear in a URL we want to publish; their presence means the value is not
// a plain URL and is rejected instead of repaired.
const UNSAFE_URL_CHARS = /[\u0000-\u0020\u007f-\u009f\u2028\u2029"'<>`\\]/;

/**
 * Scraped URLs often arrive entity-encoded ("?a=1&amp;b=2"). Decode them the
 * way a browser decodes an attribute value, so validation sees the URL a
 * visitor would actually follow and the output is not double-encoded.
 */
function decodeDataUrl(value: string): string {
  return he.decode(value.trim(), { isAttributeValue: true }).trim();
}

/**
 * Canonical http(s) URL (`new URL(x).href`) or null.
 * Rejects other schemes, credentials, empty hosts and unsafe characters.
 * Leading/trailing whitespace is trimmed before validation.
 */
export function safeHttpUrl(value: unknown, options: { httpsOnly?: boolean } = {}): string | null {
  if (typeof value !== 'string') return null;
  const raw = decodeDataUrl(value);
  if (!raw || raw.length > MAX_DATA_URL_LENGTH || UNSAFE_URL_CHARS.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const schemeOk = url.protocol === 'https:' || (url.protocol === 'http:' && !options.httpsOnly);
  if (!schemeOk || !url.hostname || url.username || url.password) return null;
  return url.href;
}

/**
 * Image source: a root-relative site path ("/images/…") or a canonical
 * http(s) URL. Protocol-relative ("//host") and any other scheme → null.
 */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = decodeDataUrl(value);
  if (raw.startsWith('/')) {
    if (raw.startsWith('//') || raw.length > MAX_DATA_URL_LENGTH || UNSAFE_URL_CHARS.test(raw)) return null;
    return raw;
  }
  return safeHttpUrl(raw);
}

/** First candidate that passes safeImageSrc, or null. */
export function firstSafeImageSrc(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const safe = safeImageSrc(candidate);
    if (safe) return safe;
  }
  return null;
}

/** Event fields that carry a URL and are published in HTML and JSON. */
export interface EventUrlFields {
  /** Scrape source; drives the ticket-trust rule (src/ticketing/ticket-trust.ts). */
  source?: string;
  /** Venue; its registry domains are trusted ticket hosts (src/ticketing/ticket-trust.ts). */
  venue?: { name?: string | null } | null;
  url?: string;
  ticketUrl?: string;
  ticketUrlResolved?: string | null;
  imageUrl?: string;
  imageLocal?: string;
  venueImage?: string;
}

/**
 * Replaces each URL field with its safeHttpUrl / safeImageSrc form, or clears
 * it when the value is not a safe URL. The build applies this once to every
 * event it loads, so the JSON files (api/*.json, data/events.json, the search
 * index) carry the same checked values the HTML templates emit. Ticket URLs
 * off a known ticketing platform, the source's own domain and the venue's
 * registered domain are cleared too (applyTicketTrust, every source).
 * Returns the number of fields cleared.
 */
export function sanitizeEventUrlFields(event: EventUrlFields): number {
  let cleared = 0;
  const http = (v: string | null | undefined) => {
    if (v === undefined || v === null || v === '') return v;
    const safe = safeHttpUrl(v);
    if (safe === null) cleared++;
    return safe;
  };
  const image = (v: string | undefined) => {
    if (v === undefined || v === '') return v;
    const safe = safeImageSrc(v);
    if (safe === null) cleared++;
    return safe ?? undefined;
  };
  if ('url' in event) event.url = http(event.url) ?? undefined;
  if ('ticketUrl' in event) event.ticketUrl = http(event.ticketUrl) ?? undefined;
  if ('ticketUrlResolved' in event) event.ticketUrlResolved = http(event.ticketUrlResolved) ?? null;
  if ('imageUrl' in event) event.imageUrl = image(event.imageUrl);
  if ('imageLocal' in event) event.imageLocal = image(event.imageLocal);
  if ('venueImage' in event) event.venueImage = image(event.venueImage);
  cleared += applyTicketTrust(event);
  return cleared;
}
