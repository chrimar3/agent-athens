#!/usr/bin/env bun
/**
 * Parse newsletter emails from data/emails-to-parse/ and extract events to database
 *
 * Requirements:
 * - Read JSON email files
 * - Extract event information from text/html content
 * - Generate unique IDs from hash(title+date+venue)
 * - Upsert events into database
 * - Track statistics
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { getDatabase, upsertEvent } from '../src/db/database';
import type { Event } from '../src/types';

const EMAILS_DIR = join(import.meta.dir, '../data/emails-to-parse');
const TIMEZONE = 'Europe/Athens';

/**
 * Get current date in Athens timezone (YYYY-MM-DD)
 */
function getAthensDate(): string {
  // Athens is UTC+2 (EET) or UTC+3 (EEST)
  const now = new Date();
  const athensTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
  const year = athensTime.getFullYear();
  const month = String(athensTime.getMonth() + 1).padStart(2, '0');
  const day = String(athensTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface EmailData {
  subject: string;
  from: string;
  date: string;
  text?: string;
  html?: string;
}

interface ExtractedEvent {
  title: string;
  date: string;  // YYYY-MM-DD
  time?: string; // HH:MM
  venue: string;
  type: string;
  genre?: string;
  description: string;
  url?: string;
  priceType: 'free' | 'paid' | 'donation';
  priceRange?: string;
  address?: string;
}

interface Stats {
  emailsProcessed: number;
  eventsFound: number;
  newEvents: number;
  updatedEvents: number;
  errors: string[];
}

/**
 * Generate event ID from title+date+venue
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  const hash = createHash('sha256').update(normalized).digest('hex');
  return hash.substring(0, 16); // 16 char hex ID
}

/**
 * Parse event type from text
 */
function parseEventType(text: string): 'concert' | 'exhibition' | 'cinema' | 'theater' | 'performance' | 'workshop' | 'other' {
  const lower = text.toLowerCase();

  if (lower.includes('concert') || lower.includes('συναυλία') || lower.includes('jazz') || lower.includes('μουσική')) {
    return 'concert';
  }
  if (lower.includes('exhibition') || lower.includes('έκθεση') || lower.includes('gallery')) {
    return 'exhibition';
  }
  if (lower.includes('cinema') || lower.includes('film') || lower.includes('movie') || lower.includes('ταινία')) {
    return 'cinema';
  }
  if (lower.includes('theater') || lower.includes('θέατρο') || lower.includes('performance')) {
    return 'theater';
  }
  if (lower.includes('workshop') || lower.includes('εργαστήριο')) {
    return 'workshop';
  }

  return 'other';
}

/**
 * Parse Greek date to ISO format
 */
function parseGreekDate(dateStr: string): string | null {
  try {
    // Handle formats like "Σάββατο 1.11.2025" or "1.11.2025" or "01/11/2025"
    const patterns = [
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/,  // DD.MM.YYYY
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // DD/MM/YYYY
      /(\d{1,2})-(\d{1,2})-(\d{4})/,    // DD-MM-YYYY
    ];

    for (const pattern of patterns) {
      const match = dateStr.match(pattern);
      if (match) {
        const [_, day, month, year] = match;
        const y = parseInt(year);
        const m = String(parseInt(month)).padStart(2, '0');
        const d = String(parseInt(day)).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse time from Greek text
 */
function parseTime(text: string): string | null {
  // Look for patterns like "20:30" or "21:00"
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const [_, hours, minutes] = match;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  return null;
}

/**
 * Extract events from Megaron Jazz newsletter
 */
function parseMegaronJazz(email: EmailData): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const text = email.text || '';

  // Look for event pattern: Title, empty line, then date+time
  // Example:
  // Νικόλας Αναδολής: Αυτοσχεδιασμοί
  // (empty line)
  // Σάββατο 1.11.2025, 20:30

  const lines = text.split('\n');

  for (let i = 0; i < lines.length - 2; i++) {
    const currentLine = lines[i].trim();
    const nextLine = lines[i + 1].trim();
    const lineAfterNext = lines[i + 2].trim();

    // Check if line after next (skipping empty line) has a date pattern
    const dateMatch = lineAfterNext.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);

    // Pattern: currentLine has content, nextLine is empty, lineAfterNext has date
    if (dateMatch && currentLine.length > 0 && currentLine.length < 200 && nextLine === '') {
      // Skip if current line is just a URL or metadata
      if (currentLine.includes('http') ||
          currentLine.includes('Copyright') ||
          currentLine.includes('ΧΟΡΗΓΟΣ') ||
          currentLine.includes('Περισσότερα') ||
          currentLine.includes('ΕΙΣΙΤΗΡΙΑ') ||
          currentLine.includes('εκδηλώσεις')) {
        continue;
      }

      // Skip if currentLine is ONLY a Greek day name
      if (/^(Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή)$/.test(currentLine)) {
        continue;
      }

      const date = parseGreekDate(dateMatch[0]);
      const time = parseTime(lineAfterNext);

      if (date) {
        // Get description from following lines until next event or URL
        let description = currentLine;
        let j = i + 3; // Start after the date line
        while (j < lines.length && j < i + 15) {
          const descLine = lines[j].trim();
          if (descLine.includes('http') ||
              descLine.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/) ||
              descLine.includes('Περισσότερα') ||
              descLine.includes('ΕΙΣΙΤΗΡΙΑ')) {
            break;
          }
          if (descLine.length > 10) {
            description += ' ' + descLine;
          }
          j++;
        }

        // Find URL for this event (look back and ahead)
        let url: string | undefined;
        for (let k = Math.max(0, i - 5); k < i + 20 && k < lines.length; k++) {
          const urlMatch = lines[k].match(/https:\/\/www\.megaron\.gr\/event\/[^\s)]+/);
          if (urlMatch) {
            url = urlMatch[0];
            break;
          }
        }

        const event: ExtractedEvent = {
          title: currentLine,
          date,
          time: time || undefined,
          venue: 'Μέγαρο Μουσικής Αθηνών',
          type: 'concert',
          genre: 'jazz',
          description: description.substring(0, 500), // Limit length
          priceType: 'paid',
          url,
          address: 'Βασ. Σοφίας και Κόκκαλη, 115 21 Αθήνα'
        };

        events.push(event);
      }
    }
  }

  return events;
}

/**
 * Extract events from generic newsletter
 */
function parseGenericNewsletter(email: EmailData): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const text = email.text || '';

  // Look for common patterns
  // This is a placeholder - needs to be enhanced based on actual newsletter formats

  // Extract venue from sender
  let defaultVenue = 'Athens';
  const fromMatch = email.from.match(/"([^"]+)"/);
  if (fromMatch) {
    defaultVenue = fromMatch[1];
  }

  // Try to find event patterns
  const eventPattern = /([^\n]+)\n.*?(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4}).*?(\d{1,2}:\d{2})?/g;
  let match;

  while ((match = eventPattern.exec(text)) !== null) {
    const title = match[1].trim();
    const dateStr = match[2];
    const timeStr = match[3];

    const date = parseGreekDate(dateStr);
    if (date && title.length > 5 && title.length < 200) {
      events.push({
        title,
        date,
        time: timeStr || undefined,
        venue: defaultVenue,
        type: parseEventType(text),
        description: title,
        priceType: text.toLowerCase().includes('free') || text.toLowerCase().includes('δωρεάν') ? 'free' : 'paid'
      });
    }
  }

  return events;
}

