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

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Event } from '../types';
import { slugify, generateEventSlug } from './event-page';
import { formatGreekDateOnly, formatGreekTime } from '../utils/i18n';
import { BADGE_LABELS } from '../templates/page';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { getAthensTimezone } from '../enrichment/quality-gates';
import { generateVenueMetaDescription, generateVenueIndexMetaDescription } from '../utils/meta-descriptions';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks } from '../templates/site-chrome';

const DIST_DIR = join(import.meta.dir, '../../dist');
const BASE_URL = 'https://agentathens.netlify.app';

// Load IndexNow config for Bing WMT verification
const indexNowConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/indexnow.json'), 'utf-8')
);
const bingVerification: string = indexNowConfig.bing_wmt_verification || '';

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
function renderVenuePage(venue: VenueData, venueImageMap?: Map<string, string>): string {
  const canonicalUrl = `${BASE_URL}/venues/${venue.slug}/`;
  const schemaJson = generateVenueSchema(venue);
  const ogImage = venueImageMap?.get(venue.name) || `${BASE_URL}/images/og/agentathens-default.png`;

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
        <span class="event-type">${BADGE_LABELS[event.type] || event.type}</span>
      </li>`;
  }).join('\n');

  const moreEventsNote = venue.events.length > 20
    ? `<p class="more-events">Εμφανίζονται 20 από ${venue.events.length} εκδηλώσεις</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  <link rel="stylesheet" href="/styles/design-system.css">

  <title>${venue.name} - Εκδηλώσεις | agent-athens</title>
  <meta name="description" content="${generateVenueMetaDescription({ name: venue.name, neighborhood: venue.neighborhood, events: venue.events.slice(0, 1).map(e => ({ title: e.title, startDate: e.startDate })), eventCount: venue.eventCount })}">

  <!-- Canonical URL -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Language alternates -->
  <link rel="alternate" hreflang="el" href="${canonicalUrl}">
  <link rel="alternate" hreflang="en" href="${BASE_URL}/en/venues/${venue.slug}/">
  <link rel="alternate" hreflang="x-default" href="${BASE_URL}/en/venues/${venue.slug}/">

  <!-- Open Graph -->
  <meta property="og:title" content="${venue.name} - Εκδηλώσεις">
  <meta property="og:description" content="${venue.eventCount} επερχόμενες εκδηλώσεις στο ${venue.name}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="place">
  <meta property="og:locale" content="el_GR">
  <meta property="og:site_name" content="agent-athens">
  <meta property="og:image" content="${ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${venue.name} - Εκδηλώσεις">
  <meta name="twitter:description" content="${venue.eventCount} επερχόμενες εκδηλώσεις στο ${venue.name}">
  <meta name="twitter:image" content="${ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`}">

  <!-- GEO: Location metadata -->
  <meta name="geo.region" content="GR-I">
  <meta name="geo.placename" content="Athens">
  ${bingVerification ? `<meta name="msvalidate.01" content="${bingVerification}">` : ''}

  ${schemaJson ? `
  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  ${schemaJson}
  </script>
  ` : ''}

  <style>
    .venue-page-content { max-width: 800px; margin: 0 auto; padding: 20px; }

    .breadcrumb { font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 20px; }

    .venue-header { margin-bottom: 30px; border-bottom: 2px solid var(--border-default); padding-bottom: 20px; }
    .venue-header h1 { font-size: 2rem; margin-bottom: 10px; }
    .venue-meta { color: var(--text-secondary); font-size: 1rem; }
    .venue-meta p { margin: 5px 0; }

    .venue-events { margin: 30px 0; }
    .venue-events h2 { font-size: 1.3rem; margin-bottom: 20px; }
    .venue-events ul { list-style: none; }
    .venue-event-item { padding: 15px 0; border-bottom: 1px solid var(--border-subtle); display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: baseline; }
    .venue-event-item a { font-weight: 500; grid-column: 1; }
    .venue-event-item .event-date { color: var(--text-secondary); font-size: 0.9rem; }
    .venue-event-item .event-type { display: inline-block; background: var(--bg-surface); font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; color: var(--text-secondary); }
    .venue-event-item.exhibition { border-left: 3px solid #10b981; padding-left: 12px; }
    .open-now-badge { display: inline-block; background: #10b981; color: white; font-size: 0.7rem; padding: 1px 6px; border-radius: 8px; margin-left: 5px; vertical-align: middle; }
    .more-events { color: var(--text-secondary); font-style: italic; margin-top: 20px; }
  </style>
</head>
<body>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}

  <div class="venue-page-content">
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
  </div>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
</body>
</html>`;
}

/**
 * Generate all venue pages
 * Returns list of generated URLs for sitemap
 */
export async function generateVenuePages(events: Event[], venueImageMap?: Map<string, string>): Promise<string[]> {
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
    const html = renderVenuePage(venue, venueImageMap);

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
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  <link rel="stylesheet" href="/styles/design-system.css">

  <title>Χώροι Εκδηλώσεων Αθήνας | agent-athens</title>
  <meta name="description" content="${generateVenueIndexMetaDescription(venues.length)}">

  <link rel="canonical" href="${BASE_URL}/venues/">

  <!-- Language alternates -->
  <link rel="alternate" hreflang="el" href="${BASE_URL}/venues/">
  <link rel="alternate" hreflang="en" href="${BASE_URL}/en/venues/">
  <link rel="alternate" hreflang="x-default" href="${BASE_URL}/en/venues/">
  ${bingVerification ? `<meta name="msvalidate.01" content="${bingVerification}">` : ''}

  <!-- Open Graph -->
  <meta property="og:title" content="Χώροι Εκδηλώσεων Αθήνας">
  <meta property="og:description" content="${venues.length} χώροι με επερχόμενες εκδηλώσεις στην Αθήνα">
  <meta property="og:url" content="${BASE_URL}/venues/">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="el_GR">
  <meta property="og:site_name" content="agent-athens">
  <meta property="og:image" content="${BASE_URL}/images/og/agentathens-default.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Χώροι Εκδηλώσεων Αθήνας">
  <meta name="twitter:description" content="${venues.length} χώροι με επερχόμενες εκδηλώσεις στην Αθήνα">
  <meta name="twitter:image" content="${BASE_URL}/images/og/agentathens-default.png">

  <style>
    .venue-index-content { max-width: 800px; margin: 0 auto; padding: 20px; }

    .venue-index-header { margin-bottom: 30px; border-bottom: 2px solid var(--border-default); padding-bottom: 20px; }
    .venue-index-header h1 { font-size: 2rem; margin-bottom: 10px; }
    .summary { color: var(--text-secondary); }

    .venue-list { list-style: none; }
    .venue-list li { padding: 15px 0; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 10px; }
    .venue-list a { font-weight: 500; }
    .event-count { color: var(--text-secondary); font-size: 0.9rem; }
    .neighborhood { display: inline-block; background: var(--bg-surface); font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; color: var(--text-secondary); }
  </style>
</head>
<body>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}

  <div class="venue-index-content">
    <header class="venue-index-header">
      <h1>Χώροι Εκδηλώσεων</h1>
      <p class="summary">${venues.length} χώροι με επερχόμενες εκδηλώσεις στην Αθήνα</p>
    </header>

    <ul class="venue-list">
      ${venueListHtml}
    </ul>
  </div>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
</body>
</html>`;

  const venuesDir = join(DIST_DIR, 'venues');
  writeFileSync(join(venuesDir, 'index.html'), html);
}
