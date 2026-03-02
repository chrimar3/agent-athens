#!/usr/bin/env bun
/**
 * Backfill venue geo coordinates and addresses from venues-master.json → events.db
 *
 * 3-layer name resolution:
 *   Layer 1: Direct match — DB venue_name === master JSON key
 *   Layer 2: Variations bridge — DB name found in athens-venues.json variations
 *             → canonical name → check all variations against master keys
 *   Layer 3: Accent-stripped — normalizeGreek(DB name) === normalizeGreek(master key)
 *
 * Usage:
 *   bun run scripts/backfill-venue-geo.ts              # Run backfill
 *   bun run scripts/backfill-venue-geo.ts --dry-run     # Preview without changes
 *   bun run scripts/backfill-venue-geo.ts --report      # Show unmatched venues by event count
 */

import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

// --- Inline normalizeGreek to avoid TS import issues in scripts ---
function normalizeGreek(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// --- Types ---
interface MasterVenue {
  name_en: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
  type?: string;
  capacity?: number;
  metro?: string;
  description?: string;
}

interface GeoData {
  lat: number;
  lng: number;
  address: string;
  neighborhood: string;
  masterKey: string;  // which master JSON key matched
}

interface AthensVenue {
  canonical_name: string;
  variations: string[];
  neighborhood: string;
}

// --- CLI flags ---
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const reportOnly = args.includes('--report');

// --- Load data sources ---
const rootDir = join(import.meta.dir, '..');
const masterVenues: Record<string, MasterVenue> = JSON.parse(
  readFileSync(join(rootDir, 'data/venues-master.json'), 'utf-8')
);
const athensConfig: { venues: AthensVenue[] } = JSON.parse(
  readFileSync(join(rootDir, 'config/athens-venues.json'), 'utf-8')
);

// --- Build unified lookup map ---
// Maps lowercase name → GeoData, indexed by ALL name forms
function buildLookup(): Map<string, GeoData> {
  const lookup = new Map<string, GeoData>();

  // Index master venues by their key + name_en
  for (const [key, venue] of Object.entries(masterVenues)) {
    const geo: GeoData = {
      lat: venue.lat,
      lng: venue.lng,
      address: venue.address,
      neighborhood: venue.neighborhood,
      masterKey: key,
    };

    lookup.set(key.toLowerCase(), geo);
    if (venue.name_en && venue.name_en.toLowerCase() !== key.toLowerCase()) {
      lookup.set(venue.name_en.toLowerCase(), geo);
    }
    // Also index accent-stripped form
    const stripped = normalizeGreek(key);
    if (!lookup.has(stripped)) {
      lookup.set(stripped, geo);
    }
  }

  // Index athens-venues.json variations → find their master data
  for (const athensVenue of athensConfig.venues) {
    const allNames = [athensVenue.canonical_name, ...athensVenue.variations];

    // Find master geo for any of these names
    let geo: GeoData | undefined;
    for (const name of allNames) {
      geo = lookup.get(name.toLowerCase());
      if (geo) break;
      geo = lookup.get(normalizeGreek(name));
      if (geo) break;
    }

    if (geo) {
      // Index ALL variation forms
      for (const name of allNames) {
        const lower = name.toLowerCase();
        if (!lookup.has(lower)) {
          lookup.set(lower, geo);
        }
        const stripped = normalizeGreek(name);
        if (!lookup.has(stripped)) {
          lookup.set(stripped, geo);
        }
      }
    }
  }

  return lookup;
}

// --- Resolve a DB venue name to GeoData using 3-layer matching ---
function resolveVenue(venueName: string, lookup: Map<string, GeoData>): GeoData | undefined {
  // Layer 1: Direct match
  const direct = lookup.get(venueName.toLowerCase());
  if (direct) return direct;

  // Layer 2: Already indexed from variations in buildLookup

  // Layer 3: Accent-stripped
  const stripped = normalizeGreek(venueName);
  return lookup.get(stripped);
}

// --- Constants ---
const FALLBACK_LAT = 37.9838;
const GENERIC_ADDRESSES = ['athens, greece', 'athens', 'greece', ''];

function isGenericAddress(addr: string | null): boolean {
  if (!addr) return true;
  return GENERIC_ADDRESSES.includes(addr.toLowerCase().trim());
}

// --- Main ---
const db = new Database(join(rootDir, 'data/events.db'));
const lookup = buildLookup();

console.log(`Loaded ${Object.keys(masterVenues).length} master venues`);
console.log(`Loaded ${athensConfig.venues.length} athens-venues.json entries`);
console.log(`Built lookup with ${lookup.size} name forms\n`);

// Get venues needing geo data
const venuesNeedingGeo = db.query<
  { venue_name: string; event_count: number; venue_lat: number | null; venue_address: string | null },
  []
>(`
  SELECT venue_name,
         COUNT(*) as event_count,
         venue_lat,
         venue_address
  FROM events
  WHERE location_status IN ('verified_athens', 'pass_through')
  GROUP BY venue_name
  ORDER BY event_count DESC
`).all();

let matched = 0;
let matchedEvents = 0;
let updated = 0;
let updatedEvents = 0;
const unmatched: Array<{ name: string; events: number; lat: number | null; address: string | null }> = [];

// Use separate statements for geo+address vs address-only updates
const updateGeoStmt = db.prepare(`
  UPDATE events
  SET venue_lat = ?,
      venue_lng = ?,
      venue_address = CASE
        WHEN ? AND (venue_address IS NULL OR LOWER(TRIM(venue_address)) IN ('athens, greece', 'athens', 'greece', ''))
        THEN ?
        ELSE venue_address
      END,
      venue_neighborhood = COALESCE(venue_neighborhood, ?),
      updated_at = datetime('now')
  WHERE venue_name = ?
`);

const updateAddrStmt = db.prepare(`
  UPDATE events
  SET venue_address = ?,
      venue_neighborhood = COALESCE(venue_neighborhood, ?),
      updated_at = datetime('now')
  WHERE venue_name = ?
`);

for (const row of venuesNeedingGeo) {
  const geo = resolveVenue(row.venue_name, lookup);

  if (geo) {
    matched++;
    matchedEvents += row.event_count;

    const needsGeoUpdate = !row.venue_lat || row.venue_lat === 0 || row.venue_lat === FALLBACK_LAT;
    const needsAddressUpdate = isGenericAddress(row.venue_address) && geo.address;

    if (needsGeoUpdate || needsAddressUpdate) {
      if (!dryRun && !reportOnly) {
        if (needsGeoUpdate) {
          updateGeoStmt.run(
            geo.lat,
            geo.lng,
            geo.address ? 1 : 0,
            geo.address,
            geo.neighborhood,
            row.venue_name
          );
        } else {
          // Address-only update — don't touch lat/lng
          updateAddrStmt.run(
            geo.address,
            geo.neighborhood,
            row.venue_name
          );
        }
      }
      updated++;
      updatedEvents += row.event_count;

      if (dryRun) {
        const geoTag = needsGeoUpdate ? `  geo: ${geo.lat}, ${geo.lng}` : '';
        const addrTag = needsAddressUpdate ? `  addr: ${geo.address}` : '';
        console.log(`  [DRY-RUN] ${row.venue_name} (${row.event_count} events)${geoTag}${addrTag}`);
        console.log(`            matched via: "${geo.masterKey}"`);
      }
    }
  } else {
    unmatched.push({
      name: row.venue_name,
      events: row.event_count,
      lat: row.venue_lat,
      address: row.venue_address,
    });
  }
}

// --- Summary ---
console.log('\n=== Backfill Summary ===');
console.log(`Total published venues: ${venuesNeedingGeo.length}`);
console.log(`Matched to master: ${matched} venues (${matchedEvents} events)`);
console.log(`Updated: ${updated} venues (${updatedEvents} events)${dryRun ? ' [DRY-RUN]' : ''}`);
console.log(`Unmatched: ${unmatched.length} venues`);

if (reportOnly || dryRun) {
  console.log('\n=== Unmatched Venues (by event count) ===');
  const sortedUnmatched = unmatched
    .sort((a, b) => b.events - a.events)
    .filter(v => v.events >= 3);

  for (const v of sortedUnmatched) {
    const geoStatus = !v.lat ? 'NO GEO' : v.lat === FALLBACK_LAT ? 'FALLBACK' : 'has geo';
    const addrStatus = isGenericAddress(v.address) ? 'no addr' : `addr: ${v.address}`;
    console.log(`  ${v.events.toString().padStart(3)} events | ${v.name} | ${geoStatus} | ${addrStatus}`);
  }

  const lowCount = unmatched.filter(v => v.events < 3).length;
  if (lowCount > 0) {
    console.log(`  ... and ${lowCount} more venues with 1-2 events each`);
  }
}

// --- Verification query ---
if (!dryRun && !reportOnly) {
  const after = db.query<{ count: number }, []>(`
    SELECT COUNT(DISTINCT venue_name) as count
    FROM events
    WHERE venue_lat IS NOT NULL
      AND venue_lat <> 0
      AND venue_lat <> 37.9838
      AND location_status IN ('verified_athens', 'pass_through')
  `).get();

  console.log(`\nVenues with real geo data: ${after?.count ?? 0}`);
}

db.close();
