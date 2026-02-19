#!/usr/bin/env bun
/**
 * Price Acquisition Chain
 *
 * Implements the PRD price acquisition strategy:
 * 1. Direct price from source (already captured)
 * 2. RA cross-reference (for electronic venues)
 * 3. Venue default pricing (from venue intelligence)
 * 4. Flag as "unknown" for review
 *
 * Also tracks price_source for transparency.
 *
 * Usage:
 *   bun run scripts/price-acquisition-chain.ts              # Run full chain
 *   bun run scripts/price-acquisition-chain.ts --dry-run    # Don't update DB
 *   bun run scripts/price-acquisition-chain.ts --stats      # Show price stats only
 *   bun run scripts/price-acquisition-chain.ts --defaults   # Apply venue defaults only
 *
 * @see config/venue-intelligence.md
 * @see config/ticketing-mapping.json
 */

import Database from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');

// ============================================================================
// Types
// ============================================================================

interface EventWithoutPrice {
  id: string;
  title: string;
  venue_name: string;
  start_date: string;
  price_type: string;
  price_amount: number | null;
  price_source: string | null;
  source: string;
}

type PriceSource = 'direct' | 'crossref_ra' | 'venue_default' | 'unknown';

// ============================================================================
// Venue Default Prices (from venue-intelligence.md)
// ============================================================================

const VENUE_DEFAULT_PRICES: Record<string, {
  typical: number;
  range?: [number, number];
  special_acts?: number;
  door_price?: number;
  notes?: string;
}> = {
  // Jazz Venues
  'Half Note Jazz Club': {
    typical: 15,
    range: [10, 51],
    special_acts: 51,
    notes: 'Table €15-20, bar €10-15, special acts up to €51',
  },

  // Electronic Clubs
  'Astron': {
    typical: 12,
    range: [10, 15],
    notes: 'Usually €10-15',
  },
  'SMUT Athens': {
    typical: 15,
    range: [15, 20],
    notes: 'RA tickets = priority entry, not guaranteed',
  },
  'Romantso': {
    typical: 10,
    range: [8, 15],
    notes: 'Varies by event',
  },
  'Six D.O.G.S': {
    typical: 8,
    range: [8, 12],
    notes: '€8 with wallet app, €10 door',
  },
  'Dybbuk': {
    typical: 10,
    range: [10, 15],
    notes: 'Electronic/experimental',
  },

  // Concert Venues
  'Gazarte': {
    typical: 15,
    range: [10, 25],
    notes: 'Varies by stage and act',
  },
  'Fuzz Club': {
    typical: 20,
    range: [15, 35],
    notes: 'Major acts higher',
  },
  'Gagarin 205': {
    typical: 20,
    range: [15, 40],
    notes: 'Rock/metal venue',
  },
  'Floyd': {
    typical: 25,
    range: [15, 50],
    notes: 'Large capacity shows',
  },

  // Cultural Venues
  'Onassis Stegi': {
    typical: 15,
    range: [10, 35],
    notes: 'Cultural programming',
  },
  'Stavros Niarchos Foundation': {
    typical: 0,
    range: [0, 25],
    notes: 'Many free events',
  },
  'Technopolis': {
    typical: 10,
    range: [0, 20],
    notes: 'Some free events',
  },
  'Megaron - Athens Concert Hall': {
    typical: 25,
    range: [15, 80],
    notes: 'Classical and major acts',
  },

  // Clubs/Bars (usually door entry)
  'Bios': {
    typical: 8,
    range: [5, 12],
    notes: 'Includes drink usually',
  },
  'Death Disco': {
    typical: 10,
    range: [8, 15],
    notes: 'Door entry',
  },
  'AN Club': {
    typical: 10,
    range: [8, 15],
    notes: 'Underground rock venue',
  },
  'Temple': {
    typical: 15,
    range: [12, 20],
    notes: 'Big-room techno',
  },

  // Rebetiko Venues (usually free/consumption)
  'Stoa Athanaton': {
    typical: 0,
    notes: 'Free entry, consumption expected',
  },
  'Klimataria': {
    typical: 0,
    notes: 'Free entry, minimum order expected',
  },
  'Kavouras': {
    typical: 0,
    notes: 'Free entry, consumption expected',
  },

  // Additional Concert Venues
  'Piraeus Club Academy': {
    typical: 20,
    range: [15, 35],
    notes: 'Medium-size rock/metal venue',
  },
  'Κύτταρο': {
    typical: 20,
    range: [15, 35],
    notes: 'Historic rock venue',
  },
  'Σταυρός του Νότου': {
    typical: 15,
    range: [10, 25],
    notes: 'Laiko/entechno venue',
  },
  'Άλσος': {
    typical: 20,
    range: [15, 35],
    notes: 'Open-air summer venue',
  },

  // Electronic/Club Venues
  'Aux Club': {
    typical: 10,
    range: [8, 15],
    notes: 'Underground electronic',
  },
  'N.A.O.S.': {
    typical: 12,
    range: [10, 18],
    notes: 'Not An Ordinary Space - techno',
  },
  'Bolivar': {
    typical: 15,
    range: [10, 25],
    notes: 'Beach club electronic',
  },
  'EXA': {
    typical: 12,
    range: [10, 18],
    notes: 'Electronic/live venue',
  },

  // Theater Venues
  'Studio Μαυρομιχάλη': {
    typical: 15,
    range: [12, 20],
    notes: 'Small theater',
  },
  'Θέατρο ΕΛΕΡ': {
    typical: 15,
    range: [12, 20],
    notes: 'Theater venue',
  },
  'Doors': {
    typical: 15,
    range: [12, 20],
    notes: 'Theater/performance space',
  },
  'Theatre Of The No': {
    typical: 15,
    range: [12, 20],
    notes: 'Alternative theater',
  },
  'Ράδιο': {
    typical: 12,
    range: [10, 18],
    notes: 'Bar/live music',
  },
  'Το Τρένο στο Ρουφ': {
    typical: 20,
    range: [15, 30],
    notes: 'Unique train venue',
  },

  // Cultural/Classical Venues (Greek names)
  'Μέγαρο Μουσικής Αθηνών': {
    typical: 25,
    range: [15, 80],
    notes: 'Athens Concert Hall',
  },
  'Ωδείο Αθηνών': {
    typical: 25,
    range: [20, 50],
    notes: 'Athens Conservatory',
  },
};

