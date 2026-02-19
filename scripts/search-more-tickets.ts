#!/usr/bin/env bun
/**
 * Search More.com for Ticket URLs
 *
 * For events without embedded ticket links, searches more.com
 * by show title to find the ticket page.
 *
 * Usage:
 *   bun run scripts/search-more-tickets.ts [--limit N] [--dry-run] [--verbose]
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');

interface EventRow {
  id: string;
  title: string;
  url: string;
  ticket_url: string | null;
  type: string;
}

/**
 * Normalize Greek text for search
 */
function normalizeGreek(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-zα-ω0-9\s]/g, ' ') // Keep only letters and numbers
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create a more.com search URL slug from title
 */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zα-ω0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

/**
 * Search more.com for a show and return the ticket URL if found
 */
async function searchMoreCom(title: string, type: string): Promise<string | null> {
  // Construct search URL
  const searchQuery = encodeURIComponent(title);
  const searchUrl = `https://www.more.com/gr-el/search?q=${searchQuery}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(searchUrl, {
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

    const html = await response.text();

    // Look for event links in search results
    // Pattern: <a href="/gr-el/tickets/theater/show-name" or similar
    const linkPattern = /<a[^>]*href="(\/gr-el\/tickets\/[^"]+)"[^>]*>/gi;
    const matches = [...html.matchAll(linkPattern)];

    if (matches.length === 0) {
      return null;
    }

    // Normalize the search title for comparison
    const normalizedTitle = normalizeGreek(title);

    // Find the best matching result
    for (const match of matches) {
      const path = match[1];

      // Extract the slug from the path
      const pathParts = path.split('/');
      const slug = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

      // Check if slug is similar to title
      const normalizedSlug = slug.replace(/-/g, ' ');

      // Simple similarity check: at least some words match
      const titleWords = normalizedTitle.split(' ').filter(w => w.length > 2);
      const slugWords = normalizedSlug.split(' ').filter(w => w.length > 2);

      const matchingWords = titleWords.filter(tw =>
        slugWords.some(sw => sw.includes(tw) || tw.includes(sw))
      );

      if (matchingWords.length >= Math.min(2, titleWords.length)) {
        return `https://www.more.com${path}`;
      }
    }

    // Return first result if no close match (better than nothing)
    if (matches.length > 0) {
      const firstPath = matches[0][1];
      // Only return if it's not a category page
      if (!firstPath.endsWith('/theater/') && !firstPath.endsWith('/music/')) {
        return `https://www.more.com${firstPath}`;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Alternative: Try constructing URL directly from title
 */
async function tryDirectUrl(title: string, type: string): Promise<string | null> {
  const slug = titleToSlug(title);

  // Map event type to more.com category
  const categoryMap: Record<string, string[]> = {
    'theater': ['theater', 'theater/drama', 'theater/comedy'],
    'comedy': ['theater/comedy', 'theater'],
    'concert': ['music', 'music/concerts'],
    'classical': ['music/classical', 'music'],
    'dance': ['dance', 'theater/dance'],
  };

  const categories = categoryMap[type] || ['theater'];

  for (const category of categories) {
    const url = `https://www.more.com/gr-el/tickets/${category}/${slug}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return url;
      }
    } catch {
      // Continue to next category
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

  console.log('🔍 Search More.com for Ticket URLs');
  console.log('─'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit} events`);
  console.log('');

  const db = new Database(DB_PATH);

  // Get events without ticket URLs
  const events = db.query<EventRow, []>(`
    SELECT id, title, url, ticket_url, type
    FROM events
    WHERE source = 'athinorama.gr'
      AND start_date >= date('now')
      AND (ticket_url IS NULL OR ticket_url = '' OR ticket_url LIKE '%athinorama%')
    ORDER BY start_date
    LIMIT ${limit}
  `).all();

  console.log(`Found ${events.length} events without ticket URLs\n`);

  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const progress = `[${i + 1}/${events.length}]`;

    if (verbose) {
      console.log(`${progress} Searching: ${event.title.substring(0, 40)}...`);
    }

    // Try direct URL construction first (faster)
    let ticketUrl = await tryDirectUrl(event.title, event.type);

    // If not found, try search
    if (!ticketUrl) {
      ticketUrl = await searchMoreCom(event.title, event.type);
    }

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

      found++;
    } else {
      if (verbose) {
        console.log(`  ❌ Not found on more.com`);
      } else {
        process.stdout.write('·');
      }
      notFound++;
    }

    // Rate limit: 1 second between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n');
  console.log('─'.repeat(50));
  console.log('Results:');
  console.log(`  ✅ Found on more.com: ${found}`);
  console.log(`  ❌ Not found: ${notFound}`);
  console.log(`  ⚠️  Errors: ${errors}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - no changes saved');
  } else {
    console.log(`\n✅ Updated ${found} events with ticket URLs`);
  }

  db.close();
}

main().catch(console.error);
