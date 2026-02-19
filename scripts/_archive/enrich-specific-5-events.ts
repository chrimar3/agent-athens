#!/usr/bin/env bun
/**
 * Enrich 5 specific events with Greek descriptions
 * Event IDs: 5c1674ccc557ed65, 207a660f51dd511e, 2026-2025-11-16, h-5-2025-11-16, 6620491a6735e0ce
 * Uses Claude Code tool_agent for free enrichment
 */

import Database from 'bun:sqlite';
import { writeFile } from 'fs/promises';

const db = new Database('data/events.db');

interface Event {
  id: string;
  title: string;
  start_date: string;
  venue_name: string;
  venue_neighborhood: string | null;
  venue_address: string | null;
  type: string;
  genres: string | null;
  price_type: string;
  price_amount: number | null;
  price_range: string | null;
  description: string | null;
  url: string | null;
}

const TARGET_EVENT_IDS = [
  '5c1674ccc557ed65',
  '207a660f51dd511e',
  '2026-2025-11-16',
  'h-5-2025-11-16',
  '6620491a6735e0ce'
];

async function callToolAgent(prompt: string): Promise<string> {
  // Use Bun's subprocess to call Claude Code's tool_agent
  const proc = Bun.spawn(['claude-code', 'tool_agent', prompt], {
    stdout: 'pipe',
  });

  const text = await new Response(proc.stdout).text();
  await proc.exited;

  return text.trim();
}

async function enrichEvent(event: Event): Promise<string | null> {
  const date = event.start_date.split('T')[0];
  const time = event.start_date.split('T')[1]?.substring(0, 5) || 'Δεν προσδιορίζεται';

  let genreText = 'Δεν προσδιορίζεται';
  if (event.genres) {
    try {
      const genresArray = JSON.parse(event.genres);
      genreText = genresArray.filter((g: string) => g.length > 0).join(', ');
    } catch {
      genreText = event.genres;
    }
  }

  const priceText = event.price_type === 'free' || event.price_type === 'open'
    ? 'Δωρεάν είσοδος'
    : event.price_range
    ? event.price_range
    : event.price_amount
    ? `€${event.price_amount}`
    : 'Επί πληρωμή';

  let prompt = `Γράψε μια περιγραφή 400-600 λέξεων στα ΕΛΛΗΝΙΚΑ για αυτή την πολιτιστική εκδήλωση στην Αθήνα.

Στοιχεία Εκδήλωσης:
- Τίτλος: ${event.title}
- Τύπος: ${event.type}
- Χώρος: ${event.venue_name}`;

  if (event.venue_address && event.venue_address !== event.venue_name) {
    prompt += `\n- Διεύθυνση: ${event.venue_address}`;
  }

  if (event.venue_neighborhood) {
    prompt += `\n- Γειτονιά: ${event.venue_neighborhood}`;
  }

  prompt += `
- Ημερομηνία: ${date}
- Ώρα: ${time}
- Είδος: ${genreText}
- Τιμή: ${priceText}`;

  if (event.description && event.description.length > 20) {
    prompt += `\n\nΠΕΡΙΓΡΑΦΗ ΑΠΟ ΠΗΓΗ:
${event.description}`;
  }

  if (event.url) {
    prompt += `\n\nURL: ${event.url}`;
  }

  prompt += `\n\nΑπαιτήσεις:
1. Γράψε 400-600 λέξεις (στόχος: 500 λέξεις)
2. **ΚΡΙΤΙΚΟ**: Αν υπάρχουν ονόματα καλλιτεχνών, πρέπει να τα αναφέρεις
3. Εστίασε στο πολιτιστικό πλαίσιο και τι κάνει αυτή την εκδήλωση ξεχωριστή
4. Συμπεριέλαβε background καλλιτέχνη/ομάδας αν είναι σχετικό
5. Ανέφερε τη γειτονιά της Αθήνας και την ατμόσφαιρα του χώρου
6. Γράψε με αυθεντικό, ελκυστικό ύφος (όχι διαφημιστικά κλισέ)
7. Συμπεριέλαβε πρακτικές λεπτομέρειες φυσικά (ώρα, τοποθεσία, τιμή)
8. Στόχος: Τόσο για AI answer engines όσο και για ανθρώπινους αναγνώστες
9. Γράψε με τρόπο που να φαίνεται φυσικός και όχι AI-generated

ΚΡΙΤΙΚΟ: Μην επινοείς πληροφορίες. Χρησιμοποίησε μόνο τα στοιχεία που παρέχονται παραπάνω.
Αν δεν υπάρχουν πληροφορίες, παράλειψε αυτή τη λεπτομέρεια.

Γράψε με αφηγηματικό στυλ που θα έκανε κάποιον να θέλει να παραστεί.
Γράψε ΜΟΝΟ την περιγραφή, χωρίς τίτλους ή επιπλέον κείμενο.`;

  try {
    const description = await callToolAgent(prompt);

    // Validate word count
    const wordCount = description.split(/\s+/).length;
    console.log(`   Word count: ${wordCount} words`);

    if (wordCount < 350) {
      console.warn(`   ⚠️  WARNING: Description too short (${wordCount} words < 350)`);
    } else if (wordCount > 650) {
      console.warn(`   ⚠️  WARNING: Description too long (${wordCount} words > 650)`);
    }

    return description;
  } catch (error) {
    console.error(`   ❌ Error enriching event: ${error}`);
    return null;
  }
}

