#!/usr/bin/env bun
/**
 * Re-enrich November 2025 events with FULL descriptions including performer names
 *
 * Purpose: Generate 400-word descriptions (EN + GR) using source_full_description
 * which contains performer names and detailed event information.
 */

import Database from 'bun:sqlite';
import { DateTime } from 'luxon';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// Database setup
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

// Tool agent call function
async function callToolAgent(prompt: string): Promise<string> {
  const endpoint = process.env.TOOL_AGENT_ENDPOINT || 'http://localhost:3000/v1/messages';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Tool agent returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('❌ Tool agent error:', error);
    throw error;
  }
}

// Validate word count
function validateWordCount(text: string, language: string): boolean {
  const wordCount = text.trim().split(/\s+/).length;
  const isValid = wordCount >= 380 && wordCount <= 420;

  if (!isValid) {
    console.warn(`⚠️  ${language} word count: ${wordCount} (target: 400 ±20)`);
  }

  return isValid;
}

// Generate enriched description
async function enrichEvent(event: Event, language: 'en' | 'gr'): Promise<string> {
  const isEnglish = language === 'en';
  const langLabel = isEnglish ? 'English' : 'Greek';
  const langInstruction = isEnglish ? 'Write in English' : 'Γράψτε στα ελληνικά';
  const wordTarget = isEnglish ? '400-word English' : '400-word Greek';

  // Extract date and time from start_date
  const dateTime = DateTime.fromISO(event.start_date, { zone: 'Europe/Athens' });
  const date = dateTime.toISODate() || 'Not specified';
  const time = dateTime.toFormat('HH:mm') || 'Not specified';

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

  const prompt = `Generate a compelling ${wordTarget} description for this cultural event in Athens, Greece.

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

${langInstruction}

CRITICAL: Do not fabricate information. Only use the details provided above.
If performer names are mentioned in the source, you MUST include them.

Write in a narrative style that would make someone want to attend.`;

  const description = await callToolAgent(prompt);

  // Validate word count
  validateWordCount(description, langLabel);

  return description;
}

// Main enrichment process
async function enrichAllEvents() {
  const startTime = Date.now();

  console.log('🔄 Starting November 2025 event enrichment...\n');

  // Query events
  const events = db.prepare(`
    SELECT id, title, start_date, venue_name, type, genres, price_type, source_full_description
    FROM events
    WHERE strftime('%Y-%m', start_date) = '2025-11'
      AND source_full_description IS NOT NULL
      AND LENGTH(source_full_description) > 500
    ORDER BY start_date
  `).all() as Event[];

  console.log(`📊 Found ${events.length} events to enrich\n`);

  if (events.length === 0) {
    console.log('✅ No events to enrich');
    return;
  }

  // Statistics
  const stats = {
    total: events.length,
    enriched: 0,
    failed: 0,
    wordCountsEn: [] as number[],
    wordCountsGr: [] as number[],
    samples: [] as Array<{ title: string; performers: string }>
  };

  // Process each event
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventNum = i + 1;

    try {
      console.log(`[${eventNum}/${events.length}] 🤖 Enriching: "${event.title}"`);

      // Generate English description
      console.log('  📝 Generating English description...');
      const descriptionEn = await enrichEvent(event, 'en');
      const wordCountEn = descriptionEn.trim().split(/\s+/).length;
      stats.wordCountsEn.push(wordCountEn);

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate Greek description
      console.log('  📝 Generating Greek description...');
      const descriptionGr = await enrichEvent(event, 'gr');
      const wordCountGr = descriptionGr.trim().split(/\s+/).length;
      stats.wordCountsGr.push(wordCountGr);

      // Save to files
      const filePathEn = join('data/enriched', `${event.id}-en.txt`);
      const filePathGr = join('data/enriched', `${event.id}-gr.txt`);

      await writeFile(filePathEn, descriptionEn, 'utf-8');
      await writeFile(filePathGr, descriptionGr, 'utf-8');

      // Update database
      db.prepare(`
        UPDATE events
        SET
          full_description_en = ?,
          full_description_gr = ?,
          updated_at = ?
        WHERE id = ?
      `).run(descriptionEn, descriptionGr, new Date().toISOString(), event.id);

      stats.enriched++;

      // Store sample for report (first 3 events)
      if (stats.samples.length < 3) {
        // Extract performer names from description
        const performerMatches = descriptionEn.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g);
        const performers = performerMatches ? performerMatches.slice(0, 3).join(', ') : 'No performers extracted';
        stats.samples.push({
          title: event.title,
          performers
        });
      }

      console.log(`  ✅ Saved (EN: ${wordCountEn} words, GR: ${wordCountGr} words)\n`);

      // Progress update every 10 events
      if (eventNum % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = elapsed / eventNum;
        const remaining = (events.length - eventNum) * rate;
        console.log(`📊 Progress: ${eventNum}/${events.length} (${Math.round(eventNum / events.length * 100)}%)`);
        console.log(`⏱️  ETA: ${Math.round(remaining / 60)} minutes\n`);
      }

      // Rate limit between events
      if (i < events.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`❌ Failed to enrich event ${event.id}:`, error);
      stats.failed++;
    }
  }

  // Final report
  const duration = (Date.now() - startTime) / 1000 / 60;

  console.log('\n' + '='.repeat(60));
  console.log('📊 ENRICHMENT COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total events processed: ${stats.total}`);
  console.log(`Successfully enriched: ${stats.enriched}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Duration: ${Math.round(duration)} minutes`);
  console.log('');

  // Word count statistics
  const avgEn = stats.wordCountsEn.reduce((a, b) => a + b, 0) / stats.wordCountsEn.length;
  const avgGr = stats.wordCountsGr.reduce((a, b) => a + b, 0) / stats.wordCountsGr.length;

  console.log('📝 WORD COUNT STATISTICS');
  console.log('-'.repeat(60));
  console.log(`English average: ${Math.round(avgEn)} words`);
  console.log(`Greek average: ${Math.round(avgGr)} words`);
  console.log('');

  // Sample events with performers
  console.log('🎭 SAMPLE EVENTS (Performer Names Included)');
  console.log('-'.repeat(60));
  stats.samples.forEach((sample, idx) => {
    console.log(`${idx + 1}. "${sample.title}"`);
    console.log(`   Performers: ${sample.performers}`);
    console.log('');
  });

  // Verification query
  const verified = db.prepare(`
    SELECT COUNT(*) as count
    FROM events
    WHERE strftime('%Y-%m', start_date) = '2025-11'
      AND full_description_en IS NOT NULL
      AND full_description_gr IS NOT NULL
      AND LENGTH(full_description_en) > 100
      AND LENGTH(full_description_gr) > 100
  `).get() as { count: number };

  console.log('✅ DATABASE VERIFICATION');
  console.log('-'.repeat(60));
  console.log(`Events with both EN+GR descriptions: ${verified.count}/${stats.total}`);
  console.log('');

  if (verified.count === stats.total) {
    console.log('🎉 SUCCESS: All November events have been enriched!');
  } else {
    console.warn(`⚠️  WARNING: ${stats.total - verified.count} events missing descriptions`);
  }
}

// Run
enrichAllEvents()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
