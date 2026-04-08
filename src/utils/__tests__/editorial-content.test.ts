import { describe, test, expect } from 'bun:test';
import { getPullQuotes, getFeaturedVignette, getSectionEditorial } from '../editorial-content';

describe('getPullQuotes', () => {
  test('matching hub returns non-empty array', () => {
    const result = getPullQuotes('concerts', 'el');
    expect(result.length).toBeGreaterThan(0);
  });

  test('non-matching hub returns empty array', () => {
    const result = getPullQuotes('nonexistent', 'el');
    expect(result).toEqual([]);
  });

  test('locale el returns Greek text', () => {
    const results = getPullQuotes('concerts', 'el');
    for (const text of results) {
      expect(text).toContain('PLACEHOLDER');
      // Greek seed data contains Greek characters
      expect(text).toMatch(/[\u0370-\u03FF]/);
    }
  });

  test('locale en returns English text', () => {
    const results = getPullQuotes('concerts', 'en');
    for (const text of results) {
      expect(text).toContain('PLACEHOLDER');
      expect(text).toMatch(/Athens/);
    }
  });
});

describe('getFeaturedVignette', () => {
  test('known event ID returns string', () => {
    const result = getFeaturedVignette('PLACEHOLDER_EVENT_001', 'el');
    expect(result).toBeString();
    expect(result).toContain('PLACEHOLDER');
  });

  test('unknown event ID returns null', () => {
    const result = getFeaturedVignette('no-such-id', 'el');
    expect(result).toBeNull();
  });

  test('locale selects correct language', () => {
    const greek = getFeaturedVignette('PLACEHOLDER_EVENT_001', 'el');
    const english = getFeaturedVignette('PLACEHOLDER_EVENT_001', 'en');
    expect(greek).toMatch(/[\u0370-\u03FF]/);
    expect(english).toMatch(/night worth remembering/);
  });
});

describe('getSectionEditorial', () => {
  test('known hub returns string', () => {
    const result = getSectionEditorial('concerts', 'en');
    expect(result).toBeString();
    expect(result).toContain('PLACEHOLDER');
  });

  test('unknown hub returns null', () => {
    const result = getSectionEditorial('nonexistent', 'en');
    expect(result).toBeNull();
  });

  test('locale selects correct language', () => {
    const greek = getSectionEditorial('concerts', 'el');
    const english = getSectionEditorial('concerts', 'en');
    expect(greek).toMatch(/[\u0370-\u03FF]/);
    expect(english).toMatch(/rebetiko/);
  });
});
