/**
 * Task 2.1: Location Filter Tests
 *
 * Tests for Athens location filtering logic
 * Per spec FR-B: location_status values and filtering rules
 *
 * @see specs/001-data-pipeline/tasks.md
 * @see specs/001-data-pipeline/spec.md (FR-B)
 * @see src/quality/location-filter.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  checkLocation,
  shouldShowOnSite,
  shouldReject,
  filterForSite,
  categorizeEvents,
  getFilterStats,
  type EventLocation,
  type LocationResult,
  type LocationStatus,
} from '../location-filter';

describe('Location Filter', () => {
  // =========================================================================
  // Whitelist Tests (verified_athens)
  // =========================================================================

  describe('Whitelist - Known Athens Venues', () => {
    test('approves event at Six D.O.G.S', () => {
      const event: EventLocation = {
        venue_name: 'Six D.O.G.S',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('verified_athens');
    });

    test('approves event at "Six Dogs" (variation)', () => {
      const event: EventLocation = {
        venue_name: 'Six Dogs',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('verified_athens');
    });

    test('approves event at SNFCC', () => {
      const event: EventLocation = {
        venue_name: 'SNFCC',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('verified_athens');
    });

    test('approves event at Gazarte', () => {
      const event: EventLocation = {
        venue_name: 'Gazarte',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('verified_athens');
      expect(result.matched_venue).toBe('Gazarte');
    });

    test('approves Gazarte variation and returns canonical name', () => {
      const event: EventLocation = {
        venue_name: 'Gazarte - Ground Stage',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('verified_athens');
      expect(result.matched_venue).toBe('Gazarte');
    });

    test('approves event at Megaro Mousikis', () => {
      const event: EventLocation = {
        venue_name: 'Μέγαρο Μουσικής Αθηνών',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('verified_athens');
    });

    test('approves event mentioning "Monastiraki" neighborhood', () => {
      const event: EventLocation = {
        venue_neighborhood: 'Monastiraki',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('verified_athens');
    });
  });

  // =========================================================================
  // Blacklist Tests (rejected_non_athens)
  // =========================================================================

  describe('Blacklist - Non-Athens Locations', () => {
    test('rejects event with "Θεσσαλονίκη" in title', () => {
      const event: EventLocation = {
        title: 'Concert στη Θεσσαλονίκη',
        venue_name: 'Some Venue',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('rejected_non_athens');
      expect(result.rejection_reason).toContain('Θεσσαλονίκη');
    });

    test('rejects event with "Thessaloniki" in venue', () => {
      const event: EventLocation = {
        venue_name: 'Thessaloniki Concert Hall',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('rejected_non_athens');
    });

    test('rejects event with "Πτολεμαΐδα" in venue', () => {
      const event: EventLocation = {
        venue_name: 'Πνευματικό Κέντρο Πτολεμαΐδας',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('rejected_non_athens');
    });

    test('rejects event with "Βέροια" in title', () => {
      const event: EventLocation = {
        title: 'Concert στη Βέροια',
        venue_name: 'CineStar',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('rejected_non_athens');
    });

    test('rejects event with "Cyprus" in venue', () => {
      const event: EventLocation = {
        venue_name: 'Cyprus Monte Caputo',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('rejected_non_athens');
    });

    test('rejects event with "Patras" in venue', () => {
      const event: EventLocation = {
        venue_name: 'Patras Stadium',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('rejected_non_athens');
    });

    test('rejects specific non-Athens venue from config', () => {
      const event: EventLocation = {
        venue_name: 'Principal Mylos Complex',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('rejected_non_athens');
      expect(result.rejection_reason).toContain('Thessaloniki');
    });
  });

  // =========================================================================
  // Problematic Entry Tests
  // =========================================================================

  describe('Problematic Entries', () => {
    test('flags TBA as problematic', () => {
      const event: EventLocation = {
        venue_name: 'TBA',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('problematic');
      expect(result.rejection_reason).toContain('To Be Announced');
    });

    test('flags "Live Music Venue" as problematic', () => {
      const event: EventLocation = {
        venue_name: 'Live Music Venue',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('problematic');
      expect(result.rejection_reason).toContain('Generic placeholder');
    });

    test('flags "Live Music Space" as problematic', () => {
      const event: EventLocation = {
        venue_name: 'Live Music Space',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('problematic');
    });
  });

  // =========================================================================
  // Pass-Through Tests
  // =========================================================================

  describe('Pass-Through Venues', () => {
    test('allows "Πολλαπλοί Χώροι" as pass-through', () => {
      const event: EventLocation = {
        venue_name: 'Πολλαπλοί Χώροι',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('pass_through');
    });

    test('allows "Multiple Venues" as pass-through', () => {
      const event: EventLocation = {
        venue_name: 'Multiple Venues',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('pass_through');
    });
  });

  // =========================================================================
  // Unknown Venue Tests
  // =========================================================================

  describe('Unknown Venues', () => {
    test('marks unknown venue as unverified', () => {
      const event: EventLocation = {
        venue_name: 'Some Random New Venue XYZ',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('unverified');
    });

    test('does not reject unknown venue (conservative approach)', () => {
      const event: EventLocation = {
        venue_name: 'Unknown Place',
      };
      const result = checkLocation(event);
      expect(result.status).not.toBe('rejected_non_athens');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    test('handles empty venue name', () => {
      const event: EventLocation = {
        venue_name: '',
      };
      const result = checkLocation(event);
      expect(result.status).toBe('unverified');
    });

    test('handles missing venue name', () => {
      const event: EventLocation = {};
      const result = checkLocation(event);
      expect(result.status).toBe('unverified');
    });

    test('blacklist overrides whitelist if city mentioned in title', () => {
      // Even if venue looks like Athens, explicit non-Athens city rejects
      const event: EventLocation = {
        title: 'Event in Thessaloniki',
        venue_name: 'Gazarte', // Athens venue
      };
      const result = checkLocation(event);
      expect(result.status).toBe('rejected_non_athens');
    });
  });
});

// =============================================================================
// Convenience Function Tests
// =============================================================================

describe('Convenience Functions', () => {
  test('shouldShowOnSite returns true for verified_athens', () => {
    const event: EventLocation = { venue_name: 'Gazarte' };
    expect(shouldShowOnSite(event)).toBe(true);
  });

  test('shouldShowOnSite returns true for pass_through', () => {
    const event: EventLocation = { venue_name: 'Multiple Venues' };
    expect(shouldShowOnSite(event)).toBe(true);
  });

  test('shouldShowOnSite returns false for rejected_non_athens', () => {
    const event: EventLocation = { venue_name: 'Thessaloniki Arena' };
    expect(shouldShowOnSite(event)).toBe(false);
  });

  test('shouldShowOnSite returns false for unverified', () => {
    const event: EventLocation = { venue_name: 'Unknown Place XYZ' };
    expect(shouldShowOnSite(event)).toBe(false);
  });

  test('shouldShowOnSite returns false for problematic', () => {
    const event: EventLocation = { venue_name: 'TBA' };
    expect(shouldShowOnSite(event)).toBe(false);
  });

  test('shouldReject returns true only for rejected_non_athens', () => {
    expect(shouldReject({ venue_name: 'Thessaloniki Arena' })).toBe(true);
    expect(shouldReject({ venue_name: 'Gazarte' })).toBe(false);
    expect(shouldReject({ venue_name: 'TBA' })).toBe(false);
  });

  test('filterForSite filters correctly', () => {
    const events: EventLocation[] = [
      { venue_name: 'Gazarte' },            // verified_athens
      { venue_name: 'Multiple Venues' },     // pass_through
      { venue_name: 'Thessaloniki Arena' },  // rejected
      { venue_name: 'TBA' },                 // problematic
      { venue_name: 'Unknown XYZ' },         // unverified
    ];

    const filtered = filterForSite(events);
    expect(filtered.length).toBe(2); // Only verified + pass_through
  });

  test('categorizeEvents separates by status', () => {
    const events: EventLocation[] = [
      { venue_name: 'Gazarte' },
      { venue_name: 'Multiple Venues' },
      { venue_name: 'Thessaloniki Arena' },
      { venue_name: 'TBA' },
      { venue_name: 'Unknown XYZ' },
    ];

    const categorized = categorizeEvents(events);
    expect(categorized.verified.length).toBe(1);
    expect(categorized.passThrough.length).toBe(1);
    expect(categorized.rejected.length).toBe(1);
    expect(categorized.problematic.length).toBe(1);
    expect(categorized.unverified.length).toBe(1);
  });

  test('getFilterStats returns correct counts', () => {
    const events: EventLocation[] = [
      { venue_name: 'Gazarte' },
      { venue_name: 'Six D.O.G.S' },
      { venue_name: 'Multiple Venues' },
      { venue_name: 'Thessaloniki' },
    ];

    const stats = getFilterStats(events);
    expect(stats.total).toBe(4);
    expect(stats.verified).toBe(2);
    expect(stats.passThrough).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.showOnSite).toBe(3);
  });
});

// =============================================================================
// LocationResult Structure Tests
// =============================================================================

describe('LocationResult Structure', () => {
  test('result includes original_venue', () => {
    const event: EventLocation = { venue_name: 'Gazarte - Ground Stage' };
    const result = checkLocation(event);
    expect(result.original_venue).toBe('Gazarte - Ground Stage');
  });

  test('result includes matched_venue for whitelist match', () => {
    const event: EventLocation = { venue_name: 'GAZARTE' };
    const result = checkLocation(event);
    expect(result.matched_venue).toBe('Gazarte');
  });

  test('result includes rejection_reason for rejected', () => {
    const event: EventLocation = { venue_name: 'Thessaloniki Concert Hall' };
    const result = checkLocation(event);
    expect(result.rejection_reason).toBeDefined();
  });
});
