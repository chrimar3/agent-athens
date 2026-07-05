/**
 * Tests for normalize-key.ts — the shared matching-key fold primitive.
 *
 * normalize() = accent-fold (Greek + Latin) + case-fold + final-sigma fold
 * + punctuation-strip + whitespace-collapse. Designed as the single fold
 * primitive for dedup title matching AND the D1 location-verification work
 * (S182 accent asymmetry class: bare unaccented tokens never matched
 * accented DB strings because each consumer folded differently).
 */

import { describe, test, expect } from 'bun:test';
import { normalize } from '../normalize-key';

describe('normalize() — matching-key fold', () => {
  test('folds Greek accents: ALL-CAPS unaccented equals mixed-case accented', () => {
    expect(normalize('ΘΕΟΦΙΛΟΣ Sold')).toBe(normalize('Θεόφιλος Sold'));
    expect(normalize('ΑΓΡΙΟΣ ΣΠΟΡΟΣ')).toBe(normalize('Άγριος σπόρος'));
  });

  test('folds Latin diacritics', () => {
    expect(normalize('Amémé')).toBe('ameme');
    expect(normalize('Âme')).toBe('ame');
    expect(normalize('PLISSKËN')).toBe('plissken');
  });

  test('folds final sigma so ς and σ compare equal', () => {
    expect(normalize('Θεόφιλος')).toBe(normalize('ΘΕΟΦΙΛΟΣ'));
    expect(normalize('ς')).toBe(normalize('σ'));
  });

  test('strips punctuation to spaces and collapses whitespace', () => {
    expect(normalize('Ένας υπηρέτης, δύο αφεντικά')).toBe(
      normalize('ΕΝΑΣ ΥΠΗΡΕΤΗΣ , ΔΥΟ ΑΦΕΝΤΙΚΑ')
    );
    expect(normalize('Θοδωρής Κοτονιάς - Ιφιγένεια Ιωάννου')).toBe(
      normalize('ΘΟΔΩΡΗΣ ΚΟΤΟΝΙΑΣ ΙΦΙΓΕΝΕΙΑ ΙΩΑΝΝΟΥ')
    );
  });

  test('keeps digits — sequels must stay distinguishable', () => {
    expect(normalize('Κωμωδία της Γειτονιάς 2')).not.toBe(
      normalize('Κωμωδία της Γειτονιάς 3')
    );
  });

  test('is idempotent', () => {
    const once = normalize('Λυσιστράτη - Μια ξεκαρδιστική όπερα');
    expect(normalize(once)).toBe(once);
  });

  test('handles empty and whitespace-only input', () => {
    expect(normalize('')).toBe('');
    expect(normalize('   ')).toBe('');
  });
});
