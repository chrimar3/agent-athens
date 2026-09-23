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
import { fromHeaderDomain, verifySender } from './allowed-senders';

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
  /** Set only by the gated ingest path: the allowlisted domain that passed DKIM. */
  authenticatedSenderDomain?: string;
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
    ...(email.authenticatedSenderDomain ? { authenticatedSenderDomain: email.authenticatedSenderDomain } : {}),
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
// Gated Mailbox Ingestion
// ============================================================================

/** Header-only view of one unseen message (no body downloaded yet). */
export interface MailboxHeaderInfo {
  uid: number;
  /** RFC822.SIZE reported by the server; undefined when the server did not report it. */
  size: number | undefined;
  /** Lowercased header name -> values, in message order (topmost first). */
  headers: Record<string, string[]>;
}

/** The mailbox operations the ingest gate needs; imapSimpleMailbox() adapts imap-simple. */
export interface MailboxClient {
  listUnseenUids(): Promise<number[]>;
  fetchHeaders(uids: number[]): Promise<MailboxHeaderInfo[]>;
  fetchRaw(uid: number): Promise<string | Buffer>;
  markSeen(uid: number): Promise<void>;
}

export interface IngestLimits {
  /** Messages larger than this (RFC822.SIZE and downloaded bytes) are rejected. */
  maxMessageBytes: number;
  /** Unseen messages examined per run; the remainder stay unseen for the next run. */
  maxMessagesPerRun: number;
}

export const INGEST_LIMITS: Readonly<IngestLimits> = Object.freeze({
  maxMessageBytes: 10 * 1024 * 1024,
  maxMessagesPerRun: 50,
});

export interface IngestDeps {
  outputDir?: string;
  limits?: Partial<IngestLimits>;
  /** Pause after each saved message (rate limit). */
  delayMs?: number;
  log?: (line: string) => void;
  parse?: (raw: string | Buffer) => Promise<any>;
}

export interface GatedIngestionResult extends IngestionResult {
  rejected: number;
  deferred: number;
}

function byteLength(raw: string | Buffer): number {
  return typeof raw === 'string' ? Buffer.byteLength(raw, 'utf-8') : raw.length;
}

/**
 * Ingest unseen messages through the sender gate.
 *
 * Per message, in order: size cap (from RFC822.SIZE, before download) ->
 * allowlisted From + aligned dkim=pass in the topmost Authentication-Results
 * (header only, before download) -> download with byte cap -> parsed From must
 * match the authenticated header -> save. Rejected messages are marked seen and
 * logged as counts per sender domain and reason (no subject, no body).
 */
export async function ingestFromMailbox(
  client: MailboxClient,
  db: Database,
  deps: IngestDeps = {}
): Promise<GatedIngestionResult> {
  const limits: IngestLimits = { ...INGEST_LIMITS, ...(deps.limits ?? {}) };
  const log = deps.log ?? ((line: string) => console.log(line));
  const parse = deps.parse ?? simpleParser;
  const outputDir = deps.outputDir ?? DEFAULT_OUTPUT_DIR;
  const delayMs = deps.delayMs ?? 2000;

  const result: GatedIngestionResult = { fetched: 0, saved: 0, skipped: 0, errors: [], rejected: 0, deferred: 0 };
  const rejectedByDomain = new Map<string, number>();
  const rejectedByReason = new Map<string, number>();
  const reject = async (uid: number, domain: string | null, reason: string) => {
    result.rejected++;
    const d = domain ?? '(unparseable)';
    rejectedByDomain.set(d, (rejectedByDomain.get(d) ?? 0) + 1);
    rejectedByReason.set(reason, (rejectedByReason.get(reason) ?? 0) + 1);
    await client.markSeen(uid);
  };

  const unseen = [...(await client.listUnseenUids())].sort((a, b) => a - b);
  const batch = unseen.slice(0, Math.max(0, limits.maxMessagesPerRun));
  result.deferred = unseen.length - batch.length;
  result.fetched = batch.length;
  log(`📧 Found ${unseen.length} unread emails (examining ${batch.length}, deferring ${result.deferred})`);
  if (batch.length === 0) return result;

  const headerInfos = await client.fetchHeaders(batch);

  for (const info of headerInfos) {
    const uid = info.uid;
    try {
      if (typeof info.size !== 'number' || !Number.isFinite(info.size)) {
        result.errors.push(`uid ${uid}: server did not report message size; left unseen`);
        continue;
      }
      const verdict = verifySender({
        fromHeaders: info.headers['from'] ?? [],
        authenticationResults: info.headers['authentication-results'] ?? [],
      });
      if (info.size > limits.maxMessageBytes) {
        await reject(uid, verdict.senderDomain, 'too-large');
        continue;
      }
      if (!verdict.ok) {
        await reject(uid, verdict.senderDomain, verdict.reason);
        continue;
      }

      const raw = await client.fetchRaw(uid);
      if (byteLength(raw) > limits.maxMessageBytes) {
        await reject(uid, verdict.senderDomain, 'too-large');
        continue;
      }

      const mail = await parse(raw);
      const parsedFrom: Array<{ address?: string }> = mail.from?.value ?? [];
      const parsedDomain =
        parsedFrom.length === 1 && typeof parsedFrom[0].address === 'string'
          ? fromHeaderDomain(parsedFrom[0].address)
          : null;
      if (parsedDomain !== verdict.senderDomain) {
        await reject(uid, verdict.senderDomain, 'from-mismatch');
        continue;
      }

      const messageId: string = mail.messageId || '';
      if (!messageId || isEmailProcessed(messageId, db)) {
        if (messageId) result.skipped++;
        else result.errors.push(`uid ${uid}: message has no Message-ID`);
        await client.markSeen(uid);
        continue;
      }

      const email: EmailMessage = {
        messageId,
        subject: mail.subject || '',
        from: mail.from?.text || '',
        date: mail.date || new Date(),
        text: mail.text || '',
        html: mail.html || '',
        authenticatedSenderDomain: verdict.domain,
      };

      const filepath = saveEmailToFile(email, outputDir);
      recordProcessedEmail(db, email, filepath);
      await client.markSeen(uid);
      result.saved++;
      log(`   💾 Saved message from ${verdict.domain} (uid ${uid})`);

      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      result.errors.push(`uid ${uid}: ${(error as Error).message}`);
    }
  }

  if (result.rejected > 0) {
    const byDomain = [...rejectedByDomain].map(([d, n]) => `${d}=${n}`).join(', ');
    const byReason = [...rejectedByReason].map(([r, n]) => `${r}=${n}`).join(', ');
    log(`email-gate: skipped ${result.rejected} message(s) — by sender domain: ${byDomain} — by reason: ${byReason}`);
  }

  return result;
}

