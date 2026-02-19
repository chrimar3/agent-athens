#!/usr/bin/env bun
/**
 * Venue Review CLI - Interactive Venue Verification
 *
 * Allows manual review of unverified venues:
 * - List unverified venues and their event counts
 * - Approve: Add to whitelist, mark events as verified_athens
 * - Reject: Add to blacklist, move events to rejected_events
 * - Skip: Leave unchanged for later review
 *
 * @see specs/001-data-pipeline/tasks.md (Task 2.7)
 * @see tests/scripts/review-venues.test.ts
 */

import Database from 'bun:sqlite';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';

// Valid neighborhoods from our taxonomy
const VALID_NEIGHBORHOODS = [
  'Gazi', 'Exarchia', 'Psiri', 'Koukaki', 'Monastiraki',
  'Metaxourgeio', 'Kolonaki', 'Piraeus', 'Neos-Kosmos', 'Mets',
  'Petralona', 'Kypseli', 'Tavros', 'Athens-Riviera', 'Pangrati',
  'Ampelokipoi', 'Syntagma', 'Plaka', 'Thissio', 'Chalandri',
  'Marousi', 'Glyfada', 'Vouliagmeni', 'Kifisia'
];

// ============================================================================
// Configuration
// ============================================================================

const DB_PATH = 'data/events.db';
const VENUES_CONFIG_PATH = 'config/athens-venues.json';
const REJECTED_CONFIG_PATH = 'config/rejected-locations.json';

// ============================================================================
// Types
// ============================================================================

interface UnverifiedVenue {
  venue_name: string;
  event_count: number;
  sources: string;
  sample_titles: string;
}

interface VenueConfig {
  canonical_name: string;
  variations: string[];
  neighborhood?: string;
}

interface RejectedVenue {
  name: string;
  reason: string;
}

// ============================================================================
// Database Functions
// ============================================================================

function getUnverifiedVenues(db: Database): UnverifiedVenue[] {
  return db.prepare(`
    SELECT
      venue_name,
      COUNT(*) as event_count,
      GROUP_CONCAT(DISTINCT source) as sources,
      GROUP_CONCAT(title, ' | ') as sample_titles
    FROM events
    WHERE location_status = 'unverified'
    GROUP BY venue_name
    ORDER BY event_count DESC
  `).all() as UnverifiedVenue[];
}

function approveVenue(
  db: Database,
  venueName: string,
  canonicalName: string,
  neighborhood: string = 'Unknown'
): void {
  // Load current config
  const configPath = join(process.cwd(), VENUES_CONFIG_PATH);
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Check if venue already exists
  const existingVenue = config.venues.find((v: VenueConfig) =>
    v.canonical_name.toLowerCase() === canonicalName.toLowerCase()
  );

  if (existingVenue) {
    // Add as variation if not already present
    if (!existingVenue.variations.includes(venueName) &&
        venueName.toLowerCase() !== existingVenue.canonical_name.toLowerCase()) {
      existingVenue.variations.push(venueName);
      console.log(`  Added "${venueName}" as variation of "${existingVenue.canonical_name}"`);
    }
  } else {
    // Add as new venue
    const newVenue: VenueConfig = {
      canonical_name: canonicalName,
      variations: venueName !== canonicalName ? [venueName] : [],
      neighborhood: neighborhood,
    };
    config.venues.push(newVenue);
    console.log(`  Added new venue: "${canonicalName}" (${neighborhood})`);
  }

  // Save updated config
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Update events in database
  const result = db.prepare(`
    UPDATE events
    SET location_status = 'verified_athens'
    WHERE venue_name = ?
  `).run(venueName);

  console.log(`  Updated ${result.changes} events to verified_athens`);
}

