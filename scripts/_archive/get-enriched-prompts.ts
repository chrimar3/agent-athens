import { Database } from 'bun:sqlite';
import {
  initializeEnrichment,
  enrichEvent,
  generateEnrichedPrompt,
} from '../src/enrichment/enrichment-engine';

const db = new Database('data/events.db');

const TEST_EVENT_IDS = [
  '0c47c72c04904378', // Jazz concert
  'jeremy-2025-11-04', // Comedy
  'eat-drink-draw-2025-11-05', // Workshop
];

async function getEnrichedPrompts() {
  // Initialize
  initializeEnrichment();

  // Load events
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

  // Enrich events
  const enrichedEvents = [];
  for (const event of events) {
    const enriched = await enrichEvent(event);
    enrichedEvents.push(enriched);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Generate prompts for each language
  const prompts: any[] = [];
  for (const enriched of enrichedEvents) {
    prompts.push({
      event_id: enriched.id,
      title: enriched.title,
      type: enriched.type,
      prompt_en: generateEnrichedPrompt(enriched, 'en', 420),
      prompt_gr: generateEnrichedPrompt(enriched, 'gr', 420),
    });
  }

  console.log(JSON.stringify(prompts, null, 2));
}

getEnrichedPrompts().catch(console.error);
