/**
 * Venue Page Generator
 *
 * Generates venue landing pages at /venues/[slug]/
 * showing all upcoming events at a venue.
 *
 * Minimum data threshold:
 * - Venue must have at least 2 upcoming events, OR
 * - Venue must have complete data (address + neighborhood)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Event } from '../types';
import { slugify, generateEventSlug } from './event-page';
import { formatGreekDateOnly, formatGreekTime } from '../utils/i18n';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { getAthensTimezone } from '../enrichment/quality-gates';

const DIST_DIR = join(import.meta.dir, '../../dist');
const BASE_URL = 'https://agentathens.netlify.app';

interface VenueData {
  name: string;
  slug: string;
  address?: string;
  neighborhood?: string;
  events: Event[];
  eventCount: number;
}

/**
 * Check if a venue meets minimum data threshold for page generation
 */
function meetsMinimumThreshold(venue: VenueData): boolean {
  // At least 2 upcoming events OR complete address data
  if (venue.events.length >= 2) return true;
  if (venue.address && venue.neighborhood) return true;
  return false;
}

/**
 * Generate Schema.org LocalBusiness markup for venue
 * Only if we have address data
 */
function generateVenueSchema(venue: VenueData): string | null {
  if (!venue.address) return null;

  // Get timezone from first event date, or default to current
  let tz = '+02:00';
  if (venue.events.length > 0) {
    const dateMatch = venue.events[0].startDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      tz = getAthensTimezone(date);
    }
  }

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    'name': venue.name,
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': venue.address,
      'addressLocality': 'Athens',
      'addressRegion': venue.neighborhood || 'Attica',
      'addressCountry': 'GR'
    },
    'url': `${BASE_URL}/venues/${venue.slug}/`
  };

  // Add upcoming events as part of schema
  if (venue.events.length > 0) {
    schema.event = venue.events.slice(0, 10).map(event => {
      let startDate = event.startDate;
      if (!startDate.includes('+') && !startDate.includes('Z')) {
        startDate = startDate.includes('T') ? `${startDate}${tz}` : `${startDate}T00:00:00${tz}`;
      }

      return {
        '@type': 'Event',
        'name': event.title,
        'startDate': startDate,
        'url': `${BASE_URL}/events/${generateEventSlug(event)}/`
      };
    });
  }

  return JSON.stringify(schema, null, 2);
}

/**
 * Render venue page HTML
 */
function renderVenuePage(venue: VenueData): string {
  const canonicalUrl = `${BASE_URL}/venues/${venue.slug}/`;
  const schemaJson = generateVenueSchema(venue);

  // Group events by type for summary
  const eventsByType = new Map<string, number>();
  for (const event of venue.events) {
    const count = eventsByType.get(event.type) || 0;
    eventsByType.set(event.type, count + 1);
  }

  const typeSummary = Array.from(eventsByType.entries())
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');

  // Render event list
  const eventsHtml = venue.events.slice(0, 20).map(event => {
    const eventSlug = generateEventSlug(event);
    const isExhibition = event.type === 'exhibition';
    const dateDisplay = isExhibition
      ? formatExhibitionDateRange(event)
      : `${formatGreekDateOnly(event.startDate)} στις ${formatGreekTime(event.startDate)}`;
    const openNow = isExhibition && isCurrentlyOpen(event);

    return `
      <li class="venue-event-item ${isExhibition ? 'exhibition' : ''}">
        <a href="/events/${eventSlug}/">${event.title}</a>
        ${openNow ? '<span class="open-now-badge">Τώρα</span>' : ''}
        <span class="event-date">${dateDisplay}</span>
        <span class="event-type">${event.type}</span>
      </li>`;
  }).join('\n');

  const moreEventsNote = venue.events.length > 20
    ? `<p class="more-events">Εμφανίζονται 20 από ${venue.events.length} εκδηλώσεις</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${venue.name} - Εκδηλώσεις | agent-athens</title>
  <meta name="description" content="Επερχόμενες εκδηλώσεις στο ${venue.name}${venue.neighborhood ? `, ${venue.neighborhood}` : ''}, Αθήνα. ${venue.eventCount} εκδηλώσεις.">

  <!-- Canonical URL -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Open Graph -->
  <meta property="og:title" content="${venue.name} - Εκδηλώσεις">
  <meta property="og:description" content="${venue.eventCount} επερχόμενες εκδηλώσεις στο ${venue.name}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="place">
  <meta property="og:locale" content="el_GR">
  <meta property="og:site_name" content="agent-athens">

  <!-- GEO: Location metadata -->
  <meta name="geo.region" content="GR-I">
  <meta name="geo.placename" content="Athens">

  ${schemaJson ? `
  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  ${schemaJson}
  </script>
  ` : ''}

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }

    .breadcrumb { font-size: 0.9rem; color: #666; margin-bottom: 20px; }
    .breadcrumb a { color: #2980b9; text-decoration: none; }

    .venue-header { margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
    .venue-header h1 { font-size: 2rem; margin-bottom: 10px; }
    .venue-meta { color: #666; font-size: 1rem; }
    .venue-meta p { margin: 5px 0; }

    .venue-events { margin: 30px 0; }
    .venue-events h2 { font-size: 1.3rem; margin-bottom: 20px; }
    .venue-events ul { list-style: none; }
    .venue-event-item { padding: 15px 0; border-bottom: 1px solid #eee; display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: baseline; }
    .venue-event-item a { color: #2980b9; text-decoration: none; font-weight: 500; grid-column: 1; }
    .venue-event-item a:hover { text-decoration: underline; }
    .venue-event-item .event-date { color: #666; font-size: 0.9rem; }
    .venue-event-item .event-type { display: inline-block; background: #f0f0f0; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; color: #666; }
    .venue-event-item.exhibition { border-left: 3px solid #10b981; padding-left: 12px; }
    .open-now-badge { display: inline-block; background: #10b981; color: white; font-size: 0.7rem; padding: 1px 6px; border-radius: 8px; margin-left: 5px; vertical-align: middle; }
    .more-events { color: #666; font-style: italic; margin-top: 20px; }

    footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9rem; color: #666; }
    footer a { color: #2980b9; text-decoration: none; }
  </style>
</head>
<body>
  <nav class="breadcrumb">
    <a href="/">agent-athens</a> › <a href="/venues/">Χώροι</a> › ${venue.name}
  </nav>

  <header class="venue-header" itemscope itemtype="https://schema.org/Place">
    <h1 itemprop="name">${venue.name}</h1>
    <div class="venue-meta">
      ${venue.neighborhood ? `<p>Περιοχή: <strong>${venue.neighborhood}</strong></p>` : ''}
      ${venue.address ? `<p itemprop="address">${venue.address}</p>` : ''}
      <p>${venue.eventCount} επερχόμενες εκδηλώσεις ${typeSummary ? `(${typeSummary})` : ''}</p>
    </div>
  </header>

  <section class="venue-events">
    <h2>Επερχόμενες Εκδηλώσεις</h2>
    <ul>
      ${eventsHtml}
    </ul>
    ${moreEventsNote}
  </section>

  <footer>
    <p>
      <strong>agent-athens</strong> - Ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας
    </p>
    <p>
      <a href="/">Όλες οι Εκδηλώσεις</a> |
      <a href="/llms.txt">Για AI Agents</a>
    </p>
  </footer>
</body>
</html>`;
}

