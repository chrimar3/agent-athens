// Regression tests for hub-page capsule + category-nav placement (Session 1 / Path D).
// Asserts that .hub-answer-capsule lands inside .page-container, after page-header,
// before filter-bar, and OUTSIDE <main> — closing the wrong-anchor regex defect
// from hub-page.ts:400-402 (capsule drift audit 2026-05-18).
//
// Pattern R guard: anchor on distinguishing class names (class="hub-answer-capsule",
// class="page-header", id="main-content"), NOT bare </header> or <main> tags.

import { describe, test, expect } from 'bun:test';
import { renderHubPage } from '../hub-page';
import { renderCategoryNav } from '../../templates/category-page';
import type { Event, HubConfig, HubFaq } from '../../types';

const testFaqs: HubFaq[] = [
  { questionEl: 'Ερώτηση πρώτη;', answerEl: 'Απάντηση πρώτη με αρκετές λέξεις για να περάσει τα 40 χαρακτήρες σύμφωνα με τα κριτήρια.' },
  { questionEl: 'Ερώτηση δεύτερη;', answerEl: 'Απάντηση δεύτερη με αρκετό κείμενο για να πληρεί τις προϋποθέσεις του σχήματος FAQPage.' },
  { questionEl: 'Ερώτηση τρίτη;', answerEl: 'Απάντηση τρίτη που παρέχει χρήσιμες πληροφορίες για τους χρήστες της πλατφόρμας.' },
  { questionEl: 'Ερώτηση τέταρτη;', answerEl: 'Απάντηση τέταρτη που εξηγεί πώς λειτουργεί η πλατφόρμα και τι προσφέρει.' },
];

const todayHubConfig: HubConfig = {
  slug: 'today',
  titleEl: 'Εκδηλώσεις Σήμερα στην Αθήνα',
  titleEn: 'Events in Athens Today',
  filter: { type: 'date', value: 'today' },
  answerCapsuleEl: 'Σήμερα στην Αθήνα θα βρείτε συναυλίες, εκθέσεις, θεατρικές παραστάσεις.',
  faqs: testFaqs,
};

const concertsHubConfig: HubConfig = {
  slug: 'concerts',
  titleEl: 'Συναυλίες στην Αθήνα',
  titleEn: 'Concerts in Athens',
  filter: { type: 'event_type', value: 'concert' },
  answerCapsuleEl: 'Η Αθήνα φιλοξενεί ζωντανές συναυλίες κάθε βράδυ.',
  faqs: testFaqs,
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

function makeTodayEvents(count: number): Event[] {
  const today = new Date();
  today.setHours(20, 0, 0, 0);
  return Array.from({ length: count }, (_, i) =>
    makeEvent({
      id: `today-event-${i}`,
      title: `Today Event ${i}`,
      startDate: today.toISOString(),
      type: i % 2 === 0 ? 'concert' : 'exhibition',
    })
  );
}

function makeConcertEvents(count: number): Event[] {
  const future = new Date();
  future.setDate(future.getDate() + 1);
  future.setHours(21, 0, 0, 0);
  return Array.from({ length: count }, (_, i) =>
    makeEvent({
      id: `concert-event-${i}`,
      title: `Concert ${i}`,
      startDate: new Date(future.getTime() + i * 86400000).toISOString(),
      type: 'concert',
    })
  );
}

// Synthetic categoryNav for event_type hub tests — mirrors the production shape
// (renderCategoryNav with null currentCategory and an empty allCategories array
// produces an "Όλα" link only; sufficient to anchor the placement assertion).
const syntheticCategoryNav = renderCategoryNav(null, []);

describe('Hub capsule placement — Path D regression (Session 1)', () => {
  describe('Date hub (today, no category-nav)', () => {
    const events = makeTodayEvents(5);
    const allEvents = [...events, ...makeConcertEvents(3)];
    const html = renderHubPage(todayHubConfig, events, allEvents);

    test('1. capsule exists in output', () => {
      expect(html).not.toBeNull();
      expect(html!).toContain('class="hub-answer-capsule"');
    });

    test('2. capsule position > page-header position', () => {
      const capsuleIdx = html!.indexOf('class="hub-answer-capsule"');
      const pageHeaderIdx = html!.indexOf('class="page-header"');
      expect(capsuleIdx).toBeGreaterThan(0);
      expect(pageHeaderIdx).toBeGreaterThan(0);
      expect(capsuleIdx).toBeGreaterThan(pageHeaderIdx);
    });

    test('3. capsule position < filter-bar position', () => {
      const capsuleIdx = html!.indexOf('class="hub-answer-capsule"');
      const filterBarIdx = html!.indexOf('class="filter-bar"');
      expect(capsuleIdx).toBeGreaterThan(0);
      expect(filterBarIdx).toBeGreaterThan(0);
      expect(capsuleIdx).toBeLessThan(filterBarIdx);
    });

    test('4. capsule inside .page-container AND outside <main>', () => {
      const pageContainerIdx = html!.indexOf('class="page-container"');
      const capsuleIdx = html!.indexOf('class="hub-answer-capsule"');
      const mainIdx = html!.indexOf('id="main-content"');
      expect(pageContainerIdx).toBeGreaterThan(0);
      expect(capsuleIdx).toBeGreaterThan(0);
      expect(mainIdx).toBeGreaterThan(0);
      // Both inequalities must hold: capsule is inside .page-container, outside <main>
      expect(pageContainerIdx).toBeLessThan(capsuleIdx);
      expect(capsuleIdx).toBeLessThan(mainIdx);
    });

    test('6. date hub renders capsule without category-nav', () => {
      expect(html!).toContain('class="hub-answer-capsule"');
      expect(html!).not.toContain('class="category-nav"');
    });
  });

  describe('Event-type hub (concerts, with category-nav)', () => {
    const events = makeConcertEvents(5);
    const allEvents = [...events, ...makeTodayEvents(3)];
    const html = renderHubPage(concertsHubConfig, events, allEvents, syntheticCategoryNav);

    test('5. category-nav shares parent chain with capsule (after page-header, before filter-bar, inside .page-container, outside <main>)', () => {
      const pageHeaderIdx = html!.indexOf('class="page-header"');
      const filterBarIdx = html!.indexOf('class="filter-bar"');
      const pageContainerIdx = html!.indexOf('class="page-container"');
      const mainIdx = html!.indexOf('id="main-content"');
      const categoryNavIdx = html!.indexOf('class="category-nav"');
      expect(categoryNavIdx).toBeGreaterThan(0);
      // After page-header
      expect(categoryNavIdx).toBeGreaterThan(pageHeaderIdx);
      // Before filter-bar
      expect(categoryNavIdx).toBeLessThan(filterBarIdx);
      // Inside .page-container
      expect(pageContainerIdx).toBeLessThan(categoryNavIdx);
      // Outside <main>
      expect(categoryNavIdx).toBeLessThan(mainIdx);
    });
  });
});
