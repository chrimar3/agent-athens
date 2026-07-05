/**
 * Tests for text-normalize.ts — HTML entity decode, title/venue canonicalization
 *
 * These functions power cross-source deduplication by normalizing
 * the different formats each source uses for titles and venues.
 */

import { describe, test, expect } from 'bun:test';
import {
  decodeHtmlEntities,
  canonicalizeTitle,
  canonicalizeVenue,
  extractSignificantTokens,
} from '../text-normalize';

// Minimal venue config for testing (matches athens-venues.json structure)
const testVenueConfig = [
  {
    canonical_name: 'Μέγαρο Μουσικής Αθηνών',
    variations: [
      'Μέγαρο Μουσικής',
      'Megaro Mousikis',
      'Athens Concert Hall',
    ],
    neighborhood: 'Ilisia',
  },
  {
    canonical_name: 'Σταυρός του Νότου',
    variations: ['ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ', 'Stavros tou Notou'],
    neighborhood: 'Neos Kosmos',
  },
  {
    canonical_name: 'ΙΛΙΟΝ Plus',
    variations: ['ΙΛΙΟΝ plus', 'Ilion Plus'],
    neighborhood: 'Petroupoli',
  },
  {
    canonical_name: 'Μύρτιλλο',
    variations: ['Myrtillo', 'ΜΥΡΤΙΛΛΟ'],
    neighborhood: 'Exarcheia',
  },
  {
    canonical_name: 'Μέγαρο Μουσικής Κομοτηνής',
    variations: ['Komotini Concert Hall'],
    neighborhood: 'Komotini',
  },
];

// ============================================================================
// decodeHtmlEntities
// ============================================================================

describe('decodeHtmlEntities', () => {
  test('decodes numeric HTML entities (guillemets)', () => {
    expect(decodeHtmlEntities('&#171;Νέκυια&#187;')).toBe('«Νέκυια»');
  });

  test('decodes &amp;', () => {
    expect(decodeHtmlEntities('Rock &amp; Roll')).toBe('Rock & Roll');
  });

  test('decodes &#8211; (en-dash)', () => {
    expect(decodeHtmlEntities('&#8211;')).toBe('–');
  });

  test('decodes mixed entities in real title', () => {
    expect(decodeHtmlEntities('Αλεξία Μουζά &#8211; Ραχμάνινοφ ΙV')).toBe(
      'Αλεξία Μουζά – Ραχμάνινοφ ΙV'
    );
  });

  test('passes clean text through unchanged', () => {
    expect(decodeHtmlEntities('Normal Title')).toBe('Normal Title');
  });

  test('returns empty string for null/undefined/empty', () => {
    expect(decodeHtmlEntities('')).toBe('');
    expect(decodeHtmlEntities(null as any)).toBe('');
    expect(decodeHtmlEntities(undefined as any)).toBe('');
  });

  test('decodes &lt; and &gt;', () => {
    expect(decodeHtmlEntities('A &lt; B &gt; C')).toBe('A < B > C');
  });

  test('decodes &quot;', () => {
    expect(decodeHtmlEntities('&quot;Hello&quot;')).toBe('"Hello"');
  });

  test('decodes &#39; (apostrophe)', () => {
    expect(decodeHtmlEntities("It&#39;s a test")).toBe("It's a test");
  });
});

// ============================================================================
// canonicalizeTitle
// ============================================================================

describe('canonicalizeTitle', () => {
  test('decodes HTML entities first', () => {
    const result = canonicalizeTitle('&#171;Νέκυια&#187;');
    expect(result).toBe('νεκυια'); // accent-folded matching key
  });

  test('strips "Συναυλία Μουσικής Δωματίου " prefix', () => {
    const result = canonicalizeTitle('Συναυλία Μουσικής Δωματίου Παντελής Σταματέλος');
    expect(result).toBe('παντελησ σταματελοσ'); // accent + final-sigma folded
  });

  test('strips "Συναυλία " prefix', () => {
    const result = canonicalizeTitle('Συναυλία Θάνος Μικρούτσικος');
    expect(result).toBe('θανοσ μικρουτσικοσ'); // accent + final-sigma folded
  });

  test('does NOT strip "Συναυλία" if it IS the entire title', () => {
    const result = canonicalizeTitle('Συναυλία');
    expect(result).toBe('συναυλια'); // accent-folded
  });

  test('strips " live in Athens" suffix', () => {
    const result = canonicalizeTitle('Helloween live in Athens');
    expect(result).toBe('helloween');
  });

  test('case-insensitive comparison output (lowercased)', () => {
    expect(canonicalizeTitle('SHADOW KNIGHT')).toBe('shadow knight');
    expect(canonicalizeTitle('Shadow Knight')).toBe('shadow knight');
  });

  test('collapses whitespace', () => {
    expect(canonicalizeTitle('Too   many   spaces')).toBe('too many spaces');
  });

  test('strips Greek quotes «»', () => {
    expect(canonicalizeTitle('«Νέκυια»')).toBe('νεκυια'); // accent-folded matching key
  });

  test('SHADOW KNIGHT and Shadow Knight, Phyrosun & FRS are different', () => {
    const a = canonicalizeTitle('SHADOW KNIGHT');
    const b = canonicalizeTitle('Shadow Knight, Phyrosun & FRS');
    expect(a).not.toBe(b);
  });

  test('strips " live in Greece" suffix', () => {
    expect(canonicalizeTitle('Scorpions live in Greece')).toBe('scorpions');
  });

  test('strips leading articles (Οι, Η, Ο, Το, The)', () => {
    expect(canonicalizeTitle('Οι Πυξ Λαξ')).toBe('πυξ λαξ');
    expect(canonicalizeTitle('The Rolling Stones')).toBe('rolling stones');
  });
});

