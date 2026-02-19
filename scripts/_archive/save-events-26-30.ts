import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

console.log('💾 Saving Events 26-30 to database\n');

const events = [
  { id: 'f3d0ba39bc98b2d5', prefix: '26', title: 'Dimitris Bakoulis at Stavros tou Notou' },
  { id: '0c47c72c04904378', prefix: '27', title: 'Yiannis Vagianos Quartet' },
  { id: '7d3143dcee37d636', prefix: '28', title: 'The Trial - Kafka' },
  { id: '5722a4cf34753b93', prefix: '29', title: 'The Meaning of Life No. 2' },
  { id: '75b30e22514c29d0', prefix: '30', title: 'Struggles and Metamorphoses of a Woman' },
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
  console.log('\n✅ All Events 26-30 enriched and ready!');
  console.log('📈 Progress: 10/20 events complete (50% of Batch 2)');
} else {
  console.log('\n⚠️  Some events failed to save. Review errors above.');
}

db.close();
