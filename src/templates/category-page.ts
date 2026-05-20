/**
 * Category Landing Page Template
 *
 * Renders category-specific landing pages with:
 * - Filtered event listings
 * - Schema.org ItemList markup
 * - Cross-navigation to other categories
 */

import type { Event } from '../types';
import { renderPage } from './page';
import { generateHubMetaDescription } from '../utils/meta-descriptions';

export interface CategoryConfig {
  slug: string;
  title: string;
  titleEn: string;
  description: string;
  filter: {
    type?: string;
    types?: string[];
    genresInclude?: string[];
  };
  icon: string;
}

/**
 * Filter events by category configuration
 */
export function filterEventsByCategory(events: Event[], category: CategoryConfig): Event[] {
  return events.filter(event => {
    // Check type filter (single type or array of types)
    if (category.filter.types && category.filter.types.length > 0) {
      if (!category.filter.types.includes(event.type)) return false;
    } else if (category.filter.type && event.type !== category.filter.type) {
      return false;
    }

    // Check genre filter (if any genre matches)
    if (category.filter.genresInclude && category.filter.genresInclude.length > 0) {
      const eventGenres = event.genres.map(g => g.toLowerCase());
      const hasMatchingGenre = category.filter.genresInclude.some(genre =>
        eventGenres.some(eg => eg.includes(genre.toLowerCase()))
      );
      if (!hasMatchingGenre) return false;
    }

    return true;
  });
}

/**
 * Render a category landing page
 */
export function renderCategoryPage(
  category: CategoryConfig,
  events: Event[],
  allCategories: CategoryConfig[]
): string {
  const filteredEvents = filterEventsByCategory(events, category);

  const metadata = {
    title: category.title,
    description: generateHubMetaDescription(
      { type: category.filter.type as any },
      filteredEvents.length
    ),
    keywords: `${category.titleEn}, Athens events, ${category.slug}, Αθήνα`,
    url: category.slug,
    eventCount: filteredEvents.length,
    lastUpdate: new Date().toISOString(),
    filters: { type: category.filter.type as any }
  };

  // Build category nav and compose via renderPage's preFilterBarHtml slot
  // (Path D, 2026-05-19). Lands inside .page-container, after page-header.
  // Replaces a prior post-render html.replace('</header>', …) splice that
  // misanchored to site-header's </header>; see specs/capsule-drift-audit-2026-05-18.md.
  const navHtml = renderCategoryNav(category, allCategories);
  return renderPage(metadata, filteredEvents, undefined, undefined, 'el', undefined, navHtml);
}

/**
 * Render category navigation menu
 */
export function renderCategoryNav(
  currentCategory: CategoryConfig | null,
  allCategories: CategoryConfig[]
): string {
  const navItems = allCategories.map(cat => {
    const isActive = currentCategory?.slug === cat.slug;
    const activeClass = isActive ? 'active' : '';
    return `<a href="/${cat.slug}" class="category-nav-item ${activeClass}">${cat.title}</a>`;
  });

  return `
  <nav class="category-nav" aria-label="Event categories">
    <div class="category-nav-container">
      <a href="/" class="category-nav-item ${!currentCategory ? 'active' : ''}">Όλα</a>
      ${navItems.join('\n      ')}
    </div>
    <style>
      .category-nav { margin: 20px 0; padding: 15px 0; border-bottom: 1px solid var(--border-subtle); overflow-x: auto; overscroll-behavior-x: contain; touch-action: pan-x; }
      .category-nav-container { display: flex; gap: 15px; flex-wrap: nowrap; white-space: nowrap; }
      .category-nav-item { padding: 8px 16px; background: var(--bg-surface); border-radius: 20px; text-decoration: none; color: var(--text-primary); font-size: 0.9rem; transition: all var(--t-fast) var(--ease-out); }
      .category-nav-item:hover { background: var(--bg-elevated); text-decoration: none; }
      .category-nav-item.active { background: var(--accent-primary); color: white; }
    </style>
  </nav>`;
}

