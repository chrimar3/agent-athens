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
import { generatePracticalBlock } from './practical-block';
import { formatGreekDateOnly, formatGreekTime, formatPriceGreek } from '../utils/i18n';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { getAthensTimezone, SCHEMA_TYPE_MAP } from '../enrichment/quality-gates';
import { stripInfoTable } from '../utils/description-utils';
import { generateEventMetaDescription } from '../utils/meta-descriptions';
import { normalizeGreek } from '../utils/normalize-greek';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks } from '../templates/site-chrome';
import { renderSearchOverlay, renderSearchScript } from '../templates/search-overlay';
import { BADGE_LABELS, LIGHT_TEXT_BADGES, TYPE_ICONS } from '../templates/page';

const DIST_DIR = join(import.meta.dir, '../../dist');
const BASE_URL = 'https://agentathens.netlify.app';

// Load IndexNow config for Bing WMT verification
const indexNowConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/indexnow.json'), 'utf-8')
);
const bingVerification: string = indexNowConfig.bing_wmt_verification || '';

// Default OG images by event type
const DEFAULT_OG_IMAGES: Record<string, string> = {
  concert: '/images/og/concert-default.png',
  dj_set: '/images/og/dj-set-default.png',
  classical: '/images/og/classical-default.png',
  opera: '/images/og/opera-default.png',
  theater: '/images/og/theater-default.png',
  dance: '/images/og/dance-default.png',
  comedy: '/images/og/comedy-default.png',
  exhibition: '/images/og/exhibition-default.png',
  screening: '/images/og/screening-default.png',
  cinema: '/images/og/cinema-default.png',
  workshop: '/images/og/workshop-default.png',
  show: '/images/og/show-default.png',
  festival: '/images/og/festival-default.png',
  performance: '/images/og/performance-default.png',
  conference: '/images/og/conference-default.png',
  meetup: '/images/og/agentathens-default.png',
  hackathon: '/images/og/agentathens-default.png',
  seminar: '/images/og/agentathens-default.png',
  default: '/images/og/agentathens-default.png'
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

// Pre-composed article + plural for discovery links (Greek grammar)
const TYPE_DISCOVERY_LABELS: Record<string, string> = {
  concert: 'Όλες οι Συναυλίες',
  dj_set: 'Όλα τα DJ Sets',
  theater: 'Όλες οι Θεατρικές Παραστάσεις',
  exhibition: 'Όλες οι Εκθέσεις',
  screening: 'Όλες οι Προβολές',
  cinema: 'Όλες οι Ταινίες',
  workshop: 'Όλα τα Εργαστήρια',
  show: 'Όλα τα Shows',
  festival: 'Όλα τα Φεστιβάλ',
  performance: 'Όλες οι Παραστάσεις',
  tech: 'Όλα τα Tech Events',
  other: 'Όλες οι Εκδηλώσεις',
};

// Type to category slug mapping for internal links
const TYPE_TO_CATEGORY: Record<string, string> = {
  concert: 'concerts',
  dj_set: 'clubs',
  theater: 'theatre',
  exhibition: 'exhibitions',
  screening: 'screenings',
  cinema: 'cinema',
  workshop: 'workshops',
  show: 'comedy',
  festival: 'concerts',
  performance: 'performances',
  tech: 'tech',
  other: ''
};

/**
 * Generate a URL-safe slug from text
 */
export function slugify(text: string): string {
  return normalizeGreek(text)
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
  // Prefer self-hosted image, then hotlinked source image
  if (event.imageLocal) return event.imageLocal;
  if (event.imageUrl) return event.imageUrl;

  // Fall back to venue image if available
  if (event.venueImage) return event.venueImage;

  // Fall back to type-specific default
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
    schema.image = ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`;
  }

  return JSON.stringify(schema, null, 2);
}

/**
 * Render the event detail HTML template (Phase 3 redesign)
 *
 * Structure: full-bleed hero with type-colored gradient, 800px content column,
 * card-grid related events, mobile sticky CTA bar.
 */
export function renderEventDetailPage(event: Event, relatedEvents: Event[]): string {
  const slug = generateEventSlug(event);
  const canonicalUrl = `${BASE_URL}/events/${slug}/`;
  const ogImage = getOgImage(event);
  const schemaJson = generateEventSchema(event);
  const practicalBlock = generatePracticalBlock(event, null);
  const schemaType = SCHEMA_TYPE_MAP[event.type] || 'Event';

  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  // Date display — time extraction with fallback (matches listing card logic in page.ts)
  const timeStr = event.startDate.includes('T')
    ? formatGreekTime(event.startDate)
    : (event.timeDoors || '');
  const dateDisplay = isExhibition
    ? formatExhibitionDateRange(event)
    : `${formatGreekDateOnly(event.startDate)}${timeStr ? ` στις ${timeStr}` : ''}`;

  // Type styling
  const typeLabel = TYPE_TRANSLATIONS[event.type] || event.type;
  const categorySlug = TYPE_TO_CATEGORY[event.type] || '';
  const typeColorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type);

  // Price display
  const priceDisplay = formatPriceGreek(event);

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

  // Read-more for long descriptions
  const descriptionText = hasFullDescription ? String(event.fullDescription) : event.description;
  const needsReadMore = descriptionText.length > 400;

  // Internal navigation links
  const venueSlug = slugify(event.venue.name);
  const neighborhoodSlug = event.venue.neighborhood ? slugify(event.venue.neighborhood) : '';

  const navLinks = [
    categorySlug ? `<a href="/${categorySlug}/">${TYPE_DISCOVERY_LABELS[event.type] || `Όλες οι ${typeLabel}`}</a>` : '',
    `<a href="/venues/${venueSlug}/">Περισσότερες εκδηλώσεις στο ${event.venue.name}</a>`,
    neighborhoodSlug ? `<a href="/neighborhoods/${neighborhoodSlug}/">Εκδηλώσεις στην περιοχή ${event.venue.neighborhood}</a>` : ''
  ].filter(Boolean);

  // CTA (ticket link)
  const hasTicketUrl = Boolean(event.ticketUrl);
  const ctaHtml = hasTicketUrl
    ? `<a href="${event.ticketUrl}" class="edp-cta edp-cta-hero${lightText ? ' edp-cta--light-text' : ''}" rel="noopener" target="_blank">Αγοράστε εισιτήρια →</a>`
    : '';

  // Venue section — Google Maps link
  const mapsUrl = event.venue.coordinates
    ? `https://www.google.com/maps?q=${event.venue.coordinates.lat},${event.venue.coordinates.lon}`
    : `https://www.google.com/maps/search/${encodeURIComponent(event.venue.name + ' Athens')}`;

  // Source attribution
  const sourceHtml = event.url
    ? `<div class="edp-source">Πηγή: <a href="${event.url}" rel="noopener" target="_blank">${event.source}</a></div>`
    : `<div class="edp-source">Πηγή: ${event.source}</div>`;

  // Related events as cards
  const relatedHtml = relatedEvents.length > 0
    ? `
      <section class="edp-related">
        <h3>Επόμενες εκδηλώσεις στο ${event.venue.name}</h3>
        <div class="card-grid">
          ${relatedEvents.map(e => renderRelatedEventCard(e)).join('\n')}
        </div>
      </section>`
    : '';

  // Mobile sticky CTA bar
  const mobileBarHtml = hasTicketUrl
    ? `<div class="edp-mobile-bar">
    <div class="edp-mobile-bar-inner">
      <div class="edp-mobile-bar-info">
        <div class="edp-mobile-bar-title">${event.title}</div>
        <div class="edp-mobile-bar-price">${priceDisplay}</div>
      </div>
      <a href="${event.ticketUrl}" class="edp-cta${lightText ? ' edp-cta--light-text' : ''}" rel="noopener" target="_blank">Εισιτήρια</a>
    </div>
  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  <link rel="stylesheet" href="/styles/design-system.css">

  <title>${event.title} | ${event.venue.name} | agent-athens</title>
  <meta name="description" content="${generateEventMetaDescription(event)}">

  <!-- Canonical URL (single source of truth) -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Language alternates -->
  <link rel="alternate" hreflang="el" href="${canonicalUrl}">

  <!-- Open Graph -->
  <meta property="og:title" content="${event.title}">
  <meta property="og:description" content="${event.description.substring(0, 200)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="event">
  <meta property="og:image" content="${ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="el_GR">
  <meta property="og:site_name" content="agent-athens">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${event.title}">
  <meta name="twitter:description" content="${event.description.substring(0, 200)}">
  <meta name="twitter:image" content="${ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`}">

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
</head>
<body>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}
  ${renderSearchOverlay()}

  <article id="main-content" itemscope itemtype="https://schema.org/${schemaType}">
    <section class="edp-hero" style="--edp-type-color: ${typeColorVar}">
      <div class="edp-hero-inner">
        <nav class="edp-breadcrumb">
          <a href="/">agent-athens</a>
          ${categorySlug ? ` › <a href="/${categorySlug}/">${typeLabel}</a>` : ''}
          › ${event.venue.name}
        </nav>
        <span class="edp-type-badge${lightText ? ' edp-type-badge--light-text' : ''}">${typeLabel}</span>
        ${exhibitionIsOpen ? '<span class="edp-open-badge">Τώρα ανοιχτή</span>' : ''}
        <header>
          <h1 class="edp-title" itemprop="name">${event.title}</h1>
          <div class="edp-meta">
            <span class="edp-meta-date"><time itemprop="startDate" datetime="${event.startDate}">${dateDisplay}</time></span>
            · <a href="/venues/${venueSlug}/">${event.venue.name}</a>
            · ${priceDisplay}
          </div>
          ${ctaHtml}
        </header>
      </div>
    </section>

    <div class="edp-content">
      <section class="edp-description${needsReadMore ? ' is-collapsed' : ''}" itemprop="description">
        ${descriptionHtml}
        ${hasFullDescription ? '<div class="edp-enriched-badge">AI-enriched content</div>' : ''}
      </section>
      ${needsReadMore ? '<button class="edp-read-more" type="button">Περισσότερα ▾</button>' : ''}
      ${hiddenMetadataHtml}

      ${practicalBlock}

      <section class="edp-venue-section">
        <h3>${event.venue.name}</h3>
        ${event.venue.address ? `<div class="edp-venue-address">${event.venue.address}</div>` : ''}
        ${event.venue.neighborhood ? `<div class="edp-venue-neighborhood">${event.venue.neighborhood}</div>` : ''}
        <a href="${mapsUrl}" class="edp-venue-maps" rel="noopener" target="_blank">Άνοιγμα στον Χάρτη →</a>
      </section>

      ${sourceHtml}

      <nav class="edp-connections" aria-label="Σχετικές σελίδες">
        <h3>Εξερευνήστε περισσότερα</h3>
        ${navLinks.join('\n        ')}
      </nav>

      ${relatedHtml}
    </div>
  </article>

  ${mobileBarHtml}

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
  ${renderEventDetailScript()}
