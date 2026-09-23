import { escapeHtml } from '../utils/html-escape';
import { displayTitle } from '../utils/display-title';
import { escapeJsonForHtml, decodeJsonLdEntities } from '../utils/html-json';
// HTML page template with full GEO/SEO optimization
// Greek Primary + English Metadata Strategy

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Event, EventType, PageMetadata } from '../types';
import { STRINGS, type Locale } from '../i18n/strings';
import { formatGreekTime } from '../utils/i18n';
import { formatDateOnly, formatDateRange } from '../utils/i18n-date';
import { isCurrentlyOpen } from '../utils/filters';
import { getAthensTodayStr } from '../utils/event-lifecycle';
import { displayNeighborhood } from '../utils/neighborhoods';
import { generateEventSlug } from '../generators/event-page';
import { getEventTile } from '../generators/event-tile';
import { buildCollectionPageMember, buildHomepageGraph, buildBreadcrumbListMember } from '../utils/schema-graph-builders';
import { buildSiteOrganizationGraphMember } from '../utils/schema-geo';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks, renderCssLink } from './site-chrome';
import { renderSearchOverlay, renderSearchScript } from './search-overlay';
import { computeFilterCounts, renderFilterBar, renderFilterBarScript } from './filter-bar';
import type { HubIdentity } from '../utils/hub-identity';
import { renderCardSaveButton, renderSavedEventsScript, renderCardSaveScript, saveMetaFor, escapeAttr } from './action-bar';
import { firstSafeImageSrc } from '../utils/safe-url';
import { IMG_FALLBACK_ATTR } from './image-fallback';
import { BASE_URL, pageUrl } from '../config/site-url';
import { renderAnalytics } from '../config/analytics';

// Load IndexNow config for Bing WMT verification
const indexNowConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/indexnow.json'), 'utf-8')
);
const bingVerification: string = indexNowConfig.bing_wmt_verification || '';

// ── Badge & icon lookup maps ───────────────────────────

// Greek badge labels, kept as an export for existing importers. Locale-aware
// callers use badgeLabel(type, locale).
export const BADGE_LABELS: Record<string, string> = STRINGS.el.badgeLabels;

export function badgeLabel(type: string, locale: Locale = 'el'): string {
  const labels = STRINGS[locale].badgeLabels;
  return labels[type] || labels.other;
}

// Empty by default — all canonical EventType badge colors are mid-to-high luminance
// and need dark text (#0d0d0d) for WCAG AA contrast. Re-add a type here only if its
// --color-<type> hex has luminance below ~0.13 (see badge-contrast.test.ts).
// History: Performance, Cinema, Screening were here in error and failed AA. Removed
// 2026-05-18 after audit specs/event-type-badge-color-audit-2026-05-14.md (DN-approved
// Fix Vector A, locked 2026-05-15).
export const LIGHT_TEXT_BADGES = new Set<EventType>();

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

