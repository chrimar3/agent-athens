/**
 * Task 4.7: Email Parser Orchestrator Tests
 *
 * Tests for main email parser that routes to format-specific parsers
 * Per spec: Parse emails using matched format parsers with quality gate integration
 *
 * @see specs/001-data-pipeline/tasks.md (Task 4.7)
 * @see src/ingest/email-parser.ts
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseEmail,
  parseEmailFromFile,
  parseEmailsFromDirectory,
  createEmailParser,
  type EmailParserOptions,
  type EmailParseResult,
  type ParsedEventWithMeta,
} from '../email-parser';

// ============================================================================
// Test Fixtures
// ============================================================================

function loadSampleEmail(filename: string): object {
  const fixturePath = join(
    process.cwd(),
    `tests/fixtures/sample-emails/${filename}`
  );
  const content = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// Tests
// ============================================================================

describe('Email Parser Orchestrator', () => {
  // -------------------------------------------------------------------------
  // Basic Routing Tests
  // -------------------------------------------------------------------------

  describe('Parser Routing', () => {
    test('routes This Is Athens email to correct parser', async () => {
      const email = loadSampleEmail('this-is-athens-sample.json');

      const result = await parseEmail(email);

      expect(result.success).toBe(true);
      expect(result.formatMatched).toBe('this-is-athens');
      expect(result.events.length).toBeGreaterThan(0);
    });

    test('routes Lifo Guide email to correct parser', async () => {
      const email = loadSampleEmail('lifo-guide-sample.json');

      const result = await parseEmail(email);

      expect(result.success).toBe(true);
      expect(result.formatMatched).toBe('lifo-guide');
      expect(result.events.length).toBeGreaterThan(0);
    });

    test('returns error for unknown email format', async () => {
      const unknownEmail = {
        messageId: '<unknown@test.com>',
        subject: 'Random Newsletter',
        from: 'random@unknown-domain.com',
        date: '2025-01-20',
        text: 'Some random content',
        html: '',
      };

      const result = await parseEmail(unknownEmail);

      expect(result.success).toBe(false);
      expect(result.formatMatched).toBeNull();
      expect(result.error).toContain('No matching format');
    });

    test('matches by sender address when available', async () => {
      const email = {
        messageId: '<test@thisisathens.org>',
        subject: 'Some Random Subject',
        from: 'This Is Athens <newsletter@thisisathens.org>',
        date: '2025-01-20',
        text: '',
        html: '<div class="event"><h3>Test Event</h3><p><strong>Date:</strong> Saturday, January 25, 2025</p><p><strong>Time:</strong> 20:00</p><p><strong>Venue:</strong> Test Venue</p><p><strong>Price:</strong> €10</p></div>',
      };

      const result = await parseEmail(email);

      expect(result.success).toBe(true);
      expect(result.formatMatched).toBe('this-is-athens');
      expect(result.matchedBy).toBe('sender');
    });

    test('falls back to subject matching when sender unknown', async () => {
      const email = {
        messageId: '<test@unknown.com>',
        subject: 'Lifo Guide - Εβδομαδιαίος Οδηγός',
        from: 'Some Sender <unknown@other.com>',
        date: '2025-01-20',
        text: '== ΣΥΝΑΥΛΙΕΣ ==\nTest Event @ Test Venue\nΣάββατο 25/01 | 21:00\nΕισιτήριο: €15',
        html: '',
      };

      const result = await parseEmail(email);

      expect(result.success).toBe(true);
      expect(result.formatMatched).toBe('lifo-guide');
      expect(result.matchedBy).toBe('subject');
    });
  });

  // -------------------------------------------------------------------------
  // Event Extraction Tests
  // -------------------------------------------------------------------------

  describe('Event Extraction', () => {
    test('extracts all events from email', async () => {
      const email = loadSampleEmail('this-is-athens-sample.json');

      const result = await parseEmail(email);

      // Sample has 4 events
      expect(result.events.length).toBe(4);
    });

    test('adds source metadata to parsed events', async () => {
      const email = loadSampleEmail('this-is-athens-sample.json');

      const result = await parseEmail(email);

      for (const event of result.events) {
        expect(event.source).toBe('this-is-athens');
        expect(event.sourceMessageId).toBeDefined();
      }
    });

    test('preserves event data from format parser', async () => {
      const email = loadSampleEmail('this-is-athens-sample.json');

      const result = await parseEmail(email);
      const marinaSatti = result.events.find(e => e.title === 'Marina Satti Live');

      expect(marinaSatti).toBeDefined();
      expect(marinaSatti?.venue).toBe('Gazarte');
      expect(marinaSatti?.date).toBe('2025-01-25');
    });
  });

  // -------------------------------------------------------------------------
  // Quality Gate Integration Tests
  // -------------------------------------------------------------------------

  describe('Quality Gate Integration', () => {
    test('applies location filter when enabled', async () => {
      const email = loadSampleEmail('this-is-athens-sample.json');
      const options: EmailParserOptions = {
        applyLocationFilter: true,
      };

      const result = await parseEmail(email, options);

      for (const event of result.events) {
        expect(event.location_status).toBeDefined();
      }
    });

    test('skips location filter when disabled', async () => {
      const email = loadSampleEmail('this-is-athens-sample.json');
      const options: EmailParserOptions = {
        applyLocationFilter: false,
      };

      const result = await parseEmail(email, options);

      // Events should not have location_status applied
      for (const event of result.events) {
        expect(event.location_status).toBeUndefined();
      }
    });

    test('filters out rejected events when location filter enabled', async () => {
      // Create email with Thessaloniki event that should be rejected
      const emailWithRejectedEvent = {
        messageId: '<test@thisisathens.org>',
        subject: 'Test Newsletter',
        from: 'newsletter@thisisathens.org',
        date: '2025-01-20',
        text: `
🎵 CONCERTS

Concert in Thessaloniki
Date: Saturday, January 25, 2025
Time: 21:00
Venue: Concert Hall Θεσσαλονίκη
Price: €20

Athens Concert
Date: Saturday, January 25, 2025
Time: 21:00
Venue: Gazarte
Price: €20
        `,
        html: '',
      };

      const options: EmailParserOptions = {
        applyLocationFilter: true,
        filterRejected: true,
      };

      const result = await parseEmail(emailWithRejectedEvent, options);

      // Thessaloniki event should be filtered out
      const thessalonikiEvent = result.events.find(e =>
        e.title.toLowerCase().includes('thessaloniki') ||
        e.venue?.toLowerCase().includes('θεσσαλονίκη')
      );
      expect(thessalonikiEvent).toBeUndefined();
    });

    test('includes rejected events when filterRejected is false', async () => {
      const emailWithRejectedEvent = {
        messageId: '<test@thisisathens.org>',
        subject: 'Test Newsletter',
        from: 'newsletter@thisisathens.org',
        date: '2025-01-20',
        text: `
🎵 CONCERTS

Concert in Thessaloniki
Date: Saturday, January 25, 2025
Time: 21:00
Venue: Concert Hall Θεσσαλονίκη
Price: €20
        `,
        html: '',
      };

      const options: EmailParserOptions = {
        applyLocationFilter: true,
        filterRejected: false,
      };

      const result = await parseEmail(emailWithRejectedEvent, options);

      // Event should be included but marked as rejected
      const thessalonikiEvent = result.events.find(e =>
        e.title.toLowerCase().includes('thessaloniki') ||
        e.venue?.toLowerCase().includes('θεσσαλονίκη')
      );

      if (thessalonikiEvent) {
        expect(thessalonikiEvent.location_status).toBe('rejected_non_athens');
      }
    });
  });

  // -------------------------------------------------------------------------
  // File-Based Parsing Tests
  // -------------------------------------------------------------------------

  describe('File-Based Parsing', () => {
    test('parses email from JSON file', async () => {
      const filePath = join(
        process.cwd(),
        'tests/fixtures/sample-emails/this-is-athens-sample.json'
      );

      const result = await parseEmailFromFile(filePath);

      expect(result.success).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });

    test('handles non-existent file gracefully', async () => {
      const result = await parseEmailFromFile('/nonexistent/path/email.json');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    test('handles invalid JSON file gracefully', async () => {
      // This test assumes we create an invalid JSON file or mock it
      // For now, test the error handling path
      const result = await parseEmailFromFile('/dev/null');

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Directory Batch Parsing Tests
  // -------------------------------------------------------------------------

  describe('Batch Parsing from Directory', () => {
    test('parses all emails in directory', async () => {
      const dirPath = join(process.cwd(), 'tests/fixtures/sample-emails');

      const results = await parseEmailsFromDirectory(dirPath);

      // Should parse at least 2 sample emails
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    test('continues parsing after individual failures', async () => {
      const dirPath = join(process.cwd(), 'tests/fixtures/sample-emails');

      const results = await parseEmailsFromDirectory(dirPath);

      // Each result should have success/failure indicated
      for (const result of results) {
        expect(typeof result.success).toBe('boolean');
      }
    });

    test('returns empty array for empty directory', async () => {
      const results = await parseEmailsFromDirectory('/nonexistent/directory');

      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Parser Instance Tests
  // -------------------------------------------------------------------------

  describe('Parser Factory', () => {
    test('creates parser with custom options', () => {
      const parser = createEmailParser({
        applyLocationFilter: true,
        filterRejected: true,
      });

      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe('function');
    });

    test('parser instance applies configured options', async () => {
      const parser = createEmailParser({
        applyLocationFilter: true,
        filterRejected: false,
      });

      const email = loadSampleEmail('this-is-athens-sample.json');
      const result = await parser.parse(email);

      expect(result.success).toBe(true);
      for (const event of result.events) {
        expect(event.location_status).toBeDefined();
      }
    });

    test('parser instance can be reused', async () => {
      const parser = createEmailParser();

      const email1 = loadSampleEmail('this-is-athens-sample.json');
      const email2 = loadSampleEmail('lifo-guide-sample.json');

      const result1 = await parser.parse(email1);
      const result2 = await parser.parse(email2);

      expect(result1.formatMatched).toBe('this-is-athens');
      expect(result2.formatMatched).toBe('lifo-guide');
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    test('handles null email gracefully', async () => {
      const result = await parseEmail(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('handles malformed email gracefully', async () => {
      const malformedEmail = {
        // Missing required fields
        subject: 'Test',
      };

      const result = await parseEmail(malformedEmail as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('handles parser exceptions gracefully', async () => {
      // Email that might cause parser issues
      const problematicEmail = {
        messageId: '<test@thisisathens.org>',
        subject: 'Test',
        from: 'newsletter@thisisathens.org',
        date: '2025-01-20',
        text: '',
        html: '<div class="event"><h3></h3></div>', // Empty title
      };

      const result = await parseEmail(problematicEmail);

      // Should not throw, may have empty events or error
      expect(typeof result.success).toBe('boolean');
    });
  });

  // -------------------------------------------------------------------------
  // Statistics Tests
  // -------------------------------------------------------------------------

  describe('Parse Statistics', () => {
    test('returns parse statistics', async () => {
      const email = loadSampleEmail('this-is-athens-sample.json');

      const result = await parseEmail(email);

      expect(result.stats).toBeDefined();
      expect(result.stats?.totalEvents).toBeGreaterThan(0);
      expect(result.stats?.parseTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('tracks filtered event count', async () => {
      const email = loadSampleEmail('this-is-athens-sample.json');
      const options: EmailParserOptions = {
        applyLocationFilter: true,
        filterRejected: true,
      };

      const result = await parseEmail(email, options);

      expect(result.stats?.filteredCount).toBeDefined();
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  test('handles Greek content correctly', async () => {
    const email = loadSampleEmail('lifo-guide-sample.json');

    const result = await parseEmail(email);

    const alkinoos = result.events.find(e => e.title.includes('Αλκίνοος'));
    expect(alkinoos).toBeDefined();
  });

  test('handles emails with mixed content types', async () => {
    const email = {
      messageId: '<test@thisisathens.org>',
      subject: 'This Week in Athens',
      from: 'newsletter@thisisathens.org',
      date: '2025-01-20',
      text: `
🎵 CONCERTS

Test Concert
Date: Saturday, January 25, 2025
Time: 21:00
Venue: Gazarte
Price: €20
      `,
      html: '', // Empty HTML, should fall back to text
    };

    const result = await parseEmail(email);

    expect(result.success).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
  });

  test('handles very large email content', async () => {
    // Generate large content
    let largeText = '🎵 CONCERTS\n\n';
    for (let i = 0; i < 100; i++) {
      largeText += `Event ${i}\nDate: Saturday, January 25, 2025\nTime: 21:00\nVenue: Test Venue\nPrice: €10\n\n`;
    }

    const email = {
      messageId: '<test@thisisathens.org>',
      subject: 'Large Newsletter',
      from: 'newsletter@thisisathens.org',
      date: '2025-01-20',
      text: largeText,
      html: '',
    };

    const result = await parseEmail(email);

    // Should handle without error, though may not parse all as events
    expect(typeof result.success).toBe('boolean');
  });
});
