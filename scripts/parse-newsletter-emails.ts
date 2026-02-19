#!/usr/bin/env bun
/**
 * Parse newsletter emails from data/emails-to-parse/ and save as JSON
 * Output format: RawEvent[] matching viva.gr parser standard
 *
 * Workflow:
 * 1. Read JSON email files
 * 2. Extract events from text/html content
 * 3. Save to data/parsed/newsletter-events.json
 * 4. Import using: bun run scripts/import-newsletter-events.ts
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const EMAILS_DIR = join(import.meta.dir, '../data/emails-to-parse');
const OUTPUT_FILE = join(import.meta.dir, '../data/parsed/newsletter-events.json');

interface EmailData {
  subject: string;
  from: string;
  date: string;
  text?: string;
  html?: string;
  messageId: string;
}

interface RawEvent {
  title: string;
  date: string;      // YYYY-MM-DD
  time: string;      // HH:MM (24-hour) or empty string
  venue: string;
  location: string;  // Full address or "Athens, Greece"
  type: string;      // concert|exhibition|cinema|theater|performance|workshop
  genre: string;
  price: string;     // "open" | "with-ticket"
  description: string;
  url: string;
  source: string;    // Email sender
}

/**
 * Parse Greek date to YYYY-MM-DD
 */
function parseGreekDate(dateStr: string): string | null {
  try {
    // Handle formats: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
    const patterns = [
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      /(\d{1,2})-(\d{1,2})-(\d{4})/,
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
  } catch {
    return null;
  }
}

/**
 * Parse time from text (HH:MM format)
 */
function parseTime(text: string): string {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const [_, hours, minutes] = match;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  return '20:00'; // Default time if not found
}

/**
 * Classify event type from text
 */
function classifyEventType(text: string): string {
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
  if (lower.includes('theater') || lower.includes('θέατρο')) {
    return 'theater';
  }
  if (lower.includes('workshop') || lower.includes('εργαστήριο')) {
    return 'workshop';
  }
  if (lower.includes('performance') || lower.includes('παράσταση')) {
    return 'performance';
  }

  return 'concert'; // Default
}

/**
 * Determine price type from text
 */
function determinePrice(text: string): string {
  const lower = text.toLowerCase();

  if (lower.includes('free') ||
      lower.includes('δωρεάν') ||
      lower.includes('ελεύθερη είσοδος') ||
      lower.includes('open access') ||
      lower.includes('admission free')) {
    return 'open';
  }

  return 'with-ticket';
}

/**
 * Extract venue name from text patterns
 */
function extractVenue(text: string, defaultVenue: string): string {
  // Look for common venue patterns
  const venuePatterns = [
    /(?:στο|στην|στα|at|in)\s+([Α-ΩA-Z][Α-Ωα-ωA-Za-z\s]+(?:Club|Hall|Theatre|Theater|Stage|Gallery|Museum|Center|Centre))/i,
    /Μέγαρο\s+Μουσικής/i,
    /Ωδείο\s+Αθηνών/i,
    /Εθνικό\s+Θέατρο/i,
  ];

  for (const pattern of venuePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }

  return defaultVenue;
}

/**
 * Parse Megaron Jazz newsletter
 */
function parseMegaronJazz(email: EmailData): RawEvent[] {
  const events: RawEvent[] = [];
  const text = email.text || '';
  const lines = text.split('\n');

  for (let i = 0; i < lines.length - 2; i++) {
    const currentLine = lines[i].trim();
    const nextLine = lines[i + 1].trim();
    const lineAfterNext = lines[i + 2].trim();

    // Pattern: Title (non-empty), empty line, date line
    const dateMatch = lineAfterNext.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);

    if (dateMatch && currentLine.length > 0 && currentLine.length < 200 && nextLine === '') {
      // Skip metadata lines
      if (currentLine.includes('http') ||
          currentLine.includes('Copyright') ||
          currentLine.includes('ΧΟΡΗΓΟΣ') ||
          currentLine.includes('Περισσότερα') ||
          currentLine.includes('ΕΙΣΙΤΗΡΙΑ') ||
          currentLine.includes('εκδηλώσεις') ||
          /^(Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή)$/.test(currentLine)) {
        continue;
      }

      const date = parseGreekDate(dateMatch[0]);
      const time = parseTime(lineAfterNext);

      if (date) {
        // Collect description from following lines
        let description = currentLine;
        let j = i + 3;
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

        // Find URL
        let url = '';
        for (let k = Math.max(0, i - 5); k < i + 20 && k < lines.length; k++) {
          const urlMatch = lines[k].match(/https:\/\/www\.megaron\.gr\/event\/[^\s)]+/);
          if (urlMatch) {
            url = urlMatch[0];
            break;
          }
        }

        const event: RawEvent = {
          title: currentLine,
          date,
          time,
          venue: 'Μέγαρο Μουσικής Αθηνών',
          location: 'Βασ. Σοφίας και Κόκκαλη, 115 21 Αθήνα',
          type: 'concert',
          genre: 'jazz',
          price: 'with-ticket',
          description: description.substring(0, 200).trim(),
          url,
          source: 'megaron.gr'
        };

        events.push(event);
      }
    }
  }

  return events;
}

