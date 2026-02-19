/**
 * Task 4.1: Newsletter Format Registry Tests
 *
 * Tests for newsletter format loading and matching
 * Per spec: Match incoming emails to known newsletter formats
 *
 * @see specs/001-data-pipeline/tasks.md (Task 4.1)
 * @see src/ingest/newsletter-formats/index.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  NewsletterFormatRegistry,
  type NewsletterFormat,
  type FormatMatch,
} from '../index';

// ============================================================================
// Test Fixtures
// ============================================================================

const sampleFormats: NewsletterFormat[] = [
  {
    id: 'this-is-athens',
    name: 'This Is Athens',
    senders: ['newsletter@thisisathens.org', 'events@thisisathens.org'],
    subjectPatterns: ['This Week in Athens', 'Athens Events'],
    parserModule: './this-is-athens',
    enabled: true,
    priority: 10,
  },
  {
    id: 'lifo-guide',
    name: 'Lifo Guide',
    senders: ['guide@lifo.gr', 'newsletter@lifo.gr'],
    subjectPatterns: ['Lifo Guide', 'Εβδομαδιαίος Οδηγός'],
    parserModule: './lifo-guide',
    enabled: true,
    priority: 10,
  },
  {
    id: 'athinorama',
    name: 'Athinorama',
    senders: ['weekly@athinorama.gr'],
    subjectPatterns: ['Athinorama Weekly', 'Αθηνόραμα'],
    parserModule: './athinorama',
    enabled: true,
    priority: 5,
  },
  {
    id: 'disabled-format',
    name: 'Disabled Newsletter',
    senders: ['disabled@example.com'],
    subjectPatterns: ['Disabled'],
    parserModule: './disabled',
    enabled: false,
    priority: 1,
  },
];

// ============================================================================
// Tests
// ============================================================================

describe('Newsletter Format Registry', () => {
  let registry: NewsletterFormatRegistry;

  beforeEach(() => {
    registry = new NewsletterFormatRegistry();
    registry.loadFormats(sampleFormats);
  });

  // -------------------------------------------------------------------------
  // Loading Tests
  // -------------------------------------------------------------------------

  describe('Format Loading', () => {
    test('loads formats from array', () => {
      const formats = registry.getFormats();
      expect(formats.length).toBeGreaterThan(0);
    });

    test('filters out disabled formats', () => {
      const formats = registry.getFormats();
      const disabledFormat = formats.find(f => f.id === 'disabled-format');
      expect(disabledFormat).toBeUndefined();
    });

    test('sorts formats by priority (highest first)', () => {
      const formats = registry.getFormats();
      expect(formats[0].priority).toBeGreaterThanOrEqual(formats[1].priority);
    });

    test('can retrieve format by ID', () => {
      const format = registry.getFormatById('this-is-athens');
      expect(format).toBeDefined();
      expect(format?.name).toBe('This Is Athens');
    });

    test('returns undefined for unknown format ID', () => {
      const format = registry.getFormatById('unknown-format');
      expect(format).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Sender Matching Tests
  // -------------------------------------------------------------------------

  describe('Sender Matching', () => {
    test('matches email to format by sender', () => {
      const match = registry.matchBySender('newsletter@thisisathens.org');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
      expect(match?.matchedBy).toBe('sender');
    });

    test('matches email with display name', () => {
      const match = registry.matchBySender('This Is Athens <newsletter@thisisathens.org>');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
    });

    test('matches case-insensitively', () => {
      const match = registry.matchBySender('NEWSLETTER@THISISATHENS.ORG');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
    });

    test('matches Lifo Guide sender', () => {
      const match = registry.matchBySender('guide@lifo.gr');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('lifo-guide');
    });

    test('returns null for unknown sender', () => {
      const match = registry.matchBySender('unknown@example.com');
      expect(match).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Subject Matching Tests
  // -------------------------------------------------------------------------

  describe('Subject Matching', () => {
    test('matches email to format by subject pattern', () => {
      const match = registry.matchBySubject('This Week in Athens - January 2025');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
      expect(match?.matchedBy).toBe('subject');
    });

    test('matches Greek subject pattern', () => {
      const match = registry.matchBySubject('Lifo Guide - Εβδομαδιαίος Οδηγός');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('lifo-guide');
    });

    test('matches case-insensitively', () => {
      const match = registry.matchBySubject('THIS WEEK IN ATHENS');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
    });

    test('matches partial subject', () => {
      const match = registry.matchBySubject('Re: Athens Events Update');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
    });

    test('returns null for unknown subject', () => {
      const match = registry.matchBySubject('Random Newsletter Subject');
      expect(match).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Combined Matching Tests
  // -------------------------------------------------------------------------

  describe('Combined Matching', () => {
    test('prefers sender match over subject match', () => {
      // Email from This Is Athens with Lifo subject
      const match = registry.match(
        'newsletter@thisisathens.org',
        'Lifo Guide Weekly'
      );

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
      expect(match?.matchedBy).toBe('sender');
    });

    test('falls back to subject when sender unknown', () => {
      const match = registry.match(
        'unknown@forwarding.com',
        'This Week in Athens - Forwarded'
      );

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
      expect(match?.matchedBy).toBe('subject');
    });

    test('returns null when neither matches', () => {
      const match = registry.match(
        'random@example.com',
        'Unrelated Newsletter'
      );

      expect(match).toBeNull();
    });

    test('handles empty sender gracefully', () => {
      const match = registry.match('', 'This Week in Athens');

      expect(match).not.toBeNull();
      expect(match?.matchedBy).toBe('subject');
    });

    test('handles empty subject gracefully', () => {
      const match = registry.match('newsletter@thisisathens.org', '');

      expect(match).not.toBeNull();
      expect(match?.matchedBy).toBe('sender');
    });
  });

  // -------------------------------------------------------------------------
  // Priority Tests
  // -------------------------------------------------------------------------

  describe('Priority Handling', () => {
    test('higher priority format matches first when multiple could match', () => {
      // Create formats with overlapping patterns
      const overlappingFormats: NewsletterFormat[] = [
        {
          id: 'low-priority',
          name: 'Low Priority',
          senders: [],
          subjectPatterns: ['Weekly Events'],
          parserModule: './low',
          enabled: true,
          priority: 1,
        },
        {
          id: 'high-priority',
          name: 'High Priority',
          senders: [],
          subjectPatterns: ['Weekly Events'],
          parserModule: './high',
          enabled: true,
          priority: 10,
        },
      ];

      const testRegistry = new NewsletterFormatRegistry();
      testRegistry.loadFormats(overlappingFormats);

      const match = testRegistry.matchBySubject('Weekly Events Guide');

      expect(match?.format.id).toBe('high-priority');
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    test('handles empty formats array', () => {
      const emptyRegistry = new NewsletterFormatRegistry();
      emptyRegistry.loadFormats([]);

      expect(emptyRegistry.getFormats()).toEqual([]);
      expect(emptyRegistry.match('test@test.com', 'Test')).toBeNull();
    });

    test('handles special characters in subject', () => {
      const match = registry.matchBySubject('This Week in Athens [50% Off!]');

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
    });

    test('handles Unicode in sender', () => {
      // Add a format with Unicode sender
      const unicodeFormats: NewsletterFormat[] = [
        {
          id: 'greek-venue',
          name: 'Greek Venue',
          senders: ['εκδηλώσεις@venue.gr'],
          subjectPatterns: [],
          parserModule: './greek',
          enabled: true,
          priority: 5,
        },
      ];

      const testRegistry = new NewsletterFormatRegistry();
      testRegistry.loadFormats(unicodeFormats);

      const match = testRegistry.matchBySender('Greek Venue <εκδηλώσεις@venue.gr>');
      expect(match).not.toBeNull();
    });

    test('handles very long subject', () => {
      const longSubject = 'This Week in Athens - ' + 'A'.repeat(1000);
      const match = registry.matchBySubject(longSubject);

      expect(match).not.toBeNull();
      expect(match?.format.id).toBe('this-is-athens');
    });
  });
});

// ============================================================================
// Config File Loading Tests
// ============================================================================

describe('Newsletter Format Config Loading', () => {
  test('loads formats from config file', () => {
    const registry = new NewsletterFormatRegistry();
    registry.loadFromConfig('config/newsletter-formats.json');

    expect(registry.hasFormats()).toBe(true);
    expect(registry.getFormatCount()).toBeGreaterThan(0);
  });

  test('includes This Is Athens format in config', () => {
    const registry = new NewsletterFormatRegistry();
    registry.loadFromConfig('config/newsletter-formats.json');

    const format = registry.getFormatById('this-is-athens');
    expect(format).toBeDefined();
    expect(format?.name).toBe('This Is Athens');
  });

  test('includes Lifo Guide format in config', () => {
    const registry = new NewsletterFormatRegistry();
    registry.loadFromConfig('config/newsletter-formats.json');

    const format = registry.getFormatById('lifo-guide');
    expect(format).toBeDefined();
    expect(format?.name).toBe('Lifo Guide');
  });

  test('handles missing config file gracefully', () => {
    const registry = new NewsletterFormatRegistry();
    registry.loadFromConfig('config/nonexistent.json');

    expect(registry.hasFormats()).toBe(false);
    expect(registry.getFormatCount()).toBe(0);
  });
});
