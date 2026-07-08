// Card variant templates — list row, feature card, featured carousel, featured editorial
// All reuse prepareCardData() for consistent date/price/badge/venue logic.

import type { Event } from '../types';
import { prepareCardData, TYPE_ICONS } from './page';
import { getEventTile } from '../generators/event-tile';
import { renderCardSaveButton } from './action-bar';

export type BadgeTreatment = 'yellow' | 'neutral';

/**
 * Horizontal list row: image left, content right.
 * Used by venue pages for the upcoming-events list.
 */
export function renderEventCardList(event: Event): string {
  const { dateStr, priceText, href, slug, badgeLabel, colorVar, lightText, icon, venueText } = prepareCardData(event);
  const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;

  return `
  <article class="event-card-list">
    ${imgSrc
      ? `<div class="list-image-wrapper" data-type="${event.type}">
      <img src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>`
      : `<div class="list-image-wrapper" data-type="${event.type}">
      ${getEventTile(event.id) ?? ''}
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>`}
    <div class="list-content">
      <h3 class="card-title"><a href="${href}" class="card-link">${event.title}</a></h3>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${venueText}</span>
      <span class="card-price">${priceText}</span>
    </div>
    ${renderCardSaveButton(event.id, slug, event.title)}
  </article>`;
}

/**
 * Full-width feature card: 16:9 image, larger title, description excerpt.
 * Component only — not yet integrated into any page layout.
 */
export function renderFeatureCard(event: Event): string {
  const { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText, shortDesc } = prepareCardData(event);
  const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;

  return `
  <article class="event-card-feature">
    ${imgSrc
      ? `<div class="feature-image-wrapper" data-type="${event.type}">
      <img src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>`
      : `<div class="feature-image-wrapper" data-type="${event.type}">
      ${getEventTile(event.id) ?? ''}
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>`}
    <div class="feature-body">
      <h3 class="card-title"><a href="${href}" class="card-link">${event.title}</a></h3>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${venueText}</span>
      ${shortDesc ? `<p class="feature-description">${shortDesc}</p>` : ''}
      <span class="card-price">${priceText}</span>
    </div>
  </article>`;
}

/**
 * Score events for hero selection: prefer events with images and rich descriptions.
 * Returns top 4 with type variety enforced.
 */
function selectHeroEvents(events: Event[]): Event[] {
  if (events.length === 0) return [];

  const scored = events.map(event => {
    let score = 0;
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

/**
 * Hero section — featured event + 2-3 picks.
 * Replaces the old mobile-only carousel with a full-viewport hero.
 */
export function renderHeroSection(events: Event[], mode: HeroMode): string {
  const heroEvents = selectHeroEvents(events);
  if (heroEvents.length === 0) return '';

  const headings: Record<HeroMode, string> = {
    'today': 'Απόψε στην Αθήνα',
    'weekend': 'Αυτό το Σαββατοκύριακο',
    'coming-days': 'Αυτές τις μέρες στην Αθήνα',
  };

  const links: Record<HeroMode, string> = {
    'today': '/today',
    'weekend': '/this-weekend',
    'coming-days': '/this-week',
  };

  const heading = headings[mode];
  const seeAllHref = links[mode];

  const [featured, ...picks] = heroEvents;

  // Featured card
  const featuredData = prepareCardData(featured);
  const featuredImg = featured.imageLocal || featured.imageUrl || featured.venueImage;
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
        <img class="hero-card-image" src="${featuredImg}" alt="${featured.title}" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">
        <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${featuredIcon}</span>
        <span class="card-badge${featuredData.lightText}" style="background: ${featuredData.colorVar}">${featuredData.badgeLabel}</span>
      </div>`
        : `<div class="hero-card-image-wrapper" data-type="${featured.type}">
        ${getEventTile(featured.id) ?? ''}
        <span class="card-badge${featuredData.lightText}" style="background: ${featuredData.colorVar}">${featuredData.badgeLabel}</span>
      </div>`}
      <div class="hero-card-body">
        <h3 class="hero-card-title">${featured.title}</h3>
        ${featuredDesc ? `<p class="hero-card-desc">${featuredDesc}</p>` : ''}
        <span class="card-date">${featuredData.dateStr}</span>
        <span class="card-venue">${featuredData.venueText}</span>
      </div>
    </a>`;

  // Pick cards
  const picksHtml = picks.map(event => {
    const data = prepareCardData(event);
    const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;
    const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;

    return `
      <a href="${data.href}" class="hero-card hero-card--pick">
        ${imgSrc
          ? `<div class="hero-pick-image" data-type="${event.type}">
          <img src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">
          <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
        </div>`
          : `<div class="hero-pick-image" data-type="${event.type}">
          ${getEventTile(event.id) ?? ''}
        </div>`}
        <div class="hero-pick-body">
          <h3 class="hero-pick-title">${event.title}</h3>
          <span class="card-date">${data.dateStr}</span>
          <span class="card-venue">${data.venueText}</span>
        </div>
      </a>`;
  }).join('\n');

  return `
  <section class="hero-section" aria-label="${heading}">
    <div class="hero-header">
      <h2 class="hero-heading">${heading}</h2>
      <a href="${seeAllHref}" class="hero-see-all">Δείτε όλα &rarr;</a>
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
  badgeTreatment: BadgeTreatment = 'yellow'
): string {
  const { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText } = prepareCardData(event);
  const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;

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
      <img src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="${badgeClass}" ${badgeStyle}>${badgeLabel}</span>
    </div>`
      : `<div class="featured-editorial-image" data-type="${event.type}">
      ${getEventTile(event.id) ?? ''}
      <span class="${badgeClass}" ${badgeStyle}>${badgeLabel}</span>
    </div>`}
    <div class="featured-editorial-body">
      <h3 class="featured-editorial-title"><a href="${href}" class="card-link">${event.title}</a></h3>
      <p class="featured-editorial-vignette">${vignette}</p>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${venueText}</span>
      <span class="card-price">${priceText}</span>
    </div>
  </article>`;
}
