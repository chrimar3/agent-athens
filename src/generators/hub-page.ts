/**
 * Hub Page Generator
 *
 * Transforms basic listing pages (/today, /this-weekend, /concerts) into
 * GEO-rich citability targets with:
 * 1. Answer capsule (40-60 words, direct answer for AI queries)
 * 2. Comparison table (max 20 events, all types)
 * 3. Event blocks (enriched description excerpts, max 8)
 * 4. FAQ section (FAQPage schema, 4 questions per hub)
 * 5. Seasonal narrative (placeholder for Sprint 3d)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Event, HubConfig, HubFaq, TimeRange } from '../types';
import { filterEvents } from '../utils/filters';
import { filterEventsByCategory } from '../templates/category-page';
import { renderPage } from '../templates/page';
import { renderCategoryNav, type CategoryConfig } from '../templates/category-page';
import { buildPageMetadata } from '../utils/urls';
import { formatGreekDateOnly } from '../utils/i18n';
import { generateEventSlug } from './event-page';

const DIST_DIR = join(import.meta.dir, '../../dist');
const CONFIG_PATH = join(import.meta.dir, '../../config/hub-pages.json');
const CATEGORIES_CONFIG_PATH = join(import.meta.dir, '../../config/categories.json');

const MIN_EVENTS_THRESHOLD = 3;
const MAX_TABLE_ROWS = 20;
const MAX_EVENT_BLOCKS = 8;

/**
 * Get hub-filtered events based on config
 */
export function getHubEvents(config: HubConfig, allEvents: Event[]): Event[] {
  if (config.filter.type === 'date') {
    return filterEvents(allEvents, { time: config.filter.value as TimeRange });
  }
  if (config.filter.type === 'event_type') {
    return allEvents.filter(e => e.type === config.filter.value);
  }
  if (config.filter.type === 'event_types') {
    const types = new Set(config.filter.values);
    return allEvents.filter(e => types.has(e.type));
  }
  if (config.filter.type === 'tag') {
    const targetTags = config.filter.values.map(t => t.toLowerCase());
    return allEvents.filter(e =>
      e.tags?.some(tag => targetTags.includes(tag.toLowerCase()))
    );
  }
  if (config.filter.type === 'price_type') {
    return allEvents.filter(e => e.price.type === config.filter.value);
  }
  return [];
}

/**
 * Extract first 2 sentences from a description for excerpt
 */
export function extractExcerpt(fullDescription: string): string {
  if (!fullDescription) return '';

  // Split on sentence endings followed by space (handles Greek text with periods)
  // Match ". " followed by uppercase or Greek uppercase letter
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < fullDescription.length; i++) {
    current += fullDescription[i];

    // Check for sentence boundary: period/!/? followed by space
    if ((fullDescription[i] === '.' || fullDescription[i] === '!' || fullDescription[i] === '?') &&
        i + 1 < fullDescription.length && fullDescription[i + 1] === ' ') {
      sentences.push(current.trim());
      current = '';

      if (sentences.length >= 2) break;
    }
  }

  // If we have leftover text and no 2 sentences, include it
  if (current.trim() && sentences.length < 2) {
    sentences.push(current.trim());
  }

  if (sentences.length === 0) {
    // Fallback: truncate to 160 chars
    return fullDescription.length <= 160
      ? fullDescription
      : fullDescription.substring(0, 157) + '...';
  }

  const result = sentences.slice(0, 2).join(' ');
  return result;
}

/**
 * Format price for comparison table
 */
function formatTablePrice(event: Event): string {
  if (event.price.type === 'open') return 'Ελ. είσοδος';
  if (event.price.amount && event.price.amount > 0) return `€${event.price.amount}`;
  return 'Εισιτήριο';
}

/**
 * Render a single comparison table row
 */
export function renderComparisonRow(event: Event): string {
  const slug = generateEventSlug(event);
  const dateStr = formatGreekDateOnly(event.startDate);
  const price = formatTablePrice(event);
  const title = event.title.length > 60
    ? event.title.substring(0, 57) + '...'
    : event.title;

  return `<tr><td><a href="/events/${slug}/">${title}</a></td><td>${event.venue.name}</td><td>${dateStr}</td><td>${price}</td></tr>`;
}

/**
 * Render a single event block with excerpt
 */
