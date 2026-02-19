#!/usr/bin/env bun
/**
 * Venue-Level Enrichment Script
 * ==============================
 *
 * Interactive workflow for enriching venue context data.
 * The Claude Code session IS the enrichment — no API calls needed.
 *
 * Usage:
 *   bun run scripts/enrich-venues.ts --list           # Show venues by event count
 *   bun run scripts/enrich-venues.ts --venue "Name"   # Show venue context + enrichment prompt
 *   bun run scripts/enrich-venues.ts --stats          # Venue coverage summary
 *
 * @see src/db/migrations/003-venue-enrichment.sql
 */

import Database from 'bun:sqlite';

const DB_PATH = 'data/events.db';

// ============================================================================
// Types
// ============================================================================

interface VenueStats {
  venue_name: string;
  event_count: number;
  has_description: boolean;
  enrichment_status: string | null;
  neighborhood: string | null;
}

interface VenueContext {
  venue_name: string;
  neighborhood: string | null;
  description: string | null;
  venue_type: string | null;
  capacity: number | null;
  established_year: number | null;
  getting_there: string | null;
  what_to_expect: string | null;
  good_to_know: string | null;
  enrichment_status: string | null;
  enriched_at: string | null;
}

// ============================================================================
// Database
// ============================================================================

function openDatabase(): Database {
  return new Database(DB_PATH);
}

