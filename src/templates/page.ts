// HTML page template with full GEO/SEO optimization
// Greek Primary + English Metadata Strategy

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Event, PageMetadata } from '../types';
import { formatGreekDateOnly, formatGreekTime } from '../utils/i18n';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { generateEventSlug } from '../generators/event-page';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks } from './site-chrome';
import { computeFilterCounts, renderFilterBar, renderFilterBarScript } from './filter-bar';

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
  dance: 'ΧΟΡΟΣ',
  opera: 'ΟΠΕΡΑ',
  classical: 'ΚΛΑΣΙΚΗ',
  comedy: 'ΚΩΜΩΔΙΑ',
  festival: 'ΦΕΣΤΙΒΑΛ',
  performance: 'PERFORMANCE',
  show: 'SHOW',
  workshop: 'ΕΡΓΑΣΤΗΡΙΟ',
  conference: 'ΣΥΝΕΔΡΙΟ',
  meetup: 'MEETUP',
  hackathon: 'HACKATHON',
  seminar: 'ΣΕΜΙΝΑΡΙΟ',
  other: 'ΑΛΛΟ',
};

export const LIGHT_TEXT_BADGES = new Set(['performance', 'dance', 'cinema', 'screening']);

export const TYPE_ICONS: Record<string, string> = {
  concert: '🎵',
  dj_set: '🎧',
  exhibition: '🎨',
  cinema: '🎬',
  screening: '🎬',
  theater: '🎭',
  dance: '💃',
  opera: '🎼',
  classical: '🎻',
  comedy: '😂',
  festival: '🎪',
  performance: '🎤',
  show: '✨',
  workshop: '🛠️',
  conference: '🎙️',
  meetup: '🤝',
  hackathon: '💻',
  seminar: '📚',
  other: '📌',
};

export function renderPage(metadata: PageMetadata, events: Event[], allEvents?: Event[], preContentHtml?: string): string {
  const { title, description, keywords, url, eventCount, lastUpdate, filters } = metadata;

  const schemaMarkup = generateSchemaMarkup(events, metadata);
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

  <!-- Secondary Description: English for International Discovery -->
  <meta name="description" lang="en" content="${eventCount} cultural events in Athens, Greece. Concerts, exhibitions, theater, performances.">

  <!-- Bilingual Keywords -->
  <meta name="keywords" content="${keywords}, Αθήνα, Athens, εκδηλώσεις, events, πολιτισμός, culture">

  <!-- Canonical URL (English slug for international SEO) -->
  <link rel="canonical" href="https://agentathens.netlify.app/${url}">

  <!-- Language Alternates -->
  <link rel="alternate" hreflang="el" href="https://agentathens.netlify.app/${url}">
  <link rel="alternate" hreflang="en" href="https://agentathens.netlify.app/en/${url}">
  <link rel="alternate" hreflang="x-default" href="https://agentathens.netlify.app/en/${url}">

  <!-- GEO: Freshness signals -->
  <meta name="date" content="${new Date().toISOString().split('T')[0]}">
  <meta name="last-modified" content="${lastUpdate}">

  <!-- GEO: Author/source -->
  <meta name="author" content="agent-athens">
  ${bingVerification ? `<meta name="msvalidate.01" content="${bingVerification}">` : ''}

  <!-- OpenGraph: Greek Primary, English Secondary -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${eventCount} εκδηλώσεις στην Αθήνα">
  <meta property="og:url" content="https://agentathens.netlify.app/${url}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="el_GR">
  <meta property="og:locale:alternate" content="en_US">
  <meta property="og:site_name" content="agent-athens">
  <meta property="og:image" content="https://agentathens.netlify.app${filters.type ? `/images/og/${filters.type.replace('_', '-')}-default.png` : '/images/og/agentathens-default.png'}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${eventCount} εκδηλώσεις στην Αθήνα">
  <meta name="twitter:image" content="https://agentathens.netlify.app${filters.type ? `/images/og/${filters.type.replace('_', '-')}-default.png` : '/images/og/agentathens-default.png'}">

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

  <!-- Design system -->
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  <link rel="stylesheet" href="/styles/design-system.css">

  <!-- Page-specific styling -->
  <style>
    .page-header { border-bottom: 2px solid var(--border-default); margin-bottom: 30px; padding-bottom: 20px; }
    .page-header h1 { font-size: 2.5rem; margin-bottom: 10px; }
    .summary { font-size: 1.2rem; color: var(--text-secondary); margin-bottom: 10px; }
    .last-update { font-size: 0.9rem; color: var(--text-tertiary); }
    .related-pages { margin: 30px 0; padding: 20px; background: var(--bg-surface); border-radius: 8px; }
    .related-pages ul { list-style: none; display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px; }
  </style>
</head>
<body${allEvents ? ' class="has-filter-bar"' : ''}>
  ${renderSiteNav()}
  ${renderHamburgerMenu()}

  <div class="page-container">
    <header class="page-header">
      <h1>${title}</h1>
      <p class="summary">
        <strong>${eventCount} ${eventCount === 1 ? 'εκδήλωση' : 'εκδηλώσεις'}</strong> στην Αθήνα.
      </p>
      <p class="last-update">
        Τελευταία ενημέρωση: ${new Date(lastUpdate).toLocaleDateString('el-GR', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })} ώρα Αθήνας
      </p>
    </header>

    ${filterBarHTML}

    ${preContentHtml || ''}

    <main>
      ${eventCount > 0 ? `
      <section class="card-grid" itemscope itemtype="https://schema.org/ItemList">
        ${eventListHTML}
      </section>
      ` : `
      <p>Δεν βρέθηκαν εκδηλώσεις που να ταιριάζουν με αυτά τα κριτήρια. Ελέγξτε ξανά αύριο για ενημερώσεις!</p>
      <p>Το ημερολόγιό μας ενημερώνεται καθημερινά στις 8:00 π.μ. ώρα Αθήνας.</p>
      `}

      ${renderRelatedPages(filters)}
    </main>
  </div>

  ${renderSiteFooter()}
  ${renderHamburgerScript()}
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
    priceText = 'Δωρεάν';
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
    ? `${event.venue.name} · ${event.venue.neighborhood}`
    : event.venue.name;

  // Short description for meta tag (truncate to 160 chars)
  const shortDesc = (event.description || '').substring(0, 160);

  // Numeric price for data attribute (sort-by-price)
  const numericPrice = event.price.type === 'open' ? 0 : (event.price.amount || 9999);

  return { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText, shortDesc, numericPrice, exhibitionIsOpen, schemaType };
}

