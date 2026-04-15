// HTML page template with full GEO/SEO optimization
// Greek Primary + English Metadata Strategy

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Event, PageMetadata } from '../types';
import type { Locale } from '../i18n/strings';
import { formatGreekDateOnly, formatGreekTime } from '../utils/i18n';
import { VENUE_TYPE_MAP, getAthensTimezone } from '../enrichment/quality-gates';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { displayNeighborhood } from '../utils/neighborhoods';
import { buildContainedInPlace, resolveEventStatus, ORGANIZATION_SCHEMA } from '../utils/schema-geo';
import { generateEventSlug } from '../generators/event-page';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks, renderCssLink } from './site-chrome';
import { renderSearchOverlay, renderSearchScript } from './search-overlay';
import { computeFilterCounts, renderFilterBar, renderFilterBarScript } from './filter-bar';
import { BASE_URL } from '../config/site-url';

// Load IndexNow config for Bing WMT verification
const indexNowConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/indexnow.json'), 'utf-8')
);
const bingVerification: string = indexNowConfig.bing_wmt_verification || '';

// ── Badge & icon lookup maps ───────────────────────────

export const BADGE_LABELS: Record<string, string> = {
  concert: 'ΣΥΝΑΥΛΙΑ',
  dj_set: 'DJ SET',
  exhibition: 'ΕΚΘΕΣΗ',
  cinema: 'ΣΙΝΕΜΑ',
  screening: 'ΠΡΟΒΟΛΗ',
  theater: 'ΘΕΑΤΡΟ',
  festival: 'ΦΕΣΤΙΒΑΛ',
  performance: 'ΠΑΡΑΣΤΑΣΗ',
  show: 'ΣΟΟΥ',
  workshop: 'ΕΡΓΑΣΤΗΡΙΟ',
  tech: 'TECH',
  other: 'ΑΛΛΟ',
};

export const LIGHT_TEXT_BADGES = new Set(['performance', 'cinema', 'screening']);

export const TYPE_ICONS: Record<string, string> = {
  concert: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 6v24.4A7 7 0 1 0 22 37V18h12v-4H22V6h-4zM15 41a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>',
  dj_set: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4C15 4 8 8 8 14v4c0 2.2 1.8 4 4 4v8c0 2.2 1.8 4 4 4h2v-8h4v8h4v-8h4v8h2c2.2 0 4-1.8 4-4v-8c2.2 0 4-1.8 4-4v-4c0-6-7-10-16-10zm-8 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm16 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>',
  exhibition: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 6h36v36H6V6zm4 4v28h28V10H10zm4 4h20v20H14V14zm4 4v12h12V18H18z"/></svg>',
  cinema: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 8h32v32H8V8zm4 4v6h6v-6H12zm18 0v6h6v-6H30zM16 16h16v16H16V16zM12 34v-6h6v6H12zm18 0v-6h6v6H30z"/></svg>',
  screening: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 8h32v32H8V8zm4 4v6h6v-6H12zm18 0v6h6v-6H30zM16 16h16v16H16V16zM12 34v-6h6v6H12zm18 0v-6h6v6H30z"/></svg>',
  theater: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 8c-4 0-8 4-8 10s4 12 8 12c2 0 4-1 5-3-1-2-1-4-1-5 0-6 4-10 4-14 0-2-3.6 0-8 0zm20 0c-4.4 0-8 2-8 0 0 4 4 8 4 14 0 1 0 3-1 5 1 2 3 3 5 3 4 0 8-6 8-12s-4-10-8-10zM12 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm24 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 24c1 2 2 3 4 3s2-1 2-1-1 1-2 1-2-2-4-3zm24 0c-2 1-3 3-4 3s-2-1-2-1 1 1 2 1 3-1 4-3zM24 26c-4 0-7 4-7 8 0 5 3 8 7 8s7-3 7-8c0-4-3-8-7-8zm-2 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm4 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-2 4c1 0 2 1 2 1s-1 1-2 1-2-1-2-1 1-1 2-1z"/></svg>',
  festival: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4L8 20v4h4v16h8V30h8v10h8V24h4v-4L24 4zm0 6l12 12H12L24 10z"/></svg>',
  performance: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4a4 4 0 0 0-4 4v2l-8 14h4l4-7v23a2 2 0 0 0 4 0V30h0v10a2 2 0 0 0 4 0V17l4 7h4L28 10V8a4 4 0 0 0-4-4z"/></svg>',
  show: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l5.5 13.2L44 18.8l-10 9.2 2.8 14L24 35.2 11.2 42 14 28l-10-9.2 14.5-1.6z"/></svg>',
  workshop: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30.4 7.6a8 8 0 0 0-11.3 0L7.6 19.1a8 8 0 0 0 0 11.3L19.1 42a8 8 0 0 0 11.3 0L42 30.4a8 8 0 0 0 0-11.3L30.4 7.6zM24 18a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>',
  tech: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 16l-8 8 8 8 3-3-5-5 5-5-3-3zm20 0l-3 3 5 5-5 5 3 3 8-8-8-8zM20 36l4-24h4l-4 24h-4z"/></svg>',
  other: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 6h24c1.1 0 2 .9 2 2v32c0 1.1-.9 2-2 2H12c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2zm2 6v4h20v-4H14zm0 8v2h20v-2H14zm0 6v2h14v-2H14z"/></svg>',
};