export function renderPage(metadata: PageMetadata, events: Event[], allEvents?: Event[], preContentHtml?: string, locale: Locale = 'el', postContentHtml?: string, preFilterBarHtml?: string, hubIdentity?: HubIdentity, h1Override?: string): string {
  const { title, description, keywords, url, eventCount, lastUpdate, filters } = metadata;
  const t = STRINGS[locale];

  const schemaMarkup = generateSchemaMarkup(events, metadata, locale);
  const eventListHTML = renderDateGroupedEvents(events, locale);

  // Filter bar: only render when allEvents is provided (hub pages, not category/detail pages)
  let filterBarHTML = '';
  let filterBarScriptHTML = '';
  if (allEvents) {
    const counts = computeFilterCounts(filters, allEvents);
    filterBarHTML = renderFilterBar(filters, counts, eventCount, hubIdentity, locale);
    filterBarScriptHTML = renderFilterBarScript();
  }

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

  <!-- Primary Title: Greek -->
  <title>${escapeHtml(title)} | agent-athens</title>

  <!-- Primary Description: Greek -->
  <meta name="description" content="${escapeHtml(description)}">

  <!-- Bilingual Keywords -->
  <meta name="keywords" content="${escapeHtml(keywords)}, Αθήνα, Athens, εκδηλώσεις, events, πολιτισμός, culture">

  <!-- Canonical URL (English slug for international SEO) -->
  <link rel="canonical" href="${pageUrl(url)}">${metadata.noindex ? '\n  <meta name="robots" content="noindex, follow">' : ''}

  <!-- S144 (GEO 2026-05-21): hreflang dropped until Greek launches as a real
       published+indexable+quality-gated product. See decisions.md 2026-05-21. -->

  <!-- GEO: Freshness signals -->
  <meta name="last-modified" content="${lastUpdate}">

  <!-- GEO: Author/source -->
  <meta name="author" content="agent-athens">
  ${bingVerification ? `<meta name="msvalidate.01" content="${bingVerification}">` : ''}

  <!-- OpenGraph: Greek Primary, English Secondary -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${eventCount} ${t.eventsInAthens}">
  <meta property="og:url" content="${pageUrl(url)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${locale === 'en' ? 'en_US' : 'el_GR'}">
  <!-- og:locale:alternate omitted: availableLanguage single-element per 2026-05-14 GEO canonical-to-root decision -->
  <meta property="og:site_name" content="agent-athens">
  <meta property="og:image" content="${BASE_URL}${filters.type ? `/images/og/${filters.type.replace('_', '-')}-default.png` : '/images/og/agentathens-default.png'}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${eventCount} ${t.eventsInAthens}">
  <meta name="twitter:image" content="${BASE_URL}${filters.type ? `/images/og/${filters.type.replace('_', '-')}-default.png` : '/images/og/agentathens-default.png'}">

  <!-- GEO: Location metadata -->
  <meta name="geo.region" content="GR-I">
  <meta name="geo.placename" content="Athens">
  <meta name="geo.position" content="37.9838;23.7276">

  <!-- For AI agents: alternate formats -->
  ${metadata.apiUrl ? `<link rel="alternate" type="application/json" href="${escapeHtml(metadata.apiUrl)}">` : ''}
  ${locale === 'en' ? '<link rel="alternate" type="application/ld+json" href="/api/en/events.json">' : url === 'index' ? '<link rel="alternate" type="application/ld+json" href="/api/events.json">' : ''}

  <!-- Schema.org JSON-LD -->
  ${schemaMarkup ? `<script type="application/ld+json">
  ${escapeJsonForHtml(decodeJsonLdEntities(schemaMarkup))}
  </script>` : ''}

  <!-- Design system -->
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  ${renderCssLink()}

${renderAnalytics()}
</head>
<body${allEvents ? ' class="has-filter-bar"' : ''}>
  ${renderSiteNav(locale)}
  ${renderHamburgerMenu(locale)}
  ${renderSearchOverlay(locale)}

  <div class="page-container">
    <header class="page-header">
      <div class="page-header-row">
        <h1>${escapeHtml(h1Override ?? title)}</h1>
        <span class="last-update">${t.lastUpdated}: ${new Date(lastUpdate).toLocaleDateString(t.dateTimeLocale, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Athens'
        })} ${t.athensTime}</span>
      </div>
    </header>

    ${preFilterBarHtml || ''}

    ${filterBarHTML}

    ${preContentHtml || ''}

    <main id="main-content" tabindex="-1">
      ${eventCount > 0 ? `
      <section class="card-grid">
        ${eventListHTML}
      </section>
      <p class="filter-empty-state" style="display:none">${t.filterNoResults}</p>
      ` : `
      <p>${t.emptyListing}</p>
      <p>${t.emptyListingSchedule}</p>
      `}

      ${postContentHtml || ''}
      ${renderRelatedPages(filters, locale)}
    </main>
  </div>

  ${renderSiteFooter(locale)}
  ${renderHamburgerScript()}
  ${renderSearchScript(locale)}
  ${filterBarScriptHTML}
  ${renderSavedEventsScript()}
  ${renderCardSaveScript()}
  ${renderDayLabelScript(locale)}
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
  slug: string;
  badgeLabel: string;
  colorVar: string;
  lightText: string;
  icon: string;
  venueText: string;
  shortDesc: string;
  numericPrice: number;
  exhibitionIsOpen: boolean;
}

