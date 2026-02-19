#!/usr/bin/env bun
// Initialize database and migrate sample events

import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeDatabase, upsertEvent, getAllEvents, getEventStats, getDatabase } from '../src/db/database';
import { normalizeEvents } from '../src/utils/normalize';

async function main() {
  console.log('🔧 Initializing agent-athens database...\n');

  // Step 1: Initialize database with schema
  console.log('📋 Creating database schema...');
  initializeDatabase();

  // Step 2: Load sample events
  console.log('📥 Loading sample events...');
  const sampleDataPath = join(import.meta.dir, '../src/data/sample-events.json');
  const rawData = JSON.parse(readFileSync(sampleDataPath, 'utf-8'));
  const events = normalizeEvents(rawData);
  console.log(`✅ Loaded ${events.length} sample events\n`);

  // Step 3: Insert events into database
  console.log('💾 Inserting events into database...');
  let inserted = 0;
  for (const event of events) {
    if (upsertEvent(event)) {
      inserted++;
      console.log(`  ✓ ${event.title}`);
    } else {
      console.log(`  ✗ Failed: ${event.title}`);
    }
  }
  console.log(`\n✅ Inserted ${inserted}/${events.length} events\n`);

  // Step 4: Verify and show statistics
  console.log('📊 Database Statistics:');
  const stats = getEventStats();
  console.log(`  Total events: ${stats.total}`);
  console.log(`  Upcoming events: ${stats.upcomingCount}`);
  console.log('\n  By type:');
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`    ${type}: ${count}`);
  }
  console.log('\n  By price:');
  for (const [priceType, count] of Object.entries(stats.byPriceType)) {
    console.log(`    ${priceType}: ${count}`);
  }

  // Step 5: Test query
  console.log('\n🔍 Testing query (first 5 events):');
  const testEvents = getDatabase().prepare('SELECT id, title, start_date, type FROM events LIMIT 5').all();
  testEvents.forEach((e: any, i: number) => {
    console.log(`  ${i + 1}. ${e.title} (${e.type}) - ${e.start_date.split('T')[0]}`);
  });

  console.log('\n✅ Database initialization complete!');
  console.log(`📁 Database location: ${join(import.meta.dir, '../data/events.db')}`);
}

main().catch(console.error);
