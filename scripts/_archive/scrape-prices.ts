#!/usr/bin/env bun
/**
 * Scrape prices from event URLs
 *
 * Uses Puppeteer for JavaScript-heavy sites (viva.gr, more.com)
 * Uses simple fetch for static sites (megaron.gr, athinorama.gr)
 *
 * Usage:
 *   bun run scripts/scrape-prices.ts              # Scrape all missing prices
 *   bun run scripts/scrape-prices.ts --limit 10   # Limit to 10 events
 *   bun run scripts/scrape-prices.ts --dry-run    # Preview without updating
 *   bun run scripts/scrape-prices.ts --rescrape   # Re-scrape events with €14 price (viva.gr bug fix)
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import puppeteer from 'puppeteer-core';
import * as cheerio from 'cheerio';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Rate limiting
const DELAY_MS = 2000; // 2 seconds between requests

interface PriceResult {
  amount: number | null;
  range: string | null;
  success: boolean;
  error?: string;
}

/**
 * Convert viva.gr URL to more.com URL (viva.gr redirects to more.com)
 */
function convertVivaToMore(url: string): string {
  if (url.includes('viva.gr')) {
    return url.replace('www.viva.gr', 'www.more.com').replace('viva.gr', 'www.more.com');
  }
  return url;
}

/**
 * Extract price from more.com page text
 * Looks for "από XX€" pattern which indicates starting ticket price
 */
function extractMoreComPrice(pageText: string): PriceResult {
  // Check for free
  const lower = pageText.toLowerCase();
  if (lower.includes('δωρεάν') || lower.includes('free') || lower.includes('ελεύθερη είσοδος')) {
    return { amount: 0, range: 'Δωρεάν', success: true };
  }

  // Look for "από XX€" pattern (starting price) - this is the main ticket price indicator
  const apoMatch = pageText.match(/από\s*(\d+(?:[.,]\d{2})?)\s*€/i);
  if (apoMatch) {
    const amount = parseFloat(apoMatch[1].replace(',', '.'));
    if (amount >= 5 && amount < 500) { // Reasonable ticket price range
      return { amount, range: `από €${amount}`, success: true };
    }
  }

  // Look for standalone price mentions in format "XX€" where XX is reasonable (not phone/date)
  // Collect all prices and find the most reasonable one for a ticket
  const priceMatches = pageText.match(/(?<!\d)(\d{2,3})€(?!\d)/g) || [];
  const validPrices: number[] = [];

  for (const match of priceMatches) {
    const price = parseInt(match.replace('€', ''));
    // Filter: valid ticket prices are typically 10-300, not phone numbers or dates
    if (price >= 10 && price <= 300) {
      validPrices.push(price);
    }
  }

  // If we found valid prices, use the lowest (starting price)
  if (validPrices.length > 0) {
    const minPrice = Math.min(...validPrices);
    const maxPrice = Math.max(...validPrices);
    if (minPrice !== maxPrice && maxPrice < minPrice * 5) {
      return { amount: minPrice, range: `€${minPrice}-€${maxPrice}`, success: true };
    }
    return { amount: minPrice, range: `€${minPrice}`, success: true };
  }

  return { amount: null, range: null, success: false };
}

/**
 * Parse price from text string (generic)
 */
