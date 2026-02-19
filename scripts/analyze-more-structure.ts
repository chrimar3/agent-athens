#!/usr/bin/env bun
/**
 * Analyze More.com Page Structure
 *
 * Research script to inspect what structured data is available on more.com event pages:
 * - JSON-LD (Schema.org Event) embedded in <script type="application/ld+json">
 * - __NEXT_DATA__ (Next.js hydration data)
 * - Meta tags (og:*, twitter:*, etc.)
 * - Network API calls (XHR/fetch interception)
 *
 * Usage:
 *   bun run scripts/analyze-more-structure.ts --url "https://www.more.com/gr-el/tickets/music/clutch-2026/"
 *   bun run scripts/analyze-more-structure.ts --sample        # Analyze 3 random events from DB
 *   bun run scripts/analyze-more-structure.ts --list          # List available more.com URLs in DB
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import puppeteer from 'puppeteer-core';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface AnalysisResult {
  url: string;
  finalUrl: string;
  status: 'success' | 'redirect' | 'error';
  jsonLd: any[] | null;
  nextData: any | null;
  metaTags: Record<string, string>;
  apiCalls: string[];
  priceFromJsonLd: number | null;
  priceFromText: number | null;
  error?: string;
}

/**
 * Convert viva.gr URL to more.com
 */
function vivaToMore(url: string): string {
  return url.replace(/viva\.gr/g, 'more.com');
}

/**
 * Analyze a single more.com event page
 */
async function analyzePage(url: string, browser: puppeteer.Browser): Promise<AnalysisResult> {
  const moreUrl = vivaToMore(url);
  const apiCalls: string[] = [];

  const result: AnalysisResult = {
    url: moreUrl,
    finalUrl: '',
    status: 'success',
    jsonLd: null,
    nextData: null,
    metaTags: {},
    apiCalls: [],
    priceFromJsonLd: null,
    priceFromText: null
  };

  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set up request interception to capture API calls
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const reqUrl = request.url();

      // Capture potential API calls
      if (reqUrl.includes('/api/') ||
          reqUrl.includes('graphql') ||
          reqUrl.includes('.json') ||
          (reqUrl.includes('more.com') && request.resourceType() === 'xhr')) {
        apiCalls.push(reqUrl);
      }

      request.continue();
    });

    // Navigate to page
    await page.goto(moreUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    result.finalUrl = page.url();

    // Check if redirected to homepage
    if (result.finalUrl.match(/more\.com\/gr-el\/?$/)) {
      result.status = 'redirect';
      result.error = 'Redirected to homepage - event not found';
      await page.close();
      return result;
    }

    // Extract JSON-LD
    const jsonLdData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const results: any[] = [];
      scripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent || '');
          results.push(data);
        } catch (e) {
          // Invalid JSON, skip
        }
      });
      return results;
    });
    result.jsonLd = jsonLdData.length > 0 ? jsonLdData : null;

    // Extract __NEXT_DATA__
    const nextData = await page.evaluate(() => {
      const script = document.querySelector('script#__NEXT_DATA__');
      if (script) {
        try {
          return JSON.parse(script.textContent || '');
        } catch (e) {
          return null;
        }
      }
      return null;
    });
    result.nextData = nextData;

    // Extract meta tags
    const metaTags = await page.evaluate(() => {
      const tags: Record<string, string> = {};

      // Open Graph tags
      document.querySelectorAll('meta[property^="og:"]').forEach(meta => {
        tags[meta.getAttribute('property') || ''] = meta.getAttribute('content') || '';
      });

      // Twitter tags
      document.querySelectorAll('meta[name^="twitter:"]').forEach(meta => {
        tags[meta.getAttribute('name') || ''] = meta.getAttribute('content') || '';
      });

      // Standard meta tags
      ['description', 'keywords', 'author'].forEach(name => {
        const meta = document.querySelector(`meta[name="${name}"]`);
        if (meta) {
          tags[name] = meta.getAttribute('content') || '';
        }
      });

      // Title
      const title = document.querySelector('title');
      if (title) {
        tags['title'] = title.textContent || '';
      }

      return tags;
    });
    result.metaTags = metaTags;

    // Store captured API calls
    result.apiCalls = apiCalls;

    // Extract price from JSON-LD if present
    if (result.jsonLd) {
      for (const data of result.jsonLd) {
        // Handle @graph structure
        const items = data['@graph'] || [data];
        for (const item of items) {
          if (item['@type'] === 'Event' && item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
            for (const offer of offers) {
              if (offer.price !== undefined) {
                result.priceFromJsonLd = parseFloat(offer.price);
                break;
              }
              if (offer.lowPrice !== undefined) {
                result.priceFromJsonLd = parseFloat(offer.lowPrice);
                break;
              }
            }
          }
        }
      }
    }

    // Extract price from text (current method for comparison)
    const pageText = await page.evaluate(() => document.body.innerText);
    const apoMatch = pageText.match(/από\s*(\d+(?:[.,]\d{2})?)\s*€/i);
    if (apoMatch) {
      result.priceFromText = parseFloat(apoMatch[1].replace(',', '.'));
    } else {
      const priceMatch = pageText.match(/(?<!\d)(\d{2,3})€/);
      if (priceMatch) {
        const p = parseInt(priceMatch[1]);
        if (p >= 8 && p <= 300) {
          result.priceFromText = p;
        }
      }
    }

  } catch (e: any) {
    result.status = 'error';
    result.error = e.message;
  } finally {
    await page.close();
  }

  return result;
}

