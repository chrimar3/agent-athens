#!/usr/bin/env bun
// Test script - enrich just 1 event to validate integration

import { getDatabase } from '../src/db/database';
import { DateTime } from 'luxon';

const db = getDatabase();
const today = DateTime.now().setZone('Europe/Athens').toISODate();

// Get first unenriched event
const event = db.prepare(`
  SELECT id, title, description, start_date, type,
         venue_name, venue_address, price_type
  FROM events
  WHERE (full_description_gr IS NULL OR full_description_gr = '')
    AND start_date >= ?
  ORDER BY start_date ASC
  LIMIT 1
`).get(today);

if (!event) {
  console.log('No unenriched events found!');
  process.exit(0);
}

console.log('🧪 TEST: Auto-enrichment on 1 event\n');
console.log('Event Details:');
console.log(`  ID: ${(event as any).id}`);
console.log(`  Title: ${(event as any).title}`);
console.log(`  Venue: ${(event as any).venue_name}`);
console.log(`  Date: ${(event as any).start_date}`);
console.log(`  Type: ${(event as any).type}\n`);

// Generate the prompt
const eventDate = DateTime.fromISO((event as any).start_date, { zone: 'Europe/Athens' });
const formattedDate = eventDate.toFormat('dd MMMM yyyy', { locale: 'el' });

const prompt = `Γράψε μια εκτενή περιγραφή 400 λέξεων για αυτή την πολιτιστική εκδήλωση στην Αθήνα.

ΣΤΟΙΧΕΙΑ ΕΚΔΗΛΩΣΗΣ:
- Τίτλος: ${(event as any).title}
- Τύπος: ${(event as any).type}
- Χώρος: ${(event as any).venue_name}
- Διεύθυνση: ${(event as any).venue_address || 'Μη διαθέσιμη'}
- Ημερομηνία: ${formattedDate}
- Ώρα: ${(event as any).start_date.split('T')[1]?.substring(0, 5) || 'Μη διαθέσιμη'}
- Τιμή: ${(event as any).price_type === 'open' ? 'Ελεύθερη είσοδος' : 'Με εισιτήριο'}
${(event as any).description ? `- Σύντομη περιγραφή: ${(event as any).description}` : ''}

ΑΠΑΙΤΗΣΕΙΣ:
1. Γράψε ΑΚΡΙΒΩΣ 400 λέξεις (αποδεκτό: 380-420 λέξεις)
2. Χρησιμοποίησε ΜΟΝΟ τα στοιχεία που παρέχονται παραπάνω
3. ΜΗΝ επινοήσεις πληροφορίες που δεν υπάρχουν
4. Γράψε σε φυσική, ελκυστική γλώσσα (όχι διαφημιστικό ύφος)
5. Περιέγραψε τι καθιστά αυτή την εκδήλωση ξεχωριστή
6. Αναφέρου στο πολιτιστικό πλαίσιο της Αθήνας και της περιοχής
7. Συμπεριέλαβε φυσικά τις πρακτικές λεπτομέρειες (τοποθεσία, ώρα, τιμή)

Το κοινό-στόχος είναι τόσο AI answer engines όσο και ανθρώπινοι αναγνώστες.

Γράψε σε αφηγηματικό ύφος που θα έκανε κάποιον να θέλει να παρευρεθεί.`;

console.log('=' .repeat(70));
console.log('📝 PROMPT FOR seo_content_writer AGENT:');
console.log('='.repeat(70));
console.log(prompt);
console.log('='.repeat(70));
console.log('\n✋ NEXT STEP: I will call the seo_content_writer agent with this prompt\n');
