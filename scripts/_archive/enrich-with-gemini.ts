#!/usr/bin/env bun
/**
 * Automated AI Enrichment using Google Gemini (FREE)
 *
 * Automatically enriches unenriched events with 400-word Greek descriptions
 * Uses Google's Gemini API (free tier: 15 RPM, 1M tokens/day)
 *
 * Features:
 * - Quality validation (300-450 words)
 * - Rate limiting (4 seconds between calls = 15/min)
 * - Future events only
 * - Detailed logging
 * - Configurable batch size
 * - 100% FREE (no API costs)
 *
 * Setup:
 * 1. Get free API key: https://makersuite.google.com/app/apikey
 * 2. Add to .env: GEMINI_API_KEY=your_key_here
 * 3. Run: bun run scripts/enrich-with-gemini.ts
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDatabase } from '../src/db/database';
import { DateTime } from 'luxon';

interface EnrichmentConfig {
  maxEventsPerRun: number;
  minWordCount: number;
  maxWordCount: number;
  rateLimit: number;  // milliseconds
  onlyFutureEvents: boolean;
  language: 'gr' | 'en';
  model: string;
}

const CONFIG: EnrichmentConfig = {
  maxEventsPerRun: 3,       // TEST MODE: Only 3 events to compare quality
  minWordCount: 300,        // Minimum acceptable words
  maxWordCount: 450,        // Maximum acceptable words
  rateLimit: 4000,          // 4 seconds (15 requests/min = Gemini free tier limit)
  onlyFutureEvents: true,
  language: 'gr',           // Greek descriptions
  model: 'gemini-2.5-flash' // Free model (Gemini 2.5 Flash - stable release)
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

  // Check for common fabrication indicators
  const fabricationIndicators = [
    'πιο διάσημος',
    'καλύτερος',
    'πιο ξεχωριστ',
    'μοναδικός',
    'αγαπημένος όλων'
  ];

  for (const indicator of fabricationIndicators) {
    if (description.toLowerCase().includes(indicator.toLowerCase())) {
      issues.push(`Possible fabrication: contains "${indicator}"`);
    }
  }

  return {
    valid: issues.length === 0,
    wordCount,
    issues
  };
}

/**
 * Call Google Gemini API to generate description (using REST API directly)
 */
async function callGeminiAPI(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found in environment variables');
  }

  // Use REST API directly for better compatibility
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response format from Gemini API');
    }

    const text = data.candidates[0].content.parts[0].text;
    return text.trim();

  } catch (error: any) {
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

/**
 * Enrich a single event using Gemini API
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
    console.log(`   📝 Calling Gemini API...`);

    // Call Gemini API
    const description = await callGeminiAPI(prompt);

    // Validate quality
    const validation = validateEnrichment(description);

    if (!validation.valid) {
      return {
        success: false,
        error: `Quality validation failed: ${validation.issues.join(', ')}`
      };
    }

    return {
      success: true,
      description,
      wordCount: validation.wordCount
    };

  } catch (error: any) {
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
  console.log('🤖 Automated AI Enrichment with Google Gemini\n');
  console.log(`📋 Configuration:`);
  console.log(`   Model: ${CONFIG.model}`);
  console.log(`   Max events per run: ${CONFIG.maxEventsPerRun}`);
  console.log(`   Word count: ${CONFIG.minWordCount}-${CONFIG.maxWordCount}`);
  console.log(`   Rate limit: ${CONFIG.rateLimit}ms (${60000 / CONFIG.rateLimit} requests/min)`);
  console.log(`   Language: ${CONFIG.language}`);
  console.log(`   Future events only: ${CONFIG.onlyFutureEvents}\n`);

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ ERROR: GEMINI_API_KEY not found in .env file');
    console.error('\n📝 Setup instructions:');
    console.error('   1. Get free API key: https://makersuite.google.com/app/apikey');
    console.error('   2. Add to .env: GEMINI_API_KEY=your_key_here');
    console.error('   3. Run again: bun run scripts/enrich-with-gemini.ts\n');
    process.exit(1);
  }

  const db = getDatabase();

  // Get today's date in Athens timezone
  const today = DateTime.now().setZone('Europe/Athens').toISODate();

  // Build query
  let query = `
    SELECT id, title, description, start_date, type,
           venue_name, venue_address, price_type, genres
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
  const failedEvents: string[] = [];

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
      failedEvents.push(`${(event as any).title} - ${result.error}`);
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

  if (failedEvents.length > 0) {
    console.log('❌ Failed events:');
    failedEvents.forEach(e => console.log(`   - ${e}`));
    console.log('');
  }

  // Show remaining unenriched events
  const remaining = db.prepare(`
    SELECT COUNT(*) as count
    FROM events
    WHERE (full_description_gr IS NULL OR full_description_gr = '')
      ${CONFIG.onlyFutureEvents ? `AND start_date >= '${today}'` : ''}
  `).get() as { count: number };

  console.log(`📈 Progress:`);
  console.log(`   Remaining unenriched: ${remaining.count}`);
  console.log(`   Estimated batches remaining: ${Math.ceil(remaining.count / CONFIG.maxEventsPerRun)}`);
  console.log(`   Days to completion (at 1 batch/day): ${Math.ceil(remaining.count / CONFIG.maxEventsPerRun)} days\n`);

  if (successCount > 0) {
    console.log('🔄 Next Steps:');
    console.log('   1. Review enriched events for quality');
    console.log('   2. Run: bun run build');
    console.log('   3. Deploy: git add . && git commit && git push\n');
  }
}

main().catch(console.error);