/**
 * Pretty print analysis results
 */
function printResults(result: AnalysisResult): void {
  console.log('\n' + '='.repeat(80));
  console.log(`URL: ${result.url}`);
  console.log(`Final URL: ${result.finalUrl}`);
  console.log(`Status: ${result.status}`);

  if (result.error) {
    console.log(`Error: ${result.error}`);
    return;
  }

  console.log('\n--- JSON-LD Data ---');
  if (result.jsonLd) {
    console.log(`Found ${result.jsonLd.length} JSON-LD block(s)`);
    result.jsonLd.forEach((data, i) => {
      console.log(`\nBlock ${i + 1}:`);
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
      if (JSON.stringify(data).length > 2000) {
        console.log('... (truncated)');
      }
    });
  } else {
    console.log('❌ No JSON-LD found');
  }

  console.log('\n--- __NEXT_DATA__ ---');
  if (result.nextData) {
    console.log('✅ Found __NEXT_DATA__');
    console.log(`Build ID: ${result.nextData.buildId || 'N/A'}`);
    console.log(`Page: ${result.nextData.page || 'N/A'}`);
    // Show keys at pageProps level
    if (result.nextData.props?.pageProps) {
      console.log(`PageProps keys: ${Object.keys(result.nextData.props.pageProps).join(', ')}`);
    }
    // Truncated output
    const preview = JSON.stringify(result.nextData, null, 2).substring(0, 1500);
    console.log(preview);
    if (JSON.stringify(result.nextData).length > 1500) {
      console.log('... (truncated - full data available)');
    }
  } else {
    console.log('❌ No __NEXT_DATA__ found (not a Next.js site)');
  }

  console.log('\n--- Meta Tags ---');
  if (Object.keys(result.metaTags).length > 0) {
    Object.entries(result.metaTags).forEach(([key, value]) => {
      console.log(`  ${key}: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
    });
  } else {
    console.log('❌ No meta tags found');
  }

  console.log('\n--- API Calls Intercepted ---');
  if (result.apiCalls.length > 0) {
    result.apiCalls.forEach(url => {
      console.log(`  ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
    });
  } else {
    console.log('No API calls captured');
  }

  console.log('\n--- Price Extraction Comparison ---');
  console.log(`  From JSON-LD: ${result.priceFromJsonLd !== null ? `€${result.priceFromJsonLd}` : '❌ Not found'}`);
  console.log(`  From Text: ${result.priceFromText !== null ? `€${result.priceFromText}` : '❌ Not found'}`);

  if (result.priceFromJsonLd !== null && result.priceFromText !== null) {
    if (result.priceFromJsonLd === result.priceFromText) {
      console.log('  ✅ Prices match!');
    } else {
      console.log(`  ⚠️ Prices differ (JSON-LD: ${result.priceFromJsonLd}, Text: ${result.priceFromText})`);
    }
  }

  console.log('='.repeat(80));
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const urlIdx = args.indexOf('--url');
  const singleUrl = urlIdx >= 0 ? args[urlIdx + 1] : null;
  const sample = args.includes('--sample');
  const list = args.includes('--list');

  console.log('🔍 More.com Page Structure Analyzer\n');

  // List mode: show available URLs
  if (list) {
    const db = new Database(DB_PATH);
    const events = db.prepare(`
      SELECT title, url
      FROM events
      WHERE url LIKE '%more.com%' OR url LIKE '%viva.gr%'
      ORDER BY start_date ASC
      LIMIT 20
    `).all() as Array<{ title: string; url: string }>;

    console.log(`Found ${events.length} more.com/viva.gr URLs:\n`);
    events.forEach((e, i) => {
      console.log(`${i + 1}. ${e.title.substring(0, 50)}...`);
      console.log(`   ${e.url}\n`);
    });

    db.close();
    return;
  }

  // Determine URLs to analyze
  let urls: string[] = [];

  if (singleUrl) {
    urls = [singleUrl];
  } else if (sample) {
    const db = new Database(DB_PATH);
    const events = db.prepare(`
      SELECT url
      FROM events
      WHERE (url LIKE '%more.com%' OR url LIKE '%viva.gr%')
        AND url NOT LIKE '%clubber%'
      ORDER BY RANDOM()
      LIMIT 3
    `).all() as Array<{ url: string }>;

    urls = events.map(e => e.url);
    db.close();

    console.log(`Analyzing ${urls.length} random sample events from database\n`);
  } else {
    console.log('Usage:');
    console.log('  bun run scripts/analyze-more-structure.ts --url "https://www.more.com/gr-el/tickets/music/..."');
    console.log('  bun run scripts/analyze-more-structure.ts --sample   # Analyze 3 random events');
    console.log('  bun run scripts/analyze-more-structure.ts --list     # List available URLs');
    return;
  }

  // Start browser
  console.log('🌐 Starting browser...\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    let jsonLdFound = 0;
    let nextDataFound = 0;
    let priceFromJsonLd = 0;
    let priceFromText = 0;

    for (const url of urls) {
      console.log(`Analyzing: ${url.substring(0, 60)}...`);
      const result = await analyzePage(url, browser);
      printResults(result);

      // Track statistics
      if (result.jsonLd) jsonLdFound++;
      if (result.nextData) nextDataFound++;
      if (result.priceFromJsonLd !== null) priceFromJsonLd++;
      if (result.priceFromText !== null) priceFromText++;

      // Small delay between pages
      if (urls.indexOf(url) < urls.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Summary
    if (urls.length > 1) {
      console.log('\n' + '='.repeat(80));
      console.log('📊 SUMMARY');
      console.log('='.repeat(80));
      console.log(`Total pages analyzed: ${urls.length}`);
      console.log(`JSON-LD found: ${jsonLdFound}/${urls.length} (${Math.round(jsonLdFound/urls.length*100)}%)`);
      console.log(`__NEXT_DATA__ found: ${nextDataFound}/${urls.length} (${Math.round(nextDataFound/urls.length*100)}%)`);
      console.log(`Price from JSON-LD: ${priceFromJsonLd}/${urls.length}`);
      console.log(`Price from text: ${priceFromText}/${urls.length}`);
      console.log('='.repeat(80));

      // Recommendations
      console.log('\n🎯 RECOMMENDATIONS:');
      if (jsonLdFound > 0) {
        console.log('✅ JSON-LD is available! Use Strategy 1 (JSON-LD extraction) as primary method.');
      } else {
        console.log('⚠️ JSON-LD not found. Try __NEXT_DATA__ or stick with text extraction.');
      }
      if (nextDataFound > 0) {
        console.log('✅ __NEXT_DATA__ is available! Can use as backup or for richer data.');
      }
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
