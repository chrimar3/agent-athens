import { describe, test, expect } from 'bun:test';
import { classifyUrl, buildUrlEntry } from '../generate-sitemaps';
import type { ContentHashManifest } from '../content-hasher';

describe('classifyUrl', () => {
  test('classifies event URLs', () => {
    expect(classifyUrl('events/abc123-venue-title')).toBe('events');
    expect(classifyUrl('events/some-slug')).toBe('events');
  });

  test('classifies venue URLs', () => {
    expect(classifyUrl('venues/half-note')).toBe('venues');
    expect(classifyUrl('venues/megaron')).toBe('venues');
  });

  test('classifies homepage as editorial', () => {
    expect(classifyUrl('index')).toBe('editorial');
  });

  test('classifies time filter pages as editorial', () => {
    expect(classifyUrl('today')).toBe('editorial');
    expect(classifyUrl('this-week')).toBe('editorial');
    expect(classifyUrl('this-weekend')).toBe('editorial');
  });

  test('classifies category pages as editorial', () => {
    expect(classifyUrl('concerts')).toBe('editorial');
    expect(classifyUrl('exhibitions')).toBe('editorial');
  });

  test('classifies content pages as editorial', () => {
    expect(classifyUrl('about/')).toBe('editorial');
    expect(classifyUrl('editorial/')).toBe('editorial');
    expect(classifyUrl('corrections/')).toBe('editorial');
  });

  test('classifies combined filter pages as editorial', () => {
    expect(classifyUrl('concert-this-week')).toBe('editorial');
    expect(classifyUrl('open-today')).toBe('editorial');
  });
});

describe('buildUrlEntry — per-URL slash form preservation', () => {
  // Regression guards for the canonical-must-equal-served-form bug class.
  // Sitemap is data-driven: ${BASE_URL}/${urlPath}. These tests pin the
  // invariant that the sitemap preserves whatever slash form the upstream
  // generate-site.ts push uses. If anyone later inserts a normalizer that
  // strips or appends slashes inside the sitemap generator, these fail.
  const emptyManifest: ContentHashManifest = { version: 1, generatedAt: '', entries: {} };

  test('EN hub urlPath with trailing slash → <loc> trailing slash', () => {
    const entry = buildUrlEntry('en/this-weekend/', emptyManifest);
    expect(entry).toContain('<loc>https://agentathens.com/en/this-weekend/</loc>');
  });

  test('EL hub urlPath without trailing slash → <loc> no-slash (parity)', () => {
    const entry = buildUrlEntry('this-weekend', emptyManifest);
    expect(entry).toContain('<loc>https://agentathens.com/this-weekend</loc>');
    expect(entry).not.toContain('<loc>https://agentathens.com/this-weekend/</loc>');
  });

  test('homepage urlPath "index" → <loc> bare base URL (root parity)', () => {
    const entry = buildUrlEntry('index', emptyManifest);
    expect(entry).toContain('<loc>https://agentathens.com</loc>');
  });
});
