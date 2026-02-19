#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const HTML_DIR = path.join(__dirname, '../data/html-to-parse');
const OUTPUT_FILE = path.join(__dirname, '../data/parsed/events.json');
const CURRENT_DATE = new Date('2025-10-22');

// Parse date from various Greek formats
function parseGreekDate(dateStr) {
  if (!dateStr) return null;

  const greekMonths = {
    'Ιανουαρίου': '01', 'Φεβρουαρίου': '02', 'Μαρτίου': '03', 'Απριλίου': '04',
    'Μαΐου': '05', 'Ιουνίου': '06', 'Ιουλίου': '07', 'Αυγούστου': '08',
    'Σεπτεμβρίου': '09', 'Οκτωβρίου': '10', 'Νοεμβρίου': '11', 'Δεκεμβρίου': '12',
    'Ιαν': '01', 'Φεβ': '02', 'Μαρ': '03', 'Απρ': '04', 'Μάι': '05', 'Ιουν': '06',
    'Ιουλ': '07', 'Αύγ': '08', 'Σεπ': '09', 'Οκτ': '10', 'Νοε': '11', 'Δεκ': '12',
    'January': '01', 'February': '02', 'March': '03', 'April': '04',
    'May': '05', 'June': '06', 'July': '07', 'August': '08',
    'September': '09', 'October': '10', 'November': '11', 'December': '12',
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try DD/MM/YYYY
  const dmyMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try Greek format: "23 Οκτωβρίου 2025"
  for (const [greekMonth, numMonth] of Object.entries(greekMonths)) {
    if (dateStr.includes(greekMonth)) {
      const match = dateStr.match(/(\d{1,2})\s+\S+\s+(\d{4})/);
      if (match) {
        const [, day, year] = match;
        return `${year}-${numMonth}-${day.padStart(2, '0')}`;
      }
    }
  }

  return null;
}

// Parse time from various formats
function parseTime(timeStr) {
  if (!timeStr) return null;

  // Try HH:MM format
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const [, hours, minutes] = timeMatch;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }

  return null;
}

// Determine if event is free or ticketed
function determinePrice(priceText) {
  if (!priceText) return 'with-ticket';

  const lowerPrice = priceText.toLowerCase();
  if (lowerPrice.includes('free') ||
      lowerPrice.includes('δωρεάν') ||
      lowerPrice.includes('ελεύθερη είσοδος')) {
    return 'open';
  }

  return 'with-ticket';
}

// Parse Viva/More.com events
function parseVivaMore($, sourceFile) {
  const events = [];

  // Look for event cards
  $('.event-item, .ticket-item, [class*="event"], [class*="ticket"]').each((i, elem) => {
    const $elem = $(elem);

    const title = $elem.find('.event-title, .ticket-title, h2, h3').first().text().trim();
    const dateStr = $elem.find('.event-date, .date, [class*="date"]').first().text().trim();
    const venue = $elem.find('.venue, .event-venue, [class*="venue"]').first().text().trim();
    const url = $elem.find('a').first().attr('href');

    if (title && dateStr) {
      const date = parseGreekDate(dateStr);
      if (date && new Date(date) >= CURRENT_DATE) {
        events.push({
          title,
          date,
          venue: venue || 'Various Venues',
          type: 'concert',
          price: 'with-ticket',
          url: url ? (url.startsWith('http') ? url : `https://www.more.com${url}`) : null,
          source: sourceFile
        });
      }
    }
  });

  return events;
}

// Parse Half Note events
function parseHalfNote($, sourceFile) {
  const events = [];

  // Look for event entries
  $('.tribe-event, .event-item, [class*="event"]').each((i, elem) => {
    const $elem = $(elem);

    const title = $elem.find('.tribe-event-title, h3, h2').first().text().trim();
    const dateStr = $elem.find('.tribe-event-date, .event-date, time').first().text().trim();
    const timeStr = $elem.find('.tribe-event-time, .event-time').first().text().trim();
    const url = $elem.find('a').first().attr('href');

    if (title && dateStr) {
      const date = parseGreekDate(dateStr);
      const time = parseTime(timeStr);

      if (date && new Date(date) >= CURRENT_DATE) {
        events.push({
          title,
          date,
          time,
          venue: 'Half Note Jazz Club',
          type: 'concert',
          genre: 'jazz',
          price: 'with-ticket',
          url: url || null,
          source: sourceFile
        });
      }
    }
  });

  return events;
}

