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

  return `
  <a href="${href}" class="event-card-list">
    <div class="list-image-wrapper">
      ${event.imageUrl ? `<img src="${event.imageUrl}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display=''">` : ''}
      <span class="card-placeholder-icon" aria-hidden="true"${event.imageUrl ? ' style="display:none"' : ''}>${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>
    <div class="list-content">
      <h3 class="card-title">${event.title}</h3>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${venueText}</span>
      <span class="card-price">${priceText}</span>
    </div>
  </a>`;
}

/**
 * Full-width feature card: 16:9 image, larger title, description excerpt.
 * Component only — not yet integrated into any page layout.
 */
export function renderFeatureCard(event: Event): string {
  const { dateStr, priceText, href, badgeLabel, colorVar, lightText, icon, venueText, shortDesc } = prepareCardData(event);

  return `
  <a href="${href}" class="event-card-feature">
    <div class="feature-image-wrapper">
      ${event.imageUrl ? `<img src="${event.imageUrl}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display=''">` : ''}
      <span class="card-placeholder-icon" aria-hidden="true"${event.imageUrl ? ' style="display:none"' : ''}>${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
    </div>
    <div class="feature-body">
      <h3 class="card-title">${event.title}</h3>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${venueText}</span>
      ${shortDesc ? `<p class="feature-description">${shortDesc}</p>` : ''}
      <span class="card-price">${priceText}</span>
    </div>
  </a>`;
}

/**
 * Mobile horizontal scroll carousel — today's events.
 * Hidden on desktop via CSS (display: none), flex on mobile.
 * Returns empty string when no events (quiet days = no carousel).
 */
export function renderFeaturedCarousel(events: Event[]): string {
  if (events.length === 0) return '';

  const cards = events.map(event => {
    const { dateStr, href, venueText } = prepareCardData(event);
    const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;

    return `
    <a href="${href}" class="carousel-card">
      ${event.imageUrl
        ? `<img class="carousel-card-image" src="${event.imageUrl}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`
        : `<div class="carousel-card-image" style="display:flex;align-items:center;justify-content:center;font-size:2rem;opacity:0.12">${icon}</div>`
      }
      <h3 class="card-title">${event.title}</h3>
      <span class="card-date">${dateStr}</span>
      <span class="card-venue">${venueText}</span>
    </a>`;
  }).join('\n');

  return `
  <section class="featured-carousel" aria-label="Featured events today">
    ${cards}
  </section>`;
}
