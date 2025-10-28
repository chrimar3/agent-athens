#!/usr/bin/env bun
/**
 * Batch AI enrichment for events - FREE via Claude Code
 * This script prepares event data and prompts for AI enrichment
 * Run with: bun scripts/enrich-batch.ts [batch_size]
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

const db = new Database('data/events.db');

interface Event {
  id: string;
  title: string;
  type: string;
  venue_name: string;
  start_date: string;
  genres: string | null;
  description: string | null;
  price_type: string;
}

// Get unenriched events in next month
const batchSize = parseInt(process.argv[2] || '10');
const events = db.prepare(`
  SELECT id, title, type, venue_name, start_date, genres, description, price_type
  FROM events
  WHERE (full_description IS NULL OR full_description = '')
    AND start_date >= date('now')
    AND start_date < date('now', '+1 month')
  ORDER BY start_date ASC
  LIMIT ?
`).all(batchSize) as Event[];

console.log(`🤖 AI Enrichment - Batch Processing`);
console.log('='.repeat(70));
console.log(`\n📊 Processing ${events.length} events (batch size: ${batchSize})`);

if (events.length === 0) {
  console.log('\n✅ No events need enrichment!');
  process.exit(0);
}

// Process each event with tool_agent
let enriched = 0;
let failed = 0;

for (const event of events) {
  console.log(`\n[${enriched + failed + 1}/${events.length}] ${event.title.substring(0, 60)}`);

  try {
    // Build prompt for tool_agent
    const prompt = `Generate a compelling 400-word description for this cultural event in Athens, Greece.

Event Details:
- Title: ${event.title}
- Type: ${event.type}
- Venue: ${event.venue_name}
- Date: ${event.start_date}
- Price: ${event.price_type}
${event.description ? `- Short Description: ${event.description}` : ''}

Requirements:
1. Write exactly 400 words (±20 words acceptable)
2. Focus on cultural context and what makes this event special
3. Include artist/performer background if relevant
4. Mention the Athens cultural scene and venue atmosphere
5. Write in an engaging, authentic tone (not marketing fluff)
6. Include practical details naturally (time, location, price)
7. Target audience: Both AI answer engines and human readers

CRITICAL: Do not fabricate information. Only use the details provided above.

Write in a narrative style that would make someone want to attend.`;

    // Use tool_agent (FREE via Claude Code built-in)
    const description = await callToolAgent(prompt);

    // Validate word count
    const wordCount = description.split(/\s+/).length;

    if (wordCount < 380 || wordCount > 420) {
      console.log(`   ⚠️  Word count: ${wordCount} (target: 400)`);
    } else {
      console.log(`   ✅ Word count: ${wordCount}`);
    }

    // Update database
    db.prepare(`
      UPDATE events
      SET full_description = ?,
          updated_at = ?
      WHERE id = ?
    `).run(description, new Date().toISOString(), event.id);

    enriched++;
    console.log(`   ✅ Enriched successfully`);

    // Rate limiting: 2 seconds between calls
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    failed++;
  }
}

db.close();

console.log('\n' + '='.repeat(70));
console.log(`📊 Summary:`);
console.log(`   ✅ Enriched: ${enriched}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`\n✅ Batch complete!`);
console.log('='.repeat(70));

// Helper function - This will be handled by Claude Code directly
// We'll generate descriptions inline as Claude Code can do this for free
async function callToolAgent(prompt: string): Promise<string> {
  // This function will be replaced with direct generation by Claude Code
  // when running through the Task tool with ai-engineer agent
  throw new Error('This script must be run through Claude Code Task tool for free AI generation');
}