/**
 * Parse generic newsletter (fallback)
 */
function parseGenericNewsletter(email: EmailData): RawEvent[] {
  const events: RawEvent[] = [];
  const text = email.text || '';

  // Extract venue from sender
  let defaultVenue = 'Athens Venue';
  const fromMatch = email.from.match(/"([^"]+)"/);
  if (fromMatch) {
    defaultVenue = fromMatch[1];
  }

  // Try to find event patterns: title followed by date
  const eventPattern = /([^\n]{10,150})\n.*?(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4})/g;
  let match;

  while ((match = eventPattern.exec(text)) !== null) {
    const title = match[1].trim();
    const dateStr = match[2];

    const date = parseGreekDate(dateStr);
    if (date && !title.includes('http') && !title.includes('Copyright')) {
      const venue = extractVenue(text, defaultVenue);
      const time = parseTime(text.substring(match.index, match.index + 200));
      const type = classifyEventType(title + ' ' + text.substring(match.index, match.index + 200));
      const price = determinePrice(text.substring(match.index, match.index + 200));

      const event: RawEvent = {
        title,
        date,
        time,
        venue,
        location: 'Athens, Greece',
        type,
        genre: '',
        price,
        description: title,
        url: '',
        source: email.from
      };

      events.push(event);
    }
  }

  return events;
}

/**
 * Extract events from email based on sender
 */
function extractEventsFromEmail(email: EmailData): RawEvent[] {
  // Determine parser based on sender or subject
  if (email.from.includes('megaron.gr') || email.subject.includes('Jazz@Megaron')) {
    return parseMegaronJazz(email);
  }

  // Add more parsers for specific venues here
  // if (email.from.includes('gazarte.gr')) { return parseGazarte(email); }
  // if (email.from.includes('sixdogs.gr')) { return parseSixDogs(email); }

  // Fallback to generic parser
  return parseGenericNewsletter(email);
}

/**
 * Main processing function
 */
async function processEmails(): Promise<void> {
  console.log('📥 Reading email files from', EMAILS_DIR);

  if (!existsSync(EMAILS_DIR)) {
    console.log('⚠️  Directory not found:', EMAILS_DIR);
    console.log('   Run: bun run src/ingest/email-ingestion.ts first\n');
    return;
  }

  try {
    const files = await readdir(EMAILS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    console.log(`📧 Found ${jsonFiles.length} email files\n`);

    if (jsonFiles.length === 0) {
      console.log('✅ No emails to process');
      return;
    }

    const allEvents: RawEvent[] = [];
    let emailsProcessed = 0;

    for (const filename of jsonFiles) {
      try {
        console.log(`🔄 Processing: ${filename}`);

        // Read email data
        const filepath = join(EMAILS_DIR, filename);
        const content = await readFile(filepath, 'utf-8');
        const email: EmailData = JSON.parse(content);

        emailsProcessed++;

        // Extract events
        const extractedEvents = extractEventsFromEmail(email);
        console.log(`   Found ${extractedEvents.length} events`);

        if (extractedEvents.length > 0) {
          extractedEvents.forEach(e => {
            console.log(`   - ${e.title} (${e.date} ${e.time})`);
          });
          allEvents.push(...extractedEvents);
        }

      } catch (error) {
        console.error(`❌ Error processing ${filename}:`, error);
      }
    }

    // Remove duplicates based on title+date+venue
    const uniqueEvents: RawEvent[] = [];
    const seen = new Set<string>();

    for (const event of allEvents) {
      const key = `${event.title.toLowerCase()}|${event.date}|${event.venue.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEvents.push(event);
      }
    }

    // Sort by date
    uniqueEvents.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    // Save to JSON
    await writeFile(OUTPUT_FILE, JSON.stringify(uniqueEvents, null, 2), 'utf-8');

    console.log('\n' + '='.repeat(60));
    console.log('📊 NEWSLETTER PARSING RESULTS:');
    console.log(`   📧 ${emailsProcessed} emails processed`);
    console.log(`   📅 ${allEvents.length} total events found`);
    console.log(`   ✅ ${uniqueEvents.length} unique events saved`);
    console.log(`   💾 Output: ${OUTPUT_FILE}`);

    // Show breakdown by type
    const typeBreakdown: Record<string, number> = {};
    uniqueEvents.forEach(e => {
      typeBreakdown[e.type] = (typeBreakdown[e.type] || 0) + 1;
    });

    console.log('\n   By type:');
    for (const [type, count] of Object.entries(typeBreakdown)) {
      console.log(`     ${type}: ${count}`);
    }

    console.log('\n🔄 NEXT STEP:');
    console.log('   bun run scripts/import-newsletter-events.ts\n');

  } catch (error) {
    console.error('❌ Error reading emails directory:', error);
    process.exit(1);
  }
}

// Run the script
console.log('🚀 Starting newsletter email parser\n');
await processEmails();
