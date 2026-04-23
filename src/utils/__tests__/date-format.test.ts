/**
 * Tests for src/utils/date-format.ts — the single source of truth for
 * date-string format classification and canonical normalization.
 *
 * Canonical on-disk format: naive-local (Europe/Athens implied; no offset suffix).
 * - date-only events store YYYY-MM-DD
 * - timed events store YYYY-MM-DDTHH:MM:SS (no T offset)
 * Render-time DST application is the responsibility of formatSchemaDate.
 */

import { describe, test, expect } from 'bun:test';
import { classifyDateFormat, normalizeDateField, type DateFormat } from '../date-format';

describe('classifyDateFormat', () => {
  test('recognizes date-only YYYY-MM-DD', () => {
    expect(classifyDateFormat('2026-04-21')).toBe('date-only');
    expect(classifyDateFormat('2026-01-01')).toBe('date-only');
    expect(classifyDateFormat('2026-12-31')).toBe('date-only');
  });

  test('recognizes naive-ts YYYY-MM-DDTHH:MM:SS (no offset)', () => {
    expect(classifyDateFormat('2026-04-21T21:00:00')).toBe('naive-ts');
    expect(classifyDateFormat('2026-04-21T00:00:00')).toBe('naive-ts');
    expect(classifyDateFormat('2026-04-21T23:59:59')).toBe('naive-ts');
  });

  test('recognizes tz-aware variants', () => {
    expect(classifyDateFormat('2026-04-21T21:00:00+03:00')).toBe('tz-aware');
    expect(classifyDateFormat('2026-01-15T21:00:00+02:00')).toBe('tz-aware');
    expect(classifyDateFormat('2026-04-21T21:00:00-05:00')).toBe('tz-aware');
    expect(classifyDateFormat('2026-04-21T21:00:00Z')).toBe('tz-aware');
  });

  test('accepts optional fractional seconds (JS toISOString format)', () => {
    // new Date().toISOString() emits YYYY-MM-DDTHH:MM:SS.sssZ
    expect(classifyDateFormat('2026-04-23T20:00:00.000Z')).toBe('tz-aware');
    expect(classifyDateFormat('2026-04-23T20:00:00.123+03:00')).toBe('tz-aware');
    expect(classifyDateFormat('2026-04-23T20:00:00.1')).toBe('naive-ts');
    expect(classifyDateFormat('2026-04-23T20:00:00.999999')).toBe('naive-ts');
  });

  test('returns malformed on garbage input', () => {
    expect(classifyDateFormat('garbage')).toBe('malformed');
    expect(classifyDateFormat('')).toBe('malformed');
    expect(classifyDateFormat('not-a-date')).toBe('malformed');
    expect(classifyDateFormat('2026/04/21')).toBe('malformed'); // slashes
    expect(classifyDateFormat('2026-04')).toBe('malformed'); // truncated
    expect(classifyDateFormat('2026-04-21T21:00')).toBe('malformed'); // missing seconds
    expect(classifyDateFormat('26-04-21')).toBe('malformed'); // 2-digit year
  });

  test('rejects logically invalid calendar dates', () => {
    expect(classifyDateFormat('2026-13-01')).toBe('malformed'); // month 13
    expect(classifyDateFormat('2026-00-01')).toBe('malformed'); // month 0
    expect(classifyDateFormat('2026-04-32')).toBe('malformed'); // day 32
    expect(classifyDateFormat('2026-02-30')).toBe('malformed'); // Feb 30
  });
});

describe('normalizeDateField', () => {
  test('passes date-only through unchanged', () => {
    expect(normalizeDateField('2026-04-21')).toBe('2026-04-21');
  });

  test('passes naive-ts through unchanged', () => {
    expect(normalizeDateField('2026-04-21T21:00:00')).toBe('2026-04-21T21:00:00');
    expect(normalizeDateField('2026-04-21T00:00:00')).toBe('2026-04-21T00:00:00');
  });

  test('strips +03:00 offset to produce naive-local', () => {
    expect(normalizeDateField('2026-04-21T21:00:00+03:00')).toBe('2026-04-21T21:00:00');
  });

  test('strips +02:00 offset to produce naive-local', () => {
    expect(normalizeDateField('2026-01-15T21:00:00+02:00')).toBe('2026-01-15T21:00:00');
  });

  test('strips Z suffix to produce naive-local', () => {
    // Note: Z means UTC; stripping it treats the clock-time as Athens-local.
    // The audit showed no Z rows; we handle defensively. Migration logs these.
    expect(normalizeDateField('2026-04-21T21:00:00Z')).toBe('2026-04-21T21:00:00');
  });

  test('strips fractional seconds (handles Date.toISOString() output)', () => {
    expect(normalizeDateField('2026-04-23T20:00:00.000Z')).toBe('2026-04-23T20:00:00');
    expect(normalizeDateField('2026-04-23T20:00:00.123+03:00')).toBe('2026-04-23T20:00:00');
    expect(normalizeDateField('2026-04-23T20:00:00.1')).toBe('2026-04-23T20:00:00');
  });

  test('throws on malformed input (fail loud)', () => {
    expect(() => normalizeDateField('garbage')).toThrow();
    expect(() => normalizeDateField('')).toThrow();
    expect(() => normalizeDateField('2026-04-21T21:00')).toThrow();
    expect(() => normalizeDateField('2026-13-01')).toThrow();
  });

  test('is idempotent — normalizing twice equals normalizing once', () => {
    const inputs = [
      '2026-04-21',
      '2026-04-21T21:00:00',
      '2026-04-21T21:00:00+03:00',
      '2026-10-15T21:00:00+02:00',
    ];
    for (const input of inputs) {
      const once = normalizeDateField(input);
      const twice = normalizeDateField(once);
      expect(twice).toBe(once);
    }
  });
});

describe('classifier parity — normalizeDateField output round-trips cleanly', () => {
  // A normalized value must classify as either date-only or naive-ts.
  // Never tz-aware (offset was stripped). Never malformed (would have thrown).
  const parityCases: Array<[string, DateFormat]> = [
    ['2026-04-21', 'date-only'],
    ['2026-04-21T21:00:00', 'naive-ts'],
    ['2026-04-21T21:00:00+03:00', 'naive-ts'],
    ['2026-01-15T21:00:00+02:00', 'naive-ts'],
    ['2026-07-04T12:00:00+03:00', 'naive-ts'],
    ['2026-12-31T23:59:59+02:00', 'naive-ts'],
  ];
  test.each(parityCases)('normalizeDateField(%j) classifies as %j', (input, expectedCategory) => {
    const normalized = normalizeDateField(input);
    expect(classifyDateFormat(normalized)).toBe(expectedCategory);
  });
});
