/**
 * Individual Event Page Generator
 *
 * Generates individual event detail pages at /events/[slug]/
 * with full Schema.org markup, OG tags, and internal linking.
 *
 * Slug format: [event-id-prefix]-[venue-slug]-[title-slug]
 * The event ID prefix ensures URL stability when titles change.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Event } from '../types';
import { generatePracticalBlock, generateInlinePractical } from './practical-block';
import { formatGreekDateOnly, formatGreekTime, formatPriceGreek, toSchemaOrg } from '../utils/i18n';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { getAthensTimezone, SCHEMA_TYPE_MAP } from '../enrichment/quality-gates';
import { stripInfoTable } from '../utils/description-utils';

const DIST_DIR = join(import.meta.dir, '../../dist');
const BASE_URL = 'https://agentathens.netlify.app';

// Load IndexNow config for Bing WMT verification
const indexNowConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/indexnow.json'), 'utf-8')
);
const bingVerification: string = indexNowConfig.bing_wmt_verification || '';

// Default OG images by event type
const DEFAULT_OG_IMAGES: Record<string, string> = {
  concert: '/images/og/concert-default.jpg',
  dj_set: '/images/og/dj-default.jpg',
  classical: '/images/og/classical-default.jpg',
  opera: '/images/og/classical-default.jpg',
  theater: '/images/og/theater-default.jpg',
  dance: '/images/og/dance-default.jpg',
  comedy: '/images/og/comedy-default.jpg',
  exhibition: '/images/og/exhibition-default.jpg',
  screening: '/images/og/cinema-default.jpg',
  cinema: '/images/og/cinema-default.jpg',
  workshop: '/images/og/workshop-default.jpg',
  show: '/images/og/show-default.jpg',
  festival: '/images/og/festival-default.jpg',
  performance: '/images/og/performance-default.jpg',
  default: '/images/og/agentathens-default.jpg'
};

// Type translations for Greek display
const TYPE_TRANSLATIONS: Record<string, string> = {
  concert: 'Συναυλία',
  dj_set: 'DJ Set',
  classical: 'Κλασική Μουσική',
  opera: 'Όπερα',
  theater: 'Θέατρο',
  dance: 'Χορός',
  comedy: 'Κωμωδία',
  exhibition: 'Έκθεση',
  screening: 'Προβολή',
  cinema: 'Κινηματογράφος',
  workshop: 'Εργαστήριο',
  show: 'Show',
  festival: 'Φεστιβάλ',
  performance: 'Παράσταση',
  other: 'Εκδήλωση'
};

// Type to category slug mapping for internal links
const TYPE_TO_CATEGORY: Record<string, string> = {
  concert: 'concerts',
  dj_set: 'clubs',
  classical: 'concerts',
  opera: 'concerts',
  theater: 'theatre',
  dance: 'dance',
  comedy: 'comedy',
  exhibition: 'exhibitions',
  screening: 'screenings',
  cinema: 'cinema',
  workshop: 'workshops',
  show: 'comedy',
  festival: 'concerts',
  performance: 'theatre',
  other: ''
};

/**
 * Generate a URL-safe slug from text
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')       // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '')           // Remove leading/trailing dashes
    .substring(0, 60);                 // Cap length
}

/**
 * Generate a stable slug for an event
 * Format: [id-prefix]-[venue-slug]-[title-slug]
 */
export function generateEventSlug(event: Event): string {
  const idPrefix = event.id.substring(0, 8);
  const venueSlug = slugify(event.venue.name);
  const titleSlug = slugify(event.title);
  return `${idPrefix}-${venueSlug}-${titleSlug}`;
}

/**
 * Get the OG image URL for an event
 * Fallback chain: event image → venue default → type default → site default
 */
function getOgImage(event: Event): string {
  // TODO: Check for event-specific image from scraping
  // TODO: Check for venue-specific default image

  // Use type-specific default
  return DEFAULT_OG_IMAGES[event.type] || DEFAULT_OG_IMAGES.default;
}

/**
 * Generate Schema.org JSON-LD for an individual event page
 */
