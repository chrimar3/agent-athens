#!/usr/bin/env bun
/**
 * Resident Advisor GraphQL Scraper
 *
 * Scrapes electronic music events from Resident Advisor's GraphQL API
 * Athens area ID: 549
 *
 * Strategy:
 * 1. Query eventListings with Athens area filter and date filter
 * 2. Extract event details (title, date, venue, cost)
 * 3. Parse cost into numeric price
 * 4. Insert/update events in database
 *
 * Usage:
 *   bun run scripts/scrape-residentadvisor.ts
 *   bun run scripts/scrape-residentadvisor.ts --dry-run   # Don't save to DB
 *   bun run scripts/scrape-residentadvisor.ts --limit 20  # Limit events
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { createHash } from 'crypto';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const GRAPHQL_URL = 'https://ra.co/graphql';
const ATHENS_AREA_ID = 549;
const BASE_URL = 'https://ra.co';

interface RAEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  venue: {
    name: string;
    id: string;
  };
  contentUrl: string;
  cost: string;
}

interface ScrapedEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  time: string;
  type: string;
  genres: string;
  venue_name: string;
  url: string;
  price_type: string;
  price_amount: number | null;
  price_range: string | null;
  source: string;
  ra_event_id: string;
}

/**
 * Generate event ID from normalized title + date + venue
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Parse RA date format (2026-01-29T00:00:00.000) to YYYY-MM-DD
 */
function parseRADate(dateStr: string): string {
  return dateStr.split('T')[0];
}

/**
 * Parse RA time format (2026-01-29T23:00:00.000) to HH:MM
 */
function parseRATime(timeStr: string): string {
  const match = timeStr.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  return '';
}

/**
 * Parse cost string to numeric price
 * Handles formats like:
 * - "7"
 * - "5.00"
 * - "18-25"
 * - "€ 10"
 * - "25 Euro"
 * - "TBA"
 * - "" (empty)
 * - "0" (free)
 */
function parseCost(cost: string): { price: number | null; priceRange: string | null; priceType: string } {
  if (!cost || cost.toLowerCase() === 'tba') {
    return { price: null, priceRange: null, priceType: 'tba' };
  }

  // Check for free
  if (cost === '0' || cost.toLowerCase() === 'free') {
    return { price: 0, priceRange: 'Free', priceType: 'free' };
  }

  // Range format: "18-25"
  const rangeMatch = cost.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]);
    const max = parseInt(rangeMatch[2]);
    return { price: min, priceRange: `€${min} - €${max}`, priceType: 'paid' };
  }

  // Single price: "7", "5.00", "€ 10", "25 Euro"
  const priceMatch = cost.match(/(\d+(?:\.\d{2})?)/);
  if (priceMatch) {
    const price = parseFloat(priceMatch[1]);
    if (price > 0 && price < 200) {
      return { price, priceRange: `€${Math.round(price)}`, priceType: 'paid' };
    }
  }

  return { price: null, priceRange: null, priceType: 'tba' };
}

/**
 * Query RA GraphQL API for Athens events
 */
