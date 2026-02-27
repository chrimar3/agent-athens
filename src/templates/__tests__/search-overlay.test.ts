import { describe, expect, test } from 'bun:test';
import { renderSearchOverlay, renderSearchScript } from '../search-overlay';

describe('renderSearchOverlay', () => {
  test('returns HTML with overlay structure', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-overlay"');
    expect(html).toContain('class="search-overlay-backdrop"');
    expect(html).toContain('class="search-overlay-panel"');
  });

  test('includes search input with type="search"', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-input"');
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="Αναζήτηση εκδηλώσεων…"');
  });

  test('includes all three result groups', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('data-group="events"');
    expect(html).toContain('data-group="venues"');
    expect(html).toContain('data-group="categories"');
  });

  test('includes Greek group titles', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('Εκδηλώσεις');
    expect(html).toContain('Χώροι');
    expect(html).toContain('Κατηγορίες');
  });

  test('includes empty state message', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('Δεν βρέθηκαν αποτελέσματα');
  });

  test('overlay starts hidden', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('aria-hidden="true"');
  });

  test('includes close button', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-close-btn"');
    expect(html).toContain('aria-label="Κλείσιμο"');
  });

  test('includes clear button', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-clear-btn"');
    expect(html).toContain('aria-label="Καθαρισμός"');
  });

  test('includes skeleton loading container', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-skeleton"');
    expect(html).toContain('class="skeleton-row"');
    expect(html).toContain('class="skeleton-thumb"');
  });

  test('includes popular events section', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-popular"');
    expect(html).toContain('Δημοφιλή');
  });

  test('includes recent searches section', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-recent"');
    expect(html).toContain('Πρόσφατες αναζητήσεις');
  });

  test('includes ARIA live region', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });

  test('has aria-modal on overlay', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('aria-modal="true"');
  });

  test('has role="dialog" on overlay div', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('role="dialog"');
  });
});

describe('renderSearchScript', () => {
  test('returns a script tag', () => {
    const script = renderSearchScript();
    expect(script).toContain('<script>');
    expect(script).toContain('</script>');
  });

  test('contains Fuse.js initialization', () => {
    const script = renderSearchScript();
    expect(script).toContain('new Fuse');
    expect(script).toContain('search-index.json');
    expect(script).toContain('fuse.mjs');
  });

  test('contains normalization function', () => {
    const script = renderSearchScript();
    expect(script).toContain('function norm(');
    expect(script).toContain('normalize');
    expect(script).toContain('NFD');
  });

  test('contains debounce logic', () => {
    const script = renderSearchScript();
    expect(script).toContain('debounceTimer');
    expect(script).toContain('setTimeout');
  });

  test('handles escape key and backdrop close', () => {
    const script = renderSearchScript();
    expect(script).toContain('Escape');
    expect(script).toContain('backdrop');
  });

  test('contains Cmd+K / Ctrl+K handler', () => {
    const script = renderSearchScript();
    expect(script).toContain('metaKey');
    expect(script).toContain('ctrlKey');
    expect(script).toContain("e.key === 'k'");
  });

  test('contains keyboard navigation (ArrowDown/ArrowUp)', () => {
    const script = renderSearchScript();
    expect(script).toContain('ArrowDown');
    expect(script).toContain('ArrowUp');
    expect(script).toContain('setActive');
  });

  test('contains focus trap logic', () => {
    const script = renderSearchScript();
    expect(script).toContain('Tab');
    expect(script).toContain('shiftKey');
    expect(script).toContain('first');
    expect(script).toContain('last');
  });

  test('contains close button handler', () => {
    const script = renderSearchScript();
    expect(script).toContain('search-close-btn');
    expect(script).toContain('closeBtn');
  });

  test('contains clear button handler', () => {
    const script = renderSearchScript();
    expect(script).toContain('search-clear-btn');
    expect(script).toContain('clearBtn');
  });

  test('contains recent searches with sessionStorage', () => {
    const script = renderSearchScript();
    expect(script).toContain('aa_recent_searches');
    expect(script).toContain('sessionStorage');
    expect(script).toContain('saveRecent');
  });

  test('contains popular events handling', () => {
    const script = renderSearchScript();
    expect(script).toContain('popularEl');
    expect(script).toContain('renderPopularItems');
  });

  test('contains skeleton loading handlers', () => {
    const script = renderSearchScript();
    expect(script).toContain('showSkeleton');
    expect(script).toContain('hideSkeleton');
    expect(script).toContain('skeletonEl');
  });

  test('contains ARIA live announcements', () => {
    const script = renderSearchScript();
    expect(script).toContain('announce');
    expect(script).toContain('liveRegion');
  });

  test('contains focus management (returnFocus)', () => {
    const script = renderSearchScript();
    expect(script).toContain('returnFocus');
    expect(script).toContain('document.activeElement');
  });

  test('contains mobile menu search handler', () => {
    const script = renderSearchScript();
    expect(script).toContain('mobile-menu-search');
    expect(script).toContain('mobileSearchBtn');
  });

  test('contains see-all link logic', () => {
    const script = renderSearchScript();
    expect(script).toContain('search-see-all');
    expect(script).toContain('addSeeAllLink');
  });
});