/**
 * Generate all venue pages
 * Returns list of generated URLs for sitemap
 */
export async function generateVenuePages(events: Event[]): Promise<string[]> {
  const venuesDir = join(DIST_DIR, 'venues');
  if (!existsSync(venuesDir)) {
    mkdirSync(venuesDir, { recursive: true });
  }

  // Group events by venue
  const venueMap = new Map<string, VenueData>();

  for (const event of events) {
    const slug = slugify(event.venue.name);
    let venueData = venueMap.get(slug);

    if (!venueData) {
      venueData = {
        name: event.venue.name,
        slug,
        address: event.venue.address,
        neighborhood: event.venue.neighborhood,
        events: [],
        eventCount: 0
      };
      venueMap.set(slug, venueData);
    }

    // Update with better data if available
    if (!venueData.address && event.venue.address) {
      venueData.address = event.venue.address;
    }
    if (!venueData.neighborhood && event.venue.neighborhood) {
      venueData.neighborhood = event.venue.neighborhood;
    }

    venueData.events.push(event);
    venueData.eventCount++;
  }

  // Sort events by date within each venue
  for (const venue of venueMap.values()) {
    venue.events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  const urls: string[] = [];
  let skipped = 0;

  for (const venue of venueMap.values()) {
    // Check minimum threshold
    if (!meetsMinimumThreshold(venue)) {
      skipped++;
      continue;
    }

    // Generate page HTML
    const html = renderVenuePage(venue);

    // Create directory and write file
    const pageDir = join(venuesDir, venue.slug);
    if (!existsSync(pageDir)) {
      mkdirSync(pageDir, { recursive: true });
    }
    writeFileSync(join(pageDir, 'index.html'), html);

    urls.push(`venues/${venue.slug}`);
  }

  // Generate venue index page
  generateVenueIndex(Array.from(venueMap.values()).filter(meetsMinimumThreshold));

  console.log(`  ✓ Generated ${urls.length} venue pages (${skipped} skipped - below threshold)`);
  return urls;
}

/**
 * Generate venue index page at /venues/
 */
function generateVenueIndex(venues: VenueData[]): void {
  // Sort by event count (most active first)
  const sortedVenues = [...venues].sort((a, b) => b.eventCount - a.eventCount);

  const venueListHtml = sortedVenues.map(venue => `
    <li>
      <a href="/venues/${venue.slug}/">${venue.name}</a>
      <span class="event-count">${venue.eventCount} εκδηλώσεις</span>
      ${venue.neighborhood ? `<span class="neighborhood">${venue.neighborhood}</span>` : ''}
    </li>
  `).join('\n');

  const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Χώροι Εκδηλώσεων Αθήνας | agent-athens</title>
  <meta name="description" content="Όλοι οι χώροι εκδηλώσεων στην Αθήνα με επερχόμενες συναυλίες, παραστάσεις, εκθέσεις και πολιτιστικά events.">

  <link rel="canonical" href="${BASE_URL}/venues/">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }

    header { margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
    header h1 { font-size: 2rem; margin-bottom: 10px; }
    .summary { color: #666; }

    .venue-list { list-style: none; }
    .venue-list li { padding: 15px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 10px; }
    .venue-list a { color: #2980b9; text-decoration: none; font-weight: 500; }
    .venue-list a:hover { text-decoration: underline; }
    .event-count { color: #666; font-size: 0.9rem; }
    .neighborhood { display: inline-block; background: #f0f0f0; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; color: #666; }

    footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9rem; color: #666; }
    footer a { color: #2980b9; }
  </style>
</head>
<body>
  <header>
    <h1>Χώροι Εκδηλώσεων</h1>
    <p class="summary">${venues.length} χώροι με επερχόμενες εκδηλώσεις στην Αθήνα</p>
  </header>

  <ul class="venue-list">
    ${venueListHtml}
  </ul>

  <footer>
    <p><a href="/">← Όλες οι Εκδηλώσεις</a></p>
  </footer>
</body>
</html>`;

  const venuesDir = join(DIST_DIR, 'venues');
  writeFileSync(join(venuesDir, 'index.html'), html);
}
