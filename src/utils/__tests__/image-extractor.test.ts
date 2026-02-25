import { describe, test, expect } from 'bun:test';
import { extractOgImage, isValidImageUrl, resolveUrl, upgradeWordPressThumbnail } from '../image-extractor';

describe('extractOgImage', () => {
  test('extracts standard og:image meta tag', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/image.jpg">
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://example.com/image.jpg');
    expect(result!.method).toBe('og_image');
    expect(result!.confidence).toBe('high');
  });

  test('handles reversed attribute order', () => {
    const html = `<html><head>
      <meta content="https://example.com/photo.jpg" property="og:image">
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://example.com/photo.jpg');
  });

  test('falls back to twitter:image', () => {
    const html = `<html><head>
      <meta name="twitter:image" content="https://cdn.example.com/tw-image.jpg">
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://cdn.example.com/tw-image.jpg');
    expect(result!.method).toBe('twitter_image');
  });

  test('falls back to JSON-LD image field', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Event", "name": "Test", "image": "https://example.com/ld-image.jpg"}
      </script>
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://example.com/ld-image.jpg');
    expect(result!.method).toBe('json_ld_image');
    expect(result!.confidence).toBe('medium');
  });

  test('handles JSON-LD image as array', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Event", "image": ["https://example.com/first.jpg", "https://example.com/second.jpg"]}
      </script>
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://example.com/first.jpg');
  });

  test('returns null when no image found', () => {
    const html = `<html><head><title>No images here</title></head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).toBeNull();
  });

  test('rejects tracking pixel URLs', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/pixel.gif">
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).toBeNull();
  });

  test('rejects placeholder/spacer images', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/spacer.gif">
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).toBeNull();
  });

  test('resolves protocol-relative URLs', () => {
    const html = `<html><head>
      <meta property="og:image" content="//cdn.example.com/image.jpg">
    </head><body></body></html>`;
    const result = extractOgImage(html, 'https://example.com/page');
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://cdn.example.com/image.jpg');
  });

  test('resolves relative URLs with sourceUrl', () => {
    const html = `<html><head>
      <meta property="og:image" content="/uploads/event-photo.jpg">
    </head><body></body></html>`;
    const result = extractOgImage(html, 'https://example.com/events/123');
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://example.com/uploads/event-photo.jpg');
  });

  test('prefers og:image over twitter:image', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.jpg">
      <meta name="twitter:image" content="https://example.com/tw.jpg">
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result!.imageUrl).toBe('https://example.com/og.jpg');
    expect(result!.method).toBe('og_image');
  });

  test('handles single-quoted attributes', () => {
    const html = `<html><head>
      <meta property='og:image' content='https://example.com/single-quote.jpg'>
    </head><body></body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://example.com/single-quote.jpg');
  });

  test('falls back to content image from WordPress uploads', () => {
    const html = `<html><head><title>Event</title></head><body>
      <img src="https://example.com/wp-content/uploads/2026/02/event-photo-100x70.jpg">
    </body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://example.com/wp-content/uploads/2026/02/event-photo.jpg');
    expect(result!.method).toBe('content_image');
    expect(result!.confidence).toBe('low');
  });

  test('content image skips logos and site chrome', () => {
    const html = `<html><head><title>Event</title></head><body>
      <img src="https://example.com/wp-content/uploads/logo-site.jpg">
      <img src="https://example.com/wp-content/uploads/2026/02/icon-small.jpg">
      <img src="https://example.com/wp-content/uploads/2026/02/real-event.jpg">
    </body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://example.com/wp-content/uploads/2026/02/real-event.jpg');
  });

  test('content image finds CDN-hosted images', () => {
    const html = `<html><head><title>Event</title></head><body>
      <img src="https://cdn.example.com/media/events/concert-poster.jpg">
    </body></html>`;
    const result = extractOgImage(html);
    expect(result).not.toBeNull();
    expect(result!.imageUrl).toBe('https://cdn.example.com/media/events/concert-poster.jpg');
  });

  test('prefers og:image over content image', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.jpg">
    </head><body>
      <img src="https://example.com/wp-content/uploads/2026/02/body.jpg">
    </body></html>`;
    const result = extractOgImage(html);
    expect(result!.method).toBe('og_image');
  });
});

describe('isValidImageUrl', () => {
  test('accepts valid HTTPS image URLs', () => {
    expect(isValidImageUrl('https://example.com/photo.jpg')).toBe(true);
    expect(isValidImageUrl('https://cdn.example.com/events/2026/banner.png')).toBe(true);
  });

  test('accepts valid HTTP image URLs', () => {
    expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
  });

  test('rejects empty strings', () => {
    expect(isValidImageUrl('')).toBe(false);
  });

  test('rejects very short URLs', () => {
    expect(isValidImageUrl('http://x')).toBe(false);
  });

  test('rejects non-HTTP protocols', () => {
    expect(isValidImageUrl('data:image/png;base64,abc')).toBe(false);
    expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
  });

  test('rejects tracking pixels', () => {
    expect(isValidImageUrl('https://example.com/pixel.gif')).toBe(false);
    expect(isValidImageUrl('https://example.com/spacer.gif')).toBe(false);
    expect(isValidImageUrl('https://example.com/1x1.png')).toBe(false);
    expect(isValidImageUrl('https://example.com/tracking-pixel.png')).toBe(false);
  });

  test('rejects placeholder images', () => {
    expect(isValidImageUrl('https://example.com/placeholder.jpg')).toBe(false);
    expect(isValidImageUrl('https://example.com/default-avatar.png')).toBe(false);
  });

  test('rejects SVG logos that are too generic', () => {
    expect(isValidImageUrl('https://example.com/logo.svg')).toBe(false);
    expect(isValidImageUrl('https://example.com/favicon.ico')).toBe(false);
  });
});

describe('resolveUrl', () => {
  test('passes through absolute HTTPS URLs', () => {
    expect(resolveUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg');
  });

  test('prepends https: to protocol-relative URLs', () => {
    expect(resolveUrl('//cdn.example.com/image.jpg')).toBe('https://cdn.example.com/image.jpg');
  });

  test('resolves relative URLs with base URL', () => {
    expect(resolveUrl('/uploads/photo.jpg', 'https://example.com/events/123'))
      .toBe('https://example.com/uploads/photo.jpg');
  });

  test('resolves relative path URLs with base URL', () => {
    expect(resolveUrl('images/photo.jpg', 'https://example.com/events/123'))
      .toBe('https://example.com/events/images/photo.jpg');
  });

  test('returns original if no base URL for relative path', () => {
    expect(resolveUrl('/uploads/photo.jpg')).toBe('/uploads/photo.jpg');
  });
});

describe('upgradeWordPressThumbnail', () => {
  test('strips -WIDTHxHEIGHT suffix', () => {
    expect(upgradeWordPressThumbnail('https://example.com/wp-content/uploads/2026/02/photo-100x70.jpg'))
      .toBe('https://example.com/wp-content/uploads/2026/02/photo.jpg');
  });

  test('handles large dimensions', () => {
    expect(upgradeWordPressThumbnail('https://example.com/image-816X465.jpg'))
      .toBe('https://example.com/image.jpg');
  });

  test('leaves non-thumbnail URLs unchanged', () => {
    expect(upgradeWordPressThumbnail('https://example.com/wp-content/uploads/2026/02/photo.jpg'))
      .toBe('https://example.com/wp-content/uploads/2026/02/photo.jpg');
  });

  test('only strips the last size suffix', () => {
    expect(upgradeWordPressThumbnail('https://example.com/uploads/2026-02/image-100x70.png'))
      .toBe('https://example.com/uploads/2026-02/image.png');
  });
});
