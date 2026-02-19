import { Database } from 'bun:sqlite';
import {
  initializeEnrichment,
  enrichEvent,
  generateEnrichedPrompt,
} from '../src/enrichment/enrichment-engine';

const db = new Database('data/events.db');

console.log('🚀 Generating prompts for Batch 1 (20 events)...\n');

initializeEnrichment();

// Get 20 unenriched events
const events = db.prepare(`
  SELECT id, title, start_date, venue_name, type, genres as genre,
         price_type, price_amount, description
  FROM events
  WHERE (full_description_en IS NULL OR full_description_en = '')
    AND (full_description_gr IS NULL OR full_description_gr = '')
  ORDER BY start_date ASC
  LIMIT 20
`).all() as any[];

console.log(`📊 Processing ${events.length} events\n`);

for (let i = 0; i < events.length; i++) {
  const event = events[i];
  console.log(`[${i + 1}/20] ${event.title.substring(0, 50)}...`);

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

  const promptEN = generateEnrichedPrompt(enrichedEvent, 'en', 420);
  const promptGR = generateEnrichedPrompt(enrichedEvent, 'gr', 430);

  const prefix = `data/batch-20-prompts/${String(i + 1).padStart(2, '0')}-${event.id}`;
  await Bun.write(`${prefix}-en.txt`, promptEN);
  await Bun.write(`${prefix}-gr.txt`, promptGR);
}

console.log('\n✅ All 20 event prompts generated!');
console.log('📁 Location: data/batch-20-prompts/');
console.log('\n⏭️  Next: Call Task tool 40 times (20 EN + 20 GR)');

db.close();
