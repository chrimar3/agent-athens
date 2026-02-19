#!/usr/bin/env bun
/**
 * Search Ticket URLs
 *
 * Uses web search to find direct ticket purchase URLs for athinorama events.
 * Search pattern: "{show title}" {venue} εισιτήρια
 *
 * Usage:
 *   bun run scripts/search-ticket-urls.ts [--dry-run] [--limit N] [--verbose]
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');

// Ticket seller domains we trust
const TICKET_DOMAINS = [
  'ticketservices.gr',
  'more.com',
  'viva.gr',
  'tickets.in.gr',
  'megaron.gr',
  'snfcc.org',
  'onassis.org',
  'benaki.org',
  'theathenstickets.com',
  'ticket-center.gr',
  'public.gr/tickets',
  'plaisio.gr/tickets',
];

interface EventRow {
  id: string;
  title: string;
  venue_name: string;
  start_date: string;
  url: string | null;
  ticket_url: string | null;
}

interface SearchResult {
  title: string;
  url: string;
  description?: string;
}

/**
 * Clean title for search query
 * Remove common suffixes, extra punctuation
 */
function cleanTitle(title: string): string {
  return title
    // Remove common promotional suffixes
    .replace(/\s*[-–]\s*(SOLD OUT|sold out|εξαντλήθηκαν|ΕΞΑΝΤΛΗΘΗΚΑΝ).*$/i, '')
    .replace(/\s*[-–]\s*(NEW|νέο|ΝΕΟ).*$/i, '')
    .replace(/\s*[-–]\s*(PREMIERE|πρεμιέρα|ΠΡΕΜΙΕΡΑ).*$/i, '')
    // Remove venue name if it's in the title
    .replace(/\s*@\s*.*$/, '')
    .replace(/\s*\|\s*.*$/, '')
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build search query for finding tickets
 */
function buildSearchQuery(title: string, venueName: string): string {
  const cleanedTitle = cleanTitle(title);
  // Quote the title for exact match, add venue and εισιτήρια
  return `"${cleanedTitle}" ${venueName} εισιτήρια`;
}

/**
 * Extract ticket URL from search results
 * Returns the first matching ticket seller URL
 */
function extractTicketUrl(results: SearchResult[]): string | null {
  for (const result of results) {
    const url = result.url.toLowerCase();
    for (const domain of TICKET_DOMAINS) {
      if (url.includes(domain)) {
        return result.url;
      }
    }
  }
  return null;
}

/**
 * Search using DuckDuckGo (free, no API key needed)
 */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    // Parse DuckDuckGo HTML results
    // Links are in <a class="result__a" href="...">
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</g;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1];
      const title = match[2];

      // DuckDuckGo uses redirect URLs, extract the actual URL
      if (href.includes('uddg=')) {
        const uddgMatch = href.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          href = decodeURIComponent(uddgMatch[1]);
        }
      }

      results.push({ url: href, title });
    }

    return results;
  } catch (error) {
    return [];
  }
}

/**
 * Combined search: use DuckDuckGo with ticket-focused query
 */
async function webSearch(query: string, title: string): Promise<SearchResult[]> {
  // Extract just the event name for searching
  const cleanedTitle = cleanTitle(title);

  // Search DuckDuckGo for tickets
  const ticketQuery = `${cleanedTitle} εισιτήρια site:more.com OR site:ticketservices.gr OR site:viva.gr`;
  return await searchDuckDuckGo(ticketQuery);
}

/**
 * Delay between requests to be polite
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

  console.log('🔍 Search Ticket URLs');
  console.log('─'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit} events`);
  console.log('');

  const db = new Database(DB_PATH);

  // Get athinorama events without ticket URLs
  const events = db.query<EventRow, []>(`
    SELECT id, title, venue_name, start_date, url, ticket_url
    FROM events
    WHERE source = 'athinorama.gr'
      AND start_date >= date('now')
      AND (ticket_url IS NULL OR ticket_url = '' OR ticket_url LIKE '%athinorama%')
    ORDER BY start_date ASC
    LIMIT ${limit}
  `).all();

  console.log(`Found ${events.length} events to search`);
  console.log('');

  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const query = buildSearchQuery(event.title, event.venue_name);

    if (verbose) {
      console.log(`[${i + 1}/${events.length}] ${event.title.substring(0, 40)}...`);
      console.log(`   Query: ${query}`);
    }

    try {
      const results = await webSearch(query, event.title);
      const ticketUrl = extractTicketUrl(results);

      if (ticketUrl) {
        found++;
        if (verbose) {
          console.log(`   ✅ Found: ${ticketUrl}`);
        }

        if (!dryRun) {
          db.run(`
            UPDATE events
            SET ticket_url = ?
            WHERE id = ?
          `, [ticketUrl, event.id]);
        }
      } else {
        notFound++;
        if (verbose) {
          console.log(`   ❌ No ticket URL found`);
          if (results.length > 0) {
            console.log(`   Top results:`);
            results.slice(0, 3).forEach(r => {
              console.log(`      - ${r.url}`);
            });
          }
        }
      }
    } catch (error) {
      errors++;
      if (verbose) {
        console.log(`   ⚠️ Error: ${error}`);
      }
    }

    // Be polite - wait between requests (longer to avoid rate limiting)
    if (i < events.length - 1) {
      await delay(3000);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Results:');
  console.log(`  ✅ Found: ${found}`);
  console.log(`  ❌ Not found: ${notFound}`);
  console.log(`  ⚠️ Errors: ${errors}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - no changes saved');
  } else {
    console.log(`\n✅ Updated ${found} events with ticket URLs`);
  }

  // Show current coverage
  const coverage = db.query<{ has_ticket: number; total: number }, []>(`
    SELECT
      SUM(CASE WHEN ticket_url IS NOT NULL AND ticket_url <> '' AND ticket_url NOT LIKE '%athinorama%' THEN 1 ELSE 0 END) as has_ticket,
      COUNT(*) as total
    FROM events
    WHERE start_date >= date('now')
  `).get();

  if (coverage) {
    const pct = (coverage.has_ticket / coverage.total * 100).toFixed(1);
    console.log(`\n📊 Current coverage: ${coverage.has_ticket}/${coverage.total} (${pct}%)`);
  }

  db.close();
}

main().catch(console.error);
