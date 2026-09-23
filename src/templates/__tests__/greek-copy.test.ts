/**
 * Round-1 Greek copy fixes, each tied to judge evidence
 * (docs/quality-loop/round-0/judge-*.json):
 *  - generated related links read "Όλες οι κινηματογράφος",
 *    "Ελεύθερη είσοδος κινηματογράφος", "Ελεύθερη είσοδος εκδηλώσεις" (/cinema-today);
 *  - "Ελεύθερη Είσοδος" title-cased in running UI text;
 *  - the homepage hub grid said "1 εκδηλώσεις →" (dist/index.html).
 */
import { describe, expect, test } from 'bun:test';
import type { PageMetadata } from '../../types';
import { renderPage } from '../page';
import { renderHomepageCapsule, renderHubNavGrid } from '../homepage';
import { localeFixtures } from './helpers/locale-fixtures';

function relatedBlock(filters: PageMetadata['filters'], locale: 'el' | 'en' = 'el'): string {
  const md: PageMetadata = { title: 'T', description: 'd', keywords: 'k', url: 'x', eventCount: 1, lastUpdate: '2026-09-22T08:00:00Z', filters };
  const html = renderPage(md, localeFixtures().slice(0, 1), undefined, undefined, locale);
  const m = /<aside class="related-pages">[\s\S]*?<\/aside>/.exec(html);
  expect(m).not.toBeNull(); // precondition: the block is rendered at all
  return m![0];
}

describe('related links are grammatical Greek', () => {
  test('cinema type page (the judged /cinema-today case)', () => {
    const html = relatedBlock({ type: 'cinema', time: 'today' });
    expect(html).not.toContain('Όλες οι κινηματογράφος');
    expect(html).not.toContain('Ελεύθερη είσοδος κινηματογράφος');
    expect(html).toContain('<a href="/cinema">Όλες οι Ταινίες</a>');
    expect(html).toContain('<a href="/open-cinema">Σινεμά με ελεύθερη είσοδο</a>');
  });

  test('concert type page no longer emits the raw type slug as Greek text', () => {
    const html = relatedBlock({ type: 'concert' });
    expect(html).not.toContain('Όλες οι concert');
    expect(html).toContain('<a href="/concert">Όλες οι Συναυλίες</a>');
    expect(html).toContain('<a href="/open-concert">Συναυλίες με ελεύθερη είσοδο</a>');
  });

  test('open-entry link reads as a noun phrase', () => {
    const html = relatedBlock({});
    expect(html).not.toContain('Ελεύθερη είσοδος εκδηλώσεις');
    expect(html).toContain('<a href="/open">Εκδηλώσεις με ελεύθερη είσοδο</a>');
  });

  test('English related links point at English hubs with English labels', () => {
    const html = relatedBlock({ type: 'concert' }, 'en');
    expect(html).toContain('<a href="/en/this-week/">Events this week</a>');
    expect(html).toContain('<a href="/en/open/">Free entry events</a>');
    expect(html).not.toMatch(/href="\/(concert|open-concert|open|this-week|)"/);
  });
});

describe('sentence case for free entry in running UI text', () => {
  test('homepage stat line', () => {
    const html = renderHomepageCapsule({ total: 10, today: 1, weekend: 2, concerts: 3, theater: 4, open: 5, typeCount: 6 });
    expect(html).toContain('Ελεύθερη είσοδος (5)');
    expect(html).not.toContain('Ελεύθερη Είσοδος');
  });
});

describe('hub card counts agree in number', () => {
  test('1 → singular, otherwise plural', () => {
    const html = renderHubNavGrid([
      { slug: 'a', titleEl: 'Α', titleEn: 'A', path: '/a/', eventCount: 1, type: 'concert' },
      { slug: 'b', titleEl: 'Β', titleEn: 'B', path: '/b/', eventCount: 2, type: 'concert' },
    ]);
    expect(html).toContain('>1 εκδήλωση →<');
    expect(html).toContain('>2 εκδηλώσεις →<');
    expect(html).not.toContain('1 εκδηλώσεις');
  });
});
