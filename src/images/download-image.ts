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

export type SniffedImageType = 'jpeg' | 'png' | 'gif' | 'webp' | 'avif';

function asciiAt(buf: Uint8Array, offset: number, text: string): boolean {
  if (buf.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (buf[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identify a raster image by its leading bytes. Returns null for anything
 * else (HTML challenge pages, HEIC, truncated bodies).
 */
export function sniffImageType(buf: Uint8Array): SniffedImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && asciiAt(buf, 1, 'PNG') && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'png';
  if (asciiAt(buf, 0, 'GIF87a') || asciiAt(buf, 0, 'GIF89a')) return 'gif';
  if (asciiAt(buf, 0, 'RIFF') && asciiAt(buf, 8, 'WEBP')) return 'webp';
  if (asciiAt(buf, 4, 'ftyp')) {
    // ISO-BMFF: major brand at 8, compatible brands from 16 to the box end.
    const boxEnd = Math.min(buf.length, ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0);
    for (let at = 8; at + 4 <= boxEnd; at += at === 8 ? 8 : 4) {
      if (asciiAt(buf, at, 'avif') || asciiAt(buf, at, 'avis')) return 'avif';
    }
  }
  return null;
}

/** Test seams for the outbound guard (injected resolver / fetch). */
export type DownloadDeps = Pick<OutboundOptions, 'resolver' | 'fetchImpl'>;

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
  deps: DownloadDeps = {}
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

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const declaredImage = contentType.startsWith('image/');
    // Some CDNs (cometogether) serve real JPEG/PNG as a generic binary type;
    // those pass only when the bytes prove an image. HTML never passes.
    const genericBinary = contentType === '' || /^(application|binary)\/octet-stream\b/.test(contentType);
    if (!declaredImage && !genericBinary) {
      console.log(`  ⚠ Not an image (${contentType}) for ${imageUrl}`);
      return null;
    }

    const buffer = Buffer.from(response.body);
    if (!declaredImage && !sniffImageType(buffer)) {
      console.log(`  ⚠ Not an image (${contentType || 'no content-type'}, bytes are not JPEG/PNG/WebP/GIF/AVIF) for ${imageUrl}`);
      return null;
    }
    return buffer;
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
