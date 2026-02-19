#!/usr/bin/env bun
/**
 * Parse Helper for Agent Athens
 *
 * Helper script to process parsed events and add them to database
 * Works with Claude Code's FREE parsing workflow
 */

import { readFileSync } from 'fs';
import { upsertEvent, initializeDatabase } from '../src/db/database';
import { createHash } from 'crypto';
import type { Event } from '../src/types';

interface ParsedEvent {
  title: string;
  date: string;        // YYYY-MM-DD
  time?: string;       // HH:MM
  venue: string;
  type: string;        // concert, exhibition, cinema, theater, performance, workshop
  genre?: string;
  price: 'open' | 'with-ticket';
  address?: string;
  url?: string;
  short_description?: string;
  source_name?: string;     // Which site this came from
  source_file?: string;     // Which file this came from
}

function generateEventId(title: string, date: string, venue: string): string {
  const hash = createHash('sha256');
  hash.update(`${title.toLowerCase()}-${date}-${venue.toLowerCase()}`);
  return hash.digest('hex').substring(0, 16);
}

function parsedEventToEvent(parsed: ParsedEvent): Event {
  const now = new Date().toISOString();
  const eventId = generateEventId(parsed.title, parsed.date, parsed.venue);

  // Combine date and time into ISO format
  let startDate = parsed.date;
  if (parsed.time) {
    startDate = `${parsed.date}T${parsed.time}:00.000+02:00`; // Athens timezone (EET/EEST)
  } else {
    startDate = `${parsed.date}T00:00:00.000+02:00`;
  }

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    id: eventId,
    title: parsed.title,
    description: parsed.short_description || "",
    startDate: startDate,
    type: parsed.type,
    genres: parsed.genre ? [parsed.genre] : [],
    tags: [],
    venue: {
      name: parsed.venue,
      address: parsed.address || "",
      neighborhood: undefined,
      coordinates: undefined,
      capacity: undefined
    },
    price: {
      type: parsed.price,
      amount: undefined,
      currency: "EUR",
      range: undefined
    },
    url: parsed.url,
    source: parsed.source_name || parsed.source_file || "unknown",
    createdAt: now,
    updatedAt: now,
    language: "el" // Most Athens events are in Greek
  };
}

function addEventsToDatabase(events: ParsedEvent[]): { inserted: number; updated: number; skipped: number } {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const parsedEvent of events) {
    try {
      const event = parsedEventToEvent(parsedEvent);
      const result = upsertEvent(event);

      if (result.success) {
        if (result.isNew) {
          inserted++;
        } else {
          updated++;
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`❌ Failed to process event: ${parsedEvent.title}`, error);
      skipped++;
    }
  }

  return { inserted, updated, skipped };
}

// Main function
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: bun run scripts/parse-helper.ts <events-json-file>');
    console.log('');
    console.log('Example:');
    console.log('  bun run scripts/parse-helper.ts data/parsed/viva-events.json');
    console.log('');
    console.log('Input JSON format:');
    console.log('[');
    console.log('  {');
    console.log('    "title": "Event Name",');
    console.log('    "date": "2025-10-25",');
    console.log('    "time": "21:00",');
    console.log('    "venue": "Venue Name",');
    console.log('    "type": "concert",');
    console.log('    "genre": "jazz",');
    console.log('    "price": "open",');
    console.log('    "url": "https://example.com"');
    console.log('  }');
    console.log(']');
    process.exit(0);
  }

  // Initialize database (creates tables if they don't exist)
  initializeDatabase();

  const jsonFile = args[0];

  try {
    console.log(`📥 Loading events from: ${jsonFile}`);
    const content = readFileSync(jsonFile, 'utf-8');
    const events: ParsedEvent[] = JSON.parse(content);

    console.log(`📊 Found ${events.length} events to process`);

    const results = addEventsToDatabase(events);

    console.log('\n📊 Results:');
    console.log(`   ✅ Inserted: ${results.inserted}`);
    console.log(`   🔄 Updated: ${results.updated}`);
    console.log(`   ⏭️  Skipped: ${results.skipped}`);
    console.log(`   📈 Total: ${events.length}`);

    if (results.inserted + results.updated > 0) {
      console.log('\n✅ Events successfully added to database!');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
