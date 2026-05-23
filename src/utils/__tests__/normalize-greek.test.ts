/**
 * S146 — Greek transliteration for permanent JSON-LD @id slugs.
 *
 * `transliterateGreekId` is the SOURCE-VENUE-NAME script transliterator. It is
 * ELOT-743-derived (digraph vowel pre-pass + single-letter base map), NOT full
 * ELOT 743 — context-dependent αυ/ευ → av/af · ev/ef and consonant cluster
 * rules (γγ/γκ/μπ/ντ) are deferred to the GEO refine bucket.
 *
 * These slugs become PERMANENT @id IRIs once published. Changing the table later
 * breaks entity-graph identity — same failure mode S146 exists to fix.
 *
 * @see plans/s146-venue-purring-fox.md §1(b)
 */

import { describe, test, expect } from 'bun:test';
import { normalizeGreek, transliterateGreekId } from '../normalize-greek';

describe('normalizeGreek (existing — diacritic strip only)', () => {
  test('lowercases + strips diacritics, preserves Greek letters', () => {
    expect(normalizeGreek('Μουσική')).toBe('μουσικη');
    expect(normalizeGreek('Θέατρο')).toBe('θεατρο');
  });

  test('already-latin input passes through (lowercased)', () => {
    expect(normalizeGreek('Gazarte')).toBe('gazarte');
  });
});

describe('transliterateGreekId — digraph pre-pass THEN single-letter base map', () => {
  // ---------------------------------------------------------------------------
  // Single-letter base map (ELOT-derived)
  // ---------------------------------------------------------------------------

  test('T5: transliterateGreekId(\'Μέγαρο\') → \'megaro\' (base-map coverage)', () => {
    expect(transliterateGreekId('Μέγαρο')).toBe('megaro');
  });

  test('T6: transliterateGreekId(\'ς\') → \'s\' (final sigma edge case)', () => {
    expect(transliterateGreekId('ς')).toBe('s');
  });

  test('η→i, θ→th: \'Θέατρο\' → \'theatro\'', () => {
    expect(transliterateGreekId('Θέατρο')).toBe('theatro');
  });

  test('χ→ch, ψ→ps, ω→o: \'ψυχή\' → \'psychi\'', () => {
    expect(transliterateGreekId('ψυχή')).toBe('psychi');
  });

  // ---------------------------------------------------------------------------
  // Digraph vowel pre-pass — order non-negotiable (must run BEFORE single-letter
  // map, or υ→y leaks through on the highest-frequency Greek vowel clusters)
  // ---------------------------------------------------------------------------

  test('T19: transliterateGreekId(\'Μουσείο\') → \'mouseio\' — ου FLOOR rule (non-negotiable, holds sprint)', () => {
    // Without pre-pass: μ→m, ο→o, υ→y, σ→s, ε→e, ι→i, ο→o = 'moyseio' ❌
    // With pre-pass: ου→ou, then μ→m, σ→s, ε→e, ι→i, ο→o = 'mouseio' ✓
    expect(transliterateGreekId('Μουσείο')).toBe('mouseio');
  });

  test('T20: transliterateGreekId(\'Πνευματικό\') contains \'pnevmatiko\' — ευ digraph rule', () => {
    // ευ → ev (recommended voiced-form simplification)
    expect(transliterateGreekId('Πνευματικό')).toContain('pnevmatiko');
  });

  test('αυ → av: \'Παύλος\' → \'pavlos\' (αυ digraph rule)', () => {
    expect(transliterateGreekId('Παύλος')).toBe('pavlos');
  });

  test('ου in word-final position: \'Καραβίτου\' → \'karavitou\' (not karavitoy)', () => {
    expect(transliterateGreekId('Καραβίτου')).toBe('karavitou');
  });

  test('διacritic on digraph: \'έυ\' matches \'ευ\' rule after diacritic strip', () => {
    // Tests that normalizeGreek's diacritic strip runs BEFORE the digraph pre-pass.
    // 'έυ' → 'ευ' (after strip) → 'ev' (after pre-pass)
    expect(transliterateGreekId('έυ')).toBe('ev');
  });

  // ---------------------------------------------------------------------------
  // Slug shape — ASCII-safe, hyphenated, no leading/trailing hyphens
  // ---------------------------------------------------------------------------

  test('multi-word venue: \'Μέγαρο Μουσικής Αθηνών\' → \'megaro-mousikis-athinon\'', () => {
    expect(transliterateGreekId('Μέγαρο Μουσικής Αθηνών')).toBe('megaro-mousikis-athinon');
  });

  test('strips leading/trailing punctuation: \' Μέγαρο! \' → \'megaro\'', () => {
    expect(transliterateGreekId(' Μέγαρο! ')).toBe('megaro');
  });

  test('all-punctuation / unmappable input → empty string (degenerate, caller falls through to hash)', () => {
    expect(transliterateGreekId('@@@')).toBe('');
    expect(transliterateGreekId('   ')).toBe('');
  });

  test('mixed Greek + ASCII: preserves ASCII alphanumerics', () => {
    // Real-world: "Onassis Stegi 2026" — mixed scripts. ASCII passes through.
    expect(transliterateGreekId('Πλατεία 2026')).toBe('plateia-2026');
  });
});