// Parse Gazarte events
function parseGazarte($, sourceFile) {
  const events = [];

  // Determine event type from filename
  let eventType = 'concert';
  if (sourceFile.includes('cinema')) eventType = 'cinema';
  if (sourceFile.includes('exhibition')) eventType = 'exhibition';

  $('.event-item, .event, [class*="event"]').each((i, elem) => {
    const $elem = $(elem);

    const title = $elem.find('h2, h3, .event-title').first().text().trim();
    const dateStr = $elem.find('.date, .event-date, time').first().text().trim();
    const url = $elem.find('a').first().attr('href');

    if (title && dateStr) {
      const date = parseGreekDate(dateStr);

      if (date && new Date(date) >= CURRENT_DATE) {
        events.push({
          title,
          date,
          venue: 'Gazarte',
          type: eventType,
          price: 'with-ticket',
          url: url ? (url.startsWith('http') ? url : `https://www.gazarte.gr${url}`) : null,
          source: sourceFile
        });
      }
    }
  });

  return events;
}

// Parse Athinorama events
function parseAthinorama($, sourceFile) {
  const events = [];

  // Determine event type from filename
  let eventType = 'concert';
  if (sourceFile.includes('cinema')) eventType = 'cinema';
  if (sourceFile.includes('theater')) eventType = 'theater';
  if (sourceFile.includes('art')) eventType = 'exhibition';
  if (sourceFile.includes('clubbing')) eventType = 'performance';

  $('.event-listing, .event-item, [class*="event"]').each((i, elem) => {
    const $elem = $(elem);

    const title = $elem.find('.event-title, h2, h3').first().text().trim();
    const dateStr = $elem.find('.event-date, .date').first().text().trim();
    const venue = $elem.find('.venue, .event-venue').first().text().trim();
    const url = $elem.find('a').first().attr('href');

    if (title && dateStr) {
      const date = parseGreekDate(dateStr);

      if (date && new Date(date) >= CURRENT_DATE) {
        events.push({
          title,
          date,
          venue: venue || 'Various Venues',
          type: eventType,
          price: 'with-ticket',
          url: url ? (url.startsWith('http') ? url : `https://www.athinorama.gr${url}`) : null,
          source: sourceFile
        });
      }
    }
  });

  return events;
}

// Parse Greek Festival events
function parseGreekFestival($, sourceFile) {
  const events = [];

  $('.event-item, .performance, [class*="event"]').each((i, elem) => {
    const $elem = $(elem);

    const title = $elem.find('h2, h3, .event-title').first().text().trim();
    const dateStr = $elem.find('.date, .event-date, time').first().text().trim();
    const venue = $elem.find('.venue, .location').first().text().trim();
    const url = $elem.find('a').first().attr('href');

    if (title && dateStr) {
      const date = parseGreekDate(dateStr);

      if (date && new Date(date) >= CURRENT_DATE) {
        events.push({
          title,
          date,
          venue: venue || 'Various Venues',
          type: 'performance',
          genre: 'classical',
          price: 'with-ticket',
          url: url ? (url.startsWith('http') ? url : `https://greekfestival.gr${url}`) : null,
          source: sourceFile
        });
      }
    }
  });

  return events;
}

// Parse Gagarin 205 events
function parseGagarin($, sourceFile) {
  const events = [];

  $('.event, .concert, [class*="event"]').each((i, elem) => {
    const $elem = $(elem);

    const title = $elem.find('h2, h3, .event-title, .concert-title').first().text().trim();
    const dateStr = $elem.find('.date, .event-date, time').first().text().trim();
    const url = $elem.find('a').first().attr('href');

    if (title && dateStr) {
      const date = parseGreekDate(dateStr);

      if (date && new Date(date) >= CURRENT_DATE) {
        events.push({
          title,
          date,
          venue: 'Gagarin 205',
          type: 'concert',
          price: 'with-ticket',
          url: url ? (url.startsWith('http') ? url : `https://www.gagarin205.gr${url}`) : null,
          source: sourceFile
        });
      }
    }
  });

  return events;
}

// Parse Kyttaro events
function parseKyttaro($, sourceFile) {
  const events = [];

  $('.event, .concert, [class*="event"]').each((i, elem) => {
    const $elem = $(elem);

    const title = $elem.find('h2, h3, .event-title').first().text().trim();
    const dateStr = $elem.find('.date, .event-date, time').first().text().trim();
    const url = $elem.find('a').first().attr('href');

    if (title && dateStr) {
      const date = parseGreekDate(dateStr);

      if (date && new Date(date) >= CURRENT_DATE) {
        events.push({
          title,
          date,
          venue: 'Kyttaro Live Club',
          type: 'concert',
          price: 'with-ticket',
          url: url ? (url.startsWith('http') ? url : `https://www.kyttaro.gr${url}`) : null,
          source: sourceFile
        });
      }
    }
  });

  return events;
}

