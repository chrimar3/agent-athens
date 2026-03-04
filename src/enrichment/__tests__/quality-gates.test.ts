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
