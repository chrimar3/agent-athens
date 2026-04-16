#!/usr/bin/env bun
/**
 * Batch geocode venues missing coordinates.
 *
 * Workflow:
 *   1. Query DB for distinct venues without geo data
 *   2. Skip venues already in venues-master.json
 *   3. Geocode each via Nominatim (rate-limited 1 req/sec)
 *   4. Filter by confidence (high/medium)
 *   5. Add results to venues-master.json
 *   6. Run backfill-venue-geo.ts to propagate to DB
 *
 * Usage:
 *   bun run scripts/geocode-missing-venues.ts --dry-run         # Preview without changes
 *   bun run scripts/geocode-missing-venues.ts                    # Geocode + update master + backfill
 *   bun run scripts/geocode-missing-venues.ts --confidence=high  # Only high-confidence results
 *   bun run scripts/geocode-missing-venues.ts --limit=20         # Process at most 20 venues
 */

import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { geocodeVenue, ATHENS_CONFIG } from '../src/utils/geocode';
import type { GeocodeResult } from '../src/utils/geocode';

// ── CLI Flags ──────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const confidenceFlag = args.find(a => a.startsWith('--confidence='));
const minConfidence: 'high' | 'medium' = confidenceFlag?.split('=')[1] === 'high' ? 'high' : 'medium';
const limitFlag = args.find(a => a.startsWith('--limit='));
const limit = limitFlag ? parseInt(limitFlag.split('=')[1], 10) : Infinity;

// ── Load Data ──────────────────────────────────────

const rootDir = join(import.meta.dir, '..');
const masterPath = join(rootDir, 'data/venues-master.json');
const masterVenues: Record<string, any> = JSON.parse(readFileSync(masterPath, 'utf-8'));
const db = new Database(join(rootDir, 'data/events.db'));

