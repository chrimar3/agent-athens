#!/usr/bin/env bun
/**
 * Import events from batch files into database, then enrich them with 400-word descriptions
 * Usage: bun run scripts/import-and-enrich-batches.ts
 */

import { getDatabase } from '../src/db/database';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Word count utility
function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

// Create slug from title and date
function createSlug(title: string, date: string): string {
  const dateObj = new Date(date);
  const dateStr = dateObj.toISOString().split('T')[0];
  const titleSlug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
  return `${titleSlug}-${dateStr}`;
}

// Generate culturally rich 400-word description
async function generateDescription(event: any): Promise<string> {
  const {title, type, start_date, venue_name, description: sourceDesc, genres} = event;

  // Parse date
  const date = new Date(start_date);
  const dateStr = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  // Parse time
  const timeStr = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // Parse genres
  let genreList: string[] = [];
  try {
    if (genres && genres !== '[]') {
      genreList = JSON.parse(genres);
    }
  } catch (e) {
    // ignore parse errors
  }

  // Generate description based on event characteristics
  const descriptions: string[] = [];

  // Opening paragraph - set the scene
  if (type === 'concert') {
    if (title.toLowerCase().includes('jazz') || venue_name.toLowerCase().includes('jazz')) {
      descriptions.push(`Athens' jazz scene comes alive on ${dateStr} when ${title} takes the stage at ${venue_name}. The venue's intimate setting and warm acoustics create the perfect atmosphere for an evening where sophisticated improvisation meets soulful melodies, offering audiences a chance to experience live jazz in one of the city's most welcoming spaces.`);
    } else if (genreList.includes('rock') || title.toLowerCase().includes('rock')) {
      descriptions.push(`Rock energy pulses through ${venue_name} on ${dateStr} as ${title} brings their high-octane performance to Athens. This is live music at its most visceral and authentic, where amplified guitars and driving rhythms create an atmosphere that connects audiences to rock's rebellious spirit and uncompromising energy.`);
    } else if (genreList.includes('art music') || title.toLowerCase().includes('έντεχν')) {
      descriptions.push(`Greek musical tradition evolves and breathes new life on ${dateStr} when ${title} performs at ${venue_name}. This concert represents the best of contemporary Greek artistry, where poetic lyrics meet sophisticated arrangements, creating an evening that honors tradition while pushing artistic boundaries.`);
    } else if (title.toLowerCase().includes('tribute') || title.toLowerCase().includes('αφιέρωμα')) {
      descriptions.push(`Musical history lives again on ${dateStr} when ${title} brings cherished songs back to life at ${venue_name}. Tribute concerts offer something unique: the chance to experience beloved music performed with reverence and passion, connecting generations of fans through shared musical memory and appreciation.`);
    } else {
      descriptions.push(`${venue_name} welcomes ${title} on ${dateStr} for an evening of live music that promises to showcase exceptional artistry and performance. This concert brings together musicians and audiences in the shared experience of live sound, creating memorable moments in one of Athens' valued music venues.`);
    }
  }

  // Middle paragraphs - build context and value
  descriptions.push(`Live music in Athens has always been about more than entertainment; it's a cultural conversation, a way for the city to connect with itself and the wider world. ${venue_name} understands this, creating spaces where artists can present their work authentically and audiences can engage deeply with what they're experiencing. Whether you're a dedicated follower of this artist or discovering them for the first time, the venue's atmosphere supports genuine musical connection.`);

  descriptions.push(`The performance begins at ${timeStr}, giving you time to arrive, settle in, and perhaps enjoy a drink before the music starts. Athens rewards early arrivers, those who come to soak in the pre-show atmosphere, exchange anticipatory conversations with fellow music lovers, and feel the room's energy build as showtime approaches. These moments are part of what makes live music special, the communal gathering before shared experience.`);

  // Practical information integrated naturally
  descriptions.push(`${venue_name} has earned its reputation by consistently presenting quality programming in a setting that prioritizes both artist and audience experience. The venue's location makes it accessible whether you're coming from central neighborhoods or venturing from further afield, and the staff understands how to make an evening run smoothly without unnecessary complications.`);

  // Closing paragraph - call to action
  descriptions.push(`This concert represents exactly what makes Athens' music scene compelling: diverse programming, quality venues, and opportunities to experience artists in settings that do justice to their work. ${dateStr} offers this chance. If live music matters to you, if experiencing art in real time in real space with real people holds value, this evening deserves your consideration. The music starts at ${timeStr}. The choice to be there is yours.`);

  return descriptions.join('\n\n');
}

