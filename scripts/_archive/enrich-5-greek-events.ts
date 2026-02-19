#!/usr/bin/env bun
/**
 * Enrich 5 specific events with Greek descriptions using tool_agent
 * Target: 400-600 words per description
 */

import Database from 'bun:sqlite';
import { DateTime } from 'luxon';

const db = new Database('data/events.db');

// Event IDs to enrich
const EVENT_IDS = [
  '-2025-11-15',
  'blend-x-seds-w-dj-gigola-2025-11-15',
  'gemma-gr-live-in-athens-2025-11-15',
  '2b2f8d2059a300be',
  '4bf6d0315091ec8e'
];

interface Event {
  id: string;
  title: string;
  description: string;
  start_date: string;
  type: string;
  genres: string;
  venue_name: string;
  venue_address: string;
  price_type: string;
  price_range: string | null;
  url: string;
}

/**
 * Call tool_agent for AI enrichment (FREE)
 */
async function callToolAgent(prompt: string): Promise<string> {
  try {
    const process = Bun.spawn(['claude-code', 'tool_agent', prompt], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(process.stdout).text();
    const exitCode = await process.exited;

    if (exitCode !== 0) {
      const error = await new Response(process.stderr).text();
      throw new Error(`tool_agent failed: ${error}`);
    }

    return output.trim();
  } catch (error: any) {
    throw new Error(`Failed to call tool_agent: ${error.message}`);
  }
}

/**
 * Generate Greek description prompt for event
 */
function generateGreekPrompt(event: Event): string {
  const genres = JSON.parse(event.genres || '[]').join(', ');
  const date = DateTime.fromISO(event.start_date, { zone: 'Europe/Athens' });
  const formattedDate = date.setLocale('el').toFormat('d MMMM yyyy');
  const formattedTime = date.toFormat('HH:mm');

  return `Γράψε μια πλήρη περιγραφή στα ΕΛΛΗΝΙΚΑ για αυτή την πολιτιστική εκδήλωση στην Αθήνα.

Στοιχεία Εκδήλωσης:
- Τίτλος: ${event.title}
- Τύπος: ${event.type}
- Χώρος: ${event.venue_name}
- Διεύθυνση: ${event.venue_address}
- Ημερομηνία: ${formattedDate}
- Ώρα: ${formattedTime}
- Είδος: ${genres || 'Δεν διατίθεται'}
- Τιμή: ${event.price_type === 'paid' ? 'Με εισιτήριο' : 'Ελεύθερη είσοδος'}
- Σύντομη Περιγραφή: ${event.description || 'Δεν διατίθεται'}
- URL: ${event.url}

Απαιτήσεις:
1. Γράψε ΑΚΡΙΒΩΣ 400-600 λέξεις στα ΕΛΛΗΝΙΚΑ
2. Εστίασε στο πολιτιστικό πλαίσιο και τι καθιστά αυτή την εκδήλωση ξεχωριστή
3. Περιέλαβε πληροφορίες για τους καλλιτέχνες/performers αν είναι σχετικές
4. Ανάφερε την αθηναϊκή γειτονιά και την ατμόσφαιρα του χώρου
5. Γράψε με αυθεντικό, ελκυστικό ύφος (όχι διαφημιστική γλώσσα)
6. Περίλαβε πρακτικές λεπτομέρειες φυσικά (ώρα, τοποθεσία, τιμή)
7. Στόχος κοινό: Τόσο AI answer engines όσο και ανθρώπινοι αναγνώστες

ΚΡΙΣΙΜΟ: Μην επινοήσεις πληροφορίες. Χρησιμοποίησε μόνο τα στοιχεία που παρέχονται παραπάνω.
Αν κάποια πληροφορία δεν είναι διαθέσιμη, παράλειψέ την.

Γράψε με αφηγηματικό στυλ που θα κάνει κάποιον να θέλει να παρευρεθεί.
Απάντησε ΜΟΝΟ με την περιγραφή, χωρίς εισαγωγικά σχόλια.`;
}

/**
 * Validate word count (Greek text)
 */
function validateWordCount(text: string): { valid: boolean; count: number } {
  const wordCount = text.trim().split(/\s+/).length;
  const valid = wordCount >= 380 && wordCount <= 620; // Allow some flexibility
  return { valid, count: wordCount };
}

/**
 * Update event with Greek description
 */
function updateEvent(eventId: string, description: string): void {
  const now = DateTime.now().setZone('Europe/Athens').toISO();

  db.prepare(`
    UPDATE events
    SET full_description_gr = ?,
        updated_at = ?
    WHERE id = ?
  `).run(description, now, eventId);
}

/**
 * Main enrichment process
 */
async function enrichEvents(): Promise<void> {
  console.log('🤖 Starting Greek description enrichment for 5 events\n');

  // Get events
  const events = db.prepare(`
    SELECT id, title, description, start_date, type, genres,
           venue_name, venue_address, price_type, price_range, url
    FROM events
    WHERE id IN (${EVENT_IDS.map(() => '?').join(',')})
  `).all(...EVENT_IDS) as Event[];

  if (events.length === 0) {
    console.log('❌ No events found with specified IDs');
    return;
  }

  console.log(`📊 Found ${events.length} events to enrich\n`);

  let successCount = 0;
  let failureCount = 0;

  for (const event of events) {
    try {
      console.log(`🔄 Processing: ${event.title}`);
      console.log(`   ID: ${event.id}`);
      console.log(`   Type: ${event.type}`);
      console.log(`   Venue: ${event.venue_name}`);

      // Generate prompt
      const prompt = generateGreekPrompt(event);

      // Call tool_agent (FREE)
      console.log('   🤖 Calling tool_agent...');
      const description = await callToolAgent(prompt);

      // Validate word count
      const { valid, count } = validateWordCount(description);
      if (!valid) {
        console.log(`   ⚠️  Word count: ${count} (target: 400-600)`);
      } else {
        console.log(`   ✅ Word count: ${count}`);
      }

      // Update database
      updateEvent(event.id, description);
      console.log('   ✅ Updated database\n');

      successCount++;

      // Rate limiting: 2 seconds between calls
      if (events.indexOf(event) < events.length - 1) {
        console.log('   ⏳ Waiting 2 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}\n`);
      failureCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failureCount}`);
  console.log(`   📝 Total processed: ${successCount + failureCount}`);
}

// Run the script
enrichEvents()
  .then(() => {
    console.log('\n✅ Enrichment complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
