#!/usr/bin/env bun
/**
 * Batch Venue Review Script
 *
 * Auto-processes obvious venue decisions based on patterns:
 * - Known Athens venues → approve
 * - Known non-Athens cities → reject
 * - Ambiguous venues → skip for manual review
 *
 * Usage:
 *   bun run scripts/batch-venue-review.ts --dry-run    # Preview changes
 *   bun run scripts/batch-venue-review.ts              # Apply changes
 */

import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const VENUES_PATH = join(import.meta.dir, '../config/athens-venues.json');
const REJECTED_PATH = join(import.meta.dir, '../config/rejected-locations.json');

// Known Athens indicators (venue name contains these = likely Athens)
const ATHENS_INDICATORS = [
  'αθήνα', 'athens', 'αθηνών', 'αθηνα',
  'μεγαρο μουσικης', 'megaro', 'megaron',
  'snfcc', 'κπισν', 'σνφ', 'stavros niarchos',
  'onassis', 'ωνάση', 'στέγη',
  'lycabettus', 'λυκαβηττ',
  'ηρώδειο', 'herodion', 'odeon of herodes',
  'gazarte', 'gazart',
  'gagarin', 'γκαγκάριν',
  'half note',
  'romantso', 'ρομαντσο',
  'six dogs', '6 dogs',
  'bios', 'μπιος',
  'temple athens', 'temple',  // Temple club Athens
  'universe athens', 'universe',
  'smut athens',
  'it athens',
  'gustav athens', 'gustav',
  'aux club',
  'astron club', 'astron',
  'skull bar',
  'oddity club', 'oddity,', 'oddity',
  'κύτταρο', 'kyttaro', 'κυτταρο',
  'σταυρός του νότου', 'stavros tou notou', 'σταυροσ του νοτου', 'σταυρος του νοτου',
  'θέατρο παλλάς', 'pallas', 'παλλάς', 'μικρό παλλάς', 'θεατρο παλλας',
  'coronet',
  'ilion plus', 'ίλιον',
  'an club',
  'piraeus', 'πειραι', // Greater Athens
  'αιγάλεω', 'aigaleo',
  'άλιμος', 'alimos', 'φάληρο', 'faliro',
  'γλυφάδα', 'glyfada',
  'κηφισιά', 'kifisia',
  'μαρούσι', 'marousi',
  'χαλάνδρι', 'chalandri',
  'ψυχικό', 'psychiko',
  'ωδείο αθηνών', 'ωδείο',
  'parnassos', 'παρνασσ',
  'φιλιππος νακας', 'nakas', 'φίλιππος νάκας',
  'μουσική βιβλιοθήκη',
  'newman cinema',
  'burger disco',
  'bolivar',
  'arch club',
  '2ten',
  'myrtillo',
  'καφεθέατρο',
  'ράδιο', 'ραδιο',
  'live music space',
  'theatre of the no', 'theater of the no',
  // Additional Athens venues
  'ολύμπια', 'olympia', 'μαρία κάλλας', 'maria callas',
  'οακα', 'oaka', 'olympic',
  'νέου κόσμου', 'neos kosmos', 'new world',
  'αλκυονίς', 'alcyon',
  'δίπυλον', 'dipylon',
  'ακροπόλ', 'acropol',
  'θεοχαράκη', 'theocharakis',
  'άλσος', 'alsos',
  'vox',
  'underflow',
  'red jasper',
  'patision', 'πατησίων',
  'naos',
  'libertine',
  'jazzet',
  'floyd',
  'el chapo',
  'couleur locale',
  'botoxe', 'bòtoxe',
  'block 33',
  'baumstrasse',
  'auditorium',
  'electra palace',
  'victoria', // Victoria area Athens
  'αρχιτεκτονική',
  'κάτια δανδουλάκη', 'dandoulaki',
  'πορεία',
  // More Athens-specific
  'αστόρια', 'astoria',
  'μητρόπουλος', 'mitropoulos',
  'τριάντη', 'trianti',
  'atharea',
  'αρχιτεκτονικη live',
  'arroyo',  // Arroyo Theater is in Athens
  'brecht', 'μπρεχτ',
  'δαΐς', 'dais',
  'st paul', 'st. paul', 'αγγλικανικ', 'anglican',
  'φιατ',  // FIAT venue Athens
  'roes theater', 'roes',  // Athens theater
];

