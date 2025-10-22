#!/usr/bin/env bun
/**
 * Event Enrichment Script - Option E: Next 30 Days
 *
 * Prepares batches of events for enrichment via Claude Code Task tool
 * Focuses on events happening in the next 30 days
 */

import { Database } from 'bun:sqlite';
import { writeFileSync, mkdirSync } from 'fs';

const db = new Database('data/events.db');

// Get events that need enrichment (next 30 days only)
const today = new Date('2025-10-22');
const thirtyDaysFromNow = new Date(today);
thirtyDaysFromNow.setDate(today.getDate() + 30);

const needEnrichment = db.query(`
  SELECT id, title, type, start_date, venue_name, genres, url, description
  FROM events
  WHERE full_description IS NULL
    AND start_date >= ?
    AND start_date <= ?
  ORDER BY start_date ASC
`).all(
  today.toISOString(),
  thirtyDaysFromNow.toISOString()
) as Array<{
  id: string;
  title: string;
  type: string;
  start_date: string;
  venue_name: string;
  genres: string;
  url: string | null;
  description: string;
}>;

console.log('📊 Enrichment Plan (Next 30 Days):');
console.log(`   Events needing enrichment: ${needEnrichment.length}`);
console.log(`   Date range: ${today.toISOString().split('T')[0]} to ${thirtyDaysFromNow.toISOString().split('T')[0]}`);
console.log(`   Batches (20 events each): ${Math.ceil(needEnrichment.length / 20)}`);
console.log('');

if (needEnrichment.length === 0) {
  console.log('✅ No events need enrichment!');
  db.close();
  process.exit(0);
}

// Create batches of 20
const BATCH_SIZE = 20;
const batches: Array<typeof needEnrichment> = [];

for (let i = 0; i < needEnrichment.length; i += BATCH_SIZE) {
  batches.push(needEnrichment.slice(i, i + BATCH_SIZE));
}

// Create output directory
try {
  mkdirSync('data/enrichment-batches', { recursive: true });
} catch (e) {
  // Directory already exists
}

console.log(`📦 Creating ${batches.length} batch files...\n`);

// Save each batch
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  const filename = `data/enrichment-batches/batch-${i + 1}-of-${batches.length}.json`;

  writeFileSync(filename, JSON.stringify(batch, null, 2));

  console.log(`✅ Batch ${i + 1}/${batches.length}: ${batch.length} events`);
  console.log(`   File: ${filename}`);
  console.log(`   Date range: ${batch[0].start_date.split('T')[0]} to ${batch[batch.length - 1].start_date.split('T')[0]}`);
  console.log('');
}

console.log('🎯 Ready for enrichment!\n');
console.log('To start, ask Claude Code to process batch 1');

db.close();
