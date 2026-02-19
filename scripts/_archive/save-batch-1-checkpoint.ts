import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

// Batch 1 - First 5 events completed
const events = [
  { id: 'notis-2025-2025-10-30', prefix: '01' },
  { id: 'athens-spooks-lucifer-the-abbey-2025-10-30', prefix: '02' },
  { id: '2025-26-2025-10-30', prefix: '03' },
  { id: '4d187e67dfc2c222', prefix: '04' },
  { id: 'b5ffe4a211668948', prefix: '05' },
];

console.log('📝 Saving Batch 1 checkpoint (Events 01-05)...\n');

let updated = 0;
let errors = 0;

for (const event of events) {
  try {
    // Read English description
    const enPath = `data/batch-20-results/${event.prefix}-${event.id}-en-result.txt`;
    const enDescription = await Bun.file(enPath).text();

    // Read Greek description
    const grPath = `data/batch-20-results/${event.prefix}-${event.id}-gr-result.txt`;
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

console.log(`\n📊 Checkpoint Summary:`);
console.log(`   Updated: ${updated}/5`);
console.log(`   Errors:  ${errors}/5`);

if (updated === 5) {
  console.log('\n✅ Checkpoint saved! All 5 events updated with bilingual descriptions.');
  console.log('⏭️  Ready to continue with Events 06-20');
}

db.close();
