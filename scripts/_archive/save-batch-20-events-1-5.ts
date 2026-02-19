import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

console.log('💾 Saving Batch-20 Events 1-5 to database\n');

const events = [
  { id: 'notis-2025-2025-10-30', prefix: '01', title: 'NOTIS Η ΕΠΙΣΤΡΟΦΗ - ΠΕΡΙΟΔΕΙΑ 2025' },
  { id: 'athens-spooks-lucifer-the-abbey-2025-10-30', prefix: '02', title: 'Athens Spooks! (Lucifer + The Abbey)' },
  { id: '2025-26-2025-10-30', prefix: '03', title: 'Ο Πατέρας Μου' },
  { id: '4d187e67dfc2c222', prefix: '04', title: 'Μεγάλες Κυρίες τραγουδούν τις Μεγάλες Κυρίες!' },
  { id: 'b5ffe4a211668948', prefix: '05', title: 'Athens Spooks!' },
];

let saved = 0;
let errors = 0;
let skipped = 0;

for (const event of events) {
  try {
    const enPath = `data/batch-20-results/${event.prefix}-${event.id}-en-result.txt`;
    const enDescription = await Bun.file(enPath).text();

    const grPath = `data/batch-20-results/${event.prefix}-${event.id}-gr-result.txt`;
    const grDescription = await Bun.file(grPath).text();

    // Check if this is Event 3 (incomplete enrichment)
    if (enDescription.includes('NOTE: Event 3 enrichment incomplete')) {
      console.log(`⚠️  ${event.prefix}. ${event.title}: Skipped (insufficient source data)`);
      skipped++;
      continue;
    }

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
console.log(`   Skipped: ${skipped} (incomplete enrichment)`);
console.log(`   Errors: ${errors}`);

if (saved === 4 && skipped === 1) {
  console.log('\n✅ Batch-20 Events 1-5 processed!');
  console.log('📈 Progress: 4/5 saved (Event 3 needs better source data)');
  console.log('\n💡 Next: Continue with Batch-20 Events 6-10');
} else if (saved === 5) {
  console.log('\n✅ All Batch-20 Events 1-5 enriched and ready!');
  console.log('📈 Progress: 5/5 events complete');
} else {
  console.log('\n⚠️  Some events failed to save. Review errors above.');
}

db.close();
