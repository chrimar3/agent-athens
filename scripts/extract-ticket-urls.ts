#!/usr/bin/env bun
/**
 * Extract Ticket URLs from Athinorama Pages
 *
 * Fetches athinorama.gr event pages and extracts the actual ticket purchase URLs
 * (more.com, viva.gr, ticketservices.gr, etc.) instead of keeping the listing URL.
 *
 * Usage:
 *   bun run scripts/extract-ticket-urls.ts [--limit N] [--dry-run] [--verbose]
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');

// Ticket seller domains to look for
const TICKET_DOMAINS = [
  'more.com',
  'viva.gr',
  'ticketservices.gr',
  'tickets.in.gr',
  'ticketmaster.gr',
  'eventbrite.com',
  'dice.fm',
];

// Regex to find ticket links in HTML
const TICKET_LINK_PATTERNS = [
  // Pattern 1: <a class="review-link" href="...">
  /<a[^>]*class="[^"]*review-link[^"]*"[^>]*href="([^"]+)"[^>]*>/gi,
  // Pattern 2: Any link with ticket domain
  /<a[^>]*href="(https?:\/\/[^"]*(?:more\.com|viva\.gr|ticketservices\.gr|tickets\.in\.gr|ticketmaster\.gr|eventbrite\.com|dice\.fm)[^"]*)"/gi,
  // Pattern 3: Link with "αγόρασε" or "εισιτήρια" nearby
  /href="(https?:\/\/[^"]+)"[^>]*>[^<]*(?:αγόρασε|εισιτήρι|tickets|buy)/gi,
];

interface EventRow {
  id: string;
  title: string;
  url: string;
  ticket_url: string | null;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'el,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch (error) {
    return null;
  }
}

function extractTicketUrl(html: string): string | null {
  // Try each pattern
  for (const pattern of TICKET_LINK_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1];

      // Check if URL contains a ticket domain
      if (TICKET_DOMAINS.some(domain => url.includes(domain))) {
        // Clean up the URL
        try {
          const parsed = new URL(url);
          // Return without tracking parameters
          return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        } catch {
          return url;
        }
      }
    }
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) || 50 : 50;

  console.log('🎫 Extract Ticket URLs from Athinorama');
  console.log('─'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit} events`);
  console.log('');

  const db = new Database(DB_PATH);

  // Get athinorama events that need ticket URL extraction
  const events = db.query<EventRow, []>(`
    SELECT id, title, url, ticket_url
    FROM events
    WHERE source = 'athinorama.gr'
      AND start_date >= date('now')
      AND url LIKE '%athinorama%'
      AND (ticket_url IS NULL OR ticket_url = '' OR ticket_url LIKE '%athinorama%')
    ORDER BY start_date
    LIMIT ${limit}
  `).all();

  console.log(`Found ${events.length} events to process\n`);

  let extracted = 0;
  let noTicketLink = 0;
  let errors = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const progress = `[${i + 1}/${events.length}]`;

    if (verbose) {
      console.log(`${progress} Processing: ${event.title.substring(0, 40)}...`);
    }

    // Fetch the athinorama page
    const html = await fetchPage(event.url);

    if (!html) {
      if (verbose) console.log(`  ❌ Failed to fetch page`);
      errors++;
      continue;
    }

    // Extract ticket URL
    const ticketUrl = extractTicketUrl(html);

    if (ticketUrl) {
      if (verbose) {
        console.log(`  ✅ Found: ${ticketUrl}`);
      } else {
        process.stdout.write('✅');
      }

      if (!dryRun) {
        db.run(`
          UPDATE events
          SET ticket_url = ?
          WHERE id = ?
        `, [ticketUrl, event.id]);
      }

      extracted++;
    } else {
      if (verbose) {
        console.log(`  ⏭️  No ticket link found (likely phone booking only)`);
      } else {
        process.stdout.write('·');
      }
      noTicketLink++;
    }

    // Rate limit: 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n');
  console.log('─'.repeat(50));
  console.log('Results:');
  console.log(`  ✅ Extracted ticket URLs: ${extracted}`);
  console.log(`  ⏭️  No ticket link (phone only): ${noTicketLink}`);
  console.log(`  ❌ Errors: ${errors}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - no changes saved');
  } else {
    console.log(`\n✅ Updated ${extracted} events with ticket URLs`);
  }

  db.close();
}

main().catch(console.error);
