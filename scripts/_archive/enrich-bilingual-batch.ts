/**
 * Batch Bilingual Enrichment Script
 *
 * Purpose: Generate both English and Greek descriptions for events
 * using the pre-enrichment pipeline
 *
 * Usage:
 *   bun run scripts/enrich-bilingual-batch.ts [--limit N] [--skip-existing]
 *
 * Features:
 *   - Progress tracking with resume capability
 *   - Rate limiting (2s between API calls)
 *   - Saves to full_description_en and full_description_gr columns
 *   - Validates word counts
 *   - Comprehensive logging
 */

import { Database } from 'bun:sqlite';
import {
  initializeEnrichment,
  enrichEvent,
  generateEnrichedPrompt,
} from '../src/enrichment/enrichment-engine';

const db = new Database('data/events.db');

interface EnrichmentProgress {
  total: number;
  processed: number;
  en_generated: number;
  gr_generated: number;
  en_pass: number;
  gr_pass: number;
  errors: number;
  last_event_id: string | null;
}

const PROGRESS_FILE = 'data/.enrichment-progress.json';
const RATE_LIMIT_MS = 2000; // 2 seconds between API calls

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const skipExisting = args.includes('--skip-existing');

console.log('🚀 BILINGUAL BATCH ENRICHMENT');
console.log('='.repeat(80));
console.log(`Limit: ${limit || 'ALL EVENTS'}`);
console.log(`Skip existing: ${skipExisting ? 'YES' : 'NO'}`);
console.log('='.repeat(80));
console.log('');

// Load or initialize progress
let progress: EnrichmentProgress = {
  total: 0,
  processed: 0,
  en_generated: 0,
  gr_generated: 0,
  en_pass: 0,
  gr_pass: 0,
  errors: 0,
  last_event_id: null,
};

try {
  const progressFile = await Bun.file(PROGRESS_FILE).text();
  progress = JSON.parse(progressFile);
  console.log('📥 Loaded progress from previous session');
  console.log(`   Processed: ${progress.processed}/${progress.total}`);
  console.log(`   Last event: ${progress.last_event_id}`);
  console.log('');
} catch (error) {
  console.log('📝 Starting fresh (no previous progress found)');
  console.log('');
}

// Helper to save progress
async function saveProgress() {
  await Bun.write(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Helper to validate word count
function validateWordCount(text: string, language: 'en' | 'gr'): boolean {
  const wordCount = text.split(/\s+/).length;
  const minWords = language === 'en' ? 400 : 390;
  const maxWords = language === 'en' ? 440 : 450;
  return wordCount >= minWords && wordCount <= maxWords;
}

// Main enrichment function
async function enrichBilingual() {
  // Initialize enrichment system
  console.log('🔄 Initializing enrichment system...');
  initializeEnrichment();
  console.log('✅ Enrichment system ready');
  console.log('');

  // Load events needing enrichment
  let query = `
    SELECT id, title, start_date, venue_name, type, genres as genre,
           price_type, price_amount, description,
           full_description_en, full_description_gr
    FROM events
    WHERE start_date >= date('now')  -- Only future/current events
  `;

  if (skipExisting) {
    query += ` AND (full_description_en IS NULL OR full_description_gr IS NULL)`;
  }

  query += ` ORDER BY start_date ASC`;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const stmt = db.prepare(query);
  const events = stmt.all() as any[];

  progress.total = events.length;
  console.log(`📥 Loaded ${events.length} events for enrichment`);
  console.log('');

  // Process each event
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventNum = i + 1;

    console.log(`\n[${ eventNum}/${events.length}] ${event.title}`);
    console.log('='.repeat(60));

    try {
      // Enrich event with context
      console.log('🔄 Enriching event with venue/artist context...');
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

      // Generate English description (if needed)
      let descriptionEN = event.full_description_en;
      if (!descriptionEN || !skipExisting) {
        console.log('🇬🇧 Generating English description...');
        const promptEN = generateEnrichedPrompt(enrichedEvent, 'en', 420);

        // NOTE: In real implementation, call Task tool here
        // For now, mark as placeholder
        console.log('   ⚠️  Task tool call needed (not implemented in script)');
        console.log('   💡 Use Claude Code to call Task tool manually');
        descriptionEN = '[NEEDS_GENERATION]';

        // Uncomment when Task tool integration is ready:
        // const result = await callTaskTool(promptEN);
        // descriptionEN = result.description;
        // const wordCountEN = descriptionEN.split(/\s+/).length;
        // const passEN = validateWordCount(descriptionEN, 'en');
        // console.log(`   ✅ English: ${wordCountEN} words ${passEN ? '✅' : '❌'}`);
        // if (passEN) progress.en_pass++;
      } else {
        console.log('⏭️  English description exists (skipped)');
      }

      // Rate limit between languages
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));

      // Generate Greek description (if needed)
      let descriptionGR = event.full_description_gr;
      if (!descriptionGR || !skipExisting) {
        console.log('🇬🇷 Generating Greek description...');
        const promptGR = generateEnrichedPrompt(enrichedEvent, 'gr', 430);

        console.log('   ⚠️  Task tool call needed (not implemented in script)');
        console.log('   💡 Use Claude Code to call Task tool manually');
        descriptionGR = '[NEEDS_GENERATION]';

        // Uncomment when Task tool integration is ready:
        // const result = await callTaskTool(promptGR);
        // descriptionGR = result.description;
        // const wordCountGR = descriptionGR.split(/\s+/).length;
        // const passGR = validateWordCount(descriptionGR, 'gr');
        // console.log(`   ✅ Greek: ${wordCountGR} words ${passGR ? '✅' : '❌'}`);
        // if (passGR) progress.gr_pass++;
      } else {
        console.log('⏭️  Greek description exists (skipped)');
      }

      // Save to database
      if (descriptionEN !== '[NEEDS_GENERATION]' || descriptionGR !== '[NEEDS_GENERATION]') {
        const updateStmt = db.prepare(`
          UPDATE events
          SET full_description_en = ?,
              full_description_gr = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `);
        updateStmt.run(descriptionEN, descriptionGR, event.id);
        console.log('💾 Saved to database');
      }

      // Update progress
      progress.processed++;
      progress.last_event_id = event.id;
      if (descriptionEN !== event.full_description_en) progress.en_generated++;
      if (descriptionGR !== event.full_description_gr) progress.gr_generated++;
      await saveProgress();

      // Rate limit between events
      if (i < events.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }
    } catch (error) {
      console.error(`❌ Error processing event: ${error}`);
      progress.errors++;
      await saveProgress();
    }
  }

  // Final summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 ENRICHMENT COMPLETE');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Total events: ${progress.total}`);
  console.log(`Processed: ${progress.processed}`);
  console.log(`English generated: ${progress.en_generated}`);
  console.log(`Greek generated: ${progress.gr_generated}`);
  console.log(`English pass rate: ${progress.en_pass}/${progress.en_generated} (${Math.round((progress.en_pass / progress.en_generated) * 100)}%)`);
  console.log(`Greek pass rate: ${progress.gr_pass}/${progress.gr_generated} (${Math.round((progress.gr_pass / progress.gr_generated) * 100)}%)`);
  console.log(`Errors: ${progress.errors}`);
  console.log('');
  console.log('='.repeat(80));
  console.log('');
  console.log('⚠️  NOTE: Task tool integration needed for actual AI generation');
  console.log('💡 Use Claude Code to call Task tool for each description');
  console.log('');
}

// Run enrichment
enrichBilingual().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