function checkMigration(db: Database): boolean {
  // Check if enrichment columns exist
  try {
    db.prepare('SELECT getting_there FROM venue_context LIMIT 1').get();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// List Venues
// ============================================================================

function showVenueList(db: Database): void {
  // Get venues with event counts
  const venues = db.prepare(`
    SELECT
      e.venue_name,
      COUNT(*) as event_count,
      CASE WHEN vc.description IS NOT NULL AND vc.description != '' THEN 1 ELSE 0 END as has_description,
      vc.enrichment_status,
      vc.neighborhood
    FROM events e
    LEFT JOIN venue_context vc ON e.venue_name = vc.venue_name
    WHERE e.location_status IN ('verified_athens', 'pass_through')
    AND e.start_date >= date('now')
    GROUP BY e.venue_name
    ORDER BY event_count DESC
  `).all() as VenueStats[];

  console.log('\n🏛️  Venues by Event Count:\n');
  console.log('='.repeat(80));
  console.log(`${'Venue'.padEnd(40)} ${'Events'.padStart(6)} ${'Status'.padEnd(12)} Neighborhood`);
  console.log('─'.repeat(80));

  for (const v of venues) {
    const status = v.has_description
      ? (v.enrichment_status === 'completed' ? '✅ enriched' : '📝 partial')
      : '⚪ pending';
    const neighborhood = v.neighborhood || '-';
    console.log(
      `${(v.venue_name || 'Unknown').slice(0, 38).padEnd(40)} ` +
      `${v.event_count.toString().padStart(6)} ` +
      `${status.padEnd(12)} ` +
      `${neighborhood}`
    );
  }

  console.log('─'.repeat(80));
  console.log(`Total: ${venues.length} venues\n`);
}

// ============================================================================
// Show Venue
// ============================================================================

function showVenue(db: Database, venueName: string): void {
  // Get venue context
  const venue = db.prepare(`
    SELECT * FROM venue_context WHERE venue_name = ?
  `).get(venueName) as VenueContext | undefined;

  // Get event count
  const eventCount = (db.prepare(`
    SELECT COUNT(*) as count FROM events
    WHERE venue_name = ?
    AND location_status IN ('verified_athens', 'pass_through')
    AND start_date >= date('now')
  `).get(venueName) as { count: number }).count;

  // Get event types at this venue
  const eventTypes = db.prepare(`
    SELECT type, COUNT(*) as count FROM events
    WHERE venue_name = ?
    AND location_status IN ('verified_athens', 'pass_through')
    AND start_date >= date('now')
    GROUP BY type
    ORDER BY count DESC
  `).all(venueName) as Array<{ type: string; count: number }>;

  console.log('\n🏛️  Venue Details:');
  console.log('='.repeat(60));
  console.log(`Venue: ${venueName}`);
  console.log(`Upcoming events: ${eventCount}`);
  console.log(`Event types: ${eventTypes.map(t => `${t.type} (${t.count})`).join(', ')}`);

  if (venue) {
    console.log('\n📋 Current Context:');
    console.log('─'.repeat(60));
    if (venue.neighborhood) console.log(`Neighborhood: ${venue.neighborhood}`);
    if (venue.venue_type) console.log(`Type: ${venue.venue_type}`);
    if (venue.capacity) console.log(`Capacity: ${venue.capacity}`);
    if (venue.established_year) console.log(`Established: ${venue.established_year}`);
    if (venue.description) {
      console.log(`\nDescription:\n${venue.description}`);
    }
    if (venue.getting_there) {
      console.log(`\nGetting there: ${venue.getting_there}`);
    }
    if (venue.what_to_expect) {
      console.log(`\nWhat to expect: ${venue.what_to_expect}`);
    }
    if (venue.good_to_know) {
      console.log(`\nGood to know: ${venue.good_to_know}`);
    }
    console.log(`\nEnrichment status: ${venue.enrichment_status || 'pending'}`);
  } else {
    console.log('\n⚠️  No context stored for this venue');
  }

  // Generate enrichment prompt
  console.log('\n' + '='.repeat(60));
  console.log('📝 ENRICHMENT PROMPT (use in Claude Code session):');
  console.log('='.repeat(60));
  console.log(generateVenueEnrichmentPrompt(venueName, venue, eventTypes));
  console.log('='.repeat(60));

  console.log('\n💡 After generating content, save with:');
  console.log(`   sqlite3 data/events.db "UPDATE venue_context SET \\`);
  console.log(`     description = '<your-description>', \\`);
  console.log(`     getting_there = '<getting-there>', \\`);
  console.log(`     enrichment_status = 'completed', \\`);
  console.log(`     enriched_at = datetime('now') \\`);
  console.log(`   WHERE venue_name = '${venueName}'"`);
}

function generateVenueEnrichmentPrompt(
  venueName: string,
  existing: VenueContext | undefined,
  eventTypes: Array<{ type: string; count: number }>
): string {
  const typesStr = eventTypes.map(t => t.type).join(', ');

  return `
Research and write venue context for: "${venueName}"

**Known information:**
${existing?.neighborhood ? `- Neighborhood: ${existing.neighborhood}` : '- Neighborhood: [research needed]'}
${existing?.venue_type ? `- Type: ${existing.venue_type}` : '- Type: [research needed]'}
- Hosts: ${typesStr || 'various events'}

**Write the following sections:**

1. **Description** (2-3 sentences)
   What is this venue? Character, history, what it's known for.

2. **Getting There** (1-2 sentences)
   Metro station, line, walk time. Taxi recommendation if needed.

3. **What to Expect** (2-3 sentences)
   Atmosphere, crowd character, typical experience arc.

4. **Good to Know** (1-2 insider tips)
   Booking requirements, payment, dress code, anything visitors should know.

**Guidelines:**
- Use second person ("you")
- Show, don't tell (no "amazing" or "incredible")
- Be specific and practical
- If unknown, say "research needed" — don't fabricate

**CRITICAL:** Only use verifiable information. If you can't confirm details, mark as TBC.
`;
}

// ============================================================================
// Stats
// ============================================================================

function showStats(db: Database): void {
  // Total venues with events
  const totalVenues = (db.prepare(`
    SELECT COUNT(DISTINCT venue_name) as count FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
    AND start_date >= date('now')
  `).get() as { count: number }).count;

  // Venues with context
  const withContext = (db.prepare(`
    SELECT COUNT(DISTINCT e.venue_name) as count
    FROM events e
    JOIN venue_context vc ON e.venue_name = vc.venue_name
    WHERE e.location_status IN ('verified_athens', 'pass_through')
    AND e.start_date >= date('now')
    AND vc.description IS NOT NULL AND vc.description != ''
  `).get() as { count: number }).count;

  // Enriched venues
  const enriched = (db.prepare(`
    SELECT COUNT(*) as count FROM venue_context
    WHERE enrichment_status = 'completed'
  `).get() as { count: number }).count;

  console.log('\n📊 Venue Enrichment Stats:');
  console.log('='.repeat(50));
  console.log(`Total venues with events: ${totalVenues}`);
  console.log(`Venues with description:  ${withContext}`);
  console.log(`Fully enriched:           ${enriched}`);

  if (totalVenues > 0) {
    const coverage = Math.round((withContext / totalVenues) * 100);
    console.log(`Coverage:                 ${coverage}%`);
  }
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);

  const listMode = args.includes('--list');
  const statsMode = args.includes('--stats');

  const venueArg = args.find(a => a.startsWith('--venue='));
  const venueName = venueArg ? venueArg.split('=').slice(1).join('=') : null;

  // Also support: --venue "Name"
  const venueIdx = args.indexOf('--venue');
  const venueNameAlt = venueIdx !== -1 && args[venueIdx + 1] ? args[venueIdx + 1] : null;

  const finalVenueName = venueName || venueNameAlt;

  console.log('🏛️  Agent Athens - Venue Enrichment');
  console.log('='.repeat(50));

  const db = openDatabase();

  try {
    // Check if migration has been run
    const hasMigration = checkMigration(db);
    if (!hasMigration) {
      console.log('\n⚠️  Migration 003-venue-enrichment.sql not applied');
      console.log('   Run: bun run scripts/run-migrations.ts');
      console.log('   Or manually: sqlite3 data/events.db < src/db/migrations/003-venue-enrichment.sql\n');
    }

    if (listMode) {
      showVenueList(db);
      return;
    }

    if (statsMode) {
      showStats(db);
      return;
    }

    if (finalVenueName) {
      showVenue(db, finalVenueName);
      return;
    }

    // Default: show help
    console.log('\n💡 Usage:');
    console.log('   bun run scripts/enrich-venues.ts --list              # List venues by event count');
    console.log('   bun run scripts/enrich-venues.ts --venue "Name"      # Show venue + enrichment prompt');
    console.log('   bun run scripts/enrich-venues.ts --stats             # Venue coverage stats');

  } finally {
    db.close();
  }
}

main();
