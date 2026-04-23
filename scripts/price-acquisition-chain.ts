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
  type: string | null;
  price_type: string;
  price_amount: number | null;
  price_source: string | null;
  source: string;
}

type PriceSource = 'direct' | 'crossref_ra' | 'venue_default' | 'unknown';

// ============================================================================
// Type-Compatibility Gate (S96 follow-up)
//
// Venue defaults must only apply when the event's type matches the venue's
// typical programming. Without this gate, a tech conference at a classical
// venue inherits classical pricing (Devoxx Greece 2026 at Μέγαρο silently
// shipped €25 / €15-80 in production).
//
// Semantic-fit gating pattern: any fallback inheriting from a container
// (venue, source, category) must validate that the child's shape matches the
// container's typical shape before inheriting. Structural availability ≠
// semantic correctness.
// ============================================================================

export interface VenueTypeHistory {
  /** Returns the top-N event types for a venue, ordered by count desc. Empty if no history. */
  getTopTypes(venueName: string, n?: number): string[];
}

const DEFAULT_TOP_N = 3;

export function isTypeCompatibleWithVenue(
  eventType: string | null | undefined,
  venueName: string,
  history: VenueTypeHistory,
  topN: number = DEFAULT_TOP_N,
): boolean {
  if (!eventType) return false;
  const topTypes = history.getTopTypes(venueName, topN);
  if (topTypes.length === 0) return false; // NO_HISTORY → refuse (safe default)
  return topTypes.includes(eventType);
}

export function createSqlVenueTypeHistory(db: Database): VenueTypeHistory {
  const stmt = db.prepare(`
    SELECT type
    FROM events
    WHERE venue_name = ?
      AND location_status IN ('verified_athens', 'pass_through')
      AND type IS NOT NULL
      AND type != ''
    GROUP BY type
    ORDER BY COUNT(*) DESC
    LIMIT ?
  `);
  return {
    getTopTypes(venueName: string, n: number = DEFAULT_TOP_N): string[] {
      const rows = stmt.all(venueName, n) as Array<{ type: string }>;
      return rows.map(r => r.type);
    },
  };
}

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
 * Get venue default price, gated by type-compatibility.
 *
 * Returns null when:
 *   - venue is not in VENUE_DEFAULT_PRICES (directly or fuzzy)
 *   - event type is not in venue's top-N historical types
 *   - venue has no type history at all (NO_HISTORY safe default)
 *
 * Callers that receive null should route the event to price_source='unknown'
 * and rely on ticket_url CTA instead of a guessed price.
 */
export function getVenueDefaultPrice(
  venueName: string,
  eventType: string | null | undefined,
  history: VenueTypeHistory,
): {
  price: number | null;
  source: string;
} | null {
  // Gate: type must be compatible with the venue's typical programming.
  // Applies BEFORE the directory lookup so a fuzzy match can't bypass.
  if (!isTypeCompatibleWithVenue(eventType, venueName, history)) {
    return null;
  }

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
      type,
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
 * Get events currently tagged `price_source='venue_default'`.
 * Used by the --reprocess-source=venue_default backfill path to re-apply
 * the type-compatibility gate to existing rows that predate the gate.
 */
function getVenueDefaultEvents(db: Database): EventWithoutPrice[] {
  return db.prepare(`
    SELECT
      id,
      title,
      venue_name,
      start_date,
      type,
      price_type,
      price_amount,
      price_source,
      source
    FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
      AND price_source = 'venue_default'
    ORDER BY venue_name, start_date ASC
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
  const history = createSqlVenueTypeHistory(db);

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

    // Get venue default (gated by type-compatibility)
    const defaultPrice = getVenueDefaultPrice(event.venue_name, event.type, history);

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
      // Mark as unknown if we can't determine price (including gate refusals)
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
 * Reprocess existing `price_source='venue_default'` rows against the current
 * type-compatibility gate. Rows that the gate now refuses are flipped to
 * `price_source='unknown'` with price_amount/price_range nulled; rows that
 * still pass are left unchanged.
 *
 * Used by the Step 5 backfill (S96 follow-up). Separate from applyVenueDefaults
 * because that one skips rows that already have a price.
 */
function reprocessVenueDefaults(
  db: Database,
  dryRun: boolean,
): { kept: number; flippedToUnknown: number; rows: Array<{ id: string; title: string; type: string | null; venue: string; before: number | null; after: 'kept' | 'unknown' }> } {
  const events = getVenueDefaultEvents(db);
  const history = createSqlVenueTypeHistory(db);

  const flipStmt = db.prepare(`
    UPDATE events
    SET price_amount = NULL,
        price_range = NULL,
        price_source = 'unknown',
        updated_at = datetime('now')
    WHERE id = ?
  `);

  let kept = 0;
  let flippedToUnknown = 0;
  const rows: Array<{ id: string; title: string; type: string | null; venue: string; before: number | null; after: 'kept' | 'unknown' }> = [];

  for (const event of events) {
    const compatible = isTypeCompatibleWithVenue(event.type, event.venue_name, history);
    if (compatible) {
      kept++;
      rows.push({ id: event.id, title: event.title, type: event.type, venue: event.venue_name, before: event.price_amount, after: 'kept' });
    } else {
      flippedToUnknown++;
      rows.push({ id: event.id, title: event.title, type: event.type, venue: event.venue_name, before: event.price_amount, after: 'unknown' });
      if (!dryRun) flipStmt.run(event.id);
    }
  }

  return { kept, flippedToUnknown, rows };
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
  const reprocessArg = args.find(a => a.startsWith('--reprocess-source='));
  const reprocessSource = reprocessArg?.split('=')[1];

  const db = openDatabase();

  try {
    if (statsOnly) {
      showPriceStats(db);
      return;
    }

    if (reprocessSource === 'venue_default') {
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  🔁 Reprocess: venue_default rows (type-compat gate)          ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      if (dryRun) console.log('\n🔍 DRY RUN - No changes will be made\n');

      const { kept, flippedToUnknown, rows } = reprocessVenueDefaults(db, dryRun);

      console.log('\n📋 Rows to flip (MISMATCH):');
      for (const r of rows.filter(x => x.after === 'unknown')) {
        console.log(`   → ${r.id.slice(0, 8)}  type=${r.type ?? '∅'}  @ ${r.venue.slice(0, 25)}  (was €${r.before ?? '∅'})`);
      }

      console.log(`\n✅ Kept: ${kept}   🚫 Flipped → unknown: ${flippedToUnknown}`);
      if (dryRun) console.log('\n🔍 Run without --dry-run to apply changes');
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

if (import.meta.main) {
  main().catch(console.error);
}
