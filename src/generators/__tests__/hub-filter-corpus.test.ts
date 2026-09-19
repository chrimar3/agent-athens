import { describe, expect, test } from 'bun:test';
import { load } from 'cheerio';
import { renderHubPage, renderOverflowPage } from '../hub-page';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { HubConfig } from '../../types';

const config: HubConfig = {
  slug: 'this-week', titleEl: 'Δοκιμή', titleEn: 'Test events',
  filter: { type: 'date', value: 'all-events' },
  answerCapsuleEl: 'Δοκιμή.', answerCapsuleEn: 'Synthetic fixture.', faqs: [],
};
const events = Array.from({ length: 35 }, (_, i) => ({
  ...sampleConcert, id: `corpus-${i}`, title: `Corpus ${i}`, startDate: '2030-01-20T20:00:00+02:00',
  fullDescriptionEn: i === 0 || i === 34 ? undefined : 'Synthetic English fixture.',
}));

describe('English hub filter corpus', () => {
  test('keeps initial 30 and points at the existing locale overflow with the complete count', () => {
    const $ = load(renderHubPage(config, events, events, undefined, 'en')!);
    expect($('.card-grid .event-card').length).toBe(30);
    expect($('.hub-see-all').attr('href')).toBe('/en/this-week/all/');
    expect($('.hub-see-all').attr('data-events-total')).toBe('35');
    expect($('.filter-reset').attr('href')).toBe('/en/this-week/');
  });
  for (const [label, render] of [['hub', renderHubPage], ['overflow', (c: HubConfig, e: typeof events, all: typeof events, _: undefined, locale: 'en' | 'el') => renderOverflowPage(c, e, all, locale)]] as const) {
    test(`${label} links to English only when that event has an English page`, () => {
      const $ = load(render(config, events, events, undefined, 'en')!);
      const links = $('.card-grid .card-link').map((_, el) => $(el).attr('href')).get();
      expect(links[0]).toMatch(/^\/events\/.+\/$/);
      expect(links[1]).toMatch(/^\/en\/events\/.+\/$/);
      if (label === 'overflow') expect(links[34]).toMatch(/^\/events\/.+\/$/);
      const greek = load(render(config, events, events, undefined, 'el')!);
      expect(greek('.card-grid .card-link').toArray().every(el => greek(el).attr('href')?.startsWith('/events/'))).toBe(true);
    });
  }
});