export function prepareCardData(event: Event, locale: Locale = 'el'): CardData {
  const t = STRINGS[locale];
  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  // Date text — exhibitions show range, others show single date.
  // Non-exhibition multi-date runs that already started (garden-theater
  // seasons, festivals) also show the range: displaying their past START
  // date read as stale data to every judge panel that hit one.
  let dateStr: string;
  if (isExhibition) {
    dateStr = formatDateRange(event, locale);
    if (exhibitionIsOpen) dateStr += ` · ${t.exhibitionOpenRelated}`;
  } else {
    const todayStr = getAthensTodayStr();
    const startedBeforeToday = event.startDate.substring(0, 10) < todayStr;
    const isRunning = Boolean(event.endDate)
      && startedBeforeToday
      && String(event.endDate).substring(0, 10) >= todayStr;
    if (isRunning) {
      dateStr = `${formatDateRange(event, locale)} · ${t.nowRunning}`;
    } else if (startedBeforeToday) {
      // Implied run (no endDate; lifecycle keeps run-implying types visible):
      // "Από <start>" is factual either way — a bare past date read as stale.
      dateStr = `${t.fromDate} ${formatDateOnly(event.startDate, locale)}`;
    } else {
      dateStr = formatDateOnly(event.startDate, locale);
      const timeStr = getEventTime(event);
      if (timeStr) dateStr += ` ${t.atTime} ${timeStr}`;
    }
  }

  // Price — text only, no links (detail page has full info). priceText is
  // plain text (price.range is scraped); card templates escape it at emission.
  let priceText: string;
  if (event.price.type === 'open') {
    priceText = t.openEntry;
  } else if (event.price.amount && event.price.amount > 0) {
    priceText = `€${event.price.amount}`;
  } else if (event.price.range && event.price.range !== 'with-ticket' && event.price.range.includes('€')) {
    priceText = event.price.range;
  } else {
    priceText = t.ticketed;
  }

  // Internal link to detail page
  const slug = generateEventSlug(event);
  // English pages are generated only for events with fullDescriptionEn.
  const prefix = locale === 'en' && event.fullDescriptionEn ? '/en/events' : '/events';
  const href = `${prefix}/${slug}/`;

  // Badge
  const badge = badgeLabel(event.type, locale);
  const colorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type) ? ' card-badge--light-text' : '';

  // Placeholder icon
  const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;

  // Venue display. Neighbourhoods are stored in English; only Greek pages
  // translate them.
  const neighborhood = event.venue.neighborhood
    ? (locale === 'el' ? displayNeighborhood(event.venue.neighborhood) : event.venue.neighborhood)
    : '';
  const venueText = neighborhood ? `${event.venue.name} · ${neighborhood}` : event.venue.name;

  // Short description for meta tag (truncate to 160 chars)
  const shortDesc = (event.description || '').substring(0, 160);

  // Numeric price for data attribute (sort-by-price)
  const numericPrice = event.price.type === 'open' ? 0 : (event.price.amount || 9999);

  return { dateStr, priceText, href, slug, badgeLabel: badge, colorVar, lightText, icon, venueText, shortDesc, numericPrice, exhibitionIsOpen };
}

