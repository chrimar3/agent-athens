#!/usr/bin/env bun
/**
 * Clean up old events from the database
 *
 * Deletes events that have passed their retention period.
 * Default: 7 days (keeps last week's events)
 *
 * Usage:
 *   bun run scripts/cleanup-old-events.ts
 *   bun run scripts/cleanup-old-events.ts --days=30
 */

import { getDatabase } from '../src/db/database';

// Parse command line arguments
const args = process.argv.slice(2);
let retentionDays = 7; // Default: 7 days (Option A - Conservative)

for (const arg of args) {
  if (arg.startsWith('--days=')) {
    retentionDays = parseInt(arg.split('=')[1]);
  }
}

console.log('🧹 Database Cleanup - Agent Athens');
console.log('===================================\n');

const db = getDatabase();

// Calculate cutoff date
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
const cutoffISO = cutoffDate.toISOString();

console.log(`📅 Retention policy: ${retentionDays} days`);
console.log(`🗓️  Cutoff date: ${cutoffDate.toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})}\n`);

// Get count of events to be deleted
const toDeleteQuery = db.prepare(`
  SELECT COUNT(*) as count
  FROM events
  WHERE start_date < ?
`);
const toDelete = toDeleteQuery.get(cutoffISO) as { count: number };

if (toDelete.count === 0) {
  console.log('✅ No old events to clean up!\n');
  process.exit(0);
}

console.log(`📊 Found ${toDelete.count} old events to delete\n`);

// Show sample of what will be deleted
const sampleQuery = db.prepare(`
  SELECT title, start_date, venue_name
  FROM events
  WHERE start_date < ?
  ORDER BY start_date DESC
  LIMIT 5
`);
const samples = sampleQuery.all(cutoffISO) as Array<{
  title: string;
  start_date: string;
  venue_name: string
}>;

console.log('📋 Sample events to be deleted:');
for (const event of samples) {
  const eventDate = new Date(event.start_date);
  console.log(`   - ${event.title} @ ${event.venue_name}`);
  console.log(`     Date: ${eventDate.toLocaleDateString('en-US')}`);
}

if (toDelete.count > 5) {
  console.log(`   ... and ${toDelete.count - 5} more\n`);
} else {
  console.log('');
}

// Perform deletion
console.log('🗑️  Deleting old events...');
const deleteStmt = db.prepare('DELETE FROM events WHERE start_date < ?');
const result = deleteStmt.run(cutoffISO);

console.log(`✅ Deleted ${result.changes} events\n`);

// Show updated stats
const statsQuery = db.prepare(`
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN date(start_date) >= date('now') THEN 1 END) as upcoming,
    COUNT(CASE WHEN date(start_date) < date('now') THEN 1 END) as past
  FROM events
`);
const stats = statsQuery.get() as { total: number; upcoming: number; past: number };

console.log('📊 Database Stats After Cleanup:');
console.log(`   Total events: ${stats.total}`);
console.log(`   Upcoming: ${stats.upcoming}`);
console.log(`   Past (within ${retentionDays} days): ${stats.past}\n`);

console.log('✅ Cleanup complete!\n');
