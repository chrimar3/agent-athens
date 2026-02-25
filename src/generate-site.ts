#!/usr/bin/env bun

// Main site generator - generates all combinatorial pages

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import type { Event, EventType, TimeRange, PriceFilter, Filters } from './types';
import { normalizeEvents } from './utils/normalize';
import { filterEvents } from './utils/filters';
import { buildURL, buildPageMetadata } from './utils/urls';
import { renderPage } from './templates/page';
import {
  renderCategoryPage,
  renderCategoryNav,
  type CategoryConfig
} from './templates/category-page';
import { generateEventPages, loadSlugHistory, saveSlugHistory, generateRedirects } from './generators/event-page';
import { generateVenuePages } from './generators/venue-page';

const DIST_DIR = join(import.meta.dir, '../dist');
const DATA_DIR = join(import.meta.dir, 'data');
const DB_PATH = join(import.meta.dir, '../data/events.db');

/**
 * Record generation statistics to the database for monitoring
 */
function recordGenerationStats(
  totalEvents: number,
  pagesGenerated: number,
  buildDurationMs: number,
  deploySuccess: boolean
): void {
  try {
    const db = new Database(DB_PATH);
    db.prepare(`
      INSERT INTO generation_stats (generated_at, total_events, pages_generated, build_duration_ms, deploy_success)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      totalEvents,
      pagesGenerated,
      buildDurationMs,
      deploySuccess ? 1 : 0
    );
    db.close();
  } catch (err) {
    // Log but don't fail the build
    console.log(`⚠️ Failed to record generation stats: ${err}`);
  }
}

const EVENT_TYPES: EventType[] = [
  'concert', 'dj_set', 'exhibition', 'cinema', 'screening',
  'theater', 'dance', 'performance', 'show', 'workshop',
  'conference', 'meetup', 'hackathon', 'seminar'
];
const TIME_RANGES: TimeRange[] = ['today', 'tomorrow', 'this-week', 'this-weekend', 'this-month', 'next-month', 'all-events'];
const PRICE_FILTERS: PriceFilter[] = ['open', 'with-ticket', 'all'];

// Map of genres by event type (from our sample data)
const GENRES: Record<EventType, string[]> = {
  concert: ['Pop', 'Post-rock', 'Jazz', 'Indie', 'Synth-pop', 'Dub', 'Acid jazz', 'Classical', 'World music', 'Soul', 'Rock', 'Rebetiko'],
  dj_set: ['Electronic', 'Techno', 'House', 'Trance', 'Drum and Bass', 'Ambient'],
  exhibition: ['Contemporary art', 'Photography', 'Sculpture', 'Installation'],
  cinema: ['Film premiere', 'Documentary'],
  screening: ['Outdoor cinema', 'Film festival'],
  theater: ['Drama', 'Comedy', 'Tragedy'],
  dance: ['Ballet', 'Contemporary', 'Tango', 'Flamenco', 'Modern'],
  performance: ['Experimental', 'Multimedia'],
  show: ['Cabaret', 'Stand-up', 'Variety'],
  workshop: ['Masterclass', 'Educational'],
  conference: ['AI', 'Machine Learning', 'Data Science', 'Cloud', 'DevOps'],
  meetup: ['AI', 'Tech', 'Startup', 'Developer', 'Data Science'],
  hackathon: ['AI', 'Innovation', 'Coding', 'Startup'],
  seminar: ['AI Research', 'Machine Learning', 'Academic'],
  other: []
};

// Load category configuration
const CATEGORIES_CONFIG = JSON.parse(
  readFileSync(join(import.meta.dir, '../config/categories.json'), 'utf-8')
) as { categories: CategoryConfig[] };

async function main() {
  const buildStartTime = Date.now();
  console.log('🚀 Starting site generation...\n');

  // Create dist directory
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  // Load events from database
  console.log('📥 Loading events from database...');
  const { getAllEvents, cleanupOldEvents, getDatabase } = await import('./db/database');

  // Clean up events that ended more than 1 day ago (keep recent history)
  const cleaned = cleanupOldEvents(1);
  if (cleaned > 0) {
    console.log(`🗑️  Cleaned up ${cleaned} past events\n`);
  }

  // Load all upcoming and recent events
  const allEvents = getAllEvents();

  // Filter by location_status: only verified_athens and pass_through events
  // Per spec FR-B: "Site shows: verified_athens + pass_through only"
  const PUBLISHABLE_STATUSES = ['verified_athens', 'pass_through'];
  const locationFiltered = allEvents.filter(event => {
    // Check if event has location_status field (from database)
    const status = event.locationStatus;
    // Reject unverified events - require explicit verification
    if (!status || status === 'unverified') return false;
    return PUBLISHABLE_STATUSES.includes(status);
  });

  // Filter to only current/future events for public site
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const events = locationFiltered.filter(event => {
    const startDate = new Date(event.startDate);

    // For exhibitions: show if currently running (end_date >= today) or starting soon
    if (event.type === 'exhibition' && event.endDate) {
      const endDate = new Date(event.endDate);
      endDate.setHours(23, 59, 59, 999); // End of day
      return endDate >= today; // Still running or future
    }

    // For other events: show if starting today or in the future
    return startDate >= today;
  });

  console.log(`✅ Loaded ${allEvents.length} events from SQLite`);
  console.log(`📍 ${locationFiltered.length} events with verified Athens location`);
  console.log(`📅 Publishing ${events.length} current/upcoming events\n`);

  // Save normalized events
  const normalizedPath = join(DIST_DIR, 'data');
  if (!existsSync(normalizedPath)) {
    mkdirSync(normalizedPath, { recursive: true });
  }
  writeFileSync(
    join(normalizedPath, 'events.json'),
    JSON.stringify(events, null, 2)
  );

  let pagesGenerated = 0;
  const generatedUrls: string[] = [];

  // Generate core time pages
  console.log('📄 Generating core pages...');
  for (const time of TIME_RANGES) {
    const url = await generatePage({ time }, events);
    generatedUrls.push(url);
    pagesGenerated++;
  }

  // Generate homepage (all events)
  const homeUrl = await generatePage({}, events);
  generatedUrls.push(homeUrl);
  pagesGenerated++;

  // Generate type pages
  console.log('📄 Generating type pages...');
  for (const type of EVENT_TYPES) {
    // Type only (all time)
    generatedUrls.push(await generatePage({ type }, events));
    pagesGenerated++;

    // Type × Time
    for (const time of TIME_RANGES) {
      generatedUrls.push(await generatePage({ type, time }, events));
      pagesGenerated++;
    }
  }

  // Generate price pages
  console.log('📄 Generating price pages...');
  for (const price of PRICE_FILTERS.filter(p => p !== 'all')) {
    // Price only
    generatedUrls.push(await generatePage({ price }, events));
    pagesGenerated++;

    // Price × Time
    for (const time of TIME_RANGES) {
      generatedUrls.push(await generatePage({ price, time }, events));
      pagesGenerated++;
    }
  }

  // Generate Type × Price pages
  console.log('📄 Generating type + price pages...');
  for (const type of EVENT_TYPES) {
    for (const price of PRICE_FILTERS.filter(p => p !== 'all')) {
      // Type + Price
      generatedUrls.push(await generatePage({ type, price }, events));
      pagesGenerated++;

      // Type + Price + Time
      for (const time of TIME_RANGES) {
        generatedUrls.push(await generatePage({ type, price, time }, events));
        pagesGenerated++;
      }
    }
  }

  // Generate genre pages (top genres only)
  console.log('📄 Generating genre pages...');
  for (const type of EVENT_TYPES) {
    const genres = GENRES[type].slice(0, 5); // Top 5 per type

    for (const genre of genres) {
      // Genre × Time
      for (const time of TIME_RANGES) {
        generatedUrls.push(await generatePage({ type, genre, time }, events));
        pagesGenerated++;
      }

      // Genre × Price × Time
      for (const price of PRICE_FILTERS.filter(p => p !== 'all')) {
        for (const time of TIME_RANGES) {
          generatedUrls.push(await generatePage({ type, genre, price, time }, events));
          pagesGenerated++;
        }
      }
    }
  }

  // Generate category landing pages
  console.log('\n📁 Generating category landing pages...');
  const categoryUrls = await generateCategoryPages(events);
  generatedUrls.push(...categoryUrls);
  pagesGenerated += categoryUrls.length;

  // Generate individual event pages (Phase C.3)
  console.log('\n📄 Generating individual event pages...');
  const previousSlugHistory = loadSlugHistory();
  const { urls: eventPageUrls, slugMap: currentSlugs } = await generateEventPages(events);
  generatedUrls.push(...eventPageUrls);
  pagesGenerated += eventPageUrls.length;

  // Initialize _redirects with /en/ redirect (must be first rule — Netlify processes top-to-bottom)
  // 302 (temporary) because we'll remove this when bilingual content launches
  const redirectsPath = join(DIST_DIR, '_redirects');
  writeFileSync(redirectsPath, '/en/*  /:splat  302\n');

  // Save slug history and generate redirects (for changed slugs)
  saveSlugHistory(currentSlugs, previousSlugHistory);
  const redirects = generateRedirects(currentSlugs, previousSlugHistory);
  if (redirects.length > 0) {
    const existingRedirects = readFileSync(redirectsPath, 'utf-8');
    writeFileSync(redirectsPath, existingRedirects + '\n' + redirects.join('\n'));
    console.log(`  ✓ Generated ${redirects.length} redirects for changed slugs`);
  }

  // Generate venue pages (Phase C.5)
  console.log('\n🏛️ Generating venue pages...');
  const venuePageUrls = await generateVenuePages(events);
  generatedUrls.push(...venuePageUrls);
  pagesGenerated += venuePageUrls.length;

  // Generate discovery files
  console.log('\n📄 Generating discovery files...');
  await generateLLMsTxt();
  await generateRobotsTxt();
  await generateSitemap(generatedUrls);

  const buildDurationMs = Date.now() - buildStartTime;

  // Record generation stats to database
  recordGenerationStats(events.length, pagesGenerated, buildDurationMs, true);

  console.log(`\n✅ Site generation complete!`);
  console.log(`📊 Total pages generated: ${pagesGenerated}`);
  console.log(`   - ${eventPageUrls.length} event pages`);
  console.log(`   - ${venuePageUrls.length} venue pages`);
  console.log(`   - ${categoryUrls.length} category pages`);
  console.log(`⏱️  Build time: ${(buildDurationMs / 1000).toFixed(1)}s`);
  console.log(`📁 Output directory: ${DIST_DIR}`);
}

async function generatePage(filters: Filters, allEvents: Event[]): Promise<string> {
  const filteredEvents = filterEvents(allEvents, filters);
  const url = buildURL(filters);
  const metadata = buildPageMetadata(filters, filteredEvents.length);

  // Generate HTML
  const html = renderPage(metadata, filteredEvents);

  // Write HTML file
  const filename = url === 'index' ? 'index.html' : `${url}.html`;
  const filepath = join(DIST_DIR, filename);
  writeFileSync(filepath, html);

  // Also generate JSON API
  const apiDir = join(DIST_DIR, 'api');
  if (!existsSync(apiDir)) {
    mkdirSync(apiDir, { recursive: true });
  }

  const jsonData = {
    filters,
    events: filteredEvents,
    meta: {
      total: filteredEvents.length,
      lastUpdate: new Date().toISOString(),
      url: `https://agentathens.netlify.app/${url}`
    }
  };

  writeFileSync(
    join(apiDir, `${url}.json`),
    JSON.stringify(jsonData, null, 2)
  );

  console.log(`  ✓ ${url} (${filteredEvents.length} events)`);
  return url;
}

