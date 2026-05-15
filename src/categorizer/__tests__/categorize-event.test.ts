/**
 * Unit tests for Event Categorizer
 *
 * Tests the four-pass categorization:
 * 1. Venue-based rules
 * 2. Keyword-based rules
 * 3. URL path-based rules
 * 4. Source-based hints
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

    it('should venue-lock Θέατρο Παλλάς to theater (no URL override)', () => {
      const result = categorizeEvent({
        title: 'New Play Production',
        venue: 'Θέατρο Παλλάς'
      });
      expect(result.type).toBe('theater');
      expect(result.confidence).toBe('high');
    });

    it('should skip venue lock when high-confidence URL contradicts it', () => {
      const result = categorizeEvent({
        title: 'ΡΕΜΟΣ',
        venue: 'Θέατρο Παλλάς',
        url: 'https://www.athinorama.gr/music/gig/remos/12345'
      });
      // URL override: /music/gig/ (high, concert) ≠ theater → venue lock yields
      // Falls through to URL pass → concert
      expect(result.type).toBe('concert');
      expect(result.confidence).toBe('high');
    });

    it('should keep venue lock when URL does not contradict', () => {
      const result = categorizeEvent({
        title: 'Λόλα',
        venue: 'Θέατρο Παλλάς',
        url: 'https://www.more.com/tickets/theater/lola/99999'
      });
      // /tickets/theater/ (high, theater) = theater → no contradiction → venue lock holds
      expect(result.type).toBe('theater');
      expect(result.confidence).toBe('high');
    });

    it('should treat Θέατρο Ολύμπια as mixed venue', () => {
      const result = categorizeEvent({
        title: 'Συναυλία Ορχήστρας',
        venue: 'Θέατρο Ολύμπια'
      });
      expect(result.type).toBe('concert');
      expect(result.confidence).toBe('medium');
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

    it('should categorize screenings as cinema', () => {
      const result = categorizeEvent({
        title: 'Documentary Screening',
        venue: 'Some Venue'
      });
      expect(result.type).toBe('cinema');
    });

    it('should categorize festivals correctly', () => {
      const result = categorizeEvent({
        title: 'Athens Music Festival',
        venue: 'Multiple Venues'
      });
      expect(result.type).toBe('festival');
    });

    it('should skip exhibition (not classify as concert) when jazz override present without title-match keyword', () => {
      // concert_override_keywords (jazz) suppress exhibition for "Jazz at Museum",
      // but jazz is not a concert title_keyword — so no positive concert match either.
      // Falls through to 'other' (review queue). Post-fallback-nudge semantics.
      // Future taxonomy session should consider adding jazz as a concert title_keyword
      // if a positive match is desired for this pattern.
      const result = categorizeEvent({
        title: 'Jazz Night at the Museum',
        venue: 'Some Museum'
      });
      expect(result.type).toBe('other');
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

  describe('Pass 3: URL Path-Based Rules', () => {
    it('should categorize athinorama /music/gig/ as concert (high)', () => {
      const result = categorizeEvent({
        title: 'Unknown Artist',
        venue: 'Unknown Venue',
        url: 'https://www.athinorama.gr/music/gig/artist/12345'
      });
      expect(result.type).toBe('concert');
      expect(result.confidence).toBe('high');
    });

    it('should categorize more.com /tickets/theater/ as theater (high)', () => {
      const result = categorizeEvent({
        title: 'Λόλα',
        venue: 'Unknown Venue',
        url: 'https://www.more.com/tickets/theater/lola/99999'
      });
      expect(result.type).toBe('theater');
      expect(result.confidence).toBe('high');
    });

    it('should categorize more.com /tickets/music/ as concert (medium)', () => {
      const result = categorizeEvent({
        title: 'Artist Name',
        venue: 'Unknown Venue',
        url: 'https://www.more.com/tickets/music/artist/88888'
      });
      expect(result.type).toBe('concert');
      expect(result.confidence).toBe('medium');
    });

    it('should let keywords win over URL for festivals', () => {
      const result = categorizeEvent({
        title: 'EJEKT FESTIVAL 2026',
        venue: 'Πλατεία Νερού',
        url: 'https://www.athinorama.gr/music/gig/ejekt/55555'
      });
      expect(result.type).toBe('festival');
    });

    it('should let keywords win over URL for dj_sets', () => {
      const result = categorizeEvent({
        title: 'DJ KOZE',
        venue: 'Gagarin 205',
        url: 'https://www.more.com/tickets/music/dj-koze/77777'
      });
      expect(result.type).toBe('dj_set');
    });

    it('should fall through gracefully when no URL provided', () => {
      const result = categorizeEvent({
        title: 'Mysterious Event',
        venue: 'Unknown Venue'
      });
      // Should reach fallback, not crash
      expect(result.type).toBe('other');
      expect(result.confidence).toBe('low');
    });

  });

  describe('URL Override + Mixed Venue Integration', () => {
    it('should venue-lock theater event at Παλλάς when no music URL', () => {
      const result = categorizeEvent({
        title: 'Λόλα',
        venue: 'Θέατρο Παλλάς',
        currentType: 'theater'
      });
      expect(result.type).toBe('theater');
      expect(result.confidence).toBe('high');
    });

    it('should override venue lock at Παλλάς when /music/gig/ URL present', () => {
      const result = categorizeEvent({
        title: 'ΑΝΤΩΝΗΣ ΡΕΜΟΣ',
        venue: 'Θέατρο Παλλάς',
        url: 'https://www.athinorama.gr/music/gig/remos/12345',
        currentType: 'theater'
      });
      expect(result.type).toBe('concert');
    });

    it('should not override venue lock with medium-confidence URL', () => {
      const result = categorizeEvent({
        title: 'Unknown Artist',
        venue: 'Θέατρο Παλλάς',
        url: 'https://www.more.com/tickets/music/artist/88888'
      });
      // /tickets/music/ is medium confidence — not enough to override venue lock
      expect(result.type).toBe('theater');
      expect(result.confidence).toBe('high');
    });

    it('should categorize Θέατρο Ολύμπια concert via keywords (mixed venue)', () => {
      const result = categorizeEvent({
        title: 'Μεγάλη Συναυλία',
        venue: 'Θέατρο Ολύμπια'
      });
      expect(result.type).toBe('concert');
      expect(result.confidence).toBe('medium');
    });

    it('should trust currentType for Ολύμπια when no rules match', () => {
      const result = categorizeEvent({
        title: 'Unnamed Event',
        venue: 'Θέατρο Ολύμπια',
        currentType: 'theater'
      });
      expect(result.type).toBe('theater');
      expect(result.confidence).toBe('low');
    });
  });

  describe('Pass 4: Source-Based Hints', () => {
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

    it('should default to other when no rules match and no current type (review-needed signal)', () => {
      const result = categorizeEvent({
        title: 'Mysterious Event',
        venue: 'Unknown Venue'
      });
      expect(result.type).toBe('other');
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
