/**
 * Test Bilingual Sample Generation
 *
 * Purpose: Validate the complete pipeline with a small sample
 * - Load test events
 * - Enrich with pre-enrichment pipeline
 * - Generate enriched prompts
 * - Display for manual Task tool calling
 */

import { Database } from 'bun:sqlite';
import {
  initializeEnrichment,
  enrichEvent,
  generateEnrichedPrompt,
} from '../src/enrichment/enrichment-engine';

const db = new Database('data/events.db');

// Test event IDs from our sample
const TEST_EVENT_IDS = [
  'c1058bb73683463a', // TYPHUS metal concert
  'o-caja-de-musica-2025-11-23', // Rock concert
  '2fccf9d9f20d1a8a', // Ozzy tribute
];

async function testEnrichmentPipeline() {
  console.log('🧪 BILINGUAL ENRICHMENT PIPELINE TEST');
  console.log('='.repeat(80));
  console.log('');

  // Initialize enrichment system
  console.log('🔄 Initializing enrichment system...');
  initializeEnrichment();
  console.log('✅ Enrichment system ready');
  console.log('');

  // Process each test event
  for (let i = 0; i < TEST_EVENT_IDS.length; i++) {
    const eventId = TEST_EVENT_IDS[i];
    console.log(`\n[${ i + 1}/${TEST_EVENT_IDS.length}] Processing event: ${eventId}`);
    console.log('='.repeat(80));

    try {
      // Load event from database
      const event = db.prepare(`
        SELECT id, title, start_date, venue_name, type, genres as genre,
               price_type, price_amount, description
        FROM events
        WHERE id = ?
      `).get(eventId) as any;

      if (!event) {
        console.error(`❌ Event not found: ${eventId}`);
        continue;
      }

      console.log(`📝 Title: ${event.title}`);
      console.log(`🏛️  Venue: ${event.venue_name}`);
      console.log(`🎭 Type: ${event.type}`);
      console.log(`🎵 Genre: ${event.genre || 'general'}`);
      console.log('');

      // Enrich the event
      console.log('🔄 Enriching with pre-enrichment pipeline...');
      const enrichedEvent = await enrichEvent({
        id: event.id,
        title: event.title,
        start_date: event.start_date,
        venue_name: event.venue_name,
        type: event.type,
        genre: event.genre || 'general',
        price_type: event.price_type || 'with-ticket',
        price_amount: event.price_amount,
        description: event.description,
      });

      console.log('✅ Event enriched');
      console.log(`   Venue context: ${enrichedEvent.enrichment.venue_context ? 'YES' : 'NO'}`);
      console.log(`   Artist info: ${enrichedEvent.enrichment.artist_info ? 'YES' : 'NO'}`);
      console.log(`   Genre keywords: ${enrichedEvent.enrichment.genre_keywords.length} terms`);
      console.log('');

      // Generate enriched prompts
      console.log('📝 Generating enriched prompts...');
      const promptEN = generateEnrichedPrompt(enrichedEvent, 'en', 420);
      const promptGR = generateEnrichedPrompt(enrichedEvent, 'gr', 420);

      // Count prompt words
      const promptWordsEN = promptEN.split(/\s+/).length;
      const promptWordsGR = promptGR.split(/\s+/).length;

      console.log(`   English prompt: ${promptWordsEN} words`);
      console.log(`   Greek prompt: ${promptWordsGR} words`);
      console.log('');

      // Save prompts to files for Task tool
      const filePrefix = `data/test-prompts/${eventId}`;
      await Bun.write(`${filePrefix}-en.txt`, promptEN);
      await Bun.write(`${filePrefix}-gr.txt`, promptGR);

      console.log(`💾 Prompts saved:`);
      console.log(`   ${filePrefix}-en.txt`);
      console.log(`   ${filePrefix}-gr.txt`);
      console.log('');

      console.log('='.repeat(80));
      console.log('🇬🇧 ENGLISH PROMPT:');
      console.log('='.repeat(80));
      console.log(promptEN);
      console.log('');
      console.log('='.repeat(80));
      console.log('🇬🇷 GREEK PROMPT:');
      console.log('='.repeat(80));
      console.log(promptGR);
      console.log('');

    } catch (error) {
      console.error(`❌ Error processing event ${eventId}:`, error);
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Events processed: ${TEST_EVENT_IDS.length}`);
  console.log(`Prompts generated: ${TEST_EVENT_IDS.length * 2} (EN + GR)`);
  console.log('');
  console.log('⏭️  NEXT STEPS:');
  console.log('   1. Review prompts in data/test-prompts/');
  console.log('   2. Call Task tool for each prompt to generate descriptions');
  console.log('   3. Save results and validate word counts');
  console.log('   4. Update database with bilingual descriptions');
  console.log('');
}

// Run the test
testEnrichmentPipeline().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