</body>
</html>`;
}

/**
 * Render a related event as a visual card (reuses browse-page card markup)
 */
export function renderRelatedEventCard(event: Event): string {
  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  let dateStr: string;
  if (isExhibition) {
    dateStr = formatExhibitionDateRange(event);
    if (exhibitionIsOpen) dateStr += ' · Ανοιχτή';
  } else {
    dateStr = formatGreekDateOnly(event.startDate);
    const timeStr = event.startDate.includes('T') ? formatGreekTime(event.startDate) : '';
    if (timeStr && timeStr !== '00:00') dateStr += ` στις ${timeStr}`;
  }

  let priceText: string;
  if (event.price.type === 'open') {
    priceText = 'Δωρεάν';
  } else if (event.price.amount && event.price.amount > 0) {
    priceText = `€${event.price.amount}`;
  } else if (event.price.range && event.price.range !== 'with-ticket' && event.price.range.includes('€')) {
    priceText = event.price.range;
  } else {
    priceText = 'Με εισιτήριο';
  }

  const slug = generateEventSlug(event);
  const href = `/events/${slug}/`;
  const badgeLabel = BADGE_LABELS[event.type] || BADGE_LABELS.other;
  const colorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type) ? ' card-badge--light-text' : '';
  const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;
  const venueText = event.venue.neighborhood
    ? `${event.venue.name} · ${event.venue.neighborhood}`
    : event.venue.name;

  const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;

  return `
  <a href="${href}" class="event-card">
    <div class="card-image-wrapper">
      ${imgSrc ? `<img class="card-image" src="${imgSrc}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">` : ''}
      <span class="card-placeholder-icon" aria-hidden="true"${imgSrc ? ' style="display:none"' : ''}>${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? '<span class="card-badge-open">ΑΝΟΙΧΤΗ</span>' : ''}
    </div>
    <div class="card-body">
      <h3 class="card-title">${event.title}</h3>
      <span class="card-date"><time datetime="${event.startDate}">${dateStr}</time></span>
      <span class="card-venue">${venueText}</span>
      <span class="card-price">${priceText}</span>
    </div>
  </a>`;
}

/**
 * Inline script for read-more toggle and mobile bar IntersectionObserver
 */
export function renderEventDetailScript(): string {
  return `<script>
(function() {
  var desc = document.querySelector('.edp-description.is-collapsed');
  var btn = document.querySelector('.edp-read-more');
  if (desc && btn) {
    btn.addEventListener('click', function() {
      var collapsed = desc.classList.toggle('is-collapsed');
      btn.textContent = collapsed ? 'Περισσότερα ▾' : 'Λιγότερα ▴';
    });
  }

  var heroCta = document.querySelector('.edp-cta-hero');
  var bar = document.querySelector('.edp-mobile-bar');
  if (heroCta && bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        bar.classList.toggle('is-visible', !e.isIntersecting);
      });
    }, { threshold: 0 }).observe(heroCta);
  }
})();
</script>`;
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

    // Get related events at same venue (max 6, excluding current)
    const venueEvents = eventsByVenue.get(event.venue.name) || [];
    const relatedEvents = venueEvents
      .filter(e => e.id !== event.id)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 6);

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