export function renderPage(metadata: PageMetadata, events: Event[], allEvents?: Event[], preContentHtml?: string, locale: Locale = 'el', postContentHtml?: string): string {
  const { title, description, keywords, url, eventCount, lastUpdate, filters } = metadata;

  const schemaMarkup = generateSchemaMarkup(events, metadata, locale);
  const eventListHTML = renderDateGroupedEvents(events);

  // Filter bar: only render when allEvents is provided (hub pages, not category/detail pages)
  let filterBarHTML = '';
  let filterBarScriptHTML = '';
  if (allEvents) {
    const counts = computeFilterCounts(filters, allEvents);
    filterBarHTML = renderFilterBar(filters, counts, eventCount);
    filterBarScriptHTML = renderFilterBarScript();
  }

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

  <!-- Primary Title: Greek -->
  <title>${title} | agent-athens</title>

  <!-- Primary Description: Greek -->
  <meta name="description" content="${description}">

  <!-- Bilingual Keywords -->
  <meta name="keywords" content="${keywords}, Αθήνα, Athens, εκδηλώσεις, events, πολιτισμός, culture">

  <!-- Canonical URL (English slug for international SEO) -->
  <link rel="canonical" href="${BASE_URL}/${url}">

  <!-- Language Alternates -->
  <link rel="alternate" hreflang="el" href="${BASE_URL}/${url}">

  <!-- GEO: Freshness signals -->
  <meta name="date" content="${new Date().toISOString().split('T')[0]}">
  <meta name="last-modified" content="${lastUpdate}">

  <!-- GEO: Author/source -->
  <meta name="author" content="agent-athens">
  ${bingVerification ? `<meta name="msvalidate.01" content="${bingVerification}">` : ''}

  <!-- OpenGraph: Greek Primary, English Secondary -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${eventCount} εκδηλώσεις στην Αθήνα">
  <meta property="og:url" content="${BASE_URL}/${url}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="el_GR">
  <meta property="og:locale:alternate" content="en_US">
  <meta property="og:site_name" content="agent-athens">
  <meta property="og:image" content="${BASE_URL}${filters.type ? `/images/og/${filters.type.replace('_', '-')}-default.png` : '/images/og/agentathens-default.png'}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${eventCount} εκδηλώσεις στην Αθήνα">
  <meta name="twitter:image" content="${BASE_URL}${filters.type ? `/images/og/${filters.type.replace('_', '-')}-default.png` : '/images/og/agentathens-default.png'}">

  <!-- GEO: Location metadata -->
  <meta name="geo.region" content="GR-I">
  <meta name="geo.placename" content="Athens">
  <meta name="geo.position" content="37.9838;23.7276">

  <!-- For AI agents: alternate formats -->
  <link rel="alternate" type="application/json" href="/api/${url}.json">

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  ${schemaMarkup}
  </script>
  ${url === 'index' ? `<script type="application/ld+json">
  ${JSON.stringify(ORGANIZATION_SCHEMA, null, 2)}
  </script>` : ''}

  <!-- Design system -->
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  ${renderCssLink()}

</head>
<body${allEvents ? ' class="has-filter-bar"' : ''}>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}
  ${renderSearchOverlay()}

  <div class="page-container">
    <header class="page-header">
      <div class="page-header-row">
        <h1>${title}</h1>
        <span class="last-update">Τελευταία ενημέρωση: ${new Date(lastUpdate).toLocaleDateString('el-GR', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })} ώρα Αθήνας</span>
      </div>
    </header>

    ${filterBarHTML}

    ${preContentHtml || ''}

    <main id="main-content" tabindex="-1">
      ${eventCount > 0 ? `
      <section class="card-grid" itemscope itemtype="https://schema.org/ItemList">
        ${eventListHTML}
      </section>
      ` : `
      <p>Δεν βρέθηκαν εκδηλώσεις που να ταιριάζουν με αυτά τα κριτήρια. Ελέγξτε ξανά αύριο για ενημερώσεις!</p>
      <p>Το ημερολόγιό μας ενημερώνεται καθημερινά στις 8:00 π.μ. ώρα Αθήνας.</p>
      `}

      ${postContentHtml || ''}
      ${renderRelatedPages(filters)}
    </main>
  </div>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
  ${filterBarScriptHTML}