async function fetchRAEvents(page: number = 1, pageSize: number = 50): Promise<{ events: RAEvent[]; total: number }> {
  const today = new Date().toISOString().split('T')[0];

  const query = `{
    eventListings(
      filters: { areas: { eq: ${ATHENS_AREA_ID} }, listingDate: { gte: "${today}" } },
      pageSize: ${pageSize},
      page: ${page}
    ) {
      data {
        event {
          id
          title
          date
          startTime
          venue {
            name
            id
          }
          contentUrl
          cost
        }
      }
      totalResults
    }
  }`;

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status}`);
  }

  const result = await response.json() as any;

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  const events = result.data.eventListings.data.map((item: any) => item.event) as RAEvent[];
  const total = result.data.eventListings.totalResults;

  return { events, total };
}

/**
 * Main scraping function
 */
async function scrapeResidentAdvisor(options: { dryRun: boolean; limit?: number }) {
  console.log('🎧 Resident Advisor Scraper\n');

  // Fetch events
  console.log('📥 Fetching events from RA GraphQL API...');

  const pageSize = options.limit || 100;
  const { events, total } = await fetchRAEvents(1, pageSize);

  console.log(`   Found ${total} total Athens events`);
  console.log(`   Processing ${events.length} events\n`);

  // Convert to our event format
  const scrapedEvents: ScrapedEvent[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const event of events) {
    const date = parseRADate(event.date);
    const time = parseRATime(event.startTime);

    // Skip past events (shouldn't happen with date filter but double-check)
    if (date < today) continue;

    const { price, priceRange, priceType } = parseCost(event.cost);

    const id = generateEventId(event.title, date, event.venue.name);

    console.log(`   ${date} | ${event.venue.name.padEnd(20)} | ${event.title.substring(0, 35)}... | ${priceRange || 'TBA'}`);

    scrapedEvents.push({
      id,
      title: event.title,
      description: '',
      start_date: date,
      time,
      type: 'concert',
      genres: 'electronic',
      venue_name: event.venue.name,
      url: `${BASE_URL}${event.contentUrl}`,
      price_type: priceType,
      price_amount: price,
      price_range: priceRange,
      source: 'residentadvisor',
      ra_event_id: event.id
    });
  }

  console.log(`\n📊 Events to save: ${scrapedEvents.length}`);

  // Show venue distribution
  const venues = new Map<string, number>();
  for (const e of scrapedEvents) {
    venues.set(e.venue_name, (venues.get(e.venue_name) || 0) + 1);
  }
  console.log('\n🏢 Top venues:');
  [...venues.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([name, count]) => {
      console.log(`   ${name}: ${count} events`);
    });

  // Show price stats
  const withPrice = scrapedEvents.filter(e => e.price_amount !== null);
  const free = scrapedEvents.filter(e => e.price_type === 'free');
  const tba = scrapedEvents.filter(e => e.price_type === 'tba');
  console.log('\n💰 Price breakdown:');
  console.log(`   With price: ${withPrice.length}`);
  console.log(`   Free: ${free.length}`);
  console.log(`   TBA: ${tba.length}`);

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - No changes made to database');
    return scrapedEvents; // Return for potential cross-reference use
  }

  // Save to database
  const db = new Database(DB_PATH);

  let inserted = 0;

  const insertStmt = db.prepare(`
    INSERT INTO events (
      id, title, description, start_date, time_doors, time_source, type, genres,
      venue_name, url, price_type, price_amount, price_range, source,
      location_status, needs_enrichment, created_at, updated_at
    ) VALUES (
      $id, $title, $description, $start_date, $time_doors, 'scraped_listing', $type, $genres,
      $venue_name, $url, $price_type, $price_amount, $price_range, $source,
      'unverified', 1, datetime('now'), datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      title = $title,
      url = $url,
      price_type = COALESCE($price_type, price_type),
      price_amount = COALESCE($price_amount, price_amount),
      price_range = COALESCE($price_range, price_range),
      time_doors = COALESCE($time_doors, time_doors),
      time_source = COALESCE('scraped_listing', time_source),
      updated_at = datetime('now')
  `);

  for (const event of scrapedEvents) {
    try {
      insertStmt.run({
        $id: event.id,
        $title: event.title,
        $description: event.description,
        $start_date: event.start_date,
        $time_doors: event.time,
        $type: event.type,
        $genres: event.genres,
        $venue_name: event.venue_name,
        $url: event.url,
        $price_type: event.price_type,
        $price_amount: event.price_amount,
        $price_range: event.price_range,
        $source: event.source
      });
      inserted++;
    } catch (error) {
      console.error(`   ❌ Error saving ${event.title}:`, error);
    }
  }

  db.close();

  console.log(`\n✅ Saved ${inserted} events to database`);
  return scrapedEvents;
}

// Export for use in cross-reference script
export { scrapeResidentAdvisor, fetchRAEvents, parseCost };

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : undefined;

// Only run main if called directly
if (import.meta.main) {
  scrapeResidentAdvisor({ dryRun, limit }).catch(console.error);
}