// ============================================================================
// canonicalizeVenue
// ============================================================================

describe('canonicalizeVenue', () => {
  test('resolves uppercase variation to canonical', () => {
    const result = canonicalizeVenue('ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ', testVenueConfig);
    expect(result).toBe('σταυρός του νότου');
  });

  test('resolves Ίλιον Plus and ΙΛΙΟΝ Plus to same canonical via VENUE_ALIASES', () => {
    const a = canonicalizeVenue('Ίλιον Plus', testVenueConfig);
    const b = canonicalizeVenue('ΙΛΙΟΝ Plus', testVenueConfig);
    expect(a).toBe(b);
  });

  test('resolves Μύρτιλλο and Myrtillo Cafe to same canonical via VENUE_ALIASES', () => {
    const a = canonicalizeVenue('Μύρτιλλο', testVenueConfig);
    const b = canonicalizeVenue('Myrtillo Cafe', testVenueConfig);
    expect(a).toBe(b);
  });

  test('resolves Αίθουσα Διδασκαλίας Μεγάρου Μουσικής to Μέγαρο Μουσικής Αθηνών', () => {
    const a = canonicalizeVenue('Αίθουσα Διδασκαλίας Μεγάρου Μουσικής', testVenueConfig);
    const b = canonicalizeVenue('Μέγαρο Μουσικής Αθηνών', testVenueConfig);
    expect(a).toBe(b);
  });

  test('Μέγαρο Μουσικής Κομοτηνής is NOT same as Μέγαρο Μουσικής Αθηνών', () => {
    const a = canonicalizeVenue('Μέγαρο Μουσικής Κομοτηνής', testVenueConfig);
    const b = canonicalizeVenue('Μέγαρο Μουσικής Αθηνών', testVenueConfig);
    expect(a).not.toBe(b);
  });

  test('unknown venue returns lowercased + trimmed original', () => {
    const result = canonicalizeVenue('  SOME UNKNOWN PLACE  ', testVenueConfig);
    expect(result).toBe('some unknown place');
  });

  test('resolves from config variations (case-insensitive)', () => {
    const result = canonicalizeVenue('Athens Concert Hall', testVenueConfig);
    expect(result).toBe('μέγαρο μουσικής αθηνών');
  });
});

// ============================================================================
// extractSignificantTokens
// ============================================================================

describe('extractSignificantTokens', () => {
  test('removes Greek articles', () => {
    const tokens = extractSignificantTokens('Οι Πυξ Λαξ στο Floyd');
    expect(tokens).not.toContain('οι');
    expect(tokens).not.toContain('στο');
    expect(tokens).toContain('πυξ');
    expect(tokens).toContain('λαξ');
    expect(tokens).toContain('floyd');
  });

  test('removes English articles and music stopwords', () => {
    const tokens = extractSignificantTokens('The Band live in Athens with DJ');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('live');
    expect(tokens).not.toContain('in');
    expect(tokens).not.toContain('with');
    expect(tokens).toContain('band');
    expect(tokens).toContain('athens');
  });

  test('keeps artist names', () => {
    const tokens = extractSignificantTokens('Shadow Knight, Phyrosun & FRS');
    expect(tokens).toContain('shadow');
    expect(tokens).toContain('knight');
    expect(tokens).toContain('phyrosun');
    expect(tokens).toContain('frs');
  });

  test('returns lowercased tokens', () => {
    const tokens = extractSignificantTokens('SHADOW KNIGHT');
    expect(tokens).toEqual(['shadow', 'knight']);
  });

  test('minimum token length is 3 characters', () => {
    const tokens = extractSignificantTokens('A B CD EFG HIJK');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('b');
    expect(tokens).not.toContain('cd');
    expect(tokens).toContain('efg');
    expect(tokens).toContain('hijk');
  });

  test('removes feat/pres/presents', () => {
    const tokens = extractSignificantTokens('Club Night feat Indira Paganotto pres Astron');
    expect(tokens).not.toContain('feat');
    expect(tokens).not.toContain('pres');
    expect(tokens).toContain('club');
    expect(tokens).toContain('night');
    expect(tokens).toContain('indira');
    expect(tokens).toContain('paganotto');
    expect(tokens).toContain('astron');
  });
});
