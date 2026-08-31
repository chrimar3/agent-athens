#!/usr/bin/env bun
/**
 * Athens-Only Event Filter (Spec-Compliant)
 *
 * Processes all events through the location filter:
 * - Assigns location_status based on config/athens-venues.json whitelist
 * - Rejects events matching config/rejected-locations.json blacklist
 * - Logs all rejections to rejected_events table
 *
 * Usage: bun run scripts/filter-athens-only.ts [--dry-run]
 *
 * @see specs/001-data-pipeline/spec.md (FR-B)
 * @see src/quality/location-filter.ts
 */

import Database from 'bun:sqlite';
import {
  checkLocation,
  categorizeEvents,
  getFilterStats,
  type LocationResult,
  type EventLocation,
} from '../src/quality/location-filter';

const db = new Database('data/events.db');
const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}

console.log('🗺️  Athens Location Filter - Spec Compliant\n');
console.log('='.repeat(60) + '\n');

// ============================================================================
// Step 1: Load all events
// ============================================================================
console.log('📥 Loading events from database...');

interface DBEvent {
  id: string;
  title: string;
  description: string | null;
  venue_name: string;
  venue_address: string | null;
  venue_neighborhood: string | null;
  start_date: string;
  source: string;
  location_status: string | null;
}

const events = db.prepare(`
  SELECT
    id, title, description, venue_name, venue_address,
    venue_neighborhood, start_date, source, location_status
  FROM events
  WHERE COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
`).all() as DBEvent[];

console.log(`   Loaded ${events.length} upcoming events\n`);

// ============================================================================
// Step 2: Process each event through location filter
// ============================================================================
console.log('🔍 Processing events through location filter...\n');

interface ProcessedEvent {
  event: DBEvent;
  result: LocationResult;
}

const processed: ProcessedEvent[] = [];

for (const event of events) {
  // Convert to EventLocation interface
  const eventLocation: EventLocation = {
    title: event.title,
    description: event.description || undefined,
    // S224: source feeds the nationwide-source multi-venue guard — dropping
    // it here silently disabled the guard on the live path (unit tests
    // passed, production didn't demote).
    source: event.source,
    venue_name: event.venue_name,
    venue_address: event.venue_address || undefined,
    venue_neighborhood: event.venue_neighborhood || undefined,
  };

  const result = checkLocation(eventLocation);
  processed.push({ event, result });
}

// ============================================================================
// Step 3: Categorize results
// ============================================================================
const byStatus = {
  verified_athens: processed.filter(p => p.result.status === 'verified_athens'),
  pass_through: processed.filter(p => p.result.status === 'pass_through'),
  unverified: processed.filter(p => p.result.status === 'unverified'),
  rejected_non_athens: processed.filter(p => p.result.status === 'rejected_non_athens'),
  problematic: processed.filter(p => p.result.status === 'problematic'),
};

console.log('📊 Location Filter Results:\n');
console.log(`   ✅ Verified Athens: ${byStatus.verified_athens.length}`);
console.log(`   ↪️  Pass-through: ${byStatus.pass_through.length}`);
console.log(`   ❓ Unverified: ${byStatus.unverified.length}`);
console.log(`   ❌ Rejected (non-Athens): ${byStatus.rejected_non_athens.length}`);
console.log(`   ⚠️  Problematic: ${byStatus.problematic.length}`);
console.log('');

// ============================================================================
// Step 4: Show rejected events
// ============================================================================
if (byStatus.rejected_non_athens.length > 0) {
  console.log('❌ Non-Athens events to reject:\n');

  for (const { event, result } of byStatus.rejected_non_athens.slice(0, 10)) {
    console.log(`   • "${event.title}"`);
    console.log(`     Venue: ${event.venue_name}`);
    console.log(`     Reason: ${result.rejection_reason}`);
    console.log('');
  }

  if (byStatus.rejected_non_athens.length > 10) {
    console.log(`   ... and ${byStatus.rejected_non_athens.length - 10} more\n`);
  }
}

// ============================================================================
// Step 5: Show problematic events
// ============================================================================
if (byStatus.problematic.length > 0) {
  console.log('⚠️  Problematic events to flag:\n');

  for (const { event, result } of byStatus.problematic.slice(0, 5)) {
    console.log(`   • "${event.title}"`);
    console.log(`     Venue: ${event.venue_name}`);
    console.log(`     Reason: ${result.rejection_reason}`);
    console.log('');
  }

  if (byStatus.problematic.length > 5) {
    console.log(`   ... and ${byStatus.problematic.length - 5} more\n`);
  }
}

