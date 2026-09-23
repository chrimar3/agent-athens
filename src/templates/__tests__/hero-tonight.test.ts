import { describe, test, expect } from 'bun:test';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import { renderHeroSection, chooseHeroMode } from '../card-variants';
import { sampleConcert, sampleFreeExhibition } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

const day = (offset: number) => DateTime.now().setZone('Europe/Athens').plus({ days: offset }).toISODate()!;

// Live 2026-09-22: a Kruger exhibition running since April (image + long
// description) led "Απόψε στην Αθήνα" over events actually starting tonight.
const runningExhibition: Event = {
  ...sampleFreeExhibition, id: 'kruger', title: 'Running Exhibition',
  startDate: day(-140), endDate: day(40),
  imageUrl: 'https://example.com/kruger.jpg', fullDescription: 'A long enriched description.',
};
const tonightConcert: Event = {
  ...sampleConcert, id: 'tonight', title: 'Tonight Concert',
  startDate: `${day(0)}T21:00:00`, imageUrl: undefined, fullDescription: undefined,
};

const featuredTitle = (html: string) => load(html)('.hero-card--featured .hero-card-title').text();

describe('Tonight hero', () => {
  test('fixture precondition: the running exhibition out-scores on media alone', () => {
    expect(runningExhibition.imageUrl && !tonightConcert.imageUrl).toBeTruthy();
  });

  test('an event starting today leads over one that has been running for months', () => {
    expect(featuredTitle(renderHeroSection([runningExhibition, tonightConcert], 'today'))).toBe('Tonight Concert');
  });

  test('running events can still fill remaining pick slots', () => {
    const html = renderHeroSection([runningExhibition, tonightConcert], 'today');
    expect(load(html)('.hero-card--pick .hero-pick-title').text()).toContain('Running Exhibition');
  });
});

describe('chooseHeroMode', () => {
  const tonight = (id: string): Event => ({ ...tonightConcert, id });

  test('"today" only when enough events START today — running ones do not count', () => {
    const onlyRunning = [runningExhibition, { ...runningExhibition, id: 'r2' }, { ...runningExhibition, id: 'r3' }];
    expect(chooseHeroMode(onlyRunning, 2 /* Tue */)).toBe('coming-days');
  });

  test('three events starting today → "today"', () => {
    expect(chooseHeroMode([tonight('a'), tonight('b'), tonight('c')], 2)).toBe('today');
  });

  test('Friday–Sunday with a thin tonight → "weekend"', () => {
    expect(chooseHeroMode([tonight('a')], 5)).toBe('weekend');
  });

  test('weekday with one or two starting today → still "today"', () => {
    expect(chooseHeroMode([tonight('a'), runningExhibition], 3)).toBe('today');
  });
});
