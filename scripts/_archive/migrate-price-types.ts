#!/usr/bin/env bun
/**
 * Migration Script: Update price_type values in database
 *
 * Changes:
 *   - 'free' → 'open'
 *   - 'paid' → 'with-ticket'
 *   - 'donation' remains unchanged
 *
 * Usage:
 *   bun run scripts/migrate-price-types.ts
 *   bun run scripts/migrate-price-types.ts --dry-run
 */

import Database from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const db = new Database(DB_PATH);

const isDryRun = process.argv.includes('--dry-run');

console.log('🔄 Price Type Migration Script');
console.log('================================');
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
console.log('');

// Check current state
const currentCounts = db.prepare(`
  SELECT price_type, COUNT(*) as count
  FROM events
  GROUP BY price_type
  ORDER BY count DESC
`).all() as { price_type: string; count: number }[];

console.log('📊 Current price_type distribution:');
for (const row of currentCounts) {
  console.log(`   ${row.price_type}: ${row.count} events`);
}
console.log('');

// Count events to migrate
const freeCount = db.prepare(`SELECT COUNT(*) as count FROM events WHERE price_type = 'free'`).get() as { count: number };
const paidCount = db.prepare(`SELECT COUNT(*) as count FROM events WHERE price_type = 'paid'`).get() as { count: number };

console.log('📝 Migration plan:');
console.log(`   'free' → 'open': ${freeCount.count} events`);
console.log(`   'paid' → 'with-ticket': ${paidCount.count} events`);
console.log('');

if (isDryRun) {
  console.log('⚠️  DRY RUN - No changes made');
  console.log('   Run without --dry-run to apply changes');
  process.exit(0);
}

// Perform migration
console.log('🔧 Applying migration...');

const updateFree = db.prepare(`UPDATE events SET price_type = 'open' WHERE price_type = 'free'`);
const updatePaid = db.prepare(`UPDATE events SET price_type = 'with-ticket' WHERE price_type = 'paid'`);

try {
  db.transaction(() => {
    const freeResult = updateFree.run();
    console.log(`   ✅ Updated ${freeResult.changes} 'free' → 'open'`);

    const paidResult = updatePaid.run();
    console.log(`   ✅ Updated ${paidResult.changes} 'paid' → 'with-ticket'`);
  })();
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}

// Verify
console.log('');
console.log('📊 Verification - New price_type distribution:');
const newCounts = db.prepare(`
  SELECT price_type, COUNT(*) as count
  FROM events
  GROUP BY price_type
  ORDER BY count DESC
`).all() as { price_type: string; count: number }[];

for (const row of newCounts) {
  console.log(`   ${row.price_type}: ${row.count} events`);
}

// Check for any remaining old values
const oldFree = db.prepare(`SELECT COUNT(*) as count FROM events WHERE price_type = 'free'`).get() as { count: number };
const oldPaid = db.prepare(`SELECT COUNT(*) as count FROM events WHERE price_type = 'paid'`).get() as { count: number };

if (oldFree.count > 0 || oldPaid.count > 0) {
  console.log('');
  console.log('⚠️  Warning: Some old values remain:');
  if (oldFree.count > 0) console.log(`   'free': ${oldFree.count}`);
  if (oldPaid.count > 0) console.log(`   'paid': ${oldPaid.count}`);
} else {
  console.log('');
  console.log('✅ Migration completed successfully!');
  console.log('   All price_type values have been updated.');
}

db.close();
