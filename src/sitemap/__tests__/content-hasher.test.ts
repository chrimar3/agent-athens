import { describe, test, expect } from 'bun:test';
import { stripVolatileContent, hashContent, loadManifest, resolveLastModified } from '../content-hasher';
import type { ContentHashManifest } from '../content-hasher';

describe('stripVolatileContent', () => {
  test('removes meta date tag', () => {
    const html = '<head><meta name="date" content="2026-03-02"><title>Test</title></head>';
    expect(stripVolatileContent(html)).toBe('<head><title>Test</title></head>');
  });

  test('removes meta last-modified tag', () => {
    const html = '<meta name="last-modified" content="2026-03-02T08:00:00.000Z">';
    expect(stripVolatileContent(html)).toBe('');
  });

  test('removes last-update span', () => {
    const html = '<div><span class="last-update">Τελευταία ενημέρωση: 2 Μαρ 2026</span></div>';
    expect(stripVolatileContent(html)).toBe('<div></div>');
  });

  test('removes datePublished from JSON-LD', () => {
    const html = '{"datePublished": "2026-03-02T08:00:00Z", "name": "Test"}';
    expect(stripVolatileContent(html)).toBe('{, "name": "Test"}');
  });

  test('removes dateModified from JSON-LD', () => {
    const html = '{"dateModified": "2026-03-02T08:00:00Z", "name": "Test"}';
    expect(stripVolatileContent(html)).toBe('{, "name": "Test"}');
  });

  test('removes lastUpdate from JSON API', () => {
    const html = '{"lastUpdate": "2026-03-02T10:00:00.000Z", "total": 42}';
    expect(stripVolatileContent(html)).toBe('{, "total": 42}');
  });

  test('preserves non-volatile content', () => {
    const html = '<h1>Athens Events</h1><p>Concerts today</p>';
    expect(stripVolatileContent(html)).toBe(html);
  });
});

describe('hashContent', () => {
  test('returns 16-char hex string', () => {
    const hash = hashContent('<h1>Test</h1>');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('same input produces same hash', () => {
    const html = '<h1>Athens Events</h1>';
    expect(hashContent(html)).toBe(hashContent(html));
  });

  test('different input produces different hash', () => {
    expect(hashContent('<h1>Page A</h1>')).not.toBe(hashContent('<h1>Page B</h1>'));
  });

  test('same content with different timestamps produces same hash', () => {
    const pageV1 = `<head>
      <meta name="date" content="2026-03-01">
      <meta name="last-modified" content="2026-03-01T08:00:00Z">
    </head>
    <body><h1>Events</h1><span class="last-update">1 Μαρ 2026</span></body>
    <script type="application/ld+json">{"datePublished": "2026-03-01", "dateModified": "2026-03-01"}</script>`;

    const pageV2 = `<head>
      <meta name="date" content="2026-03-02">
      <meta name="last-modified" content="2026-03-02T08:00:00Z">
    </head>
    <body><h1>Events</h1><span class="last-update">2 Μαρ 2026</span></body>
    <script type="application/ld+json">{"datePublished": "2026-03-02", "dateModified": "2026-03-02"}</script>`;

    expect(hashContent(pageV1)).toBe(hashContent(pageV2));
  });
});

describe('loadManifest', () => {
  test('returns empty manifest when file missing', () => {
    const manifest = loadManifest('/tmp/nonexistent-content-hashes.json');
    expect(manifest.version).toBe(1);
    expect(manifest.entries).toEqual({});
  });
});

describe('resolveLastModified', () => {
  const previousManifest: ContentHashManifest = {
    version: 1,
    generatedAt: '2026-03-01T08:00:00+02:00',
    entries: {
      'index': { hash: 'abcdef0123456789', lastModified: '2026-02-15' },
      'events/test-event': { hash: '1111111111111111', lastModified: '2026-02-20' },
    },
  };

  test('preserves old date when hash unchanged', () => {
    const result = resolveLastModified('index', 'abcdef0123456789', previousManifest);
    expect(result).toBe('2026-02-15');
  });

  test('returns today for changed hash', () => {
    const result = resolveLastModified('index', 'different_hash_00', previousManifest);
    // Should be today's date (not the old one)
    expect(result).not.toBe('2026-02-15');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('returns today for new URL', () => {
    const result = resolveLastModified('venues/new-venue', 'aabbccdd11223344', previousManifest);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
