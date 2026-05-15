/**
 * Tests for scripts/scrape-megaron.ts categoryToType()
 *
 * Grounded in megaron.gr listing-page spike: specs/megaron-category-titles-spike.md
 * Audit: specs/categorizer-audit-2026-05-14.md
 *
 * The 9 distinct category-title strings observed on /events/events-calendar/ map to
 * canonical EventType members. Talk-class categories (Διάλεξη, Συζήτηση) route to
 * 'other' as a taxonomy-pending stopgap until 'talk' lands.
 */

import { describe, test, expect } from 'bun:test';
import { categoryToType } from '../scrape-megaron';

describe('categoryToType — spike-derived mapping', () => {
  test('Μουσική → concert', () => {
    expect(categoryToType('Μουσική')).toBe('concert');
  });

  test('Όπερα → concert (per EventType union comment: opera is music)', () => {
    expect(categoryToType('Όπερα')).toBe('concert');
  });

  test('Έκθεση → exhibition', () => {
    expect(categoryToType('Έκθεση')).toBe('exhibition');
  });

  test('Θέατρο → theater', () => {
    expect(categoryToType('Θέατρο')).toBe('theater');
  });

  test('Διάλεξη → other (talk-class, taxonomy pending)', () => {
    expect(categoryToType('Διάλεξη')).toBe('other');
  });

  test('Συζήτηση → other (talk-class)', () => {
    expect(categoryToType('Συζήτηση')).toBe('other');
  });

  test('Εκπαιδευτικά & Δράσεις → workshop', () => {
    expect(categoryToType('Εκπαιδευτικά & Δράσεις')).toBe('workshop');
  });

  test('Εκδηλώσεις Τρίτων → other (third-party events, type varies)', () => {
    expect(categoryToType('Εκδηλώσεις Τρίτων')).toBe('other');
  });

  test('Online → other', () => {
    expect(categoryToType('Online')).toBe('other');
  });
});

describe('categoryToType — HTML entity decoding', () => {
  test('Εκπαιδευτικά &amp; Δράσεις (entity-encoded) → workshop', () => {
    expect(categoryToType('Εκπαιδευτικά &amp; Δράσεις')).toBe('workshop');
  });
});

describe('categoryToType — defensive normalization', () => {
  test('leading/trailing whitespace is trimmed', () => {
    expect(categoryToType('  Μουσική  ')).toBe('concert');
    expect(categoryToType('\tΔιάλεξη\n')).toBe('other');
  });

  test('NFC normalization applied (input arrives NFD-decomposed)', () => {
    // Decomposed form: 'Δ' + COMBINING ACUTE ACCENT (U+0301) on 'ι' would still match Διάλεξη after NFC
    const nfdInput = 'Διάλεξη'.normalize('NFD');
    expect(categoryToType(nfdInput)).toBe('other');
  });
});

describe('categoryToType — unknown / empty fallback', () => {
  test('unknown category → other (default)', () => {
    expect(categoryToType('Some New Category')).toBe('other');
  });

  test('empty string → other', () => {
    expect(categoryToType('')).toBe('other');
  });

  test('whitespace-only → other', () => {
    expect(categoryToType('   ')).toBe('other');
  });
});
