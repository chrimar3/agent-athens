/**
 * Task 4.3: This Is Athens Parser Tests
 *
 * Tests for parsing This Is Athens newsletter emails
 * Per spec: Extract events from This Is Athens newsletter format
 *
 * @see specs/001-data-pipeline/tasks.md (Task 4.3)
 * @see src/ingest/newsletter-formats/this-is-athens.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseThisIsAthensEmail,
  parseDateString,
  parseTimeString,
  determineEventType,
  type ParsedEvent,
  type EmailContent,
  type ParseResult,
} from '../this-is-athens';

// ============================================================================
// Test Fixtures
// ============================================================================

function loadSampleEmail(): EmailContent {
  const fixturePath = join(
    process.cwd(),
    'tests/fixtures/sample-emails/this-is-athens-sample.json'
  );
  const content = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// Tests
// ============================================================================

describe('This Is Athens Parser', () => {
  let sampleEmail: EmailContent;

  beforeEach(() => {
    sampleEmail = loadSampleEmail();
  });

  // -------------------------------------------------------------------------
  // Basic Parsing Tests
  // -------------------------------------------------------------------------

  describe('Basic Parsing', () => {
    test('parses sample email successfully', () => {
      const result = parseThisIsAthensEmail(sampleEmail);

      expect(result.success).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    test('extracts expected number of events', () => {
      const result = parseThisIsAthensEmail(sampleEmail);

      // Sample has 4 events: 2 concerts, 1 theater, 1 exhibition
      expect(result.events.length).toBe(4);
    });

    test('sets source to this-is-athens', () => {
      const result = parseThisIsAthensEmail(sampleEmail);

      for (const event of result.events) {
        expect(event.source).toBe('this-is-athens');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Event Field Extraction Tests
  // -------------------------------------------------------------------------

  describe('Event Field Extraction', () => {
    test('extracts event title correctly', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const titles = result.events.map(e => e.title);

      expect(titles).toContain('Marina Satti Live');
      expect(titles).toContain('Jazz Night at Half Note');
    });

    test('extracts venue correctly', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const marinaSatti = result.events.find(e => e.title === 'Marina Satti Live');

      expect(marinaSatti?.venue).toBe('Gazarte');
    });

    test('extracts date in YYYY-MM-DD format', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const marinaSatti = result.events.find(e => e.title === 'Marina Satti Live');

      expect(marinaSatti?.date).toBe('2025-01-25');
    });

    test('extracts time in HH:MM format', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const marinaSatti = result.events.find(e => e.title === 'Marina Satti Live');

      expect(marinaSatti?.time).toBe('21:00');
    });

    test('extracts price details', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const marinaSatti = result.events.find(e => e.title === 'Marina Satti Live');

      expect(marinaSatti?.priceDetails).toContain('€20');
    });

    test('extracts description', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const marinaSatti = result.events.find(e => e.title === 'Marina Satti Live');

      expect(marinaSatti?.description).toContain('Greek artist');
    });
  });

  // -------------------------------------------------------------------------
  // Event Type Detection Tests
  // -------------------------------------------------------------------------

  describe('Event Type Detection', () => {
    test('detects concert type', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const marinaSatti = result.events.find(e => e.title === 'Marina Satti Live');

      expect(marinaSatti?.type).toBe('concert');
    });

    test('detects theater type', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const glassMenugerie = result.events.find(e => e.title === 'The Glass Menagerie');

      expect(glassMenugerie?.type).toBe('theater');
    });

    test('detects exhibition type', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const modernArt = result.events.find(e => e.title === 'Modern Greek Art');

      expect(modernArt?.type).toBe('exhibition');
    });
  });

  // -------------------------------------------------------------------------
  // Price Type Detection Tests
  // -------------------------------------------------------------------------

  describe('Price Type Detection', () => {
    test('detects with-ticket for priced events', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const marinaSatti = result.events.find(e => e.title === 'Marina Satti Live');

      expect(marinaSatti?.price).toBe('with-ticket');
    });

    test('detects open for free events', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const modernArt = result.events.find(e => e.title === 'Modern Greek Art');

      // Has "Free entry on Sundays"
      expect(modernArt?.price).toBe('open');
    });
  });

  // -------------------------------------------------------------------------
  // Date Parsing Tests
  // -------------------------------------------------------------------------

  describe('Date Parsing', () => {
    test('parses "Saturday, January 25, 2025" format', () => {
      const parsed = parseDateString('Saturday, January 25, 2025');
      expect(parsed).toBe('2025-01-25');
    });

    test('parses "January 20-26, 2025" format (uses start date)', () => {
      const parsed = parseDateString('January 20-26, 2025');
      expect(parsed).toBe('2025-01-20');
    });

    test('parses "Until March 15, 2025" format', () => {
      const parsed = parseDateString('Until March 15, 2025');
      expect(parsed).toBe('2025-03-15');
    });

    test('parses "Friday, January 24, 2025" format', () => {
      const parsed = parseDateString('Friday, January 24, 2025');
      expect(parsed).toBe('2025-01-24');
    });
  });

  // -------------------------------------------------------------------------
  // Time Parsing Tests
  // -------------------------------------------------------------------------

  describe('Time Parsing', () => {
    test('parses "21:00" format', () => {
      const parsed = parseTimeString('21:00');
      expect(parsed).toBe('21:00');
    });

    test('parses "10:00-18:00" format (uses start time)', () => {
      const parsed = parseTimeString('10:00-18:00');
      expect(parsed).toBe('10:00');
    });

    test('parses "22:30" format', () => {
      const parsed = parseTimeString('22:30');
      expect(parsed).toBe('22:30');
    });
  });

  // -------------------------------------------------------------------------
  // Fallback to Text Parsing Tests
  // -------------------------------------------------------------------------

  describe('Text Parsing Fallback', () => {
    test('parses text content when HTML is empty', () => {
      const textOnlyEmail: EmailContent = {
        ...sampleEmail,
        html: '',
      };

      const result = parseThisIsAthensEmail(textOnlyEmail);

      expect(result.success).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });

    test('extracts events from plain text', () => {
      const textOnlyEmail: EmailContent = {
        ...sampleEmail,
        html: '',
      };

      const result = parseThisIsAthensEmail(textOnlyEmail);
      const titles = result.events.map(e => e.title);

      expect(titles).toContain('Marina Satti Live');
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    test('handles empty email content gracefully', () => {
      const emptyEmail: EmailContent = {
        messageId: '<empty@test.com>',
        subject: 'Empty',
        from: 'test@test.com',
        date: '2025-01-20',
        text: '',
        html: '',
      };

      const result = parseThisIsAthensEmail(emptyEmail);

      expect(result.success).toBe(false);
      expect(result.events).toEqual([]);
    });

    test('handles malformed HTML gracefully', () => {
      const malformedEmail: EmailContent = {
        ...sampleEmail,
        html: '<div><h3>Incomplete event',
        text: '',
      };

      const result = parseThisIsAthensEmail(malformedEmail);

      // Should not throw, but may not extract events
      expect(result.errors.length).toBe(0);
    });

    test('handles missing fields gracefully', () => {
      const minimalHtml = `
        <div class="event">
          <h3>Event Without Details</h3>
        </div>
      `;

      const minimalEmail: EmailContent = {
        ...sampleEmail,
        html: minimalHtml,
        text: '',
      };

      const result = parseThisIsAthensEmail(minimalEmail);

      if (result.events.length > 0) {
        const event = result.events[0];
        expect(event.title).toBe('Event Without Details');
        // Other fields should have defaults or be empty
        expect(event.venue).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    test('handles Greek characters in content', () => {
      const greekEmail: EmailContent = {
        ...sampleEmail,
        text: `
🎵 CONCERTS

Μαρίνα Σάττι Live
Date: Saturday, January 25, 2025
Time: 21:00
Venue: Γκαζάρτε
Price: €20
Η αγαπημένη Ελληνίδα καλλιτέχνις.
        `,
        html: '',
      };

      const result = parseThisIsAthensEmail(greekEmail);

      expect(result.success).toBe(true);
      if (result.events.length > 0) {
        expect(result.events[0].title).toBe('Μαρίνα Σάττι Live');
      }
    });

    test('handles multiple events of same type', () => {
      const result = parseThisIsAthensEmail(sampleEmail);
      const concerts = result.events.filter(e => e.type === 'concert');

      expect(concerts.length).toBe(2);
    });

    test('preserves event order', () => {
      const result = parseThisIsAthensEmail(sampleEmail);

      // First event should be Marina Satti (first in email)
      expect(result.events[0].title).toBe('Marina Satti Live');
    });
  });
});

// ============================================================================
// determineEventType Unit Tests
// ============================================================================

describe('determineEventType', () => {
  test('returns concert for live music context', () => {
    expect(determineEventType('Band Live', 'concert section')).toBe('concert');
  });

  test('returns theater for theater context', () => {
    expect(determineEventType('Play Name', 'theater section')).toBe('theater');
  });

  test('returns exhibition for museum context', () => {
    expect(determineEventType('Art Show', 'museum exhibition')).toBe('exhibition');
  });

  test('returns performance as default', () => {
    expect(determineEventType('Unknown Event', 'unknown context')).toBe('performance');
  });
});