/**
 * Extract events from email based on sender
 */
function extractEventsFromEmail(email: EmailData): ExtractedEvent[] {
  // Determine parser based on sender or subject
  if (email.from.includes('megaron.gr') || email.subject.includes('Jazz@Megaron')) {
    return parseMegaronJazz(email);
  }

  // Add more parsers for other venues/senders here

  // Fallback to generic parser
  return parseGenericNewsletter(email);
}

/**
 * Convert ExtractedEvent to Event type
 */
function convertToEvent(extracted: ExtractedEvent, source: string): Event {
  const now = new Date().toISOString();
  const eventId = generateEventId(extracted.title, extracted.date, extracted.venue);

  // Create ISO datetime
  let startDate = extracted.date;
  if (extracted.time) {
    startDate = `${extracted.date}T${extracted.time}:00.000+02:00`; // Athens timezone
  } else {
    startDate = `${extracted.date}T19:00:00.000+02:00`; // Default to 19:00
  }

  const event: Event = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    id: eventId,
    title: extracted.title,
    description: extracted.description,
    startDate,
    endDate: undefined,
    type: extracted.type === 'concert' ? 'concert' :
          extracted.type === 'exhibition' ? 'exhibition' :
          extracted.type === 'cinema' ? 'cinema' :
          extracted.type === 'theater' ? 'theater' :
          extracted.type === 'workshop' ? 'workshop' :
          'other',
    genres: extracted.genre ? [extracted.genre] : [],
    tags: [],
    venue: {
      name: extracted.venue,
      address: extracted.address || '',
      neighborhood: undefined
    },
    price: {
      type: extracted.priceType,
      amount: undefined,
      currency: 'EUR',
      range: extracted.priceRange
    },
    url: extracted.url,
    source,
    createdAt: now,
    updatedAt: now,
    language: 'el'
  };

  return event;
}

