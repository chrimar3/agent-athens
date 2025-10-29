#!/usr/bin/env bun
/**
 * Remove Duplicate Events Script
 *
 * Finds and removes duplicate events based on title + venue + date
 * Keeps the first occurrence, removes subsequent duplicates
 *
 * Usage: bun run scripts/remove-duplicates.ts
 */

import Database from 'bun:sqlite';

const db = new Database('data/events.db');

console.log('🔍 Checking for duplicate events...\n');

// Find duplicates
const duplicates = db.prepare(`
  SELECT
    title,
    venue_name,
    date(start_date) as date,
    COUNT(*) as count,
    GROUP_CONCAT(id) as ids
  FROM events
  WHERE start_date >= date('now')
  GROUP BY title, venue_name, date(start_date)
  HAVING COUNT(*) > 1
  ORDER BY count DESC;
`).all() as Array<{
  title: string;
  venue_name: string;
  date: string;
  count: number;
  ids: string;
}>;

if (duplicates.length === 0) {
  console.log('✅ No duplicates found!');
  console.log('📊 Database is clean.\n');
  process.exit(0);
}

console.log(`⚠️  Found ${duplicates.length} duplicate event groups:\n`);

let totalToRemove = 0;
const idsToDelete: string[] = [];

duplicates.forEach((dup, index) => {
  const ids = dup.ids.split(',');
  const toRemove = ids.length - 1; // Keep first, remove rest
  totalToRemove += toRemove;

  // Add all IDs except the first one to deletion list
  idsToDelete.push(...ids.slice(1));

  console.log(`${index + 1}. "${dup.title}"`);
  console.log(`   Venue: ${dup.venue_name}`);
  console.log(`   Date: ${dup.date}`);
  console.log(`   Duplicates: ${dup.count} (will remove ${toRemove})`);
  console.log(`   Keeping: ${ids[0]}`);
  console.log(`   Removing: ${ids.slice(1).join(', ')}`);
  console.log('');
});

console.log(`📊 Summary:`);
console.log(`   Duplicate groups: ${duplicates.length}`);
console.log(`   Events to remove: ${totalToRemove}\n`);

// Ask for confirmation
console.log('🗑️  Removing duplicates...');

const deleteStmt = db.prepare('DELETE FROM events WHERE id = ?');

const transaction = db.transaction(() => {
  idsToDelete.forEach(id => {
    deleteStmt.run(id);
  });
});

try {
  transaction();
  console.log(`✅ Successfully removed ${totalToRemove} duplicate events\n`);

  // Verify
  const remaining = db.prepare(`
    SELECT COUNT(*) as total,
           COUNT(DISTINCT title || venue_name || date(start_date)) as unique_count
    FROM events
    WHERE start_date >= date('now');
  `).get() as { total: number; unique_count: number };

  console.log('📊 Verification:');
  console.log(`   Total events: ${remaining.total}`);
  console.log(`   Unique events: ${remaining.unique_count}`);

  if (remaining.total === remaining.unique_count) {
    console.log('   ✅ All events are unique!\n');
  } else {
    console.log(`   ⚠️  Still ${remaining.total - remaining.unique_count} duplicates remaining\n`);
  }

} catch (error) {
  console.error('❌ Error removing duplicates:', error);
  process.exit(1);
}

db.close();