// Parse Culture Athens events
function parseCultureAthens($, sourceFile) {
  const events = [];

  $('.event-item, .event, [class*="event"]').each((i, elem) => {
    const $elem = $(elem);

    const title = $elem.find('h2, h3, .event-title').first().text().trim();
    const dateStr = $elem.find('.date, .event-date, time').first().text().trim();
    const venue = $elem.find('.venue, .location').first().text().trim();
    const url = $elem.find('a').first().attr('href');

    if (title && dateStr) {
      const date = parseGreekDate(dateStr);

      if (date && new Date(date) >= CURRENT_DATE) {
        events.push({
          title,
          date,
          venue: venue || 'Various Venues',
          type: 'performance',
          price: 'open',
          url: url ? (url.startsWith('http') ? url : `https://cultureisathens.gr${url}`) : null,
          source: sourceFile
        });
      }
    }
  });

  return events;
}

// Main parser function
function parseHTMLFile(filePath) {
  const filename = path.basename(filePath);
  console.log(`Parsing: ${filename}`);

  // Skip JSON files
  if (filename.endsWith('.json')) {
    return { events: [], skipped: true };
  }

  try {
    const html = fs.readFileSync(filePath, 'utf-8');
    const $ = cheerio.load(html);

    let events = [];

    // Route to appropriate parser based on filename
    if (filename.includes('viva') || filename.includes('more')) {
      events = parseVivaMore($, filename);
    } else if (filename.includes('halfnote')) {
      events = parseHalfNote($, filename);
    } else if (filename.includes('gazarte')) {
      events = parseGazarte($, filename);
    } else if (filename.includes('athinorama')) {
      events = parseAthinorama($, filename);
    } else if (filename.includes('greek_festival')) {
      events = parseGreekFestival($, filename);
    } else if (filename.includes('gagarin')) {
      events = parseGagarin($, filename);
    } else if (filename.includes('kyttaro')) {
      events = parseKyttaro($, filename);
    } else if (filename.includes('culture_athens')) {
      events = parseCultureAthens($, filename);
    } else if (filename.includes('clubber')) {
      // Clubber - generic parsing
      events = parseVivaMore($, filename);
    } else if (filename.includes('romantso')) {
      // Romantso uses dynamic loading - HTML won't contain events
      console.log(`  ⚠ Skipping ${filename} - events loaded dynamically`);
      return { events: [], skipped: true, reason: 'dynamic-content' };
    }

    console.log(`  ✓ Extracted ${events.length} events`);
    return { events, skipped: false };

  } catch (error) {
    console.error(`  ✗ Error parsing ${filename}:`, error.message);
    return { events: [], skipped: true, error: error.message };
  }
}

// Main execution
function main() {
  console.log('Starting HTML event parsing...\n');

  const allEvents = [];
  const stats = {
    totalFiles: 0,
    processedFiles: 0,
    skippedFiles: 0,
    totalEvents: 0,
    eventsBySource: {}
  };

  // Get all HTML files
  const files = fs.readdirSync(HTML_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(HTML_DIR, f));

  stats.totalFiles = files.length;

  // Parse each file
  for (const file of files) {
    const result = parseHTMLFile(file);
    const filename = path.basename(file);

    if (result.skipped) {
      stats.skippedFiles++;
    } else {
      stats.processedFiles++;
    }

    if (result.events.length > 0) {
      allEvents.push(...result.events);
      stats.eventsBySource[filename] = result.events.length;
      stats.totalEvents += result.events.length;
    }
  }

  // Deduplicate events based on title, date, and venue
  const uniqueEvents = [];
  const seen = new Set();

  for (const event of allEvents) {
    const key = `${event.title}|${event.date}|${event.venue}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEvents.push(event);
    }
  }

  // Sort by date
  uniqueEvents.sort((a, b) => a.date.localeCompare(b.date));

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueEvents, null, 2), 'utf-8');

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('PARSING SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total files found: ${stats.totalFiles}`);
  console.log(`Files processed: ${stats.processedFiles}`);
  console.log(`Files skipped: ${stats.skippedFiles}`);
  console.log(`Total events extracted: ${stats.totalEvents}`);
  console.log(`Unique events after deduplication: ${uniqueEvents.length}`);
  console.log('\nEvents by source:');

  const sortedSources = Object.entries(stats.eventsBySource)
    .sort((a, b) => b[1] - a[1]);

  for (const [source, count] of sortedSources) {
    console.log(`  ${source}: ${count} events`);
  }

  console.log(`\nOutput saved to: ${OUTPUT_FILE}`);
  console.log('='.repeat(60));
}

// Run the parser
main();
