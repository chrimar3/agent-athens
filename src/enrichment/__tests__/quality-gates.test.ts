/**
 * Quality Gates Test Suite
 *
 * Tests for the quality gate validation system covering:
 * - Lazy adjective detection (English)
 * - Speculation/fabrication detection
 * - Markdown table detection
 * - Filler phrase detection
 * - Greek lazy adjective detection (stem matching)
 * - Greek venue script validation
 * - Greek δωρεάν prohibition
 *
 * @see src/enrichment/quality-gates.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  detectGenericContent,
  validateEnglishDescription,
  validateGreekDescription,
  validateQualityGates,
  type QualityIssue,
} from '../quality-gates';
import type { EventForEnrichment } from '../description-generator';

// ============================================================================
// Test Data
// ============================================================================

const baseEvent: EventForEnrichment = {
  id: 'test-1',
  title: 'Marina Satti Live at Gazarte',
  date: '2025-03-15',
  time: '21:30',
  venue: 'Gazarte',
  type: 'concert',
  genre: 'Greek contemporary',
  price: 'with-ticket',
};

/** Generates a clean description that passes all checks */
function cleanDescription(wordCount: number = 250): string {
  const base = 'Marina Satti brings her distinctive sound to Gazarte this Saturday night. ' +
    'You step through the heavy doors into a room where the bass already hums through the floorboards. ' +
    'The crowd here skews toward music heads who follow her catalog closely. ' +
    'If you prefer polished pop spectacles, this raw format may feel stripped back. ' +
    'But if you want to hear every vocal nuance in an intimate setting, this is your night. ' +
    'Doors open at nine, with the first set starting around half past. ' +
    'Walk from Keramikos metro in eight minutes. Tickets cost fifteen euros advance, twenty at the door.';
  // Pad to approximate target word count
  const words = base.split(/\s+/);
  while (words.length < wordCount) {
    words.push('The', 'atmosphere', 'builds', 'through', 'each', 'song', 'as', 'the', 'crowd', 'sways.');
  }
  return words.slice(0, wordCount).join(' ');
}

function cleanGreekDescription(wordCount: number = 200): string {
  const base = 'Η Μαρίνα Σάττι φέρνει τον ήχο της στο Gazarte αυτό το Σάββατο. ' +
    'Μπαίνεις στον χώρο και το μπάσο ήδη δονεί τα πατώματα. ' +
    'Το κοινό εδώ ακολουθεί στενά τη δισκογραφία της. ' +
    'Αν προτιμάς τα γυαλιστερά pop shows, αυτή η εμφάνιση μπορεί να σου φανεί πιο ωμή. ' +
    'Αν όμως θέλεις να ακούσεις κάθε φωνητική απόχρωση σε οικείο περιβάλλον, αυτή είναι η βραδιά σου. ' +
    'Πόρτες στις εννιά. Εισιτήρια δεκαπέντε ευρώ προπώληση.';
  const words = base.split(/\s+/);
  while (words.length < wordCount) {
    words.push('Η', 'ατμόσφαιρα', 'χτίζεται', 'σταδιακά', 'μέσα', 'στη', 'βραδιά.');
  }
  return words.slice(0, wordCount).join(' ');
}

// ============================================================================
// English Gate Tests — Lazy Adjectives
// ============================================================================

describe('English: Lazy adjective detection', () => {
  test('legendary triggers lazy adjective warning', () => {
    const desc = cleanDescription().replace('distinctive sound', 'legendary sound');
    const issues = detectGenericContent(desc, { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type }, 'standard');
    const lazyIssue = issues.find(i => i.code === 'LAZY_ADJECTIVES');
    expect(lazyIssue).toBeDefined();
    expect(lazyIssue!.message).toContain('legendary');
  });

  test('immersive triggers lazy adjective warning', () => {
    const desc = cleanDescription().replace('distinctive sound', 'immersive sound');
    const issues = detectGenericContent(desc, { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type }, 'standard');
    const lazyIssue = issues.find(i => i.code === 'LAZY_ADJECTIVES');
    expect(lazyIssue).toBeDefined();
    expect(lazyIssue!.message).toContain('immersive');
  });

  test('vibrant still triggers (regression check)', () => {
    const desc = cleanDescription().replace('distinctive sound', 'vibrant sound');
    const issues = detectGenericContent(desc, { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type }, 'standard');
    const lazyIssue = issues.find(i => i.code === 'LAZY_ADJECTIVES');
    expect(lazyIssue).toBeDefined();
    expect(lazyIssue!.message).toContain('vibrant');
  });

  test('iconic triggers lazy adjective warning', () => {
    const desc = cleanDescription().replace('distinctive sound', 'iconic sound');
    const issues = detectGenericContent(desc, { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type }, 'standard');
    const lazyIssue = issues.find(i => i.code === 'LAZY_ADJECTIVES');
    expect(lazyIssue).toBeDefined();
    expect(lazyIssue!.message).toContain('iconic');
  });
});

