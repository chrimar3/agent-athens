/**
 * Tests for richness-scorer.ts — field-aware event quality scoring
 *
 * Scoring determines which record "wins" when two cross-source
 * duplicates are merged. Higher score = richer data = winner.
 */

import { describe, test, expect } from 'bun:test';
import { scoreRichness, SOURCE_PRIORITY } from '../richness-scorer';

function makeRow(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'test-event-1',
    title: 'Test Event',
    source: 'athinorama.gr',
    description: null,
    full_description: null,
    image_url: null,
    image_source: null,
    price_amount: null,
    price_range: null,
    ticket_url: null,
    time_doors: null,
    time_peak: null,
    semantic_tags: null,
    ai_context: null,
    genres: null,
    ...overrides,
  };
}

describe('scoreRichness', () => {
  test('full_description (len 2000) scores ~20pts for that field', () => {
    const row = makeRow({ full_description: 'a'.repeat(2000) });
    const result = scoreRichness(row);
    expect(result.breakdown.full_description).toBe(20);
  });

  test('image_url scores 10pts', () => {
    const row = makeRow({ image_url: 'https://example.com/img.jpg' });
    const result = scoreRichness(row);
    expect(result.breakdown.image_url).toBe(10);
  });

  test('image_url "not_found" does NOT score', () => {
    const row = makeRow({ image_url: 'not_found', image_source: 'not_found' });
    const result = scoreRichness(row);
    expect(result.breakdown.image_url).toBe(0);
  });

  test('price_amount scores 10pts', () => {
    const row = makeRow({ price_amount: 15 });
    const result = scoreRichness(row);
    expect(result.breakdown.price).toBe(10);
  });

  test('ticket_url scores 10pts', () => {
    const row = makeRow({ ticket_url: 'https://tickets.example.com' });
    const result = scoreRichness(row);
    expect(result.breakdown.ticket_url).toBe(10);
  });

  test('time_doors scores 7pts', () => {
    const row = makeRow({ time_doors: '21:00' });
    const result = scoreRichness(row);
    expect(result.breakdown.time).toBe(7);
  });

  test('description (len 100) scores proportionally', () => {
    const row = makeRow({ description: 'a'.repeat(100) });
    const result = scoreRichness(row);
    expect(result.breakdown.description).toBeGreaterThan(0);
    expect(result.breakdown.description).toBeLessThanOrEqual(10);
  });

  test('semantic_tags scores 5pts', () => {
    const row = makeRow({ semantic_tags: '["jazz", "live"]' });
    const result = scoreRichness(row);
    expect(result.breakdown.enrichment).toBe(5);
  });

  test('genres (non-empty array) scores 3pts', () => {
    const row = makeRow({ genres: '["rock", "metal"]' });
    const result = scoreRichness(row);
    expect(result.breakdown.genres).toBe(3);
  });

  test('ticketservices gets 10pt source bonus', () => {
    const row = makeRow({ source: 'ticketservices.gr' });
    const result = scoreRichness(row);
    expect(result.breakdown.source).toBe(10);
  });

  test('more.com gets 9pt source bonus', () => {
    const row = makeRow({ source: 'more.com' });
    const result = scoreRichness(row);
    expect(result.breakdown.source).toBe(9);
  });

  test('athinorama gets 7pt source bonus', () => {
    const row = makeRow({ source: 'athinorama.gr' });
    const result = scoreRichness(row);
    expect(result.breakdown.source).toBe(7);
  });

  test('empty event scores only source bonus', () => {
    const row = makeRow({ source: 'clubber.gr' });
    const result = scoreRichness(row);
    expect(result.total).toBe(SOURCE_PRIORITY['clubber.gr']);
  });

  test('returns breakdown object for dry-run reporting', () => {
    const row = makeRow({
      full_description: 'a'.repeat(500),
      image_url: 'https://example.com/img.jpg',
      price_amount: 20,
      source: 'more.com',
    });
    const result = scoreRichness(row);
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('breakdown');
    expect(typeof result.total).toBe('number');
    expect(typeof result.breakdown).toBe('object');
    expect(result.total).toBe(
      result.breakdown.full_description +
      result.breakdown.description +
      result.breakdown.image_url +
      result.breakdown.price +
      result.breakdown.ticket_url +
      result.breakdown.time +
      result.breakdown.enrichment +
      result.breakdown.genres +
      result.breakdown.source
    );
  });

  test('full_description length proportional scoring', () => {
    const short = makeRow({ full_description: 'a'.repeat(100) });
    const long = makeRow({ full_description: 'a'.repeat(1000) });
    const shortResult = scoreRichness(short);
    const longResult = scoreRichness(long);
    expect(longResult.breakdown.full_description).toBeGreaterThan(
      shortResult.breakdown.full_description
    );
  });
});
