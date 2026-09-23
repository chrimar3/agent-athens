import { describe, test, expect } from 'bun:test';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import { renderEventCard } from '../page';
import { renderEventCardList, renderHeroSection } from '../card-variants';
import { renderComparisonRow } from '../../generators/hub-page';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

const noisy: Event = {
  ...sampleConcert,
  id: 'sulee',
  title: '$ULEE LIVE ΑΘΗΝΑ // 25.09.2026 // ΑΡΧΙΤΕΚΤΟΝΙΚΗ',
  startDate: `${DateTime.now().setZone('Europe/Athens').toISODate()}T21:00:00`,
  venue: { ...sampleConcert.venue, name: 'Αρχιτεκτονική' },
};
const CLEAN = '$ULEE LIVE ΑΘΗΝΑ';

describe('visible titles use displayTitle', () => {
  test('grid card', () => {
    expect(load(renderEventCard(noisy))('.card-title').text().trim()).toBe(CLEAN);
  });

  test('list card', () => {
    expect(load(renderEventCardList(noisy))('.card-title').text().trim()).toBe(CLEAN);
  });

  test('hero featured card', () => {
    expect(load(renderHeroSection([noisy], 'today'))('.hero-card-title').text().trim()).toBe(CLEAN);
  });

  test('hub comparison row', () => {
    expect(load(`<table>${renderComparisonRow(noisy, 'el', false)}</table>`)('td a').first().text().trim()).toBe(CLEAN);
  });
});

describe('hub comparison row escapes stored text', () => {
  test('a hostile title or venue renders as text, never markup', () => {
    const hostile: Event = { ...noisy, title: 'Gig <img src=x onerror=alert(1)>', venue: { ...noisy.venue, name: '<b>Venue</b>' } };
    const $ = load(`<table>${renderComparisonRow(hostile, 'el', false)}</table>`);
    expect($('img').length).toBe(0);
    expect($('b').length).toBe(0);
    expect($('td').eq(1).text()).toBe('<b>Venue</b>');
  });
});