export function renderEventBlock(event: Event): string {
  const slug = generateEventSlug(event);
  const dateStr = formatGreekDateOnly(event.startDate);
  const price = formatTablePrice(event);
  const excerpt = extractExcerpt(event.fullDescription || '');

  return `<article class="hub-event-block">
    <h3><a href="/events/${slug}/">${event.title}</a></h3>
    <p class="hub-event-meta">${event.venue.name} · ${dateStr} · ${price}</p>
    <p class="hub-event-excerpt">${excerpt}</p>
  </article>`;
}

/**
 * Render FAQ HTML section
 */
export function renderFaqSection(faqs: HubFaq[]): string {
  const items = faqs.map(faq =>
    `<details><summary>${faq.questionEl}</summary><div class="faq-answer"><p>${faq.answerEl}</p></div></details>`
  ).join('\n    ');

  return `<section class="hub-faq">
    <h2>Συχνές Ερωτήσεις</h2>
    ${items}
  </section>`;
}

/**
 * Render FAQPage JSON-LD schema
 */
export function renderFaqSchema(faqs: HubFaq[]): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqs.map(faq => ({
      '@type': 'Question',
      'name': faq.questionEl,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': faq.answerEl
      }
    }))
  };

  return `<script type="application/ld+json">\n${JSON.stringify(schema)}\n</script>`;
}

/**
 * Render the full hub page by injecting 5-part structure into base HTML
 * Returns null if below minimum threshold
 */
export function renderHubPage(
  config: HubConfig,
  filteredEvents: Event[],
  allEvents: Event[],
  categoryNav?: string
): string | null {
  if (filteredEvents.length < MIN_EVENTS_THRESHOLD) {
    return null;
  }

  // Generate base page HTML using renderPage
  // Map hub filter to Filters object for metadata generation
  let metadataFilters: import('../types').Filters;
  switch (config.filter.type) {
    case 'date':
      metadataFilters = { time: config.filter.value as TimeRange };
      break;
    case 'event_type':
      metadataFilters = { type: config.filter.value as any };
      break;
    case 'event_types':
      metadataFilters = { type: config.filter.values[0] as any };
      break;
    case 'tag':
      metadataFilters = {};
      break;
    case 'price_type':
      metadataFilters = { price: config.filter.value as any };
      break;
  }
  const metadata = buildPageMetadata(metadataFilters, filteredEvents.length);
  const baseHtml = renderPage(metadata, filteredEvents, allEvents);

  let html = baseHtml;

  // Override page title and description with hub-specific values
  // This prevents the generic metadata generator from using terms like "δωρεάν"
  const hubTitle = `${config.titleEl} | agent-athens`;
  const hubDescription = `${config.answerCapsuleEl.substring(0, 155)}`;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${hubTitle}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${hubDescription}">`
  );
  // Also override keywords to use hub-specific terms
  const hubKeywords = `${config.titleEl}, ${config.titleEn}, Αθήνα, Athens, εκδηλώσεις, events, πολιτισμός, culture`;
  html = html.replace(
    /<meta name="keywords" content="[^"]*">/,
    `<meta name="keywords" content="${hubKeywords}">`
  );

  // Part 1: Answer Capsule (inject after </header>)
  const capsuleHtml = `<section class="hub-answer-capsule">
  <p class="answer-capsule-text">${config.answerCapsuleEl}</p>
  <p class="hub-stats">${filteredEvents.length} εκδηλώσεις</p>
</section>`;

  // If there's a category nav, inject it then the capsule
  if (categoryNav) {
    html = html.replace('</header>', `</header>\n${categoryNav}\n${capsuleHtml}`);
  } else {
    html = html.replace('</header>', `</header>\n${capsuleHtml}`);
  }

  // Part 2: Comparison Table (inject after <main id="main-content">)
  const sortedEvents = [...filteredEvents].sort((a, b) =>
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  const tableEvents = sortedEvents.slice(0, MAX_TABLE_ROWS);
  const tableRows = tableEvents.map(e => renderComparisonRow(e)).join('\n        ');

  const tableHtml = `<section class="hub-comparison-table-section">
  <h2>Επισκόπηση</h2>
  <div class="table-scroll-wrapper">
    <table class="hub-comparison-table">
      <thead><tr><th scope="col">Εκδήλωση</th><th scope="col">Χώρος</th><th scope="col">Ημερομηνία</th><th scope="col">Είσοδος</th></tr></thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>
</section>`;

  html = html.replace(/<main id="main-content"[^>]*>/, (match) => `${match}\n${tableHtml}`);

  // Part 3: Event Blocks (inject after card grid </section>)
  const enrichedEvents = sortedEvents
    .filter(e => e.fullDescription && e.fullDescription.length > 0)
    .slice(0, MAX_EVENT_BLOCKS);

  let eventBlocksHtml = '';
  if (enrichedEvents.length > 0) {
    const blocks = enrichedEvents.map(e => renderEventBlock(e)).join('\n  ');
    eventBlocksHtml = `<section class="hub-event-blocks">
  <h2>Αναλυτικά</h2>
  ${blocks}
</section>`;
  }

  // Part 4: FAQ Section
  const faqHtml = renderFaqSection(config.faqs);

  // Part 5: Seasonal Narrative (placeholder)
  const seasonalHtml = `<section class="hub-seasonal-narrative"></section>`;

  // Inject parts 3-5 after the card grid's closing </section>
  // Find the card-grid section and inject after it
  const cardGridEndPattern = '</section>\n\n      ';
  const cardGridEndIndex = html.indexOf('class="card-grid"');
  if (cardGridEndIndex !== -1) {
    // Find the </section> that closes the card-grid
    const afterCardGrid = html.indexOf('</section>', cardGridEndIndex);
    if (afterCardGrid !== -1) {
      const insertPoint = afterCardGrid + '</section>'.length;
      const injection = `\n${eventBlocksHtml}\n${faqHtml}\n${seasonalHtml}`;
      html = html.substring(0, insertPoint) + injection + html.substring(insertPoint);
    }
  } else {
    // No card grid (0 events case) — inject before </main>
    const injection = `\n${eventBlocksHtml}\n${faqHtml}\n${seasonalHtml}`;
    html = html.replace('</main>', `${injection}\n</main>`);
  }

  // FAQPage Schema (inject before </head>)
  const faqSchemaBlock = renderFaqSchema(config.faqs);
  html = html.replace('</head>', `${faqSchemaBlock}\n</head>`);

  return html;
}

