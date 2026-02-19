import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

console.log('💾 Saving Events 36-40 to database\n');

const events = [
  { id: '-2025-11-05', prefix: '36', title: 'Αφιέρωμα στον Νίκο Καββαδία' },
  { id: 'dimos-dimitriadis-songs-in-revolution-2025-11-05', prefix: '37', title: 'Dimos Dimitriadis: Songs in Revolution' },
  { id: '8ba859d61dac8ddf', prefix: '38', title: 'Δήμος Δημητριάδης: Songs in Revolution' },
  { id: 'comedy-2025-11-05', prefix: '39', title: 'ΡΟΥΛΗ ΜΠΟΥΡΑΝΤΑ-ΠΥΡ ΓΥΝΗ & COMEDY' },
  { id: '2-2025-11-05', prefix: '40', title: 'ΤΟ ΕΡΓΟ ΤΩΝ ΔΥΟ ΧΑΡΑΚΤΗΡΩΝ 2ος χρόνος' },
];

let saved = 0;
let errors = 0;

for (const event of events) {
  try {
    const enPath = `data/batch-2-results/${event.prefix}-${event.id}-en-result.txt`;
    const enDescription = await Bun.file(enPath).text();

    const grPath = `data/batch-2-results/${event.prefix}-${event.id}-gr-result.txt`;
    const grDescription = await Bun.file(grPath).text();

    // Update all three columns (full_description for site, _en and _gr for bilingual)
    db.prepare(`
      UPDATE events
      SET full_description = ?,
          full_description_en = ?,
          full_description_gr = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(enDescription, enDescription, grDescription, event.id);

    const row = db.prepare('SELECT title, full_description IS NOT NULL as has_desc FROM events WHERE id = ?').get(event.id) as any;

    if (row && row.has_desc) {
      console.log(`✅ ${event.prefix}. ${event.title}`);
      saved++;
    } else {
      console.log(`⚠️  ${event.prefix}. Event not found in database: ${event.id}`);
    }
  } catch (error) {
    console.error(`❌ ${event.prefix}. ${event.title}: ${error.message}`);
    errors++;
  }
}

console.log(`\n📊 Save Complete:`);
console.log(`   Saved: ${saved}/5`);
console.log(`   Errors: ${errors}`);

if (saved === 5) {
  console.log('\n✅ All Events 36-40 enriched and ready!');
  console.log('📈 Progress: 20/20 events complete (100% of Batch 2)');
  console.log('\n🎉 BATCH 2 COMPLETE! All 20 events enriched with bilingual descriptions.');
} else {
  console.log('\n⚠️  Some events failed to save. Review errors above.');
}

db.close();
