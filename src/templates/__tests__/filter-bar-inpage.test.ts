import { describe, test, expect } from 'bun:test';
import { renderFilterBar, renderFilterBarScript } from '../filter-bar';
import type { Filters, FilterCounts } from '../../types';

// S157: /en/ type+price chips filter in-page; date navigates to /en/{time}/. EL unchanged.

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
    { value: 'today', label: 'Σήμερα', count: 5, url: '/today' },
    { value: 'this-weekend', label: 'Σαββατοκύριακο', count: 6, url: '/this-weekend' },
    { value: 'this-week', label: 'Αυτή την εβδομάδα', count: 12, url: '/this-week' },
  ],
};

describe('renderFilterBar — /en/ in-page filter markup', () => {
  const html = renderFilterBar({}, counts, 20, undefined, 'en');

  test('type + price options carry data-filter-dim/value (intercepted in-page)', () => {
    expect(html).toContain('data-filter-dim="type" data-filter-value="concert"');
    expect(html).toContain('data-filter-dim="price" data-filter-value="open"');
  });

  test('date options NAVIGATE to /en/{time}/ hubs (not bare-root Greek combos)', () => {
    expect(html).toContain('href="/en/this-week/"');
    expect(html).toContain('href="/en/this-weekend/"');
    expect(html).not.toContain('href="/this-week"'); // bare-root Greek combo gone on EN
  });

  test('.filter-bar carries data-locale; count carries data-events-word', () => {
    expect(html).toContain('class="filter-bar" data-locale="en"');
    expect(html).toContain('data-events-word="events"');
  });
});

describe('renderFilterBar — /en/ date option inventory guard', () => {
  test('today/tomorrow omitted on EN when count < 3 (avoids /en/ hub 404)', () => {
    const lowCounts: FilterCounts = {
      ...counts,
      timeRanges: [
        { value: 'today', label: 'Σήμερα', count: 2, url: '/today' },       // <3 → omit on EN
        { value: 'this-week', label: 'Αυτή την εβδομάδα', count: 12, url: '/this-week' },
      ],
    };
    const html = renderFilterBar({}, lowCounts, 20, undefined, 'en');
    expect(html).not.toContain('href="/en/today/"');
    expect(html).toContain('href="/en/this-week/"');
  });
});

describe('renderFilterBar — EL unchanged (navigation, no in-page attrs)', () => {
  const html = renderFilterBar({}, counts, 20);

  test('no data-filter-dim; date options keep bare-root combo urls', () => {
    expect(html).not.toContain('data-filter-dim');
    expect(html).toContain('href="/this-week"'); // combo url from counts, unchanged
    expect(html).not.toContain('href="/en/');
  });

  test('.filter-bar data-locale=el', () => {
    expect(html).toContain('class="filter-bar" data-locale="el"');
  });
});

describe('renderFilterBarScript — in-page filter block', () => {
  const script = renderFilterBarScript();

  test('guards on English locale', () => {
    expect(script).toContain("document.documentElement.lang === 'en'");
  });

  test('filters by data-type + data-price-type, composes', () => {
    expect(script).toContain("getAttribute('data-type')");
    expect(script).toContain("getAttribute('data-price-type')");
    expect(script).toContain('[data-filter-dim]');
  });

  test('updates empty-state + count', () => {
    expect(script).toContain('filter-empty-state');
    expect(script).toContain('filter-result-count');
  });

  test('EL sort-by-price logic still present (untouched)', () => {
    expect(script).toContain("data-sort");
  });
});
