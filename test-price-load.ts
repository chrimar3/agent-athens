import { Database } from 'bun:sqlite';
import { rowToEvent } from './src/db/database';

const db = new Database('data/events.db');

const rows = db.query(`
  SELECT * FROM events
  WHERE price_amount > 0
  ORDER BY start_date
  LIMIT 3
`).all();

console.log('Database rows with price_amount > 0:');
for (const row of rows) {
  console.log(`\nTitle: ${row.title}`);
  console.log(`DB price_amount: ${row.price_amount}`);
  console.log(`DB price_type: ${row.price_type}`);

  const event = rowToEvent(row);
  console.log(`Event object price.amount: ${event.price.amount}`);
  console.log(`Event object price.type: ${event.price.type}`);
  console.log(`Truthy check: ${!!event.price.amount}`);
}

db.close();