export function renderEventCard(event: Event, locale: Locale = 'el'): string {
  const t = STRINGS[locale];
  const { dateStr, priceText, href, slug, badgeLabel, colorVar, lightText, icon, venueText, numericPrice, exhibitionIsOpen } = prepareCardData(event, locale);

  const imgSrc = firstSafeImageSrc(event.imageLocal, event.imageUrl, event.venueImage);

  // 2026-05-25 microdata strip: JSON-LD ItemList (schema-graph-builders.ts)
  // is the authoritative emission surface. The visible price span carries
  // display text only; numeric price + availability live on the JSON-LD
  // item.offers object (built via buildOfferOrOmit, same gating logic).
  const priceHtml = `<span class="card-price"><span>${escapeHtml(priceText)}</span></span>`;

  return `
  <article class="event-card" data-price="${numericPrice}" data-type="${event.type}" data-price-type="${event.price.type}">
    ${imgSrc
      ? `<div class="card-image-wrapper" data-type="${event.type}">
      <img class="card-image" src="${escapeAttr(imgSrc)}" alt="${escapeHtml(displayTitle(event.title, event.venue?.name))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${IMG_FALLBACK_ATTR}>
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? `<span class="card-badge-open">${t.currentlyOpenShort}</span>` : ''}
      ${renderCardSaveButton(event.id, slug, event.title, Boolean(event.fullDescriptionEn), saveMetaFor(event), locale)}
    </div>`
      : `<div class="card-image-wrapper" data-type="${event.type}">
      ${getEventTile(event.id) ?? ''}
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? `<span class="card-badge-open">${t.currentlyOpenShort}</span>` : ''}
      ${renderCardSaveButton(event.id, slug, event.title, Boolean(event.fullDescriptionEn), saveMetaFor(event), locale)}
    </div>`}
    <div class="card-body">
      <h3 class="card-title"><a href="${href}" class="card-link">${escapeHtml(displayTitle(event.title, event.venue?.name))}</a></h3>
      <span class="card-date"><time datetime="${event.startDate}">${dateStr}</time></span>
      <span class="card-venue">${escapeHtml(venueText)}</span>
      ${priceHtml}
    </div>
  </article>`;
}

/**
 * Prefixes "Σήμερα · " / "Αύριο · " to dated headers. Computed in the browser
 * against Europe/Athens: pages are built once a day, so a build-time "today"
 * would be wrong after midnight. Without JS the absolute date still reads.
 */
export function renderDayLabelScript(locale: Locale): string {
  const labels = STRINGS[locale].filterTimeLabels;
  const words = [labels['today'], labels['tomorrow']];
  return `<script>
(function() {
  function iso(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  function apply() {
    var today = iso(new Date());
    // Calendar arithmetic, not now+24h: on the eve of a DST change 24h skips a day.
    var p = today.split('-');
    var tomorrow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1)).toISOString().slice(0, 10);
    document.querySelectorAll('.date-group-header[data-date]').forEach(function(h) {
      if (!h.hasAttribute('data-label-base')) h.setAttribute('data-label-base', h.textContent);
      var d = h.getAttribute('data-date');
      var word = d === today ? '${words[0]}' : d === tomorrow ? '${words[1]}' : '';
      h.textContent = (word ? word + ' · ' : '') + h.getAttribute('data-label-base');
    });
  }
  window.__aaDayLabels = apply;
  apply();
})();
</script>`;
}

function renderDateGroupedEvents(events: Event[], locale: Locale): string {
  if (events.length === 0) return '';

  // Already-running multi-date events (start before today; upstream lifecycle
  // filtering guarantees they are still on) get their own labeled lane AFTER
  // the dated groups. Filing them under a past start date made today-focused
  // pages open with a months-old header — the most repeated judge friction
  // across every panel of the redesign loop.
  const todayStr = getAthensTodayStr();
  const running = events.filter(e => e.startDate.substring(0, 10) < todayStr);
  const dated = events.filter(e => e.startDate.substring(0, 10) >= todayStr);

  // Group events by date (YYYY-MM-DD from startDate)
  const groups = new Map<string, Event[]>();
  for (const event of dated) {
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
    const headerText = formatDateOnly(dateKey, locale);
    parts.push(`<h2 class="date-group-header" id="d-${dateKey}" data-date="${dateKey}">${headerText}</h2>`);
    parts.push(`<div class="date-group" data-count="${dateEvents.length}">`);
    for (const event of dateEvents) {
      parts.push(renderEventCard(event, locale));
    }
    parts.push(`</div>`);
  }

  if (running.length > 0) {
    parts.push(`<h2 class="date-group-header">${STRINGS[locale].nowRunning}</h2>`);
    parts.push(`<div class="date-group" data-count="${running.length}">`);
    for (const event of running) {
      parts.push(renderEventCard(event, locale));
    }
    parts.push(`</div>`);
  }

  return parts.join('\n');
}

