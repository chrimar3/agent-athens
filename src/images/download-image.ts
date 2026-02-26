/**
 * Download images from event source pages with appropriate headers.
 * Maps source domains to Referer headers to avoid hotlink blocking.
 */

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
 */
export async function downloadImage(imageUrl: string, source: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      'Accept': 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };

    const referer = getReferer(source);
    if (referer) {
      headers['Referer'] = referer;
    }

    const response = await fetch(imageUrl, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
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

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log(`  ⚠ Timeout downloading ${imageUrl}`);
    } else {
      console.log(`  ⚠ Error downloading ${imageUrl}: ${error.message}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
