import { DateTime } from 'luxon';
import { displayTitle } from '../utils/display-title';
import { escapeHtml } from '../utils/html-escape';
// Card variant templates — list row, feature card, featured carousel, featured editorial
// All reuse prepareCardData() for consistent date/price/badge/venue logic.

import type { Event } from '../types';
import { STRINGS, type Locale } from '../i18n/strings';
import { prepareCardData, TYPE_ICONS } from './page';
import { getEventTile } from '../generators/event-tile';
import { renderCardSaveButton, saveMetaFor, escapeAttr } from './action-bar';
import { firstSafeImageSrc } from '../utils/safe-url';
import { IMG_FALLBACK_ATTR } from './image-fallback';

export type BadgeTreatment = 'yellow' | 'neutral';

/**
 * Horizontal list row: image left, content right.
 * Used by venue pages for the upcoming-events list.
 */
export function renderEventCardList(event: Event, locale: Locale = 'el'): string {
  const { dateStr, priceText, href, slug, badgeLabel, colorVar, lightText, icon, venueText } = prepareCardData(event, locale);
  const imgSrc = firstSafeImageSrc(event.imageLocal, event.imageUrl, event.venueImage);

  return `
  <article class="event-card-list">
    ${imgSrc
      ? `<div class="list-image-wrapper" data-type="${event.type}">
      <img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(displayTitle(event.title, event.venue?.name))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${IMG_FALLBACK_ATTR}>
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>`
      : `<div class="list-image-wrapper" data-type="${event.type}">
      ${getEventTile(event.id) ?? ''}
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>`}
    <div class="list-content">
      <h3 class="card-title"><a href="${href}" class="card-link">${escapeHtml(displayTitle(event.title, event.venue?.name))}</a></h3>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${escapeHtml(venueText)}</span>
      <span class="card-price">${priceText}</span>
    </div>
    ${renderCardSaveButton(event.id, slug, event.title, Boolean(event.fullDescriptionEn), saveMetaFor(event), locale)}
  </article>`;
}

/**
 * Full-width feature card: 16:9 image, larger title, description excerpt.
 * Component only — not yet integrated into any page layout.
 */
export function renderFeatureCard(event: Event, locale: Locale = 'el'): string {
  const { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText, shortDesc } = prepareCardData(event, locale);
  const imgSrc = firstSafeImageSrc(event.imageLocal, event.imageUrl, event.venueImage);

  return `
  <article class="event-card-feature">
    ${imgSrc
      ? `<div class="feature-image-wrapper" data-type="${event.type}">
      <img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(displayTitle(event.title, event.venue?.name))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${IMG_FALLBACK_ATTR}>
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>`
      : `<div class="feature-image-wrapper" data-type="${event.type}">
      ${getEventTile(event.id) ?? ''}
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>`}
    <div class="feature-body">
      <h3 class="card-title"><a href="${href}" class="card-link">${escapeHtml(displayTitle(event.title, event.venue?.name))}</a></h3>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${escapeHtml(venueText)}</span>
      ${shortDesc ? `<p class="feature-description">${escapeHtml(shortDesc)}</p>` : ''}
      <span class="card-price">${priceText}</span>
    </div>
  </article>`;
}

/**
 * Score events for hero selection: prefer events with images and rich descriptions.
 * Returns top 4 with type variety enforced.
 */
function startedBeforeToday(event: Event): boolean {
  const today = DateTime.now().setZone('Europe/Athens').toISODate()!;
  return (event.startDate || '').slice(0, 10) < today;
}

