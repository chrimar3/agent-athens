/**
 * Image Extractor — extracts og:image / twitter:image / JSON-LD image URLs from HTML
 *
 * Pure functions, no side effects. Used by:
 * - scripts/enrich-images.ts (backfill)
 * - scrapers (future: extract at scrape time)
 */

export interface ImageResult {
  imageUrl: string;
  confidence: 'high' | 'medium' | 'low';
  method: 'og_image' | 'twitter_image' | 'json_ld_image' | 'content_image';
}

// Patterns that indicate tracking pixels, placeholders, or generic assets
const REJECT_PATTERNS = [
  /pixel/i,
  /spacer/i,
  /1x1/i,
  /tracking/i,
  /placeholder/i,
  /default-avatar/i,
  /favicon\.ico$/i,
  /logo\.svg$/i,
  /\.svg$/i,
  /\.ico$/i,
];

/**
 * Check if a URL points to a real event image (not a tracking pixel or placeholder)
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || url.length < 15) return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  return true;
}

/**
 * Resolve protocol-relative and relative URLs against a base URL
 */
export function resolveUrl(url: string, baseUrl?: string): string {
  // Protocol-relative: //cdn.example.com/...
  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Relative — need base URL
  if (baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }

  return url;
}

/**
 * Extract og:image, twitter:image, or JSON-LD image from HTML
 *
 * Priority: og:image → twitter:image → JSON-LD "image" field
 * Validates URLs and resolves relative paths.
 */
export function extractOgImage(html: string, sourceUrl?: string): ImageResult | null {
  // 1. Try og:image (highest priority, most reliable)
  const ogImage = extractMetaContent(html, 'og:image', 'property');
  if (ogImage) {
    const resolved = resolveUrl(ogImage, sourceUrl);
    if (isValidImageUrl(resolved)) {
      return { imageUrl: resolved, confidence: 'high', method: 'og_image' };
    }
  }

  // 2. Try twitter:image
  const twitterImage = extractMetaContent(html, 'twitter:image', 'name');
  if (twitterImage) {
    const resolved = resolveUrl(twitterImage, sourceUrl);
    if (isValidImageUrl(resolved)) {
      return { imageUrl: resolved, confidence: 'high', method: 'twitter_image' };
    }
  }

  // 3. Try JSON-LD "image" field
  const jsonLdImage = extractJsonLdImage(html);
  if (jsonLdImage) {
    const resolved = resolveUrl(jsonLdImage, sourceUrl);
    if (isValidImageUrl(resolved)) {
      return { imageUrl: resolved, confidence: 'medium', method: 'json_ld_image' };
    }
  }

  // 4. Fallback: find first content image in body (WordPress uploads, CDN images)
  const contentImage = extractFirstContentImage(html, sourceUrl);
  if (contentImage) {
    return { imageUrl: contentImage, confidence: 'low', method: 'content_image' };
  }

  return null;
}

/**
 * Extract content from a meta tag by property or name attribute.
 * Handles both attribute orders: property→content and content→property.
 */
function extractMetaContent(html: string, name: string, attrType: 'property' | 'name'): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern 1: <meta property="og:image" content="...">
  const pattern1 = new RegExp(
    `<meta\\s+${attrType}=['"](${escapedName})['"]\\s+content=['"]([^'"]+)['"]`,
    'i'
  );
  const match1 = html.match(pattern1);
  if (match1) return match1[2];

  // Pattern 2: <meta content="..." property="og:image">  (reversed order)
  const pattern2 = new RegExp(
    `<meta\\s+content=['"]([^'"]+)['"]\\s+${attrType}=['"](${escapedName})['"]`,
    'i'
  );
  const match2 = html.match(pattern2);
  if (match2) return match2[1];

  return null;
}

// Patterns for site chrome that should be skipped when scanning body images
const CHROME_PATTERNS = [
  /logo/i,
  /icon/i,
  /banner/i,
  /sprite/i,
  /avatar/i,
  /badge/i,
  /button/i,
  /arrow/i,
  /advert/i,
  /widget/i,
  /sidebar/i,
  /footer/i,
  /header-img/i,
  /gravatar/i,
  /cropped-/i,       // WordPress cropped site identity images
  /antagonistikotita/i, // halfnote ad banner
];

/**
 * Upgrade a WordPress thumbnail URL to its full-size original.
 * Strips the -WIDTHxHEIGHT suffix: image-100x70.jpg → image.jpg
 */
export function upgradeWordPressThumbnail(url: string): string {
  return url.replace(/-\d+[xX]\d+\./, '.');
}

/**
 * Extract the first content image from HTML body.
 * Targets WordPress uploads and CDN-hosted event images.
 * Skips logos, icons, ads, and tiny thumbnails.
 */
function extractFirstContentImage(html: string, sourceUrl?: string): string | null {
  // Match <img> tags with src pointing to common image extensions
  const imgPattern = /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["'][^>]*>/gi;
  let imgMatch;

  while ((imgMatch = imgPattern.exec(html)) !== null) {
    const rawUrl = imgMatch[1];

    // Skip site chrome
    let isChrome = false;
    for (const pattern of CHROME_PATTERNS) {
      if (pattern.test(rawUrl)) { isChrome = true; break; }
    }
    if (isChrome) continue;

    // Must be from a content path (wp-content/uploads, CDN, etc.)
    const isContentPath = /wp-content\/uploads|cdn\.|media\.|images\/events|pictures\//i.test(rawUrl);
    if (!isContentPath) continue;

    // Resolve and upgrade WordPress thumbnails
    let resolved = resolveUrl(rawUrl, sourceUrl);
    resolved = upgradeWordPressThumbnail(resolved);

    if (isValidImageUrl(resolved)) {
      return resolved;
    }
  }

  return null;
}

/**
 * Extract image URL from JSON-LD script blocks
 */
function extractJsonLdImage(html: string): string | null {
  const scriptPattern = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;

  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(scriptMatch[1]);
      const image = data.image;
      if (!image) continue;

      if (typeof image === 'string') return image;
      if (Array.isArray(image) && image.length > 0 && typeof image[0] === 'string') return image[0];
      if (typeof image === 'object' && image.url) return image.url;
    } catch {
      // Malformed JSON-LD, skip
    }
  }

  return null;
}