// ============================================================================
// English Gate Tests — Speculation Detection
// ============================================================================

describe('English: Speculation detection', () => {
  test('"the show will likely explore" triggers speculation warning', () => {
    const desc = cleanDescription().replace(
      'Doors open at nine',
      'The show will likely explore new material. Doors open at nine'
    );
    const issues = detectGenericContent(desc, { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type }, 'standard');
    const specIssue = issues.find(i => i.code === 'SPECULATION');
    expect(specIssue).toBeDefined();
  });

  test('"perhaps different members" triggers speculation warning', () => {
    const desc = cleanDescription().replace(
      'Doors open at nine',
      'Perhaps different members will join. Doors open at nine'
    );
    const issues = detectGenericContent(desc, { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type }, 'standard');
    const specIssue = issues.find(i => i.code === 'SPECULATION');
    expect(specIssue).toBeDefined();
  });

  test('2+ speculation patterns yield error severity', () => {
    const desc = cleanDescription().replace(
      'Doors open at nine',
      'The show will likely feature new songs. Perhaps the band might include a guest.'
    );
    const issues = detectGenericContent(desc, { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type }, 'standard');
    const specIssue = issues.find(i => i.code === 'SPECULATION');
    expect(specIssue).toBeDefined();
    expect(specIssue!.severity).toBe('error');
  });

  test('"if you enjoy jazz" does NOT trigger speculation', () => {
    const desc = cleanDescription().replace(
      'If you prefer polished pop',
      'If you enjoy jazz'
    );
    const issues = detectGenericContent(desc, { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type }, 'standard');
    const specIssue = issues.find(i => i.code === 'SPECULATION');
    expect(specIssue).toBeUndefined();
  });
});

// ============================================================================
// English Gate Tests — Table Detection
// ============================================================================

describe('English: Markdown table detection', () => {
  test('description with markdown table triggers HAS_MARKDOWN_TABLE', () => {
    const desc = cleanDescription() + '\n\n| Aspect | Details |\n|--------|--------|\n| Setting | Basement |\n| Vibe | Raw |';
    const result = validateQualityGates(baseEvent, desc, 'premium');
    const tableIssue = result.issues.find(i => i.code === 'HAS_MARKDOWN_TABLE');
    expect(tableIssue).toBeDefined();
    expect(tableIssue!.severity).toBe('warning');
  });

  test('description without table produces no table warning', () => {
    const desc = cleanDescription();
    const result = validateQualityGates(baseEvent, desc, 'premium');
    const tableIssue = result.issues.find(i => i.code === 'HAS_MARKDOWN_TABLE');
    expect(tableIssue).toBeUndefined();
  });

  test('premium description without table does NOT trigger NO_TABLE (removed)', () => {
    const desc = cleanDescription();
    const result = validateQualityGates(baseEvent, desc, 'premium');
    const noTableIssue = result.issues.find(i => i.code === 'NO_TABLE');
    expect(noTableIssue).toBeUndefined();
  });
});

// ============================================================================
// English Gate Tests — Filler Phrases & Event Reference
// ============================================================================

