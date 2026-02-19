/**
 * Processed Emails Database Module
 *
 * Manages the processed_emails table for tracking email ingestion state.
 * Prevents duplicate processing by tracking Message-IDs.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 3.2)
 * @see data/migrations/001_pipeline_extensions.sql
 */

import type { Database } from 'bun:sqlite';
import { getDatabase } from './database';

// ============================================================================
// Types
// ============================================================================

export interface ProcessedEmail {
  id?: number;
  message_id: string;
  subject?: string;
  sender?: string;
  received_at?: string;
  processed_at: string;
  event_count?: number;
  status?: ProcessedEmailStatus;
  error_message?: string;
  raw_path?: string;
}

export type ProcessedEmailStatus = 'processing' | 'processed' | 'failed';

export interface ProcessingStats {
  total: number;
  processed: number;
  failed: number;
  totalEvents: number;
}

// ============================================================================
// Insert Operations
// ============================================================================

/**
 * Insert a processed email record
 *
 * @param email - Email record to insert
 * @param db - Optional database instance (defaults to main database)
 * @returns The inserted record's ID
 * @throws If message_id already exists (UNIQUE constraint)
 */
export function insertProcessedEmail(
  email: ProcessedEmail,
  db?: Database
): number {
  const database = db || getDatabase();

  const result = database.prepare(`
    INSERT INTO processed_emails (
      message_id, subject, sender, received_at, processed_at,
      event_count, status, error_message, raw_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    email.message_id,
    email.subject || null,
    email.sender || null,
    email.received_at || null,
    email.processed_at,
    email.event_count || 0,
    email.status || 'processed',
    email.error_message || null,
    email.raw_path || null
  );

  return result.lastInsertRowid as number;
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Check if a message_id has already been processed
 *
 * Use this before processing an email to prevent duplicates.
 *
 * @param messageId - The Message-ID header from the email
 * @param db - Optional database instance
 * @returns true if the email has been processed
 */
export function isEmailProcessed(
  messageId: string,
  db?: Database
): boolean {
  const database = db || getDatabase();

  const result = database.prepare(`
    SELECT id FROM processed_emails WHERE message_id = ?
  `).get(messageId) as { id: number } | null;

  return result !== null;
}

/**
 * Get processed email record by message_id
 *
 * @param messageId - The Message-ID header from the email
 * @param db - Optional database instance
 * @returns The email record or undefined if not found
 */
export function getProcessedEmail(
  messageId: string,
  db?: Database
): ProcessedEmail | undefined {
  const database = db || getDatabase();

  const result = database.prepare(`
    SELECT * FROM processed_emails WHERE message_id = ?
  `).get(messageId) as ProcessedEmail | null;

  return result ?? undefined;
}

/**
 * Get all processed emails with a specific status
 *
 * @param status - The status to filter by
 * @param db - Optional database instance
 * @returns Array of email records, ordered by processed_at DESC
 */
export function getEmailsByStatus(
  status: ProcessedEmailStatus,
  db?: Database
): ProcessedEmail[] {
  const database = db || getDatabase();

  return database.prepare(`
    SELECT * FROM processed_emails WHERE status = ?
    ORDER BY processed_at DESC
  `).all(status) as ProcessedEmail[];
}

/**
 * Get recent processed emails
 *
 * @param limit - Maximum number of records to return
 * @param db - Optional database instance
 * @returns Array of email records, ordered by processed_at DESC
 */
export function getRecentEmails(
  limit: number = 10,
  db?: Database
): ProcessedEmail[] {
  const database = db || getDatabase();

  return database.prepare(`
    SELECT * FROM processed_emails
    ORDER BY processed_at DESC
    LIMIT ?
  `).all(limit) as ProcessedEmail[];
}

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Update email processing status
 *
 * Use this to mark an email as processed or failed after processing.
 *
 * @param messageId - The Message-ID of the email
 * @param status - New status
 * @param errorMessage - Optional error message (for failed status)
 * @param db - Optional database instance
 */
export function updateEmailStatus(
  messageId: string,
  status: ProcessedEmailStatus,
  errorMessage?: string,
  db?: Database
): void {
  const database = db || getDatabase();

  database.prepare(`
    UPDATE processed_emails
    SET status = ?, error_message = ?
    WHERE message_id = ?
  `).run(status, errorMessage || null, messageId);
}

/**
 * Update event count for a processed email
 *
 * Call this after extracting events from an email.
 *
 * @param messageId - The Message-ID of the email
 * @param eventCount - Number of events extracted
 * @param db - Optional database instance
 */
export function updateEventCount(
  messageId: string,
  eventCount: number,
  db?: Database
): void {
  const database = db || getDatabase();

  database.prepare(`
    UPDATE processed_emails
    SET event_count = ?
    WHERE message_id = ?
  `).run(eventCount, messageId);
}

/**
 * Mark email as successfully processed
 *
 * Convenience function that sets status to 'processed' and updates event count.
 *
 * @param messageId - The Message-ID of the email
 * @param eventCount - Number of events extracted
 * @param db - Optional database instance
 */
export function markEmailProcessed(
  messageId: string,
  eventCount: number,
  db?: Database
): void {
  const database = db || getDatabase();

  database.prepare(`
    UPDATE processed_emails
    SET status = 'processed', event_count = ?, error_message = NULL
    WHERE message_id = ?
  `).run(eventCount, messageId);
}

/**
 * Mark email as failed
 *
 * Convenience function that sets status to 'failed' with error message.
 *
 * @param messageId - The Message-ID of the email
 * @param errorMessage - Description of what went wrong
 * @param db - Optional database instance
 */
export function markEmailFailed(
  messageId: string,
  errorMessage: string,
  db?: Database
): void {
  const database = db || getDatabase();

  database.prepare(`
    UPDATE processed_emails
    SET status = 'failed', error_message = ?
    WHERE message_id = ?
  `).run(errorMessage, messageId);
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get processing statistics
 *
 * @param db - Optional database instance
 * @returns Statistics object with totals
 */
export function getProcessingStats(db?: Database): ProcessingStats {
  const database = db || getDatabase();

  const result = database.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END), 0) as processed,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
      COALESCE(SUM(event_count), 0) as totalEvents
    FROM processed_emails
  `).get() as ProcessingStats;

  return result;
}

/**
 * Get count of emails processed today
 *
 * @param db - Optional database instance
 * @returns Number of emails processed today
 */
export function getTodayCount(db?: Database): number {
  const database = db || getDatabase();

  const result = database.prepare(`
    SELECT COUNT(*) as count
    FROM processed_emails
    WHERE date(processed_at) = date('now')
  `).get() as { count: number };

  return result.count;
}

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Delete old processed email records
 *
 * Keeps the database size manageable by removing old records.
 *
 * @param daysToKeep - Number of days of history to retain
 * @param db - Optional database instance
 * @returns Number of records deleted
 */
export function cleanupOldRecords(
  daysToKeep: number = 30,
  db?: Database
): number {
  const database = db || getDatabase();

  const result = database.prepare(`
    DELETE FROM processed_emails
    WHERE processed_at < datetime('now', '-' || ? || ' days')
  `).run(daysToKeep);

  return result.changes;
}