// Known non-Athens cities (venue name contains these = reject)
const NON_ATHENS_CITIES = [
  'ηρακλείου', 'ηρακλειο', 'heraklion', 'crete', 'κρήτη',
  'θεσσαλονίκη', 'thessaloniki', 'salonica',
  'πάτρα', 'patras', 'απολλωνα πατρας',
  'βόλος', 'βολου', 'volos',
  'λάρισα', 'λαρισα', 'larissa', 'ael fc', 'ael arena',
  'ιωάννινα', 'ioannina', 'ζωσιμαδες',
  'καβάλα', 'kavala',
  'ρόδος', 'rhodes',
  'κέρκυρα', 'corfu', 'πολυτεχνο - κερκυρα',
  'χανιά', 'chania',
  'ρέθυμνο', 'rethymno',
  'κομοτηνή', 'komotini',
  'αλεξανδρούπολη', 'alexandroupoli',
  'σέρρες', 'serres',
  'δράμα', 'drama',
  'ξάνθη', 'xanthi',
  'τρίκαλα', 'trikala',
  'καρδίτσα', 'karditsa',
  'λαμία', 'lamia',
  'χαλκίδα', 'chalkida', 'εύβοια', 'evia', 'αμαρυνθου', 'αμάρυνθος',
  'κόρινθος', 'corinth',
  'καλαμάτα', 'kalamata',
  'σπάρτη', 'sparta',
  'τρίπολη', 'tripoli',
  'άργος', 'argos',
  'ναύπλιο', 'nafplio',
  'μυτιλήνη', 'mytilene', 'lesbos',
  'χίος', 'chios',
  'σάμος', 'samos',
  'κως', 'kos',
  'σαντορίνη', 'santorini',
  'μύκονος', 'mykonos',
  'πάρος', 'paros',
  'νάξος', 'naxos',
  'κύπρος', 'cyprus', 'nicosia', 'λευκωσία',
  // Thessaloniki venues
  'χαριλαου', 'βικελιδης', 'mylos', 'μύλος',
];

interface VenueStats {
  venue_name: string;
  event_count: number;
  sources: string;
}

function parseArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes('--dry-run') };
}

function getUnverifiedVenues(db: Database): VenueStats[] {
  return db.prepare(`
    SELECT
      venue_name,
      COUNT(*) as event_count,
      GROUP_CONCAT(DISTINCT source) as sources
    FROM events
    WHERE location_status = 'unverified'
    GROUP BY venue_name
    ORDER BY event_count DESC
  `).all() as VenueStats[];
}

function classifyVenue(venueName: string): 'approve' | 'reject' | 'skip' {
  const normalized = venueName.toLowerCase();

  // Check for non-Athens cities first (more specific)
  for (const city of NON_ATHENS_CITIES) {
    if (normalized.includes(city)) {
      return 'reject';
    }
  }

  // Check for Athens indicators
  for (const indicator of ATHENS_INDICATORS) {
    if (normalized.includes(indicator)) {
      return 'approve';
    }
  }

  return 'skip';
}

function updateVenueStatus(db: Database, venueName: string, status: 'verified_athens' | 'rejected_non_athens'): number {
  const result = db.prepare(`
    UPDATE events
    SET location_status = ?, updated_at = ?
    WHERE venue_name = ? AND location_status = 'unverified'
  `).run(status, new Date().toISOString(), venueName);
  return result.changes;
}

function addToWhitelist(venueName: string): void {
  const config = JSON.parse(readFileSync(VENUES_PATH, 'utf-8'));

  // Add to venues array if not already present
  const normalizedName = venueName.trim();
  const exists = config.venues.some((v: any) =>
    v.canonical === normalizedName ||
    (v.variations && v.variations.includes(normalizedName))
  );

  if (!exists) {
    config.venues.push({
      canonical: normalizedName,
      variations: [],
      neighborhood: null,
      address: null
    });
    writeFileSync(VENUES_PATH, JSON.stringify(config, null, 2));
  }
}

