#!/usr/bin/env bun
/**
 * Direct AI enrichment - Claude Code generates descriptions inline
 * This is the FREE approach - no API calls
 */

import Database from 'better-sqlite3';

const db = new Database('data/events.db');

interface Event {
  id: string;
  title: string;
  type: string;
  venue_name: string;
  start_date: string;
  genres: string | null;
  description: string | null;
  price_type: string;
}

const batchSize = parseInt(process.argv[2] || '20');
const offset = parseInt(process.argv[3] || '0');

console.log(`🤖 AI Enrichment - Direct Generation`);
console.log('='.repeat(70));
console.log(`\nBatch size: ${batchSize}, Offset: ${offset}`);
console.log('\n✅ This script prepares events for Claude Code enrichment');
console.log('📝 Claude Code will generate descriptions directly (FREE)\n');

const events = db.prepare(`
  SELECT id, title, type, venue_name, start_date, genres, description, price_type
  FROM events
  WHERE (full_description IS NULL OR full_description = '')
    AND start_date >= date('now')
    AND start_date < date('now', '+1 month')
  ORDER BY start_date ASC
  LIMIT ? OFFSET ?
`).all(batchSize, offset) as Event[];

if (events.length === 0) {
  console.log('✅ No more events need enrichment!\n');
  db.close();
  process.exit(0);
}

console.log(`📊 Found ${events.length} events ready for enrichment:\n`);

events.forEach((event, index) => {
  console.log(`[${index + 1}] ${event.title.substring(0, 60)}`);
  console.log(`    Type: ${event.type} | Venue: ${event.venue_name}`);
  console.log(`    Date: ${event.start_date} | Price: ${event.price_type}`);
  console.log(`    ID: ${event.id}\n`);
});

console.log('='.repeat(70));
console.log('\n✅ Ready for Claude Code to generate descriptions!');
console.log('💡 Run this via Claude Code Task tool for free AI generation\n');

db.close();
