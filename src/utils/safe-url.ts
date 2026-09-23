import he from 'he';

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
