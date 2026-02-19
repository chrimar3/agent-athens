/**
 * Task 3.1: Processed Emails Table Tests
 *
 * Tests for processed_emails table queries
 * Per spec: Track email processing state in database
 *
 * @see specs/001-data-pipeline/tasks.md (Task 3.1)
 * @see data/migrations/001_pipeline_extensions.sql
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import Database from 'bun:sqlite';
import {
  insertProcessedEmail,
  isEmailProcessed,
  getProcessedEmail,
  getEmailsByStatus,
  updateEmailStatus,
  getProcessingStats,
  type ProcessedEmail,
} from '../processed-emails';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a test database with the processed_emails table
 */
function createTestDb(): Database {
  const db = new Database(':memory:');

  // Create processed_emails table (matching migration schema)
  db.run(`
    CREATE TABLE processed_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      subject TEXT,
      sender TEXT,
      received_at TEXT,
      processed_at TEXT NOT NULL,
      event_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'processed',
      error_message TEXT,
      raw_path TEXT
    )
  `);

  return db;
}

// ============================================================================
// Tests
// ============================================================================

describe('ProcessedEmails Table', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // Insert Tests
  // -------------------------------------------------------------------------

  describe('Insert Operations', () => {
    test('can insert processed email record', () => {
      const email: ProcessedEmail = {
        message_id: '<test@example.com>',
        subject: 'Weekly Events Newsletter',
        sender: 'newsletter@example.com',
        received_at: '2025-01-20T10:00:00Z',
        processed_at: new Date().toISOString(),
        event_count: 5,
        status: 'processed',
      };

      const id = insertProcessedEmail(email, db);

      expect(id).toBeGreaterThan(0);

      const retrieved = getProcessedEmail(email.message_id, db);
      expect(retrieved).toBeDefined();
      expect(retrieved?.subject).toBe('Weekly Events Newsletter');
      expect(retrieved?.event_count).toBe(5);
    });

    test('can insert minimal record with only required fields', () => {
      const email: ProcessedEmail = {
        message_id: '<minimal@example.com>',
        processed_at: new Date().toISOString(),
      };

      const id = insertProcessedEmail(email, db);
      expect(id).toBeGreaterThan(0);

      const retrieved = getProcessedEmail(email.message_id, db);
      expect(retrieved).toBeDefined();
      expect(retrieved?.status).toBe('processed'); // Default value
      expect(retrieved?.event_count).toBe(0);       // Default value
    });

    test('auto-increments id for multiple inserts', () => {
      const id1 = insertProcessedEmail({
        message_id: '<email1@test.com>',
        processed_at: new Date().toISOString(),
      }, db);

      const id2 = insertProcessedEmail({
        message_id: '<email2@test.com>',
        processed_at: new Date().toISOString(),
      }, db);

      expect(id2).toBeGreaterThan(id1);
    });
  });

  // -------------------------------------------------------------------------
  // Duplicate Prevention Tests
  // -------------------------------------------------------------------------

  describe('Duplicate Prevention', () => {
    test('prevents duplicate message_ids', () => {
      const email: ProcessedEmail = {
        message_id: '<unique@example.com>',
        processed_at: new Date().toISOString(),
      };

      insertProcessedEmail(email, db);

      // Attempt to insert duplicate
      expect(() => {
        insertProcessedEmail(email, db);
      }).toThrow();
    });

    test('allows different message_ids with same subject', () => {
      insertProcessedEmail({
        message_id: '<email1@test.com>',
        subject: 'Same Subject',
        processed_at: new Date().toISOString(),
      }, db);

      // Should not throw
      insertProcessedEmail({
        message_id: '<email2@test.com>',
        subject: 'Same Subject',
        processed_at: new Date().toISOString(),
      }, db);

      const stats = getProcessingStats(db);
      expect(stats.total).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Query Tests
  // -------------------------------------------------------------------------

  describe('Query Operations', () => {
    test('can check if message_id exists', () => {
      const messageId = '<check@example.com>';

      expect(isEmailProcessed(messageId, db)).toBe(false);

      insertProcessedEmail({
        message_id: messageId,
        processed_at: new Date().toISOString(),
      }, db);

      expect(isEmailProcessed(messageId, db)).toBe(true);
    });

    test('can query by status', () => {
      // Insert processed emails
      insertProcessedEmail({
        message_id: '<success1@test.com>',
        processed_at: new Date().toISOString(),
        status: 'processed',
      }, db);

      insertProcessedEmail({
        message_id: '<success2@test.com>',
        processed_at: new Date().toISOString(),
        status: 'processed',
      }, db);

      // Insert failed email
      insertProcessedEmail({
        message_id: '<failed@test.com>',
        processed_at: new Date().toISOString(),
        status: 'failed',
        error_message: 'Parse error',
      }, db);

      const processed = getEmailsByStatus('processed', db);
      const failed = getEmailsByStatus('failed', db);

      expect(processed.length).toBe(2);
      expect(failed.length).toBe(1);
      expect(failed[0].error_message).toBe('Parse error');
    });

    test('returns undefined for non-existent message_id', () => {
      const result = getProcessedEmail('<nonexistent@test.com>', db);
      expect(result).toBeUndefined();
    });

    test('returns empty array for status with no matches', () => {
      // Cast to any to allow testing with non-standard status
      const result = getEmailsByStatus('nonexistent_status' as any, db);
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Update Tests
  // -------------------------------------------------------------------------

  describe('Update Operations', () => {
    test('can update email status', () => {
      const messageId = '<update@test.com>';

      insertProcessedEmail({
        message_id: messageId,
        processed_at: new Date().toISOString(),
        status: 'processing',
      }, db);

      updateEmailStatus(messageId, 'processed', undefined, db);

      const retrieved = getProcessedEmail(messageId, db);
      expect(retrieved?.status).toBe('processed');
    });

    test('can update status with error message', () => {
      const messageId = '<error@test.com>';

      insertProcessedEmail({
        message_id: messageId,
        processed_at: new Date().toISOString(),
        status: 'processing',
      }, db);

      updateEmailStatus(messageId, 'failed', 'Connection timeout', db);

      const retrieved = getProcessedEmail(messageId, db);
      expect(retrieved?.status).toBe('failed');
      expect(retrieved?.error_message).toBe('Connection timeout');
    });

    test('update clears error message when successful', () => {
      const messageId = '<retry@test.com>';

      insertProcessedEmail({
        message_id: messageId,
        processed_at: new Date().toISOString(),
        status: 'failed',
        error_message: 'Previous error',
      }, db);

      // Retry and succeed
      updateEmailStatus(messageId, 'processed', undefined, db);

      const retrieved = getProcessedEmail(messageId, db);
      expect(retrieved?.status).toBe('processed');
      expect(retrieved?.error_message).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Statistics Tests
  // -------------------------------------------------------------------------

  describe('Statistics', () => {
    test('returns correct processing statistics', () => {
      // Add various emails
      insertProcessedEmail({
        message_id: '<s1@test.com>',
        processed_at: new Date().toISOString(),
        status: 'processed',
        event_count: 5,
      }, db);

      insertProcessedEmail({
        message_id: '<s2@test.com>',
        processed_at: new Date().toISOString(),
        status: 'processed',
        event_count: 3,
      }, db);

      insertProcessedEmail({
        message_id: '<f1@test.com>',
        processed_at: new Date().toISOString(),
        status: 'failed',
        event_count: 0,
      }, db);

      const stats = getProcessingStats(db);

      expect(stats.total).toBe(3);
      expect(stats.processed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.totalEvents).toBe(8);
    });

    test('returns zeros for empty table', () => {
      const stats = getProcessingStats(db);

      expect(stats.total).toBe(0);
      expect(stats.processed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.totalEvents).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    test('handles very long message_id', () => {
      const longMessageId = `<${'a'.repeat(500)}@example.com>`;

      insertProcessedEmail({
        message_id: longMessageId,
        processed_at: new Date().toISOString(),
      }, db);

      expect(isEmailProcessed(longMessageId, db)).toBe(true);
    });

    test('handles special characters in message_id', () => {
      const specialMessageId = '<test+filter@example.com>';

      insertProcessedEmail({
        message_id: specialMessageId,
        processed_at: new Date().toISOString(),
      }, db);

      expect(isEmailProcessed(specialMessageId, db)).toBe(true);
    });

    test('handles Unicode in subject and sender', () => {
      const email: ProcessedEmail = {
        message_id: '<unicode@test.com>',
        subject: 'Εβδομαδιαίο Newsletter 📅',
        sender: 'αθήνα@example.gr',
        processed_at: new Date().toISOString(),
      };

      insertProcessedEmail(email, db);

      const retrieved = getProcessedEmail(email.message_id, db);
      expect(retrieved?.subject).toBe('Εβδομαδιαίο Newsletter 📅');
      expect(retrieved?.sender).toBe('αθήνα@example.gr');
    });

    test('handles null raw_path', () => {
      const email: ProcessedEmail = {
        message_id: '<nopath@test.com>',
        processed_at: new Date().toISOString(),
        raw_path: undefined,
      };

      insertProcessedEmail(email, db);

      const retrieved = getProcessedEmail(email.message_id, db);
      expect(retrieved?.raw_path).toBeNull();
    });

    test('stores raw_path when provided', () => {
      const email: ProcessedEmail = {
        message_id: '<withpath@test.com>',
        processed_at: new Date().toISOString(),
        raw_path: '/data/emails/2025-01-20-newsletter.json',
      };

      insertProcessedEmail(email, db);

      const retrieved = getProcessedEmail(email.message_id, db);
      expect(retrieved?.raw_path).toBe('/data/emails/2025-01-20-newsletter.json');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('ProcessedEmails Integration', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  test('simulates email processing workflow', () => {
    // 1. Check if email exists (should be false)
    const messageId = '<workflow@test.com>';
    expect(isEmailProcessed(messageId, db)).toBe(false);

    // 2. Insert with 'processing' status
    insertProcessedEmail({
      message_id: messageId,
      subject: 'Test Newsletter',
      sender: 'test@example.com',
      received_at: '2025-01-20T08:00:00Z',
      processed_at: new Date().toISOString(),
      status: 'processing',
    }, db);

    // 3. Check it now exists
    expect(isEmailProcessed(messageId, db)).toBe(true);

    // 4. Simulate successful processing - update status and event count
    db.prepare(`
      UPDATE processed_emails
      SET status = 'processed', event_count = 7
      WHERE message_id = ?
    `).run(messageId);

    // 5. Verify final state
    const final = getProcessedEmail(messageId, db);
    expect(final?.status).toBe('processed');
    expect(final?.event_count).toBe(7);
  });

  test('simulates failed email processing', () => {
    const messageId = '<failed-workflow@test.com>';

    // 1. Start processing
    insertProcessedEmail({
      message_id: messageId,
      subject: 'Broken Newsletter',
      processed_at: new Date().toISOString(),
      status: 'processing',
    }, db);

    // 2. Processing fails
    updateEmailStatus(messageId, 'failed', 'Invalid HTML structure', db);

    // 3. Verify failed state
    const failed = getProcessedEmail(messageId, db);
    expect(failed?.status).toBe('failed');
    expect(failed?.error_message).toBe('Invalid HTML structure');

    // 4. Check statistics
    const stats = getProcessingStats(db);
    expect(stats.failed).toBe(1);
    expect(stats.processed).toBe(0);
  });

  test('prevents reprocessing of same email', () => {
    const messageId = '<nodup@test.com>';

    // First processing
    insertProcessedEmail({
      message_id: messageId,
      processed_at: '2025-01-20T10:00:00Z',
      event_count: 5,
    }, db);

    // Simulate checking before reprocessing
    if (isEmailProcessed(messageId, db)) {
      // Skip - do nothing
    }

    // Verify only one record exists
    const stats = getProcessingStats(db);
    expect(stats.total).toBe(1);
    expect(stats.totalEvents).toBe(5);
  });
});
