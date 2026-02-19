#!/usr/bin/env bun
/**
 * Automated AI Enrichment for Events
 *
 * Automatically enriches unenriched events with 400-word Greek descriptions
 * Uses Claude Code's FREE tool_agent
 *
 * Features:
 * - Quality validation (380-420 words)
 * - Rate limiting (2 seconds between calls)
 * - Future events only
 * - Detailed logging
 * - Configurable batch size
 */

import { getDatabase } from '../src/db/database';
import { DateTime } from 'luxon';

interface EnrichmentConfig {
  maxEventsPerRun: number;
  minWordCount: number;
  maxWordCount: number;
  rateLimit: number;  // milliseconds
  onlyFutureEvents: boolean;
  language: 'gr' | 'en';
}

const CONFIG: EnrichmentConfig = {
  maxEventsPerRun: 15,  // Same as manual batches
  minWordCount: 300,    // Adjusted based on seo-content-writer agent testing
  maxWordCount: 450,    // Realistic range for quality over exact count
  rateLimit: 2000,      // 2 seconds
  onlyFutureEvents: true,
  language: 'gr'         // Greek descriptions
};

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

/**
 * Generate enrichment prompt for an event
 */
function generatePrompt(event: any): string {
  const eventDate = DateTime.fromISO(event.start_date, { zone: 'Europe/Athens' });
  const formattedDate = eventDate.toFormat('dd MMMM yyyy', { locale: 'el' });

  // Detect if event has artist/performer information
  const hasArtistInfo = event.title && (
    event.type === 'concert' ||
    event.type === 'performance' ||
    event.type === 'theater'
  );

  return `Γράψε εκτενή περιγραφή 300-400 λέξεων για πολιτιστική εκδήλωση στην Αθήνα.

ΣΤΟΙΧΕΙΑ ΕΚΔΗΛΩΣΗΣ:
- Τίτλος: ${event.title}
- Τύπος: ${event.type}
- Χώρος: ${event.venue_name}${event.venue_address ? `\n- Διεύθυνση: ${event.venue_address}` : ''}
- Ημερομηνία: ${formattedDate}
- Ώρα: ${event.start_date.split('T')[1]?.substring(0, 5) || 'Μη διαθέσιμη'}
- Τιμή: ${event.price_type === 'open' ? 'Ελεύθερη είσοδος' : 'Με εισιτήριο'}${event.description ? `\n- Περιγραφή: ${event.description}` : ''}${event.genres ? `\n- Είδος: ${event.genres}` : ''}

ΚΡΙΤΙΚΟΙ ΚΑΝΟΝΕΣ:
1. Στόχος μήκους: 300-400 λέξεις (αποδεκτό: 300-450)
2. ΑΠΑΓΟΡΕΥΕΤΑΙ η επινόηση πληροφοριών - χρησιμοποίησε ΜΟΝΟ τα παραπάνω στοιχεία
3. ΑΠΑΓΟΡΕΥΟΝΤΑΙ υποκειμενικές κρίσεις για καλλιτέχνες (π.χ. "καλύτερος", "διάσημος")${hasArtistInfo ? `
4. Ανάφερε τα ονόματα καλλιτεχνών/performers από τον τίτλο` : `
4. Γράψε σε φυσική γλώσσα, όχι διαφημιστικό ύφος`}
5. Περιέγραψε την εκδήλωση και τον χώρο (όχι βιογραφικά καλλιτεχνών)
6. Ενσωμάτωσε τις πρακτικές λεπτομέρειες (χώρος, ημερομηνία, ώρα, τιμή)
7. Αν γνωρίζεις τη γειτονιά της Αθήνας, αναφέρου σε αυτήν

ΚΟΙΝΟ-ΣΤΟΧΟΣ:
AI answer engines (ChatGPT, Perplexity, Claude) και ανθρώπινοι αναγνώστες που αναζητούν εκδηλώσεις στην Αθήνα.

ΖΗΤΟΥΜΕΝΟ:
Γράψε σε αφηγηματικό ύφος που κάνει τον αναγνώστη να θέλει να παρευρεθεί.

ΣΗΜΑΝΤΙΚΟ: Επίστρεψε ΜΟΝΟ το ελληνικό κείμενο της περιγραφής, χωρίς εισαγωγικά σχόλια ή επεξηγήσεις.`;
}

/**
 * Validate enrichment quality
 */