/** Adapt an imap-simple connection (INBOX already open) to MailboxClient. */
export function imapSimpleMailbox(connection: any): MailboxClient {
  return {
    listUnseenUids: () =>
      new Promise<number[]>((resolve, reject) => {
        connection.imap.search(['UNSEEN'], (err: Error | null, uids: number[]) =>
          err ? reject(err) : resolve(uids ?? []));
      }),
    fetchHeaders: async (uids: number[]) => {
      if (uids.length === 0) return [];
      const messages = await connection.search([['UID', uids.join(',')]], {
        bodies: ['HEADER'],
        size: true,
        markSeen: false,
      });
      return messages.map((m: any) => ({
        uid: m.attributes?.uid,
        size: m.attributes?.size,
        headers: m.parts?.find((p: any) => p.which === 'HEADER')?.body ?? {},
      }));
    },
    fetchRaw: async (uid: number) => {
      const messages = await connection.search([['UID', String(uid)]], { bodies: [''], markSeen: false });
      const part = messages[0]?.parts?.find((p: any) => p.which === '');
      if (!part) throw new Error('message body not returned by server');
      return part.body;
    },
    markSeen: (uid: number) => connection.addFlags(uid, ['\\Seen']),
  };
}

/**
 * Build the imap-simple config. TLS certificate verification is explicit, and
 * the run refuses to start if verification has been disabled process-wide.
 */
export function buildImapConfig(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('NODE_TLS_REJECT_UNAUTHORIZED=0 disables certificate verification; unset it before ingesting email');
  }
  const host = env.IMAP_HOST || 'imap.gmail.com';
  return {
    imap: {
      user: env.EMAIL_USER ?? '',
      password: env.EMAIL_PASSWORD ?? '',
      host,
      port: parseInt(env.IMAP_PORT || '993', 10),
      tls: true,
      tlsOptions: {
        rejectUnauthorized: true,
        servername: host,
        minVersion: 'TLSv1.2',
      },
      autotls: 'never',
      authTimeout: 10000,
    },
  };
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
    // DEAD CODE — schema divergence (writes date/time, events table has start_date/end_date).
    // See specs/session-C-email-ingestion.md. Do not restore without schema reconciliation.
    throw new Error('email ingestion: date/time schema deprecated; pending Session C unification');
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
export async function fetchEmails(): Promise<GatedIngestionResult> {
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

  const config = buildImapConfig(process.env);

  let connection: any;
  const db = getDatabase();

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

    const result = await ingestFromMailbox(imapSimpleMailbox(connection), db);

    console.log('\n📊 Summary:');
    console.log(`   📧 ${result.saved} emails saved for parsing`);
    console.log(`   ⏭️  ${result.skipped} emails skipped (already processed)`);
    console.log(`   🚫 ${result.rejected} emails rejected by the sender gate`);
    if (result.deferred > 0) {
      console.log(`   ⏳ ${result.deferred} emails deferred to the next run (per-run cap)`);
    }
    if (result.errors.length > 0) {
      console.log(`   ❌ ${result.errors.length} errors`);
      for (const e of result.errors) console.error(`   ❌ ${e}`);
    }
    return result;
  } catch (error) {
    console.error('❌ Email ingestion failed:', error);
    throw error;
  } finally {
    if (connection) {
      connection.end();
      console.log('🔌 Disconnected from Gmail');
    }
  }
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

