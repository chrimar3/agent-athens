/**
 * Process 10 Events - Generate Enriched Prompts
 *
 * Generates all enriched prompts for 10-event sample
 * Saves prompts to data/batch-10-events/ for Task tool processing
 */

import { Database } from 'bun:sqlite';
import {
  initializeEnrichment,
  enrichEvent,
  generateEnrichedPrompt,
} from '../src/enrichment/enrichment-engine';

const db = new Database('data/events.db');

const EVENT_IDS = [
  'b22003ca37f28b38', // Η Παναγία των Παρισίων
  '9a498120957c0146', // ΔΗΜΗΤΡΗΣ ΣΑΜΟΛΗΣ LIVE
  '1859f1ae6c91776e', // Π Α Ρ Α Μ Υ Θ Ο Τ Ε Χ Ν Ι Τ Ε Σ
  '65-2025-11-04',     // Θέατρο για όλους 65+
  'f40d6a18771b35bb', // ΛΑΙΔΗ ΜΑΚΒΕΘ
  'c0fc8107048e9a2f', // ΕΙΚΟΣΙΕΞΙ
  'ba808b0193343be6', // ΛΑΣΠΟΚΤΗΜΑ
  'songs-in-revolution-2025-11-04', // SONGS IN REVOLUTION
  '5c500613cf9d83cf', // Sound of Color #2
  'tikt-2025-11-04',   // ΤΑ ΧΕΙΡΟΤΕΡ@
];

async function generateAllPrompts() {
  console.log('🚀 10-EVENT BATCH PROCESSING');
  console.log('='.repeat(80));
  console.log('');

  initializeEnrichment();

  for (let i = 0; i < EVENT_IDS.length; i++) {
    const eventId = EVENT_IDS[i];
    console.log(`\n[${i + 1}/10] Processing: ${eventId}`);
    console.log('='.repeat(80));

    try {
      // Load event
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

      console.log(`📝 ${event.title}`);
      console.log(`🎭 Type: ${event.type} | Venue: ${event.venue_name}`);

      // Enrich
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

      // Generate prompts
      const promptEN = generateEnrichedPrompt(enrichedEvent, 'en', 420);
      const promptGR = generateEnrichedPrompt(enrichedEvent, 'gr', 430);

      // Save prompts
      const prefix = `data/batch-10-events/${String(i + 1).padStart(2, '0')}-${eventId}`;
      await Bun.write(`${prefix}-en.txt`, promptEN);
      await Bun.write(`${prefix}-gr.txt`, promptGR);

      console.log(`✅ Prompts saved:`);
      console.log(`   ${prefix}-en.txt`);
      console.log(`   ${prefix}-gr.txt`);

    } catch (error) {
      console.error(`❌ Error: ${error}`);
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('✅ ALL PROMPTS GENERATED');
  console.log('='.repeat(80));
  console.log('');
  console.log('📁 Prompts saved in: data/batch-10-events/');
  console.log('');
  console.log('⏭️  NEXT: Call Task tool for each prompt');
  console.log('');
}

generateAllPrompts().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