function renderEventCard(event: Event): string {
  const { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText, shortDesc, numericPrice, exhibitionIsOpen, schemaType } = prepareCardData(event);

  const imgSrc = event.imageLocal || event.imageUrl;

  return `
  <a href="${href}" class="event-card" data-price="${numericPrice}" itemscope itemtype="https://schema.org/${schemaType}">
    <div class="card-image-wrapper">
      ${imgSrc ? `<img class="card-image" src="${imgSrc}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">` : ''}
      <span class="card-placeholder-icon" aria-hidden="true"${imgSrc ? ' style="display:none"' : ''}>${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? '<span class="card-badge-open">ΑΝΟΙΧΤΗ</span>' : ''}
    </div>
    <div class="card-body">
      <h3 class="card-title" itemprop="name">${event.title}</h3>
      <span class="card-date"><time itemprop="startDate" datetime="${event.startDate}">${dateStr}</time>${event.type === 'exhibition' && event.endDate ? `<meta itemprop="endDate" content="${event.endDate}">` : ''}</span>
      <span class="card-venue" itemprop="location" itemscope itemtype="https://schema.org/Place"><span itemprop="name">${venueText}</span></span>
      <span class="card-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="price">${priceText}</span>${event.price.currency ? `<meta itemprop="priceCurrency" content="${event.price.currency}">` : ''}</span>
    </div>
    <meta itemprop="eventStatus" content="https://schema.org/EventScheduled">
    <meta itemprop="description" content="${shortDesc}">
  </a>`;
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
    const headerText = formatGreekDateOnly(dateKey);
    parts.push(`<h2 class="date-group-header">${headerText}</h2>`);
    for (const event of groups.get(dateKey)!) {
      parts.push(renderEventCard(event));
    }
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
    links.push(`<a href="/open-${filters.type}">Δωρεάν ${greekType}</a>`);
  }

  if (filters.time !== 'this-week') {
    links.push(`<a href="/this-week">Εκδηλώσεις αυτής της εβδομάδας</a>`);
  }

  if (filters.price !== 'open') {
    links.push(`<a href="/open">Δωρεάν εκδηλώσεις</a>`);
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

function generateSchemaMarkup(events: Event[], metadata: PageMetadata): string {
  // CRITICAL: Schema.org must ALWAYS be in English for AI agent parsing
  // Even though content is Greek, Schema.org is the universal standard

  const itemListElements = events.map((event, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "item": {
      "@type": event['@type'],
      "name": event.title,
      "description": `${event.type} event in Athens`,
      "startDate": event.startDate,
      "isAccessibleForFree": event.price.type === 'open' || event.price.type === 'donation',
      "location": {
        "@type": "Place",
        "name": event.venue.name,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": event.venue.address || "",
          "addressLocality": "Athens",
          "addressRegion": "Attica",
          "addressCountry": "GR"
        }
      },
      "offers": {
        "@type": "Offer",
        "price": (event.price.type === 'open' || event.price.type === 'donation')
          ? "0"
          : (event.price.amount ? event.price.amount.toString() : ""),
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
    "url": `https://agentathens.netlify.app/${metadata.url}`,
    "inLanguage": "el",  // Changed to Greek since content is Greek
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

