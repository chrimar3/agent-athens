import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

// Event IDs and their result files
const events = [
  { id: '9a498120957c0146', prefix: '02' },
  { id: '1859f1ae6c91776e', prefix: '03' },
  { id: '65-2025-11-04', prefix: '04' },
  { id: 'f40d6a18771b35bb', prefix: '05' },
  { id: 'c0fc8107048e9a2f', prefix: '06' },
];

console.log('📝 Updating 5 events with bilingual descriptions...\n');

let updated = 0;
let errors = 0;

for (const event of events) {
  try {
    // Read English description
    const enPath = `data/batch-10-events/${event.prefix}-${event.id}-en-result.txt`;
    const enDescription = await Bun.file(enPath).text();

    // Read Greek description
    const grPath = `data/batch-10-events/${event.prefix}-${event.id}-gr-result.txt`;
    const grDescription = await Bun.file(grPath).text();

    // Update database
    db.prepare(`
      UPDATE events
      SET full_description_en = ?,
          full_description_gr = ?,
          language_preference = 'both',
          updated_at = datetime('now')
      WHERE id = ?
    `).run(enDescription, grDescription, event.id);

    // Get title for logging
    const row = db.prepare('SELECT title FROM events WHERE id = ?').get(event.id) as any;

    console.log(`✅ ${event.id}: ${row.title.substring(0, 40)}...`);
    updated++;

  } catch (error) {
    console.error(`❌ ${event.id}: ${error.message}`);
    errors++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Updated: ${updated}/5`);
console.log(`   Errors:  ${errors}/5`);

if (updated === 5) {
  console.log('\n✅ All events successfully updated with bilingual descriptions!');
}

db.close();
