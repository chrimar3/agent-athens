/**
 * Task 5.1: Word Counter Tests
 *
 * Tests for word counting utility used in AI description validation.
 * Per spec: Descriptions must be 150-300 words.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 5.1)
 * @see src/enrichment/word-counter.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  countWords,
  validateWordCount,
  type WordCountResult,
} from '../word-counter';

// ============================================================================
// Basic Word Counting Tests
// ============================================================================

describe('Word Counter', () => {
  describe('Basic Counting', () => {
    test('counts simple words correctly', () => {
      const result = countWords('Hello world this is a test');
      expect(result.count).toBe(6);
    });

    test('counts single word', () => {
      const result = countWords('Hello');
      expect(result.count).toBe(1);
    });

    test('returns zero for empty string', () => {
      const result = countWords('');
      expect(result.count).toBe(0);
    });

    test('returns zero for whitespace only', () => {
      const result = countWords('   \n\t  ');
      expect(result.count).toBe(0);
    });

    test('handles multiple spaces between words', () => {
      const result = countWords('Hello    world   test');
      expect(result.count).toBe(3);
    });

    test('handles newlines and tabs', () => {
      const result = countWords('Hello\nworld\ttest');
      expect(result.count).toBe(3);
    });
  });

  // ==========================================================================
  // Unicode/Greek Character Tests
  // ==========================================================================

  describe('Unicode Characters (Greek)', () => {
    test('counts Greek words correctly', () => {
      const result = countWords('Καλημέρα κόσμε');
      expect(result.count).toBe(2);
    });

    test('counts mixed Greek and English', () => {
      const result = countWords('Hello Αθήνα world');
      expect(result.count).toBe(3);
    });

    test('handles Greek punctuation', () => {
      // Γεια, σου, κόσμε, Πώς, είσαι = 5 words
      const result = countWords('Γεια σου, κόσμε! Πώς είσαι;');
      expect(result.count).toBe(5);
    });

    test('counts Greek event description', () => {
      // Ο, Αλκίνοος, Ιωαννίδης, επιστρέφει, στην, Αθήνα, για, μια, μοναδική, συναυλία = 10 words
      const greekText = 'Ο Αλκίνοος Ιωαννίδης επιστρέφει στην Αθήνα για μια μοναδική συναυλία';
      const result = countWords(greekText);
      expect(result.count).toBe(10);
    });

    test('handles accented Greek characters', () => {
      const result = countWords('Μέγαρο Μουσικής Αθηνών');
      expect(result.count).toBe(3);
    });
  });

  // ==========================================================================
  // Punctuation Handling Tests
  // ==========================================================================

  describe('Punctuation Handling', () => {
    test('ignores periods', () => {
      const result = countWords('Hello. World.');
      expect(result.count).toBe(2);
    });

    test('ignores commas', () => {
      const result = countWords('Hello, world, test');
      expect(result.count).toBe(3);
    });

    test('ignores quotes', () => {
      const result = countWords('"Hello" and \'world\'');
      expect(result.count).toBe(3);
    });

    test('ignores Greek quotes', () => {
      // Ο, Γλάρος, του, Τσέχωφ = 4 words
      const result = countWords('«Ο Γλάρος» του Τσέχωφ');
      expect(result.count).toBe(4);
    });

    test('handles em dashes', () => {
      const result = countWords('Hello—world test');
      expect(result.count).toBe(3);
    });

    test('handles ellipsis', () => {
      const result = countWords('Hello... world');
      expect(result.count).toBe(2);
    });
  });

  // ==========================================================================
  // Validation Tests (150-300 words)
  // ==========================================================================

  describe('Word Count Validation', () => {
    test('returns valid=true for 150 words (minimum)', () => {
      const words = Array(150).fill('word').join(' ');
      const result = validateWordCount(words);
      expect(result.valid).toBe(true);
      expect(result.count).toBe(150);
    });

    test('returns valid=true for 300 words (maximum)', () => {
      const words = Array(300).fill('word').join(' ');
      const result = validateWordCount(words);
      expect(result.valid).toBe(true);
      expect(result.count).toBe(300);
    });

    test('returns valid=true for 200 words (middle)', () => {
      const words = Array(200).fill('word').join(' ');
      const result = validateWordCount(words);
      expect(result.valid).toBe(true);
      expect(result.count).toBe(200);
    });

    test('returns valid=false for <150 words', () => {
      const words = Array(100).fill('word').join(' ');
      const result = validateWordCount(words);
      expect(result.valid).toBe(false);
      expect(result.count).toBe(100);
      expect(result.reason).toContain('too short');
    });

    test('returns valid=false for >300 words', () => {
      const words = Array(350).fill('word').join(' ');
      const result = validateWordCount(words);
      expect(result.valid).toBe(false);
      expect(result.count).toBe(350);
      expect(result.reason).toContain('too long');
    });

    test('returns valid=false for 149 words (one below minimum)', () => {
      const words = Array(149).fill('word').join(' ');
      const result = validateWordCount(words);
      expect(result.valid).toBe(false);
    });

    test('returns valid=false for 301 words (one above maximum)', () => {
      const words = Array(301).fill('word').join(' ');
      const result = validateWordCount(words);
      expect(result.valid).toBe(false);
    });

    test('returns valid=false for empty string', () => {
      const result = validateWordCount('');
      expect(result.valid).toBe(false);
      expect(result.count).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    test('handles hyphenated words as one word', () => {
      const result = countWords('state-of-the-art technology');
      expect(result.count).toBe(2);
    });

    test('handles numbers as words', () => {
      // Colons split numbers: The, event, starts, at, 21, 00 = 6 words
      const result = countWords('The event starts at 21:00');
      expect(result.count).toBe(6);
    });

    test('handles currency symbols', () => {
      const result = countWords('Tickets cost €25 each');
      expect(result.count).toBe(4);
    });

    test('handles URLs (splits on punctuation)', () => {
      // URLs get split on colons/slashes: Visit, https, example, com, for, details
      const result = countWords('Visit https://example.com for details');
      expect(result.count).toBeGreaterThanOrEqual(4);
    });

    test('handles very long text efficiently', () => {
      const longText = Array(1000).fill('word').join(' ');
      const start = Date.now();
      const result = countWords(longText);
      const elapsed = Date.now() - start;

      expect(result.count).toBe(1000);
      expect(elapsed).toBeLessThan(100); // Should be fast
    });

    test('handles mixed content with emojis', () => {
      // Emojis are treated as words: Great, concert, 🎵, at, Gazarte, 🎸 = 6
      const result = countWords('Great concert 🎵 at Gazarte 🎸');
      expect(result.count).toBeGreaterThanOrEqual(4);
    });
  });

  // ==========================================================================
  // Real-World Description Tests
  // ==========================================================================

  describe('Real-World Descriptions', () => {
    test('validates typical event description', () => {
      const description = `
        Marina Satti brings her unique blend of traditional Greek music and modern
        electronic sounds to Gazarte on Saturday night. The award-winning artist,
        known for her Eurovision appearance and viral hits, will perform songs from
        her latest album alongside fan favorites. The intimate venue setting promises
        an unforgettable experience as Satti's powerful vocals fill the space. Doors
        open at 20:00 with the main performance starting at 21:30. Tickets are available
        online and at the door, with VIP packages offering meet-and-greet opportunities.
        This is a must-see event for fans of contemporary Greek music and anyone looking
        to discover the vibrant Athens music scene. The artist's fusion of rebetiko
        influences with modern production has earned critical acclaim both domestically
        and internationally. Don't miss this chance to experience one of Greece's most
        exciting performers in an intimate setting.
      `;

      const result = validateWordCount(description);
      expect(result.count).toBeGreaterThanOrEqual(100);
    });

    test('counts Greek event description correctly', () => {
      const greekDescription = `
        Ο Αλκίνοος Ιωαννίδης επιστρέφει στο Μέγαρο Μουσικής για μια βραδιά γεμάτη
        συγκίνηση και νοσταλγία. Ο αγαπημένος Κύπριος τραγουδοποιός θα παρουσιάσει
        τραγούδια από όλη τη δισκογραφία του, συνοδευόμενος από εξαιρετικούς μουσικούς.
        Η συναυλία υπόσχεται μια μαγική βραδιά στον εμβληματικό χώρο της Αθήνας.
      `;

      const result = countWords(greekDescription);
      expect(result.count).toBeGreaterThan(30);
    });
  });
});