/**
 * Generate category landing pages with curated slugs
 * These provide user-friendly URLs like /concerts, /exhibitions
 */
async function generateCategoryPages(events: Event[]): Promise<string[]> {
  const categories = CATEGORIES_CONFIG.categories;
  const generatedUrls: string[] = [];

  for (const category of categories) {
    // Generate category HTML page
    const html = renderCategoryPage(category, events, categories);

    // Write to dist/[slug].html (e.g., dist/concerts.html)
    const filepath = join(DIST_DIR, `${category.slug}.html`);
    writeFileSync(filepath, html);

    // Also generate JSON API for this category
    const apiDir = join(DIST_DIR, 'api', 'categories');
    if (!existsSync(apiDir)) {
      mkdirSync(apiDir, { recursive: true });
    }

    // Import filter function to get filtered events for JSON
    const { filterEventsByCategory } = await import('./templates/category-page');
    const filteredEvents = filterEventsByCategory(events, category);

    const jsonData = {
      category: {
        slug: category.slug,
        title: category.title,
        titleEn: category.titleEn,
        description: category.description
      },
      events: filteredEvents,
      meta: {
        total: filteredEvents.length,
        lastUpdate: new Date().toISOString(),
        url: `https://agentathens.netlify.app/${category.slug}`
      }
    };

    writeFileSync(
      join(apiDir, `${category.slug}.json`),
      JSON.stringify(jsonData, null, 2)
    );

    console.log(`  ✓ /${category.slug} (${filteredEvents.length} events)`);
    generatedUrls.push(category.slug);
  }

  return generatedUrls;
}

