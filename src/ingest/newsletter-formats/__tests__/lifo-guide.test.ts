/**
 * Task 4.5: Lifo Guide Parser Tests
 *
 * Tests for parsing Lifo Guide newsletter emails (Greek)
 * Per spec: Extract events from Lifo Guide newsletter format
 *
 * @see specs/001-data-pipeline/tasks.md (Task 4.5)
 * @see src/ingest/newsletter-formats/lifo-guide.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseLifoGuideEmail,
  parseGreekDate,
  parseLifoTime,
  type ParsedEvent,
  type EmailContent,
  type ParseResult,
} from '../lifo-guide';

// ============================================================================
// Test Fixtures
// ============================================================================

function loadSampleEmail(): EmailContent {
  const fixturePath = join(
    process.cwd(),
    'tests/fixtures/sample-emails/lifo-guide-sample.json'
  );
  const content = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// Tests
// ============================================================================

describe('Lifo Guide Parser', () => {
  let sampleEmail: EmailContent;

  beforeEach(() => {
    sampleEmail = loadSampleEmail();
  });

  // -------------------------------------------------------------------------
  // Basic Parsing Tests
  // -------------------------------------------------------------------------

  describe('Basic Parsing', () => {
    test('parses sample email successfully', () => {
      const result = parseLifoGuideEmail(sampleEmail);

      expect(result.success).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    test('extracts expected number of events', () => {
      const result = parseLifoGuideEmail(sampleEmail);

      // Sample has 4 events: 2 concerts, 1 theater, 1 exhibition
      expect(result.events.length).toBe(4);
    });

    test('sets source to lifo-guide', () => {
      const result = parseLifoGuideEmail(sampleEmail);

      for (const event of result.events) {
        expect(event.source).toBe('lifo-guide');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Greek Content Tests
  // -------------------------------------------------------------------------

  describe('Greek Content Handling', () => {
    test('extracts Greek event titles', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const titles = result.events.map(e => e.title);

      expect(titles).toContain('Αλκίνοος Ιωαννίδης');
    });

    test('extracts venue from @ notation', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const alkinoos = result.events.find(e => e.title.includes('Αλκίνοος'));

      expect(alkinoos?.venue).toBe('Μέγαρο Μουσικής');
    });

    test('handles Greek quotes in titles', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const glaros = result.events.find(e => e.title.includes('Γλάρος'));

      expect(glaros).toBeDefined();
    });

    test('extracts Greek venue names', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const exhibition = result.events.find(e => e.type === 'exhibition');

      expect(exhibition?.venue).toContain('EMST');
    });
  });

  // -------------------------------------------------------------------------
  // Event Type Detection Tests
  // -------------------------------------------------------------------------

  describe('Event Type Detection', () => {
    test('detects concert type from ΣΥΝΑΥΛΙΕΣ section', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const alkinoos = result.events.find(e => e.title.includes('Αλκίνοος'));

      expect(alkinoos?.type).toBe('concert');
    });

    test('detects theater type from ΘΕΑΤΡΟ section', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const glaros = result.events.find(e => e.title.includes('Γλάρος'));

      expect(glaros?.type).toBe('theater');
    });

    test('detects exhibition type from ΕΚΘΕΣΕΙΣ section', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const art = result.events.find(e => e.title.includes('Ελληνική Τέχνη'));

      expect(art?.type).toBe('exhibition');
    });
  });

  // -------------------------------------------------------------------------
  // Date Parsing Tests
  // -------------------------------------------------------------------------

  describe('Date Parsing', () => {
    test('parses "Σάββατο 25/01" format', () => {
      const parsed = parseGreekDate('Σάββατο 25/01');
      expect(parsed).toBe('2025-01-25');
    });

    test('parses "Παρασκευή 24/01" format', () => {
      const parsed = parseGreekDate('Παρασκευή 24/01');
      expect(parsed).toBe('2025-01-24');
    });

    test('parses "Έως 28/02/2025" format', () => {
      const parsed = parseGreekDate('Έως 28/02/2025');
      expect(parsed).toBe('2025-02-28');
    });

    test('parses "25/01/2025" format', () => {
      const parsed = parseGreekDate('25/01/2025');
      expect(parsed).toBe('2025-01-25');
    });
  });

  // -------------------------------------------------------------------------
  // Time Parsing Tests
  // -------------------------------------------------------------------------

  describe('Time Parsing', () => {
    test('parses "21:00" format', () => {
      const parsed = parseLifoTime('21:00');
      expect(parsed).toBe('21:00');
    });

    test('parses "10:00-20:00" format (uses start time)', () => {
      const parsed = parseLifoTime('10:00-20:00');
      expect(parsed).toBe('10:00');
    });
  });

  // -------------------------------------------------------------------------
  // Price Detection Tests
  // -------------------------------------------------------------------------

  describe('Price Detection', () => {
    test('detects with-ticket for priced events', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const alkinoos = result.events.find(e => e.title.includes('Αλκίνοος'));

      expect(alkinoos?.price).toBe('with-ticket');
    });

    test('extracts price details', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const alkinoos = result.events.find(e => e.title.includes('Αλκίνοος'));

      expect(alkinoos?.priceDetails).toContain('€25');
    });

    test('detects open for free events (Ελεύθερη είσοδος)', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const art = result.events.find(e => e.title.includes('Ελληνική Τέχνη'));

      expect(art?.price).toBe('open');
    });
  });

  // -------------------------------------------------------------------------
  // Text Parsing Fallback Tests
  // -------------------------------------------------------------------------

  describe('Text Parsing Fallback', () => {
    test('parses text content when HTML is empty', () => {
      const textOnlyEmail: EmailContent = {
        ...sampleEmail,
        html: '',
      };

      const result = parseLifoGuideEmail(textOnlyEmail);

      expect(result.success).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });

    test('extracts events from Greek plain text', () => {
      const textOnlyEmail: EmailContent = {
        ...sampleEmail,
        html: '',
      };

      const result = parseLifoGuideEmail(textOnlyEmail);
      const titles = result.events.map(e => e.title);

      expect(titles.some(t => t.includes('Αλκίνοος'))).toBe(true);
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

      const result = parseLifoGuideEmail(emptyEmail);

      expect(result.success).toBe(false);
      expect(result.events).toEqual([]);
      expect(result.errors.length).toBe(0);
    });

    test('handles malformed HTML gracefully', () => {
      const malformedEmail: EmailContent = {
        ...sampleEmail,
        html: '<div class="section"><article class="event-item"><h3>Incomplete',
        text: '',
      };

      const result = parseLifoGuideEmail(malformedEmail);

      expect(result.errors.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    test('handles mixed Greek/English content', () => {
      const result = parseLifoGuideEmail(sampleEmail);
      const jazz = result.events.find(e => e.title.includes('Jazz'));

      expect(jazz).toBeDefined();
      expect(jazz?.venue).toContain('Half Note');
    });

    test('handles events without explicit venue', () => {
      const result = parseLifoGuideEmail(sampleEmail);

      // All events should have some venue
      for (const event of result.events) {
        expect(event.venue).toBeDefined();
      }
    });

    test('preserves event order from email', () => {
      const result = parseLifoGuideEmail(sampleEmail);

      // First concert should be Alkinoos
      const concerts = result.events.filter(e => e.type === 'concert');
      expect(concerts[0].title).toContain('Αλκίνοος');
    });
  });
});