/**
 * Main processing function
 */
async function processEmails(): Promise<Stats> {
  const stats: Stats = {
    emailsProcessed: 0,
    eventsFound: 0,
    newEvents: 0,
    updatedEvents: 0,
    errors: []
  };

  console.log('📥 Reading email files from', EMAILS_DIR);

  try {
    // Get all JSON files
    const files = await readdir(EMAILS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    console.log(`📧 Found ${jsonFiles.length} email files`);

    for (const filename of jsonFiles) {
      try {
        console.log(`\n🔄 Processing: ${filename}`);

        // Read email data
        const filepath = join(EMAILS_DIR, filename);
        const content = await readFile(filepath, 'utf-8');
        const email: EmailData = JSON.parse(content);

        stats.emailsProcessed++;

        // Extract events
        const extractedEvents = extractEventsFromEmail(email);
        console.log(`   Found ${extractedEvents.length} events`);

        // Convert and upsert each event
        for (const extracted of extractedEvents) {
          try {
            const event = convertToEvent(extracted, email.from);
            const result = upsertEvent(event);

            if (result.success) {
              stats.eventsFound++;
              if (result.isNew) {
                stats.newEvents++;
                console.log(`   ✅ NEW: ${event.title} (${event.startDate})`);
              } else {
                stats.updatedEvents++;
                console.log(`   🔄 UPDATED: ${event.title} (${event.startDate})`);
              }
            } else {
              stats.errors.push(`Failed to upsert: ${extracted.title}`);
              console.log(`   ❌ FAILED: ${extracted.title}`);
            }
          } catch (error) {
            const msg = `Error converting event: ${extracted.title} - ${error}`;
            stats.errors.push(msg);
            console.error(`   ❌ ${msg}`);
          }
        }
      } catch (error) {
        const msg = `Error processing ${filename}: ${error}`;
        stats.errors.push(msg);
        console.error(`❌ ${msg}`);
      }
    }

  } catch (error) {
    const msg = `Error reading emails directory: ${error}`;
    stats.errors.push(msg);
    console.error(`❌ ${msg}`);
  }

  return stats;
}

/**
 * Print summary
 */
function printSummary(stats: Stats): void {
  console.log('\n📊 Summary');
  console.log('━'.repeat(50));
  console.log(`Emails processed:      ${stats.emailsProcessed}`);
  console.log(`Events found:          ${stats.eventsFound}`);
  console.log(`New events added:      ${stats.newEvents}`);
  console.log(`Existing events updated: ${stats.updatedEvents}`);

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors (${stats.errors.length}):`);
    stats.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err}`);
    });
  } else {
    console.log('\n✅ No errors!');
  }
  console.log('━'.repeat(50));
}

// Run the script
console.log('🚀 Starting newsletter email parser');
console.log(`📍 Timezone: ${TIMEZONE}`);
console.log(`📅 Today: ${getAthensDate()}\n`);

const stats = await processEmails();
printSummary(stats);

// Exit with error code if there were issues
if (stats.errors.length > 0) {
  process.exit(1);
}
