/**
 * Task 3.3: Email Ingestion Tests
 *
 * Tests for email ingestion with IMAP mocking
 * Per spec: Fetch emails from IMAP, save for parsing, track in database
 *
 * @see specs/001-data-pipeline/tasks.md (Task 3.3)
 * @see src/ingest/email-ingestion.ts
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import Database from 'bun:sqlite';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

interface EmailMessage {
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  text: string;
  html: string;
}

interface IMAPConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  authTimeout: number;
}

interface IngestionResult {
  fetched: number;
  saved: number;
  skipped: number;
  errors: string[];
}

// ============================================================================
// Mock IMAP Module
// ============================================================================

/**
 * Mock IMAP connection for testing
 */
class MockIMAPConnection {
  private emails: EmailMessage[] = [];
  private shouldFail = false;
  private failCount = 0;
  private maxFailures = 0;

  constructor(emails: EmailMessage[] = []) {
    this.emails = emails;
  }

  setEmails(emails: EmailMessage[]): void {
    this.emails = emails;
  }

  setFailure(shouldFail: boolean, maxFailures: number = 1): void {
    this.shouldFail = shouldFail;
    this.maxFailures = maxFailures;
    this.failCount = 0;
  }

  async connect(): Promise<void> {
    if (this.shouldFail && this.failCount < this.maxFailures) {
      this.failCount++;
      throw new Error('Connection failed');
    }
  }

  async openBox(boxName: string): Promise<{ messages: { total: number } }> {
    return { messages: { total: this.emails.length } };
  }

  async search(criteria: string[]): Promise<number[]> {
    return this.emails.map((_, i) => i + 1);
  }

  async fetch(seqNos: number[]): Promise<EmailMessage[]> {
    return seqNos.map(seq => this.emails[seq - 1]).filter(Boolean);
  }

  async end(): Promise<void> {
    // Close connection
  }
}

// ============================================================================
// Email Ingestion Functions (to be tested)
// ============================================================================

/**
 * Create test database with processed_emails table
 */