// Price patterns for event title matching
const FREE_EVENT_PATTERNS = [
  /free\s*entry/i,
  /δωρεάν/i,
  /ελεύθερη\s*είσοδος/i,
  /free\s*admission/i,
];

// ============================================================================
// Database
// ============================================================================

function openDatabase(): Database {
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

// ============================================================================
// Price Acquisition Logic
// ============================================================================

/**
 * Check if event title indicates free entry
 */
function titleIndicatesFree(title: string): boolean {
  return FREE_EVENT_PATTERNS.some(pattern => pattern.test(title));
}

/**
 * Get venue default price
 */
function getVenueDefaultPrice(venueName: string): {
  price: number | null;
  source: string;
} | null {
  // Direct match
  if (VENUE_DEFAULT_PRICES[venueName]) {
    const info = VENUE_DEFAULT_PRICES[venueName];
    return {
      price: info.typical,
      source: 'venue_default',
    };
  }

  // Fuzzy match (venue name contains key)
  for (const [venue, info] of Object.entries(VENUE_DEFAULT_PRICES)) {
    if (
      venueName.toLowerCase().includes(venue.toLowerCase()) ||
      venue.toLowerCase().includes(venueName.toLowerCase())
    ) {
      return {
        price: info.typical,
        source: 'venue_default',
      };
    }
  }

  return null;
}

/**
 * Get events without prices
 */
function getEventsWithoutPrices(db: Database): EventWithoutPrice[] {
  return db.prepare(`
    SELECT
      id,
      title,
      venue_name,
      start_date,
      price_type,
      price_amount,
      price_source,
      source
    FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
      AND (
        (price_type = 'with-ticket' AND price_amount IS NULL)
        OR price_source IS NULL
        OR price_source = 'unknown'
      )
    ORDER BY start_date ASC
  `).all() as EventWithoutPrice[];
}

/**
 * Apply venue default prices
 */
function applyVenueDefaults(
  db: Database,
  dryRun: boolean
): { updated: number; skipped: number } {
  let updated = 0;
  let skipped = 0;

  const events = getEventsWithoutPrices(db);

  const updateStmt = db.prepare(`
    UPDATE events
    SET price_amount = ?,
        price_source = 'venue_default',
        price_range = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const event of events) {
    // Skip if already has price
    if (event.price_amount && event.price_source !== 'unknown') {
      continue;
    }

    // Check for free event indicators
    if (titleIndicatesFree(event.title)) {
      if (!dryRun) {
        updateStmt.run(0, 'Free entry', event.id);
      }
      console.log(`  🎁 ${event.title.slice(0, 40)}... → Free (title indicator)`);
      updated++;
      continue;
    }

    // Get venue default
    const defaultPrice = getVenueDefaultPrice(event.venue_name);

    if (defaultPrice) {
      const venueInfo = VENUE_DEFAULT_PRICES[event.venue_name] ||
                        Object.entries(VENUE_DEFAULT_PRICES).find(([k]) =>
                          event.venue_name.toLowerCase().includes(k.toLowerCase()))?.[1];

      const range = venueInfo?.range
        ? `€${venueInfo.range[0]}-${venueInfo.range[1]}`
        : `€${defaultPrice.price}`;

      if (!dryRun) {
        updateStmt.run(defaultPrice.price, range, event.id);
      }

      console.log(`  💰 ${event.title.slice(0, 40)}... → €${defaultPrice.price} (${event.venue_name})`);
      updated++;
    } else {
      // Mark as unknown if we can't determine price
      if (!dryRun && !event.price_source) {
        db.prepare(`
          UPDATE events SET price_source = 'unknown', updated_at = datetime('now')
          WHERE id = ?
        `).run(event.id);
      }
      skipped++;
    }
  }

  return { updated, skipped };
}

/**
 * Set price_source for events that have direct prices
 */
function tagDirectPrices(db: Database, dryRun: boolean): number {
  if (dryRun) {
    const count = db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE price_amount IS NOT NULL
        AND price_source IS NULL
    `).get() as { count: number };
    return count.count;
  }

  const result = db.prepare(`
    UPDATE events
    SET price_source = 'direct', updated_at = datetime('now')
    WHERE price_amount IS NOT NULL
      AND price_source IS NULL
  `).run();

  return result.changes;
}

