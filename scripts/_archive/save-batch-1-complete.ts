import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

// All 20 events from Batch 1
const events = [
  { id: 'notis-2025-2025-10-30', prefix: '01' },
  { id: 'athens-spooks-lucifer-the-abbey-2025-10-30', prefix: '02' },
  { id: '2025-26-2025-10-30', prefix: '03' },
  { id: '4d187e67dfc2c222', prefix: '04' },
  { id: 'b5ffe4a211668948', prefix: '05' },
  { id: '04cf8d3ad73ffadd', prefix: '06' },
  { id: '1bbe9f6abd3de9cf', prefix: '07' },
  { id: 'd909fa9da36fdbcd', prefix: '08' },
  { id: 'ed7c0701dc4ed609', prefix: '09' },
  { id: '091c05114dc41f2a', prefix: '10' },
  { id: '0324e0e3ea8d1b0d', prefix: '11' },
  { id: '3bddbcc9f7bd389d', prefix: '12' },
  { id: '71e57cbe67dd484a', prefix: '13' },
  { id: 'stand-up-comedy-ha-ha-halloween-2025-10-30', prefix: '14' },
  { id: 'athens-halloween-festival-2025-2025-10-30', prefix: '15' },
  { id: 'pumpkin-carving-30-10-8-10-2025-10-30', prefix: '16' },
  { id: 'painting-with-koko-texnh-athens-halloween-festival-2025-2025-10-30', prefix: '17' },
  { id: '30-2025-10-30', prefix: '18' },
  { id: 'pumpkin-carving-30-10-4-6-2025-10-30', prefix: '19' },
  { id: 'pumpkin-carving-30-10-6-8-2025-10-30', prefix: '20' },
];

console.log('📝 Saving Batch 1 - All 20 events...\n');

let updated = 0;
let errors = 0;

for (const event of events) {
  try {
    const enPath = `data/batch-20-results/${event.prefix}-${event.id}-en-result.txt`;
    const enDescription = await Bun.file(enPath).text();

    const grPath = `data/batch-20-results/${event.prefix}-${event.id}-gr-result.txt`;
    const grDescription = await Bun.file(grPath).text();

    db.prepare(`
      UPDATE events
      SET full_description_en = ?,
          full_description_gr = ?,
          language_preference = 'both',
          updated_at = datetime('now')
      WHERE id = ?
    `).run(enDescription, grDescription, event.id);

    const row = db.prepare('SELECT title FROM events WHERE id = ?').get(event.id) as any;
    if (row) {
      console.log(`✅ ${event.prefix}. ${event.id}: ${row.title.substring(0, 40)}...`);
      updated++;
    } else {
      console.log(`⚠️  ${event.prefix}. ${event.id}: Not found in database`);
    }
  } catch (error) {
    console.error(`❌ ${event.prefix}. ${event.id}: ${error.message}`);
    errors++;
  }
}

console.log(`\n📊 Batch 1 Complete:`);
console.log(`   Updated: ${updated}/20`);
console.log(`   Errors:  ${errors}/20`);

if (updated === 20) {
  console.log('\n🎉 SUCCESS! All 20 events updated with bilingual descriptions.');
  console.log('💾 Database now contains enriched content for Batch 1');
}

db.close();
