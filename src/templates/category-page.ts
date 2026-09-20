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
import { normalizeGenreToken } from '../utils/filters';

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

    // Check genre filter (if any genre matches). Genre signal lives in both
    // the scraper-era `genres` column and the enrichment `tags` taxonomy (D1).
    // `genres` keeps its historical substring semantics; `tags` are matched
    // as exact normalized tokens — the taxonomy mixes genre tags with
    // atmosphere/crowd tags ("Warehouse", "Date-night"), so substring
    // matching there would leak unrelated events into categories.
    if (category.filter.genresInclude && category.filter.genresInclude.length > 0) {
      const eventGenres = event.genres.map(g => g.toLowerCase());
      const eventTags = (event.tags ?? []).map(normalizeGenreToken);
      const hasMatchingGenre = category.filter.genresInclude.some(genre => {
        const wanted = genre.toLowerCase();
        return (
          eventGenres.some(eg => eg.includes(wanted)) ||
          eventTags.includes(normalizeGenreToken(genre))
        );
      });
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
    apiUrl: `/api/categories/${category.slug}.json`,
    // Match the empty-filter policy; generateCategoryPages excludes these URLs.
    noindex: filteredEvents.length === 0,
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
    const ariaCurrent = isActive ? ' aria-current="page"' : '';
    return `<a href="/${cat.slug}" class="category-nav-item"${ariaCurrent}>${cat.title}</a>`;
  });

  return `
  <nav class="category-nav" aria-label="Event categories">
    <div class="category-nav-container">
      <a href="/" class="category-nav-item"${!currentCategory ? ' aria-current="page"' : ''}>Όλα</a>
      ${navItems.join('\n      ')}
    </div>
  </nav>`;
}