describe('English: Filler phrases and event reference', () => {
  test('filler phrase "don\'t miss" triggers error', () => {
    const desc = cleanDescription().replace('Doors open at nine', "Don't miss this show. Doors open at nine");
    const result = validateQualityGates(baseEvent, desc, 'standard');
    const fillerIssue = result.issues.find(i => i.code === 'FILLER_PHRASES');
    expect(fillerIssue).toBeDefined();
    expect(fillerIssue!.severity).toBe('error');
  });

  test('missing event reference triggers GENERIC_NO_EVENT_REFERENCE', () => {
    const genericDesc = 'A concert takes place this evening. You walk into the venue and feel the energy. ' +
      'The crowd is excited for the performance. Doors open at nine.';
    // Use a title that won't match the generic description
    const issues = detectGenericContent(
      genericDesc,
      { title: 'Σωκράτης Μάλαμας', venue: 'Gazarte', type: 'concert' },
      'standard'
    );
    const refIssue = issues.find(i => i.code === 'GENERIC_NO_EVENT_REFERENCE');
    expect(refIssue).toBeDefined();
  });

  test('clean description passes all checks', () => {
    const desc = cleanDescription();
    const issues = detectGenericContent(
      desc,
      { title: baseEvent.title, venue: baseEvent.venue, type: baseEvent.type },
      'standard'
    );
    const lazyIssue = issues.find(i => i.code === 'LAZY_ADJECTIVES');
    const specIssue = issues.find(i => i.code === 'SPECULATION');
    expect(lazyIssue).toBeUndefined();
    expect(specIssue).toBeUndefined();
  });
});

// ============================================================================
// English Description Validation
// ============================================================================

describe('English: validateEnglishDescription', () => {
  test('lazy adjective detected via validateEnglishDescription', () => {
    const desc = cleanDescription().replace('distinctive sound', 'legendary sound');
    const result = validateEnglishDescription(baseEvent, desc, 'standard');
    const lazyIssue = result.issues.find(i => i.code === 'LAZY_ADJECTIVES');
    expect(lazyIssue).toBeDefined();
    expect(lazyIssue!.message).toContain('legendary');
  });
});

// ============================================================================
// Greek Gate Tests — Lazy Adjectives
// ============================================================================

describe('Greek: Lazy adjective detection', () => {
  test('φανταστικό triggers GR_LAZY_ADJECTIVES warning', () => {
    const desc = cleanGreekDescription().replace('τον ήχο της', 'τον φανταστικό ήχο της');
    const result = validateGreekDescription(baseEvent, desc, 'standard');
    const lazyIssue = result.issues.find(i => i.code === 'GR_LAZY_ADJECTIVES');
    expect(lazyIssue).toBeDefined();
    expect(lazyIssue!.message).toContain('φανταστικ');
  });

  test('εκπληκτικό triggers GR_LAZY_ADJECTIVES warning', () => {
    const desc = cleanGreekDescription().replace('τον ήχο της', 'τον εκπληκτικό ήχο της');
    const result = validateGreekDescription(baseEvent, desc, 'standard');
    const lazyIssue = result.issues.find(i => i.code === 'GR_LAZY_ADJECTIVES');
    expect(lazyIssue).toBeDefined();
    expect(lazyIssue!.message).toContain('εκπληκτικ');
  });

  test('τελείως does NOT trigger (excluded stem)', () => {
    const desc = cleanGreekDescription().replace('στο Gazarte', 'τελείως στο Gazarte');
    const result = validateGreekDescription(baseEvent, desc, 'standard');
    const lazyIssue = result.issues.find(i => i.code === 'GR_LAZY_ADJECTIVES');
    expect(lazyIssue).toBeUndefined();
  });
});

// ============================================================================
// Greek Gate Tests — Venue Script
// ============================================================================

describe('Greek: Venue script validation', () => {
  test('Megaron in Greek text triggers GR_VENUE_SCRIPT warning', () => {
    const desc = cleanGreekDescription().replace('στο Gazarte', 'στο Megaron');
    const result = validateGreekDescription(baseEvent, desc, 'standard');
    const venueIssue = result.issues.find(i => i.code === 'GR_VENUE_SCRIPT');
    expect(venueIssue).toBeDefined();
    expect(venueIssue!.message).toContain('Μέγαρο Μουσικής');
  });

  test('Μέγαρο Μουσικής does not trigger warning', () => {
    const desc = cleanGreekDescription().replace('στο Gazarte', 'στο Μέγαρο Μουσικής');
    const result = validateGreekDescription(baseEvent, desc, 'standard');
    const venueIssue = result.issues.find(i => i.code === 'GR_VENUE_SCRIPT');
    expect(venueIssue).toBeUndefined();
  });

  test('Half Note in Greek text does not trigger warning (not in GREEK_VENUE_FORMS)', () => {
    const desc = cleanGreekDescription().replace('στο Gazarte', 'στο Half Note');
    const result = validateGreekDescription(baseEvent, desc, 'standard');
    const venueIssue = result.issues.find(i => i.code === 'GR_VENUE_SCRIPT');
    expect(venueIssue).toBeUndefined();
  });
});