async function generateLLMsTxt() {
  const base = 'https://agentathens.netlify.app';
  const content = `# Agent Athens

> AI-curated cultural events calendar for Athens, Greece. Updated daily at 08:00 from 10+ verified venues. Data licensed CC BY 4.0.

## Browse Events

- [All Events Today](${base}/today): Everything happening in Athens today
- [Tomorrow](${base}/tomorrow): Events happening tomorrow
- [This Weekend](${base}/this-weekend): All weekend events
- [This Week](${base}/this-week): Full week overview
- [Concerts This Weekend](${base}/concert-this-weekend): Live music this weekend
- [Open Events Today](${base}/open-today): Free admission events today
- [Exhibitions](${base}/exhibition): Current exhibitions in Athens
- [Theater This Week](${base}/theater-this-week): Theater performances this week
- [Electronic Music](${base}/electronic-concert): Electronic concerts and DJ sets

## JSON API

Every HTML page has a JSON counterpart at \`/api/{slug}.json\`. Useful for programmatic access.

- [All Today](${base}/api/today.json): All events today as JSON
- [Concerts This Week](${base}/api/concert-this-week.json): Concerts this week
- [Open Today](${base}/api/open-today.json): Free events today
- [Exhibitions](${base}/api/exhibition.json): All current exhibitions
- [Full Index](${base}/api/index.json): Complete event index

## Coverage

- Geographic: Athens, Greece (Attica region)
- Types: concerts, exhibitions, cinema, theater, dance, performances, DJ sets, workshops
- Sources: 10+ verified venues and listing sites, scraped daily
- Freshness: Updated every morning at 08:00 Europe/Athens
- Structured data: Schema.org Event markup on all event pages

## Contact

- [GitHub Issues](https://github.com/chrimar3/agent-athens/issues)
- Email: cmarag8@gmail.com
`;

  writeFileSync(join(DIST_DIR, 'llms.txt'), content);
  console.log('  ✓ llms.txt');
}

