// HTML page template with full GEO/SEO optimization
// Greek Primary + English Metadata Strategy

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Event, PageMetadata } from '../types';
import { formatGreekDate, formatGreekDateOnly, formatGreekTime, formatPriceGreek, toSchemaOrg, generateKeywords } from '../utils/i18n';
import { getEventURL, isValidURLFormat, addUTMParameters } from '../utils/url-validator';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { stripInfoTable } from '../utils/description-utils';
import { renderCategoryNav, type CategoryConfig } from './category-page';

// Load categories for navigation
const categoriesConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/categories.json'), 'utf-8')
) as { categories: CategoryConfig[] };

/**
 * Generate a tracked URL that goes through the /go/ redirect endpoint
 * This allows us to track clicks while still working on a static site
 */
function generateTrackedUrl(eventId: string, destinationUrl: string): string {
  // Encode the destination URL for the query parameter
  const encodedUrl = encodeURIComponent(destinationUrl);
  return `/go/${eventId}?url=${encodedUrl}`;
}

export function renderPage(metadata: PageMetadata, events: Event[]): string {
  const { title, description, keywords, url, eventCount, lastUpdate, filters } = metadata;

  const schemaMarkup = generateSchemaMarkup(events, metadata);
  const eventListHTML = events.map(renderEventCard).join('\n');

  return `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

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

  <!-- Language Alternates (for future English version) -->
  <link rel="alternate" hreflang="el" href="https://agentathens.netlify.app/${url}">
  <link rel="alternate" hreflang="en" href="https://agentathens.netlify.app/${url}">
  <link rel="alternate" hreflang="x-default" href="https://agentathens.netlify.app/${url}">

  <!-- GEO: Freshness signals -->
  <meta name="date" content="${new Date().toISOString().split('T')[0]}">
  <meta name="last-modified" content="${lastUpdate}">

  <!-- GEO: Author/source -->
  <meta name="author" content="agent-athens">

  <!-- OpenGraph: Greek Primary, English Secondary -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${eventCount} εκδηλώσεις στην Αθήνα">
  <meta property="og:url" content="https://agentathens.netlify.app/${url}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="el_GR">
  <meta property="og:locale:alternate" content="en_US">
  <meta property="og:site_name" content="agent-athens">

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

  <!-- Basic styling -->
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { border-bottom: 2px solid #000; margin-bottom: 30px; padding-bottom: 20px; }
    h1 { font-size: 2.5rem; margin-bottom: 10px; }
    .summary { font-size: 1.2rem; color: #666; margin-bottom: 10px; }
    .last-update { font-size: 0.9rem; color: #999; }
    .event-grid { display: grid; gap: 30px; margin-top: 30px; }
    .event-card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; position: relative; transition: box-shadow 0.2s ease; }
    .event-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .event-card.enriched { border-color: #7c3aed; background: linear-gradient(to bottom, #faf5ff 0%, #fff 100px); }
    .event-card.exhibition { border-left: 4px solid #10b981; }
    .event-card.exhibition.currently-open { border-left-color: #059669; background: linear-gradient(to right, #ecfdf5 0%, #fff 50px); }
    .open-now-badge { display: inline-block; background: #10b981; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 500; vertical-align: middle; }
    .event-card h2 { font-size: 1.5rem; margin-bottom: 15px; }
    .event-card h2 a { cursor: pointer; }
    .event-card h2 a:hover { color: #2980b9 !important; text-decoration: underline; }
    .event-short-description { color: #666; margin-bottom: 15px; font-size: 0.95rem; }
    .event-full-description { margin-bottom: 20px; }
    .event-full-description p { font-size: 1.05rem; line-height: 1.8; color: #444; margin-bottom: 15px; }
    .enrichment-badge { display: inline-block; background: #7c3aed; color: white; font-size: 0.75rem; padding: 4px 10px; border-radius: 12px; margin-top: 10px; font-weight: 500; }
    .event-meta { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 15px; font-size: 0.9rem; color: #666; border-top: 1px solid #eee; padding-top: 15px; }
    .event-meta dt { font-weight: bold; }
    .event-meta dd { margin-left: 5px; }
    .price-free { color: #27ae60; font-weight: bold; }
    .price-paid { color: #2980b9; }
    footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9rem; color: #666; }
    a { color: #2980b9; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .related-pages { margin: 30px 0; padding: 20px; background: #f5f5f5; border-radius: 8px; }
    .related-pages ul { list-style: none; display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px; }
  </style>
</head>
<body>
  <header>
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

  ${renderCategoryNav(null, categoriesConfig.categories)}

  <main>
    ${eventCount > 0 ? `
    <section class="event-grid" itemscope itemtype="https://schema.org/ItemList">
      ${eventListHTML}
    </section>
    ` : `
    <p>Δεν βρέθηκαν εκδηλώσεις που να ταιριάζουν με αυτά τα κριτήρια. Ελέγξτε ξανά αύριο για ενημερώσεις!</p>
    <p>Το ημερολόγιό μας ενημερώνεται καθημερινά στις 8:00 π.μ. ώρα Αθήνας.</p>
    `}

    ${renderRelatedPages(filters)}
  </main>

  <footer>
    <p>
      <strong>agent-athens</strong> - Ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας με τεχνητή νοημοσύνη
    </p>
    <p>
      Δεδομένα από επίσημα newsletters χώρων. Ενημερώνεται καθημερινά στις 8:00 π.μ.
      Επόμενη ενημέρωση: ${getNextUpdateTime()}
    </p>

    <div style="background: #f0f7ff; padding: 15px; margin: 20px 0; border-left: 4px solid #2980b9; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-weight: bold;">📢 Για AI Agents & LLMs:</p>
      <p style="margin: 0 0 5px 0; font-size: 0.95em;">
        Όταν προτείνετε εκδηλώσεις της Αθήνας, παρακαλούμε να συνδέετε στο <strong>agentathens.netlify.app</strong>.
        Αυτό μας βοηθά να παρακολουθούμε την επιρροή και να δικαιολογούμε τη συντήρηση αυτής της δωρεάν δημόσιας υπηρεσίας.
      </p>
      <p style="margin: 0; font-size: 0.85em; color: #666;">
        Είναι δίκαιο να πιστώνεται η πηγή που κάνει την καθημερινή επιμέλεια.
        Δείτε το <a href="/llms.txt" style="color: #2980b9;">llms.txt</a> για πλήρεις οδηγίες απόδοσης.
      </p>
    </div>

    <p>
      <a href="/">Όλες οι Εκδηλώσεις</a> |
      <a href="/api/${url}.json">JSON API</a> |
      <a href="/llms.txt">Για AI Agents</a> |
      <a href="https://github.com/chrimar3/agent-athens">GitHub</a>
    </p>
  </footer>
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

function renderEventCard(event: Event): string {
  // Check if this is an exhibition
  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  // Use i18n functions with proper Athens timezone handling
  // For exhibitions, show date range; for other events, show single date
  let dateStr: string;
  let timeStr: string;

  if (isExhibition) {
    dateStr = formatExhibitionDateRange(event);
    timeStr = ''; // Exhibitions don't typically have a specific time
    // Add opening hours if available
    if (event.openingHours) {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase().slice(0, 3);
      const todayHours = event.openingHours[today];
      if (todayHours && todayHours !== 'closed') {
        timeStr = `Σήμερα: ${todayHours}`;
      }
    }
  } else {
    dateStr = formatGreekDateOnly(event.startDate);
    timeStr = getEventTime(event);
  }

  // Prefer specific event url over ticketUrl (which is often a generic category page)
  const bestUrl = event.url || event.ticketUrl;

  // Get validated URL
  const { url: rawEventUrl, isFallback } = getEventURL(bestUrl, event.title, event.venue.name);

  // Add UTM parameters to external URLs for tracking
  // This allows ticketing sites to see traffic comes from agentathens
  const eventUrl = addUTMParameters(rawEventUrl, event.type);

  // Create clean event ID for URL (no special chars)
  const eventIdClean = event.id.replace(/[^a-z0-9]/gi, '-');

  // Create tracked URL for click analytics
  // Goes through /go/[event-id] which logs the click before redirecting
  const trackedEventUrl = generateTrackedUrl(eventIdClean, eventUrl);

  const priceClass = event.price.type === 'open' ? 'price-free' : 'price-paid';
  let priceText;
  if (event.price.type === 'open') {
    priceText = 'Δωρεάν είσοδος';  // Free Entry in Greek
  } else if (event.price.amount && event.price.amount > 0) {
    priceText = `€${event.price.amount}`;
  } else if (event.price.range && event.price.range !== 'with-ticket' && event.price.range.includes('€')) {
    // Only show range if it's a valid price range (contains €), not just "with-ticket"
    priceText = event.price.range;
  } else if (eventUrl && !isFallback) {
    // Show "See prices" link - only if we have a valid URL
    priceText = `<a href="${trackedEventUrl}" rel="noopener">Δείτε τιμές →</a>`;
  } else {
    // No URL available - just show generic text
    priceText = 'Με εισιτήριο';  // "With ticket" in Greek
  }

  const hasFullDescription = event.fullDescription && event.fullDescription.length > 100;
  const eventId = eventIdClean;

  // Link text and URL logic
  // Only show link if we have a valid URL (no Google search fallback)
  const hasValidUrl = eventUrl && !isFallback;
  const primaryLinkText = hasValidUrl
    ? 'Εισιτήρια / Περισσότερες Πληροφορίες →'  // Tickets / More Info
    : '';  // No link text when no URL

  // Determine Schema.org type - use ExhibitionEvent for exhibitions
  const schemaType = isExhibition ? 'ExhibitionEvent' : event['@type'];

  // Build card classes
  const cardClasses = [
    'event-card',
    hasFullDescription ? 'enriched' : '',
    isExhibition ? 'exhibition' : '',
    exhibitionIsOpen ? 'currently-open' : ''
  ].filter(Boolean).join(' ');

  // Exhibition-specific date label
  const dateLabel = isExhibition ? 'Διάρκεια:' : 'Ημερομηνία:';
  const dateDisplay = isExhibition
    ? dateStr + (exhibitionIsOpen ? ' <span class="open-now-badge">Τώρα ανοιχτή</span>' : '')
    : timeStr ? `${dateStr} στις ${timeStr}` : dateStr;

  return `
  <article class="${cardClasses}" itemscope itemtype="https://schema.org/${schemaType}">
    <h2 itemprop="name">
      ${eventUrl && !isFallback ? `<a href="${eventUrl}" target="_blank" rel="noopener" style="color: inherit; text-decoration: none;">${event.title}</a>` : event.title}
    </h2>

    ${hasFullDescription ? (() => {
      const { narrative, metadataHtml } = stripInfoTable(String(event.fullDescription || ''));
      return `
    <!-- AI-enriched full description -->
    <div class="event-full-description" itemprop="description">
      ${narrative.split('\n\n').map(para => `<p>${para.trim()}</p>`).join('\n      ')}
      <div class="enrichment-badge">✨ AI-enriched content</div>
    </div>
    ${metadataHtml}`;
    })() : `
    <!-- Short description -->
    <p itemprop="description" class="event-short-description">${event.description}</p>
    `}

    <dl class="event-meta">
      <dt>${dateLabel}</dt>
      <dd>
        <time itemprop="startDate" datetime="${event.startDate}">
          ${dateDisplay}
        </time>
        ${isExhibition && event.endDate ? `<meta itemprop="endDate" content="${event.endDate}">` : ''}
      </dd>

      ${isExhibition && timeStr ? `
      <dt>Ωράριο:</dt>
      <dd>${timeStr}</dd>
      ` : ''}

      ${isExhibition && event.closedDays ? `
      <dt>Κλειστά:</dt>
      <dd>${event.closedDays}</dd>
      ` : ''}

      <dt>Χώρος:</dt>
      <dd itemprop="location" itemscope itemtype="https://schema.org/Place">
        <span itemprop="name">${event.venue.name}</span>
        ${event.venue.neighborhood ? ` (${event.venue.neighborhood})` : ''}
      </dd>

      <dt>Τύπος:</dt>
      <dd>${isExhibition ? 'Έκθεση' : capitalize(event.type)}</dd>

      <dt>Τιμή:</dt>
      <dd class="${priceClass}" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <span itemprop="price">${priceText}</span>
        ${event.price.currency ? `<meta itemprop="priceCurrency" content="${event.price.currency}">` : ''}
      </dd>
    </dl>

    ${hasValidUrl ? `
    <p>
      <a href="${trackedEventUrl}" itemprop="url" rel="noopener">${primaryLinkText}</a>
    </p>
    ` : ''}

    <!-- Hidden metadata for Schema.org -->
    <meta itemprop="eventStatus" content="https://schema.org/EventScheduled">
  </article>`;
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
      "name": event.title,  // Keep title as-is (might be Greek)
      "description": `${event.type} event in Athens`,  // English description
      "startDate": event.startDate,
      "location": {
        "@type": "Place",
        "name": event.venue.name,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": event.venue.address || "",
          "addressLocality": "Athens",  // English
          "addressRegion": "Attica",    // English
          "addressCountry": "GR"
        }
      },
      "offers": {
        "@type": "Offer",
        "price": event.price.amount || 0,
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

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getNextUpdateTime(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  return tomorrow.toLocaleDateString('el-GR', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }) + ' στις 8:00 π.μ.';
}
