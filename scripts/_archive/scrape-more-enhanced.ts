#!/usr/bin/env bun
/**
 * Enhanced More.com Scraper
 *
 * Extracts richer event data from more.com using multiple strategies:
 * 1. JSON-LD (Schema.org Event) - venue, dates, description, organizer
 * 2. Text extraction - prices (from "από XX€" pattern)
 * 3. Meta tags - image URL, description fallback
 *
 * Usage:
 *   bun run scripts/scrape-more-enhanced.ts              # Process all events needing update
 *   bun run scripts/scrape-more-enhanced.ts --dry-run    # Preview only
 *   bun run scripts/scrape-more-enhanced.ts --limit 10   # Limit events
 *   bun run scripts/scrape-more-enhanced.ts --verbose    # Show detailed extraction info
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import puppeteer from 'puppeteer-core';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DELAY_MS = 2500;

// Extracted event data structure
interface MoreEventData {
  // Core data
  title: string | null;
  description: string | null;

  // Temporal
  startDate: string | null;      // ISO format or parsed
  endDate: string | null;
  startTime: string | null;      // HH:MM format

  // Venue
  venueName: string | null;
  venueAddress: string | null;

  // Pricing (from text extraction)
  price: number | null;
  priceRange: string | null;
  isFree: boolean;

  // Additional metadata
  organizer: string | null;
  imageUrl: string | null;

  // Extraction metadata
  dataSource: 'json-ld' | 'meta' | 'text' | 'combined';
  extractedFields: string[];
}

interface ScrapeResult {
  finalUrl: string;
  isValid: boolean;
  data: MoreEventData | null;
  error?: string;
}

/**
 * Convert viva.gr URL to more.com
 */
function vivaToMore(url: string): string {
  return url.replace(/viva\.gr/g, 'more.com');
}

/**
 * Parse Greek date format like "14/2/2026 10:00:00 μμ" to ISO
 */
function parseGreekDate(dateStr: string): { date: string | null; time: string | null } {
  if (!dateStr) return { date: null, time: null };

  // Format: "14/2/2026 10:00:00 μμ" or "4/2/2026 8:00:00 μμ"
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(μμ|πμ)?/i);
  if (!match) return { date: null, time: null };

  const [, day, month, year, hours, minutes, , ampm] = match;
  let hour = parseInt(hours);

  // Convert to 24-hour format
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
 * Sanitize malformed JSON (fix unescaped quotes in string values)
 */
