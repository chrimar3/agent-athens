/**
 * Hub Page Generator
 *
 * Transforms basic listing pages (/today, /this-weekend, /concerts) into
 * GEO-rich citability targets with:
 * 1. Answer capsule (40-60 words, direct answer for AI queries)
 * 2. Comparison table (max 20 events, all types)
 * 3. Event blocks (enriched description excerpts, max 8)
 * 4. FAQ section (FAQPage schema, 4 questions per hub)
 * 5. Seasonal narrative (English-only, quarterly-swapped)
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
import { STRINGS, type Locale } from '../i18n/strings';
import { formatDateOnly } from '../utils/i18n-date';
import { renderHubCrossLinks } from '../utils/cornerstone-links';

const DIST_DIR = join(import.meta.dir, '../../dist');
const CONFIG_PATH = join(import.meta.dir, '../../config/hub-pages.json');
const CATEGORIES_CONFIG_PATH = join(import.meta.dir, '../../config/categories.json');

const MIN_EVENTS_THRESHOLD = 3;
const MAX_TABLE_ROWS = 20;
const MAX_EVENT_BLOCKS = 8;
export const HUB_EVENT_LIMIT = 30;

/**
 * Get hub-filtered events based on config
 */
export function getHubEvents(config: HubConfig, allEvents: Event[]): Event[] {
  const filter = config.filter;
  if (filter.type === 'date') {
    return filterEvents(allEvents, { time: filter.value as TimeRange });
  }
  if (filter.type === 'event_type') {
    return allEvents.filter(e => e.type === filter.value);
  }
  if (filter.type === 'event_types') {
    const types = new Set(filter.values);
    return allEvents.filter(e => types.has(e.type));
  }
  if (filter.type === 'tag') {
    const targetTags = filter.values.map(t => t.toLowerCase());
    return allEvents.filter(e =>
      e.tags?.some(tag => targetTags.includes(tag.toLowerCase()))
    );
  }
  if (filter.type === 'price_type') {
    return allEvents.filter(e => e.price.type === filter.value);
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
function formatTablePrice(event: Event, locale: Locale = 'el'): string {
  const t = STRINGS[locale];
  if (event.price.type === 'open') return t.hubFreeEntry;
  if (event.price.amount && event.price.amount > 0) return `€${event.price.amount}`;
  return t.hubTicketed;
}

/**
 * Render a single comparison table row
 */
export function renderComparisonRow(event: Event, locale: Locale = 'el'): string {
  const slug = generateEventSlug(event);
  const dateStr = formatDateOnly(event.startDate, locale);
  const price = formatTablePrice(event, locale);
  const title = event.title.length > 60
    ? event.title.substring(0, 57) + '...'
    : event.title;
  const linkPrefix = locale === 'en' ? '/en/events' : '/events';

  return `<tr><td><a href="${linkPrefix}/${slug}/">${title}</a></td><td>${event.venue.name}</td><td>${dateStr}</td><td>${price}</td></tr>`;
}

/**
 * Render a single event block with excerpt
 */
export function renderEventBlock(event: Event, locale: Locale = 'el'): string {
  const slug = generateEventSlug(event);
  const dateStr = formatDateOnly(event.startDate, locale);
  const price = formatTablePrice(event, locale);
  const descriptionSource = locale === 'en' && event.fullDescriptionEn
    ? event.fullDescriptionEn
    : (event.fullDescription || '');
  const excerpt = extractExcerpt(descriptionSource);
  const linkPrefix = locale === 'en' ? '/en/events' : '/events';

  return `<article class="hub-event-block">
    <h3><a href="${linkPrefix}/${slug}/">${event.title}</a></h3>
    <p class="hub-event-meta">${event.venue.name} · ${dateStr} · ${price}</p>
    <p class="hub-event-excerpt">${excerpt}</p>
  </article>`;
}

/**
 * Render FAQ HTML section
 */
export function renderFaqSection(faqs: HubFaq[], locale: Locale = 'el'): string {
  const t = STRINGS[locale];
  const localeFaqs = locale === 'en'
    ? faqs.filter(faq => faq.questionEn && faq.answerEn)
    : faqs;

  const items = localeFaqs.map(faq => {
    const question = locale === 'en' ? faq.questionEn! : faq.questionEl;
    const answer = locale === 'en' ? faq.answerEn! : faq.answerEl;
    return `<details><summary>${question}</summary><div class="faq-answer"><p>${answer}</p></div></details>`;
  }).join('\n    ');

  return `<section class="hub-faq">
    <h2>${t.hubFaq}</h2>
    ${items}
  </section>`;
}

/**
 * Render FAQPage JSON-LD schema
 */
export function renderFaqSchema(faqs: HubFaq[], locale: Locale = 'el'): string {
  const localeFaqs = locale === 'en'
    ? faqs.filter(faq => faq.questionEn && faq.answerEn)
    : faqs;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': localeFaqs.map(faq => ({
      '@type': 'Question',
      'name': locale === 'en' ? faq.questionEn! : faq.questionEl,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': locale === 'en' ? faq.answerEn! : faq.answerEl
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
  categoryNav?: string,
  locale: Locale = 'el'
): string | null {
  if (filteredEvents.length < MIN_EVENTS_THRESHOLD) {
    return null;
  }

  const t = STRINGS[locale];
  const BASE_URL = 'https://agentathens.netlify.app';

  // For English locale, require answerCapsuleEn
  if (locale === 'en' && !config.answerCapsuleEn) {
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
  const displayEvents = filteredEvents.slice(0, HUB_EVENT_LIMIT);
  const hasOverflow = filteredEvents.length > HUB_EVENT_LIMIT;
  const baseHtml = renderPage(metadata, displayEvents, allEvents, undefined, locale);

  let html = baseHtml;

  // Set HTML lang attribute
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${t.lang}">`);

  // Set og:locale
  html = html.replace(
    /<meta property="og:locale" content="[^"]*">/,
    `<meta property="og:locale" content="${t.ogLocale}">`
  );

  // Override page title and description with hub-specific values
  const hubTitleText = locale === 'en' ? config.titleEn : config.titleEl;
  const rawCapsule = locale === 'en' ? config.answerCapsuleEn! : config.answerCapsuleEl;

  // Dynamic month/year substitution for time-based hubs (e.g. this-month)
  const now = new Date();
  const monthNameEn = now.toLocaleString('en-US', { month: 'long' });
  const monthNameEl = now.toLocaleString('el-GR', { month: 'long' });
  const year = now.getFullYear();
  const resolveTokens = (text: string): string =>
    text
      .replace(/\{\{MONTH_YEAR\}\}/g, `${monthNameEn} ${year}`)
      .replace(/\{\{MONTH\}\}/g, locale === 'en' ? monthNameEn : monthNameEl);

  const answerCapsule = resolveTokens(rawCapsule);
  const hubTitle = `${hubTitleText} | agent-athens`;
  const hubDescription = locale === 'en'
    ? (config.metaDescriptionEn ? resolveTokens(config.metaDescriptionEn).substring(0, 155) : answerCapsule.substring(0, 155))
    : (config.metaDescriptionEl ? resolveTokens(config.metaDescriptionEl).substring(0, 155) : rawCapsule.substring(0, 155));
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
  // Override OG + Twitter meta with hub-specific English/Greek values
  const hubEventStats = `${filteredEvents.length} ${t.hubEventCount}`;
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${hubTitle}">`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${hubDescription}">`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${hubTitle}">`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${hubDescription}">`
  );
  // Override OG image with per-hub branded image
  html = html.replace(
    /<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="${BASE_URL}/images/og/hubs/${config.slug}.png">`
  );

  // Canonical URL
  const canonicalPath = locale === 'en' ? `en/${config.slug}` : config.slug;
  html = html.replace(
    /<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${BASE_URL}/${canonicalPath}">`
  );

  // hreflang tags — bilingual hubs get el + en + x-default
  if (config.answerCapsuleEn) {
    const elUrl = `${BASE_URL}/${config.slug}`;
    const enUrl = `${BASE_URL}/en/${config.slug}`;
    const hreflangHtml = `<link rel="alternate" hreflang="el" href="${elUrl}">
  <link rel="alternate" hreflang="en" href="${enUrl}">
  <link rel="alternate" hreflang="x-default" href="${enUrl}">`;
    html = html.replace('</head>', `  ${hreflangHtml}\n</head>`);
  }

  // Part 1: Answer Capsule (inject after </header>)
  const capsuleHtml = `<section class="hub-answer-capsule">
  <p class="answer-capsule-text">${answerCapsule}</p>
  <p class="hub-stats">${filteredEvents.length} ${t.hubEventCount}</p>
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
  const tableRows = tableEvents.map(e => renderComparisonRow(e, locale)).join('\n        ');

  const tableHtml = `<section class="hub-comparison-table-section">
  <h2>${t.hubOverview}</h2>
  <div class="table-scroll-wrapper">
    <table class="hub-comparison-table">
      <thead><tr><th scope="col">${t.hubColEvent}</th><th scope="col">${t.hubColVenue}</th><th scope="col">${t.hubColDate}</th><th scope="col">${t.hubColEntry}</th></tr></thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>
</section>`;

  html = html.replace(/<main id="main-content"[^>]*>/, (match) => `${match}\n${tableHtml}`);

  // Part 3: Event Blocks (inject after card grid </section>)
  const enrichedEvents = sortedEvents
    .filter(e => locale === 'en'
      ? (e.fullDescriptionEn && e.fullDescriptionEn.length > 0) || (e.fullDescription && e.fullDescription.length > 0)
      : e.fullDescription && e.fullDescription.length > 0)
    .slice(0, MAX_EVENT_BLOCKS);

  let eventBlocksHtml = '';
  if (enrichedEvents.length > 0) {
    const blocks = enrichedEvents.map(e => renderEventBlock(e, locale)).join('\n  ');
    eventBlocksHtml = `<section class="hub-event-blocks">
  <h2>${t.hubDetailed}</h2>
  ${blocks}
</section>`;
  }

  // Part 4: FAQ Section (resolve any {{MONTH}}/{{MONTH_YEAR}} tokens in FAQ text)
  const resolvedFaqs = config.faqs.map(faq => ({
    ...faq,
    questionEl: resolveTokens(faq.questionEl),
    answerEl: resolveTokens(faq.answerEl),
    questionEn: faq.questionEn ? resolveTokens(faq.questionEn) : undefined,
    answerEn: faq.answerEn ? resolveTokens(faq.answerEn) : undefined,
  }));
  const faqHtml = renderFaqSection(resolvedFaqs, locale);

  // Part 5: Seasonal Narrative (bilingual, when available)
  let seasonalHtml = '';
  if (locale === 'en' && config.seasonalNarrativeEn) {
    seasonalHtml = `<section class="hub-seasonal-narrative">
  <h2>What to Expect</h2>
  <div class="seasonal-text">${config.seasonalNarrativeEn}</div>
</section>`;
  } else if (locale === 'el' && config.seasonalNarrativeEl) {
    seasonalHtml = `<section class="hub-seasonal-narrative">
  <h2>Τι να Περιμένετε</h2>
  <div class="seasonal-text">${config.seasonalNarrativeEl}</div>
</section>`;
  }

  // Part 6: Cross-links (non-cornerstone hubs only → link to cornerstone hubs)
  let crossLinksHtml = '';
  if (!config.cornerstone) {
    crossLinksHtml = renderHubCrossLinks(locale);
  }

  // "See all" link for overflow hubs
  let seeAllHtml = '';
  if (hasOverflow) {
    const allHref = locale === 'en' ? `/en/${config.slug}/all/` : `/${config.slug}/all/`;
    const seeAllText = locale === 'en'
      ? `See all ${filteredEvents.length} events →`
      : `Δείτε και τις ${filteredEvents.length} εκδηλώσεις →`;
    seeAllHtml = `\n<div class="hub-see-all-wrapper"><a href="${allHref}" class="hub-see-all">${seeAllText}</a></div>`;
  }

  // Inject "see all" + parts 3-6 after the card grid's closing </section>
  const cardGridEndIndex = html.indexOf('class="card-grid"');
  if (cardGridEndIndex !== -1) {
    // Find the </section> that closes the card-grid
    const afterCardGrid = html.indexOf('</section>', cardGridEndIndex);
    if (afterCardGrid !== -1) {
      const insertPoint = afterCardGrid + '</section>'.length;
      const injection = `${seeAllHtml}\n${eventBlocksHtml}\n${faqHtml}\n${seasonalHtml}\n${crossLinksHtml}`;
      html = html.substring(0, insertPoint) + injection + html.substring(insertPoint);
    }
  } else {
    // No card grid (0 events case) — inject before </main>
    const injection = `${seeAllHtml}\n${eventBlocksHtml}\n${faqHtml}\n${seasonalHtml}\n${crossLinksHtml}`;
    html = html.replace('</main>', `${injection}\n</main>`);
  }

  // FAQPage Schema (inject before </head>)
  const faqSchemaBlock = renderFaqSchema(resolvedFaqs, locale);
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

/**
 * Render a lightweight /all/ overflow page for hubs exceeding HUB_EVENT_LIMIT.
 * Shows ALL events (no cap), adds noindex, and links back to the main hub.
 */
export function renderOverflowPage(
  config: HubConfig,
  filteredEvents: Event[],
  allEvents: Event[],
  locale: Locale = 'el'
): string {
  const t = STRINGS[locale];
  const titleText = locale === 'en' ? config.titleEn : config.titleEl;

  // Build metadata — same filter mapping as renderHubPage
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

  // Render with ALL events (no cap) — omit allEvents to skip filter bar
  const baseHtml = renderPage(metadata, filteredEvents, undefined, undefined, locale);

  let html = baseHtml;

  // Override title
  const pageTitle = locale === 'en'
    ? `All ${titleText} | agent-athens`
    : `Όλες οι εκδηλώσεις: ${titleText} | agent-athens`;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${pageTitle}</title>`);

  // Add noindex
  html = html.replace('</head>', '  <meta name="robots" content="noindex, follow">\n</head>');

  // Set HTML lang attribute
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${t.lang}">`);

  // Add back link after <header>
  const backHref = locale === 'en' ? `/en/${config.slug}/` : `/${config.slug}`;
  const backText = locale === 'en' ? `← ${config.titleEn}` : `← ${config.titleEl}`;
  html = html.replace('</header>', `</header>\n<nav class="overflow-back"><a href="${backHref}">${backText}</a></nav>`);

  return html;
}