async function generateRobotsTxt() {
  const content = `# Search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# AI Search Crawlers — ALLOW (power AI citations)
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: anthropic-ai
Allow: /

# AI Training — BLOCK (prevents model training, preserves search)
User-agent: Google-Extended
Disallow: /

# Default
User-agent: *
Allow: /

Sitemap: https://agentathens.netlify.app/sitemap.xml
`;

  writeFileSync(join(DIST_DIR, 'robots.txt'), content);
  console.log('  ✓ robots.txt');
}

async function generateSitemap(generatedUrls: string[]) {
  const baseUrl = 'https://agentathens.netlify.app';
  const today = new Date().toISOString().split('T')[0];

  // Build sitemap entries with priority based on URL depth
  const entries = generatedUrls.map(url => {
    const fullUrl = url === 'index' ? baseUrl : `${baseUrl}/${url}`;
    // Higher priority for simpler URLs (more general pages)
    const depth = url === 'index' ? 0 : url.split('-').length;
    const priority = Math.max(0.5, 1.0 - (depth * 0.1)).toFixed(1);

    return `  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${priority}</priority>
  </url>`;
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  writeFileSync(join(DIST_DIR, 'sitemap.xml'), sitemap);
  console.log(`  ✓ sitemap.xml (${generatedUrls.length} URLs)`);
}

// Run generator
main().catch(console.error);
