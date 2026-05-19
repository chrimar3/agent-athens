// Regression tests for category-page nav placement (Session 1 / Path D).
// Asserts that <nav class="category-nav"> lands inside .page-container, after
// page-header, and OUTSIDE <main> — closing the wrong-anchor regex defect from
// category-page.ts:82 (same Pattern R violation as hub-page.ts:400-402).
//
// Smaller assertion set than hub-capsule-placement.test.ts: no capsule, no
// filter-bar on category pages (category-page calls renderPage without allEvents).

import { describe, test, expect } from 'bun:test';
import { renderCategoryPage, type CategoryConfig } from '../category-page';
import type { Event } from '../../types';

const concertsCategory: CategoryConfig = {
  slug: 'concerts',
  title: 'Συναυλίες στην Αθήνα',
  titleEn: 'Concerts in Athens',
  description: 'Test description',
  filter: { type: 'concert' },
  icon: 'music',
};

const clubsCategory: CategoryConfig = {
  slug: 'clubs',
  title: 'Clubs',
  titleEn: 'Clubs',
  description: 'Test description',
  filter: { type: 'dj_set' },
  icon: 'headphones',
};

function makeEvent(overrides: Partial<Event>): Event {
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    id: 'test-event-' + Math.random().toString(36).substring(7),
    title: 'Test Event',
    description: 'A test event',
    startDate: new Date().toISOString(),
    type: 'concert',
    genres: [],
    tags: [],
    venue: { name: 'Test Venue', address: 'Athens' },
    price: { type: 'open' },
    source: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    language: 'el',
    hasNativeGreek: false,
    ticketUrlResolved: null,
    ...overrides,
  };
}

const events: Event[] = Array.from({ length: 5 }, (_, i) =>
  makeEvent({
    id: `category-event-${i}`,
    title: `Concert ${i}`,
    type: 'concert',
  })
);

const allCategories = [concertsCategory, clubsCategory];

describe('Category-page nav placement — Path D regression (Session 1)', () => {
  const html = renderCategoryPage(concertsCategory, events, allCategories);

  test('1. category-nav exists in output', () => {
    expect(html).toContain('class="category-nav"');
  });

  test('2. category-nav position > page-header position', () => {
    const navIdx = html.indexOf('class="category-nav"');
    const pageHeaderIdx = html.indexOf('class="page-header"');
    expect(navIdx).toBeGreaterThan(0);
    expect(pageHeaderIdx).toBeGreaterThan(0);
    expect(navIdx).toBeGreaterThan(pageHeaderIdx);
  });

  test('3. category-nav inside .page-container AND outside <main>', () => {
    const pageContainerIdx = html.indexOf('class="page-container"');
    const navIdx = html.indexOf('class="category-nav"');
    const mainIdx = html.indexOf('id="main-content"');
    expect(pageContainerIdx).toBeGreaterThan(0);
    expect(navIdx).toBeGreaterThan(0);
    expect(mainIdx).toBeGreaterThan(0);
    expect(pageContainerIdx).toBeLessThan(navIdx);
    expect(navIdx).toBeLessThan(mainIdx);
  });
});