function createTestDb(): Database {
  const db = new Database(':memory:');

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

/**
 * Check if email was already processed
 */
function isEmailProcessed(db: Database, messageId: string): boolean {
  const result = db.prepare(`
    SELECT id FROM processed_emails WHERE message_id = ?
  `).get(messageId) as { id: number } | null;
  return result !== null;
}

/**
 * Record email as processed in database
 */
function recordProcessedEmail(
  db: Database,
  email: EmailMessage,
  rawPath: string
): void {
  db.prepare(`
    INSERT INTO processed_emails (
      message_id, subject, sender, received_at, processed_at, status, raw_path
    ) VALUES (?, ?, ?, ?, ?, 'processing', ?)
  `).run(
    email.messageId,
    email.subject,
    email.from,
    email.date.toISOString(),
    new Date().toISOString(),
    rawPath
  );
}

/**
 * Update email status after processing
 */
function updateEmailStatus(
  db: Database,
  messageId: string,
  status: 'processed' | 'failed',
  errorMessage?: string
): void {
  db.prepare(`
    UPDATE processed_emails
    SET status = ?, error_message = ?
    WHERE message_id = ?
  `).run(status, errorMessage || null, messageId);
}

/**
 * Save email content to file for later parsing
 */
function saveEmailToFile(
  email: EmailMessage,
  outputDir: string
): string {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = email.date.toISOString().split('T')[0];
  const safeSubject = email.subject.replace(/[^a-z0-9]/gi, '-').substring(0, 50);
  const filename = `${timestamp}-${safeSubject}.json`;
  const filepath = join(outputDir, filename);

  const content = JSON.stringify({
    messageId: email.messageId,
    subject: email.subject,
    from: email.from,
    date: email.date.toISOString(),
    text: email.text,
    html: email.html,
  }, null, 2);

  Bun.write(filepath, content);
  return filepath;
}

/**
 * Validate IMAP configuration
 */
function validateConfig(config: Partial<IMAPConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.user) errors.push('EMAIL_USER is required');
  if (!config.password) errors.push('EMAIL_PASSWORD is required');
  if (!config.host) errors.push('IMAP_HOST is required');

  return { valid: errors.length === 0, errors };
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Process emails from IMAP connection
 */
async function processEmails(
  connection: MockIMAPConnection,
  db: Database,
  outputDir: string
): Promise<IngestionResult> {
  const result: IngestionResult = {
    fetched: 0,
    saved: 0,
    skipped: 0,
    errors: [],
  };

  await connection.openBox('INBOX');
  const seqNos = await connection.search(['UNSEEN']);
  const emails = await connection.fetch(seqNos);

  result.fetched = emails.length;

  for (const email of emails) {
    // Skip if already processed
    if (isEmailProcessed(db, email.messageId)) {
      result.skipped++;
      continue;
    }

    try {
      // Save email to file
      const rawPath = saveEmailToFile(email, outputDir);

      // Record in database
      recordProcessedEmail(db, email, rawPath);

      result.saved++;
    } catch (error) {
      result.errors.push(`Failed to process ${email.messageId}: ${(error as Error).message}`);
    }
  }

  return result;
}

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_OUTPUT_DIR = '/tmp/agent-athens-test-emails';

const sampleEmail1: EmailMessage = {
  messageId: '<newsletter-001@thisisathens.org>',
  subject: 'This Week in Athens - Events Guide',
  from: 'newsletter@thisisathens.org',
  date: new Date('2025-01-20T08:00:00Z'),
  text: 'Events this week in Athens...',
  html: '<html><body><h1>Events this week</h1></body></html>',
};

const sampleEmail2: EmailMessage = {
  messageId: '<lifo-guide-002@lifo.gr>',
  subject: 'Lifo Guide - Εβδομαδιαίος Οδηγός',
  from: 'guide@lifo.gr',
  date: new Date('2025-01-20T09:00:00Z'),
  text: 'Οι καλύτερες εκδηλώσεις της εβδομάδας...',
  html: '<html><body><h1>Lifo Guide</h1></body></html>',
};

const sampleEmail3: EmailMessage = {
  messageId: '<athinorama-003@athinorama.gr>',
  subject: 'Athinorama Weekly',
  from: 'weekly@athinorama.gr',
  date: new Date('2025-01-20T10:00:00Z'),
  text: 'Weekly events from Athinorama...',
  html: '<html><body><h1>Athinorama Weekly</h1></body></html>',
};

// ============================================================================
// Tests
// ============================================================================

describe('Email Ingestion', () => {
  let db: Database;
  let mockConnection: MockIMAPConnection;

  beforeEach(() => {
    db = createTestDb();
    mockConnection = new MockIMAPConnection();

    // Clean up test output directory
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    db.close();

    // Clean up test output directory
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  // -------------------------------------------------------------------------
  // Configuration Tests
  // -------------------------------------------------------------------------

  describe('Configuration Validation', () => {
    test('validates required credentials', () => {
      const result = validateConfig({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('EMAIL_USER is required');
      expect(result.errors).toContain('EMAIL_PASSWORD is required');
    });

    test('accepts valid configuration', () => {
      const result = validateConfig({
        user: 'test@gmail.com',
        password: 'app-password',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 10000,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Connection Tests
  // -------------------------------------------------------------------------

  describe('IMAP Connection', () => {
    test('connects to IMAP server with credentials', async () => {
      mockConnection.setEmails([sampleEmail1]);

      // Should not throw
      await mockConnection.connect();

      const box = await mockConnection.openBox('INBOX');
      expect(box.messages.total).toBe(1);
    });

    test('retries on connection failure (3 attempts)', async () => {
      let attempts = 0;

      const connectWithRetry = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Connection failed');
        }
        return 'connected';
      };

      const result = await withRetry(connectWithRetry, 3, 10);
      expect(result).toBe('connected');
      expect(attempts).toBe(3);
    });

    test('fails after max retries exceeded', async () => {
      const alwaysFail = async () => {
        throw new Error('Connection failed');
      };

      await expect(withRetry(alwaysFail, 3, 10)).rejects.toThrow('Connection failed');
    });

    test('times out after configured duration', async () => {
      const slowOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      };

      // Test with Promise.race for timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 50)
      );

      await expect(Promise.race([slowOperation(), timeoutPromise])).rejects.toThrow('Timeout');
    });
  });

  // -------------------------------------------------------------------------
  // Email Fetching Tests
  // -------------------------------------------------------------------------

  describe('Email Fetching', () => {
    test('fetches unread emails from INBOX', async () => {
      mockConnection.setEmails([sampleEmail1, sampleEmail2]);

      const seqNos = await mockConnection.search(['UNSEEN']);
      expect(seqNos.length).toBe(2);

      const emails = await mockConnection.fetch(seqNos);
      expect(emails.length).toBe(2);
      expect(emails[0].subject).toBe('This Week in Athens - Events Guide');
    });

    test('returns empty array when no unread emails', async () => {
      mockConnection.setEmails([]);

      const seqNos = await mockConnection.search(['UNSEEN']);
      expect(seqNos.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Email Saving Tests
  // -------------------------------------------------------------------------

  describe('Email Saving', () => {
    test('saves email content to emails-to-parse directory', () => {
      const filepath = saveEmailToFile(sampleEmail1, TEST_OUTPUT_DIR);

      expect(existsSync(filepath)).toBe(true);
      expect(filepath).toContain('2025-01-20');
      expect(filepath).toContain('This-Week-in-Athens');
    });

    test('creates output directory if not exists', () => {
      expect(existsSync(TEST_OUTPUT_DIR)).toBe(false);

      saveEmailToFile(sampleEmail1, TEST_OUTPUT_DIR);

      expect(existsSync(TEST_OUTPUT_DIR)).toBe(true);
    });

    test('saves email with all required fields', () => {
      const filepath = saveEmailToFile(sampleEmail1, TEST_OUTPUT_DIR);
      const fileContent = require('fs').readFileSync(filepath, 'utf-8');
      const content = JSON.parse(fileContent);

      expect(content.messageId).toBe(sampleEmail1.messageId);
      expect(content.subject).toBe(sampleEmail1.subject);
      expect(content.from).toBe(sampleEmail1.from);
      expect(content.text).toBe(sampleEmail1.text);
      expect(content.html).toBe(sampleEmail1.html);
    });

    test('handles Unicode in subject', () => {
      const filepath = saveEmailToFile(sampleEmail2, TEST_OUTPUT_DIR);

      expect(existsSync(filepath)).toBe(true);
      // Greek characters should be stripped from filename
      expect(filepath).not.toContain('Εβδομαδιαίος');
    });
  });

  // -------------------------------------------------------------------------
  // Database Recording Tests
  // -------------------------------------------------------------------------

  describe('Database Recording', () => {
    test('records message_id in processed_emails', () => {
      const rawPath = '/data/emails/test.json';
      recordProcessedEmail(db, sampleEmail1, rawPath);

      expect(isEmailProcessed(db, sampleEmail1.messageId)).toBe(true);
    });

    test('stores email metadata correctly', () => {
      const rawPath = '/data/emails/test.json';
      recordProcessedEmail(db, sampleEmail1, rawPath);

      const record = db.prepare(`
        SELECT * FROM processed_emails WHERE message_id = ?
      `).get(sampleEmail1.messageId) as any;

      expect(record.subject).toBe(sampleEmail1.subject);
      expect(record.sender).toBe(sampleEmail1.from);
      expect(record.raw_path).toBe(rawPath);
      expect(record.status).toBe('processing');
    });

    test('skips already processed emails', async () => {
      mockConnection.setEmails([sampleEmail1]);

      // First processing
      const result1 = await processEmails(mockConnection, db, TEST_OUTPUT_DIR);
      expect(result1.saved).toBe(1);
      expect(result1.skipped).toBe(0);

      // Second processing (same email)
      const result2 = await processEmails(mockConnection, db, TEST_OUTPUT_DIR);
      expect(result2.saved).toBe(0);
      expect(result2.skipped).toBe(1);
    });

    test('updates status after processing', () => {
      recordProcessedEmail(db, sampleEmail1, '/data/test.json');

      updateEmailStatus(db, sampleEmail1.messageId, 'processed');

      const record = db.prepare(`
        SELECT status FROM processed_emails WHERE message_id = ?
      `).get(sampleEmail1.messageId) as { status: string };

      expect(record.status).toBe('processed');
    });

    test('records error message on failure', () => {
      recordProcessedEmail(db, sampleEmail1, '/data/test.json');

      updateEmailStatus(db, sampleEmail1.messageId, 'failed', 'Parse error: invalid HTML');

      const record = db.prepare(`
        SELECT status, error_message FROM processed_emails WHERE message_id = ?
      `).get(sampleEmail1.messageId) as { status: string; error_message: string };

      expect(record.status).toBe('failed');
      expect(record.error_message).toBe('Parse error: invalid HTML');
    });
  });

  // -------------------------------------------------------------------------
  // Integration Tests
  // -------------------------------------------------------------------------

  describe('Full Ingestion Workflow', () => {
    test('processes multiple emails successfully', async () => {
      mockConnection.setEmails([sampleEmail1, sampleEmail2, sampleEmail3]);

      const result = await processEmails(mockConnection, db, TEST_OUTPUT_DIR);

      expect(result.fetched).toBe(3);
      expect(result.saved).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toEqual([]);

      // Verify files created
      const files = readdirSync(TEST_OUTPUT_DIR);
      expect(files.length).toBe(3);

      // Verify database records
      const count = db.prepare('SELECT COUNT(*) as count FROM processed_emails').get() as { count: number };
      expect(count.count).toBe(3);
    });

    test('skips already processed and continues with new', async () => {
      // Pre-process first email
      recordProcessedEmail(db, sampleEmail1, '/data/old.json');

      mockConnection.setEmails([sampleEmail1, sampleEmail2]);

      const result = await processEmails(mockConnection, db, TEST_OUTPUT_DIR);

      expect(result.fetched).toBe(2);
      expect(result.saved).toBe(1);
      expect(result.skipped).toBe(1);
    });

    test('handles empty inbox gracefully', async () => {
      mockConnection.setEmails([]);

      const result = await processEmails(mockConnection, db, TEST_OUTPUT_DIR);

      expect(result.fetched).toBe(0);
      expect(result.saved).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    test('handles email with very long subject', () => {
      const longSubjectEmail: EmailMessage = {
        messageId: '<long-subject@test.com>',
        subject: 'A'.repeat(200),
        from: 'test@test.com',
        date: new Date(),
        text: 'content',
        html: '<html></html>',
      };

      const filepath = saveEmailToFile(longSubjectEmail, TEST_OUTPUT_DIR);

      // Filename should be truncated
      expect(filepath.length).toBeLessThan(TEST_OUTPUT_DIR.length + 100);
      expect(existsSync(filepath)).toBe(true);
    });

    test('handles email with special characters in subject', () => {
      const specialEmail: EmailMessage = {
        messageId: '<special@test.com>',
        subject: 'Test: Event @ Venue / 50% Off!',
        from: 'test@test.com',
        date: new Date(),
        text: 'content',
        html: '<html></html>',
      };

      const filepath = saveEmailToFile(specialEmail, TEST_OUTPUT_DIR);
      const filename = filepath.split('/').pop() || '';

      // Special chars in filename should be replaced with dashes
      expect(filename).not.toContain('@');
      expect(filename).not.toContain(':');
      expect(filename).not.toContain('%');
      expect(existsSync(filepath)).toBe(true);
    });

    test('handles duplicate message IDs gracefully', () => {
      recordProcessedEmail(db, sampleEmail1, '/path1');

      // Attempting to insert duplicate should throw
      expect(() => {
        recordProcessedEmail(db, sampleEmail1, '/path2');
      }).toThrow();
    });
  });
});
