// Card variant templates — list row, feature card, featured carousel
// All reuse prepareCardData() for consistent date/price/badge/venue logic.

import type { Event } from '../types';
import { prepareCardData, TYPE_ICONS } from './page';

/**
 * Horizontal list row: image left, content right.
 * Component only — not yet integrated into any page layout.
 */
export function renderEventCardList(event: Event): string {
  const { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText } = prepareCardData(event);
  const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;

  return `
  <article class="event-card-list">
    <div class="list-image-wrapper" data-type="${event.type}">
      ${imgSrc ? `<img src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">` : ''}
      <span class="card-placeholder-icon" aria-hidden="true"${imgSrc ? ' style="display:none"' : ''}>${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>
    <div class="list-content">
      <h3 class="card-title"><a href="${href}" class="card-link">${event.title}</a></h3>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${venueText}</span>
      <span class="card-price">${priceText}</span>
    </div>
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
    <div class="feature-image-wrapper" data-type="${event.type}">
      ${imgSrc ? `<img src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">` : ''}
      <span class="card-placeholder-icon" aria-hidden="true"${imgSrc ? ' style="display:none"' : ''}>${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>
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
  const featuredDesc = (featured.fullDescription || featured.description || '').substring(0, 160);

  const featuredHtml = `
    <a href="${featuredData.href}" class="hero-card hero-card--featured">
      <div class="hero-card-image-wrapper" data-type="${featured.type}">
        ${featuredImg
          ? `<img class="hero-card-image" src="${featuredImg}" alt="${featured.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
          : ''}
        <span class="card-placeholder-icon" aria-hidden="true"${featuredImg ? ' style="display:none"' : ''}>${featuredIcon}</span>
        <span class="card-badge${featuredData.lightText}" style="background: ${featuredData.colorVar}">${featuredData.badgeLabel}</span>
      </div>
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
        <div class="hero-pick-image" data-type="${event.type}">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
            : ''}
          <span class="card-placeholder-icon" aria-hidden="true"${imgSrc ? ' style="display:none"' : ''}>${icon}</span>
        </div>
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
