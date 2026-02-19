#!/usr/bin/env bun
/**
 * Fix URLs and Prices Script (Enhanced)
 *
 * 1. Updates all viva.gr URLs to more.com
 * 2. Checks if URLs redirect to homepage (marks as invalid)
 * 3. Scrapes correct prices using multiple strategies:
 *    - JSON-LD (Schema.org Event) for venue, dates, metadata
 *    - Text extraction for prices (from "από XX€" pattern)
 *
 * Usage:
 *   bun run scripts/fix-urls-and-prices.ts              # Fix all
 *   bun run scripts/fix-urls-and-prices.ts --dry-run    # Preview only
 *   bun run scripts/fix-urls-and-prices.ts --limit 10   # Limit events
 *   bun run scripts/fix-urls-and-prices.ts --verbose    # Show extraction details
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import puppeteer from 'puppeteer-core';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DELAY_MS = 2500;

interface JsonLdData {
  venueName: string | null;
  venueAddress: string | null;
  startDate: string | null;
  startTime: string | null;
  description: string | null;
  organizer: string | null;
  imageUrl: string | null;
}

interface ScrapeResult {
  finalUrl: string;
  isValid: boolean;
  price: number | null;
  priceRange: string | null;
  jsonLd: JsonLdData | null;
  dataSource: 'json-ld+text' | 'text-only';
  isTBA?: boolean;      // Tickets not on sale yet
  isFree?: boolean;     // Explicitly marked as free
  error?: string;
}

/**
 * Parse Greek date format like "14/2/2026 10:00:00 μμ" to ISO
 */
function parseGreekDate(dateStr: string): { date: string | null; time: string | null } {
  if (!dateStr) return { date: null, time: null };

  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(μμ|πμ)?/i);
  if (!match) return { date: null, time: null };

  const [, day, month, year, hours, minutes, , ampm] = match;
  let hour = parseInt(hours);

  if (ampm?.toLowerCase() === 'μμ' && hour < 12) {
    hour += 12;
  } else if (ampm?.toLowerCase() === 'πμ' && hour === 12) {
    hour = 0;
  }

  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const time = `${hour.toString().padStart(2, '0')}:${minutes}`;

  return { date, time };
}

/**
 * Extract JSON-LD Schema.org Event data from page
 */
async function extractJsonLd(page: puppeteer.Page): Promise<JsonLdData | null> {
  const data = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const json = JSON.parse(script.textContent || '');
        if (json['@type'] === 'Event') return json;
        if (json['@graph']) {
          for (const item of json['@graph']) {
            if (item['@type'] === 'Event') return item;
          }
        }
      } catch (e) { /* Invalid JSON */ }
    }
    return null;
  });

  if (!data) return null;

  const result: JsonLdData = {
    venueName: null,
    venueAddress: null,
    startDate: null,
    startTime: null,
    description: data.description || null,
    organizer: data.organizer?.name || null,
    imageUrl: null
  };

  // Extract dates
  if (data.startDate) {
    const dateStr = Array.isArray(data.startDate) ? data.startDate[0] : data.startDate;
    const parsed = parseGreekDate(dateStr);
    result.startDate = parsed.date;
    result.startTime = parsed.time;
  }

  // Extract location
  if (data.location) {
    result.venueName = data.location.name || null;
    if (data.location.address) {
      result.venueAddress = typeof data.location.address === 'string'
        ? data.location.address
        : data.location.address.streetAddress || data.location.address.addressLocality || null;
    }
  }

  // Extract image
  if (data.image) {
    let imageUrl = Array.isArray(data.image) ? data.image[0] : data.image;
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = 'https://' + imageUrl;
    }
    result.imageUrl = imageUrl;
  }

  return result;
}

/**
 * Convert viva.gr URL to more.com
 */
function vivaToMore(url: string): string {
  return url.replace(/viva\.gr/g, 'more.com');
}

/**
 * Extract price from page text (kept for compatibility and as primary price source)
 *
 * Returns:
 * - isFree: true only when explicitly marked as free (δωρεάν, ελεύθερη είσοδος)
 * - isTBA: true when no price found and not explicitly free (tickets not on sale yet)
 */
