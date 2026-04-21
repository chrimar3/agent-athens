/**
 * Individual Event Page Generator
 *
 * Generates individual event detail pages at /events/[slug]/
 * with full Schema.org markup, OG tags, and internal linking.
 *
 * Slug format: [event-id-prefix]-[venue-slug]-[title-slug]
 * The event ID prefix ensures URL stability when titles change.
 */

import { mkdirSync, existsSync, readFileSync } from 'fs';
import { writeFileIfChangedSync, writeHtmlIfChangedSync } from '../utils/write-if-changed';
import { join } from 'path';
import type { Event } from '../types';
import { generatePracticalBlock } from './practical-block';
import { formatGreekDateOnly, formatGreekTime, formatPriceGreek } from '../utils/i18n';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { formatDateOnly, formatPrice } from '../utils/i18n-date';
import { STRINGS, type Locale } from '../i18n/strings';
import { getAthensTimezone, formatSchemaDate, SCHEMA_TYPE_MAP, VENUE_TYPE_MAP } from '../enrichment/quality-gates';
import { stripInfoTable } from '../utils/description-utils';
import { generateEventMetaDescription } from '../utils/meta-descriptions';
import { normalizeGreek } from '../utils/normalize-greek';
import { displayNeighborhood } from '../utils/neighborhoods';
import { buildContainedInPlace, resolveEventStatus } from '../utils/schema-geo';
import { classifyEventLifecycle } from '../utils/event-lifecycle';
import { validateEventSchema, logValidationSummary, type SchemaValidationResult } from '../utils/schema-validator';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks, renderCssLink } from '../templates/site-chrome';
import { renderSearchOverlay, renderSearchScript } from '../templates/search-overlay';
import { BADGE_LABELS, LIGHT_TEXT_BADGES, TYPE_ICONS } from '../templates/page';
import { getPerformerSameAs } from '../utils/performer-sameAs';
import { renderActionBarHtml, renderCardSaveButton, renderSavedEventsScript, renderSaveButtonScript, renderCardSaveScript, renderShareButtonScript } from '../templates/action-bar';
import { renderCornerstoneLinksHtml } from '../utils/cornerstone-links';

const DIST_DIR = join(import.meta.dir, '../../dist');
import { BASE_URL } from '../config/site-url';
import { renderAnalytics } from '../config/analytics';

// Load IndexNow config for Bing WMT verification
const indexNowConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/indexnow.json'), 'utf-8')
);
const bingVerification: string = indexNowConfig.bing_wmt_verification || '';

// Load source attribution display names
const sourceAttributionMap: Record<string, string> = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/source-attribution.json'), 'utf-8')
);

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

// Type translations — now sourced from i18n/strings.ts
// Kept as module-level aliases for backward compat (other modules may import)
const TYPE_TRANSLATIONS = STRINGS.el.typeLabels;
const TYPE_DISCOVERY_LABELS = STRINGS.el.typeDiscoveryLabels;

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
 * Fallback chain: event image → venue default → per-event OG → type default → site default
 *
 * Events without any photo get a branded per-event OG image (title/venue/date)
 * instead of the generic type default. Per-event OG images are generated
 * by generateEventOgImages() in og-image.ts during the build.
 */
function getOgImage(event: Event): string {
  // Prefer self-hosted image, then hotlinked source image
  if (event.imageLocal) return event.imageLocal;
  if (event.imageUrl) return event.imageUrl;

  // Fall back to venue image if available
  if (event.venueImage) return event.venueImage;

  // Per-event branded OG image (generated for imageless events)
  return `/images/og/events/${generateEventSlug(event)}.png`;
}

/**
 * Generate Schema.org JSON-LD for an individual event page
 */
