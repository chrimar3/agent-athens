/**
 * Test Venue Context Lookup
 *
 * Purpose: Verify venue enrichment system works correctly
 */

import { getVenueContext, seedKnownVenues } from '../src/enrichment/venue-context';

async function testVenueLookup() {
  console.log('🧪 Testing Venue Context Lookup\n');
  console.log('='.repeat(80));

  // 1. Seed known venues
  console.log('\n📚 Seeding known venues...');
  seedKnownVenues();

  // 2. Test known venues from our 3 scraped events
  const testVenues = [
    'Half Note Jazz Club',
    'Los Angeles Comedy Club',
    'CHNOPS',
  ];

  console.log('\n\n🔍 Testing venue lookups:\n');

  for (const venueName of testVenues) {
    console.log('-'.repeat(80));
    const context = await getVenueContext(venueName);

    console.log(`\nVenue: ${context.venue_name}`);
    console.log(`Type: ${context.venue_type || 'N/A'}`);
    console.log(`Neighborhood: ${context.neighborhood || 'N/A'}`);
    console.log(`Capacity: ${context.capacity || 'N/A'}`);
    console.log(`Established: ${context.established_year || 'N/A'}`);
    console.log(`Description: ${context.description?.substring(0, 150)}...`);
    console.log('');
  }

  // 3. Test unknown venue (should get generic context)
  console.log('-'.repeat(80));
  console.log('\n🆕 Testing unknown venue (generic fallback):\n');

  const unknownVenue = await getVenueContext('Test Music Hall Athens');
  console.log(`Venue: ${unknownVenue.venue_name}`);
  console.log(`Type: ${unknownVenue.venue_type || 'N/A'}`);
  console.log(`Description: ${unknownVenue.description}`);

  console.log('\n\n✅ Venue lookup test complete!');
}

testVenueLookup().catch(console.error);
