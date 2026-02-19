#!/usr/bin/env bun
/**
 * Half Note Jazz Club iCal Scraper
 *
 * Scrapes events from Half Note's iCal feed
 * URL: https://www.halfnote.gr/events/?ical=1
 *
 * Strategy:
 * 1. Fetch iCal feed
 * 2. Parse VEVENT blocks
 * 3. Extract title, date, time, URL, and price from description
 * 4. Insert/update events in database
 *
 * Usage:
 *   bun run scripts/scrape-halfnote.ts
 *   bun run scripts/scrape-halfnote.ts --dry-run   # Don't save to DB
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { createHash } from 'crypto';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const ICAL_URL = 'https://www.halfnote.gr/events/?ical=1';
const VENUE_NAME = 'Half Note Jazz Club';

interface ICalEvent {
  uid: string;
  summary: string;
  description: string;
  dtstart: string;
  dtend: string;
  url: string;
  location: string;
}

interface ScrapedEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  time: string;
  type: string;
  genres: string;
  venue_name: string;
  url: string;
  price_type: string;
  price_amount: number | null;
  price_range: string | null;
  source: string;
}

/**
 * Generate event ID from normalized title + date + venue
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Parse iCal date format (YYYYMMDDTHHMMSS or with TZID)
 */
function parseICalDate(dateStr: string): { date: string; time: string } {
  // Handle formats like:
  // DTSTART;TZID=Europe/Helsinki:20260128T213000
  // DTSTART:20260128T213000Z

  // Extract the actual date/time part
  const match = dateStr.match(/(\d{8})T(\d{6})/);
  if (!match) {
    return { date: '', time: '' };
  }

  const [, datePart, timePart] = match;

  // Parse date: YYYYMMDD -> YYYY-MM-DD
  const date = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`;

  // Parse time: HHMMSS -> HH:MM
  const time = `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;

  return { date, time };
}

/**
 * Extract price from description text
 * Looks for patterns like:
 * - "Τιμές εισιτηρίων: από 20€"
 * - "από 15€"
 * - "15€ - 25€"
 */
function extractPrice(description: string): { price: number | null; priceRange: string | null } {
  if (!description) {
    return { price: null, priceRange: null };
  }

  // Pattern 1: "Τιμές εισιτηρίων: από XX€"
  const priceFromMatch = description.match(/(?:τιμ[έή]ς?\s+εισιτηρ[ίι][ωο]ν|από)\s*:?\s*(?:από\s+)?(\d+)\s*€/i);
  if (priceFromMatch) {
    const price = parseInt(priceFromMatch[1]);
    return { price, priceRange: `από €${price}` };
  }

  // Pattern 2: "XX€ - YY€" or "XX - YY€"
  const rangeMatch = description.match(/(\d+)\s*€?\s*[-–]\s*(\d+)\s*€/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]);
    const max = parseInt(rangeMatch[2]);
    return { price: min, priceRange: `€${min} - €${max}` };
  }

  // Pattern 3: Simple "XX€"
  const simpleMatch = description.match(/(\d{2,3})\s*€/);
  if (simpleMatch) {
    const price = parseInt(simpleMatch[1]);
    if (price >= 10 && price <= 200) {
      return { price, priceRange: `€${price}` };
    }
  }

  return { price: null, priceRange: null };
}

/**
 * Unescape iCal text (handles \, \; \n etc)
 */
