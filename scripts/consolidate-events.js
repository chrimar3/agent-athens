#!/usr/bin/env node

/**
 * Consolidate events from various sources into a single JSON file
 * Uses pre-parsed JSON files and extracts additional data from HTML where possible
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DATA_DIR = path.join(__dirname, '../data');
const HTML_DIR = path.join(DATA_DIR, 'html-to-parse');
const PARSED_DIR = path.join(DATA_DIR, 'parsed');
const OUTPUT_FILE = path.join(PARSED_DIR, 'events.json');
const CURRENT_DATE = new Date('2025-10-22');

// Source files mapping
const SOURCES = {
  'viva-music-events.json': {
    name: 'Viva.gr',
    tier: 1,
    types: ['concert']
  }
};

// Parse date from various formats
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse as Date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

// Extract basic event info from HTML (minimal data when full parsing unavailable)
function extractBasicEventsFromHTML(filePath) {
  const events = [];
  const filename = path.basename(filePath);

  try {
    const html = fs.readFileSync(filePath, 'utf-8');
    const $ = cheerio.load(html);

    // More.com / Viva.gr slider format
    $('.slick-slide a[href*="/tickets/"]').each((i, elem) => {
      const $elem = $(elem);
      const title = $elem.find('h2, h3').first().text().trim();
      const href = $elem.attr('href');

      if (title && href) {
        events.push({
          title,
          url: href.startsWith('http') ? href : null,
          source: filename,
          _partial: true  // Flag to indicate this needs enrichment
        });
      }
    });

  } catch (error) {
    console.error(`Error extracting from ${filename}:`, error.message);
  }

  return events;
}

// Load existing parsed JSON files
function loadParsedJSON(filename) {
  const filePath = path.join(PARSED_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const events = JSON.parse(content);

    console.log(`✓ Loaded ${events.length} events from ${filename}`);

    // Add source metadata
    const sourceInfo = SOURCES[filename] || {};
    return events.map(event => ({
      ...event,
      source_name: sourceInfo.name || filename,
      source_tier: sourceInfo.tier || 4,
      source_file: filename
    }));

  } catch (error) {
    console.error(`Error loading ${filename}:`, error.message);
    return [];
  }
}

// Filter events to only include upcoming ones
function filterUpcomingEvents(events) {
  return events.filter(event => {
    if (!event.date) return false;

    try {
      const eventDate = new Date(event.date);
      return eventDate >= CURRENT_DATE;
    } catch {
      return false;
    }
  });
}

// Deduplicate events based on title, date, and venue
function deduplicateEvents(events) {
  const seen = new Map();
  const unique = [];

  for (const event of events) {
    // Create a key for deduplication
    const key = [
      event.title?.toLowerCase().trim(),
      event.date,
      event.venue?.toLowerCase().trim()
    ].filter(Boolean).join('|');

    if (!key) continue;

    if (!seen.has(key)) {
      seen.set(key, true);
      unique.push(event);
    } else {
      console.log(`  Duplicate removed: ${event.title}`);
    }
  }

  return unique;
}

// Enrich partial events (those extracted from HTML) with additional context
function enrichPartialEvents(events) {
  return events.map(event => {
    if (!event._partial) return event;

    // Remove _partial flag
    const { _partial, ...enriched } = event;

    // Try to infer type from URL or title
    if (!enriched.type) {
      const lowerTitle = enriched.title?.toLowerCase() || '';
      const url = enriched.url?.toLowerCase() || '';

      if (url.includes('/music/') || lowerTitle.includes('concert')) {
        enriched.type = 'concert';
      } else if (url.includes('/theater/') || lowerTitle.includes('theatre')) {
        enriched.type = 'theater';
      } else if (url.includes('/cinema/') || lowerTitle.includes('cinema')) {
        enriched.type = 'cinema';
      } else {
        enriched.type = 'performance';
      }
    }

    // Default values for missing fields
    enriched.venue = enriched.venue || 'Various Venues';
    enriched.price = enriched.price || 'with-ticket';
    enriched.date = enriched.date || '2025-11-01'; // Placeholder for events without dates

    return enriched;
  });
}

// Generate statistics
function generateStats(events) {
  const stats = {
    total: events.length,
    byType: {},
    byVenue: {},
    byMonth: {},
    bySource: {},
    withDates: 0,
    withTimes: 0,
    withVenues: 0,
    byPricing: { open: 0, 'with-ticket': 0 }
  };

  for (const event of events) {
    // By type
    stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;

    // By venue
    if (event.venue) {
      stats.byVenue[event.venue] = (stats.byVenue[event.venue] || 0) + 1;
      stats.withVenues++;
    }

    // By month
    if (event.date) {
      const month = event.date.substring(0, 7); // YYYY-MM
      stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;
      stats.withDates++;
    }

    // By source
    const source = event.source_name || event.source || 'Unknown';
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;

    // With times
    if (event.time) stats.withTimes++;

    // By pricing
    if (event.price) {
      stats.byPricing[event.price] = (stats.byPricing[event.price] || 0) + 1;
    }
  }

  return stats;
}

// Print statistics
function printStats(stats) {
  console.log('\n' + '='.repeat(70));
  console.log('EVENT STATISTICS');
  console.log('='.repeat(70));
  console.log(`Total events: ${stats.total}`);
  console.log(`  With dates: ${stats.withDates} (${(stats.withDates/stats.total*100).toFixed(1)}%)`);
  console.log(`  With times: ${stats.withTimes} (${(stats.withTimes/stats.total*100).toFixed(1)}%)`);
  console.log(`  With venues: ${stats.withVenues} (${(stats.withVenues/stats.total*100).toFixed(1)}%)`);

  console.log('\nBy Event Type:');
  Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

  console.log('\nBy Pricing:');
  Object.entries(stats.byPricing).forEach(([pricing, count]) => {
    console.log(`  ${pricing}: ${count}`);
  });

  console.log('\nBy Source:');
  Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });

  console.log('\nTop Venues:');
  Object.entries(stats.byVenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([venue, count]) => {
      console.log(`  ${venue}: ${count} events`);
    });

  console.log('\nBy Month:');
  Object.entries(stats.byMonth)
    .sort()
    .forEach(([month, count]) => {
      console.log(`  ${month}: ${count} events`);
    });
}

// Main execution
async function main() {
  console.log('Starting event consolidation...\n');

  const allEvents = [];

  // Load pre-parsed JSON files
  console.log('Loading pre-parsed JSON files...');
  for (const [filename, info] of Object.entries(SOURCES)) {
    const events = loadParsedJSON(filename);
    allEvents.push(...events);
  }

  console.log(`\nTotal events loaded: ${allEvents.length}`);

  // Filter to upcoming events only
  console.log('\nFiltering to upcoming events (from 2025-10-22)...');
  const upcomingEvents = filterUpcomingEvents(allEvents);
  console.log(`Upcoming events: ${upcomingEvents.length}`);

  // Deduplicate
  console.log('\nDeduplicating events...');
  const uniqueEvents = deduplicateEvents(upcomingEvents);
  console.log(`After deduplication: ${uniqueEvents.length}`);

  // Sort by date
  uniqueEvents.sort((a, b) => {
    const dateCompare = (a.date || '').localeCompare(b.date || '');
    if (dateCompare !== 0) return dateCompare;
    return (a.time || '').localeCompare(b.time || '');
  });

  // Ensure output directory exists
  if (!fs.existsSync(PARSED_DIR)) {
    fs.mkdirSync(PARSED_DIR, { recursive: true });
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueEvents, null, 2), 'utf-8');
  console.log(`\n✓ Saved ${uniqueEvents.length} events to ${OUTPUT_FILE}`);

  // Generate and print statistics
  const stats = generateStats(uniqueEvents);
  printStats(stats);

  console.log('\n' + '='.repeat(70));
  console.log('CONSOLIDATION COMPLETE');
  console.log('='.repeat(70));
}

// Run
main().catch(console.error);