function sanitizeJson(jsonStr: string): string {
  // Fix unescaped quotes inside string values
  // This handles cases like: "name": "Unwound "SCAM' Παρουσίαση"
  return jsonStr.replace(
    /"([^"]+)":\s*"([^"]*?)"/g,
    (match, key, value) => {
      // If value contains unescaped quotes, escape them
      const sanitizedValue = value.replace(/(?<!\\)"/g, '\\"');
      return `"${key}": "${sanitizedValue}"`;
    }
  );
}

/**
 * Extract JSON-LD data from page
 */
async function extractJsonLd(page: puppeteer.Page): Promise<Partial<MoreEventData>> {
  const data = await page.evaluate(() => {
    // Helper to sanitize JSON inside browser context
    function sanitize(str: string): string {
      // More aggressive fix: replace problematic patterns
      // Find string values and escape internal quotes
      let result = str;
      // Fix common pattern: unescaped quotes after colon-space-quote
      result = result.replace(/:\s*"([^"]*)"([^,}\]]*)"([^,}\]]*)"/g, (m, p1, p2, p3) => {
        return `: "${p1}${p2}${p3}"`;
      });
      return result;
    }

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const raw = script.textContent || '';

      // Try parsing as-is first
      try {
        const json = JSON.parse(raw);
        if (json['@type'] === 'Event') {
          return json;
        }
        if (json['@graph']) {
          for (const item of json['@graph']) {
            if (item['@type'] === 'Event') {
              return item;
            }
          }
        }
      } catch (e) {
        // Try with sanitization - extract key fields via regex
        try {
          // Extract startDate directly via regex as fallback
          // Handle both single values and arrays: "startDate":"..." or "startDate":["...","..."]
          const startDateMatch = raw.match(/"startDate"\s*:\s*\[?"([^"]+)"/);
          const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)/);

          if (startDateMatch || nameMatch) {
            return {
              '@type': 'Event',
              name: nameMatch ? nameMatch[1] : null,
              startDate: startDateMatch ? [startDateMatch[1]] : null,
              _recovered: true
            };
          }
        } catch (e2) {
          // Give up on this script
        }
      }
    }
    return null;
  });

  if (!data) return {};

  const result: Partial<MoreEventData> = {
    dataSource: 'json-ld',
    extractedFields: []
  };

  // Extract name
  if (data.name) {
    result.title = data.name;
    result.extractedFields?.push('title');
  }

  // Extract description
  if (data.description) {
    result.description = data.description;
    result.extractedFields?.push('description');
  }

  // Extract dates - handle array format
  if (data.startDate) {
    const dateStr = Array.isArray(data.startDate) ? data.startDate[0] : data.startDate;
    const parsed = parseGreekDate(dateStr);
    if (parsed.date) {
      result.startDate = parsed.date;
      result.extractedFields?.push('startDate');
    }
    if (parsed.time) {
      result.startTime = parsed.time;
      result.extractedFields?.push('startTime');
    }
  }

  if (data.endDate) {
    const dateStr = Array.isArray(data.endDate) ? data.endDate[0] : data.endDate;
    const parsed = parseGreekDate(dateStr);
    if (parsed.date) {
      result.endDate = parsed.date;
      result.extractedFields?.push('endDate');
    }
  }

  // Extract location
  if (data.location) {
    if (data.location.name) {
      result.venueName = data.location.name;
      result.extractedFields?.push('venueName');
    }
    if (data.location.address) {
      // Can be string or PostalAddress object
      result.venueAddress = typeof data.location.address === 'string'
        ? data.location.address
        : data.location.address.streetAddress || data.location.address.addressLocality || null;
      if (result.venueAddress) {
        result.extractedFields?.push('venueAddress');
      }
    }
  }

  // Extract organizer
  if (data.organizer?.name) {
    result.organizer = data.organizer.name;
    result.extractedFields?.push('organizer');
  }

  // Extract image
  if (data.image) {
    let imageUrl = Array.isArray(data.image) ? data.image[0] : data.image;
    // Ensure full URL
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = 'https://' + imageUrl;
    }
    result.imageUrl = imageUrl;
    result.extractedFields?.push('imageUrl');
  }

  return result;
}

/**
 * Extract meta tags data
 */
async function extractMetaTags(page: puppeteer.Page): Promise<Partial<MoreEventData>> {
  return page.evaluate(() => {
    const result: any = {
      extractedFields: []
    };

    // OG Image
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      result.imageUrl = ogImage.getAttribute('content');
      result.extractedFields.push('imageUrl');
    }

    // OG Description
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      result.description = ogDesc.getAttribute('content');
      result.extractedFields.push('description');
    }

    // OG Title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      result.title = ogTitle.getAttribute('content')?.replace(' | Εισιτήρια online! | More.com', '');
      result.extractedFields.push('title');
    }

    return result;
  });
}

/**
 * Extract price from page text
 */