function parsePrice(text: string): PriceResult {
  if (!text) return { amount: null, range: null, success: false };

  // Check for free
  const lower = text.toLowerCase();
  if (lower.includes('δωρεάν') || lower.includes('free') || lower.includes('ελεύθερη είσοδος')) {
    return { amount: 0, range: 'Δωρεάν', success: true };
  }

  // Try various patterns
  const patterns = [
    // από XX€ (from) - prioritize this for Greek sites
    { regex: /(?:από|from|starting)\s*(\d+(?:[.,]\d{2})?)\s*€/i, handler: (m: RegExpMatchArray) => parseFloat(m[1].replace(',', '.')) },
    // €XX.XX or €XX (with optional space)
    { regex: /€\s*(\d+(?:[.,]\d{2})?)/, handler: (m: RegExpMatchArray) => parseFloat(m[1].replace(',', '.')) },
    // XX€ or XX.XX€
    { regex: /(\d+(?:[.,]\d{2})?)\s*€/, handler: (m: RegExpMatchArray) => parseFloat(m[1].replace(',', '.')) },
    // XX EUR or XX ευρώ
    { regex: /(\d+(?:[.,]\d{2})?)\s*(?:EUR|ευρώ)/i, handler: (m: RegExpMatchArray) => parseFloat(m[1].replace(',', '.')) },
  ];

  for (const { regex, handler } of patterns) {
    const match = text.match(regex);
    if (match) {
      const amount = handler(match);
      if (amount >= 0 && amount < 2000) { // Sanity check
        return { amount, range: `€${amount}`, success: true };
      }
    }
  }

  // Try range pattern: €15-€25 or 15€-25€ or 15-25€
  const rangeMatch = text.match(/€?\s*(\d+)\s*[-–]\s*€?\s*(\d+)\s*€?/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]);
    const max = parseInt(rangeMatch[2]);
    if (min > 0 && max > min && max < 2000) {
      return { amount: min, range: `€${min}-€${max}`, success: true };
    }
  }

  return { amount: null, range: null, success: false };
}

/**
 * Extract price from page content using various selectors
 */
function extractPriceFromHtml($: cheerio.CheerioAPI, source: string): PriceResult {
  // Site-specific selectors
  const selectorsBySource: Record<string, string[]> = {
    'viva.gr': [
      '.ticket-price', '.price', '.cost', '.amount',
      '[class*="price"]', '[class*="ticket"]',
      '.event-details', '.ticket-info',
    ],
    'more.com': [
      '.ticket-price', '.price', '.cost',
      '[class*="price"]', '.event-price',
    ],
    'athinorama.gr': [
      '.event-price', '.price-info', '.ticket-info',
      '[class*="price"]',
    ],
    'megaron.gr': [
      '.ticket-price', '.price', '[class*="price"]',
      '.event-info', '.ticket-category',
    ],
  };

  const selectors = selectorsBySource[source] || ['.price', '[class*="price"]'];

  // Try each selector
  for (const selector of selectors) {
    const elements = $(selector);
    elements.each((_, el) => {
      const text = $(el).text();
      const result = parsePrice(text);
      if (result.success && result.amount !== null) {
        return result;
      }
    });
  }

  // Fallback: search entire body text
  const bodyText = $('body').text();
  return parsePrice(bodyText);
}

/**
 * Fetch price using Puppeteer (for JavaScript sites like more.com)
 */
