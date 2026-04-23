/**
 * Tests for formatSchemaDate() — Schema.org JSON-LD date formatter.
 *
 * Fixes being locked in by Session A:
 * 1. Date-only events emit YYYY-MM-DD (not YYYY-MM-DDT00:00:00+tz).
 *    Live bug: all-day exhibitions were being emitted as midnight-start timed events.
 * 2. Malformed input throws instead of silent passthrough.
 * 3. Implementation uses the shared classifyDateFormat (parity with normalizeDateField).
 */

import { describe, test, expect } from 'bun:test';
import { formatSchemaDate, getAthensTimezone } from '../quality-gates';

describe('formatSchemaDate — date-only passthrough (live-bug fix)', () => {
  test('date-only input with no time emits YYYY-MM-DD, not midnight-timestamp', () => {
    expect(formatSchemaDate('2026-04-21')).toBe('2026-04-21');
  });

  test('date-only input with explicit time promotes to full ISO + offset', () => {
    const result = formatSchemaDate('2026-07-15', '20:00');
    expect(result).toBe('2026-07-15T20:00:00+03:00'); // July = DST
  });

  test('date-only in winter month gets +02:00', () => {
    const result = formatSchemaDate('2026-01-15', '20:00');
    expect(result).toBe('2026-01-15T20:00:00+02:00');
  });
});

describe('formatSchemaDate — naive-ts input', () => {
  test('appends Athens DST-aware offset', () => {
    expect(formatSchemaDate('2026-07-15T20:00:00')).toBe('2026-07-15T20:00:00+03:00');
    expect(formatSchemaDate('2026-01-15T20:00:00')).toBe('2026-01-15T20:00:00+02:00');
  });
});

describe('formatSchemaDate — tz-aware input passthrough', () => {
  test('preserves existing +03:00 offset', () => {
    expect(formatSchemaDate('2026-07-15T20:00:00+03:00')).toBe('2026-07-15T20:00:00+03:00');
  });

  test('preserves existing +02:00 offset', () => {
    expect(formatSchemaDate('2026-01-15T20:00:00+02:00')).toBe('2026-01-15T20:00:00+02:00');
  });

  test('preserves Z (UTC) suffix', () => {
    expect(formatSchemaDate('2026-07-15T20:00:00Z')).toBe('2026-07-15T20:00:00Z');
  });
});

describe('formatSchemaDate — malformed input (fail loud)', () => {
  test('throws on garbage', () => {
    expect(() => formatSchemaDate('garbage')).toThrow();
  });

  test('throws on empty string', () => {
    expect(() => formatSchemaDate('')).toThrow();
  });

  test('throws on truncated ISO', () => {
    expect(() => formatSchemaDate('2026-04-21T21:00')).toThrow();
  });
});

describe('formatSchemaDate — DST boundaries (Europe/Athens)', () => {
  // Greece DST transitions happen at 03:00 local time on the last Sunday of
  // March (start DST) and last Sunday of October (end DST).
  // In 2026: Mar 29 (spring forward, +02:00 → +03:00) and Oct 25 (fall back).

  test('day before spring-forward (2026-03-28): winter offset +02:00', () => {
    expect(formatSchemaDate('2026-03-28T20:00:00')).toBe('2026-03-28T20:00:00+02:00');
  });

  test('day after spring-forward (2026-03-30): summer offset +03:00', () => {
    expect(formatSchemaDate('2026-03-30T20:00:00')).toBe('2026-03-30T20:00:00+03:00');
  });

  test('day before fall-back (2026-10-24): summer offset +03:00', () => {
    expect(formatSchemaDate('2026-10-24T20:00:00')).toBe('2026-10-24T20:00:00+03:00');
  });

  test('day after fall-back (2026-10-26): winter offset +02:00', () => {
    expect(formatSchemaDate('2026-10-26T20:00:00')).toBe('2026-10-26T20:00:00+02:00');
  });
});

describe('getAthensTimezone — basic correctness', () => {
  test('summer date returns +03:00', () => {
    expect(getAthensTimezone(new Date(2026, 6, 15))).toBe('+03:00'); // July
  });

  test('winter date returns +02:00', () => {
    expect(getAthensTimezone(new Date(2026, 0, 15))).toBe('+02:00'); // January
  });
});
