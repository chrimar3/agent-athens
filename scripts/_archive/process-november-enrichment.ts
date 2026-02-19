#!/usr/bin/env bun
/**
 * Process November 2025 events enrichment
 * This script prepares the data and coordinates with Claude Code for content generation
 */

import Database from 'bun:sqlite';
import { writeFile, mkdir } from 'fs/promises';
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

interface EnrichmentProgress {
  total: number;
  completed: number;
  failed: number;
  startTime: string;
  lastUpdated: string;
  processedIds: string[];
}

async function loadProgress(): Promise<EnrichmentProgress> {
  try {
    const file = Bun.file('data/enrichment-progress.json');
    if (await file.exists()) {
      return JSON.parse(await file.text());
    }
  } catch (error) {
    console.log('No previous progress found, starting fresh');
  }

  return {
    total: 0,
    completed: 0,
    failed: 0,
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    processedIds: []
  };
}

async function saveProgress(progress: EnrichmentProgress) {
  progress.lastUpdated = new Date().toISOString();
  await writeFile('data/enrichment-progress.json', JSON.stringify(progress, null, 2));
}

async function saveEnrichedDescription(eventId: string, lang: 'en' | 'gr', content: string) {
  const filePath = join('data/enriched', `${eventId}-${lang}.txt`);
  await writeFile(filePath, content, 'utf-8');
}

async function updateDatabase(eventId: string, descriptionEn: string, descriptionGr: string) {
  db.prepare(`
    UPDATE events
    SET
      full_description_en = ?,
      full_description_gr = ?,
      updated_at = ?
    WHERE id = ?
  `).run(descriptionEn, descriptionGr, new Date().toISOString(), eventId);
}

function formatEventForPrompt(event: Event): string {
  const date = event.start_date.split('T')[0];
  const time = event.start_date.split('T')[1]?.substring(0, 5) || 'Not specified';

  let genreText = 'Not specified';
  if (event.genres) {
    try {
      const genresArray = JSON.parse(event.genres);
      genreText = genresArray.join(', ');
    } catch {
      genreText = event.genres;
    }
  }

  return `Event Details:
- Title: ${event.title}
- Type: ${event.type}
- Venue: ${event.venue_name}
- Date: ${date}
- Time: ${time}
- Genre: ${genreText}
- Price: ${event.price_type}

FULL SOURCE DESCRIPTION (${event.source_full_description.length} chars):
${event.source_full_description}`;
}

async function main() {
  console.log('🔄 November 2025 Event Enrichment Processor\n');
  console.log('='.repeat(60));

  // Ensure directories exist
  await mkdir('data/enriched', { recursive: true });
  await mkdir('data/batch-prompts', { recursive: true });

  // Load progress
  const progress = await loadProgress();

  // Query events
  const allEvents = db.prepare(`
    SELECT id, title, start_date, venue_name, type, genres, price_type, source_full_description
    FROM events
    WHERE strftime('%Y-%m', start_date) = '2025-11'
      AND source_full_description IS NOT NULL
      AND LENGTH(source_full_description) > 500
    ORDER BY start_date
  `).all() as Event[];

  console.log(`📊 Total events found: ${allEvents.length}`);

  // Filter out already processed events
  const events = allEvents.filter(e => !progress.processedIds.includes(e.id));

  if (events.length === 0) {
    console.log('✅ All events have been processed!');
    return;
  }

  console.log(`📝 Events to process: ${events.length}`);
  console.log(`✅ Already completed: ${progress.processedIds.length}\n`);

  progress.total = allEvents.length;
  await saveProgress(progress);

  // Export events for batch processing
  const batchSize = 20; // Process 20 at a time
  const batches = Math.ceil(events.length / batchSize);

  console.log(`📦 Creating ${batches} batches of ${batchSize} events each\n`);

  for (let batchNum = 0; batchNum < batches; batchNum++) {
    const batchStart = batchNum * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, events.length);
    const batch = events.slice(batchStart, batchEnd);

    const batchFile = {
      batchNumber: batchNum + 1,
      totalBatches: batches,
      events: batch.map(event => ({
        id: event.id,
        title: event.title,
        eventInfo: formatEventForPrompt(event),
        requirements: [
          'Write exactly 400 words (±20 words acceptable)',
          '**CRITICAL**: Mention ALL performers/artists by name from the source above',
          'Focus on cultural context and what makes this event special',
          'Include artist/performer background if mentioned in source',
          'Mention the Athens neighborhood and venue atmosphere',
          'Write in an authentic, engaging tone (not marketing fluff)',
          'Include practical details naturally (time, location, price)',
          'Target audience: Both AI answer engines and human readers',
          'CRITICAL: Do not fabricate information. Only use the details provided above.',
          'If performer names are mentioned in the source, you MUST include them.',
          'Write in a narrative style that would make someone want to attend.'
        ]
      }))
    };

    const batchFileName = `data/batch-prompts/batch-${String(batchNum + 1).padStart(3, '0')}.json`;
    await writeFile(batchFileName, JSON.stringify(batchFile, null, 2));

    console.log(`✅ Batch ${batchNum + 1}/${batches}: ${batch.length} events (${batchStart + 1}-${batchEnd})`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 NEXT STEPS');
  console.log('='.repeat(60));
  console.log('1. Process each batch file in data/batch-prompts/');
  console.log('2. For each event, generate:');
  console.log('   - English 400-word description');
  console.log('   - Greek 400-word description');
  console.log('3. Save descriptions to data/enriched/{event-id}-{lang}.txt');
  console.log('4. Update database with enriched descriptions');
  console.log('\n📁 Batch files location: data/batch-prompts/');
  console.log(`📊 Total batches created: ${batches}`);
}

main().catch(console.error);
