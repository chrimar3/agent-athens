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

// S101a: date-windowed editorial picks. The featuredEvents map gains optional
// validFrom/validUntil/rank fields per entry. Entries without those fields keep
// their existing always-return behavior (backward compat for placeholder data).
// Tests reference the worked-example entry added to editorial-content.json with
// validFrom=2026-05-22, validUntil=2026-05-28.
describe('getFeaturedVignette date window', () => {
  // Real event ID from data/events.db (NO MORE FAKE DISCO, 2026-05-22).
  // Coupled to the corresponding entry in config/editorial-content.json \u2014 if the
  // event is removed from the DB, this entry stays orphaned but tests still pass
  // since they exercise the JSON loader, not DB joins.
  const WINDOWED_ID = '3636471c494352ae';

  test('returns vignette when currentDate is within window', () => {
    const result = getFeaturedVignette(WINDOWED_ID, 'el', '2026-05-25');
    expect(result).not.toBeNull();
    expect(result).toBeString();
  });

  test('returns null when currentDate is before validFrom', () => {
    const result = getFeaturedVignette(WINDOWED_ID, 'el', '2026-05-21');
    expect(result).toBeNull();
  });

  test('returns null when currentDate is after validUntil', () => {
    const result = getFeaturedVignette(WINDOWED_ID, 'el', '2026-05-29');
    expect(result).toBeNull();
  });

  test('boundary: validFrom date is inclusive', () => {
    const result = getFeaturedVignette(WINDOWED_ID, 'el', '2026-05-22');
    expect(result).not.toBeNull();
  });

  test('boundary: validUntil date is inclusive', () => {
    const result = getFeaturedVignette(WINDOWED_ID, 'el', '2026-05-28');
    expect(result).not.toBeNull();
  });

  test('backward compat: entries without date fields ignore currentDate', () => {
    // PLACEHOLDER_EVENT_001 has no validFrom/validUntil \u2014 should always return
    const inFuture = getFeaturedVignette('PLACEHOLDER_EVENT_001', 'el', '2099-01-01');
    expect(inFuture).not.toBeNull();
    expect(inFuture).toContain('PLACEHOLDER');
  });

  test('backward compat: omitting currentDate uses today', () => {
    // No currentDate arg \u2014 entries without window fields still return as before
    const result = getFeaturedVignette('PLACEHOLDER_EVENT_001', 'el');
    expect(result).not.toBeNull();
  });
});