async function extractPrice(page: puppeteer.Page): Promise<Partial<MoreEventData>> {
  const pageText = await page.evaluate(() => document.body.innerText);

  const result: Partial<MoreEventData> = {
    price: null,
    priceRange: null,
    isFree: false,
    extractedFields: []
  };

  // Check for free events
  const lowerText = pageText.toLowerCase();
  if (lowerText.includes('δωρεάν') || lowerText.includes('ελεύθερη είσοδος') || lowerText.includes('free entry')) {
    result.price = 0;
    result.priceRange = 'Δωρεάν';
    result.isFree = true;
    result.extractedFields?.push('price', 'isFree');
    return result;
  }

  // Look for "από XX€" pattern first (most reliable)
  const apoMatch = pageText.match(/από\s*(\d+(?:[.,]\d{2})?)\s*€/i);
  if (apoMatch) {
    const price = parseFloat(apoMatch[1].replace(',', '.'));
    if (price >= 5 && price < 500) {
      result.price = price;
      result.priceRange = `από €${price}`;
      result.extractedFields?.push('price');
      return result;
    }
  }

  // Fallback: Look for any "XX€" pattern
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

    result.price = minPrice;
    result.priceRange = minPrice !== maxPrice ? `€${minPrice}-€${maxPrice}` : `€${minPrice}`;
    result.extractedFields?.push('price');
  }

  return result;
}

/**
 * Scrape a single event page with all extraction strategies
 */
