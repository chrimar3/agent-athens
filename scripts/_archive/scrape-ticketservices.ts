#!/usr/bin/env bun
/**
 * TicketServices.gr Scraper
 *
 * Scrapes concert events from ticketservices.gr
 *
 * Strategy:
 * 1. Fetch listing page to get event IDs, dates, venues, titles
 * 2. For each event, fetch page with showid to get price zones
 * 3. Extract lowest price from legend section
 * 4. Insert/update events in database
 *
 * Usage:
 *   bun run scripts/scrape-ticketservices.ts
 *   bun run scripts/scrape-ticketservices.ts --dry-run   # Don't save to DB
 *   bun run scripts/scrape-ticketservices.ts --limit 5    # Process only 5 events
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { createHash } from 'crypto';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const LISTING_URL = 'https://www.ticketservices.gr/en/LiveConcerts/';
const BASE_URL = 'https://www.ticketservices.gr';

/**
 * Fetch with timeout using AbortController
 * Prevents indefinite hangs on unresponsive endpoints
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Athens venues/areas (filter out non-Athens)
const ATHENS_AREA_IDS = ['1']; // Area ID 1 is Athens based on data analysis
const NON_ATHENS_KEYWORDS = ['syros', 'thessaloniki', 'larisa', 'patras', 'crete', 'rhodes'];

interface TicketServicesEvent {
  eventId: string;
  title: string;
  dates: string[];  // YYYY-MM-DD format
  venue: string;
  venueId: string;
  areaId: string;
  url: string;
  showIds: string[];
  price?: number;
  priceRange?: string;
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
}

/**
 * Generate event ID from normalized title + date + venue
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Decode windows-1253 encoded buffer to UTF-8 string
 */
function decodeWindows1253(buffer: ArrayBuffer): string {
  // windows-1253 to Unicode mapping for Greek characters
  const decoder = new TextDecoder('windows-1253');
  return decoder.decode(buffer);
}

/**
 * Clean up HTML text
 */
function decodeGreek(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if venue is in Athens area
 */
function isAthensVenue(areaId: string, venue: string): boolean {
  // Area 1 is Athens
  if (ATHENS_AREA_IDS.includes(areaId)) return true;

  // Check for non-Athens keywords
  const venueLower = venue.toLowerCase();
  for (const keyword of NON_ATHENS_KEYWORDS) {
    if (venueLower.includes(keyword)) return false;
  }

  return true;
}

/**
 * Fetch and parse the listing page
 */
async function fetchListingPage(): Promise<TicketServicesEvent[]> {
  console.log('📥 Fetching listing page...');

  const response = await fetchWithTimeout(LISTING_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  }, 30_000);

  if (!response.ok) {
    throw new Error(`Failed to fetch listing: ${response.status}`);
  }

  // Decode windows-1253 charset
  const buffer = await response.arrayBuffer();
  const html = decodeWindows1253(buffer);
  const events: TicketServicesEvent[] = [];

  // Parse events from <li> elements with data attributes
  // Pattern: <li id='ev13330' class='event ...' data-eventid='13330' data-dates='2026-01-26|2026-01-27' data-venues='VENUE NAME' data-title='TITLE' ...>
  const eventPattern = /<li[^>]+class='[^']*event[^']*'[^>]+data-eventid='(\d+)'[^>]+data-dates='([^']*)'[^>]+data-areaids='([^']*)'[^>]+data-venueids='(\d+)'[^>]*data-venues='([^']*)'[^>]+data-title='([^']*)'/g;

  let match;
  while ((match = eventPattern.exec(html)) !== null) {
    const [, eventId, datesStr, areaIds, venueId, venue, title] = match;

    // Parse dates (pipe-separated YYYY-MM-DD)
    const dates = datesStr.split('|').filter(d => d.length > 0);

    // Get first area ID for Athens check
    const areaId = areaIds.split('|')[0] || '';

    // Clean up title and venue
    const cleanTitle = decodeGreek(title);
    const cleanVenue = decodeGreek(venue);

    events.push({
      eventId,
      title: cleanTitle,
      dates,
      venue: cleanVenue,
      venueId,
      areaId,
      url: `${BASE_URL}/event/${eventId}/`,
      showIds: [] // Will be populated when fetching event page
    });
  }

  console.log(`   Found ${events.length} events in listing`);
  return events;
}

/**
 * Get show IDs from event page
 */
async function getShowIdsForEvent(eventId: string): Promise<string[]> {
  const url = `${BASE_URL}/event/${eventId}/?lang=en`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 30_000);

    if (!response.ok) return [];

    const buffer = await response.arrayBuffer();
    const html = decodeWindows1253(buffer);
    const showIds: string[] = [];

    // Extract show IDs from data-showid attributes
    const showPattern = /data-showid='(\d+)'/g;
    let match;
    while ((match = showPattern.exec(html)) !== null) {
      if (!showIds.includes(match[1])) {
        showIds.push(match[1]);
      }
    }

    return showIds;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`   ⏱️ Timeout fetching shows for event ${eventId}`);
    } else {
      console.error(`   ❌ Error fetching shows for event ${eventId}:`, error.message);
    }
    return [];
  }
}

/**
 * Extract price from event page with selected show
 */
