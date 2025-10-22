#!/usr/bin/env bun
/**
 * Import batch 2 events into database
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getDatabase } from '../src/db/database';

async function main() {
  console.log('📥 Importing batch 2 events into database...\n');

  // Load parsed events from batch 2
  const parsedPath = join(import.meta.dir, '../data/enrichment-batches/batch-2-of-13.json');
  const events = JSON.parse(readFileSync(parsedPath, 'utf-8'));

  console.log(`📊 Found ${events.length} events\n`);

  // Get database
  const db = getDatabase();

  // Import events
  let successCount = 0;
  let failCount = 0;

  for (const event of events) {
    try {
      const stmt = db.prepare(`
        INSERT INTO events (
          id, title, description, full_description, start_date, end_date,
          type, genres, tags,
          venue_name, venue_address, venue_neighborhood, venue_lat, venue_lng, venue_capacity,
          price_type, price_amount, price_currency, price_range,
          url, source, ai_context, schema_json,
          created_at, updated_at, scraped_at
        ) VALUES (
          $id, $title, $description, $fullDescription, $startDate, $endDate,
          $type, $genres, $tags,
          $venueName, $venueAddress, $venueNeighborhood, $venueLat, $venueLng, $venueCapacity,
          $priceType, $priceAmount, $priceCurrency, $priceRange,
          $url, $source, $aiContext, $schemaJson,
          $createdAt, $updatedAt, $scrapedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          start_date = excluded.start_date,
          updated_at = excluded.updated_at
      `);

      const now = new Date().toISOString();

      stmt.run({
        $id: event.id,
        $title: event.title,
        $description: event.description || '',
        $fullDescription: null,
        $startDate: event.start_date,
        $endDate: null,
        $type: event.type || 'concert',
        $genres: event.genres || '[]',
        $tags: '[]',
        $venueName: event.venue_name,
        $venueAddress: '',
        $venueNeighborhood: null,
        $venueLat: null,
        $venueLng: null,
        $venueCapacity: null,
        $priceType: 'with-ticket',
        $priceAmount: null,
        $priceCurrency: 'EUR',
        $priceRange: null,
        $url: event.url || null,
        $source: 'viva.gr',
        $aiContext: null,
        $schemaJson: JSON.stringify(event),
        $createdAt: now,
        $updatedAt: now,
        $scrapedAt: now
      });

      successCount++;
    } catch (error) {
      failCount++;
      console.error(`❌ Failed to import ${event.title}:`, error);
    }
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);

  // Show stats
  const stats = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
  console.log(`\n📊 Total events in database: ${stats.count}`);
}

main().catch(console.error);