// ============================================================================
// Step 6: Show unverified events (for potential whitelist additions)
// ============================================================================
if (byStatus.unverified.length > 0) {
  console.log('❓ Unverified venues (potential whitelist additions):\n');

  // Group by venue name
  const venueGroups = new Map<string, number>();
  for (const { event } of byStatus.unverified) {
    const count = venueGroups.get(event.venue_name) || 0;
    venueGroups.set(event.venue_name, count + 1);
  }

  // Sort by count
  const sortedVenues = Array.from(venueGroups.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  for (const [venue, count] of sortedVenues) {
    console.log(`   • ${venue}: ${count} event(s)`);
  }

  if (venueGroups.size > 20) {
    console.log(`   ... and ${venueGroups.size - 20} more venues\n`);
  }
  console.log('');
}

// ============================================================================
// Step 7: Apply changes
// ============================================================================
if (!DRY_RUN) {
  console.log('='.repeat(60));
  console.log('📝 Applying changes...\n');

  // Prepare statements
  const updateStatusStmt = db.prepare(`
    UPDATE events
    SET location_status = ?
    WHERE id = ?
  `);

  const updateWithVenueStmt = db.prepare(`
    UPDATE events
    SET location_status = ?,
        venue_name = COALESCE(?, venue_name)
    WHERE id = ?
  `);

  const insertRejectedStmt = db.prepare(`
    INSERT OR IGNORE INTO rejected_events
    (original_id, title, date, venue, source, rejection_reason, location_status, rejected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteEventStmt = db.prepare(`
    DELETE FROM events WHERE id = ?
  `);

  // Transaction for atomic updates
  const transaction = db.transaction(() => {
    let updated = 0;
    let deleted = 0;
    let logged = 0;

    for (const { event, result } of processed) {
      if (result.status === 'rejected_non_athens') {
        // Log rejection
        insertRejectedStmt.run(
          event.id,
          event.title,
          event.start_date,
          event.venue_name,
          event.source,
          result.rejection_reason || 'Non-Athens location',
          result.status,
          new Date().toISOString()
        );
        logged++;

        // Delete event
        deleteEventStmt.run(event.id);
        deleted++;
      } else if (result.status === 'verified_athens' && result.matched_venue) {
        // Update with canonical venue name
        updateWithVenueStmt.run(result.status, result.matched_venue, event.id);
        updated++;
      } else {
        // Update status only
        updateStatusStmt.run(result.status, event.id);
        updated++;
      }
    }

    return { updated, deleted, logged };
  });

  const { updated, deleted, logged } = transaction();

  console.log(`   ✅ Updated ${updated} events with location_status`);
  console.log(`   ❌ Deleted ${deleted} rejected events`);
  console.log(`   📋 Logged ${logged} rejections to rejected_events table`);
  console.log('');
}

// ============================================================================
// Final Summary
// ============================================================================
console.log('='.repeat(60));
console.log('📊 FINAL SUMMARY\n');

const finalStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN location_status = 'verified_athens' THEN 1 ELSE 0 END) as verified,
    SUM(CASE WHEN location_status = 'pass_through' THEN 1 ELSE 0 END) as pass_through,
    SUM(CASE WHEN location_status = 'unverified' THEN 1 ELSE 0 END) as unverified,
    SUM(CASE WHEN location_status = 'problematic' THEN 1 ELSE 0 END) as problematic
  FROM events
  WHERE COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
`).get() as {
  total: number;
  verified: number;
  pass_through: number;
  unverified: number;
  problematic: number;
};

const rejectedCount = db.prepare(`
  SELECT COUNT(*) as count FROM rejected_events
`).get() as { count: number };

console.log(`Events remaining: ${finalStats.total}`);
console.log(`   ✅ Verified Athens: ${finalStats.verified}`);
console.log(`   ↪️  Pass-through: ${finalStats.pass_through}`);
console.log(`   ❓ Unverified: ${finalStats.unverified}`);
console.log(`   ⚠️  Problematic: ${finalStats.problematic}`);
console.log(`\nRejected events logged: ${rejectedCount.count}`);
console.log(`\n🌐 Events that will show on site: ${finalStats.verified + finalStats.pass_through}`);

if (DRY_RUN) {
  console.log('\n💡 Run without --dry-run to apply changes');
}

db.close();

console.log('\n✅ Filter complete!\n');