async function fetchPriceWithPuppeteer(url: string, browser: puppeteer.Browser): Promise<PriceResult> {
  let page: puppeteer.Page | null = null;

  // Convert viva.gr URLs to more.com (viva.gr redirects there anyway)
  const actualUrl = convertVivaToMore(url);

  try {
    page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // Navigate with timeout
    await page.goto(actualUrl, { waitUntil: 'networkidle2', timeout: 20000 });

    // Wait for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if we got redirected to homepage (event doesn't exist)
    const finalUrl = page.url();
    if (finalUrl.endsWith('/gr-el/') || finalUrl.endsWith('/gr-el')) {
      return { amount: null, range: null, success: false, error: 'Event page not found (redirected to homepage)' };
    }

    // For more.com, use the specialized price extractor
    if (actualUrl.includes('more.com')) {
      const pageText = await page.evaluate(() => document.body.innerText);
      const result = extractMoreComPrice(pageText);
      if (result.success) return result;
    }

    // Fallback: try generic extraction from HTML
    const html = await page.content();
    const $ = cheerio.load(html);

    // Determine source
    let source = 'unknown';
    if (actualUrl.includes('more.com') || url.includes('viva.gr')) source = 'more.com';
    else if (actualUrl.includes('athinorama.gr')) source = 'athinorama.gr';
    else if (actualUrl.includes('megaron.gr')) source = 'megaron.gr';

    // Try to find price from HTML
    const result = extractPriceFromHtml($, source);

    // Also try to get price from the page directly via JS
    if (!result.success) {
      const pageText = await page.evaluate(() => document.body.innerText);
      const textResult = parsePrice(pageText);
      if (textResult.success) return textResult;
    }

    return result;

  } catch (e: any) {
    return { amount: null, range: null, success: false, error: e.message };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Fetch price using simple HTTP (for static sites)
 */
async function fetchPriceSimple(url: string): Promise<PriceResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'el,en;q=0.9',
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { amount: null, range: null, success: false, error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Determine source
    let source = 'unknown';
    if (url.includes('megaron.gr')) source = 'megaron.gr';
    else if (url.includes('athinorama.gr')) source = 'athinorama.gr';

    return extractPriceFromHtml($, source);

  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { amount: null, range: null, success: false, error: 'Timeout' };
    }
    return { amount: null, range: null, success: false, error: e.message };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rescrape = args.includes('--rescrape');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 0;

  console.log('💰 Agent Athens - Price Scraper\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No database updates\n');
  }

  if (rescrape) {
    console.log('🔄 RESCRAPE MODE - Re-scraping events with €14 price (viva.gr fix)\n');
  }

  const db = new Database(DB_PATH);

  // Get events to scrape
  let query: string;

  if (rescrape) {
    // Re-scrape events with price_amount = 14 and viva.gr URLs (these were incorrectly scraped)
    query = `
      SELECT id, title, url, source, price_amount
      FROM events
      WHERE url IS NOT NULL
        AND url != ''
        AND price_amount = 14
        AND url LIKE '%viva.gr%'
      ORDER BY start_date ASC
    `;
  } else {
    // Get events with URLs but no price (excluding clubber.gr which doesn't show prices)
    query = `
      SELECT id, title, url, source, price_amount
      FROM events
      WHERE url IS NOT NULL
        AND url != ''
        AND (price_amount IS NULL OR price_amount = 0)
        AND url NOT LIKE '%clubber.gr%'
      ORDER BY start_date ASC
    `;
  }

  if (limit > 0) {
    query += ` LIMIT ${limit}`;
  }

  const events = db.prepare(query).all() as Array<{
    id: string;
    title: string;
    url: string;
    source: string;
    price_amount: number | null;
  }>;

  console.log(`📊 Found ${events.length} events to scrape\n`);

  if (events.length === 0) {
    console.log('✅ All events already have prices!');
    db.close();
    return;
  }

  // Check which sites need browser
  const needsBrowser = events.some(e =>
    e.url.includes('viva.gr') || e.url.includes('more.com')
  );

  let browser: puppeteer.Browser | null = null;

  if (needsBrowser) {
    console.log('🌐 Starting browser for JavaScript-heavy sites...\n');
    try {
      browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (e) {
      console.error('❌ Failed to start browser:', e);
      console.log('   Falling back to simple HTTP requests\n');
    }
  }

  let updated = 0;
  let failed = 0;

  const updateStmt = db.prepare(`
    UPDATE events
    SET price_amount = $amount, price_range = $range, updated_at = $updated_at
    WHERE id = $id
  `);

  try {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const progress = `[${i + 1}/${events.length}]`;

      console.log(`${progress} ${event.title.substring(0, 50)}...`);
      console.log(`         URL: ${event.url}`);

      // Rate limiting
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }

      let result: PriceResult;

      // Use browser for viva.gr/more.com, simple fetch for others
      if ((event.url.includes('viva.gr') || event.url.includes('more.com')) && browser) {
        result = await fetchPriceWithPuppeteer(event.url, browser);
      } else {
        result = await fetchPriceSimple(event.url);
      }

      if (result.success && result.amount !== null) {
        console.log(`         ✅ Price: €${result.amount}${result.range ? ` (${result.range})` : ''}`);

        if (!dryRun) {
          updateStmt.run({
            $id: event.id,
            $amount: result.amount,
            $range: result.range,
            $updated_at: new Date().toISOString()
          });
        }
        updated++;
      } else {
        console.log(`         ❌ ${result.error || 'No price found'}`);
        failed++;
      }

      console.log('');
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  db.close();

  console.log('='.repeat(60));
  console.log('📊 PRICE SCRAPING RESULTS:');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes were made');
    console.log('   Run without --dry-run to update database');
  } else if (updated > 0) {
    console.log('\n🔄 NEXT STEP:');
    console.log('   bun run build    # Rebuild site');
    console.log('   netlify deploy --prod --dir=dist');
  }
}

main().catch(console.error);
