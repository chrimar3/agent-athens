/**
 * Download images from event source pages with appropriate headers.
 * Maps source domains to Referer headers to avoid hotlink blocking.
 */

import { safeFetch, OutboundUrlError, type OutboundOptions } from '../utils/outbound-url';

const REFERER_MAP: Record<string, string> = {
  'athinorama': 'https://www.athinorama.gr/',
  'more.com': 'https://www.more.com/',
  'more': 'https://www.more.com/',
  'ra.co': 'https://ra.co/',
  'ra': 'https://ra.co/',
  'megaron': 'https://www.megaron.gr/',
  'ticketservices': 'https://www.ticketservices.gr/',
  'ticketservices.gr': 'https://www.ticketservices.gr/',
  'halfnote': 'https://www.halfnote.net/',
  'halfnote.net': 'https://www.halfnote.net/',
  'eventbrite': 'https://www.eventbrite.com/',
  'viva': 'https://www.viva.gr/',
  'viva.gr': 'https://www.viva.gr/',
  'snfcc': 'https://www.snfcc.org/',
  'this-is-athens': 'https://www.thisisathens.org/',
};

/** Largest image body accepted from a remote host. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Get the Referer header for a given source domain.
 * Exported for testing.
 */
export function getReferer(source: string): string | undefined {
  // Try exact match first
  if (REFERER_MAP[source]) return REFERER_MAP[source];

  // Try matching against URL domain
  const lower = source.toLowerCase();
  for (const [key, value] of Object.entries(REFERER_MAP)) {
    if (lower.includes(key)) return value;
  }

  return undefined;
}

/**
 * Download an image from a URL with appropriate headers.
 * Returns the image buffer on success, null on failure.
 *
 * The URL comes from scraped data, so it goes through the outbound guard:
 * public http(s) hosts only, every redirect re-validated, MAX_IMAGE_BYTES cap,
 * 10 s total timeout. `deps` is for tests (injected resolver / fetch).
 */
export async function downloadImage(
  imageUrl: string,
  source: string,
  deps: Pick<OutboundOptions, 'resolver' | 'fetchImpl'> = {}
): Promise<Buffer | null> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      'Accept': 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };

    const referer = getReferer(source);
    if (referer) {
      headers['Referer'] = referer;
    }

    const response = await safeFetch(imageUrl, {
      headers,
      timeoutMs: 10_000,
      maxBytes: MAX_IMAGE_BYTES,
      ...deps,
    });

    if (!response.ok) {
      console.log(`  ⚠ HTTP ${response.status} for ${imageUrl}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      console.log(`  ⚠ Not an image (${contentType}) for ${imageUrl}`);
      return null;
    }

    return Buffer.from(response.body);
  } catch (error: any) {
    if (error instanceof OutboundUrlError && error.code === 'timeout') {
      console.log(`  ⚠ Timeout downloading ${imageUrl}`);
    } else if (error instanceof OutboundUrlError) {
      console.log(`  ⚠ Refused ${imageUrl} (${error.code})`);
    } else {
      console.log(`  ⚠ Error downloading ${imageUrl}: ${error.message}`);
    }
    return null;
  }
}
