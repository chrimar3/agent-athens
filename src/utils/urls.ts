// URL building and metadata generation

import type { Filters, PageMetadata } from '../types';
import { generateHubMetaDescription } from './meta-descriptions';

export function buildURL(filters: Filters): string {
  const parts: string[] = [];

  if (filters.price && filters.price !== 'all') parts.push(filters.price);
  if (filters.genre) parts.push(filters.genre.toLowerCase().replace(/\s+/g, '-'));
  if (filters.type) {
    // Dedupe trailing-token overlap between genre slug and type
    // (e.g. genre="Contemporary Dance" + type="dance" → contemporary-dance, not contemporary-dance-dance)
    const lastToken = parts[parts.length - 1]?.split('-').pop();
    if (lastToken !== filters.type) parts.push(filters.type);
  }
  if (filters.time && filters.time !== 'all-events') parts.push(filters.time);

  return parts.length > 0 ? parts.join('-') : 'index';
}

export function buildPageTitle(filters: Filters): string {
  const parts: string[] = [];

  // Price filter in Greek
  if (filters.price && filters.price !== 'all') {
    if (filters.price === 'open') {
      parts.push('Ελεύθερη είσοδος');
    } else {
      parts.push('Με Εισιτήριο');
    }
  }

  // Genre (keep as-is, often in English/Latin)
  if (filters.genre) {
    parts.push(capitalize(filters.genre));
  }

  // Event type in Greek
  if (filters.type) {
    const typeTranslations: Record<string, string> = {
      'concert': 'Συναυλίες',
      'theater': 'Θέατρο',
      'exhibition': 'Εκθέσεις',
      'cinema': 'Κινηματογράφος',
      'performance': 'Παραστάσεις',
      'workshop': 'Εργαστήρια'
    };
    parts.push(typeTranslations[filters.type] || capitalize(filters.type));
  }

  // Default noun when no type/genre filter is active (homepage)
  if (!filters.type && !filters.genre) {
    parts.push('Εκδηλώσεις');
  }

  parts.push('στην Αθήνα');

  // Time range (now in Greek from formatTimeRange)
  if (filters.time && filters.time !== 'all-events') {
    parts.push(formatTimeRange(filters.time));
  }

  return parts.join(' ');
}

export function buildDescription(filters: Filters, eventCount: number): string {
  return generateHubMetaDescription(filters, eventCount);
}

export function buildKeywords(filters: Filters): string {
  const keywords: string[] = [
    'Αθήνα', 'Athens',
    'Ελλάδα', 'Greece',
    'εκδηλώσεις', 'events',
    'πολιτιστικό ημερολόγιο', 'cultural calendar'
  ];

  // Add event type in both languages
  if (filters.type) {
    const typeTranslations: Record<string, string> = {
      'concert': 'συναυλίες',
      'theater': 'θέατρο',
      'exhibition': 'εκθέσεις',
      'cinema': 'κινηματογράφος',
      'performance': 'παραστάσεις',
      'workshop': 'εργαστήρια'
    };
    keywords.push(typeTranslations[filters.type] || filters.type);
    keywords.push(filters.type);
  }

  // Genre (usually in English/Latin)
  if (filters.genre) keywords.push(filters.genre);

  // Price in both languages
  if (filters.price === 'open') {
    keywords.push('δωρεάν');
    keywords.push('open');
    keywords.push('free');  // Keep 'free' for SEO
  }

  // Time range (already in Greek)
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
    'today': 'Σήμερα',
    'tomorrow': 'Αύριο',
    'this-week': 'Αυτή την Εβδομάδα',
    'this-weekend': 'Αυτό το Σαββατοκύριακο',
    'this-month': 'Αυτόν τον Μήνα',
    'next-month': 'Επόμενο Μήνα',
    'all-events': ''
  };
  return map[timeRange] || '';
}
