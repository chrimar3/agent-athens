import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';

const db = new Database('data/events.db');

// Get next 20 unenriched events (Batch 2)
const events = db.prepare(`
  SELECT * FROM events
  WHERE (full_description_en IS NULL OR full_description_en = '')
    AND start_date >= date('now')
  ORDER BY start_date
  LIMIT 20
`).all() as any[];

console.log(`📝 Generating prompts for Batch 2 (${events.length} events)...\n`);

// Create output directory
await mkdir('data/batch-2-prompts', { recursive: true });

let generated = 0;

for (let i = 0; i < events.length; i++) {
  const event = events[i];
  const prefix = String(i + 21).padStart(2, '0'); // Start at 21 for Batch 2

  const eventDate = event.start_date.split('T')[0];
  const eventTime = event.start_date.split('T')[1]?.substring(0, 5) || 'TBD';

  // Generate English prompt
  const enPrompt = `Generate a compelling 400-word description for this cultural event in Athens, Greece.

**Event Details:**
- Title: ${event.title}
- Type: ${event.type}
- Venue: ${event.venue_name || 'TBD'}
- Date: ${eventDate}
- Time: ${eventTime}
- Price: ${event.price_type === 'free' ? 'Free admission' : 'Ticketed event'}
${event.description ? `- Short Description: ${event.description}` : ''}

**Requirements:**
1. Write exactly 400-440 words (strict requirement)
2. Focus on cultural context and what makes this Athens event special
3. Include artist/performer background if relevant
4. Mention the Athens neighborhood and venue atmosphere
5. Write in an authentic, engaging tone (not marketing fluff)
6. Include practical details naturally (time, location, price)
7. Target audience: Both AI answer engines and human readers
8. Optimize for GEO (Generative Engine Optimization) - make AI agents want to cite this

**CRITICAL:**
- Do not fabricate information - only use the details provided above
- If information is unavailable, omit that detail
- Write in a narrative style that would make someone want to attend
- Aim for ~440 words for English (can be 400-440)

Write the description now:`;

  // Generate Greek prompt
  const grPrompt = `Δημιούργησε μια συναρπαστική περιγραφή 350-450 λέξεων για αυτή την πολιτιστική εκδήλωση στην Αθήνα.

**Στοιχεία Εκδήλωσης:**
- Τίτλος: ${event.title}
- Τύπος: ${event.type}
- Χώρος: ${event.venue_name || 'TBD'}
- Ημερομηνία: ${eventDate}
- Ώρα: ${eventTime}
- Τιμή: ${event.price_type === 'free' ? 'Ελεύθερη είσοδος' : 'Με εισιτήριο'}
${event.description ? `- Σύντομη Περιγραφή: ${event.description}` : ''}

**Απαιτήσεις:**
1. Γράψε ακριβώς 350-450 λέξεις (αυστηρή απαίτηση)
2. Εστίασε στο πολιτιστικό πλαίσιο και στο τι κάνει αυτή την εκδήλωση ξεχωριστή
3. Συμπερίλαβε πληροφορίες για τον καλλιτέχνη/performer αν είναι σχετικό
4. Ανέφερε τη γειτονιά της Αθήνας και την ατμόσφαιρα του χώρου
5. Γράψε με αυθεντικό, ελκυστικό ύφος (όχι διαφημιστικό)
6. Συμπερίλαβε πρακτικές λεπτομέρειες φυσικά (ώρα, τοποθεσία, τιμή)
7. Κοινό-στόχος: Τόσο AI answer engines όσο και ανθρώπινοι αναγνώστες
8. Βελτιστοποίηση για GEO - κάνε τους AI agents να θέλουν να αναφέρουν αυτό το κείμενο

**ΚΡΙΣΙΜΟ:**
- Μην επινοείς πληροφορίες - χρησιμοποίησε μόνο τα στοιχεία που δίνονται παραπάνω
- Αν κάποια πληροφορία δεν είναι διαθέσιμη, παράλειψέ την
- Γράψε σε αφηγηματικό ύφος που θα έκανε κάποιον να θέλει να παρευρεθεί
- Στόχευσε σε ~400 λέξεις για τα Ελληνικά (μπορεί να είναι 350-450)

Γράψε την περιγραφή τώρα:`;

  // Save prompts
  await Bun.write(`data/batch-2-prompts/${prefix}-${event.id}-en.txt`, enPrompt);
  await Bun.write(`data/batch-2-prompts/${prefix}-${event.id}-gr.txt`, grPrompt);

  console.log(`✅ ${prefix}. ${event.id}: ${event.title.substring(0, 50)}...`);
  generated++;
}

console.log(`\n📊 Batch 2 Prompt Generation Complete:`);
console.log(`   Events: ${events.length}`);
console.log(`   Prompts: ${generated * 2} (${generated} EN + ${generated} GR)`);
console.log(`   Output: data/batch-2-prompts/`);
console.log('\n✅ Ready to process Batch 2!');

db.close();