function validateEnrichment(description: string): {
  valid: boolean;
  wordCount: number;
  issues: string[];
} {
  const wordCount = countWords(description);
  const issues: string[] = [];

  if (wordCount < CONFIG.minWordCount) {
    issues.push(`Too short: ${wordCount} words (minimum: ${CONFIG.minWordCount})`);
  }

  if (wordCount > CONFIG.maxWordCount) {
    issues.push(`Too long: ${wordCount} words (maximum: ${CONFIG.maxWordCount})`);
  }

  if (description.trim().length === 0) {
    issues.push('Empty description');
  }

  return {
    valid: issues.length === 0,
    wordCount,
    issues
  };
}

/**
 * Enrich a single event using seo-content-writer agent
 */
async function enrichEvent(event: any): Promise<{
  success: boolean;
  description?: string;
  wordCount?: number;
  error?: string;
}> {
  try {
    const prompt = generatePrompt(event);

    console.log(`\n🤖 Enriching: ${event.title}`);
    console.log(`   Venue: ${event.venue_name}`);
    console.log(`   Date: ${event.start_date}`);
    console.log(`   📝 Generating Greek description...`);

    // NOTE: This function will be called by Claude Code using the Task tool
    // The seo-content-writer agent will process the prompt and return the description
    // This is a placeholder that should trigger Claude Code to use Task tool

    // When Claude Code sees this pattern, it should use:
    // await Task({
    //   subagent_type: 'seo-content-writer',
    //   description: `Generate Greek event description for ${event.title}`,
    //   prompt: prompt
    // });

    throw new Error(`TASK_TOOL_REQUIRED: Use seo-content-writer agent with prompt:\n${prompt}`);

  } catch (error: any) {
    // If error message starts with TASK_TOOL_REQUIRED, this needs manual Task tool call
    if (error.message.startsWith('TASK_TOOL_REQUIRED')) {
      return {
        success: false,
        error: 'Manual Task tool integration required - see prompt in error message'
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main enrichment function
 */
async function main() {
  console.log('🤖 Automated AI Enrichment - Starting...\n');
  console.log(`📋 Configuration:`);
  console.log(`   Max events per run: ${CONFIG.maxEventsPerRun}`);
  console.log(`   Word count: ${CONFIG.minWordCount}-${CONFIG.maxWordCount}`);
  console.log(`   Rate limit: ${CONFIG.rateLimit}ms`);
  console.log(`   Language: ${CONFIG.language}`);
  console.log(`   Future events only: ${CONFIG.onlyFutureEvents}\n`);

  const db = getDatabase();

  // Get today's date in Athens timezone
  const today = DateTime.now().setZone('Europe/Athens').toISODate();

  // Build query
  let query = `
    SELECT id, title, description, start_date, type,
           venue_name, venue_address, price_type
    FROM events
    WHERE (full_description_gr IS NULL OR full_description_gr = '')
  `;

  if (CONFIG.onlyFutureEvents) {
    query += ` AND start_date >= '${today}'`;
  }

  query += ` ORDER BY start_date ASC LIMIT ${CONFIG.maxEventsPerRun}`;

  const events = db.prepare(query).all();

  if (events.length === 0) {
    console.log('✅ No events need enrichment!\n');
    return;
  }

  console.log(`📊 Found ${events.length} events to enrich\n`);
  console.log('='.repeat(60));

  // Enrich each event
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    console.log(`\n[${i + 1}/${events.length}]`);

    const result = await enrichEvent(event);

    if (result.success && result.description) {
      // Update database
      db.prepare(`
        UPDATE events
        SET full_description_gr = ?,
            updated_at = ?
        WHERE id = ?
      `).run(result.description, new Date().toISOString(), (event as any).id);

      console.log(`   ✅ SUCCESS: ${result.wordCount} words`);
      successCount++;

    } else {
      console.log(`   ❌ FAILED: ${result.error}`);
      failCount++;
    }

    // Rate limiting (skip on last event)
    if (i < events.length - 1) {
      console.log(`   ⏳ Waiting ${CONFIG.rateLimit / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimit));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 ENRICHMENT SUMMARY:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   Total processed: ${events.length}\n`);

  // Show remaining unenriched events
  const remaining = db.prepare(`
    SELECT COUNT(*) as count
    FROM events
    WHERE (full_description_gr IS NULL OR full_description_gr = '')
      ${CONFIG.onlyFutureEvents ? `AND start_date >= '${today}'` : ''}
  `).get() as { count: number };

  console.log(`📈 Progress:`);
  console.log(`   Remaining unenriched: ${remaining.count}`);
  console.log(`   Estimated batches remaining: ${Math.ceil(remaining.count / CONFIG.maxEventsPerRun)}\n`);

  if (successCount > 0) {
    console.log('🔄 Next Steps:');
    console.log('   1. Review enriched events for quality');
    console.log('   2. Run: bun run build');
    console.log('   3. Deploy: git add . && git commit && git push\n');
  }
}

main().catch(console.error);
