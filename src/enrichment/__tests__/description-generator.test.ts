/**
 * Task 5.5: Description Generator Tests
 *
 * Tests for AI description prompt building and validation:
 * - buildPrompt includes all event details
 * - buildPrompt specifies 150-300 word range
 * - validateDescription accepts 200 words
 * - validateDescription rejects 100 words
 * - validateDescription rejects filler phrases
 *
 * @see specs/001-data-pipeline/tasks.md (Task 5.5)
 * @see src/enrichment/description-generator.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  buildPrompt,
  validateDescription,
  FILLER_PHRASES,
  LAZY_ADJECTIVES,
  type EventForEnrichment,
  type DescriptionValidationResult,
} from '../description-generator';

// ============================================================================
// Test Data
// ============================================================================

const sampleEvent: EventForEnrichment = {
  id: 'test-event-1',
  title: 'Marina Satti Live at Gazarte',
  date: '2025-01-25',
  time: '21:30',
  venue: 'Gazarte',
  type: 'concert',
  genre: 'Greek contemporary',
  price: 'with-ticket',
};

const sampleGreekEvent: EventForEnrichment = {
  id: 'test-event-2',
  title: 'Αλκίνοος Ιωαννίδης στο Μέγαρο Μουσικής',
  date: '2025-02-15',
  time: '20:00',
  venue: 'Μέγαρο Μουσικής Αθηνών',
  type: 'concert',
  genre: 'Έντεχνο',
  price: 'with-ticket',
};

const sampleExhibitionEvent: EventForEnrichment = {
  id: 'test-event-3',
  title: 'Contemporary Art Exhibition',
  date: '2025-01-20',
  time: '10:00',
  venue: 'SNFCC',
  type: 'exhibition',
  genre: 'Contemporary Art',
  price: 'open',
};

// Helper to generate text with specific word count (no filler phrases)
function generateWords(count: number, variety = false): string {
  if (variety) {
    // Words that do NOT form filler phrases when combined
    const words = [
      'The', 'concert', 'at', 'Gazarte', 'features', 'Marina', 'Satti',
      'performing', 'her', 'latest', 'album', 'songs', 'with', 'a', 'full',
      'band', 'arrangement', 'in', 'an', 'intimate', 'setting', 'that',
      'showcases', 'her', 'distinct', 'vocal', 'style', 'blending', 'traditional',
      'Greek', 'music', 'alongside', 'modern', 'electronic', 'sounds', 'creating',
      'memorable', 'moments', 'for', 'audiences', 'seeking', 'authentic',
      'cultural', 'entertainment', 'Athens', 'popular', 'local', 'scene',
    ];
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      result.push(words[i % words.length]);
    }
    return result.join(' ');
  }
  return Array(count).fill('word').join(' ');
}

// ============================================================================
// Prompt Building Tests
// ============================================================================

describe('Description Generator', () => {
  describe('buildPrompt', () => {
    test('includes event title', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt).toContain('Marina Satti Live at Gazarte');
    });

    test('includes event date', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt).toContain('2025-01-25');
    });

    test('includes event time', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt).toContain('21:30');
    });

    test('includes event venue', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt).toContain('Gazarte');
    });

    test('includes event type', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt).toContain('concert');
    });

    test('includes event genre', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt).toContain('Greek contemporary');
    });

    test('includes event price', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt).toContain('with-ticket');
    });

    test('specifies 150-300 word range', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt).toContain('150');
      expect(prompt).toContain('300');
      expect(prompt.toLowerCase()).toContain('word');
    });

    test('includes all event details in structured format', () => {
      const prompt = buildPrompt(sampleEvent);

      // Should have labeled fields
      expect(prompt).toMatch(/title[:\s]/i);
      expect(prompt).toMatch(/date[:\s]/i);
      expect(prompt).toMatch(/venue[:\s]/i);
    });

    test('handles Greek text correctly', () => {
      const prompt = buildPrompt(sampleGreekEvent);

      expect(prompt).toContain('Αλκίνοος Ιωαννίδης');
      expect(prompt).toContain('Μέγαρο Μουσικής Αθηνών');
      expect(prompt).toContain('Έντεχνο');
    });

    test('includes no fabrication warning', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt.toLowerCase()).toContain('fabricat');
    });

    test('mentions AI answer engines optimization', () => {
      const prompt = buildPrompt(sampleEvent);

      expect(prompt.toLowerCase()).toContain('ai');
    });

    test('includes structure guidance (opening fact, etc.)', () => {
      const prompt = buildPrompt(sampleEvent);

      // Should have some structure guidance
      expect(prompt.toLowerCase()).toContain('open');
    });

    test('handles exhibition type differently', () => {
      const prompt = buildPrompt(sampleExhibitionEvent);

      expect(prompt).toContain('exhibition');
      expect(prompt).toContain('open');
    });

    test('handles missing optional fields gracefully', () => {
      const minimalEvent: EventForEnrichment = {
        id: 'test-minimal',
        title: 'Test Event',
        date: '2025-01-25',
        time: null,
        venue: null,
        type: null,
        genre: null,
        price: null,
      };

      // Should not throw
      const prompt = buildPrompt(minimalEvent);

      expect(prompt).toContain('Test Event');
      expect(prompt).toContain('2025-01-25');
    });
  });

  // ==========================================================================
  // Description Validation Tests
  // ==========================================================================

  describe('validateDescription', () => {
    test('accepts 150 words (minimum)', () => {
      const description = generateWords(150, true);
      const result = validateDescription(description);

      expect(result.valid).toBe(true);
      expect(result.wordCount).toBe(150);
    });

    test('accepts 200 words (middle)', () => {
      const description = generateWords(200, true);
      const result = validateDescription(description);

      expect(result.valid).toBe(true);
      expect(result.wordCount).toBe(200);
    });

    test('accepts 300 words (maximum)', () => {
      const description = generateWords(300, true);
      const result = validateDescription(description);

      expect(result.valid).toBe(true);
      expect(result.wordCount).toBe(300);
    });

    test('rejects 100 words (too short)', () => {
      const description = generateWords(100, true);
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
      expect(result.wordCount).toBe(100);
      expect(result.errors.some(e => e.toLowerCase().includes('too short'))).toBe(true);
    });

    test('rejects 149 words (one below minimum)', () => {
      const description = generateWords(149, true);
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
    });

    test('rejects 350 words (too long)', () => {
      const description = generateWords(350, true);
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
      expect(result.wordCount).toBe(350);
      expect(result.errors.some(e => e.toLowerCase().includes('too long'))).toBe(true);
    });

    test('rejects 301 words (one above maximum)', () => {
      const description = generateWords(301, true);
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
    });

    test('rejects empty string', () => {
      const result = validateDescription('');

      expect(result.valid).toBe(false);
      expect(result.wordCount).toBe(0);
    });

    // Filler phrase tests
    test('rejects description with "unforgettable experience"', () => {
      const description = generateWords(180, true) + ' This will be an unforgettable experience for everyone.';
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('lazy'))).toBe(true);
    });

    test('rejects description with "must-see event"', () => {
      const description = generateWords(180, true) + ' This is a must-see event for all music lovers.';
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('lazy'))).toBe(true);
    });

    test('rejects description with "don\'t miss"', () => {
      const description = generateWords(180, true) + ' Don\'t miss this incredible performance.';
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('lazy'))).toBe(true);
    });

    test('rejects description with "once in a lifetime"', () => {
      const description = generateWords(180, true) + ' A once in a lifetime opportunity to see this artist.';
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('lazy'))).toBe(true);
    });

    test('rejects description with "not to be missed"', () => {
      const description = generateWords(180, true) + ' An event not to be missed by anyone.';
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
    });

    test('accepts description without filler phrases', () => {
      const description = `
        Marina Satti performs at Gazarte on Saturday January 25, 2025 at 21:30.
        The award-winning Greek artist brings her distinctive blend of traditional
        rebetiko influences and contemporary electronic production to one of Athens
        most beloved live music venues. Satti rose to international prominence
        following her Eurovision performance and has since released critically
        acclaimed albums that explore themes of identity and cultural heritage.
        The Gazarte venue in Gazi provides an intimate setting for her powerful
        vocal performances. Doors open at 20:00 with the main performance starting
        at 21:30. Tickets are available through the venue website and at the door.
        The venue is accessible via Kerameikos metro station. This concert is part
        of Satti ongoing winter tour showcasing songs from her latest album alongside
        fan favorites from her extensive catalog. The performance space accommodates
        standing and limited seating areas. Early arrival is recommended for optimal
        viewing positions in this popular venue.
      `;
      const result = validateDescription(description);

      expect(result.valid).toBe(true);
    });

    test('handles Greek text correctly', () => {
      const greekDescription = `
        Ο Αλκίνοος Ιωαννίδης επιστρέφει στο Μέγαρο Μουσικής Αθηνών για μια
        μοναδική συναυλία στις 15 Φεβρουαρίου 2025. Ο αγαπημένος Κύπριος
        τραγουδοποιός θα παρουσιάσει τραγούδια από όλη τη δισκογραφία του,
        συνοδευόμενος από εξαιρετικούς μουσικούς. Η βραδιά υπόσχεται να είναι
        γεμάτη συγκίνηση και νοσταλγία στον εμβληματικό χώρο της Αθήνας.
      ` + ' ' + generateWords(100);
      const result = validateDescription(greekDescription);

      expect(result.wordCount).toBeGreaterThan(50);
    });

    test('returns multiple errors when applicable', () => {
      const description = 'This is an unforgettable experience and a must-see event.';
      const result = validateDescription(description);

      expect(result.valid).toBe(false);
      // Should have both word count error and filler phrase errors
      expect(result.errors.length).toBeGreaterThan(1);
    });

    test('provides helpful error messages', () => {
      const description = generateWords(100, true);
      const result = validateDescription(description);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].length).toBeGreaterThan(10);
    });
  });

  // ==========================================================================
  // Filler Phrases List Tests
  // ==========================================================================

  describe('FILLER_PHRASES', () => {
    test('contains genuinely filler phrases', () => {
      expect(FILLER_PHRASES).toContain('unforgettable');
      expect(FILLER_PHRASES).toContain('must-see');
      expect(FILLER_PHRASES).toContain("don't miss");
      expect(FILLER_PHRASES).toContain('world-class');
      expect(FILLER_PHRASES).toContain('not to be missed');
    });

    test('is separate from LAZY_ADJECTIVES (not an alias)', () => {
      expect(FILLER_PHRASES).not.toBe(LAZY_ADJECTIVES);
      // FILLER_PHRASES should be shorter than LAZY_ADJECTIVES
      expect(FILLER_PHRASES.length).toBeLessThan(LAZY_ADJECTIVES.length);
    });

    test('is a non-empty array', () => {
      expect(Array.isArray(FILLER_PHRASES)).toBe(true);
      expect(FILLER_PHRASES.length).toBeGreaterThan(5);
    });

    test('all phrases are lowercase', () => {
      for (const phrase of FILLER_PHRASES) {
        expect(phrase).toBe(phrase.toLowerCase());
      }
    });

    test('does not contain tier-sensitive adjectives like legendary or vibrant', () => {
      expect(FILLER_PHRASES).not.toContain('legendary');
      expect(FILLER_PHRASES).not.toContain('vibrant');
      expect(FILLER_PHRASES).not.toContain('immersive');
      expect(FILLER_PHRASES).not.toContain('iconic');
    });
  });
});
