import { describe, test, expect } from 'bun:test';
import { renderFilterBar } from '../filter-bar';
import type { Filters, FilterCounts } from '../../types';
import type { HubIdentity } from '../../utils/hub-identity';

const emptyCounts: FilterCounts = {
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

describe('renderFilterBar — hub identity model', () => {
  describe('event_type hub (/concerts, excludeDimension=type)', () => {
    const hubIdentity: HubIdentity = { canonicalUrl: 'concerts', excludeDimension: 'type' };

    test('bare hub: no Καθαρισμός; type pill suppressed', () => {
      const filters: Filters = { type: 'concert' };
      const html = renderFilterBar(filters, emptyCounts, 10, hubIdentity);

      expect(html).not.toContain('Καθαρισμός');
      expect(html).not.toContain('data-filter="type"');
    });

    test('+price filter: Καθαρισμός present, href=hub canonical, type pill still suppressed', () => {
      const filters: Filters = { type: 'concert', price: 'open' };
      const html = renderFilterBar(filters, emptyCounts, 8, hubIdentity);

      expect(html).toContain('Καθαρισμός');
      expect(html).toContain('href="/concerts"');
      expect(html).not.toContain('data-filter="type"');
      expect(html).toContain('data-filter="price"');
    });
  });

  describe('date hub (/today, excludeDimension=time)', () => {
    const hubIdentity: HubIdentity = { canonicalUrl: 'today', excludeDimension: 'time' };

    test('bare hub: no Καθαρισμός; date pill suppressed', () => {
      const filters: Filters = { time: 'today' };
      const html = renderFilterBar(filters, emptyCounts, 10, hubIdentity);

      expect(html).not.toContain('Καθαρισμός');
      expect(html).not.toContain('data-filter="date"');
    });

    test('+type filter: Καθαρισμός present, href=hub canonical, date pill still suppressed', () => {
      const filters: Filters = { time: 'today', type: 'concert' };
      const html = renderFilterBar(filters, emptyCounts, 5, hubIdentity);

      expect(html).toContain('Καθαρισμός');
      expect(html).toContain('href="/today"');
      expect(html).not.toContain('data-filter="date"');
      expect(html).toContain('data-filter="type"');
    });
  });

  describe('price_type hub (/open, excludeDimension=price)', () => {
    const hubIdentity: HubIdentity = { canonicalUrl: 'open', excludeDimension: 'price' };

    test('bare hub: no Καθαρισμός; price pill suppressed', () => {
      const filters: Filters = { price: 'open' };
      const html = renderFilterBar(filters, emptyCounts, 8, hubIdentity);

      expect(html).not.toContain('Καθαρισμός');
      expect(html).not.toContain('data-filter="price"');
    });

    test('+time filter: Καθαρισμός present, href=hub canonical, price pill still suppressed', () => {
      const filters: Filters = { price: 'open', time: 'today' };
      const html = renderFilterBar(filters, emptyCounts, 3, hubIdentity);

      expect(html).toContain('Καθαρισμός');
      expect(html).toContain('href="/open"');
      expect(html).not.toContain('data-filter="price"');
      expect(html).toContain('data-filter="date"');
    });
  });

  describe('tag hub (/kids, excludeDimension=null)', () => {
    const hubIdentity: HubIdentity = { canonicalUrl: 'kids', excludeDimension: null };

    test('bare hub (no Filters dim active): no Καθαρισμός; all pills render', () => {
      const filters: Filters = {};
      const html = renderFilterBar(filters, emptyCounts, 12, hubIdentity);

      expect(html).not.toContain('Καθαρισμός');
      expect(html).toContain('data-filter="date"');
      expect(html).toContain('data-filter="type"');
      expect(html).toContain('data-filter="price"');
      expect(html).toContain('data-filter="sort"');
    });

    test('+type filter: Καθαρισμός present, href=hub canonical, all pills render including active type', () => {
      const filters: Filters = { type: 'concert' };
      const html = renderFilterBar(filters, emptyCounts, 10, hubIdentity);

      expect(html).toContain('Καθαρισμός');
      expect(html).toContain('href="/kids"');
      expect(html).toContain('data-filter="type"');
      expect(html).toContain('filter-pill is-active');
    });
  });

  describe('REGRESSION — category page (hubIdentity=undefined)', () => {
    test('bare: no Καθαρισμός; all pills render per current behavior', () => {
      const filters: Filters = {};
      const html = renderFilterBar(filters, emptyCounts, 20);

      expect(html).not.toContain('Καθαρισμός');
      expect(html).toContain('data-filter="date"');
      expect(html).toContain('data-filter="type"');
      expect(html).toContain('data-filter="price"');
    });

    test('with a user filter: Καθαρισμός href stays "/" (current behavior preserved)', () => {
      const filters: Filters = { type: 'concert' };
      const html = renderFilterBar(filters, emptyCounts, 10);

      expect(html).toContain('Καθαρισμός');
      expect(html).toContain('href="/"');
      expect(html).not.toContain('href="/concerts"');
    });
  });
});
