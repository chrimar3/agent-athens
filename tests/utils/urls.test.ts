import { describe, test, expect } from 'bun:test';
import { buildURL } from '../../src/utils/urls';

describe('buildURL — trailing-token dedup (S133 Item 1)', () => {
  test('dedupes genre "Contemporary Dance" + type "dance"', () => {
    expect(buildURL({ genre: 'Contemporary Dance', type: 'dance' }))
      .toBe('contemporary-dance');
  });

  test('dedupes genre "Outdoor Cinema" + type "cinema"', () => {
    expect(buildURL({ genre: 'Outdoor Cinema', type: 'cinema' }))
      .toBe('outdoor-cinema');
  });

  test('preserves non-overlapping genre + type', () => {
    expect(buildURL({ genre: 'Contemporary Dance', type: 'performance' }))
      .toBe('contemporary-dance-performance');
  });

  test('preserves single-word genre + non-matching type', () => {
    expect(buildURL({ genre: 'Jazz', type: 'concert' }))
      .toBe('jazz-concert');
  });

  test('preserves type-only (no genre)', () => {
    expect(buildURL({ type: 'cinema' }))
      .toBe('cinema');
  });

  test('preserves price + dedupe-applied genre/type', () => {
    expect(buildURL({ price: 'open', genre: 'Outdoor Cinema', type: 'cinema', time: 'this-month' }))
      .toBe('open-outdoor-cinema-this-month');
  });

  test('preserves price-prefix when genre/type don\'t overlap', () => {
    expect(buildURL({ price: 'with-ticket', genre: 'Jazz', type: 'concert' }))
      .toBe('with-ticket-jazz-concert');
  });

  test('known limit: does not dedupe non-trailing token overlap', () => {
    // Documents current behavior. The dedup is intentionally trailing-only.
    // If genre vocabulary expands to include multi-word genres whose
    // non-trailing token overlaps with an event type, this test will need to
    // be revisited (and likely a token-anywhere dedup added). Today the only
    // known overlap patterns are trailing (dance/dance, cinema/cinema), so a
    // simpler dedup is preferred. This hypothetical "Dance Theater" genre
    // is illustrative only; no event currently uses it.
    expect(buildURL({ genre: 'Dance Theater', type: 'dance' }))
      .toBe('dance-theater-dance');
  });
});
