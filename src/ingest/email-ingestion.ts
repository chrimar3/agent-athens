/**
 * Email Ingestion System
 *
 * Fetches newsletter emails from IMAP, saves for parsing, and tracks in database.
 * Uses retry logic with exponential backoff for reliability.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 3.4)
 * @see src/db/processed-emails.ts
 */

// @ts-expect-error -- no type declarations available for imap-simple
import imaps from 'imap-simple';
// @ts-expect-error -- no type declarations available for mailparser
import { simpleParser } from 'mailparser';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { getDatabase } from '../db/database';
import {
  insertProcessedEmail,
  isEmailProcessed,
  updateEmailStatus as dbUpdateEmailStatus,
  markEmailProcessed,
  markEmailFailed,
  type ProcessedEmail,
} from '../db/processed-emails';
import type { Database } from 'bun:sqlite';

// ============================================================================
// Types
// ============================================================================

export interface IMAPConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  authTimeout: number;
}

export interface EmailMessage {
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  text: string;
  html: string;
}

export interface IngestionResult {
  fetched: number;
  saved: number;
  skipped: number;
  errors: string[];
}

export interface ParsedEvent {
  title: string;
  date: string;
  time: string;
  venue: string;
  type: string;
  genre: string;
  price: 'open' | 'with-ticket';
  address: string;
  url: string;
  short_description: string;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_OUTPUT_DIR = './data/emails-to-parse';

// Load environment variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const IMAP_HOST = process.env.IMAP_HOST || 'imap.gmail.com';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993');

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validate IMAP configuration
 *
 * @param config - Partial IMAP configuration to validate
 * @returns Validation result with errors if invalid
 */
export function validateConfig(config: Partial<IMAPConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.user) errors.push('EMAIL_USER is required');
  if (!config.password) errors.push('EMAIL_PASSWORD is required');
  if (!config.host) errors.push('IMAP_HOST is required');

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Retry wrapper with exponential backoff
 *
 * Retries a function up to maxAttempts times with exponential backoff.
 * Useful for handling transient network failures.
 *
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000)
 * @returns Result of the function
 * @throws Last error if all attempts fail
 */
