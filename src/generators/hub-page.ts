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

import { readFileSync, mkdirSync, existsSync } from 'fs';
import { writeHtmlIfChangedSync, writeJsonApiIfChangedSync } from '../utils/write-if-changed';
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
import { getPullQuotes, getSectionEditorial, getFeaturedPickRank } from '../utils/editorial-content';
import { BASE_URL } from '../config/site-url';
import { buildHubGraph } from '../utils/schema-graph-builders';
import { hubFilterToExcludedDimension } from '../utils/hub-identity';
import { buildWeekendCapsule } from '../templates/weekend-capsule';

// TODO(D3-city_descriptor): replace with config read once home is picked
// (config/site.json vs schema-geo ORG_*). Value is final-locked; only the home is open.
const WEEKEND_CITY_DESCRIPTOR = 'central Athens';

const DIST_DIR = join(import.meta.dir, '../../dist');
const CONFIG_PATH = join(import.meta.dir, '../../config/hub-pages.json');
const CATEGORIES_CONFIG_PATH = join(import.meta.dir, '../../config/categories.json');

const MIN_EVENTS_THRESHOLD = 3;
const MAX_TABLE_ROWS = 20;
// S101a: Maximum editorial pick rank that earns the ★ marker in the comparison
// table. Editors can author rank 1-N in editorial-content.json, but only ranks
// ≤ MAX_PICK_RANK render as starred rows. Domain policy lives here, not in the
// loader, since other surfaces (homepage in S101b) may use a different limit.
const MAX_PICK_RANK = 3;
const MAX_EVENT_BLOCKS = 8;
export const HUB_EVENT_LIMIT = 30;
const PULL_QUOTE_INTERVAL = 10;

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
 * Inject pull quote asides between date groups in the card grid.
 * Inserts after every ~PULL_QUOTE_INTERVAL cards, cycling through available quotes.
 */