// ============================================================================
// Greek Gate Tests — δωρεάν + Clean Pass
// ============================================================================

describe('Greek: δωρεάν prohibition and clean pass', () => {
  test('δωρεάν triggers GR_DOREAN_VIOLATION error', () => {
    const desc = cleanGreekDescription().replace('Εισιτήρια δεκαπέντε ευρώ', 'Η είσοδος είναι δωρεάν');
    const result = validateGreekDescription(baseEvent, desc, 'standard');
    const doreanIssue = result.issues.find(i => i.code === 'GR_DOREAN_VIOLATION');
    expect(doreanIssue).toBeDefined();
    expect(doreanIssue!.severity).toBe('error');
  });

  test('clean Greek description passes', () => {
    const desc = cleanGreekDescription();
    const result = validateGreekDescription(baseEvent, desc, 'standard');
    const lazyIssue = result.issues.find(i => i.code === 'GR_LAZY_ADJECTIVES');
    const venueIssue = result.issues.find(i => i.code === 'GR_VENUE_SCRIPT');
    const doreanIssue = result.issues.find(i => i.code === 'GR_DOREAN_VIOLATION');
    expect(lazyIssue).toBeUndefined();
    expect(venueIssue).toBeUndefined();
    expect(doreanIssue).toBeUndefined();
  });
});

// ============================================================================
// Matrix-Aware Word Count (validateQualityGates)
// ============================================================================

describe('Matrix-aware word count in validateQualityGates', () => {
  test('concert_local at 200 words triggers word count violation', () => {
    // concert_local matrix max is 120 words. A 200-word description should fail.
    const djEvent: EventForEnrichment = {
      ...baseEvent,
      type: 'dj_set', // classifyEvent maps dj_set → concert_local
      title: 'DJ Night at Small Bar',
      venue: 'Small Bar',
    };
    const longDesc = cleanDescription(200);
    const result = validateQualityGates(djEvent, longDesc, 'standard');
    // Should have a word count violation — either OVER_MATRIX_MAX promoted to error/warning,
    // or TOO_LONG with matrix-aware threshold
    const wordIssue = result.issues.find(i =>
      i.code === 'OVER_MATRIX_MAX' || i.code === 'TOO_LONG'
    );
    expect(wordIssue).toBeDefined();
    // The legacy TOO_LONG should NOT fire with the old 300-word standard threshold
    const legacyTooLong = result.issues.find(i =>
      i.code === 'TOO_LONG' && i.message.includes('maximum 300')
    );
    expect(legacyTooLong).toBeUndefined();
  });

  test('concert_local at 100 words has no word count warnings', () => {
    const djEvent: EventForEnrichment = {
      ...baseEvent,
      type: 'dj_set',
      title: 'DJ Night at Small Bar',
      venue: 'Small Bar',
    };
    // 100 words is within concert_local range (80-120)
    const goodDesc = cleanDescription(100);
    const result = validateQualityGates(djEvent, goodDesc, 'standard');
    const wordIssues = result.issues.filter(i =>
      i.code === 'TOO_LONG' || i.code === 'TOO_SHORT' ||
      i.code === 'OVER_MATRIX_MAX' || i.code === 'UNDER_MATRIX_MIN'
    );
    expect(wordIssues.length).toBe(0);
  });

  test('exhibition at 280 words passes (within 200-300 matrix range)', () => {
    const exhibEvent: EventForEnrichment = {
      ...baseEvent,
      type: 'exhibition',
      title: 'Modern Art at Benaki',
      venue: 'Benaki Museum',
    };
    const desc = cleanDescription(280);
    const result = validateQualityGates(exhibEvent, desc, 'standard');
    const wordIssues = result.issues.filter(i =>
      i.code === 'TOO_LONG' || i.code === 'OVER_MATRIX_MAX'
    );
    expect(wordIssues.length).toBe(0);
  });
});

// ============================================================================
// Phantom Penalty Suppression (validateQualityGates)
// ============================================================================