/**
 * Show price statistics
 */
function showPriceStats(db: Database): void {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN price_type = 'open' THEN 1 ELSE 0 END) as free,
      SUM(CASE WHEN price_type = 'with-ticket' AND price_amount IS NOT NULL THEN 1 ELSE 0 END) as with_price,
      SUM(CASE WHEN price_type = 'with-ticket' AND price_amount IS NULL THEN 1 ELSE 0 END) as missing_price,
      SUM(CASE WHEN price_source = 'direct' THEN 1 ELSE 0 END) as source_direct,
      SUM(CASE WHEN price_source = 'crossref_ra' THEN 1 ELSE 0 END) as source_ra,
      SUM(CASE WHEN price_source = 'venue_default' THEN 1 ELSE 0 END) as source_default,
      SUM(CASE WHEN price_source = 'unknown' OR (price_type = 'with-ticket' AND price_amount IS NULL) THEN 1 ELSE 0 END) as source_unknown
    FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
  `).get() as {
    total: number;
    free: number;
    with_price: number;
    missing_price: number;
    source_direct: number;
    source_ra: number;
    source_default: number;
    source_unknown: number;
  };

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  💰 Price Coverage Statistics                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Price Type:');
  console.log(`   Free (open):          ${stats.free}`);
  console.log(`   Ticketed with price:  ${stats.with_price}`);
  console.log(`   Ticketed no price:    ${stats.missing_price}`);
  console.log(`   Total:                ${stats.total}`);

  console.log('\nPrice Source:');
  console.log(`   Direct from source:   ${stats.source_direct}`);
  console.log(`   RA cross-reference:   ${stats.source_ra}`);
  console.log(`   Venue default:        ${stats.source_default}`);
  console.log(`   Unknown:              ${stats.source_unknown}`);

  // Calculate coverage
  const totalWithPrice = stats.free + stats.with_price;
  const coverage = (totalWithPrice / stats.total) * 100;

  console.log('\nCoverage:');
  console.log(`   Events with price:    ${totalWithPrice}/${stats.total} (${coverage.toFixed(1)}%)`);

  // PRD target check
  const target = 80;
  if (coverage >= target) {
    console.log(`\n✅ PRD Target Met: ${target}% price coverage`);
  } else {
    console.log(`\n⚠️  PRD Target: ${target}% price coverage`);
    console.log(`   Current: ${coverage.toFixed(1)}%`);
    console.log(`   Need ${Math.ceil((stats.total * target / 100) - totalWithPrice)} more prices`);
  }

  // Show events with unknown prices
  if (stats.source_unknown > 0 && stats.source_unknown <= 20) {
    console.log('\n📋 Events with unknown prices:');
    const unknown = db.prepare(`
      SELECT title, venue_name, start_date
      FROM events
      WHERE location_status IN ('verified_athens', 'pass_through')
        AND price_type = 'with-ticket'
        AND price_amount IS NULL
      ORDER BY start_date ASC
      LIMIT 20
    `).all() as Array<{ title: string; venue_name: string; start_date: string }>;

    for (const event of unknown) {
      const date = event.start_date.split('T')[0];
      console.log(`   • ${event.title.slice(0, 35)}... @ ${event.venue_name} (${date})`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const dryRun = args.includes('--dry-run');
  const statsOnly = args.includes('--stats');
  const defaultsOnly = args.includes('--defaults');

  const db = openDatabase();

  try {
    if (statsOnly) {
      showPriceStats(db);
      return;
    }

    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  💰 Agent Athens - Price Acquisition Chain                    ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    if (dryRun) {
      console.log('\n🔍 DRY RUN - No changes will be made\n');
    }

    // Step 1: Tag existing direct prices
    console.log('\n📌 Step 1: Tagging direct prices...');
    const directTagged = tagDirectPrices(db, dryRun);
    console.log(`   Tagged ${directTagged} events with price_source='direct'`);

    // Step 2: Apply venue defaults
    console.log('\n📌 Step 2: Applying venue defaults...');
    const { updated, skipped } = applyVenueDefaults(db, dryRun);
    console.log(`   Updated: ${updated}, Skipped: ${skipped}`);

    // Show final stats
    showPriceStats(db);

    if (dryRun) {
      console.log('\n🔍 Run without --dry-run to apply changes');
    }
  } finally {
    db.close();
  }
}

main().catch(console.error);
