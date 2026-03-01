/**
 * Unit tests for Event Categorizer
 *
 * Tests the three-pass categorization:
 * 1. Venue-based rules
 * 2. Keyword-based rules
 * 3. Source-based hints
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  categorizeEvent,
  categorizeEventSimple,
  getSchemaOrgType,
  needsHumanReview,
  clearConfigCache,
  type EventInput
} from '../categorize-event';

describe('Event Categorizer', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  describe('Pass 1: Venue-Based Rules', () => {
    it('should categorize Astron events as dj_set', () => {
      const result = categorizeEvent({
        title: 'Night Party',
        venue: 'Astron'
      });
      expect(result.type).toBe('dj_set');
      expect(result.confidence).toBe('high');
    });

    it('should categorize Dybbuk events as dj_set', () => {
      const result = categorizeEvent({
        title: 'Electronic Music Night',
        venue: 'Dybbuk'
      });
      expect(result.type).toBe('dj_set');
      expect(result.confidence).toBe('high');
    });

    it('should categorize Half Note events as concert with jazz hint', () => {
      const result = categorizeEvent({
        title: 'Jazz Trio',
        venue: 'Half Note Jazz Club'
      });
      expect(result.type).toBe('concert');
      expect(result.confidence).toBe('high');
      expect(result.genreHint).toBe('jazz');
    });

    it('should categorize Megaron events via keywords (mixed venue)', () => {
      const result = categorizeEvent({
        title: 'Athens Philharmonic Orchestra',
        venue: 'Μέγαρο Μουσικής Αθηνών'
      });
      expect(result.type).toBe('concert');
      expect(result.confidence).toBe('medium');
    });

    it('should categorize theater venue events as theater', () => {
      const result = categorizeEvent({
        title: 'New Play Production',
        venue: 'Θέατρο Παλλάς'
      });
      expect(result.type).toBe('theater');
      expect(result.confidence).toBe('high');
    });

    it('should categorize Red Jasper events as show', () => {
      const result = categorizeEvent({
        title: 'Cabaret Night',
        venue: 'Red Jasper Cabaret Theatre'
      });
      expect(result.type).toBe('show');
      expect(result.confidence).toBe('high');
    });

    it('should handle venue names with addresses appended', () => {
      const result = categorizeEvent({
        title: 'Party Night',
        venue: 'Astron, Λεωφόρος Κωνσταντινουπόλεως 121, Αθήνα, 10447, Greece'
      });
      expect(result.type).toBe('dj_set');
    });
  });

  describe('Pass 2: Keyword-Based Rules', () => {
    it('should categorize DJ events correctly', () => {
      const result = categorizeEvent({
        title: 'DJ Set by Artist Name',
        venue: 'Unknown Venue'
      });
      expect(result.type).toBe('dj_set');
      expect(result.confidence).toBe('medium');
    });

    it('should categorize theater performances correctly', () => {
      const result = categorizeEvent({
        title: 'Θεατρική Παράσταση',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('theater');
    });

    it('should categorize dance performances as performance', () => {
      const result = categorizeEvent({
        title: 'Contemporary Dance Performance',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('performance');
    });

    it('should categorize tango as performance', () => {
      const result = categorizeEvent({
        title: 'Tango Night',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('performance');
    });

    it('should categorize opera as concert', () => {
      const result = categorizeEvent({
        title: 'Carmen - Opera',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('concert');
    });

    it('should categorize classical concerts as concert', () => {
      const result = categorizeEvent({
        title: 'Symphony Orchestra Concert',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('concert');
    });

    it('should categorize comedy shows as show', () => {
      const result = categorizeEvent({
        title: 'Stand-Up Comedy Night',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('show');
    });

    it('should categorize workshops correctly', () => {
      const result = categorizeEvent({
        title: 'Art Workshop for Beginners',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('workshop');
    });

    it('should categorize exhibitions correctly', () => {
      const result = categorizeEvent({
        title: 'Modern Art Exhibition',
        venue: 'Some Gallery'
      });
      expect(result.type).toBe('exhibition');
    });

    it('should categorize screenings correctly', () => {
      const result = categorizeEvent({
        title: 'Documentary Screening',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('screening');
    });

    it('should categorize festivals correctly', () => {
      const result = categorizeEvent({
        title: 'Athens Music Festival',
        venue: 'Multiple Venues'
      });
      expect(result.type).toBe('festival');
    });

    it('should prioritize concert over exhibition for jazz at museum', () => {
      const result = categorizeEvent({
        title: 'Jazz Night at the Museum',
        venue: 'Some Museum'
      });
      expect(result.type).toBe('concert');
    });

    it('should skip performance for social dance events', () => {
      const result = categorizeEvent({
        title: 'Αποκριάτικος χορός',
        venue: 'Some Venue'
      });
      expect(result.type).not.toBe('performance');
    });

    it('should keep κωμωδία as theater when in theater context', () => {
      const result = categorizeEvent({
        title: 'Θεατρική Κωμωδία',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('theater');
    });
  });

  describe('Pass 3: Source-Based Hints', () => {
    it('should categorize clubber.gr events as dj_set', () => {
      const result = categorizeEvent({
        title: 'Party Night',
        venue: 'Unknown Club',
        source: 'clubber.gr'
      });
      expect(result.type).toBe('dj_set');
      expect(result.confidence).toBe('medium');
    });

    it('should categorize residentadvisor events as dj_set', () => {
      const result = categorizeEvent({
        title: 'Electronic Night',
        venue: 'Unknown Club',
        source: 'residentadvisor'
      });
      expect(result.type).toBe('dj_set');
    });

    it('should override source hint when "συναυλία" present', () => {
      const result = categorizeEvent({
        title: 'Rock Συναυλία',
        venue: 'Unknown Venue',
        source: 'clubber.gr'
      });
      expect(result.type).toBe('concert');
    });

    it('should override source hint when "live" present', () => {
      const result = categorizeEvent({
        title: 'Live Band Performance',
        venue: 'Unknown Venue',
        source: 'residentadvisor'
      });
      expect(result.type).toBe('concert');
    });
  });

  describe('Fallback Behavior', () => {
    it('should keep current type when no rules match', () => {
      const result = categorizeEvent({
        title: 'Mysterious Event',
        venue: 'Unknown Venue',
        currentType: 'performance'
      });
      expect(result.type).toBe('performance');
      expect(result.confidence).toBe('low');
    });

    it('should default to concert when no rules match and no current type', () => {
      const result = categorizeEvent({
        title: 'Mysterious Event',
        venue: 'Unknown Venue'
      });
      expect(result.type).toBe('concert');
      expect(result.confidence).toBe('low');
    });
  });

  describe('Genre Matching', () => {
    it('should categorize by genre when keywords dont match', () => {
      const result = categorizeEvent({
        title: 'Artist Name',
        venue: 'Unknown Venue',
        genres: ['Electronic', 'Techno']
      });
      expect(result.type).toBe('dj_set');
    });

    it('should use genre for classical detection (now concert)', () => {
      const result = categorizeEvent({
        title: 'Concert by Artist',
        venue: 'Unknown Venue',
        genres: ['Classical', 'Orchestral']
      });
      expect(result.type).toBe('concert');
    });
  });

  describe('Mixed Venue Handling', () => {
    it('should use keywords for Gazarte events', () => {
      const djResult = categorizeEvent({
        title: 'DJ Night at Gazarte',
        venue: 'Gazarte'
      });
      expect(djResult.type).toBe('dj_set');

      const concertResult = categorizeEvent({
        title: 'Live Band at Gazarte',
        venue: 'Gazarte'
      });
      expect(concertResult.type).toBe('concert');
    });

    it('should use keywords for SNFCC events', () => {
      const classicalResult = categorizeEvent({
        title: 'Orchestra Performance',
        venue: 'SNFCC'
      });
      expect(classicalResult.type).toBe('concert');

      const danceResult = categorizeEvent({
        title: 'Contemporary Dance',
        venue: 'SNFCC'
      });
      expect(danceResult.type).toBe('performance');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty venue', () => {
      const result = categorizeEvent({
        title: 'DJ Set Party',
        venue: ''
      });
      expect(result.type).toBe('dj_set');
    });

    it('should handle Greek text', () => {
      const result = categorizeEvent({
        title: 'Συναυλία στην Αθήνα',
        venue: 'Unknown'
      });
      expect(result.type).toBe('concert');
    });

    it('should handle mixed language titles', () => {
      const result = categorizeEvent({
        title: 'Live Concert - Ζωντανή Μουσική',
        venue: 'Unknown'
      });
      expect(result.type).toBe('concert');
    });

    it('should handle HTML entities in venue names (mixed venue falls to keywords)', () => {
      const result = categorizeEvent({
        title: 'Ρεσιτάλ Πιάνου',
        venue: 'Μέγαρο Μουσικής - αίθουσα &#171;Δημήτρης Μητρόπουλος&#187;'
      });
      expect(result.type).toBe('concert');
    });
  });

  describe('categorizeEventSimple', () => {
    it('should return just the EventType', () => {
      const type = categorizeEventSimple({
        title: 'DJ Night',
        venue: 'Astron'
      });
      expect(type).toBe('dj_set');
    });
  });

  describe('getSchemaOrgType', () => {
    it('should return MusicEvent for concert', () => {
      expect(getSchemaOrgType('concert')).toBe('MusicEvent');
    });

    it('should return TheaterEvent for theater', () => {
      expect(getSchemaOrgType('theater')).toBe('TheaterEvent');
    });

    it('should return DanceEvent for performance', () => {
      expect(getSchemaOrgType('performance')).toBe('DanceEvent');
    });

    it('should return Event for unknown types', () => {
      expect(getSchemaOrgType('other')).toBe('Event');
    });
  });

  describe('needsHumanReview', () => {
    it('should return true for low confidence', () => {
      expect(needsHumanReview({
        type: 'concert',
        confidence: 'low',
        reason: 'test'
      })).toBe(true);
    });

    it('should return false for high confidence', () => {
      expect(needsHumanReview({
        type: 'concert',
        confidence: 'high',
        reason: 'test'
      })).toBe(false);
    });

    it('should return false for medium confidence', () => {
      expect(needsHumanReview({
        type: 'concert',
        confidence: 'medium',
        reason: 'test'
      })).toBe(false);
    });
  });
});