/**
 * Generate all hub pages — called from generate-site.ts
 * Returns array of generated slug URLs
 */
export function generateHubPages(allEvents: Event[]): string[] {
  const hubConfigs: { hubs: HubConfig[] } = JSON.parse(
    readFileSync(CONFIG_PATH, 'utf-8')
  );

  // Load categories config for /concerts category nav
  const categoriesConfig: { categories: CategoryConfig[] } = JSON.parse(
    readFileSync(CATEGORIES_CONFIG_PATH, 'utf-8')
  );

  const generatedSlugs: string[] = [];

  for (const config of hubConfigs.hubs) {
    const filteredEvents = getHubEvents(config, allEvents);

    if (filteredEvents.length < MIN_EVENTS_THRESHOLD) {
      console.log(`  ⏭️ /${config.slug} skipped (${filteredEvents.length} events, need ≥${MIN_EVENTS_THRESHOLD})`);
      continue;
    }

    // For category-based hubs (like /concerts, /theater), include category nav
    let categoryNav: string | undefined;
    if (config.filter.type === 'event_type' || config.filter.type === 'event_types') {
      const filterValue = config.filter.type === 'event_type'
        ? config.filter.value
        : config.filter.values[0];
      const currentCategory = categoriesConfig.categories.find(
        c => c.filter.type === filterValue
      ) || null;
      categoryNav = renderCategoryNav(currentCategory, categoriesConfig.categories);
    }

    const html = renderHubPage(config, filteredEvents, allEvents, categoryNav);
    if (!html) continue;

    // Write HTML to dist
    const filepath = join(DIST_DIR, `${config.slug}.html`);
    writeFileSync(filepath, html);

    // Write enhanced JSON API
    const apiDir = join(DIST_DIR, 'api');
    if (!existsSync(apiDir)) {
      mkdirSync(apiDir, { recursive: true });
    }

    const jsonData = {
      hub: {
        slug: config.slug,
        titleEl: config.titleEl,
        titleEn: config.titleEn,
        answerCapsule: config.answerCapsuleEl,
        faqCount: config.faqs.length,
      },
      events: filteredEvents,
      meta: {
        total: filteredEvents.length,
        enrichedCount: filteredEvents.filter(e => e.fullDescription).length,
        lastUpdate: new Date().toISOString(),
        url: `https://agentathens.netlify.app/${config.slug}`
      }
    };

    writeFileSync(
      join(apiDir, `${config.slug}.json`),
      JSON.stringify(jsonData, null, 2)
    );

    console.log(`  ✓ /${config.slug} (${filteredEvents.length} events, ${filteredEvents.filter(e => e.fullDescription).length} enriched)`);
    generatedSlugs.push(config.slug);
  }

  return generatedSlugs;
}
