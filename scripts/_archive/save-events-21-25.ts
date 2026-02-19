import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

console.log('💾 Saving Events 21-25 to database\n');

const events = [
  { id: '65-2025-11-05', prefix: '21', title: 'Bodies in Motion (65+)' },
  { id: 'yoga-2025-11-05', prefix: '22', title: 'Yoga & Meditation' },
  { id: 'eat-drink-draw-2025-11-05', prefix: '23', title: 'Eat, Drink & Draw' },
  { id: 'messy-play-with-hehe-1-5-5-2025-11-05', prefix: '24', title: 'Messy Play with Hehe' },
  { id: 'andreas-ragnar-kassapis-shame-is-an-object-in-space-2025-11-05', prefix: '25', title: 'Shame is an Object in Space' },
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
  console.log('\n✅ All Events 21-25 enriched and ready for deployment!');
  console.log('🚀 Next step: bun run build');
} else {
  console.log('\n⚠️  Some events failed to save. Review errors above.');
}

db.close();