function renderRelatedPages(filters: PageMetadata['filters'], locale: Locale): string {
  const t = STRINGS[locale];
  const links: string[] = [];

  if (locale === 'en') {
    // English has no per-type listing pages; /en/this-week/ is the always-built
    // English hub and /en/open/ needs only 3 open-entry events.
    if (filters.time !== 'this-week') links.push(`<a href="/en/this-week/">${t.relatedThisWeek}</a>`);
    if (filters.price !== 'open') links.push(`<a href="/en/open/">${t.relatedOpenEvents}</a>`);
  } else {
    if (filters.type) {
      const all = t.typeDiscoveryLabels[filters.type] ?? t.typeLabels[filters.type] ?? filters.type;
      const plural = t.filterTypeLabels[filters.type] ?? t.typeLabels[filters.type] ?? filters.type;
      links.push(`<a href="/${filters.type}">${all}</a>`);
      links.push(`<a href="/open-${filters.type}">${t.relatedOpenOfType.replace('{type}', plural)}</a>`);
    }
    if (filters.time !== 'this-week') links.push(`<a href="/this-week">${t.relatedThisWeek}</a>`);
    if (filters.price !== 'open') links.push(`<a href="/open">${t.relatedOpenEvents}</a>`);
    links.push(`<a href="/">${t.relatedAllEvents}</a>`);
  }

  if (links.length === 0) return '';

  return `
  <aside class="related-pages">
    <h2>${t.relatedPages}</h2>
    <ul>
      ${links.map(link => `<li>${link}</li>`).join('\n')}
    </ul>
  </aside>`;
}

function generateSchemaMarkup(events: Event[], metadata: PageMetadata, locale: Locale = 'el'): string {
  // S139: hub pages own their own @graph injection (hub-page.ts splices the
  // envelope before </head>). Returning empty here suppresses the page.ts
  // schemaMarkup script tag — see the conditional wrapper in renderPage.
  if (metadata.pageType === 'hub') return '';

  // S139 stage 4: homepage emits a single @graph envelope here. WebSite +
  // CollectionPage + Organization. Replaces the prior two flat blocks
  // (CollectionPage from this function + separate Organization in the
  // url === 'index' branch — now deleted).
  if (metadata.pageType === 'homepage') {
    return JSON.stringify(buildHomepageGraph({ events, metadata, locale }), null, 2);
  }

  // Default path for category / combinatorial-filter / all-events / saved /
  // overflow pages. Routed through buildCollectionPageMember so the per-event
  // Offer/availability/location logic stays in one place (shared with the
  // hub + homepage @graph envelopes).
  // Phase-2 B3 (visibility 2026-07-08): the prior FLAT block left every
  // combinatorial listing page without BreadcrumbList/Organization (genre×time
  // hubs scored structured_data 0 in the baseline). Same @graph envelope as
  // hubs now: CollectionPage → BreadcrumbList → Organization.
  const selfUrl = pageUrl(metadata.url);
  const member = buildCollectionPageMember({
    events,
    metadata,
    locale,
    url: selfUrl,
    atId: `${selfUrl}#collectionpage`,
  });
  const graph = [
    member,
    buildBreadcrumbListMember({ locale, pageName: metadata.title, pageUrl: selfUrl }),
    buildSiteOrganizationGraphMember(),
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