function addToBlacklist(venueName: string): void {
  const config = JSON.parse(readFileSync(REJECTED_PATH, 'utf-8'));

  const normalizedName = venueName.trim();
  // Check if venue already exists
  const exists = config.venues.some((v: any) => v.name === normalizedName);

  if (!exists) {
    config.venues.push({
      name: normalizedName,
      reason: "Auto-rejected by batch review"
    });
    config.last_updated = new Date().toISOString().split('T')[0];
    writeFileSync(REJECTED_PATH, JSON.stringify(config, null, 2));
  }
}

function main(): void {
  const { dryRun } = parseArgs();

  console.log('=== Batch Venue Review ===\n');
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  const db = new Database(DB_PATH);
  const venues = getUnverifiedVenues(db);

  console.log(`Found ${venues.length} unverified venue(s)\n`);

  const results = {
    approved: [] as { name: string; events: number }[],
    rejected: [] as { name: string; events: number }[],
    skipped: [] as { name: string; events: number }[]
  };

  for (const venue of venues) {
    const decision = classifyVenue(venue.venue_name);

    if (decision === 'approve') {
      results.approved.push({ name: venue.venue_name, events: venue.event_count });
      if (!dryRun) {
        updateVenueStatus(db, venue.venue_name, 'verified_athens');
        addToWhitelist(venue.venue_name);
      }
    } else if (decision === 'reject') {
      results.rejected.push({ name: venue.venue_name, events: venue.event_count });
      if (!dryRun) {
        updateVenueStatus(db, venue.venue_name, 'rejected_non_athens');
        addToBlacklist(venue.venue_name);
      }
    } else {
      results.skipped.push({ name: venue.venue_name, events: venue.event_count });
    }
  }

  db.close();

  // Print results
  console.log(`\n=== Results ===\n`);

  if (results.approved.length > 0) {
    const totalApproved = results.approved.reduce((sum, v) => sum + v.events, 0);
    console.log(`✅ APPROVED (${results.approved.length} venues, ${totalApproved} events):`);
    for (const v of results.approved) {
      console.log(`   ${v.name} (${v.events} events)`);
    }
  }

  if (results.rejected.length > 0) {
    const totalRejected = results.rejected.reduce((sum, v) => sum + v.events, 0);
    console.log(`\n❌ REJECTED (${results.rejected.length} venues, ${totalRejected} events):`);
    for (const v of results.rejected) {
      console.log(`   ${v.name} (${v.events} events)`);
    }
  }

  if (results.skipped.length > 0) {
    const totalSkipped = results.skipped.reduce((sum, v) => sum + v.events, 0);
    console.log(`\n⏭️  SKIPPED - Need manual review (${results.skipped.length} venues, ${totalSkipped} events):`);
    for (const v of results.skipped.slice(0, 20)) {
      console.log(`   ${v.name} (${v.events} events)`);
    }
    if (results.skipped.length > 20) {
      console.log(`   ... and ${results.skipped.length - 20} more`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Approved: ${results.approved.length} venues (${results.approved.reduce((s, v) => s + v.events, 0)} events)`);
  console.log(`Rejected: ${results.rejected.length} venues (${results.rejected.reduce((s, v) => s + v.events, 0)} events)`);
  console.log(`Skipped:  ${results.skipped.length} venues (${results.skipped.reduce((s, v) => s + v.events, 0)} events)`);

  if (dryRun && (results.approved.length > 0 || results.rejected.length > 0)) {
    console.log('\n💡 Run without --dry-run to apply these changes.');
  } else if (!dryRun && (results.approved.length > 0 || results.rejected.length > 0)) {
    console.log('\n✅ Changes applied!');
    console.log('   Run `bun run build` to regenerate the site.');
  }

  if (results.skipped.length > 0) {
    console.log(`\n📝 To review remaining venues manually:`);
    console.log(`   bun run scripts/review-venues.ts`);
  }
}

main();
