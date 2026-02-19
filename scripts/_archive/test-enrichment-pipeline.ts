/**
 * Test Pre-Enrichment Pipeline
 *
 * Purpose: Validate that enrichment improves word counts for scraped events
 * Expected outcome: 4/6 descriptions pass word count validation (vs. 0/6 without enrichment)
 */

import { Database } from 'bun:sqlite';
import {
  initializeEnrichment,
  enrichEvent,
  generateEnrichedPrompt,
} from '../src/enrichment/enrichment-engine';

const db = new Database('data/events.db');

// Test events (same 3 from previous scraped test)
const TEST_EVENT_IDS = [
  '0c47c72c04904378', // Jazz concert
  'jeremy-2025-11-04', // Comedy
  'eat-drink-draw-2025-11-05', // Workshop
];

async function testEnrichmentPipeline() {
  console.log('🧪 TESTING PRE-ENRICHMENT PIPELINE\n');
  console.log('='.repeat(80));
  console.log('Goal: Improve word counts from 0/6 to 4/6 pass rate');
  console.log('Method: Enrich sparse scraped data before AI generation');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Initialize enrichment system
  initializeEnrichment();

  // Step 2: Load test events from database
  console.log('📥 Loading test events from database...\n');

  const events = TEST_EVENT_IDS.map((id) => {
    const stmt = db.prepare(`
      SELECT id, title, start_date, venue_name, type, genres as genre,
             price_type, price_amount, description
      FROM events
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;

    return {
      id: row.id,
      title: row.title,
      start_date: row.start_date,
      venue_name: row.venue_name,
      type: row.type,
      genre: row.genre || 'general',
      price_type: row.price_type || 'with-ticket',
      price_amount: row.price_amount,
      description: row.description,
    };
  });

  console.log(`✅ Loaded ${events.length} events\n`);

  // Step 3: Enrich events
  console.log('🔄 Enriching events (this will take ~6 seconds)...\n');

  for (const event of events) {
    const enrichedEvent = await enrichEvent(event);

    // Display enrichment summary
    console.log('📊 Enrichment Summary:');
    console.log(`   Venue: ${enrichedEvent.enrichment.venue_context?.venue_name}`);
    console.log(`   Description: ${enrichedEvent.enrichment.venue_context?.description?.substring(0, 80)}...`);
    console.log(`   Artist: ${enrichedEvent.enrichment.artist_info?.name || 'Not found (will use genre context)'}`);
    console.log(`   Keywords: ${enrichedEvent.enrichment.genre_keywords.slice(0, 5).join(', ')}, ...`);
    console.log('');

    // Display sample enriched prompt
    console.log('📝 Sample Enriched Prompt (first 500 chars):');
    const samplePrompt = generateEnrichedPrompt(enrichedEvent, 'en');
    console.log(samplePrompt.substring(0, 500) + '...\n');
    console.log('='.repeat(80));
    console.log('');

    // Rate limit between events
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Step 4: Instructions for next step
  console.log('\n✅ PRE-ENRICHMENT PIPELINE TEST COMPLETE\n');
  console.log('📋 Next Steps:');
  console.log('');
  console.log('1. The enriched prompts are now ready for AI generation');
  console.log('2. Run the bilingual generation script with enriched prompts');
  console.log('3. Validate word counts (target: 4/6 pass vs. previous 0/6)');
  console.log('');
  console.log('Expected Improvements:');
  console.log('- English: 375-383w → 410-425w (closer to 420w target)');
  console.log('- Greek: 300-378w → 400-430w (closer to 420w target)');
  console.log('');
  console.log('✨ The enriched data provides:');
  console.log('   ✅ Venue descriptions (~100 words of context)');
  console.log('   ✅ Artist bios (if available, ~50-80 words)');
  console.log('   ✅ Genre semantic keywords (natural integration)');
  console.log('   ✅ Event type context (what to expect)');
  console.log('');
  console.log('This should provide enough rich context for the AI to reach 420-word targets!');
  console.log('');
}

testEnrichmentPipeline().catch(console.error);
