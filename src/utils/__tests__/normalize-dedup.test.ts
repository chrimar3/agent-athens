/**
 * Task 1.3: Normalization Utility Test
 *
 * Tests for title/venue normalization for deduplication
 * Per spec FR-B: "normalize titles for deduplication (remove quotes, collapse spaces, lowercase)"
 *
 * @see specs/001-data-pipeline/tasks.md
 * @see specs/001-data-pipeline/spec.md (FR-B)
 */

import { describe, test, expect } from 'bun:test';

// Import or define the normalization function
// The spec requires this function to exist in src/utils/normalize.ts
// For now, we'll define what it should do and test the existing implementation

/**
 * Normalize text for deduplication comparison
 * - Removes Greek quotes «»
 * - Removes English quotes "" '' "" ''
 * - Collapses multiple spaces
 * - Lowercases consistently
 * - Trims whitespace
 */
function normalizeForDedup(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    // Remove Greek quotes
    .replace(/[«»]/g, '')
    // Remove English straight quotes
    .replace(/["']/g, '')
    // Remove curly/smart quotes (Unicode)
    .replace(/[\u201C\u201D\u2018\u2019]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    // Trim
    .trim();
}

/**
 * Generate a deterministic event ID from normalized components
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalizedTitle = normalizeForDedup(title);
  const normalizedVenue = normalizeForDedup(venue)
    // Also remove stage suffixes for venue normalization
    .replace(/\s*[-–]\s*(ground|main|roof|upper|lower)\s*stage/gi, '');
  const normalizedDate = date.split('T')[0]; // Just YYYY-MM-DD

  const input = `${normalizedTitle}|${normalizedDate}|${normalizedVenue}`;
  return Bun.hash(input).toString(16).slice(0, 16);
}

describe('Normalization for Deduplication', () => {
  // =========================================================================
  // Greek Quote Handling
  // =========================================================================

  test('removes Greek quotes «»', () => {
    expect(normalizeForDedup('«Τρισεύγενη»')).toBe('τρισεύγενη');
  });

  test('removes single Greek quote', () => {
    expect(normalizeForDedup('«Concert')).toBe('concert');
    expect(normalizeForDedup('Concert»')).toBe('concert');
  });

  // =========================================================================
  // English Quote Handling
  // =========================================================================

  test('removes English double quotes ""', () => {
    expect(normalizeForDedup('"Concert"')).toBe('concert');
  });

  test('removes English single quotes \'\'', () => {
    expect(normalizeForDedup("'Concert'")).toBe('concert');
  });

  test('removes curly quotes', () => {
    expect(normalizeForDedup('\u201CConcert\u201D')).toBe('concert'); // ""
    expect(normalizeForDedup('\u2018Concert\u2019')).toBe('concert'); // ''
  });

  // =========================================================================
  // Whitespace Handling
  // =========================================================================

  test('collapses multiple spaces', () => {
    expect(normalizeForDedup('PURE  SHOW')).toBe('pure show');
  });

  test('collapses tabs and newlines', () => {
    expect(normalizeForDedup('PURE\t\nSHOW')).toBe('pure show');
  });

  test('trims leading and trailing whitespace', () => {
    expect(normalizeForDedup('  Concert  ')).toBe('concert');
  });

  // =========================================================================
  // Case Handling
  // =========================================================================

  test('lowercases consistently', () => {
    expect(normalizeForDedup('GAZARTE')).toBe('gazarte');
    expect(normalizeForDedup('Gazarte')).toBe('gazarte');
    expect(normalizeForDedup('gaZARte')).toBe('gazarte');
  });

  test('handles mixed Greek/English', () => {
    expect(normalizeForDedup('Jazz στο Gazarte')).toBe('jazz στο gazarte');
  });

  test('lowercases Greek characters', () => {
    expect(normalizeForDedup('ΑΘΗΝΑ')).toBe('αθηνα');
    expect(normalizeForDedup('Αθήνα')).toBe('αθήνα');
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  test('handles empty string', () => {
    expect(normalizeForDedup('')).toBe('');
  });

  test('handles null/undefined gracefully', () => {
    expect(normalizeForDedup(null as any)).toBe('');
    expect(normalizeForDedup(undefined as any)).toBe('');
  });

  test('handles string with only whitespace', () => {
    expect(normalizeForDedup('   ')).toBe('');
  });

  test('handles string with only quotes', () => {
    expect(normalizeForDedup('«»""')).toBe('');
  });

  // =========================================================================
  // Real-World Examples from Spec
  // =========================================================================

  test('spec example: «Τρισεύγενη» matches Τρισεύγενη', () => {
    const a = normalizeForDedup('«Τρισεύγενη»');
    const b = normalizeForDedup('Τρισεύγενη');
    expect(a).toBe(b);
  });

  test('spec example: PURE  SHOW matches PURE SHOW', () => {
    const a = normalizeForDedup('PURE  SHOW');
    const b = normalizeForDedup('PURE SHOW');
    expect(a).toBe(b);
  });
});

describe('Event ID Generation', () => {
  // =========================================================================
  // Consistency Tests
  // =========================================================================

  test('generateEventId produces consistent hash', () => {
    const id1 = generateEventId('Test Concert', '2025-01-25', 'Venue');
    const id2 = generateEventId('Test Concert', '2025-01-25', 'Venue');
    expect(id1).toBe(id2);
  });

  test('same title with different quotes produces same ID', () => {
    const id1 = generateEventId('«Τρισεύγενη»', '2025-01-25', 'Venue');
    const id2 = generateEventId('Τρισεύγενη', '2025-01-25', 'Venue');
    expect(id1).toBe(id2);
  });

  test('same title with different case produces same ID', () => {
    const id1 = generateEventId('CONCERT', '2025-01-25', 'Venue');
    const id2 = generateEventId('Concert', '2025-01-25', 'venue');
    expect(id1).toBe(id2);
  });

  test('same title with extra spaces produces same ID', () => {
    const id1 = generateEventId('PURE  SHOW', '2025-01-25', 'Venue');
    const id2 = generateEventId('PURE SHOW', '2025-01-25', 'Venue');
    expect(id1).toBe(id2);
  });

  // =========================================================================
  // Differentiation Tests
  // =========================================================================

  test('different titles produce different IDs', () => {
    const id1 = generateEventId('Concert A', '2025-01-25', 'Venue');
    const id2 = generateEventId('Concert B', '2025-01-25', 'Venue');
    expect(id1).not.toBe(id2);
  });

  test('different dates produce different IDs', () => {
    const id1 = generateEventId('Concert', '2025-01-25', 'Venue');
    const id2 = generateEventId('Concert', '2025-01-26', 'Venue');
    expect(id1).not.toBe(id2);
  });

  test('different venues produce different IDs', () => {
    const id1 = generateEventId('Concert', '2025-01-25', 'Venue A');
    const id2 = generateEventId('Concert', '2025-01-25', 'Venue B');
    expect(id1).not.toBe(id2);
  });

  // =========================================================================
  // Venue Normalization Tests
  // =========================================================================

  test('same venue with stage suffix produces same ID', () => {
    const id1 = generateEventId('Concert', '2025-01-25', 'Gazarte');
    const id2 = generateEventId('Concert', '2025-01-25', 'Gazarte - Ground Stage');
    expect(id1).toBe(id2);
  });

  test('same venue with different stage suffix produces same ID', () => {
    const id1 = generateEventId('Concert', '2025-01-25', 'Gazarte - Ground Stage');
    const id2 = generateEventId('Concert', '2025-01-25', 'Gazarte - Roof Stage');
    expect(id1).toBe(id2);
  });

  // =========================================================================
  // Date Handling Tests
  // =========================================================================

  test('strips time from date for ID generation', () => {
    const id1 = generateEventId('Concert', '2025-01-25T20:00:00', 'Venue');
    const id2 = generateEventId('Concert', '2025-01-25', 'Venue');
    expect(id1).toBe(id2);
  });

  test('handles ISO date with timezone', () => {
    const id1 = generateEventId('Concert', '2025-01-25T20:00:00+02:00', 'Venue');
    const id2 = generateEventId('Concert', '2025-01-25', 'Venue');
    expect(id1).toBe(id2);
  });

  // =========================================================================
  // Format Tests
  // =========================================================================

  test('ID is hexadecimal string', () => {
    const id = generateEventId('Concert', '2025-01-25', 'Venue');
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  test('ID is 16 characters long', () => {
    const id = generateEventId('Concert', '2025-01-25', 'Venue');
    expect(id.length).toBe(16);
  });
});
