// URL building and metadata generation

import type { Filters, PageMetadata } from '../types';

export function buildURL(filters: Filters): string {
  const parts: string[] = [];

  if (filters.price && filters.price !== 'all') parts.push(filters.price);
  if (filters.genre) parts.push(filters.genre.toLowerCase().replace(/\s+/g, '-'));
  if (filters.type) parts.push(filters.type);
  if (filters.time && filters.time !== 'all-events') parts.push(filters.time);

  return parts.length > 0 ? parts.join('-') : 'index';
}

export function buildPageTitle(filters: Filters): string {
  const parts: string[] = [];

  if (filters.price && filters.price !== 'all') {
    parts.push(capitalize(filters.price));
  }

  if (filters.genre) {
    parts.push(capitalize(filters.genre));
  }

  if (filters.type) {
    parts.push(capitalize(filters.type));
  }

  parts.push('in Athens');

  if (filters.time && filters.time !== 'all-events') {
    parts.push(formatTimeRange(filters.time));
  }

  return parts.join(' ');
}

export function buildDescription(filters: Filters, eventCount: number): string {
  let desc = `Find ${eventCount} `;

  if (filters.price === 'free') desc += 'free ';
  if (filters.genre) desc += `${filters.genre.toLowerCase()} `;
  if (filters.type) desc += `${filters.type} `;
  else desc += 'events ';

  desc += 'happening in Athens';

  if (filters.time && filters.time !== 'all-events') {
    desc += ` ${formatTimeRange(filters.time).toLowerCase()}`;
  }

  desc += '. Updated daily with curated events from 10+ venues.';

  return desc;
}

export function buildKeywords(filters: Filters): string {
  const keywords: string[] = ['Athens', 'Greece', 'events', 'cultural calendar'];

  if (filters.type) keywords.push(filters.type);
  if (filters.genre) keywords.push(filters.genre);
  if (filters.price === 'free') keywords.push('free');
  if (filters.time) keywords.push(formatTimeRange(filters.time));

  return keywords.join(', ');
}

export function buildPageMetadata(filters: Filters, eventCount: number): PageMetadata {
  const url = buildURL(filters);
  const title = buildPageTitle(filters);
  const description = buildDescription(filters, eventCount);
  const keywords = buildKeywords(filters);
  const lastUpdate = new Date().toISOString();

  return {
    url,
    title,
    description,
    keywords,
    eventCount,
    lastUpdate,
    filters
  };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTimeRange(timeRange: string): string {
  const map: Record<string, string> = {
    'today': 'Today',
    'tomorrow': 'Tomorrow',
    'this-week': 'This Week',
    'this-weekend': 'This Weekend',
    'this-month': 'This Month',
    'next-month': 'Next Month',
    'all-events': ''
  };
  return map[timeRange] || '';
}
