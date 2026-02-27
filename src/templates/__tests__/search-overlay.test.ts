import { describe, expect, test } from 'bun:test';
import { renderSearchOverlay, renderSearchScript } from '../search-overlay';

describe('renderSearchOverlay', () => {
  test('returns HTML with overlay structure', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-overlay"');
    expect(html).toContain('class="search-overlay-backdrop"');
    expect(html).toContain('class="search-overlay-panel"');
  });

  test('includes search input with correct attributes', () => {
    const html = renderSearchOverlay();
    expect(html).toContain('class="search-input"');
    expect(html).toContain('type="text"');
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
});
