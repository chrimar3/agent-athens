// Unit tests for normalizePriceType — the write-boundary belt-and-suspenders
// guard that maps legacy / sentinel price_type values to canonical vocabulary.
//
// Added 2026-05-13 (s-tba-bypass session). Before this session normalizePriceType
// was un-exported and only invoked at src/db/database.ts:92 (canonical upsertEvent).
// Multiple scraper-side writers (scripts/scrape-all.ts, scrape-ai-tech.ts,
// scrape-snfcc.ts) bound the raw scraped price_type to their own INSERT statements
// and bypassed the normalizer. This file pins the function's contract and exports
// the symbol for those parallel writers to import.
import { describe, test, expect } from 'bun:test';
import { normalizePriceType } from '../database';

describe('normalizePriceType — canonical-vocabulary guarantee', () => {
  test("'tba' → 'with-ticket' (S136 belt-and-suspenders)", () => {
    expect(normalizePriceType('tba')).toBe('with-ticket');
  });

  test("'open' passes through", () => {
    expect(normalizePriceType('open')).toBe('open');
  });

  test("'with-ticket' passes through", () => {
    expect(normalizePriceType('with-ticket')).toBe('with-ticket');
  });

  test("'donation' passes through (dormant-but-wired per S136)", () => {
    expect(normalizePriceType('donation')).toBe('donation');
  });

  test("return value is always in the canonical 3-value set", () => {
    const CANONICAL = new Set(['open', 'with-ticket', 'donation']);
    for (const input of ['tba', 'open', 'with-ticket', 'donation']) {
      expect(CANONICAL.has(normalizePriceType(input))).toBe(true);
    }
  });
});