function generateEventSchema(event: Event, locale: Locale = 'el'): string {
  const schemaType = SCHEMA_TYPE_MAP[event.type] || 'Event';
  const eventSlug = generateEventSlug(event);
  const urlPrefix = locale === 'en' ? 'en/' : '';

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
  if (!startDate.includes('T') && (event.timeDoors || event.timePeak)) {
    // Use known event time instead of midnight
    startDate = formatSchemaDate(startDate, event.timeDoors || event.timePeak);
  } else if (!startDate.includes('+') && !startDate.includes('Z')) {
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
    'description': locale === 'en'
      ? (event.fullDescriptionEn || event.description || event.title)
      : (event.fullDescriptionGr || event.fullDescription || event.description || event.title),
    'startDate': startDate,
    'eventStatus': resolveEventStatus(event.startDate, event.endDate, event.type),
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'inLanguage': locale === 'en' ? 'en' : 'el',
    'url': `${BASE_URL}/${urlPrefix}events/${eventSlug}/`,
    'location': {
      '@type': VENUE_TYPE_MAP[schemaType] || 'EventVenue',
      'name': event.venue.name,
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': event.venue.address || '',
        'addressLocality': 'Athens',
        'addressRegion': 'Attica',
        'addressCountry': 'GR'
      },
      'containedInPlace': buildContainedInPlace(event.venue.neighborhood)
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

  // For single-day events without endDate, use startDate (Schema.org convention)
  if (!schema.endDate) {
    schema.endDate = startDate;
  }

  // Add door time if available
  if (event.timeDoors) {
    schema.doorTime = formatSchemaDate(event.startDate.split('T')[0], event.timeDoors);
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
      'url': `${BASE_URL}/${urlPrefix}events/${eventSlug}/`
    };
  } else {
    schema.isAccessibleForFree = false;
    const offerObj: Record<string, any> = {
      '@type': 'Offer',
      'priceCurrency': event.price.currency || 'EUR',
      'availability': 'https://schema.org/InStock',
      'url': event.ticketUrl || event.url || `${BASE_URL}/${urlPrefix}events/${eventSlug}/`,
      'validFrom': event.createdAt || startDate
    };
    const priceStr = event.price.amount != null ? String(event.price.amount).trim() : '';
    if (priceStr !== '') {
      offerObj.price = priceStr;
    }
    schema.offers = offerObj;
  }

  // Add image if available
  const ogImage = getOgImage(event);
  if (ogImage) {
    schema.image = ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`;
  }

  // Add performer sameAs if available (concerts, dj_sets, festivals, performances, shows, dance)
  const performer = getPerformerSameAs(event.title, event.type);
  if (performer) {
    schema.performer = performer;
  }

  return JSON.stringify(schema, null, 2);
}

/**
 * Render the event detail HTML template (Phase 3 redesign)
 *
 * Structure: full-bleed hero with type-colored gradient, 800px content column,
 * card-grid related events, mobile sticky CTA bar.
 */
export function renderEventDetailPage(event: Event, relatedEvents: Event[], locale: Locale = 'el'): string {
  const t = STRINGS[locale];
  const slug = generateEventSlug(event);
  const urlPrefix = locale === 'en' ? 'en/' : '';
  const canonicalUrl = `${BASE_URL}/${urlPrefix}events/${slug}/`;
  const ogImage = getOgImage(event);
  const schemaJson = generateEventSchema(event, locale);
  const practicalBlock = generatePracticalBlock(event, null, locale);
  const schemaType = SCHEMA_TYPE_MAP[event.type] || 'Event';

  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  // Lifecycle: past events get banner, noindex, hidden CTAs
  const lifecycle = classifyEventLifecycle(event);
  const isPast = lifecycle !== 'upcoming';

  // Date display — locale-aware
  const timeStr = event.startDate.includes('T')
    ? formatGreekTime(event.startDate)
    : (event.timeDoors || '');
  const exhibitionLocale = locale === 'en' ? 'en-US' : 'el-GR';
  const dateDisplay = isExhibition
    ? formatExhibitionDateRange(event, exhibitionLocale)
    : `${formatDateOnly(event.startDate, locale)}${timeStr ? ` ${t.atTime} ${timeStr}` : ''}`;

  // Type styling
  const typeLabel = t.typeLabels[event.type] || event.type;
  const categorySlug = TYPE_TO_CATEGORY[event.type] || '';
  const typeColorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type);

  // Price display
  const priceDisplay = formatPrice(event, locale);

  // Description content — locale-aware selection
  // English pages use fullDescriptionEn, Greek pages use fullDescriptionGr (fallback to fullDescription)
  const descriptionSource = locale === 'en'
    ? event.fullDescriptionEn
    : (event.fullDescriptionGr || event.fullDescription);
  const hasFullDescription = descriptionSource && descriptionSource.length > 100;
  // Detect English fallback on Greek pages: Greek page, no native Greek column, English exists
  const isEnglishFallback = locale === 'el' && !event.hasNativeGreek && Boolean(event.fullDescriptionEn);
  let descriptionHtml: string;
  let hiddenMetadataHtml = '';
  if (hasFullDescription) {
    const { narrative, metadataHtml } = stripInfoTable(String(descriptionSource));
    const fallbackLabel = isEnglishFallback ? '<p class="edp-lang-notice">Περιγραφή στα Αγγλικά</p>\n' : '';
    descriptionHtml = fallbackLabel + narrative.split('\n\n').map(para => `<p>${para.trim()}</p>`).join('\n');
    hiddenMetadataHtml = metadataHtml;
  } else {
    descriptionHtml = `<p>${event.description}</p>`;
  }

  // Read-more for long descriptions
  const descriptionText = hasFullDescription ? String(descriptionSource) : event.description;
  const needsReadMore = descriptionText.length > 400;

  // Internal navigation links
  const venueSlug = slugify(event.venue.name);
  const neighborhoodSlug = event.venue.neighborhood ? slugify(event.venue.neighborhood) : '';

  const navLinks = [
    categorySlug ? `<a href="/${categorySlug}/">${t.typeDiscoveryLabels[event.type] || typeLabel}</a>` : '',
    `<a href="/venues/${venueSlug}/">${t.moreEventsAt} ${event.venue.name}</a>`,
    neighborhoodSlug ? `<a href="/neighborhoods/${neighborhoodSlug}/">${t.eventsInArea} ${displayNeighborhood(event.venue.neighborhood!)}</a>` : ''
  ].filter(Boolean);

  // CTA (ticket link) — hidden for past events (ticket URL likely dead)
  const showCta = Boolean(event.ticketUrl) && !isPast;
  const ctaHtml = showCta
    ? `<a href="${event.ticketUrl}" class="edp-cta edp-cta-hero" rel="noopener" target="_blank">${t.buyTicketsArrow}</a>`
    : '';

  // Inline CTA for body content (GEO source order: after description, before venue)
  const inlineCtaHtml = isPast
    ? ''
    : showCta
      ? `<div class="edp-inline-cta"><a href="${event.ticketUrl}" class="edp-cta" rel="noopener" target="_blank">${t.buyTicketsArrow}</a></div>`
      : event.price.type === 'open'
        ? `<div class="edp-inline-cta"><span class="edp-open-entry">${t.openEntry}</span></div>`
        : '';

  // Venue section — Google Maps link
  const mapsUrl = event.venue.coordinates
    ? `https://www.google.com/maps?q=${event.venue.coordinates.lat},${event.venue.coordinates.lon}`
    : `https://www.google.com/maps/search/${encodeURIComponent(event.venue.name + ' Athens')}`;

  // Source attribution — use display name from mapping, fall back to raw ID
  const sourceDisplayName = sourceAttributionMap[event.source] || event.source;
  const sourceHtml = event.url
    ? `<div class="edp-source">${t.source}: <a href="${event.url}" rel="noopener" target="_blank">${sourceDisplayName}</a></div>`
    : `<div class="edp-source">${t.source}: ${sourceDisplayName}</div>`;

  // Related events as cards
  const relatedHtml = relatedEvents.length > 0
    ? `
      <section class="edp-related">
        <h2>${t.upcomingEventsAt} ${event.venue.name}</h2>
        <div class="card-grid">
          ${relatedEvents.map(e => renderRelatedEventCard(e, locale)).join('\n')}
        </div>
      </section>`
    : '';

  // Mobile sticky CTA bar — hidden for past events
  const mobileBarHtml = showCta
    ? `<div class="edp-mobile-bar">
    <div class="edp-mobile-bar-inner">
      <div class="edp-mobile-bar-info">
        <div class="edp-mobile-bar-title">${event.title}</div>
        <div class="edp-mobile-bar-price">${priceDisplay}</div>
      </div>
      <a href="${event.ticketUrl}" class="edp-cta" rel="noopener" target="_blank">${t.ticketsShort}</a>
    </div>
  </div>`
    : '';

  // hreflang block: bidirectional only when English description exists
  const greekUrl = `${BASE_URL}/events/${slug}/`;
  const englishUrl = `${BASE_URL}/en/events/${slug}/`;
  const hasBilingual = Boolean(event.fullDescriptionEn);
  const hreflangHtml = hasBilingual
    ? `<link rel="alternate" hreflang="el" href="${greekUrl}">
  <link rel="alternate" hreflang="en" href="${englishUrl}">
  <link rel="alternate" hreflang="x-default" href="${englishUrl}">`
    : `<link rel="alternate" hreflang="el" href="${greekUrl}">`;

  return `<!DOCTYPE html>
<html lang="${t.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  ${renderCssLink()}

  <title>${event.title} | ${event.venue.name} | agent-athens</title>
  <meta name="description" content="${generateEventMetaDescription(event)}">
  ${isPast ? '<meta name="robots" content="noindex">' : ''}

  <!-- Canonical URL (single source of truth) -->
  <link rel="canonical" href="${canonicalUrl}">

  <!-- Language alternates -->
  ${hreflangHtml}

  <!-- Open Graph -->
  <meta property="og:title" content="${event.title}">
  <meta property="og:description" content="${generateEventMetaDescription(event)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="event">
  <meta property="og:image" content="${ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="${t.ogLocale}">
  <meta property="og:site_name" content="agent-athens">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${event.title}">
  <meta name="twitter:description" content="${generateEventMetaDescription(event)}">
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
${renderAnalytics()}
</head>
<body>
  ${renderSiteNav(locale)}
  ${renderHamburgerMenu()}
  ${renderSearchOverlay()}

  <main>
  <article id="main-content" tabindex="-1" itemscope itemtype="https://schema.org/${schemaType}"${isPast ? ' data-past="true"' : ''}>
    <section class="edp-hero" style="--edp-type-color: ${typeColorVar}">
      <div class="edp-hero-bg" style="background-image: url('${ogImage.startsWith('http') ? ogImage : ogImage}')"></div>
      <div class="edp-hero-inner">
        <nav class="edp-breadcrumb">
          <a href="/">agent-athens</a>
          ${categorySlug ? ` › <a href="/${categorySlug}/">${typeLabel}</a>` : ''}
          › ${event.venue.name}
        </nav>
        <span class="edp-type-badge${lightText ? ' edp-type-badge--light-text' : ''}">${typeLabel}</span>
        ${exhibitionIsOpen ? `<span class="edp-open-badge">${t.currentlyOpen}</span>` : ''}
        <header>
          <h1 class="edp-title" itemprop="name">${event.title}</h1>
          <div class="edp-meta">
            <span class="edp-meta-date"><time itemprop="startDate" datetime="${event.startDate}">${dateDisplay}</time></span>
            · <a href="/venues/${venueSlug}/">${event.venue.name}</a>
            · ${priceDisplay}
          </div>
          ${ctaHtml}
          ${renderActionBarHtml(event.id, slug, event.title, canonicalUrl, locale)}
        </header>
      </div>
    </section>

    ${isPast ? `<div class="event-passed-banner" role="status">
      <p>${t.eventEnded}</p>
    </div>` : ''}

    <div class="edp-content">
      ${practicalBlock}

      <section class="edp-description${needsReadMore ? ' is-collapsed' : ''}" itemprop="description">
        ${descriptionHtml}
        ${hasFullDescription ? '<div class="edp-enriched-badge">AI-enriched content</div>' : ''}
      </section>
      ${needsReadMore ? `<button class="edp-read-more" type="button" data-more="${t.readMore}" data-less="${t.readLess}">${t.readMore}</button>` : ''}
      ${hiddenMetadataHtml}

      ${inlineCtaHtml}

      <section class="edp-venue-section">
        <h2>${event.venue.name}</h2>
        ${event.venue.address ? `<div class="edp-venue-address">${event.venue.address}</div>` : ''}
        ${event.venue.neighborhood ? `<div class="edp-venue-neighborhood">${displayNeighborhood(event.venue.neighborhood)}</div>` : ''}
        <a href="${mapsUrl}" class="edp-venue-maps" rel="noopener" target="_blank">${t.openMap}</a>
      </section>

      ${sourceHtml}

      <nav class="edp-connections" aria-label="${locale === 'en' ? 'Related pages' : 'Σχετικές σελίδες'}">
        <h2>${t.exploreMore}</h2>
        ${navLinks.join('\n        ')}
        ${renderCornerstoneLinksHtml(locale)}
      </nav>

      ${relatedHtml}
    </div>
  </article>
  </main>

  ${mobileBarHtml}

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
  ${renderEventDetailScript()}
  ${renderSavedEventsScript()}
  ${renderSaveButtonScript()}
  ${renderCardSaveScript()}
  ${renderShareButtonScript()}
</body>
</html>`;
}

/**
 * Render a related event as a visual card (reuses browse-page card markup)
 */
export function renderRelatedEventCard(event: Event, locale: Locale = 'el'): string {
  const t = STRINGS[locale];
  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  let dateStr: string;
  if (isExhibition) {
    const exhibitionLocale = locale === 'en' ? 'en-US' : 'el-GR';
    dateStr = formatExhibitionDateRange(event, exhibitionLocale);
    if (exhibitionIsOpen) dateStr += ` · ${t.exhibitionOpenRelated}`;
  } else {
    dateStr = formatDateOnly(event.startDate, locale);
    const timeStr = event.startDate.includes('T') ? formatGreekTime(event.startDate) : '';
    if (timeStr && timeStr !== '00:00') dateStr += ` ${t.atTime} ${timeStr}`;
  }

  const priceText = formatPrice(event, locale);

  const slug = generateEventSlug(event);
  const href = `/events/${slug}/`;
  const badgeLabel = BADGE_LABELS[event.type] || BADGE_LABELS.other;
  const colorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type) ? ' card-badge--light-text' : '';
  const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;
  const venueText = event.venue.neighborhood
    ? `${event.venue.name} · ${displayNeighborhood(event.venue.neighborhood)}`
    : event.venue.name;

  const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;

  return `
  <article class="event-card">
    <div class="card-image-wrapper" data-type="${event.type}">
      ${imgSrc ? `<img class="card-image" src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">` : ''}
      <span class="card-placeholder-icon" aria-hidden="true"${imgSrc ? ' style="display:none"' : ''}>${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? `<span class="card-badge-open">${t.currentlyOpenShort}</span>` : ''}
      ${renderCardSaveButton(event.id, slug, event.title)}
    </div>
    <div class="card-body">
      <h3 class="card-title"><a href="${href}" class="card-link">${event.title}</a></h3>
      <span class="card-date"><time datetime="${event.startDate}">${dateStr}</time></span>
      <span class="card-venue">${venueText}</span>
      <span class="card-price">${priceText}</span>
    </div>
  </article>`;
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
      btn.textContent = collapsed ? (btn.dataset.more || 'Read more ▾') : (btn.dataset.less || 'Read less ▴');
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
  pastEventUrls: Set<string>;    // URLs of past-active events (for sitemap priority)
}> {
  const eventsDir = join(DIST_DIR, 'events');
  if (!existsSync(eventsDir)) {
    mkdirSync(eventsDir, { recursive: true });
  }

  const urls: string[] = [];
  const slugMap = new Map<string, string>();
  const pastEventUrls = new Set<string>();

  // Group events by venue for related events lookup
  const eventsByVenue = new Map<string, Event[]>();
  for (const event of events) {
    const venueEvents = eventsByVenue.get(event.venue.name) || [];
    venueEvents.push(event);
    eventsByVenue.set(event.venue.name, venueEvents);
  }

  const schemaValidationResults: SchemaValidationResult[] = [];

  for (const event of events) {
    const slug = generateEventSlug(event);
    slugMap.set(event.id, slug);

    // Track past-active events for sitemap priority override
    const lifecycle = classifyEventLifecycle(event);
    const urlPath = `events/${slug}`;
    if (lifecycle !== 'upcoming') {
      pastEventUrls.add(urlPath);
    }

    // Get related events at same venue (max 6, excluding current)
    const venueEvents = eventsByVenue.get(event.venue.name) || [];
    const relatedEvents = venueEvents
      .filter(e => e.id !== event.id)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 6);

    // Generate page HTML
    const html = renderEventDetailPage(event, relatedEvents);

    // Validate schema JSON-LD
    const schemaJson = generateEventSchema(event);
    schemaValidationResults.push(validateEventSchema(schemaJson, urlPath));

    // Create directory and write file
    const pageDir = join(eventsDir, slug);
    if (!existsSync(pageDir)) {
      mkdirSync(pageDir, { recursive: true });
    }
    writeHtmlIfChangedSync(join(pageDir, 'index.html'), html);

    urls.push(urlPath);
  }

  const pastCount = pastEventUrls.size;
  console.log(`  ✓ Generated ${urls.length} event pages (${pastCount} past-active with banner)`);
  logValidationSummary(schemaValidationResults);
  return { urls, slugMap, pastEventUrls };
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

  writeFileIfChangedSync(historyPath, JSON.stringify(newHistory, null, 2));
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

// Exports for other modules
export { getAthensTimezone, generateEventSchema };