async function scrapeEvent(url: string, page: puppeteer.Page, verbose: boolean): Promise<ScrapeResult> {
  const moreUrl = vivaToMore(url);

  try {
    await page.goto(moreUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 2000));

    const finalUrl = page.url();

    // Check if redirected to homepage
    if (finalUrl.match(/more\.com\/gr-el\/?$/)) {
      return {
        finalUrl,
        isValid: false,
        data: null,
        error: 'Redirected to homepage - event not found'
      };
    }

    // Extract data from all sources
    const jsonLdData = await extractJsonLd(page);
    const metaData = await extractMetaTags(page);
    const priceData = await extractPrice(page);

    // Combine data with priority: JSON-LD > Meta > Text
    const combinedData: MoreEventData = {
      title: jsonLdData.title || metaData.title || null,
      description: jsonLdData.description || metaData.description || null,
      startDate: jsonLdData.startDate || null,
      endDate: jsonLdData.endDate || null,
      startTime: jsonLdData.startTime || null,
      venueName: jsonLdData.venueName || null,
      venueAddress: jsonLdData.venueAddress || null,
      price: priceData.price ?? null,
      priceRange: priceData.priceRange || null,
      isFree: priceData.isFree || false,
      organizer: jsonLdData.organizer || null,
      imageUrl: jsonLdData.imageUrl || metaData.imageUrl || null,
      dataSource: 'combined',
      extractedFields: [
        ...(jsonLdData.extractedFields || []),
        ...(metaData.extractedFields || []).filter(f => !jsonLdData.extractedFields?.includes(f)),
        ...(priceData.extractedFields || []).filter(f => !jsonLdData.extractedFields?.includes(f) && !metaData.extractedFields?.includes(f))
      ]
    };

    if (verbose) {
      console.log(`   JSON-LD fields: ${jsonLdData.extractedFields?.join(', ') || 'none'}`);
      console.log(`   Meta fields: ${metaData.extractedFields?.join(', ') || 'none'}`);
      console.log(`   Price extracted: ${priceData.price !== null ? `€${priceData.price}` : 'no'}`);
    }

    return {
      finalUrl,
      isValid: true,
      data: combinedData
    };

  } catch (e: any) {
    return {
      finalUrl: moreUrl,
      isValid: false,
      data: null,
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

  console.log('🚀 Enhanced More.com Scraper\n');
  console.log('Extraction Strategy: JSON-LD + Meta Tags + Text Price\n');
  if (dryRun) console.log('📋 DRY RUN MODE\n');

  const db = new Database(DB_PATH);

  // Get events that need processing
  let query = `
    SELECT id, title, url, price_amount, venue_name, start_date
    FROM events
    WHERE url IS NOT NULL
      AND url != ''
      AND (url LIKE '%more.com%' OR url LIKE '%viva.gr%')
      AND url NOT LIKE '%clubber.gr%'
      AND (
        price_amount IS NULL
        OR price_amount = 0
        OR time_doors IS NULL
      )
    ORDER BY start_date ASC
  `;

  if (limit > 0) query += ` LIMIT ${limit}`;

  const events = db.prepare(query).all() as Array<{
    id: string;
    title: string;
    url: string;
    price_amount: number | null;
    venue_name: string;
    start_date: string;
  }>;

  console.log(`📊 Found ${events.length} events to process\n`);

  if (events.length === 0) {
    console.log('✅ Nothing to process!');
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
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Prepare update statements
  const updateFullStmt = db.prepare(`
    UPDATE events
    SET url = $url,
        price_amount = $price,
        price_range = $range,
        venue_name = COALESCE($venue, venue_name),
        venue_address = COALESCE($address, venue_address),
        time_doors = COALESCE($startTime, time_doors),
        time_source = CASE WHEN $startTime IS NOT NULL THEN 'scraped_listing' ELSE time_source END,
        updated_at = $updated
    WHERE id = $id
  `);

  const updateUrlOnlyStmt = db.prepare(`
    UPDATE events
    SET url = $url, updated_at = $updated
    WHERE id = $id
  `);

  // Statistics
  let priceExtracted = 0;
  let venueUpdated = 0;
  let invalid = 0;
  let failed = 0;
  let jsonLdUsed = 0;
  let textOnlyUsed = 0;

  try {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const progress = `[${i + 1}/${events.length}]`;

      console.log(`${progress} ${event.title.substring(0, 50)}...`);

      if (i > 0) await new Promise(r => setTimeout(r, DELAY_MS));

      const result = await scrapeEvent(event.url, page, verbose);

      if (!result.isValid) {
        console.log(`   ❌ INVALID: ${result.error}`);
        invalid++;
        continue;
      }

      const data = result.data!;

      // Determine what we extracted
      const hasJsonLdFields = data.extractedFields.some(f => ['venueName', 'startDate', 'description'].includes(f));
      if (hasJsonLdFields) {
        jsonLdUsed++;
      } else {
        textOnlyUsed++;
      }

      // Log extraction results
      if (data.price !== null) {
        console.log(`   ✅ Price: €${data.price} ${data.isFree ? '(FREE)' : `(${data.priceRange})`}`);
        priceExtracted++;
      } else {
        console.log(`   ⚠️  No price found`);
        failed++;
      }

      if (data.venueName && data.venueName !== event.venue_name) {
        console.log(`   📍 Venue: ${data.venueName}`);
        venueUpdated++;
      }

      if (verbose && data.startDate) {
        console.log(`   📅 Date from JSON-LD: ${data.startDate} ${data.startTime || ''}`);
      }

      // Update database
      if (!dryRun) {
        if (data.price !== null || data.venueName || data.startTime) {
          updateFullStmt.run({
            $id: event.id,
            $url: result.finalUrl,
            $price: data.price,
            $range: data.priceRange,
            $venue: data.venueName,
            $address: data.venueAddress,
            $startTime: data.startTime,
            $updated: new Date().toISOString()
          });
        } else if (result.finalUrl !== event.url) {
          updateUrlOnlyStmt.run({
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
  console.log('='.repeat(60));
  console.log('📊 EXTRACTION RESULTS:');
  console.log('='.repeat(60));
  console.log(`   ✅ Price extracted: ${priceExtracted}/${events.length} (${Math.round(priceExtracted/events.length*100)}%)`);
  console.log(`   📍 Venue updated: ${venueUpdated}`);
  console.log(`   ❌ Invalid (redirect): ${invalid}`);
  console.log(`   ⚠️  No price found: ${failed}`);
  console.log('');
  console.log('📈 DATA SOURCE BREAKDOWN:');
  console.log(`   JSON-LD + text: ${jsonLdUsed}`);
  console.log(`   Text only: ${textOnlyUsed}`);
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes made');
  } else {
    console.log('\n🔄 NEXT: bun run build && netlify deploy --prod --dir=dist');
  }
}

main().catch(console.error);
