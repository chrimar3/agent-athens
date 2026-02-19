#!/usr/bin/env bun
/**
 * Cross-Reference Ticket URLs
 *
 * Matches athinorama events with more.com events by title similarity
 * and copies the ticket URL from more.com events.
 *
 * Usage:
 *   bun run scripts/crossref-ticket-urls.ts [--dry-run] [--verbose]
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');

interface EventRow {
  id: string;
  title: string;
  url: string;
  ticket_url: string | null;
  venue_name: string;
  start_date: string;
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    // Named entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Numeric entities (decimal)
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    // Numeric entities (hex)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Normalize text for comparison
 */
function normalize(text: string): string {
  return decodeHtmlEntities(text)
    .toLowerCase()
    // Normalize Greek accents (ά→α, έ→ε, etc.)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Handle Greek final sigma (ς→σ)
    .replace(/ς/g, 'σ')
    // Add space around & and similar
    .replace(/&/g, ' ')
    .replace(/\+/g, ' ')
    // Remove common suffixes/prefixes
    .replace(/\s*-\s*live$/i, '')
    .replace(/^live\s*-\s*/i, '')
    .replace(/live\s+(στην|in)\s+(αθηνα|athens)/gi, '')  // Remove "live in Athens"
    .replace(/\s*@\s*/g, ' ')
    .replace(/\s*\|\s*/g, ' ')
    // Remove quotes
    .replace(/[«»""'']/g, '')
    // Remove special chars but keep Greek and Latin letters
    .replace(/[^a-zα-ωa-z0-9\s]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Jaccard similarity between two strings
 */
function similarity(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(' ').filter(w => w.length > 2));
  const wordsB = new Set(normalize(b).split(' ').filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  console.log('🔗 Cross-Reference Ticket URLs');
  console.log('─'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const db = new Database(DB_PATH);

  // Get athinorama events without ticket URLs
  const athinoramaEvents = db.query<EventRow, []>(`
    SELECT id, title, url, ticket_url, venue_name, start_date
    FROM events
    WHERE source = 'athinorama.gr'
      AND start_date >= date('now')
      AND (ticket_url IS NULL OR ticket_url = '' OR ticket_url LIKE '%athinorama%')
  `).all();

  // Get events from ticket sellers to match against
  const ticketSellerEvents = db.query<EventRow, []>(`
    SELECT id, title, url, ticket_url, venue_name, start_date, source
    FROM events
    WHERE source IN ('more.com', 'ticketservices', 'viva.gr', 'megaron.gr')
      AND start_date >= date('now')
      AND url IS NOT NULL AND url <> ''
  `).all();

  console.log(`Athinorama events without tickets: ${athinoramaEvents.length}`);
  console.log(`Ticket seller events to match: ${ticketSellerEvents.length}`);
  console.log('');

  let matched = 0;
  let unmatched = 0;
  const matches: Array<{athinorama: string; morecom: string; url: string; score: number}> = [];

  for (const athEvent of athinoramaEvents) {
    let bestMatch: (EventRow & { source?: string }) | null = null;
    let bestScore = 0;

    for (const ticketEvent of ticketSellerEvents) {
      // Quick filter: dates should be within 3 days
      const athDate = new Date(athEvent.start_date);
      const moreDate = new Date(ticketEvent.start_date);
      const daysDiff = Math.abs((athDate.getTime() - moreDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff > 3) continue;

      const titleScore = similarity(athEvent.title, ticketEvent.title);
      const venueScore = similarity(athEvent.venue_name, ticketEvent.venue_name);

      // Exact venue match is a strong signal
      const venueExact = normalize(athEvent.venue_name) === normalize(ticketEvent.venue_name);

      // If same venue and same date, lower title threshold
      let combinedScore: number;
      if (venueExact && daysDiff < 1) {
        // Same venue, same day - title just needs some overlap
        combinedScore = titleScore * 0.6 + 0.4;  // Boost for venue match
      } else if (venueExact) {
        // Same venue, nearby date
        combinedScore = titleScore * 0.7 + venueScore * 0.3;
      } else {
        // Different venue - need stronger title match
        combinedScore = titleScore * 0.85 + venueScore * 0.15;
      }

      if (combinedScore > bestScore && combinedScore > 0.35) {
        bestScore = combinedScore;
        bestMatch = ticketEvent;
      }
    }

    if (bestMatch && bestScore > 0.45) {
      matches.push({
        athinorama: athEvent.title,
        morecom: bestMatch.title,
        url: bestMatch.url,
        score: bestScore
      });

      if (verbose) {
        console.log(`✅ ${athEvent.title.substring(0, 30)}...`);
        console.log(`   → ${bestMatch.title.substring(0, 30)}... (${(bestScore * 100).toFixed(0)}%)`);
        console.log(`   URL: ${bestMatch.url}`);
      }

      if (!dryRun) {
        db.run(`
          UPDATE events
          SET ticket_url = ?
          WHERE id = ?
        `, [bestMatch.url, athEvent.id]);
      }

      matched++;
    } else {
      unmatched++;
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Results:');
  console.log(`  ✅ Matched: ${matched}`);
  console.log(`  ❌ Unmatched: ${unmatched}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - no changes saved');

    if (matches.length > 0 && !verbose) {
      console.log('\nTop matches found:');
      matches.sort((a, b) => b.score - a.score).slice(0, 10).forEach(m => {
        console.log(`  ${m.athinorama.substring(0, 25)} → ${m.morecom.substring(0, 25)} (${(m.score * 100).toFixed(0)}%)`);
      });
    }
  } else {
    console.log(`\n✅ Updated ${matched} events with ticket URLs`);
  }

  db.close();
}

main().catch(console.error);