export function injectPullQuotes(html: string, quotes: string[]): string {
  if (quotes.length === 0) return html;

  const gridStart = html.indexOf('<section class="card-grid"');
  if (gridStart === -1) return html;

  const gridTagEnd = html.indexOf('>', gridStart) + 1;
  const gridSectionEnd = html.indexOf('</section>', gridStart);
  if (gridSectionEnd === -1) return html;

  const gridContent = html.substring(gridTagEnd, gridSectionEnd);

  // Split on date group header boundaries (lookahead preserves the delimiter)
  const segments = gridContent.split(/(?=<h2 class="date-group-header">)/);

  let cumulative = 0;
  let quoteIdx = 0;
  const result: string[] = [];

  for (const segment of segments) {
    result.push(segment);

    const countMatch = segment.match(/data-count="(\d+)"/);
    if (countMatch) {
      cumulative += parseInt(countMatch[1], 10);
    }

    if (cumulative >= PULL_QUOTE_INTERVAL && quoteIdx < quotes.length) {
      result.push(`\n<aside class="pull-quote" aria-hidden="true">${quotes[quoteIdx]}</aside>\n`);
      quoteIdx++;
      cumulative = 0;
    }
  }

  return html.substring(0, gridTagEnd) + result.join('') + html.substring(gridSectionEnd);
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
 * Render a single comparison table row.
 *
 * `hasPick` adds a 5th cell with the ★ marker — used on cornerstone hubs that
 * render the Editor's Pick column. Pass `false` (default) for non-cornerstone
 * hubs that render only the 4 standard columns.
 */
export function renderComparisonRow(
  event: Event,
  locale: Locale = 'el',
  hasPick: boolean = false
): string {
  const slug = generateEventSlug(event);
  const dateStr = formatDateOnly(event.startDate, locale);
  const price = formatTablePrice(event, locale);
  const title = event.title.length > 60
    ? event.title.substring(0, 57) + '...'
    : event.title;
  const linkPrefix = locale === 'en' ? '/en/events' : '/events';
  const pickCell = hasPick
    ? `<td class="pick-star">★</td>`
    : '';

  return `<tr><td><a href="${linkPrefix}/${slug}/">${title}</a></td><td>${event.venue.name}</td><td>${dateStr}</td><td>${price}</td>${pickCell}</tr>`;
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
  locale: Locale = 'el',
  lastUpdateOverride?: string
): string | null {
  if (filteredEvents.length < MIN_EVENTS_THRESHOLD) {
    return null;
  }

  const t = STRINGS[locale];

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
  // Override filter-derived URL with user-facing hub slug. buildURL(filters)
  // produces filter-tokens (e.g. nightlife filter type='dj_set' → 'dj_set');
  // page.ts emits canonical/og:url/JSON-LD url from metadata.url, so this
  // override aligns those with the hub slug. S144 (GEO 2026-05-21) supersedes
  // the 2026-05-14 canonical-to-root posture: /en/ hubs now self-canonical to
  // /en/<slug> (locale-aware self), closing the cross-locale-canonical bug.
  metadata.url = locale === 'en' ? `en/${config.slug}` : config.slug;
  metadata.pageType = 'hub';
  if (lastUpdateOverride) {
    metadata.lastUpdate = lastUpdateOverride;
  }
  const displayEvents = filteredEvents.slice(0, HUB_EVENT_LIMIT);
  const hasOverflow = filteredEvents.length > HUB_EVENT_LIMIT;

  // Compose capsule + category-nav as preFilterBarHtml (Path D, 2026-05-19).
  // Lands between page-header and filter-bar, inside .page-container, outside <main>.
  // Replaces a prior post-render html.replace('</header>', …) splice that
  // misanchored to site-header's </header>; see specs/capsule-drift-audit-2026-05-18.md.
  const hubTitleText = locale === 'en' ? config.titleEn : config.titleEl;
  const rawCapsule = locale === 'en' ? config.answerCapsuleEn! : config.answerCapsuleEl;
  const now = new Date();
  const monthNameEn = now.toLocaleString('en-US', { month: 'long' });
  const monthNameEl = now.toLocaleString('el-GR', { month: 'long' });
  const year = now.getFullYear();
  const resolveTokens = (text: string): string =>
    text
      .replace(/\{\{MONTH_YEAR\}\}/g, `${monthNameEn} ${year}`)
      .replace(/\{\{MONTH\}\}/g, locale === 'en' ? monthNameEn : monthNameEl);

  // Slug-scoped override seam: /en/this-weekend renders a computed capsule with
  // literal-string + token substitution from the Event[] (S101a/S144). Greek path
  // and all other hubs fall through to the existing token-resolution path.
  // editorPicks: hardcoded [] until S101b wires real picks (matches the buildHubGraph
  // call below at the cornerstone branch).
  let answerCapsule: string;
  if (config.slug === 'this-weekend' && locale === 'en') {
    const computed = buildWeekendCapsule(
      filteredEvents,
      locale,
      /* editorPicks */ [],
      WEEKEND_CITY_DESCRIPTOR,
      t,
    );
    answerCapsule = computed ?? resolveTokens(rawCapsule);
  } else {
    answerCapsule = resolveTokens(rawCapsule);
  }

  const capsuleHtml = `<section class="hub-answer-capsule">
  <p class="answer-capsule-text">${answerCapsule}</p>
  <p class="hub-stats">${filteredEvents.length} ${t.hubEventCount}</p>
</section>`;
  const preFilterBarContent = (categoryNav || '') + capsuleHtml;

  const hubIdentity = {
    canonicalUrl: metadata.url,
    excludeDimension: hubFilterToExcludedDimension(config.filter),
  };
  // Step 3b: H1 override for /en/this-weekend — pre-existing buildPageTitle gap
  // makes EN-hub H1s render Greek. Slug-gated, locale-gated minimal patch; broader
  // EN-hub H1 localization is queued as a known-issue.
  const h1Override = (config.slug === 'this-weekend' && locale === 'en')
    ? 'Athens Events This Weekend'
    : undefined;
  const baseHtml = renderPage(
    metadata,
    displayEvents,
    allEvents,
    undefined,
    locale,
    undefined,
    preFilterBarContent,
    hubIdentity,
    h1Override,
  );

  let html = baseHtml;

  // Inject pull quote asides between date groups in the card grid
  const pullQuotes = getPullQuotes(config.slug, locale);
  html = injectPullQuotes(html, pullQuotes);

  // Set HTML lang attribute
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${t.lang}">`);

  // og:locale primary now emitted locale-correctly at page.ts source
  // (2026-05-14 canonical-to-root posture). Post-render regex-patch removed.

  // Override page title and description with hub-specific values
  // (hubTitleText, rawCapsule, resolveTokens, answerCapsule are defined above
  // the renderPage call where they're consumed for preFilterBarContent composition).
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

  // Canonical URL now emitted as root-URL at page.ts source for both locales
  // (2026-05-14 canonical-to-root posture). Post-render regex-patch removed —
  // page.ts emits `${BASE_URL}/${url}` uniformly, achieving consolidation.

  // hreflang tags — bilingual hubs get el + en + x-default
  if (config.answerCapsuleEn) {
    const elUrl = `${BASE_URL}/${config.slug}`;
    const enUrl = `${BASE_URL}/en/${config.slug}`;
    const hreflangHtml = `<link rel="alternate" hreflang="el" href="${elUrl}">
  <link rel="alternate" hreflang="en" href="${enUrl}">
  <link rel="alternate" hreflang="x-default" href="${enUrl}">`;
    html = html.replace('</head>', `  ${hreflangHtml}\n</head>`);
  }

  // Part 1: Answer Capsule + category-nav now composed via preFilterBarContent
  // and threaded into renderPage above (Path D, 2026-05-19). The old post-render
  // html.replace('</header>', …) block was removed — see audit
  // specs/capsule-drift-audit-2026-05-18.md for the wrong-anchor diagnosis.

  // Part 2: Comparison Table (inject after <main id="main-content">)
  const sortedEvents = [...filteredEvents].sort((a, b) =>
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  const tableEvents = sortedEvents.slice(0, MAX_TABLE_ROWS);

  // S101a: Editor's Pick (★) column — cornerstone hubs only. Pick eligibility
  // = in-window editorial-content.json entry with rank ≤ MAX_PICK_RANK.
  // Non-cornerstones render the legacy 4-column table unchanged.
  const showPickColumn = config.cornerstone === true;
  const pickAriaLabel = locale === 'en' ? "Editor's pick" : 'Επιλογή συντακτικής ομάδας';
  const tableRows = tableEvents.map(e => {
    const hasPick = showPickColumn
      && (() => {
        const rank = getFeaturedPickRank(e.id);
        return rank !== null && rank <= MAX_PICK_RANK;
      })();
    return renderComparisonRow(e, locale, hasPick);
  }).join('\n        ');

  const pickHeaderCell = showPickColumn
    ? `<th scope="col" aria-label="${pickAriaLabel}">★</th>`
    : '';

  const tableHtml = `<section class="hub-comparison-table-section">
  <h2>${t.hubOverview}</h2>
  <div class="table-scroll-wrapper">
    <table class="hub-comparison-table">
      <thead><tr><th scope="col">${t.hubColEvent}</th><th scope="col">${t.hubColVenue}</th><th scope="col">${t.hubColDate}</th><th scope="col">${t.hubColEntry}</th>${pickHeaderCell}</tr></thead>
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
    const sectionEditorial = getSectionEditorial(config.slug, locale);
    const editorialP = sectionEditorial
      ? `\n  <p class="section-editorial">${sectionEditorial}</p>`
      : '';
    const blocks = enrichedEvents.map(e => renderEventBlock(e, locale)).join('\n  ');
    eventBlocksHtml = `<section class="hub-event-blocks">
  <h2>${t.hubDetailed}</h2>${editorialP}
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

  // S139: per-page @graph envelope (replaces prior separate CollectionPage +
  // FAQPage blocks). buildHubGraph composes CollectionPage → FAQPage (if
  // faqs render) → editor-picks ItemList (if picks.length > 0, deferred to
  // S101b) → site-publisher Organization, per Strategist Q2 ordering.
  // S144 (GEO 2026-05-21): locale-aware self-canonical — /en/ hubs canonical
  // to /en/<slug>; bare-root hubs to <slug>. Supersedes 2026-05-14 canonical-
  // to-root posture (which produced the cross-locale-canonical regression).
  const hubCanonicalUrl = `${BASE_URL}${locale === 'en' ? '/en' : ''}/${config.slug}`;
  const graphEnvelope = buildHubGraph({
    metadata,
    locale,
    events: displayEvents,
    faqs: resolvedFaqs,
    editorPicks: [],
    isCornerstone: config.cornerstone === true,
    hubCanonicalUrl,
  });
  const graphBlock = `<script type="application/ld+json">\n${JSON.stringify(graphEnvelope)}\n</script>`;
  html = html.replace('</head>', `${graphBlock}\n</head>`);

  return html;
}

/**
 * Generate all hub pages — called from generate-site.ts
 * Returns array of generated slug URLs
 */
export function generateHubPages(
  allEvents: Event[],
  lastUpdateOverrides?: Record<string, string>
): string[] {
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

    const html = renderHubPage(config, filteredEvents, allEvents, categoryNav, 'el', lastUpdateOverrides?.[config.slug]);
    if (!html) continue;

    // Write HTML to dist
    const filepath = join(DIST_DIR, `${config.slug}.html`);
    writeHtmlIfChangedSync(filepath, html);

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
        url: `${BASE_URL}/${config.slug}`
      }
    };

    writeJsonApiIfChangedSync(join(apiDir, `${config.slug}.json`), jsonData);

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
  // Overflow page canonicalizes to main hub root URL (pagination convention:
  // paginated views point canonical to the un-paginated canonical surface).
  // S144: locale-aware self per renderHubPage above.
  metadata.url = locale === 'en' ? `en/${config.slug}` : config.slug;
  metadata.pageType = 'hub';

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

  // S139: overflow page also emits the hub @graph envelope. metadata.pageType
  // is 'hub' (suppresses page.ts's flat CollectionPage), so without this
  // injection the overflow page would emit zero JSON-LD. FAQ + editor-picks
  // pass empty — FAQ doesn't render on the overflow surface and picks aren't
  // wired anywhere yet (S101b). Result: CollectionPage + Organization.
  // S144: locale-aware self per the main hub generator above.
  const hubCanonicalUrl = `${BASE_URL}${locale === 'en' ? '/en' : ''}/${config.slug}`;
  const overflowGraph = buildHubGraph({
    metadata,
    locale,
    events: filteredEvents,
    faqs: [],
    editorPicks: [],
    isCornerstone: config.cornerstone === true,
    hubCanonicalUrl,
  });
  const overflowGraphBlock = `<script type="application/ld+json">\n${JSON.stringify(overflowGraph)}\n</script>`;
  html = html.replace('</head>', `${overflowGraphBlock}\n</head>`);

  return html;
}