function rejectVenue(
  db: Database,
  venueName: string,
  reason: string
): void {
  // Load current config
  const configPath = join(process.cwd(), REJECTED_CONFIG_PATH);
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Add to blacklist
  if (!config.venues) config.venues = [];
  config.venues.push({
    name: venueName,
    reason: reason,
  } as RejectedVenue);

  // Save updated config
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  Added "${venueName}" to blacklist: ${reason}`);

  // Move events to rejected_events
  const events = db.prepare(`
    SELECT id, title, date(start_date) as date, venue_name, source
    FROM events
    WHERE venue_name = ?
  `).all(venueName) as Array<{
    id: string;
    title: string;
    date: string;
    venue_name: string;
    source: string;
  }>;

  const insertStmt = db.prepare(`
    INSERT INTO rejected_events (original_id, title, date, venue, source, rejection_reason, location_status, rejected_at)
    VALUES (?, ?, ?, ?, ?, ?, 'rejected_non_athens', datetime('now'))
  `);

  for (const event of events) {
    insertStmt.run(event.id, event.title, event.date, event.venue_name, event.source, reason);
  }

  // Delete from events table
  const deleteResult = db.prepare(`DELETE FROM events WHERE venue_name = ?`).run(venueName);

  console.log(`  Moved ${deleteResult.changes} events to rejected_events`);
}

// ============================================================================
// CLI Interface
// ============================================================================

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function reviewVenue(
  rl: readline.Interface,
  db: Database,
  venue: UnverifiedVenue,
  index: number,
  total: number
): Promise<'continue' | 'quit'> {
  console.log('\n' + '='.repeat(60));
  console.log(`Venue ${index + 1}/${total}: "${venue.venue_name}"`);
  console.log('='.repeat(60));
  console.log(`Events: ${venue.event_count}`);
  console.log(`Sources: ${venue.sources}`);
  console.log(`Sample titles:`);

  // Show first 3 titles
  const titles = venue.sample_titles.split(' | ').slice(0, 3);
  titles.forEach(t => console.log(`  - ${t.substring(0, 60)}${t.length > 60 ? '...' : ''}`));

  // Google Maps link for quick verification
  const mapsQuery = encodeURIComponent(`${venue.venue_name} Athens Greece`);
  console.log(`\n🗺️  https://www.google.com/maps/search/${mapsQuery}`);

  console.log('\nActions:');
  console.log('  [a] Approve - Add to Athens whitelist');
  console.log('  [r] Reject  - Add to blacklist (non-Athens)');
  console.log('  [s] Skip    - Leave for later');
  console.log('  [q] Quit    - Exit review');

  const action = await prompt(rl, '\nAction [a/r/s/q]: ');

  switch (action.toLowerCase()) {
    case 'a':
    case 'approve':
      const canonical = await prompt(rl, `Canonical name [${venue.venue_name}]: `);
      const canonicalName = canonical || venue.venue_name;

      console.log(`  Neighborhoods: ${VALID_NEIGHBORHOODS.join(', ')}`);
      const neighborhood = await prompt(rl, 'Neighborhood [Unknown]: ');
      const neighborhoodName = neighborhood || 'Unknown';

      approveVenue(db, venue.venue_name, canonicalName, neighborhoodName);
      console.log('\n✅ Venue approved!');
      return 'continue';

    case 'r':
    case 'reject':
      const reason = await prompt(rl, 'Rejection reason: ');
      if (!reason) {
        console.log('❌ Rejection reason is required. Skipping.');
        return 'continue';
      }
      rejectVenue(db, venue.venue_name, reason);
      console.log('\n❌ Venue rejected!');
      return 'continue';

    case 's':
    case 'skip':
      console.log('\n⏭️  Skipped');
      return 'continue';

    case 'q':
    case 'quit':
      return 'quit';

    default:
      console.log('\n⚠️  Unknown action. Skipping.');
      return 'continue';
  }
}

async function main(): Promise<void> {
  console.log('🔍 Venue Review CLI');
  console.log('='.repeat(60) + '\n');

  // Check for --list flag
  const listOnly = process.argv.includes('--list');

  // Backup database before any changes (skip for --list mode)
  if (!listOnly) {
    const backupPath = `data/events.db.backup-${Date.now()}`;
    copyFileSync(DB_PATH, backupPath);
    console.log(`💾 Database backed up to ${backupPath}\n`);
  }

  // Open database
  const db = new Database(DB_PATH);

  // Get unverified venues
  const venues = getUnverifiedVenues(db);

  if (venues.length === 0) {
    console.log('✅ No unverified venues found. All venues are verified!\n');
    db.close();
    return;
  }

  console.log(`Found ${venues.length} unverified venue(s):\n`);

  // List mode
  if (listOnly) {
    venues.forEach((v, i) => {
      console.log(`${i + 1}. "${v.venue_name}" (${v.event_count} events) - Sources: ${v.sources}`);
    });
    console.log('');
    db.close();
    return;
  }

  // Interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    for (let i = 0; i < venues.length; i++) {
      const result = await reviewVenue(rl, db, venues[i], i, venues.length);
      if (result === 'quit') {
        break;
      }
    }
  } finally {
    rl.close();
    db.close();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Review session complete!');
  console.log('='.repeat(60) + '\n');

  // Show final stats
  const finalDb = new Database(DB_PATH, { readonly: true });
  const stats = finalDb.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN location_status = 'verified_athens' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN location_status = 'unverified' THEN 1 ELSE 0 END) as unverified
    FROM events
  `).get() as { total: number; verified: number; unverified: number };

  console.log('Final Statistics:');
  console.log(`  Total events: ${stats.total}`);
  console.log(`  Verified: ${stats.verified}`);
  console.log(`  Unverified: ${stats.unverified}`);
  console.log('');

  finalDb.close();
}

// Run CLI
main().catch(console.error);
