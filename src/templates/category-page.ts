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

export interface CategoryConfig {
  slug: string;
  title: string;
  titleEn: string;
  description: string;
  filter: {
    type?: string;
    genresInclude?: string[];
  };
  icon: string;
}

/**
 * Filter events by category configuration
 */
export function filterEventsByCategory(events: Event[], category: CategoryConfig): Event[] {
  return events.filter(event => {
    // Check type filter
    if (category.filter.type && event.type !== category.filter.type) {
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
    description: category.description,
    keywords: `${category.titleEn}, Athens events, ${category.slug}, Αθήνα`,
    url: category.slug,
    eventCount: filteredEvents.length,
    lastUpdate: new Date().toISOString(),
    filters: { type: category.filter.type as any }
  };

  // Use the main page renderer for consistency
  const html = renderPage(metadata, filteredEvents);

  // Add navigation to other categories
  const navHtml = renderCategoryNav(category, allCategories);

  // Insert navigation after header
  return html.replace('</header>', `</header>\n${navHtml}`);
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
      .category-nav { margin: 20px 0; padding: 15px 0; border-bottom: 1px solid #eee; overflow-x: auto; }
      .category-nav-container { display: flex; gap: 15px; flex-wrap: nowrap; white-space: nowrap; }
      .category-nav-item { padding: 8px 16px; background: #f5f5f5; border-radius: 20px; text-decoration: none; color: #333; font-size: 0.9rem; transition: all 0.2s ease; }
      .category-nav-item:hover { background: #e5e5e5; text-decoration: none; }
      .category-nav-item.active { background: #2980b9; color: white; }
    </style>
  </nav>`;
}

/**
 * Generate Schema.org ItemList for a category
 */
export function generateCategorySchemaMarkup(
  category: CategoryConfig,
  events: Event[]
): string {
  // Take top 20 events for Schema.org
  const topEvents = events.slice(0, 20);

  const itemListElements = topEvents.map((event, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "item": {
      "@type": event.type === 'exhibition' ? 'ExhibitionEvent' : 'Event',
      "name": event.title,
      "description": `${event.type} event in Athens`,
      "startDate": event.startDate,
      "endDate": event.endDate || undefined,
      "location": {
        "@type": "Place",
        "name": event.venue.name,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Athens",
          "addressCountry": "GR"
        }
      }
    }
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${category.title} | Cultural Events in Athens`,
    "description": `${events.length} ${category.titleEn.toLowerCase()} in Athens, Greece`,
    "url": `https://agentathens.netlify.app/${category.slug}`,
    "inLanguage": "el",
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": events.length,
      "itemListElement": itemListElements
    }
  };

  return JSON.stringify(schema, null, 2);
}
