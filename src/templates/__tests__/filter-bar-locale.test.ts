import { describe, test, expect } from 'bun:test';
import { renderFilterBar } from '../filter-bar';
import type { Filters, FilterCounts } from '../../types';

// S156: filter-bar labels are locale-aware (labels only; chip URLs unchanged/deferred).

const counts: FilterCounts = {
  types: [
    { value: 'concert', label: 'Συναυλίες', count: 10, url: '/concert' },
    { value: 'theater', label: 'Θέατρο', count: 5, url: '/theater' },
  ],
  prices: [
    { value: 'open', label: 'Ελεύθερη είσοδος', count: 8, url: '/open' },
    { value: 'with-ticket', label: 'Με εισιτήριο', count: 7, url: '/with-ticket' },
  ],
  timeRanges: [
    { value: 'today', label: 'Σήμερα', count: 3, url: '/today' },
    { value: 'this-weekend', label: 'Σαββατοκύριακο', count: 6, url: '/this-weekend' },
  ],
};

describe('renderFilterBar — English labels', () => {
  const html = renderFilterBar({}, counts, 20, undefined, 'en');

  test('dimension + action labels are English', () => {
    expect(html).toContain('>Type ');     // type pill button (label + chevron)
    expect(html).toContain('>Price ');
    expect(html).toContain('>Sort ');
    expect(html).toContain('Date');        // date pill + sort option
  });

  test('option labels are English', () => {
    expect(html).toContain('Concerts');
    expect(html).toContain('Theatre');
    expect(html).toContain('Today');
    expect(html).toContain('This weekend');
  });

  test('price labels use locked Tier-1 display strings (open/with-ticket), not free/paid', () => {
    expect(html).toContain('Free entry');  // open → openEntry
    expect(html).toContain('Ticketed');    // with-ticket → ticketed
    // price filter VALUES preserved in URLs (never free/paid)
    expect(html).toContain('href="/open"');
    expect(html).toContain('href="/with-ticket"');
    expect(html).not.toContain('>Paid<');
  });

  test('no Greek leaks into English filter chrome', () => {
    expect(html).not.toContain('Τύπος');
    expect(html).not.toContain('Τιμή');
    expect(html).not.toContain('Ταξινόμηση');
    expect(html).not.toContain('Συναυλίες');
    expect(html).not.toContain('Σήμερα');
  });

  test('Clear is English when a filter is active', () => {
    const active = renderFilterBar({ type: 'concert' }, counts, 10, undefined, 'en');
    expect(active).toContain('>Clear<');
    expect(active).not.toContain('Καθαρισμός');
  });
});

describe('renderFilterBar — Greek unchanged (default + explicit)', () => {
  test('Greek labels render (default locale)', () => {
    const html = renderFilterBar({}, counts, 20);
    expect(html).toContain('Τύπος');
    expect(html).toContain('Τιμή');
    expect(html).toContain('Ταξινόμηση');
    expect(html).toContain('Συναυλίες');
    expect(html).toContain('Σήμερα');
  });

  test("Greek Clear (Καθαρισμός) when a filter is active", () => {
    const active = renderFilterBar({ type: 'concert' }, counts, 10, undefined, 'el');
    expect(active).toContain('Καθαρισμός');
    expect(active).not.toContain('>Clear<');
  });
});

describe('renderFilterBar — chip URLs are locale-independent (behavior deferred)', () => {
  test('option hrefs identical across locales (no /en/ prefixing this session)', () => {
    const en = renderFilterBar({}, counts, 20, undefined, 'en');
    const el = renderFilterBar({}, counts, 20, undefined, 'el');
    for (const href of ['href="/concert"', 'href="/open"', 'href="/today"']) {
      expect(en).toContain(href);
      expect(el).toContain(href);
    }
  });
});