describe('Phantom penalties should not dock points', () => {
  test('SCHEMA_MISSING does not appear when no schema provided', () => {
    const desc = cleanDescription(200);
    // No schemaJson passed — should NOT get penalized
    const result = validateQualityGates(baseEvent, desc, 'standard');
    const schemaIssue = result.issues.find(i => i.code === 'SCHEMA_MISSING');
    expect(schemaIssue).toBeUndefined();
  });

  test('MISSING_PRACTICAL does not dock points for missing event metadata', () => {
    const sparseEvent: EventForEnrichment = {
      id: 'test-sparse',
      title: 'Mystery Concert',
      date: '2025-04-01',
      time: null,     // missing
      venue: null,    // missing
      type: 'concert',
      genre: null,
      price: null,    // missing
    };
    const desc = cleanDescription(200);
    const result = validateQualityGates(sparseEvent, desc, 'standard');
    const practicalIssue = result.issues.find(i => i.code === 'MISSING_PRACTICAL');
    // Should either not exist, or be 'info' severity (not 'warning')
    if (practicalIssue) {
      expect(practicalIssue.severity).toBe('info');
    }
  });

  test('MISSING_SECTION does not appear for premium descriptions', () => {
    const desc = cleanDescription(450);
    const result = validateQualityGates(baseEvent, desc, 'premium');
    const sectionIssues = result.issues.filter(i => i.code === 'MISSING_SECTION');
    expect(sectionIssues.length).toBe(0);
  });

  test('score not penalized by phantom checks on clean description', () => {
    // A clean description with complete event data should score high
    const desc = cleanDescription(200);
    const result = validateQualityGates(baseEvent, desc, 'standard');
    // Schema layer should get full 25 points when no schema is provided (not our concern)
    expect(result.layer_scores.schema).toBe(25);
  });
});

// ============================================================================
// Entity Locking — Context-Aware Matching
// ============================================================================

describe('English: Context-aware entity locking', () => {
  test('"in honor of the composer" does NOT trigger entity lock', () => {
    const desc = cleanDescription().replace('Doors open at nine', 'This concert is in honor of the composer. Doors open at nine');
    const result = validateEnglishDescription(baseEvent, desc, 'standard');
    const lockIssue = result.issues.find(i =>
      i.code === 'EN_ENTITY_LOCK_VIOLATION' && i.message.includes('honor'));
    expect(lockIssue).toBeUndefined();
  });

  test('"honoring the anniversary" does NOT trigger entity lock', () => {
    const desc = cleanDescription().replace('Doors open at nine', 'Honoring the anniversary of the venue. Doors open at nine');
    const result = validateEnglishDescription(baseEvent, desc, 'standard');
    const lockIssue = result.issues.find(i =>
      i.code === 'EN_ENTITY_LOCK_VIOLATION' && i.message.includes('honor'));
    expect(lockIssue).toBeUndefined();
  });

  test('"a celebration of jazz" does NOT trigger entity lock', () => {
    const desc = cleanDescription().replace('Doors open at nine', 'A celebration of jazz and improvisation. Doors open at nine');
    const result = validateEnglishDescription(baseEvent, desc, 'standard');
    const lockIssue = result.issues.find(i =>
      i.code === 'EN_ENTITY_LOCK_VIOLATION' && i.message.includes('celebration'));
    expect(lockIssue).toBeUndefined();
  });

  test('"celebrating the release" does NOT trigger entity lock', () => {
    const desc = cleanDescription().replace('Doors open at nine', 'Celebrating the release of the new album. Doors open at nine');
    const result = validateEnglishDescription(baseEvent, desc, 'standard');
    const lockIssue = result.issues.find(i =>
      i.code === 'EN_ENTITY_LOCK_VIOLATION' && i.message.includes('celebration'));
    expect(lockIssue).toBeUndefined();
  });

  test('"urban folk" still triggers entity lock (multi-word, specific)', () => {
    const desc = cleanDescription().replace('distinctive sound', 'urban folk sound');
    const result = validateEnglishDescription(baseEvent, desc, 'standard');
    const lockIssue = result.issues.find(i =>
      i.code === 'EN_ENTITY_LOCK_VIOLATION' && i.message.includes('urban folk'));
    expect(lockIssue).toBeDefined();
  });

  test('"party spirit" still triggers entity lock (multi-word, specific)', () => {
    const desc = cleanDescription().replace('distinctive sound', 'party spirit of the night');
    const result = validateEnglishDescription(baseEvent, desc, 'standard');
    const lockIssue = result.issues.find(i =>
      i.code === 'EN_ENTITY_LOCK_VIOLATION' && i.message.includes('party spirit'));
    expect(lockIssue).toBeDefined();
  });
});