async function main() {
  console.log('🇬🇷 Starting Greek enrichment for 5 specific events...\n');

  // Query the specific events
  const placeholders = TARGET_EVENT_IDS.map(() => '?').join(',');
  const events = db.prepare(`
    SELECT id, title, start_date, venue_name, venue_neighborhood, venue_address,
           type, genres, price_type, price_amount, price_range, description, url
    FROM events
    WHERE id IN (${placeholders})
    ORDER BY start_date ASC
  `).all(...TARGET_EVENT_IDS) as Event[];

  console.log(`📊 Found ${events.length} events to enrich\n`);

  if (events.length === 0) {
    console.log('❌ No events found with those IDs');
    db.close();
    return;
  }

  let enriched = 0;
  let failed = 0;
  const results: { [key: string]: { success: boolean; wordCount?: number; error?: string } } = {};

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const progress = `[${i + 1}/${events.length}]`;

    console.log(`${progress} ${event.title}`);
    console.log(`   ID: ${event.id}`);
    console.log(`   Date: ${event.start_date.split('T')[0]}`);
    console.log(`   Venue: ${event.venue_name}`);
    console.log(`   🤖 Generating Greek description...`);

    const description = await enrichEvent(event);

    if (description) {
      const wordCount = description.split(/\s+/).length;

      // Save to data/enriched/
      const filename = `data/enriched/${event.id}-gr.txt`;
      await writeFile(filename, description, 'utf-8');
      console.log(`   ✅ Saved to ${filename}`);

      // Update database
      db.prepare(`
        UPDATE events
        SET full_description_gr = ?,
            updated_at = ?
        WHERE id = ?
      `).run(description, new Date().toISOString(), event.id);

      console.log(`   ✅ Database updated\n`);
      enriched++;
      results[event.id] = { success: true, wordCount };
    } else {
      console.log(`   ❌ Failed to generate description\n`);
      failed++;
      results[event.id] = { success: false, error: 'Generation failed' };
    }

    // Rate limit: 2 seconds between API calls
    if (i < events.length - 1) {
      console.log(`   ⏳ Waiting 2 seconds (rate limit)...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n✅ Enrichment complete!`);
  console.log(`📊 Successfully enriched: ${enriched} events`);
  console.log(`❌ Failed: ${failed} events`);
  console.log(`📁 Enriched descriptions saved to: data/enriched/`);

  console.log(`\n📋 Summary by Event:`);
  for (const eventId of TARGET_EVENT_IDS) {
    const result = results[eventId];
    if (result) {
      if (result.success) {
        console.log(`   ✅ ${eventId}: ${result.wordCount} words`);
      } else {
        console.log(`   ❌ ${eventId}: ${result.error}`);
      }
    } else {
      console.log(`   ⚠️  ${eventId}: Not found in database`);
    }
  }

  db.close();
}

main().catch(console.error);
