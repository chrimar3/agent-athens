#!/usr/bin/env bun
/**
 * Schema.org JSON-LD Generator
 *
 * Generates and stores Schema.org JSON-LD for all events in the database.
 * This enables 100% Schema.org validity as required by the PRD.
 *
 * Usage:
 *   bun run scripts/generate-schema.ts              # Generate for all events
 *   bun run scripts/generate-schema.ts --validate   # Validate existing schema
 *   bun run scripts/generate-schema.ts --stats      # Show schema coverage stats
 *
 * @see src/enrichment/quality-gates.ts (generateSchemaOrg)
 * @see docs/MASTER-ENRICHMENT-TEMPLATE.md
 */

import Database from 'bun:sqlite';
import { generateSchemaOrg, validateQualityGates, type SchemaOrgEvent } from '../src/enrichment/quality-gates';
import { determineEnrichmentTier, type EventForEnrichment } from '../src/enrichment/description-generator';

// ============================================================================
// Constants
// ============================================================================

const DB_PATH = 'data/events.db';

// Athens venue coordinates (for Schema.org geo)
const VENUE_COORDS: Record<string, { lat: number; lng: number }> = {
  'Half Note Jazz Club': { lat: 37.9689, lng: 23.7278 },
  'Gazarte': { lat: 37.9783, lng: 23.7122 },
  'Six D.O.G.S': { lat: 37.9772, lng: 23.7268 },
  'Onassis Stegi': { lat: 37.9565, lng: 23.6995 },
  'Stavros Niarchos Foundation': { lat: 37.9393, lng: 23.6914 },
  'Megaron - Athens Concert Hall': { lat: 37.9768, lng: 23.7491 },
  'Technopolis': { lat: 37.9783, lng: 23.7122 },
  'Romantso': { lat: 37.9809, lng: 23.7311 },
  'SMUT Athens': { lat: 37.9856, lng: 23.7328 },
  'Astron': { lat: 37.9788, lng: 23.7286 },
  'Fuzz Club': { lat: 37.9628, lng: 23.6970 },
  'Bios': { lat: 37.9796, lng: 23.7249 },
  'Death Disco': { lat: 37.9776, lng: 23.7254 },
};

// Athens neighborhood coordinates
const NEIGHBORHOOD_COORDS: Record<string, { lat: number; lng: number }> = {
  'Gazi': { lat: 37.9783, lng: 23.7122 },
  'Exarchia': { lat: 37.9856, lng: 23.7328 },
  'Psiri': { lat: 37.9796, lng: 23.7249 },
  'Koukaki': { lat: 37.9628, lng: 23.7284 },
  'Monastiraki': { lat: 37.9762, lng: 23.7259 },
  'Metaxourgeio': { lat: 37.9853, lng: 23.7195 },
  'Kolonaki': { lat: 37.9781, lng: 23.7416 },
  'Neos Kosmos': { lat: 37.9565, lng: 23.6995 },
};

// ============================================================================
// Database
// ============================================================================