function extractPriceFromText(pageText: string): { price: number | null; priceRange: string | null; isFree: boolean; isTBA: boolean } {
  const lowerText = pageText.toLowerCase();

  // First, try to extract actual prices - this takes priority
  // Extract price - look for "από XX€" pattern first (most reliable)
  const apoMatch = pageText.match(/από\s*(\d+(?:[.,]\d{2})?)\s*€/i);
  if (apoMatch) {
    const price = parseFloat(apoMatch[1].replace(',', '.'));
    if (price >= 5 && price < 500) {
      return { price, priceRange: `από €${price}`, isFree: false, isTBA: false };
    }
  }

  // Check for any "XX€" pattern
  const allPrices: number[] = [];
  const pricePattern = /(?<!\d)(\d{2,3})€/g;
  let match;
  while ((match = pricePattern.exec(pageText)) !== null) {
    const p = parseInt(match[1]);
    if (p >= 8 && p <= 300) {
      allPrices.push(p);
    }
  }

  // Also check "€XX" pattern
  const euroFirstPattern = /€\s*(\d{2,3})(?!\d)/g;
  while ((match = euroFirstPattern.exec(pageText)) !== null) {
    const p = parseInt(match[1]);
    if (p >= 8 && p <= 300) {
      allPrices.push(p);
    }
  }

  if (allPrices.length > 0) {
    const uniquePrices = [...new Set(allPrices)].sort((a, b) => a - b);
    const minPrice = uniquePrices[0];
    const maxPrice = uniquePrices[uniquePrices.length - 1];
    return {
      price: minPrice,
      priceRange: minPrice !== maxPrice ? `€${minPrice}-€${maxPrice}` : `€${minPrice}`,
      isFree: false,
      isTBA: false
    };
  }

  // Only check for free events if NO price was found
  // Use specific patterns to avoid false positives from footer/promo text
  const freePatterns = [
    /είσοδος\s*:?\s*δωρεάν/i,
    /δωρεάν\s*είσοδος/i,
    /ελεύθερη\s*είσοδος/i,
    /είσοδος\s*ελεύθερη/i,
    /free\s*entry/i,
    /free\s*admission/i,
    /εισιτήριο\s*:?\s*δωρεάν/i,
    /τιμή\s*:?\s*δωρεάν/i
  ];

  for (const pattern of freePatterns) {
    if (pattern.test(lowerText)) {
      return { price: 0, priceRange: 'Δωρεάν', isFree: true, isTBA: false };
    }
  }

  // No price found and not explicitly free = TBA (tickets not on sale yet)
  return { price: null, priceRange: 'TBA', isFree: false, isTBA: true };
}

/**
 * Scrape a single event page using JSON-LD + text extraction
 */