async function extractPrice(eventId: string, showId: string): Promise<{ price: number | null; priceRange: string | null }> {
  const url = `${BASE_URL}/event/${eventId}/?lang=en&eventid=${eventId}&showid=${showId}`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 30_000);

    if (!response.ok) return { price: null, priceRange: null };

    const buffer = await response.arrayBuffer();
    const html = decodeWindows1253(buffer);

    // Extract prices from legend - look for data-price attributes
    const pricePattern = /data-price='([\d.]+)'/g;
    const prices: number[] = [];

    let match;
    while ((match = pricePattern.exec(html)) !== null) {
      const price = parseFloat(match[1]);
      if (price > 0 && price < 500) {
        prices.push(price);
      }
    }

    // Also try pcodeprice pattern as backup
    if (prices.length === 0) {
      const pricePattern2 = /<b class='pcodeprice'>(\d+)&euro;<\/b>/g;
      while ((match = pricePattern2.exec(html)) !== null) {
        const price = parseInt(match[1]);
        if (price > 0 && price < 500) {
          prices.push(price);
        }
      }
    }

    if (prices.length === 0) {
      return { price: null, priceRange: null };
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    return {
      price: minPrice,
      priceRange: minPrice === maxPrice ? `€${minPrice}` : `€${minPrice} - €${maxPrice}`
    };

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`   ⏱️ Timeout extracting price for event ${eventId}`);
    } else {
      console.error(`   ❌ Error extracting price:`, error.message);
    }
    return { price: null, priceRange: null };
  }
}

/**
 * Build event URL from slug
 */
async function getEventSlug(eventId: string): Promise<string | null> {
  const url = `${BASE_URL}/event/${eventId}/?lang=en`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    }, 30_000);

    // Get final URL after redirects
    return response.url;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`   ⏱️ Timeout getting slug for event ${eventId}`);
    }
    return `${BASE_URL}/event/${eventId}/`;
  }
}

/**
 * Main scraping function
 */
async function scrapeTicketServices(options: { dryRun: boolean; limit?: number }) {
  console.log('🎫 TicketServices.gr Scraper\n');

  // Fetch listing
  const events = await fetchListingPage();

  // Filter to Athens only
  const athensEvents = events.filter(e => isAthensVenue(e.areaId, e.venue));
  console.log(`📍 Athens events: ${athensEvents.length}/${events.length}\n`);

  // Apply limit
  const toProcess = options.limit ? athensEvents.slice(0, options.limit) : athensEvents;

  // Process each event
  const scrapedEvents: ScrapedEvent[] = [];

  for (let i = 0; i < toProcess.length; i++) {
    const event = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] ${event.title.substring(0, 50)}...`);

    // Get first show ID
    const showIds = await getShowIdsForEvent(event.eventId);

    // Get price from first show
    let price: number | null = null;
    let priceRange: string | null = null;

    if (showIds.length > 0) {
      const priceData = await extractPrice(event.eventId, showIds[0]);
      price = priceData.price;
      priceRange = priceData.priceRange;
      console.log(`   💰 Price: ${priceRange || 'TBA'}`);
    } else {
      console.log(`   ⚠️ No shows available`);
    }

    // Get event URL slug
    const eventUrl = await getEventSlug(event.eventId);

    // Create events for each date
    for (const date of event.dates) {
      // Skip past dates
      const today = new Date().toISOString().split('T')[0];
      if (date < today) continue;

      const id = generateEventId(event.title, date, event.venue);

      scrapedEvents.push({
        id,
        title: event.title,
        description: '',
        start_date: date,
        time: '', // Time extracted separately if needed
        type: 'concert',
        genres: '',
        venue_name: event.venue,
        url: eventUrl || `${BASE_URL}/event/${event.eventId}/`,
        price_type: price ? 'paid' : 'tba',
        price_amount: price,
        price_range: priceRange,
        source: 'ticketservices'
      });
    }

    // Rate limit: 1 second delay
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n📊 Total events to save: ${scrapedEvents.length}`);

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - Events that would be saved:');
    for (const event of scrapedEvents.slice(0, 10)) {
      console.log(`   ${event.start_date} | ${event.title.substring(0, 40)} | ${event.venue_name} | ${event.price_range || 'TBA'}`);
    }
    if (scrapedEvents.length > 10) {
      console.log(`   ... and ${scrapedEvents.length - 10} more`);
    }
    return;
  }

  // Save to database
  const db = new Database(DB_PATH);

  let inserted = 0;
  let updated = 0;

  const insertStmt = db.prepare(`
    INSERT INTO events (
      id, title, description, start_date, time, type, genres,
      venue_name, url, price_type, price_amount, price_range, source,
      location_status, needs_enrichment, created_at
    ) VALUES (
      $id, $title, $description, $start_date, $time, $type, $genres,
      $venue_name, $url, $price_type, $price_amount, $price_range, $source,
      'unverified', 1, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      title = $title,
      url = $url,
      price_type = COALESCE($price_type, price_type),
      price_amount = COALESCE($price_amount, price_amount),
      price_range = COALESCE($price_range, price_range),
      updated_at = datetime('now')
  `);

  for (const event of scrapedEvents) {
    try {
      insertStmt.run({
        $id: event.id,
        $title: event.title,
        $description: event.description,
        $start_date: event.start_date,
        $time: event.time,
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
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : undefined;

scrapeTicketServices({ dryRun, limit }).catch(console.error);