function unescapeICalText(text: string): string {
  return text
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse iCal content into events
 */
function parseICal(icalContent: string): ICalEvent[] {
  const events: ICalEvent[] = [];

  // Split into VEVENT blocks
  const eventBlocks = icalContent.split('BEGIN:VEVENT');

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split('END:VEVENT')[0];

    // Parse properties - handle folded lines (lines starting with space/tab are continuations)
    const unfoldedBlock = block.replace(/\r?\n[ \t]/g, '');
    const lines = unfoldedBlock.split(/\r?\n/);

    const event: Partial<ICalEvent> = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const keyPart = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 1);

      // Extract the base property name (before any ;TZID= etc)
      const baseName = keyPart.split(';')[0].toUpperCase();

      switch (baseName) {
        case 'UID':
          event.uid = value;
          break;
        case 'SUMMARY':
          event.summary = unescapeICalText(value);
          break;
        case 'DESCRIPTION':
          event.description = unescapeICalText(value);
          break;
        case 'DTSTART':
          event.dtstart = line; // Keep full line for date parsing
          break;
        case 'DTEND':
          event.dtend = line;
          break;
        case 'URL':
          event.url = value;
          break;
        case 'LOCATION':
          event.location = unescapeICalText(value);
          break;
      }
    }

    if (event.summary && event.dtstart) {
      events.push(event as ICalEvent);
    }
  }

  return events;
}

/**
 * Main scraping function
 */
async function scrapeHalfNote(options: { dryRun: boolean }) {
  console.log('🎷 Half Note Jazz Club Scraper\n');

  // Fetch iCal feed
  console.log('📥 Fetching iCal feed...');
  const response = await fetch(ICAL_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/calendar, */*'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch iCal: ${response.status}`);
  }

  const icalContent = await response.text();
  console.log(`   Received ${icalContent.length} bytes\n`);

  // Parse events
  const icalEvents = parseICal(icalContent);
  console.log(`📅 Found ${icalEvents.length} events in iCal feed\n`);

  // Convert to our event format
  const scrapedEvents: ScrapedEvent[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const event of icalEvents) {
    const { date, time } = parseICalDate(event.dtstart);

    // Skip past events
    if (date < today) {
      continue;
    }

    // Extract price from description
    const { price, priceRange } = extractPrice(event.description);

    const id = generateEventId(event.summary, date, VENUE_NAME);

    console.log(`   ${date} | ${event.summary.substring(0, 40)}... | ${priceRange || 'TBA'}`);

    scrapedEvents.push({
      id,
      title: event.summary,
      description: '', // Will be AI-enriched later
      start_date: date,
      time,
      type: 'concert',
      genres: 'jazz',
      venue_name: VENUE_NAME,
      url: event.url || `https://www.halfnote.gr/events/`,
      price_type: price ? 'paid' : 'tba',
      price_amount: price,
      price_range: priceRange,
      source: 'halfnote'
    });
  }

  console.log(`\n📊 Events to save: ${scrapedEvents.length}`);

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - No changes made to database');
    return;
  }

  // Save to database
  const db = new Database(DB_PATH);

  let inserted = 0;

  const insertStmt = db.prepare(`
    INSERT INTO events (
      id, title, description, start_date, time_doors, time_source, type, genres,
      venue_name, url, price_type, price_amount, price_range, source,
      location_status, needs_enrichment, created_at
    ) VALUES (
      $id, $title, $description, $start_date, $time_doors, 'scraped_listing', $type, $genres,
      $venue_name, $url, $price_type, $price_amount, $price_range, $source,
      'verified_athens', 1, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      title = $title,
      url = $url,
      price_type = COALESCE($price_type, price_type),
      price_amount = COALESCE($price_amount, price_amount),
      price_range = COALESCE($price_range, price_range),
      updated_at = datetime('now')
  `);

  for (const event of scrapedEvents) {
    try {
      insertStmt.run({
        $id: event.id,
        $title: event.title,
        $description: event.description,
        $start_date: event.start_date,
        $time_doors: event.time,
        $type: event.type,
        $genres: event.genres,
        $venue_name: event.venue_name,
        $url: event.url,
        $price_type: event.price_type,
        $price_amount: event.price_amount,
        $price_range: event.price_range,
        $source: event.source
      });
      inserted++;
    } catch (error) {
      console.error(`   ❌ Error saving ${event.title}:`, error);
    }
  }

  db.close();

  console.log(`\n✅ Saved ${inserted} events to database`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

scrapeHalfNote({ dryRun }).catch(console.error);
