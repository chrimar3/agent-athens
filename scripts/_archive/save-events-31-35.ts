import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

console.log('💾 Saving Events 31-35 to database\n');

const events = [
  { id: '852c2d5d67b8656b', prefix: '31', title: 'Catastrophe' },
  { id: 'e289234b9858a350', prefix: '32', title: 'KAE Aris Betsson BKT Eurocup Tickets' },
  { id: '75c42b186691ca18', prefix: '33', title: 'WOLVES / This Child' },
  { id: '4c128491f13603b9', prefix: '34', title: 'CATS' },
  { id: 'william-shakespeare-2025-11-05', prefix: '35', title: 'William Shakespeare - ΤΙΤΟΣ' },
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
  console.log('\n✅ All Events 31-35 enriched and ready!');
  console.log('📈 Progress: 15/20 events complete (75% of Batch 2)');
} else {
  console.log('\n⚠️  Some events failed to save. Review errors above.');
}

db.close();