async function scrapeEvent(url: string, page: puppeteer.Page, verbose: boolean = false): Promise<ScrapeResult> {
  const moreUrl = vivaToMore(url);

  try {
    await page.goto(moreUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 2000));

    const finalUrl = page.url();

    // Check if redirected to homepage or 404 page
    if (finalUrl.match(/more\.com\/gr-el\/?$/) || finalUrl.includes('/404')) {
      return {
        finalUrl,
        isValid: false,
        price: null,
        priceRange: null,
        jsonLd: null,
        dataSource: 'text-only',
        isTBA: false,
        isFree: false,
        error: finalUrl.includes('/404') ? 'Event page not found (404)' : 'Redirected to homepage - event not found'
      };
    }

    // Strategy 1: Extract JSON-LD data (for venue, dates, metadata)
    const jsonLd = await extractJsonLd(page);

    if (verbose && jsonLd) {
      console.log(`   📋 JSON-LD: venue="${jsonLd.venueName}", date="${jsonLd.startDate}"`);
    }

    // Strategy 2: Extract price from text (always use this for price)
    const pageText = await page.evaluate(() => document.body.innerText);
    const priceData = extractPriceFromText(pageText);

    return {
      finalUrl,
      isValid: true,
      price: priceData.isTBA ? null : priceData.price,
      priceRange: priceData.priceRange,
      jsonLd,
      dataSource: jsonLd ? 'json-ld+text' : 'text-only',
      isTBA: priceData.isTBA,
      isFree: priceData.isFree
    };

  } catch (e: any) {
    return {
      finalUrl: moreUrl,
      isValid: false,
      price: null,
      priceRange: null,
      jsonLd: null,
      dataSource: 'text-only',
      isTBA: false,
      isFree: false,
      error: e.message
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 0;

  console.log('🔧 Agent Athens - URL & Price Fixer (Enhanced)\n');
  console.log('📋 Extraction: JSON-LD metadata + text-based prices\n');
  if (dryRun) console.log('⚠️  DRY RUN MODE\n');

  const db = new Database(DB_PATH);

  // Get events that need fixing:
  // 1. viva.gr URLs (need conversion)
  // 2. price_amount = 0 but not workshops (likely wrong)
  // 3. price_amount IS NULL (need scraping)
  let query = `
    SELECT id, title, url, price_amount, price_range, type
    FROM events
    WHERE url IS NOT NULL
      AND url != ''
      AND url NOT LIKE '%clubber.gr%'
      AND (
        url LIKE '%viva.gr%'
        OR (price_amount = 0 AND type != 'workshop')
        OR price_amount IS NULL
      )
    ORDER BY start_date ASC
  `;

  if (limit > 0) query += ` LIMIT ${limit}`;

  const events = db.prepare(query).all() as Array<{
    id: string;
    title: string;
    url: string;
    price_amount: number | null;
    price_range: string | null;
    type: string;
  }>;

  console.log(`📊 Found ${events.length} events to process\n`);

  if (events.length === 0) {
    console.log('✅ Nothing to fix!');
    db.close();
    return;
  }

  // Start browser
  console.log('🌐 Starting browser...\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  const updateStmt = db.prepare(`
    UPDATE events
    SET url = $url, price_amount = $price, price_range = $range, updated_at = $updated
    WHERE id = $id
  `);

  // Statistics
  let fixed = 0, invalid = 0, failed = 0, tbaCount = 0, freeCount = 0;
  let jsonLdUsed = 0, textOnlyUsed = 0;
  let venueExtracted = 0;

  try {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const progress = `[${i + 1}/${events.length}]`;

      console.log(`${progress} ${event.title.substring(0, 50)}...`);
      if (verbose) {
        console.log(`   Old URL: ${event.url.substring(0, 60)}...`);
      }

      if (i > 0) await new Promise(r => setTimeout(r, DELAY_MS));

      const result = await scrapeEvent(event.url, page, verbose);

      if (verbose) {
        console.log(`   New URL: ${result.finalUrl.substring(0, 60)}...`);
        console.log(`   Data source: ${result.dataSource}`);
      }

      if (!result.isValid) {
        console.log(`   ❌ INVALID: ${result.error}`);
        invalid++;
      } else if (result.isTBA) {
        // Tickets not on sale yet - set price_range to TBA, leave price_amount NULL
        console.log(`   🕐 TBA (tickets not on sale yet)`);
        tbaCount++;

        // Track extraction method
        if (result.dataSource === 'json-ld+text') {
          jsonLdUsed++;
          if (result.jsonLd?.venueName) venueExtracted++;
        } else {
          textOnlyUsed++;
        }

        if (!dryRun) {
          db.prepare(`UPDATE events SET url = $url, price_range = $range, updated_at = $updated WHERE id = $id`).run({
            $id: event.id,
            $url: result.finalUrl,
            $range: 'TBA',
            $updated: new Date().toISOString()
          });
        }
      } else if (result.isFree) {
        // Explicitly free event
        console.log(`   🎫 FREE (${result.priceRange})`);
        freeCount++;
        fixed++;

        // Track extraction method
        if (result.dataSource === 'json-ld+text') {
          jsonLdUsed++;
          if (result.jsonLd?.venueName) venueExtracted++;
        } else {
          textOnlyUsed++;
        }

        if (!dryRun) {
          updateStmt.run({
            $id: event.id,
            $url: result.finalUrl,
            $price: 0,
            $range: result.priceRange,
            $updated: new Date().toISOString()
          });
        }
      } else if (result.price !== null) {
        // Paid event with price
        console.log(`   ✅ Price: €${result.price} (${result.priceRange})`);
        fixed++;

        // Track extraction method
        if (result.dataSource === 'json-ld+text') {
          jsonLdUsed++;
          if (result.jsonLd?.venueName) venueExtracted++;
        } else {
          textOnlyUsed++;
        }

        if (!dryRun) {
          updateStmt.run({
            $id: event.id,
            $url: result.finalUrl,
            $price: result.price,
            $range: result.priceRange,
            $updated: new Date().toISOString()
          });
        }
      } else {
        console.log(`   ⚠️  No price found`);
        failed++;

        // Track extraction method even for failed price extraction
        if (result.dataSource === 'json-ld+text') {
          jsonLdUsed++;
        } else {
          textOnlyUsed++;
        }

        // Still update the URL even if no price
        if (!dryRun && result.finalUrl !== event.url) {
          db.prepare(`UPDATE events SET url = $url, updated_at = $updated WHERE id = $id`).run({
            $id: event.id,
            $url: result.finalUrl,
            $updated: new Date().toISOString()
          });
        }
      }

      console.log('');
    }
  } finally {
    await browser.close();
  }

  db.close();

  // Print summary
  const total = events.length;
  const paidCount = fixed - freeCount;

  console.log('='.repeat(60));
  console.log('📊 EXTRACTION RESULTS:');
  console.log('='.repeat(60));
  console.log(`   ✅ Paid events: ${paidCount}`);
  console.log(`   🎫 Free events: ${freeCount}`);
  console.log(`   🕐 TBA (tickets not on sale): ${tbaCount}`);
  console.log(`   ❌ Invalid (redirect): ${invalid}`);
  console.log(`   ⚠️  Unknown: ${failed}`);
  console.log('');
  console.log('📈 DATA SOURCE BREAKDOWN:');
  console.log(`   JSON-LD + text: ${jsonLdUsed} (${total > 0 ? Math.round((jsonLdUsed / total) * 100) : 0}%)`);
  console.log(`   Text only: ${textOnlyUsed}`);
  console.log(`   Venue metadata extracted: ${venueExtracted}`);
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes made');
  } else {
    console.log('\n🔄 NEXT: bun run build && netlify deploy --prod --dir=dist');
  }
}

main().catch(console.error);
