#!/usr/bin/env bun
/**
 * Email Ingestion System
 * Fetches newsletter emails from Gmail, parses events with tool_agent, and stores in database
 */

import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { getDatabase } from '../db/database';
import type { EmailToParse } from '../utils/ai-parser';

// Load environment variables
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const IMAP_HOST = process.env.IMAP_HOST || 'imap.gmail.com';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993');

// Path to track processed emails
const PROCESSED_EMAILS_PATH = './data/processed-emails.json';

interface ProcessedEmails {
  messageIds: string[];
  lastProcessed: string;
}

interface ParsedEvent {
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

/**
 * Load processed email Message-IDs to prevent reprocessing
 */
function loadProcessedEmails(): ProcessedEmails {
  if (!existsSync(PROCESSED_EMAILS_PATH)) {
    return { messageIds: [], lastProcessed: new Date().toISOString() };
  }

  try {
    const data = readFileSync(PROCESSED_EMAILS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('⚠️  Failed to load processed emails, starting fresh');
    return { messageIds: [], lastProcessed: new Date().toISOString() };
  }
}

/**
 * Save processed email Message-IDs
 */
function saveProcessedEmails(processed: ProcessedEmails): void {
  writeFileSync(PROCESSED_EMAILS_PATH, JSON.stringify(processed, null, 2));
}

/**
 * Generate event ID from hash(title+date+venue)
 */
function generateEventId(title: string, date: string, venue: string): string {
  const hash = createHash('sha256');
  hash.update(`${title.toLowerCase()}-${date}-${venue.toLowerCase()}`);
  return hash.digest('hex').substring(0, 16);
}

/**
 * Save email to file for Claude Code parsing (FREE - no API costs)
 */
function saveEmailForParsing(
  subject: string,
  from: string,
  date: Date,
  textContent: string,
  htmlContent: string,
  messageId: string
): string {
  const dir = './data/emails-to-parse';
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const timestamp = date.toISOString().split('T')[0];
  const safeSubject = subject.replace(/[^a-z0-9]/gi, '-').substring(0, 50);
  const filename = `${timestamp}-${safeSubject}.json`;
  const filepath = `${dir}/${filename}`;

  const emailData: EmailToParse = {
    subject,
    from,
    date: date.toISOString(),
    text: textContent,
    html: htmlContent,
    messageId,
  };

  writeFileSync(filepath, JSON.stringify(emailData, null, 2), 'utf-8');
  return filepath;
}

/**
 * Upsert event into database (insert or update if exists)
 */
function upsertEvent(event: ParsedEvent): void {
  const db = getDatabase();
  const eventId = generateEventId(event.title, event.date, event.venue);
  const now = new Date().toISOString();

  // Check if event exists
  const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(eventId);

  if (existing) {
    // Update existing event
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
    console.log(`  ♻️  Updated: ${event.title} at ${event.venue}`);
  } else {
    // Insert new event
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
      '', // full_description to be filled by enrichment
      now,
      now
    );
    console.log(`  ✅ Inserted: ${event.title} at ${event.venue}`);
  }
}

/**
 * Connect to Gmail and fetch unread newsletter emails
 */
async function fetchEmails(): Promise<void> {
  console.log('📥 Connecting to Gmail...');

  if (!EMAIL_USER || !EMAIL_PASSWORD) {
    throw new Error('EMAIL_USER and EMAIL_PASSWORD must be set in .env file');
  }

  const config = {
    imap: {
      user: EMAIL_USER,
      password: EMAIL_PASSWORD,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      authTimeout: 10000,
    },
  };

  let connection;

  try {
    connection = await imaps.connect(config);
    console.log('✅ Connected to Gmail');

    await connection.openBox('INBOX');
    console.log('📬 Opened INBOX');

    // Load processed emails
    const processed = loadProcessedEmails();

    // Search for unread emails
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false, // Don't mark as read yet
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`📧 Found ${messages.length} unread emails`);

    if (messages.length === 0) {
      console.log('✅ No new emails to process');
      return;
    }

    let totalSkipped = 0;

    for (const message of messages) {
      const all = message.parts.find((part: any) => part.which === '');
      if (!all) continue;

      const mail = await simpleParser(all.body);
      const messageId = mail.messageId || '';

      // Skip if already processed
      if (processed.messageIds.includes(messageId)) {
        console.log(`⏭️  Skipping already processed: ${mail.subject}`);
        totalSkipped++;
        continue;
      }

      console.log(`\n📨 Processing: ${mail.subject}`);
      console.log(`   From: ${mail.from?.text}`);
      console.log(`   Date: ${mail.date}`);

      // Save email for Claude Code parsing
      const filepath = saveEmailForParsing(
        mail.subject || '',
        mail.from?.text || '',
        mail.date || new Date(),
        mail.text || '',
        mail.html || '',
        messageId
      );

      console.log(`   💾 Saved to: ${filepath}`);
      console.log(`   ⏭️  Will parse with Claude Code after fetching all emails`);

      // Mark as processed (parsing will be done separately with Claude Code)
      processed.messageIds.push(messageId);

      // Archive email (move from inbox to All Mail)
      await connection.addFlags(message.attributes.uid, ['\\Seen']);
      console.log('   📦 Archived email');

      // Rate limit to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Save processed emails
    processed.lastProcessed = new Date().toISOString();
    saveProcessedEmails(processed);

    console.log('\n📊 Summary:');
    console.log(`   📧 ${messages.length - totalSkipped} emails saved for parsing`);
    console.log(`   ⏭️  ${totalSkipped} emails skipped (already processed)`);
    console.log('\n💡 Next step:');
    console.log(`   Ask Claude Code: "Parse the emails in data/emails-to-parse/ and add events to the database"`);

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

// Main execution
console.log('🚀 Starting email ingestion...\n');

fetchEmails()
  .then(() => {
    console.log('\n✅ Email ingestion completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Email ingestion failed:', error.message);
    process.exit(1);
  });

export { fetchEmails, saveEmailForParsing, upsertEvent, generateEventId };