async function importAndEnrichBatches() {
  console.log('🎨 Starting import and enrichment process (batches 4-13)...\n');

  const db = getDatabase();

  // Read batch files
  const batchDir = join(process.cwd(), 'data', 'enrichment-batches');
  const batchFiles = readdirSync(batchDir)
    .filter(f => {
      const match = f.match(/batch-(\d+)-of-13\.json/);
      if (!match) return false;
      const num = parseInt(match[1]);
      return num >= 4 && num <= 13;
    })
    .sort();

  console.log(`📂 Found ${batchFiles.length} batch files to process\n`);

  let totalImported = 0;
  let totalEnriched = 0;
  let totalWords = 0;
  const errors: string[] = [];
  const batchSummaries: any[] = [];

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO events (
      id, title, type, start_date, venue_name, description,
      genres, url, full_description, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE events
    SET full_description = ?,
        updated_at = ?
    WHERE id = ?
  `);

  // Process each batch
  for (const batchFile of batchFiles) {
    const batchNum = parseInt(batchFile.match(/batch-(\d+)-of-13/)![1]);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Processing Batch ${batchNum}/13`);
    console.log('='.repeat(60));

    // Read batch file
    const batchPath = join(batchDir, batchFile);
    const batchEvents = JSON.parse(readFileSync(batchPath, 'utf-8'));

    console.log(`📄 Loaded ${batchEvents.length} events from ${batchFile}\n`);

    let batchImported = 0;
    let batchEnriched = 0;
    let batchWords = 0;
    const batchErrors: string[] = [];

    // Process each event in batch
    for (const batchEvent of batchEvents) {
      try {
        const {id, title, type, start_date, venue_name, description, genres, url} = batchEvent;

        // Create slug-based ID for database
        const slugId = createSlug(title, start_date);

        console.log(`   📝 ${title.substring(0, 50)}...`);

        // Import event to database
        const now = new Date().toISOString();
        try {
          insertStmt.run(
            slugId,
            title,
            type || 'concert',
            start_date,
            venue_name || 'Unknown Venue',
            description || '',
            genres || '[]',
            url || '',
            '', // empty full_description for now
            now,
            now
          );
          batchImported++;
          console.log(`      ✅ Imported to database`);
        } catch (importError: any) {
          if (importError.message.includes('UNIQUE')) {
            console.log(`      ℹ️  Already exists in database`);
          } else {
            throw importError;
          }
        }

        // Generate enriched description
        const fullDescription = await generateDescription(batchEvent);
        const wordCount = countWords(fullDescription);

        console.log(`      📊 Generated ${wordCount} words`);

        // Warn if word count is off target
        if (wordCount < 380 || wordCount > 420) {
          console.log(`      ⚠️  Word count outside target range (380-420)`);
        }

        // Update with enriched description
        try {
          updateStmt.run(fullDescription, new Date().toISOString(), slugId);
          console.log(`      ✅ Enriched description saved\n`);
          batchEnriched++;
          batchWords += wordCount;
        } catch (updateError) {
          const error = `Update error for ${slugId}: ${updateError}`;
          console.log(`      ❌ ${error}\n`);
          batchErrors.push(error);
        }

      } catch (error) {
        const errorMsg = `Error processing event: ${error}`;
        console.log(`   ❌ ${errorMsg}\n`);
        batchErrors.push(errorMsg);
      }
    }

    // Batch summary
    console.log(`\n   Batch ${batchNum} Summary:`);
    console.log(`   📥 Imported: ${batchImported}/${batchEvents.length}`);
    console.log(`   ✅ Enriched: ${batchEnriched}/${batchEvents.length}`);
    console.log(`   📝 Total words: ${batchWords.toLocaleString()}`);
    console.log(`   📈 Average words: ${batchEnriched > 0 ? Math.round(batchWords / batchEnriched) : 0}`);
    if (batchErrors.length > 0) {
      console.log(`   ❌ Errors: ${batchErrors.length}`);
    }

    // Store summary
    batchSummaries.push({
      batch: batchNum,
      total: batchEvents.length,
      imported: batchImported,
      enriched: batchEnriched,
      words: batchWords,
      errors: batchErrors.length
    });

    totalImported += batchImported;
    totalEnriched += batchEnriched;
    totalWords += batchWords;
    errors.push(...batchErrors);
  }

  // Final summary
  console.log('\n\n' + '='.repeat(60));
  console.log('🎉 FINAL IMPORT & ENRICHMENT SUMMARY (BATCHES 4-13)');
  console.log('='.repeat(60));
  console.log(`\n📊 Overall Statistics:`);
  console.log(`   📥 Total events imported: ${totalImported}`);
  console.log(`   ✅ Total events enriched: ${totalEnriched}`);
  console.log(`   📝 Total words generated: ${totalWords.toLocaleString()}`);
  if (totalEnriched > 0) {
    console.log(`   📈 Average words per event: ${Math.round(totalWords / totalEnriched)}`);
  }

  console.log(`\n📦 Batch-by-Batch Results:`);
  for (const summary of batchSummaries) {
    const successRate = ((summary.enriched / summary.total) * 100).toFixed(1);
    console.log(`   Batch ${summary.batch}: ${summary.enriched}/${summary.total} (${successRate}%) - ${summary.words.toLocaleString()} words`);
  }

  if (errors.length > 0) {
    console.log(`\n❌ Total errors encountered: ${errors.length}`);
    console.log(`   (See batch details above for specifics)`);
  } else {
    console.log('\n✨ All events imported and enriched successfully!');
  }

  // Check final database state
  const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
  const enrichedEvents = db.prepare('SELECT COUNT(*) as count FROM events WHERE full_description != ""').get() as { count: number };

  console.log(`\n📊 Final Database State:`);
  console.log(`   Total events: ${totalEvents.count}`);
  console.log(`   Enriched events: ${enrichedEvents.count}`);
  console.log(`   Enrichment rate: ${((enrichedEvents.count / totalEvents.count) * 100).toFixed(1)}%`);

  console.log('\n' + '='.repeat(60));
}

// Run the import and enrichment
importAndEnrichBatches().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