</body>
</html>`;
}

/**
 * Get event time from available sources
 * Priority: 1) Time in startDate (T component), 2) timeDoors field
 */
function getEventTime(event: Event): string {
  // First try to extract time from startDate (if it has T component)
  if (event.startDate.includes('T')) {
    return formatGreekTime(event.startDate);
  }
  // Fall back to timeDoors if available
  if (event.timeDoors) {
    return event.timeDoors;
  }
  // No time available
  return '';
}

export interface CardData {
  dateStr: string;
  priceText: string;
  href: string;
  badgeLabel: string;
  colorVar: string;
  lightText: string;
  icon: string;
  venueText: string;
  shortDesc: string;
  numericPrice: number;
  exhibitionIsOpen: boolean;
  schemaType: string;
}

export function prepareCardData(event: Event): CardData {
  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  // Date text — exhibitions show range, others show single date
  let dateStr: string;
  if (isExhibition) {
    dateStr = formatExhibitionDateRange(event);
    if (exhibitionIsOpen) dateStr += ' · Ανοιχτή';
  } else {
    dateStr = formatGreekDateOnly(event.startDate);
    const timeStr = getEventTime(event);
    if (timeStr) dateStr += ` στις ${timeStr}`;
  }

  // Price — text only, no links (detail page has full info)
  let priceText: string;
  if (event.price.type === 'open') {
    priceText = 'Ελεύθερη είσοδος';
  } else if (event.price.amount && event.price.amount > 0) {
    priceText = `€${event.price.amount}`;
  } else if (event.price.range && event.price.range !== 'with-ticket' && event.price.range.includes('€')) {
    priceText = event.price.range;
  } else {
    priceText = 'Με εισιτήριο';
  }

  // Internal link to detail page
  const slug = generateEventSlug(event);
  const href = `/events/${slug}/`;

  // Badge
  const badgeLabel = BADGE_LABELS[event.type] || BADGE_LABELS.other;
  const colorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type) ? ' card-badge--light-text' : '';

  // Placeholder icon
  const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;

  // Schema.org type
  const schemaType = isExhibition ? 'ExhibitionEvent' : event['@type'];

  // Venue display
  const venueText = event.venue.neighborhood
    ? `${event.venue.name} · ${displayNeighborhood(event.venue.neighborhood)}`
    : event.venue.name;

  // Short description for meta tag (truncate to 160 chars)
  const shortDesc = (event.description || '').substring(0, 160);

  // Numeric price for data attribute (sort-by-price)
  const numericPrice = event.price.type === 'open' ? 0 : (event.price.amount || 9999);

  return { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText, shortDesc, numericPrice, exhibitionIsOpen, schemaType };
}

export function renderEventCard(event: Event): string {
  const { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText, shortDesc, numericPrice, exhibitionIsOpen, schemaType } = prepareCardData(event);

  const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;

  return `
  <article class="event-card" data-price="${numericPrice}" itemscope itemtype="https://schema.org/${schemaType}">
    <div class="card-image-wrapper" data-type="${event.type}">
      ${imgSrc ? `<img class="card-image" src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">` : ''}
      <span class="card-placeholder-icon" aria-hidden="true"${imgSrc ? ' style="display:none"' : ''}>${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? '<span class="card-badge-open">ΑΝΟΙΧΤΗ</span>' : ''}
    </div>
    <div class="card-body">
      <h3 class="card-title" itemprop="name"><a href="${href}" class="card-link">${event.title}</a></h3>
      <span class="card-date"><time itemprop="startDate" datetime="${event.startDate}">${dateStr}</time>${event.type === 'exhibition' && event.endDate ? `<meta itemprop="endDate" content="${event.endDate}">` : ''}</span>
      <span class="card-venue" itemprop="location" itemscope itemtype="https://schema.org/Place"><span itemprop="name">${venueText}</span></span>
      <span class="card-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="price">${priceText}</span>${event.price.currency ? `<meta itemprop="priceCurrency" content="${event.price.currency}">` : ''}</span>
    </div>
    <meta itemprop="eventStatus" content="${resolveEventStatus(event.startDate, event.endDate, event.type)}">
    <meta itemprop="description" content="${shortDesc}">
  </article>`;
}

function renderDateGroupedEvents(events: Event[]): string {
  if (events.length === 0) return '';

  // Group events by date (YYYY-MM-DD from startDate)
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const dateKey = event.startDate.substring(0, 10);
    const group = groups.get(dateKey);
    if (group) {
      group.push(event);
    } else {
      groups.set(dateKey, [event]);
    }
  }

  // Sort groups chronologically
  const sortedKeys = [...groups.keys()].sort();

  const parts: string[] = [];
  for (const dateKey of sortedKeys) {
    const dateEvents = groups.get(dateKey)!;
    const headerText = formatGreekDateOnly(dateKey);
    parts.push(`<h2 class="date-group-header">${headerText}</h2>`);
    parts.push(`<div class="date-group" data-count="${dateEvents.length}">`);
    for (const event of dateEvents) {
      parts.push(renderEventCard(event));
    }
    parts.push(`</div>`);
  }

  return parts.join('\n');
}

function renderRelatedPages(filters: any): string {
  // Generate related page suggestions
  const links: string[] = [];

  const typeTranslations: Record<string, string> = {
    'concerts': 'συναυλίες',
    'theater': 'θέατρο',
    'exhibitions': 'εκθέσεις',
    'cinema': 'κινηματογράφος',
    'performances': 'παραστάσεις',
    'workshops': 'εργαστήρια'
  };

  if (filters.type) {
    const greekType = typeTranslations[filters.type] || filters.type;
    links.push(`<a href="/${filters.type}">Όλες οι ${greekType}</a>`);
    links.push(`<a href="/open-${filters.type}">Ελεύθερη είσοδος ${greekType}</a>`);
  }

  if (filters.time !== 'this-week') {
    links.push(`<a href="/this-week">Εκδηλώσεις αυτής της εβδομάδας</a>`);
  }

  if (filters.price !== 'open') {
    links.push(`<a href="/open">Ελεύθερη είσοδος εκδηλώσεις</a>`);
  }

  links.push(`<a href="/">Όλες οι εκδηλώσεις</a>`);

  if (links.length === 0) return '';

  return `
  <aside class="related-pages">
    <h2>Σχετικές Σελίδες</h2>
    <ul>
      ${links.map(link => `<li>${link}</li>`).join('\n')}
    </ul>
  </aside>`;
}

function normalizeStartDate(isoDate: string): string {
  if (isoDate.includes('+') || isoDate.includes('Z')) return isoDate;
  const dateMatch = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const tz = dateMatch
    ? getAthensTimezone(new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3])))
    : '+02:00';
  return isoDate.includes('T') ? `${isoDate}${tz}` : `${isoDate}T00:00:00${tz}`;
}

function generateSchemaMarkup(events: Event[], metadata: PageMetadata, locale: Locale = 'el'): string {
  // CRITICAL: Schema.org must ALWAYS be in English for AI agent parsing
  // Even though content is Greek, Schema.org is the universal standard

  const itemListElements = events.map((event, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "item": {
      "@type": event['@type'],
      "name": event.title,
      "description": `${event.type} event in Athens`,
      "startDate": normalizeStartDate(event.startDate),
      "eventStatus": resolveEventStatus(event.startDate, event.endDate, event.type),
      "isAccessibleForFree": event.price.type === 'open' || event.price.type === 'donation',
      "location": {
        "@type": VENUE_TYPE_MAP[event['@type']] || 'EventVenue',
        "name": event.venue.name,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": event.venue.address || "",
          "addressLocality": "Athens",
          "addressRegion": "Attica",
          "addressCountry": "GR"
        },
        "containedInPlace": buildContainedInPlace(event.venue.neighborhood)
      },
      "offers": {
        "@type": "Offer",
        ...((event.price.type === 'open' || event.price.type === 'donation')
          ? { "price": "0" }
          : (event.price.amount ? { "price": event.price.amount.toString() } : {})),
        "priceCurrency": event.price.currency || "EUR",
        "availability": "https://schema.org/InStock"
      }
    }
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${metadata.title} | Cultural Events in Athens`,  // Add English context
    "description": `${events.length} cultural events in Athens, Greece`,  // English
    "url": `${BASE_URL}/${metadata.url}`,
    "inLanguage": locale === 'en' ? 'en' : 'el',
    "about": {
      "@type": "Place",
      "name": "Athens",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "GR",
        "addressLocality": "Athens"
      }
    },
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": events.length,
      "itemListElement": itemListElements
    },
    "datePublished": metadata.lastUpdate,
    "dateModified": metadata.lastUpdate
  };

  return JSON.stringify(schema, null, 2);
}