// Normalize for matching — strip accents and lowercase
function normalizeGreek(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Build set of all known venue names (including normalized forms)
const knownNames = new Set<string>();
for (const key of Object.keys(masterVenues)) {
  knownNames.add(key.toLowerCase());
  knownNames.add(normalizeGreek(key));
  const nameEn = masterVenues[key].name_en;
  if (nameEn) {
    knownNames.add(nameEn.toLowerCase());
    knownNames.add(normalizeGreek(nameEn));
  }
}

// ── Find Missing Venues ────────────────────────────

const rows = db.query<
  { venue_name: string; event_count: number },
  []
>(`
  SELECT venue_name, COUNT(*) as event_count
  FROM events
  WHERE location_status IN ('verified_athens', 'pass_through')
    AND (venue_lat IS NULL OR venue_lat = 0)
  GROUP BY venue_name
  ORDER BY event_count DESC
`).all();

// Filter out venues already in master (by normalized name)
const toGeocode = rows.filter(row => {
  const lower = row.venue_name.toLowerCase();
  const stripped = normalizeGreek(row.venue_name);
  return !knownNames.has(lower) && !knownNames.has(stripped);
}).slice(0, limit);

console.log(`Venues in master: ${Object.keys(masterVenues).length}`);
console.log(`Venues without geo in DB: ${rows.length}`);
console.log(`Venues not in master (to geocode): ${toGeocode.length}`);
if (limit < Infinity) console.log(`Limit: ${limit}`);
console.log(`Min confidence: ${minConfidence}`);
console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

if (toGeocode.length === 0) {
  console.log('Nothing to geocode. All venues are either in master or have geo data.');
  db.close();
  process.exit(0);
}

// ── Geocode ────────────────────────────────────────

interface GeocodedVenue {
  venueName: string;
  eventCount: number;
  result: GeocodeResult;
}

const geocoded: GeocodedVenue[] = [];
const failed: Array<{ name: string; events: number }> = [];
const skippedLowConfidence: Array<{ name: string; events: number; confidence: string }> = [];

const hasGoogleKey = !!process.env.GOOGLE_GEOCODING_API_KEY;
console.log(`Geocoding venues via Nominatim${hasGoogleKey ? ' + Google fallback' : ''} (rate-limited)...\n`);

for (let i = 0; i < toGeocode.length; i++) {
  const { venue_name, event_count } = toGeocode[i];
  const progress = `[${i + 1}/${toGeocode.length}]`;

  const result = await geocodeVenue(venue_name, ATHENS_CONFIG);

  if (!result) {
    failed.push({ name: venue_name, events: event_count });
    console.log(`  ${progress} ✗ ${venue_name} (${event_count} events) — no match`);
    continue;
  }

  if (minConfidence === 'high' && result.confidence !== 'high') {
    skippedLowConfidence.push({ name: venue_name, events: event_count, confidence: result.confidence });
    console.log(`  ${progress} ~ ${venue_name} (${event_count} events) — ${result.confidence} confidence, skipped`);
    continue;
  }

  geocoded.push({ venueName: venue_name, eventCount: event_count, result });
  const conf = result.confidence === 'high' ? '✓' : '◐';
  const src = result.source === 'google' ? ' [G]' : '';
  console.log(`  ${progress} ${conf} ${venue_name}${src} (${event_count} events) — ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)} [${result.confidence}]`);
}

// ── Summary ────────────────────────────────────────

console.log('\n=== Geocoding Summary ===');
console.log(`Geocoded:  ${geocoded.length} venues (${geocoded.reduce((sum, v) => sum + v.eventCount, 0)} events)`);
console.log(`Failed:    ${failed.length} venues (${failed.reduce((sum, v) => sum + v.events, 0)} events)`);
if (skippedLowConfidence.length > 0) {
  console.log(`Skipped:   ${skippedLowConfidence.length} venues (below ${minConfidence} confidence)`);
}

if (geocoded.length === 0) {
  console.log('\nNo venues geocoded. Nothing to update.');
  db.close();
  process.exit(0);
}

// ── Update venues-master.json ──────────────────────

if (!dryRun) {
  let addedCount = 0;
  for (const { venueName, result } of geocoded) {
    // Don't overwrite existing entries
    if (masterVenues[venueName]) continue;

    masterVenues[venueName] = {
      name_en: '',  // Can be filled later
      neighborhood: '',
      address: result.source === 'google'
        ? result.displayName  // Google formatted_address is already concise
        : result.displayName.split(',').slice(0, 2).join(',').trim(),
      lat: parseFloat(result.lat.toFixed(6)),
      lng: parseFloat(result.lon.toFixed(6)),
      type: result.category ?? 'unknown',
      geocoded_source: result.source,
      geocoded_confidence: result.confidence,
      geocoded_at: new Date().toISOString().split('T')[0],
    };
    addedCount++;
  }

  // Write sorted by key for consistent diffs
  const sorted = Object.fromEntries(
    Object.entries(masterVenues).sort(([a], [b]) => a.localeCompare(b, 'el'))
  );
  writeFileSync(masterPath, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\nAdded ${addedCount} venues to venues-master.json`);

  // Run backfill to propagate to DB
  console.log('\nRunning backfill-venue-geo.ts to propagate to DB...\n');
  const backfillProc = Bun.spawn(['bun', 'run', join(rootDir, 'scripts/backfill-venue-geo.ts')], {
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  await backfillProc.exited;

  // Show final coverage
  const dbRO = new Database(join(rootDir, 'data/events.db'), { readonly: true });
  const coverage = dbRO.query<{ total: number; has_geo: number; pct: number }, []>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN venue_lat IS NOT NULL AND venue_lat <> 0 THEN 1 ELSE 0 END) as has_geo,
      ROUND(100.0 * SUM(CASE WHEN venue_lat IS NOT NULL AND venue_lat <> 0 THEN 1 ELSE 0 END) / COUNT(*), 1) as pct
    FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
  `).get();
  dbRO.close();

  if (coverage) {
    console.log(`\n=== Geo Coverage ===`);
    console.log(`${coverage.has_geo}/${coverage.total} events (${coverage.pct}%)`);
  }
} else {
  console.log('\n[DRY RUN] Would add to venues-master.json:');
  for (const { venueName, result } of geocoded) {
    console.log(`  "${venueName}": { lat: ${result.lat.toFixed(4)}, lng: ${result.lon.toFixed(4)}, conf: ${result.confidence} }`);
  }
}

db.close();
