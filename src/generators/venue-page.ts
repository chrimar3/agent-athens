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

import { mkdirSync, existsSync, readFileSync } from 'fs';
import { writeHtmlIfChangedSync } from '../utils/write-if-changed';
import { join } from 'path';
import type { Event } from '../types';
import { slugify, generateEventSlug } from './event-page';
import { renderEventCardList } from '../templates/card-variants';
import { formatSchemaDate, SCHEMA_TYPE_MAP } from '../enrichment/quality-gates';
import { generateVenueMetaDescription, generateVenueIndexMetaDescription } from '../utils/meta-descriptions';
import { displayNeighborhood } from '../utils/neighborhoods';
import { buildContainedInPlace, getCountryCode, getRegionName } from '../utils/schema-geo';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks, renderCssLink } from '../templates/site-chrome';
import { renderSearchOverlay, renderSearchScript } from '../templates/search-overlay';

const DIST_DIR = join(import.meta.dir, '../../dist');
import { BASE_URL } from '../config/site-url';
import { renderAnalytics } from '../config/analytics';

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
  coordinates?: { lat: number; lon: number };
  sameAs?: string[];
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

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    'name': venue.name,
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': venue.address,
      'addressLocality': 'Athens',
      'addressRegion': getRegionName(),
      'addressCountry': getCountryCode()
    },
    'url': `${BASE_URL}/venues/${venue.slug}/`,
    'containedInPlace': buildContainedInPlace(venue.neighborhood),
    ...(venue.sameAs && venue.sameAs.length > 0 ? { sameAs: venue.sameAs } : {})
  };

  // Add geo coordinates if real (not the generic Athens center fallback)
  if (venue.coordinates) {
    const isGenericCoord =
      Math.abs(venue.coordinates.lat - 37.9838) < 0.0001 &&
      Math.abs(venue.coordinates.lon - 23.7276) < 0.0001;
    if (!isGenericCoord) {
      schema.geo = {
        '@type': 'GeoCoordinates',
        'latitude': venue.coordinates.lat,
        'longitude': venue.coordinates.lon
      };
    }
  }

  // Add upcoming events as part of schema. formatSchemaDate handles date-only
  // passthrough and DST-aware offset appending for naive-ts.
  if (venue.events.length > 0) {
    schema.event = venue.events.slice(0, 10).map(event => ({
      '@type': SCHEMA_TYPE_MAP[event.type] || 'Event',
      'name': event.title,
      'startDate': formatSchemaDate(event.startDate),
      'url': `${BASE_URL}/events/${generateEventSlug(event)}/`
    }));
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

  // Render event list using list card variant
  const eventsHtml = venue.events.slice(0, 20).map(event => {
    return renderEventCardList(event);
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
  ${renderFontLinks()}
  ${renderCssLink()}

  <title>${venue.name} - Εκδηλώσεις | agent-athens</title>
  <meta name="description" content="${generateVenueMetaDescription({ name: venue.name, neighborhood: venue.neighborhood, events: venue.events.slice(0, 1).map(e => ({ title: e.title, startDate: e.startDate })), eventCount: venue.eventCount })}">

  <!-- Canonical URL -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Language alternates -->
  <link rel="alternate" hreflang="el" href="${canonicalUrl}">

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

${renderAnalytics()}
</head>
<body>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}
  ${renderSearchOverlay()}

  <main class="venue-page-content" id="main-content" tabindex="-1">
    <nav class="breadcrumb">
      <a href="/">agent-athens</a> › <a href="/venues/">Χώροι</a> › ${venue.name}
    </nav>

    <header class="venue-header" itemscope itemtype="https://schema.org/Place">
      <h1 itemprop="name">${venue.name}</h1>
      <div class="venue-meta">
        ${venue.neighborhood ? `<p>Περιοχή: <strong>${displayNeighborhood(venue.neighborhood)}</strong></p>` : ''}
        ${venue.address ? `<p itemprop="address">${venue.address}</p>` : ''}
        <p>${venue.eventCount} επερχόμενες εκδηλώσεις ${typeSummary ? `(${typeSummary})` : ''}</p>
      </div>
    </header>

    ${(() => {
      if (!venue.coordinates) return '';
      const isGenericCoord =
        Math.abs(venue.coordinates.lat - 37.9838) < 0.0001 &&
        Math.abs(venue.coordinates.lon - 23.7276) < 0.0001;
      if (isGenericCoord) return '';
      const c = venue.coordinates;
      return `<section class="venue-map">
        <h2>Χάρτης</h2>
        <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${c.lon - 0.005},${c.lat - 0.005},${c.lon + 0.005},${c.lat + 0.005}&marker=${c.lat},${c.lon}"
          width="100%" height="300" loading="lazy"
          title="Χάρτης — ${venue.name}"></iframe>
        <small class="venue-map-attribution">&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></small>
      </section>`;
    })()}

    <section class="venue-events">
      <h2>Επερχόμενες Εκδηλώσεις</h2>
      <div class="venue-event-list">
        ${eventsHtml}
      </div>
      ${moreEventsNote}
    </section>
  </main>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
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
        coordinates: event.venue.coordinates,
        sameAs: event.venue.sameAs,
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
    if (!venueData.coordinates && event.venue.coordinates) {
      venueData.coordinates = event.venue.coordinates;
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
    writeHtmlIfChangedSync(join(pageDir, 'index.html'), html);

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
  // Defensive guard: filter out malformed venues with empty/missing slugs so
  // neither the HTML link list (<a href="/venues/${slug}/">) nor the JSON-LD
  // ItemList emit broken `/venues//` URLs. Data anomaly surfaced by the S136
  // citability audit follow-through (venue-index-jsonld.test.ts).
  const validVenues = venues.filter(v => v.slug && v.slug.length > 0);
  const droppedCount = venues.length - validVenues.length;
  if (droppedCount > 0) {
    console.warn(`  ⚠ generateVenueIndex: skipped ${droppedCount} venue(s) with empty slug`);
  }
  // Sort by event count (most active first)
  const sortedVenues = [...validVenues].sort((a, b) => b.eventCount - a.eventCount);

  const venueListHtml = sortedVenues.map(venue => `
    <li>
      <a href="/venues/${venue.slug}/">${venue.name}</a>
      <span class="event-count">${venue.eventCount} εκδηλώσεις</span>
      ${venue.neighborhood ? `<span class="neighborhood">${displayNeighborhood(venue.neighborhood)}</span>` : ''}
    </li>
  `).join('\n');

  // S136 citability audit Item 4: emit CollectionPage + ItemList JSON-LD.
  // Cap matches HUB_EVENT_LIMIT convention (page.ts:42); numberOfItems
  // reflects full venue count even when itemListElement is sliced.
  const VENUES_INDEX_LIMIT = 30;
  const venuesJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Χώροι Εκδηλώσεων Αθήνας | Event Venues in Athens',
    description: `${sortedVenues.length} event venues in Athens with upcoming concerts, exhibitions, performances`,
    inLanguage: 'el',
    url: `${BASE_URL}/venues/`,
    about: {
      '@type': 'Place',
      name: 'Athens',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Athens',
        addressCountry: 'GR',
      },
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: sortedVenues.length,
      itemListElement: sortedVenues.slice(0, VENUES_INDEX_LIMIT).map((venue, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        item: {
          '@type': 'Place',
          name: venue.name,
          url: `${BASE_URL}/venues/${venue.slug}/`,
        },
      })),
    },
  };
  const venuesJsonLdScript = `<script type="application/ld+json">\n${JSON.stringify(venuesJsonLd, null, 2)}\n  </script>`;

  const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  ${renderCssLink()}

  <title>Χώροι Εκδηλώσεων Αθήνας | agent-athens</title>
  <meta name="description" content="${generateVenueIndexMetaDescription(venues.length)}">

  ${venuesJsonLdScript}

  <link rel="canonical" href="${BASE_URL}/venues/">

  <!-- Language alternates -->
  <link rel="alternate" hreflang="el" href="${BASE_URL}/venues/">
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

${renderAnalytics()}
</head>
<body>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}
  ${renderSearchOverlay()}

  <main class="venue-index-content">
    <header class="venue-index-header">
      <h1>Χώροι Εκδηλώσεων</h1>
      <p class="summary">${venues.length} χώροι με επερχόμενες εκδηλώσεις στην Αθήνα</p>
    </header>

    <ul class="venue-list">
      ${venueListHtml}
    </ul>
  </main>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
</body>
</html>`;

  const venuesDir = join(DIST_DIR, 'venues');
  writeHtmlIfChangedSync(join(venuesDir, 'index.html'), html);
}