function generateEventSchema(event: Event): string {
  const schemaType = SCHEMA_TYPE_MAP[event.type] || 'Event';
  const eventSlug = generateEventSlug(event);

  // Parse date for timezone
  const dateMatch = event.startDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let tz = '+02:00';
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    tz = getAthensTimezone(date);
  }

  // Format start date with correct timezone
  let startDate = event.startDate;
  if (!startDate.includes('+') && !startDate.includes('Z')) {
    if (!startDate.includes('T')) {
      startDate = `${startDate}T00:00:00${tz}`;
    } else {
      startDate = `${startDate}${tz}`;
    }
  }

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    'name': event.title,
    'description': event.fullDescription || event.description,
    'startDate': startDate,
    'eventStatus': 'https://schema.org/EventScheduled',
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'url': `${BASE_URL}/events/${eventSlug}/`,
    'location': {
      '@type': schemaType === 'MusicEvent' ? 'MusicVenue' : 'Place',
      'name': event.venue.name,
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': event.venue.address || '',
        'addressLocality': 'Athens',
        'addressRegion': 'Attica',
        'addressCountry': 'GR'
      }
    }
  };

  // Add end date for exhibitions
  if (event.endDate) {
    let endDate = event.endDate;
    if (!endDate.includes('+') && !endDate.includes('Z')) {
      if (!endDate.includes('T')) {
        endDate = `${endDate}T23:59:59${tz}`;
      } else {
        endDate = `${endDate}${tz}`;
      }
    }
    schema.endDate = endDate;
  }

  // Add coordinates if available
  if (event.venue.coordinates) {
    schema.location.geo = {
      '@type': 'GeoCoordinates',
      'latitude': event.venue.coordinates.lat,
      'longitude': event.venue.coordinates.lon
    };
  }

  // Add pricing — isAccessibleForFree + complete offers for ALL events
  if (event.price.type === 'open' || event.price.type === 'donation') {
    schema.isAccessibleForFree = true;
    schema.offers = {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'EUR',
      'availability': 'https://schema.org/InStock',
      'url': `${BASE_URL}/events/${eventSlug}/`
    };
  } else {
    schema.isAccessibleForFree = false;
    schema.offers = {
      '@type': 'Offer',
      'price': event.price.amount ? event.price.amount.toString() : '',
      'priceCurrency': event.price.currency || 'EUR',
      'availability': 'https://schema.org/InStock',
      'url': event.ticketUrl || event.url || `${BASE_URL}/events/${eventSlug}/`,
      'validFrom': event.createdAt || startDate
    };
  }

  // Add image if available
  const ogImage = getOgImage(event);
  if (ogImage) {
    schema.image = `${BASE_URL}${ogImage}`;
  }

  return JSON.stringify(schema, null, 2);
}

/**
 * Render the event detail HTML template
 */
