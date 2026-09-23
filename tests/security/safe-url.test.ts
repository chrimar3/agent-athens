import { describe, expect, test } from 'bun:test';
import { safeHttpUrl, safeImageSrc, firstSafeImageSrc, MAX_DATA_URL_LENGTH } from '../../src/utils/safe-url';

describe('safeHttpUrl', () => {
  test('returns the canonical href for http(s)', () => {
    expect(safeHttpUrl('https://WWW.Viva.GR')).toBe('https://www.viva.gr/');
    expect(safeHttpUrl('  http://example.com/a?b=1  ')).toBe('http://example.com/a?b=1');
    expect(safeHttpUrl('https://x.gr/θέατρο')).toBe('https://x.gr/%CE%B8%CE%AD%CE%B1%CF%84%CF%81%CE%BF');
    expect(safeHttpUrl('https://x.gr/?a=1&amp;b=2')).toBe('https://x.gr/?a=1&b=2');
    expect(safeHttpUrl('https://x.gr/?a=1&copy=2')).toBe('https://x.gr/?a=1&copy=2');
  });
  test('httpsOnly refuses http', () => {
    expect(safeHttpUrl('http://example.com/', { httpsOnly: true })).toBeNull();
  });
  for (const bad of [
    undefined, null, 42, '', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'vbscript:x',
    'ftp://x.gr/', 'mailto:a@b.c', '//x.gr/a', '/a', 'https://u:p@x.gr/', 'https://x.gr/"onfocus=x',
    "https://x.gr/'x", 'https://x.gr/<a>', 'https://x.gr/`', 'https://x.gr/a b', 'https://x.gr/\nx',
    'https://x.gr/a\\b', 'https://x.gr/&quot;onfocus=x', 'https://x.gr/&lt;script&gt;',
    'https://x.gr/' + 'a'.repeat(MAX_DATA_URL_LENGTH), 'https://', 'not a url',
  ]) {
    test(`rejects ${JSON.stringify(bad)?.slice(0, 40)}`, () => expect(safeHttpUrl(bad)).toBeNull());
  }
});

describe('safeImageSrc / firstSafeImageSrc', () => {
  test('root-relative site paths and http(s) URLs pass', () => {
    expect(safeImageSrc('/images/events/abc.webp')).toBe('/images/events/abc.webp');
    expect(safeImageSrc('https://cdn.x.gr/a.jpg')).toBe('https://cdn.x.gr/a.jpg');
  });
  test('protocol-relative, other schemes and breakout characters fail', () => {
    for (const bad of ['//evil.example/a.png', 'javascript:x', 'data:image/svg+xml,<svg>', "/images/a.webp')", '/a"b', 'images/a.webp']) {
      expect(safeImageSrc(bad)).toBeNull();
    }
  });
  test('first safe candidate wins', () => {
    expect(firstSafeImageSrc('javascript:x', undefined, '/images/v.webp')).toBe('/images/v.webp');
    expect(firstSafeImageSrc(undefined, '')).toBeNull();
  });
});