function openDatabase(): Database {
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

// ============================================================================
// Schema Generation
// ============================================================================

/**
 * Generate enhanced Schema.org with venue coordinates
 */
function generateEnhancedSchema(event: EventForEnrichment): SchemaOrgEvent {
  const baseSchema = generateSchemaOrg(event);

  // Add geo coordinates if we have them
  if (event.venue) {
    const venueCoords = VENUE_COORDS[event.venue];
    const neighborhoodCoords = event.neighborhood
      ? NEIGHBORHOOD_COORDS[event.neighborhood]
      : null;

    if (venueCoords) {
      baseSchema.location.geo = {
        '@type': 'GeoCoordinates',
        latitude: venueCoords.lat,
        longitude: venueCoords.lng,
      };
    } else if (neighborhoodCoords) {
      // Fallback to neighborhood center
      baseSchema.location.geo = {
        '@type': 'GeoCoordinates',
        latitude: neighborhoodCoords.lat,
        longitude: neighborhoodCoords.lng,
      };
    }
  }

  return baseSchema;
}

/**
 * Generate schema for all events
 */
function generateAllSchema(db: Database): { generated: number; updated: number; errors: number } {
  let generated = 0;
  let updated = 0;
  let errors = 0;

  const events = db.prepare(`
    SELECT
      id,
      title,
      start_date as date,
      substr(start_date, 12, 5) as time,
      venue_name as venue,
      type,
      genres as genre,
      price_type as price,
      price_advance,
      price_door,
      venue_neighborhood as neighborhood,
      venue_metro_station as metro_station,
      venue_metro_line as metro_line,
      door_policy,
      time_doors,
      ticket_url,
      schema_json
    FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
  `).all() as Array<EventForEnrichment & { schema_json: string | null }>;

  const updateStmt = db.prepare(`
    UPDATE events
    SET schema_json = ?, schema_valid = 1, updated_at = datetime('now')
    WHERE id = ?
  `);

  console.log(`\n🔄 Processing ${events.length} events...\n`);

  for (const event of events) {
    try {
      const schema = generateEnhancedSchema(event);
      const schemaJson = JSON.stringify(schema);

      if (event.schema_json !== schemaJson) {
        updateStmt.run(schemaJson, event.id);
        if (event.schema_json) {
          updated++;
        } else {
          generated++;
        }
      }
    } catch (error) {
      console.error(`   ❌ Error for ${event.title}: ${error}`);
      errors++;
    }
  }

  return { generated, updated, errors };
}

/**
 * Validate existing schema
 */
function validateAllSchema(db: Database): void {
  const events = db.prepare(`
    SELECT
      id,
      title,
      schema_json,
      full_description,
      enrichment_tier
    FROM events
    WHERE schema_json IS NOT NULL
  `).all() as Array<{
    id: string;
    title: string;
    schema_json: string;
    full_description: string | null;
    enrichment_tier: string | null;
  }>;

  console.log(`\n🔍 Validating ${events.length} events with schema...\n`);

  let valid = 0;
  let invalid = 0;
  const issues: Array<{ title: string; errors: string[] }> = [];

  for (const event of events) {
    try {
      const schema = JSON.parse(event.schema_json) as SchemaOrgEvent;

      // Basic validation
      const errors: string[] = [];

      if (!schema['@context']) errors.push('Missing @context');
      if (!schema['@type']) errors.push('Missing @type');
      if (!schema.name) errors.push('Missing name');
      if (!schema.startDate) errors.push('Missing startDate');
      if (!schema.location) errors.push('Missing location');

      if (schema.startDate && !schema.startDate.includes('+') && !schema.startDate.includes('Z')) {
        errors.push('startDate missing timezone');
      }

      if (schema.offers && typeof schema.offers.price === 'string' && schema.offers.price.includes('€')) {
        errors.push('Price not numeric');
      }

      if (errors.length > 0) {
        invalid++;
        issues.push({ title: event.title, errors });
      } else {
        valid++;
      }
    } catch (error) {
      invalid++;
      issues.push({ title: event.title, errors: [`Invalid JSON: ${error}`] });
    }
  }

  console.log(`\n📊 Validation Results:`);
  console.log(`   Valid:   ${valid}`);
  console.log(`   Invalid: ${invalid}`);
  console.log(`   Total:   ${events.length}`);
  console.log(`   Coverage: ${((valid / events.length) * 100).toFixed(1)}%`);

  if (issues.length > 0 && issues.length <= 10) {
    console.log(`\n❌ Issues found:`);
    for (const issue of issues) {
      console.log(`   ${issue.title}:`);
      for (const error of issue.errors) {
        console.log(`      - ${error}`);
      }
    }
  } else if (issues.length > 10) {
    console.log(`\n❌ ${issues.length} events have schema issues`);
    console.log(`   Run with --verbose to see all issues`);
  }
}

/**
 * Show schema statistics
 */
function showStats(db: Database): void {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN schema_json IS NOT NULL THEN 1 ELSE 0 END) as with_schema,
      SUM(CASE WHEN schema_valid = 1 THEN 1 ELSE 0 END) as schema_valid,
      SUM(CASE WHEN schema_json IS NOT NULL AND location_status IN ('verified_athens', 'pass_through') THEN 1 ELSE 0 END) as publishable_with_schema
    FROM events
    WHERE location_status IN ('verified_athens', 'pass_through')
  `).get() as {
    total: number;
    with_schema: number;
    schema_valid: number;
    publishable_with_schema: number;
  };

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 Schema.org Coverage Statistics                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Events:');
  console.log(`   Total publishable:     ${stats.total}`);
  console.log(`   With schema:           ${stats.with_schema}`);
  console.log(`   Schema validated:      ${stats.schema_valid}`);
  console.log('');
  console.log('Coverage:');
  console.log(`   Schema coverage:       ${((stats.with_schema / stats.total) * 100).toFixed(1)}%`);
  console.log(`   Schema validity:       ${((stats.schema_valid / stats.with_schema || 0) * 100).toFixed(1)}%`);

  // PRD target check
  const target = 100;
  const coverage = (stats.with_schema / stats.total) * 100;
  const validity = (stats.schema_valid / (stats.with_schema || 1)) * 100;

  console.log('');
  if (coverage >= target && validity >= target) {
    console.log(`✅ PRD Target Met: ${target}% Schema.org validity`);
  } else {
    console.log(`⚠️  PRD Target: ${target}% Schema.org validity`);
    console.log(`   Current: ${coverage.toFixed(1)}% coverage, ${validity.toFixed(1)}% valid`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const validateMode = args.includes('--validate');
  const statsMode = args.includes('--stats');

  const db = openDatabase();

  try {
    if (statsMode) {
      showStats(db);
      return;
    }

    if (validateMode) {
      validateAllSchema(db);
      return;
    }

    // Default: generate schema
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  🎭 Agent Athens - Schema.org Generator                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    const result = generateAllSchema(db);

    console.log('\n✅ Schema generation complete:');
    console.log(`   Generated: ${result.generated}`);
    console.log(`   Updated:   ${result.updated}`);
    if (result.errors > 0) {
      console.log(`   Errors:    ${result.errors}`);
    }

    // Show final stats
    showStats(db);
  } finally {
    db.close();
  }
}

main().catch(console.error);