function selectHeroEvents(events: Event[]): Event[] {
  if (events.length === 0) return [];

  const scored = events.map(event => {
    // Already-running events (months-long exhibitions) only fill leftover slots.
    let score = startedBeforeToday(event) ? -100 : 0;
    const imgSrc = event.imageLocal || event.imageUrl;
    if (imgSrc || event.venueImage) score += 3;  // has any image
    if (event.fullDescription) score += 2;        // has enriched description
    if (imgSrc) score += 1;                       // has specific image (not venue fallback)
    return { event, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick top 4 with type variety
  const picked: Event[] = [];
  const typesSeen = new Set<string>();

  for (const { event } of scored) {
    if (picked.length >= 4) break;
    // Skip duplicate types when we have enough candidates
    if (typesSeen.has(event.type) && scored.length > 4) continue;
    picked.push(event);
    typesSeen.add(event.type);
  }

  // If variety enforcement gave us too few, fill from remaining
  if (picked.length < 4) {
    for (const { event } of scored) {
      if (picked.length >= 4) break;
      if (!picked.includes(event)) picked.push(event);
    }
  }

  return picked;
}

export type HeroMode = 'today' | 'weekend' | 'coming-days';

/** "Απόψε" is a promise about tonight: only events starting today count toward it. */
export function chooseHeroMode(todayEvents: Event[], isoWeekday: number): HeroMode {
  const startingToday = todayEvents.filter(e => !startedBeforeToday(e)).length;
  if (startingToday >= 3) return 'today';
  if (isoWeekday >= 5) return 'weekend';
  if (startingToday > 0) return 'today';
  return 'coming-days';
}

/**
 * Hero section — featured event + 2-3 picks.
 * Replaces the old mobile-only carousel with a full-viewport hero.
 */
export function renderHeroSection(events: Event[], mode: HeroMode, locale: Locale = 'el'): string {
  const heroEvents = selectHeroEvents(events);
  if (heroEvents.length === 0) return '';
  const t = STRINGS[locale];

  const headings: Record<HeroMode, string> = {
    'today': t.heroToday,
    'weekend': t.heroWeekend,
    'coming-days': t.heroComingDays,
  };

  // English hubs build only with >= 3 events; /en/this-week/ is the one that
  // always exists, so every English mode links there.
  const links: Record<HeroMode, string> = locale === 'en'
    ? { 'today': '/en/this-week/', 'weekend': '/en/this-week/', 'coming-days': '/en/this-week/' }
    : { 'today': '/today', 'weekend': '/this-weekend', 'coming-days': '/this-week' };

  const heading = headings[mode];
  const seeAllHref = links[mode];

  const [featured, ...picks] = heroEvents;

  // Featured card
  const featuredData = prepareCardData(featured, locale);
  const featuredImg = firstSafeImageSrc(featured.imageLocal, featured.imageUrl, featured.venueImage);
  const featuredIcon = TYPE_ICONS[featured.type] || TYPE_ICONS.other;
  // Cut at a word boundary — a hard substring produced mid-word truncations
  // ("Barbara Kruger has tra") on the highest-visibility card of the page.
  const featuredRaw = featured.fullDescription || featured.description || '';
  const featuredDesc = featuredRaw.length > 160
    ? featuredRaw.substring(0, 160).replace(/\s+\S*$/, '') + '…'
    : featuredRaw;

  const featuredHtml = `
    <a href="${featuredData.href}" class="hero-card hero-card--featured">
      ${featuredImg
        ? `<div class="hero-card-image-wrapper" data-type="${featured.type}">
        <img class="hero-card-image" src="${escapeAttr(featuredImg)}" alt="${escapeHtml(displayTitle(featured.title, featured.venue?.name))}" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" ${IMG_FALLBACK_ATTR}>
        <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${featuredIcon}</span>
        <span class="card-badge${featuredData.lightText}" style="background: ${featuredData.colorVar}">${featuredData.badgeLabel}</span>
      </div>`
        : `<div class="hero-card-image-wrapper" data-type="${featured.type}">
        ${getEventTile(featured.id) ?? ''}
        <span class="card-badge${featuredData.lightText}" style="background: ${featuredData.colorVar}">${featuredData.badgeLabel}</span>
      </div>`}
      <div class="hero-card-body">
        <h3 class="hero-card-title">${escapeHtml(displayTitle(featured.title, featured.venue?.name))}</h3>
        ${featuredDesc ? `<p class="hero-card-desc">${escapeHtml(featuredDesc)}</p>` : ''}
        <span class="card-date">${featuredData.dateStr}</span>
        <span class="card-venue">${escapeHtml(featuredData.venueText)}</span>
      </div>
    </a>`;

  // Pick cards
  const picksHtml = picks.map(event => {
    const data = prepareCardData(event, locale);
    const imgSrc = firstSafeImageSrc(event.imageLocal, event.imageUrl, event.venueImage);
    const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;

    return `
      <a href="${data.href}" class="hero-card hero-card--pick">
        ${imgSrc
          ? `<div class="hero-pick-image" data-type="${event.type}">
          <img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(displayTitle(event.title, event.venue?.name))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${IMG_FALLBACK_ATTR}>
          <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
        </div>`
          : `<div class="hero-pick-image" data-type="${event.type}">
          ${getEventTile(event.id) ?? ''}
        </div>`}
        <div class="hero-pick-body">
          <h3 class="hero-pick-title">${escapeHtml(displayTitle(event.title, event.venue?.name))}</h3>
          <span class="card-date">${data.dateStr}</span>
          <span class="card-venue">${escapeHtml(data.venueText)}</span>
        </div>
      </a>`;
  }).join('\n');

  return `
  <section class="hero-section" aria-label="${heading}">
    <div class="hero-header">
      <h2 class="hero-heading">${heading}</h2>
      <a href="${seeAllHref}" class="hero-see-all">${t.seeAll} &rarr;</a>
    </div>
    <div class="hero-grid">
      <div class="hero-featured">${featuredHtml}</div>
      <div class="hero-picks">${picksHtml}</div>
    </div>
  </section>`;
}

/**
 * Featured editorial card: 16:9 image, large title, editorial vignette.
 * Variant #6 — editorial curation (hand-written vignettes vs. auto-extracted descriptions).
 * Uses isolation: isolate + heading <a>::before pattern (S64).
 */
export function renderFeaturedEventCard(
  event: Event,
  vignette: string,
  badgeTreatment: BadgeTreatment = 'yellow',
  locale: Locale = 'el'
): string {
  const { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText } = prepareCardData(event, locale);
  const imgSrc = firstSafeImageSrc(event.imageLocal, event.imageUrl, event.venueImage);

  const badgeClass = badgeTreatment === 'neutral'
    ? 'card-badge card-badge--neutral'
    : `card-badge${lightText}`;
  const badgeStyle = badgeTreatment === 'neutral'
    ? ''
    : `style="background: ${colorVar}"`;

  return `
  <article class="event-card-featured-editorial">
    ${imgSrc
      ? `<div class="featured-editorial-image" data-type="${event.type}">
      <img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(displayTitle(event.title, event.venue?.name))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${IMG_FALLBACK_ATTR}>
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="${badgeClass}" ${badgeStyle}>${badgeLabel}</span>
    </div>`
      : `<div class="featured-editorial-image" data-type="${event.type}">
      ${getEventTile(event.id) ?? ''}
      <span class="${badgeClass}" ${badgeStyle}>${badgeLabel}</span>
    </div>`}
    <div class="featured-editorial-body">
      <h3 class="featured-editorial-title"><a href="${href}" class="card-link">${escapeHtml(displayTitle(event.title, event.venue?.name))}</a></h3>
      <p class="featured-editorial-vignette">${vignette}</p>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${escapeHtml(venueText)}</span>
      <span class="card-price">${priceText}</span>
    </div>
  </article>`;
}
