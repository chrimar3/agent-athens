import { Database } from 'bun:sqlite';
import venuesMaster from '../data/venues-master.json';

const db = new Database('data/events.db');

console.log('🏛️  Enriching events with venue master data\n');

// Get all distinct venue names from events
const venues = db.prepare(`
  SELECT DISTINCT venue_name, COUNT(*) as event_count
  FROM events
  WHERE venue_name IS NOT NULL AND venue_name != ''
  GROUP BY venue_name
  ORDER BY event_count DESC
`).all() as Array<{ venue_name: string; event_count: number }>;

console.log(`📊 Found ${venues.length} distinct venues in database`);
console.log(`🗂️  Venue master data has ${Object.keys(venuesMaster).length} entries\n`);

let enriched = 0;
let skipped = 0;
let errors = 0;

for (const { venue_name, event_count } of venues) {
  try {
    // Check if venue exists in master data (case-insensitive match)
    const masterEntry = Object.entries(venuesMaster).find(
      ([key]) => key.toLowerCase() === venue_name.toLowerCase()
    );

    if (!masterEntry) {
      if (event_count >= 5) {
        console.log(`⚠️  ${venue_name} (${event_count} events) - Not in master data`);
      }
      skipped++;
      continue;
    }

    const [masterKey, venueData] = masterEntry;
    const data = venueData as any;

    // Update all events for this venue with master data
    const result = db.prepare(`
      UPDATE events
      SET
        venue_neighborhood = ?,
        venue_address = ?,
        venue_lat = ?,
        venue_lng = ?,
        venue_capacity = ?,
        updated_at = datetime('now')
      WHERE LOWER(venue_name) = LOWER(?)
    `).run(
      data.neighborhood || null,
      data.address || null,
      data.lat || null,
      data.lng || null,
      data.capacity || null,
      venue_name
    );

    if (result.changes > 0) {
      console.log(`✅ ${venue_name} → ${result.changes} events enriched`);
      enriched++;
    }
  } catch (error: any) {
    console.error(`❌ ${venue_name}: ${error.message}`);
    errors++;
  }
}

console.log(`\n📊 Enrichment Summary:`);
console.log(`   ✅ Enriched: ${enriched} venues`);
console.log(`   ⚠️  Skipped: ${skipped} venues (not in master data)`);
console.log(`   ❌ Errors: ${errors}`);

// Show sample enriched events
console.log(`\n🔍 Sample enriched events:`);
const samples = db.prepare(`
  SELECT title, venue_name, venue_neighborhood, venue_capacity
  FROM events
  WHERE venue_neighborhood IS NOT NULL
  LIMIT 5
`).all();

for (const sample of samples as any[]) {
  console.log(`   • ${sample.title}`);
  console.log(`     Venue: ${sample.venue_name} (${sample.venue_neighborhood})`);
  console.log(`     Capacity: ${sample.venue_capacity}`);
}

db.close();
