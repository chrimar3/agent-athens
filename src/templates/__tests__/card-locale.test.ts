/**
 * Round-1 move 5 — English pages speak English.
 *
 * Every card renderer takes a locale. Rendering the same events with 'en'
 * must yield no Greek interface text: badges, dates, price labels, the open
 * badge, running/ongoing labels, save-button labels. Titles and venue names
 * are data and may legitimately be Greek, so the fixtures are ASCII-only and
 * the scanner excludes title/venue nodes anyway.
 */
import { describe, expect, test } from 'bun:test';
import type { Event } from '../../types';
import { renderEventCard, prepareCardData } from '../page';
import { renderEventCardList, renderFeatureCard, renderFeaturedEventCard, renderHeroSection } from '../card-variants';
import { collectLangNodes, GREEK_CHARS, type LangNode } from './helpers/lang-scan';
import { localeFixtures } from './helpers/locale-fixtures';

const events = localeFixtures();

type Renderer = (e: Event, locale: 'el' | 'en') => string;
const RENDERERS: Record<string, Renderer> = {
  renderEventCard: (e, l) => renderEventCard(e, l),
  renderEventCardList: (e, l) => renderEventCardList(e, l),
  renderFeatureCard: (e, l) => renderFeatureCard(e, l),
  renderFeaturedEventCard: (e, l) => renderFeaturedEventCard(e, 'An ASCII vignette.', 'yellow', l),
};

function greekUiNodes(html: string, locale: 'el' | 'en'): LangNode[] {
  return collectLangNodes(html, locale).filter(n => !n.data && GREEK_CHARS.test(n.value));
}

describe('fixture preconditions (the rule is actually exercised)', () => {
  test('fixture titles, venues and descriptions contain no Greek', () => {
    for (const e of events) {
      expect(GREEK_CHARS.test(e.title)).toBe(false);
      expect(GREEK_CHARS.test(e.venue.name)).toBe(false);
      expect(GREEK_CHARS.test(e.description)).toBe(false);
    }
  });

  test('the Greek render of every fixture DOES carry Greek UI text', () => {
    for (const [name, render] of Object.entries(RENDERERS)) {
      for (const e of events) {
        expect({ name, id: e.id, greek: greekUiNodes(render(e, 'el'), 'el').length > 0 }).toEqual({ name, id: e.id, greek: true });
      }
    }
  });

  test('fixtures cover the open-exhibition, running, implied-run and ongoing branches', () => {
    const el = events.map(e => prepareCardData(e, 'el').dateStr).join('\n');
    expect(el).toContain('Ανοιχτή');
    expect(el).toContain('Σε εξέλιξη');
    expect(el).toContain('Από ');
    expect(el).toContain('Συνεχίζεται');
    expect(el).toContain(' στις ');
  });
});

describe('English card renders contain no Greek interface text', () => {
  for (const [name, render] of Object.entries(RENDERERS)) {
    test(name, () => {
      const offenders = events.flatMap(e => greekUiNodes(render(e, 'en'), 'en').map(n => `${e.id}: ${n.kind}${n.attr ? `[${n.attr}]` : ''} "${n.value}"`));
      expect(offenders).toEqual([]);
    });
  }

  test('renderHeroSection', () => {
    for (const mode of ['today', 'weekend', 'coming-days'] as const) {
      const offenders = greekUiNodes(renderHeroSection(events, mode, 'en'), 'en').map(n => `${mode}: "${n.value}"`);
      expect(offenders).toEqual([]);
    }
  });
});

describe('English card content is correct, not merely non-Greek', () => {
  const byId = (id: string) => events.find(e => e.id === id)!;

  test('badge, date, time and price labels', () => {
    const concert = renderEventCard(byId('dated-concert'), 'en');
    expect(concert).toContain('>CONCERT<');
    expect(concert).toMatch(/ at 21:00</);
    expect(concert).toContain('>Ticketed<');
    expect(renderEventCard(byId('open-workshop'), 'en')).toContain('>Free entry<');
    expect(renderEventCard(byId('priced-theater'), 'en')).toContain('>THEATRE<');
  });

  test('open exhibition carries the English open badge and label (image and tile branches)', () => {
    expect(byId('open-exhibition').imageUrl).toBeUndefined();
    expect(byId('open-exhibition-imaged').imageUrl).toBeTruthy();
    for (const id of ['open-exhibition', 'open-exhibition-imaged']) {
      expect(renderEventCard(byId(id), 'en')).toContain('<span class="card-badge-open">OPEN</span>');
      expect(renderEventCard(byId(id), 'el')).toContain('<span class="card-badge-open">ΑΝΟΙΧΤΗ</span>');
    }
    expect(prepareCardData(byId('open-exhibition'), 'en').dateStr).toContain(' · Open');
  });

  test('running, implied-run and ongoing date labels', () => {
    expect(prepareCardData(byId('running-festival'), 'en').dateStr).toContain('Now running');
    expect(prepareCardData(byId('implied-run-performance'), 'en').dateStr).toMatch(/^From /);
    expect(prepareCardData(byId('ongoing-exhibition'), 'en').dateStr).toContain('Ongoing');
  });

  test('neighbourhood stays in its English form on English cards', () => {
    expect(prepareCardData(byId('dated-concert'), 'en').venueText).toBe('Fixture Hall · Koukaki');
    expect(prepareCardData(byId('dated-concert'), 'el').venueText).toBe('Fixture Hall · Κουκάκι');
  });

  test('card save button is labelled in the page language', () => {
    const en = renderEventCard(byId('dated-concert'), 'en');
    const el = renderEventCard(byId('dated-concert'), 'el');
    expect(en).toMatch(/class="card-save-btn"[^>]*aria-label="Save event"/);
    expect(el).toMatch(/class="card-save-btn"[^>]*aria-label="Αποθήκευση εκδήλωσης"/);
  });
});
