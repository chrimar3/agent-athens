// HTML page template with full GEO/SEO optimization

import type { Event, PageMetadata } from '../types';

export function renderPage(metadata: PageMetadata, events: Event[]): string {
  const { title, description, keywords, url, eventCount, lastUpdate, filters } = metadata;

  const schemaMarkup = generateSchemaMarkup(events, metadata);
  const eventListHTML = events.map(renderEventCard).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- SEO: Title (60 chars max) -->
  <title>${title} | agent-athens</title>

  <!-- SEO: Description (155 chars max) -->
  <meta name="description" content="${description}">

  <!-- SEO: Keywords -->
  <meta name="keywords" content="${keywords}">

  <!-- SEO: Canonical URL -->
  <link rel="canonical" href="https://agent-athens.netlify.app/${url}">

  <!-- GEO: Freshness signals -->
  <meta name="date" content="${new Date().toISOString().split('T')[0]}">
  <meta name="last-modified" content="${lastUpdate}">

  <!-- GEO: Author/source -->
  <meta name="author" content="agent-athens">

  <!-- OpenGraph (social sharing) -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${eventCount} events in Athens">
  <meta property="og:url" content="https://agent-athens.netlify.app/${url}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="en_US">
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
    .event-card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
    .event-card h2 { font-size: 1.5rem; margin-bottom: 10px; }
    .event-meta { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px; font-size: 0.9rem; color: #666; }
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
      <strong>${eventCount} events</strong> ${eventCount === 1 ? 'is' : 'are'} happening in Athens.
    </p>
    <p class="last-update">
      Last updated: ${new Date(lastUpdate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })} Athens time
    </p>
  </header>

  <main>
    ${eventCount > 0 ? `
    <section class="event-grid" itemscope itemtype="https://schema.org/ItemList">
      ${eventListHTML}
    </section>
    ` : `
    <p>No events found matching these criteria. Check back tomorrow for updates!</p>
    <p>Our calendar is updated daily at 8:00 AM Athens time.</p>
    `}

    ${renderRelatedPages(filters)}
  </main>

  <footer>
    <p>
      <strong>agent-athens</strong> - AI-curated cultural events calendar for Athens, Greece
    </p>
    <p>
      Data curated from official venue newsletters. Updated daily at 8:00 AM.
      Next update: ${getNextUpdateTime()}
    </p>
    <p>
      <a href="/">All Events</a> |
      <a href="/api/${url}.json">JSON API</a> |
      <a href="/llms.txt">For AI Agents</a> |
      <a href="https://github.com/ggrigo/agent-athens">GitHub</a>
    </p>
  </footer>
</body>
</html>`;
}

function renderEventCard(event: Event): string {
  const date = new Date(event.startDate);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const priceClass = event.price.type === 'free' ? 'price-free' : 'price-paid';
  const priceText = event.price.type === 'free' ? 'Free' : event.price.range || `€${event.price.amount}`;

  return `
  <article class="event-card" itemscope itemtype="https://schema.org/${event['@type']}">
    <h2 itemprop="name">${event.title}</h2>
    <p itemprop="description">${event.description}</p>

    <dl class="event-meta">
      <dt>Date:</dt>
      <dd>
        <time itemprop="startDate" datetime="${event.startDate}">
          ${dateStr} at ${timeStr}
        </time>
      </dd>

      <dt>Venue:</dt>
      <dd itemprop="location" itemscope itemtype="https://schema.org/Place">
        <span itemprop="name">${event.venue.name}</span>
        ${event.venue.neighborhood ? ` (${event.venue.neighborhood})` : ''}
      </dd>

      <dt>Type:</dt>
      <dd>${capitalize(event.type)}</dd>

      <dt>Genre:</dt>
      <dd>${event.genres.join(', ')}</dd>

      <dt>Price:</dt>
      <dd class="${priceClass}" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <span itemprop="price">${priceText}</span>
        ${event.price.currency ? `<meta itemprop="priceCurrency" content="${event.price.currency}">` : ''}
      </dd>
    </dl>

    ${event.url ? `<p><a href="${event.url}" itemprop="url" target="_blank">Event Details →</a></p>` : ''}

    <!-- Hidden metadata for Schema.org -->
    <meta itemprop="eventStatus" content="https://schema.org/EventScheduled">
    <link itemprop="url" href="https://agent-athens.netlify.app/event/${event.id}">
  </article>`;
}

function renderRelatedPages(filters: any): string {
  // Generate related page suggestions
  const links: string[] = [];

  if (filters.type) {
    links.push(`<a href="/${filters.type}">All ${filters.type}</a>`);
    links.push(`<a href="/free-${filters.type}">Free ${filters.type}</a>`);
  }

  if (filters.time !== 'this-week') {
    links.push(`<a href="/this-week">This week's events</a>`);
  }

  if (filters.price !== 'free') {
    links.push(`<a href="/free">Free events</a>`);
  }

  links.push(`<a href="/">All events</a>`);

  if (links.length === 0) return '';

  return `
  <aside class="related-pages">
    <h2>Related Pages</h2>
    <ul>
      ${links.map(link => `<li>${link}</li>`).join('\n')}
    </ul>
  </aside>`;
}

function generateSchemaMarkup(events: Event[], metadata: PageMetadata): string {
  const itemListElements = events.map((event, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "item": {
      "@type": event['@type'],
      "name": event.title,
      "startDate": event.startDate,
      "location": {
        "@type": "Place",
        "name": event.venue.name,
        "address": event.venue.address
      },
      "offers": {
        "@type": "Offer",
        "price": event.price.amount || 0,
        "priceCurrency": event.price.currency || "EUR"
      }
    }
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": metadata.title,
    "description": metadata.description,
    "url": `https://agent-athens.netlify.app/${metadata.url}`,
    "inLanguage": "en",
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

  return tomorrow.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }) + ' at 8:00 AM';
}