export async function withRetry<T>(
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

// ============================================================================
// Email File Operations
// ============================================================================

/**
 * Save email content to file for later parsing
 *
 * Creates JSON file with email content in the output directory.
 * Filename is sanitized from subject and includes date.
 *
 * @param email - Email message to save
 * @param outputDir - Directory to save the file
 * @returns Path to the saved file
 */
export function saveEmailToFile(
  email: EmailMessage,
  outputDir: string = DEFAULT_OUTPUT_DIR
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

  writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use saveEmailToFile instead
 */
export function saveEmailForParsing(
  subject: string,
  from: string,
  date: Date,
  textContent: string,
  htmlContent: string,
  messageId: string
): string {
  const email: EmailMessage = {
    messageId,
    subject,
    from,
    date,
    text: textContent,
    html: htmlContent,
  };
  return saveEmailToFile(email, DEFAULT_OUTPUT_DIR);
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Record email as processed in database
 *
 * @param db - Database instance
 * @param email - Email message to record
 * @param rawPath - Path to saved email file
 */
export function recordProcessedEmail(
  db: Database,
  email: EmailMessage,
  rawPath: string
): void {
  const record: ProcessedEmail = {
    message_id: email.messageId,
    subject: email.subject,
    sender: email.from,
    received_at: email.date.toISOString(),
    processed_at: new Date().toISOString(),
    status: 'processing',
    raw_path: rawPath,
  };

  insertProcessedEmail(record, db);
}

/**
 * Update email processing status
 *
 * @param db - Database instance
 * @param messageId - Message ID to update
 * @param status - New status
 * @param errorMessage - Optional error message for failed status
 */
export function updateEmailStatus(
  db: Database,
  messageId: string,
  status: 'processed' | 'failed',
  errorMessage?: string
): void {
  dbUpdateEmailStatus(messageId, status, errorMessage, db);
}

// ============================================================================
// Email Processing
// ============================================================================

/**
 * Process emails from IMAP connection
 *
 * Fetches emails, saves to files, and records in database.
 * Skips already processed emails.
 *
 * @param connection - IMAP connection (or mock for testing)
 * @param db - Database instance
 * @param outputDir - Directory to save email files
 * @returns Processing result with counts
 */
export async function processEmails(
  connection: any,
  db: Database,
  outputDir: string = DEFAULT_OUTPUT_DIR
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
    if (isEmailProcessed(email.messageId, db)) {
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
// Event Database Operations
// ============================================================================

/**
 * Generate event ID from hash(title+date+venue)
 */
export function generateEventId(title: string, date: string, venue: string): string {
  const hash = createHash('sha256');
  hash.update(`${title.toLowerCase()}-${date}-${venue.toLowerCase()}`);
  return hash.digest('hex').substring(0, 16);
}

/**
 * Upsert event into database (insert or update if exists)
 */
export function upsertEvent(event: ParsedEvent): void {
  const db = getDatabase();
  const eventId = generateEventId(event.title, event.date, event.venue);
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);

  if (existing) {
    db.prepare(`
      UPDATE events SET
        title = ?,
        date = ?,
        time = ?,
        venue = ?,
        type = ?,
        genre = ?,
        price = ?,
        address = ?,
        url = ?,
        short_description = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      event.title,
      event.date,
      event.time,
      event.venue,
      event.type,
      event.genre,
      event.price,
      event.address,
      event.url,
      event.short_description,
      now,
      eventId
    );
  } else {
    db.prepare(`
      INSERT INTO events (
        id, title, date, time, venue, type, genre, price, address, url,
        short_description, full_description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      event.title,
      event.date,
      event.time,
      event.venue,
      event.type,
      event.genre,
      event.price,
      event.address,
      event.url,
      event.short_description,
      '',
      now,
      now
    );
  }
}

// ============================================================================
// Main IMAP Fetch Function
// ============================================================================

/**
 * Connect to Gmail and fetch unread newsletter emails
 *
 * Main entry point for email ingestion. Connects to IMAP server,
 * fetches unread emails, saves them for parsing, and tracks in database.
 */
export async function fetchEmails(): Promise<IngestionResult> {
  console.log('📥 Connecting to Gmail...');

  // Validate configuration
  const configValidation = validateConfig({
    user: EMAIL_USER,
    password: EMAIL_PASSWORD,
    host: IMAP_HOST,
  });

  if (!configValidation.valid) {
    throw new Error(configValidation.errors.join(', '));
  }

  const config = {
    imap: {
      user: EMAIL_USER!,
      password: EMAIL_PASSWORD!,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      authTimeout: 10000,
    },
  };

  let connection: any;
  const db = getDatabase();

  const result: IngestionResult = {
    fetched: 0,
    saved: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Connect with retry
    connection = await withRetry(
      () => imaps.connect(config),
      3,
      1000
    );
    console.log('✅ Connected to Gmail');

    await connection.openBox('INBOX');
    console.log('📬 Opened INBOX');

    // Search for unread emails
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`📧 Found ${messages.length} unread emails`);
    result.fetched = messages.length;

    if (messages.length === 0) {
      console.log('✅ No new emails to process');
      return result;
    }

    for (const message of messages) {
      const all = message.parts.find((part: any) => part.which === '');
      if (!all) continue;

      const mail = await simpleParser(all.body);
      const messageId = mail.messageId || '';

      // Skip if already processed
      if (isEmailProcessed(messageId, db)) {
        console.log(`⏭️  Skipping already processed: ${mail.subject}`);
        result.skipped++;
        continue;
      }

      console.log(`\n📨 Processing: ${mail.subject}`);
      console.log(`   From: ${mail.from?.text}`);
      console.log(`   Date: ${mail.date}`);

      try {
        // Create email object
        const email: EmailMessage = {
          messageId,
          subject: mail.subject || '',
          from: mail.from?.text || '',
          date: mail.date || new Date(),
          text: mail.text || '',
          html: mail.html || '',
        };

        // Save email to file
        const filepath = saveEmailToFile(email);
        console.log(`   💾 Saved to: ${filepath}`);

        // Record in database
        recordProcessedEmail(db, email, filepath);

        // Archive email (mark as seen)
        await connection.addFlags(message.attributes.uid, ['\\Seen']);
        console.log('   📦 Archived email');

        result.saved++;

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.error(`   ❌ Error: ${errorMessage}`);
        result.errors.push(`${mail.subject}: ${errorMessage}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   📧 ${result.saved} emails saved for parsing`);
    console.log(`   ⏭️  ${result.skipped} emails skipped (already processed)`);
    if (result.errors.length > 0) {
      console.log(`   ❌ ${result.errors.length} errors`);
    }

  } catch (error) {
    console.error('❌ Email ingestion failed:', error);
    throw error;
  } finally {
    if (connection) {
      connection.end();
      console.log('🔌 Disconnected from Gmail');
    }
  }

  return result;
}

// ============================================================================
// CLI Execution
// ============================================================================

// Only run if this file is executed directly
if (import.meta.main) {
  console.log('🚀 Starting email ingestion...\n');

  fetchEmails()
    .then((result) => {
      console.log('\n✅ Email ingestion completed successfully');
      console.log(`   Fetched: ${result.fetched}, Saved: ${result.saved}, Skipped: ${result.skipped}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Email ingestion failed:', error.message);
      process.exit(1);
    });
}
