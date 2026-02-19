import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

const event = { id: '65-2025-11-05', prefix: '21' };

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

console.log(`✅ Event 21 saved: ${row.title}`);
console.log(`   Has full_description: ${row.has_desc ? 'YES' : 'NO'}`);

db.close();

console.log('\n🚀 Now rebuild site to see enriched description on agentathens.netlify.app');
