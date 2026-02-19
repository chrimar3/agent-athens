#!/usr/bin/env bun
/**
 * Re-enrich November events with FULL source descriptions (includes performer names)
 */

import { db } from '../src/db/database';
import { DateTime } from 'luxon';

interface Event {
  id: string;
  title: string;
  start_date: string;
  time_start: string | null;
  venue_name: string;
  event_type: string;
  genre: string | null;
  price_type: string;
  source_description: string | null;
  source_full_description: string | null;
}

async function enrichEvent(event: Event, lang: 'en' | 'gr'): Promise<string> {
  const sourceText = event.source_full_description || event.source_description || 'No description available';

  const prompt = `Generate a compelling ${lang === 'en' ? '400-word English' : '400-word Greek'} description for this cultural event in Athens, Greece.

Event Details:
- Title: ${event.title}
- Type: ${event.event_type}
- Venue: ${event.venue_name}
- Date: ${event.start_date}
- Time: ${event.time_start || 'Not specified'}
- Genre: ${event.genre || 'Not specified'}
- Price: ${event.price_type}

FULL SOURCE DESCRIPTION (${sourceText.length} chars):
${sourceText}

Requirements:
1. Write exactly 400 words (±20 words acceptable)
2. **CRITICAL**: Mention ALL performers/artists by name from the source above
3. Focus on cultural context and what makes this event special
4. Include artist/performer background if mentioned in source
5. Mention the Athens neighborhood and venue atmosphere
6. Write in an authentic, engaging tone (not marketing fluff)
7. Include practical details naturally (time, location, price)
8. Target audience: Both AI answer engines and human readers

${lang === 'en' ? 'Write in English.' : 'Γράψτε στα ελληνικά (Write in Greek).'}

CRITICAL: Do not fabricate information. Only use the details provided above.
If performer names are mentioned in the source, you MUST include them.

Write in a narrative style that would make someone want to attend.`;

  return prompt;
}

async function main() {
  console.log('🔄 Re-enriching November 2025 events with FULL source descriptions...\n');

  // Get November events with full descriptions
  const events = db.prepare(`
    SELECT id, title, start_date, time_start, venue_name, event_type, genre, price_type,
           source_description, source_full_description
    FROM events
    WHERE strftime('%Y-%m', start_date) = '2025-11'
      AND source_full_description IS NOT NULL
      AND LENGTH(source_full_description) > 500
    ORDER BY start_date, time_start
  `).all() as Event[];

  console.log(`📊 Found ${events.length} events with full descriptions to enrich\n`);

  let enriched = 0;
  const startTime = Date.now();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    console.log(`\n[${i + 1}/${events.length}] ${event.title}`);
    console.log(`   Source: ${event.source_full_description?.length || 0} chars (full description)`);

    try {
      // Generate prompts
      const enPrompt = await enrichEvent(event, 'en');
      const grPrompt = await enrichEvent(event, 'gr');

      console.log(`   🤖 Enriching in English...`);
      // Here you would call the Task tool with seo-content-writer
      // For now, just log the prompts
      console.log(`   Prompt length: ${enPrompt.length} chars`);

      console.log(`   🤖 Enriching in Greek...`);
      console.log(`   Prompt length: ${grPrompt.length} chars`);

      enriched++;

      // Rate limiting
      if (i < events.length - 1) {
        console.log(`   ⏱️  Waiting 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000 / 60);
  console.log(`\n✅ Enrichment complete!`);
  console.log(`   Events processed: ${enriched}/${events.length}`);
  console.log(`   Duration: ${duration} minutes`);
}

main().catch(console.error);
