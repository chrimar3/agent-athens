/**
 * Enrichment Matrix Tests
 *
 * Tests for event classification and word target assignment.
 *
 * @see src/enrichment/enrichment-matrix.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  classifyEvent,
  getWordTarget,
  structureToTier,
  ENRICHMENT_MATRIX,
  type EventCategory,
} from '../enrichment-matrix';

describe('Enrichment Matrix', () => {
  describe('classifyEvent', () => {
    test('exhibition type returns exhibition', () => {
      expect(classifyEvent({ type: 'exhibition' })).toBe('exhibition');
    });

    test('festival type returns festival_parent', () => {
      expect(classifyEvent({ type: 'festival' })).toBe('festival_parent');
    });

    test('dj_set type returns concert_local', () => {
      expect(classifyEvent({ type: 'dj_set' })).toBe('concert_local');
    });

    test('theater type returns theater_contemporary by default', () => {
      expect(classifyEvent({ type: 'theater', title: 'Modern Play' })).toBe('theater_contemporary');
    });

    test('theater with ancient playwright returns theater_ancient', () => {
      expect(classifyEvent({ type: 'theater', title: 'Μήδεια του Ευριπίδη' })).toBe('theater_ancient');
    });

    test('theater with Shakespeare returns theater_ancient', () => {
      expect(classifyEvent({ type: 'theater', title: 'Hamlet by Shakespeare' })).toBe('theater_ancient');
    });

    test('concert at major venue returns concert_major', () => {
      expect(classifyEvent({ type: 'concert', venue_name: 'Half Note Jazz Club' })).toBe('concert_major');
    });

    test('concert with high price returns concert_major', () => {
      expect(classifyEvent({ type: 'concert', price_amount: 30 })).toBe('concert_major');
    });

    test('concert at small venue with low price returns concert_local', () => {
      expect(classifyEvent({ type: 'concert', venue_name: 'Small Bar', price_amount: 10 })).toBe('concert_local');
    });

    test('premium venue returns premium_showcase', () => {
      expect(classifyEvent({ type: 'concert', venue_name: 'Μέγαρο Μουσικής Αθηνών' })).toBe('premium_showcase');
    });

    test('premium venue exhibition stays exhibition', () => {
      expect(classifyEvent({ type: 'exhibition', venue_name: 'Στέγη Ιδρύματος Ωνάση' })).toBe('exhibition');
    });

    test('premium venue kids show returns kids_family', () => {
      expect(classifyEvent({
        type: 'concert',
        venue_name: 'Μέγαρο Μουσικής Αθηνών',
        title: 'Μουσικό παιδικό πρόγραμμα'
      })).toBe('kids_family');
    });

    test('kids event by title returns kids_family', () => {
      expect(classifyEvent({ type: 'show', title: 'Fun for kids and families' })).toBe('kids_family');
    });

    test('unknown type returns default', () => {
      expect(classifyEvent({ type: 'other' })).toBe('default');
    });

    test('performance type returns theater_contemporary', () => {
      expect(classifyEvent({ type: 'performance', title: 'Dance Show' })).toBe('theater_contemporary');
    });
  });

  describe('getWordTarget', () => {
    test('returns correct range for DJ set', () => {
      const target = getWordTarget({ type: 'dj_set' });
      expect(target.min).toBe(80);
      expect(target.max).toBe(120);
      expect(target.structure).toBe('three-part-block');
    });

    test('returns correct range for exhibition', () => {
      const target = getWordTarget({ type: 'exhibition' });
      expect(target.min).toBe(200);
      expect(target.max).toBe(300);
    });

    test('returns correct range for premium showcase', () => {
      const target = getWordTarget({ type: 'concert', venue_name: 'Ηρώδειο' });
      expect(target.min).toBe(400);
      expect(target.max).toBe(600);
      expect(target.structure).toBe('full-8-section');
    });
  });

  describe('structureToTier', () => {
    test('three-part-block maps to stub', () => {
      expect(structureToTier('three-part-block')).toBe('stub');
    });

    test('hybrid maps to standard', () => {
      expect(structureToTier('hybrid')).toBe('standard');
    });

    test('full-8-section maps to premium', () => {
      expect(structureToTier('full-8-section')).toBe('premium');
    });
  });

  describe('matrix completeness', () => {
    test('all categories have valid min < max', () => {
      for (const [category, entry] of Object.entries(ENRICHMENT_MATRIX)) {
        expect(entry.min).toBeLessThan(entry.max);
        expect(entry.min).toBeGreaterThan(0);
      }
    });

    test('all categories have a valid structure', () => {
      const validStructures = ['three-part-block', 'hybrid', 'full-8-section'];
      for (const entry of Object.values(ENRICHMENT_MATRIX)) {
        expect(validStructures).toContain(entry.structure);
      }
    });
  });
});
