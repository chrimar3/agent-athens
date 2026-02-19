#!/usr/bin/env bun
/**
 * Generate enrichment prompts for November 2025 events
 * To be processed by Claude Code in batches
 */

import Database from 'bun:sqlite';
import { writeFile } from 'fs/promises';
import { join } from 'path';

const db = new Database('data/events.db');

interface Event {
  id: string;
  title: string;
  start_date: string;
  venue_name: string;
  type: string;
  genres: string | null;
  price_type: string;
  source_full_description: string;
}

async function main() {
  console.log('🔄 Generating enrichment prompts for November 2025 events...\n');

  // Query events
  const events = db.prepare(`
    SELECT id, title, start_date, venue_name, type, genres, price_type, source_full_description
    FROM events
    WHERE strftime('%Y-%m', start_date) = '2025-11'
      AND source_full_description IS NOT NULL
      AND LENGTH(source_full_description) > 500
    ORDER BY start_date
  `).all() as Event[];

  console.log(`📊 Found ${events.length} events to process\n`);

  // Create batch directory
  await Bun.write('data/enrichment-batch/info.json', JSON.stringify({
    totalEvents: events.length,
    createdAt: new Date().toISOString(),
    status: 'pending'
  }, null, 2));

  // Generate prompts for each event
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const batchNum = String(i + 1).padStart(4, '0');

    // Parse date and time
    const date = event.start_date.split('T')[0];
    const time = event.start_date.split('T')[1]?.substring(0, 5) || 'Not specified';

    // Parse genres
    let genreText = 'Not specified';
    if (event.genres) {
      try {
        const genresArray = JSON.parse(event.genres);
        genreText = genresArray.join(', ');
      } catch {
        genreText = event.genres;
      }
    }

    // Save event metadata
    await Bun.write(
      `data/enrichment-batch/${batchNum}-${event.id}.json`,
      JSON.stringify({
        id: event.id,
        title: event.title,
        date,
        time,
        venue: event.venue_name,
        type: event.type,
        genre: genreText,
        priceType: event.price_type,
        sourceLength: event.source_full_description.length
      }, null, 2)
    );

    // English prompt
    const promptEN = `Generate a compelling 400-word English description for this cultural event in Athens, Greece.

Event Details:
- Title: ${event.title}
- Type: ${event.type}
- Venue: ${event.venue_name}
- Date: ${date}
- Time: ${time}
- Genre: ${genreText}
- Price: ${event.price_type}

FULL SOURCE DESCRIPTION (${event.source_full_description.length} chars):
${event.source_full_description}

Requirements:
1. Write exactly 400 words (±20 words acceptable)
2. **CRITICAL**: Mention ALL performers/artists by name from the source above
3. Focus on cultural context and what makes this event special
4. Include artist/performer background if mentioned in source
5. Mention the Athens neighborhood and venue atmosphere
6. Write in an authentic, engaging tone (not marketing fluff)
7. Include practical details naturally (time, location, price)
8. Target audience: Both AI answer engines and human readers

Write in English

CRITICAL: Do not fabricate information. Only use the details provided above.
If performer names are mentioned in the source, you MUST include them.

Write in a narrative style that would make someone want to attend.`;

    await Bun.write(`data/enrichment-batch/${batchNum}-${event.id}-prompt-en.txt`, promptEN);

    // Greek prompt
    const promptGR = `Generate a compelling 400-word Greek description for this cultural event in Athens, Greece.

Event Details:
- Title: ${event.title}
- Type: ${event.type}
- Venue: ${event.venue_name}
- Date: ${date}
- Time: ${time}
- Genre: ${genreText}
- Price: ${event.price_type}

FULL SOURCE DESCRIPTION (${event.source_full_description.length} chars):
${event.source_full_description}

Requirements:
1. Write exactly 400 words (±20 words acceptable)
2. **CRITICAL**: Mention ALL performers/artists by name from the source above
3. Focus on cultural context and what makes this event special
4. Include artist/performer background if mentioned in source
5. Mention the Athens neighborhood and venue atmosphere
6. Write in an authentic, engaging tone (not marketing fluff)
7. Include practical details naturally (time, location, price)
8. Target audience: Both AI answer engines and human readers

Γράψτε στα ελληνικά (Write in Greek)

CRITICAL: Do not fabricate information. Only use the details provided above.
If performer names are mentioned in the source, you MUST include them.

Write in a narrative style that would make someone want to attend.`;

    await Bun.write(`data/enrichment-batch/${batchNum}-${event.id}-prompt-gr.txt`, promptGR);

    if ((i + 1) % 10 === 0) {
      console.log(`✅ Generated prompts for ${i + 1}/${events.length} events`);
    }
  }

  console.log(`\n✅ All prompts generated successfully!`);
  console.log(`📁 Location: data/enrichment-batch/`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Use Claude Code to process each prompt`);
  console.log(`   2. Save responses to data/enriched/{event-id}-{lang}.txt`);
  console.log(`   3. Update database with enriched descriptions`);
}

main().catch(console.error);
