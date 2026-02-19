#!/usr/bin/env bun
/**
 * Enrich November 2025 events with Greek descriptions ONLY
 * Uses Claude Code tool_agent for free enrichment
 * Processes events in chronological order
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
  type: string;
  genres: string | null;
  price_type: string;
  price_amount: number | null;
  source_full_description: string | null;
}

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
      genreText = genresArray.join(', ');
    } catch {
      genreText = event.genres;
    }
  }

  const priceText = event.price_type === 'free' || event.price_type === 'open'
    ? 'Δωρεάν είσοδος'
    : event.price_amount
    ? `€${event.price_amount}`
    : 'Επί πληρωμή';

  let prompt = `Γράψε μια περιγραφή 400 λέξεων στα ΕΛΛΗΝΙΚΑ για αυτή την πολιτιστική εκδήλωση στην Αθήνα.

Στοιχεία Εκδήλωσης:
- Τίτλος: ${event.title}
- Τύπος: ${event.type}
- Χώρος: ${event.venue_name}`;

  if (event.venue_neighborhood) {
    prompt += `\n- Γειτονιά: ${event.venue_neighborhood}`;
  }

  prompt += `
- Ημερομηνία: ${date}
- Ώρα: ${time}
- Είδος: ${genreText}
- Τιμή: ${priceText}`;

  if (event.source_full_description && event.source_full_description.length > 100) {
    prompt += `\n\nΠΛΗΡΗΣ ΠΕΡΙΓΡΑΦΗ ΑΠΟ ΠΗΓΗ (${event.source_full_description.length} χαρακτήρες):
${event.source_full_description}`;
  }

  prompt += `\n\nΑπαιτήσεις:
1. Γράψε ΑΚΡΙΒΩΣ 400 λέξεις (±20 λέξεις αποδεκτές)
2. **ΚΡΙΤΙΚΟ**: Αν υπάρχουν ονόματα καλλιτεχνών στην πηγή, πρέπει να τα αναφέρεις
3. Εστίασε στο πολιτιστικό πλαίσιο και τι κάνει αυτή την εκδήλωση ξεχωριστή
4. Συμπεριέλαβε background καλλιτέχνη/ομάδας αν υπάρχει στην πηγή
5. Ανέφερε τη γειτονιά της Αθήνας και την ατμόσφαιρα του χώρου
6. Γράψε με αυθεντικό, ελκυστικό ύφος (όχι διαφημιστικά κλισέ)
7. Συμπεριέλαβε πρακτικές λεπτομέρειες φυσικά (ώρα, τοποθεσία, τιμή)
8. Στόχος: Τόσο για AI answer engines όσο και για ανθρώπινους αναγνώστες

ΚΡΙΤΙΚΟ: Μην επινοείς πληροφορίες. Χρησιμοποίησε μόνο τα στοιχεία που παρέχονται παραπάνω.
Αν δεν υπάρχουν πληροφορίες, παράλειψε αυτή τη λεπτομέρεια.

Γράψε με αφηγηματικό στυλ που θα έκανε κάποιον να θέλει να παραστεί.
Γράψε ΜΟΝΟ την περιγραφή, χωρίς τίτλους ή επιπλέον κείμενο.`;

  try {
    const description = await callToolAgent(prompt);

    // Validate word count
    const wordCount = description.split(/\s+/).length;
    console.log(`   Word count: ${wordCount} words`);

    if (wordCount < 300) {
      console.warn(`   ⚠️  WARNING: Description too short (${wordCount} words < 300)`);
    } else if (wordCount > 500) {
      console.warn(`   ⚠️  WARNING: Description too long (${wordCount} words > 500)`);
    }

    return description;
  } catch (error) {
    console.error(`   ❌ Error enriching event: ${error}`);
    return null;
  }
}

async function main() {
  console.log('🇬🇷 Starting Greek enrichment for November 2025 events...\n');

  // Query events needing Greek enrichment, in chronological order
  const events = db.prepare(`
    SELECT id, title, start_date, venue_name, venue_neighborhood, type, genres,
           price_type, price_amount, source_full_description
    FROM events
    WHERE start_date >= '2025-11-01'
      AND start_date < '2025-12-01'
      AND (full_description_gr IS NULL OR full_description_gr = '')
    ORDER BY start_date ASC
  `).all() as Event[];

  console.log(`📊 Found ${events.length} events to enrich\n`);

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const progress = `[${i + 1}/${events.length}]`;

    console.log(`${progress} ${event.title}`);
    console.log(`   Date: ${event.start_date.split('T')[0]}`);
    console.log(`   Venue: ${event.venue_name}`);
    console.log(`   🤖 Generating Greek description...`);

    const description = await enrichEvent(event);

    if (description) {
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
    } else {
      console.log(`   ❌ Failed to generate description\n`);
      failed++;
    }

    // Rate limit: 2 seconds between API calls
    if (i < events.length - 1) {
      console.log(`   ⏳ Waiting 2 seconds (rate limit)...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n✅ Enrichment complete!`);
  console.log(`📊 Successfully enriched: ${enriched} events`);
  console.log(`❌ Failed: ${failed} events`);
  console.log(`📁 Enriched descriptions saved to: data/enriched/`);

  db.close();
}

main().catch(console.error);
