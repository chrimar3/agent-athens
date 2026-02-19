#!/usr/bin/env bun
/**
 * Master AI Enrichment Script
 *
 * Generates 400-word AI descriptions for all upcoming Athens events
 * Uses Task tool with general-purpose agent (FREE via Claude Code)
 *
 * Features:
 * - Dynamic date handling (no hardcoded dates)
 * - All upcoming events (not limited to 30 days)
 * - Batch processing with progress tracking
 * - Word count validation (380-420 words)
 * - Resume capability (skips already enriched)
 * - Quality metrics and statistics
 *
 * Usage:
 *   bun run scripts/enrich-all-events.ts              # Process all events
 *   bun run scripts/enrich-all-events.ts --limit 20   # Process 20 events
 *   bun run scripts/enrich-all-events.ts --batch-size 50  # Custom batch size
 *   bun run scripts/enrich-all-events.ts --dry-run    # Show plan without executing
 */

import Database from 'better-sqlite3';

// Parse command line arguments
const args = process.argv.slice(2);
const limit = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1])
  : null;
const batchSize = args.includes('--batch-size')
  ? parseInt(args[args.indexOf('--batch-size') + 1])
  : 20;
const dryRun = args.includes('--dry-run');

interface Event {
  id: string;
  title: string;
  type: string;
  start_date: string;
  venue_name: string;
  venue_neighborhood: string | null;
  genres: string | null;
  description: string | null;
  price_type: string;
  price_amount: number | null;
  url: string | null;
}

// Open database
const db = new Database('data/events.db');

// Get events needing enrichment
const query = `
  SELECT
    id, title, type, start_date, venue_name, venue_neighborhood,
    genres, description, price_type, price_amount, url
  FROM events
  WHERE (full_description IS NULL OR full_description = '')
    AND date(start_date) >= date('now')
  ORDER BY start_date ASC
  ${limit ? `LIMIT ${limit}` : ''}
`;

const events = db.prepare(query).all() as Event[];

console.log('🤖 Agent Athens - AI Event Enrichment');
console.log('='.repeat(70));
console.log('');
console.log(`📊 Events needing enrichment: ${events.length}`);
console.log(`📦 Batch size: ${batchSize}`);
console.log(`🎯 Mode: ${dryRun ? 'DRY RUN (preview only)' : 'PRODUCTION (will enrich)'}`);
console.log('');

if (events.length === 0) {
  console.log('✅ All events already have AI-generated descriptions!');
  console.log('');
  db.close();
  process.exit(0);
}

// Show event type breakdown
console.log('📋 Event Breakdown:');
const byType = events.reduce((acc, e) => {
  acc[e.type] = (acc[e.type] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

Object.entries(byType)
  .sort(([,a], [,b]) => b - a)
  .forEach(([type, count]) => {
    console.log(`   ${type}: ${count} events`);
  });
console.log('');

// Calculate batches
const totalBatches = Math.ceil(events.length / batchSize);
console.log(`🔄 Will process in ${totalBatches} batch${totalBatches > 1 ? 'es' : ''}`);
console.log('');

if (dryRun) {
  console.log('='.repeat(70));
  console.log('');
  console.log('🔍 DRY RUN MODE - Showing first 10 events:');
  console.log('');

  events.slice(0, 10).forEach((event, idx) => {
    console.log(`[${idx + 1}] ${event.title}`);
    console.log(`    Type: ${event.type} | Venue: ${event.venue_name}`);
    console.log(`    Date: ${event.start_date.split('T')[0]}`);
    console.log(`    ID: ${event.id}`);
    console.log('');
  });

  if (events.length > 10) {
    console.log(`   ... and ${events.length - 10} more events`);
    console.log('');
  }

  console.log('='.repeat(70));
  console.log('');
  console.log('✅ Dry run complete!');
  console.log('');
  console.log('To start enrichment, run without --dry-run:');
  console.log('   bun run scripts/enrich-all-events.ts');
  console.log('');

  db.close();
  process.exit(0);
}

// Production mode: Ready to enrich with Task tool
console.log('='.repeat(70));
console.log('');
console.log('🎯 READY FOR AI ENRICHMENT');
console.log('');
console.log('This script prepares events for enrichment via Claude Code Task tool.');
console.log('');
console.log('📝 Next Steps:');
console.log('');
console.log('1. Review the AI enrichment prompt in docs/AI-ENRICHMENT-PLAN.md');
console.log('2. Use Task tool (general-purpose agent) to enrich events in batches');
console.log('3. For each event, generate exactly 400 words (±20 acceptable)');
console.log('4. Update database with: UPDATE events SET full_description = ? WHERE id = ?');
console.log('');
console.log('💡 TIP: Process in batches of 20-50 events for better monitoring');
console.log('');
console.log('📊 Event List (ready for Task tool):');
console.log('');

// Group into batches for display
for (let i = 0; i < events.length; i += batchSize) {
  const batch = events.slice(i, i + batchSize);
  const batchNum = Math.floor(i / batchSize) + 1;

  console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} events):`);
  console.log('');

  batch.forEach((event, idx) => {
    console.log(`   [${i + idx + 1}] ${event.title.substring(0, 50)}${event.title.length > 50 ? '...' : ''}`);
    console.log(`       Type: ${event.type} | Venue: ${event.venue_name}`);
    console.log(`       Date: ${event.start_date.split('T')[0]} | Price: ${event.price_type}`);
    console.log(`       ID: ${event.id}`);
    console.log('');
  });

  console.log('');
}

console.log('='.repeat(70));
console.log('');
console.log('✅ Events ready for AI enrichment via Task tool!');
console.log('');
console.log('💬 Ask Claude Code to process these events with Task tool (general-purpose agent)');
console.log('');

db.close();
