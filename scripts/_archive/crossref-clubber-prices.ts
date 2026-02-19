#!/usr/bin/env bun
/**
 * Cross-reference Clubber.gr prices with Resident Advisor
 *
 * Clubber.gr events don't have online prices (clubs use door entry).
 * Resident Advisor often has prices for the same events.
 *
 * Strategy:
 * 1. Load clubber.gr events with "Door price"
 * 2. Fetch RA events for Athens
 * 3. Match by venue + date (fuzzy matching for event titles)
 * 4. Update clubber.gr events with RA prices
 *
 * Usage:
 *   bun run scripts/crossref-clubber-prices.ts
 *   bun run scripts/crossref-clubber-prices.ts --dry-run   # Don't update DB
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { fetchRAEvents, parseCost } from './scrape-residentadvisor';

const DB_PATH = join(import.meta.dir, '../data/events.db');

// Venue name mappings (Clubber -> RA variations)
const VENUE_ALIASES: Record<string, string[]> = {
  'Astron': ['Astron Club', 'Astron'],
  'Dybbuk': ['Dybbuk', 'Dybbuk Athens'],
  'Smut': ['SMUT Athens', 'SMUT', 'Smut'],
  'Crust': ['Crust'],
  'Universe': ['Universe Athens', 'Universe'],
  'Romantso': ['Romantso'],
  'Oddity': ['Oddity Club', 'Oddity'],
  'IT Athens': ['IT Athens'],
  '2ten': ['2ten'],
  'Ωδείο Αθηνών': ['Odeion', 'Athens Conservatoire'],
  'Cantina Social': ['Cantina Social'],
};

interface ClubberEvent {
  id: string;
  title: string;
  venue_name: string;
  start_date: string;
  price_range: string;
}

interface RAEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  venue: {
    name: string;
    id: string;
  };
  contentUrl: string;
  cost: string;
}

/**
 * Normalize venue name for comparison
 */
function normalizeVenue(venue: string): string {
  return venue
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/athens/gi, '')
    .replace(/club/gi, '')
    .trim();
}

/**
 * Check if two venues match
 */
function venuesMatch(clubberVenue: string, raVenue: string): boolean {
  // Direct match
  if (normalizeVenue(clubberVenue) === normalizeVenue(raVenue)) {
    return true;
  }

  // Check aliases
  for (const [canonical, aliases] of Object.entries(VENUE_ALIASES)) {
    const clubberMatches = clubberVenue.toLowerCase().includes(canonical.toLowerCase()) ||
                           aliases.some(a => clubberVenue.toLowerCase().includes(a.toLowerCase()));
    const raMatches = raVenue.toLowerCase().includes(canonical.toLowerCase()) ||
                      aliases.some(a => raVenue.toLowerCase().includes(a.toLowerCase()));

    if (clubberMatches && raMatches) {
      return true;
    }
  }

  return false;
}

/**
 * Parse clubber date format to YYYY-MM-DD
 */
function parseClubberDate(dateStr: string): string {
  // Format: 2026-01-30T23:00:00+03:00
  return dateStr.split('T')[0];
}

/**
 * Calculate string similarity (Levenshtein-based)
 */
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  // Check for keyword overlap
  const words1 = s1.toLowerCase().split(/\s+/);
  const words2 = s2.toLowerCase().split(/\s+/);
  const common = words1.filter(w => words2.includes(w) && w.length > 2);

  // If more than 2 words in common, likely a match
  if (common.length >= 2) {
    return 0.8;
  }

  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

/**
 * Levenshtein edit distance
 */
function editDistance(s1: string, s2: string): number {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

/**
 * Find matching RA event for a clubber event
 */
function findRAMatch(clubber: ClubberEvent, raEvents: RAEvent[]): RAEvent | null {
  const clubberDate = parseClubberDate(clubber.start_date);

  // Filter RA events by date
  const sameDateEvents = raEvents.filter(ra => {
    const raDate = ra.date.split('T')[0];
    return raDate === clubberDate;
  });

  // Find venue + title match
  for (const ra of sameDateEvents) {
    if (venuesMatch(clubber.venue_name, ra.venue.name)) {
      // Check title similarity
      const titleSim = similarity(clubber.title, ra.title);
      if (titleSim > 0.3) {
        return ra;
      }
    }
  }

  return null;
}

/**
 * Main cross-reference function
 */
async function crossreferenceClubberPrices(options: { dryRun: boolean }) {
  console.log('🔄 Clubber.gr ↔ Resident Advisor Price Cross-Reference\n');

  // Load clubber.gr events with Door price
  const db = new Database(DB_PATH);
  const clubberEvents = db.prepare(`
    SELECT id, title, venue_name, start_date, price_range
    FROM events
    WHERE source = 'clubber.gr' AND price_range = 'Door price'
  `).all() as ClubberEvent[];

  console.log(`📥 Found ${clubberEvents.length} clubber.gr events with "Door price"\n`);

  if (clubberEvents.length === 0) {
    console.log('No events to cross-reference.');
    db.close();
    return;
  }

  // Fetch RA events
  console.log('📥 Fetching Resident Advisor events...');
  const { events: raEvents, total } = await fetchRAEvents(1, 100);
  console.log(`   Got ${raEvents.length} RA events (${total} total)\n`);

  // Cross-reference
  const matches: Array<{
    clubber: ClubberEvent;
    ra: RAEvent;
    price: number | null;
    priceRange: string | null;
  }> = [];

  console.log('🔍 Matching events...\n');

  for (const clubber of clubberEvents) {
    const raMatch = findRAMatch(clubber, raEvents);
    if (raMatch && raMatch.cost) {
      const { price, priceRange } = parseCost(raMatch.cost);
      if (price !== null) {
        matches.push({ clubber, ra: raMatch, price, priceRange });
        console.log(`   ✅ ${clubber.title.substring(0, 40)}`);
        console.log(`      Clubber: ${clubber.venue_name} | Door price`);
        console.log(`      RA:      ${raMatch.venue.name} | ${priceRange}`);
        console.log('');
      }
    }
  }

  console.log(`📊 Summary:`);
  console.log(`   Clubber events: ${clubberEvents.length}`);
  console.log(`   RA matches with price: ${matches.length}`);
  console.log(`   Match rate: ${Math.round(matches.length / clubberEvents.length * 100)}%\n`);

  if (options.dryRun) {
    console.log('🔍 DRY RUN - No changes made to database');
    db.close();
    return;
  }

  // Update database
  let updated = 0;
  const updateStmt = db.prepare(`
    UPDATE events
    SET price_amount = $price,
        price_range = $priceRange,
        price_type = 'paid',
        updated_at = datetime('now')
    WHERE id = $id
  `);

  for (const match of matches) {
    try {
      updateStmt.run({
        $id: match.clubber.id,
        $price: match.price,
        $priceRange: match.priceRange
      });
      updated++;
    } catch (error) {
      console.error(`   ❌ Error updating ${match.clubber.title}:`, error);
    }
  }

  db.close();

  console.log(`\n✅ Updated ${updated} events with RA prices`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

crossreferenceClubberPrices({ dryRun }).catch(console.error);