function renderEventDetailPage(event: Event, relatedEvents: Event[]): string {
  const slug = generateEventSlug(event);
  const canonicalUrl = `${BASE_URL}/events/${slug}/`;
  const ogImage = getOgImage(event);
  const schemaJson = generateEventSchema(event);
  const practicalBlock = generatePracticalBlock(event, null);
  const inlinePractical = practicalBlock ? '' : generateInlinePractical(event);

  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  // Date display
  const dateDisplay = isExhibition
    ? formatExhibitionDateRange(event)
    : `${formatGreekDateOnly(event.startDate)} στις ${formatGreekTime(event.startDate)}`;

  // Type badge
  const typeLabel = TYPE_TRANSLATIONS[event.type] || event.type;
  const categorySlug = TYPE_TO_CATEGORY[event.type] || '';

  // Description content — strip Info metadata table from enriched descriptions
  const hasFullDescription = event.fullDescription && event.fullDescription.length > 100;
  let descriptionHtml: string;
  let hiddenMetadataHtml = '';
  if (hasFullDescription) {
    const { narrative, metadataHtml } = stripInfoTable(String(event.fullDescription));
    descriptionHtml = narrative.split('\n\n').map(para => `<p>${para.trim()}</p>`).join('\n');
    hiddenMetadataHtml = metadataHtml;
  } else {
    descriptionHtml = `<p>${event.description}</p>`;
  }

  // Related events (max 5, upcoming only)
  const relatedHtml = relatedEvents.length > 0
    ? `
    <section class="related-events">
      <h3>Επόμενες εκδηλώσεις στο ${event.venue.name}</h3>
      <ul>
        ${relatedEvents.map(e => {
          const relSlug = generateEventSlug(e);
          const relDate = e.type === 'exhibition' ? formatExhibitionDateRange(e) : formatGreekDateOnly(e.startDate);
          return `<li><a href="/events/${relSlug}/">${e.title}</a> - ${relDate}</li>`;
        }).join('\n        ')}
      </ul>
    </section>`
    : '';

  // Internal navigation links
  const venueSlug = slugify(event.venue.name);
  const neighborhoodSlug = event.venue.neighborhood ? slugify(event.venue.neighborhood) : '';

  const navLinks = [
    categorySlug ? `<a href="/${categorySlug}/">Όλες οι ${typeLabel}</a>` : '',
    `<a href="/venues/${venueSlug}/">Περισσότερες εκδηλώσεις στο ${event.venue.name}</a>`,
    neighborhoodSlug ? `<a href="/neighborhoods/${neighborhoodSlug}/">Εκδηλώσεις στην περιοχή ${event.venue.neighborhood}</a>` : ''
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${event.title} | ${event.venue.name} | agent-athens</title>
  <meta name="description" content="${event.description.substring(0, 160)}">

  <!-- Canonical URL (single source of truth) -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Language alternates -->
  <link rel="alternate" hreflang="el" href="${canonicalUrl}">
  <link rel="alternate" hreflang="en" href="${BASE_URL}/en/events/${slug}/">
  <link rel="alternate" hreflang="x-default" href="${BASE_URL}/en/events/${slug}/">

  <!-- Open Graph -->
  <meta property="og:title" content="${event.title}">
  <meta property="og:description" content="${event.description.substring(0, 200)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="event">
  <meta property="og:image" content="${BASE_URL}${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="el_GR">
  <meta property="og:site_name" content="agent-athens">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${event.title}">
  <meta name="twitter:description" content="${event.description.substring(0, 200)}">
  <meta name="twitter:image" content="${BASE_URL}${ogImage}">

  <!-- GEO: Location metadata -->
  <meta name="geo.region" content="GR-I">
  <meta name="geo.placename" content="Athens">
  ${bingVerification ? `<meta name="msvalidate.01" content="${bingVerification}">` : ''}

  <!-- Freshness signals -->
  <meta name="date" content="${new Date().toISOString().split('T')[0]}">

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  ${schemaJson}
  </script>

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }

    .breadcrumb { font-size: 0.9rem; color: #666; margin-bottom: 20px; }
    .breadcrumb a { color: #2980b9; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }

    .event-header { margin-bottom: 30px; }
    .event-header h1 { font-size: 2rem; margin-bottom: 10px; line-height: 1.3; }
    .event-meta-inline { color: #666; font-size: 1.1rem; margin-bottom: 15px; }
    .type-badge { display: inline-block; background: #2980b9; color: white; font-size: 0.8rem; padding: 4px 12px; border-radius: 15px; margin-right: 10px; }
    .type-badge.exhibition { background: #10b981; }
    .open-now-badge { display: inline-block; background: #10b981; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 500; }

    .event-description { margin: 30px 0; }
    .event-description p { font-size: 1.1rem; line-height: 1.8; margin-bottom: 15px; }
    .enriched-badge { display: inline-block; background: #7c3aed; color: white; font-size: 0.75rem; padding: 4px 10px; border-radius: 12px; margin-top: 10px; }

    .event-connections { margin: 30px 0; padding: 20px; background: #f5f5f5; border-radius: 8px; }
    .event-connections h3 { font-size: 1rem; margin-bottom: 10px; }
    .event-connections a { display: block; color: #2980b9; text-decoration: none; margin-bottom: 8px; }
    .event-connections a:hover { text-decoration: underline; }

    .related-events { margin: 30px 0; }
    .related-events h3 { font-size: 1.1rem; margin-bottom: 15px; }
    .related-events ul { list-style: none; }
    .related-events li { padding: 8px 0; border-bottom: 1px solid #eee; }
    .related-events a { color: #2980b9; text-decoration: none; }
    .related-events a:hover { text-decoration: underline; }

    footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9rem; color: #666; }
    footer a { color: #2980b9; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <nav class="breadcrumb">
    <a href="/">agent-athens</a>
    ${categorySlug ? ` › <a href="/${categorySlug}/">${typeLabel}</a>` : ''}
    › ${event.venue.name}
  </nav>

  <article class="event-detail" itemscope itemtype="https://schema.org/${event['@type'] || 'Event'}">
    <header class="event-header">
      <span class="type-badge${isExhibition ? ' exhibition' : ''}">${typeLabel}</span>
      ${exhibitionIsOpen ? '<span class="open-now-badge">Τώρα ανοιχτή</span>' : ''}
      <h1 itemprop="name">${event.title}</h1>
      <p class="event-meta-inline">
        <time itemprop="startDate" datetime="${event.startDate}">${dateDisplay}</time>
        ${inlinePractical ? ` | ${formatPriceGreek(event)}` : ''}
        | <span itemprop="location" itemscope itemtype="https://schema.org/Place"><span itemprop="name">${event.venue.name}</span></span>
      </p>
    </header>

    <section class="event-description" itemprop="description">
      ${descriptionHtml}
      ${hasFullDescription ? '<div class="enriched-badge">AI-enriched content</div>' : ''}
    </section>
    ${hiddenMetadataHtml}

    ${practicalBlock}

    <nav class="event-connections" aria-label="Σχετικές σελίδες">
      <h3>Εξερευνήστε περισσότερα</h3>
      ${navLinks.join('\n      ')}
    </nav>

    ${relatedHtml}
  </article>

  <footer>
    <p>
      <strong>agent-athens</strong> - Ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας με τεχνητή νοημοσύνη
    </p>
    <p>
      <a href="/">Όλες οι Εκδηλώσεις</a> |
      <a href="/llms.txt">Για AI Agents</a> |
      <a href="https://github.com/chrimar3/agent-athens">GitHub</a>
    </p>
  </footer>
</body>
</html>`;
}

/**
 * Generate all individual event pages
 * Returns list of generated URLs for sitemap
 */
export async function generateEventPages(events: Event[]): Promise<{
  urls: string[];
  slugMap: Map<string, string>;  // eventId -> current slug
}> {
  const eventsDir = join(DIST_DIR, 'events');
  if (!existsSync(eventsDir)) {
    mkdirSync(eventsDir, { recursive: true });
  }

  const urls: string[] = [];
  const slugMap = new Map<string, string>();

  // Group events by venue for related events lookup
  const eventsByVenue = new Map<string, Event[]>();
  for (const event of events) {
    const venueEvents = eventsByVenue.get(event.venue.name) || [];
    venueEvents.push(event);
    eventsByVenue.set(event.venue.name, venueEvents);
  }

  for (const event of events) {
    const slug = generateEventSlug(event);
    slugMap.set(event.id, slug);

    // Get related events at same venue (max 5, excluding current)
    const venueEvents = eventsByVenue.get(event.venue.name) || [];
    const relatedEvents = venueEvents
      .filter(e => e.id !== event.id)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 5);

    // Generate page HTML
    const html = renderEventDetailPage(event, relatedEvents);

    // Create directory and write file
    const pageDir = join(eventsDir, slug);
    if (!existsSync(pageDir)) {
      mkdirSync(pageDir, { recursive: true });
    }
    writeFileSync(join(pageDir, 'index.html'), html);

    urls.push(`events/${slug}`);
  }

  console.log(`  ✓ Generated ${urls.length} event pages`);
  return { urls, slugMap };
}

/**
 * Load previous slug map for redirect generation
 */
export function loadSlugHistory(): Map<string, string[]> {
  const historyPath = join(DIST_DIR, '.slug-history.json');
  if (!existsSync(historyPath)) {
    return new Map();
  }

  try {
    const data = JSON.parse(readFileSync(historyPath, 'utf-8'));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

/**
 * Save slug map for future redirect generation
 */
export function saveSlugHistory(
  currentSlugs: Map<string, string>,
  previousHistory: Map<string, string[]>
): void {
  const historyPath = join(DIST_DIR, '.slug-history.json');

  // Merge current slugs into history
  const newHistory: Record<string, string[]> = {};

  for (const [eventId, currentSlug] of currentSlugs) {
    const previous = previousHistory.get(eventId) || [];
    // Keep only unique slugs, most recent first
    const allSlugs = [currentSlug, ...previous.filter(s => s !== currentSlug)];
    // Keep max 3 historical slugs (90 days worth)
    newHistory[eventId] = allSlugs.slice(0, 3);
  }

  writeFileSync(historyPath, JSON.stringify(newHistory, null, 2));
}

/**
 * Generate redirect rules for changed slugs
 */
export function generateRedirects(
  currentSlugs: Map<string, string>,
  previousHistory: Map<string, string[]>
): string[] {
  const redirects: string[] = [];

  for (const [eventId, currentSlug] of currentSlugs) {
    const previousSlugs = previousHistory.get(eventId) || [];
    for (const oldSlug of previousSlugs) {
      if (oldSlug !== currentSlug) {
        // Generate 301 redirect
        redirects.push(`/events/${oldSlug}/* /events/${currentSlug}/:splat 301`);
      }
    }
  }

  return redirects;
}

// Export for use in i18n.ts
export { getAthensTimezone };
