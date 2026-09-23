import { describe, test, expect } from 'bun:test';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import { renderPage } from '../page';
import { renderHubPage, injectPullQuotes } from '../../generators/hub-page';
import { buildPageMetadata } from '../../utils/urls';
import { sampleConcert, sampleFreeExhibition } from '../../../tests/fixtures/events';
import type { Event, HubConfig } from '../../types';

const day = (offset: number) => DateTime.now().setZone('Europe/Athens').plus({ days: offset }).toISODate()!;
const at = (id: string, offset: number): Event => ({ ...sampleConcert, id, title: `Event ${id}`, startDate: `${day(offset)}T21:00:00`, endDate: undefined });
const running: Event = { ...sampleFreeExhibition, id: 'run', startDate: day(-30), endDate: day(30) };

describe('date-group headers carry their date', () => {
  const $ = load(renderPage(buildPageMetadata({}, 3), [at('a', 0), at('b', 1), running], undefined, undefined, 'el'));

  test('dated headers expose data-date and a jump anchor', () => {
    const h = $('.date-group-header[data-date]').first();
    expect(h.attr('data-date')).toBe(day(0));
    expect(h.attr('id')).toBe(`d-${day(0)}`);
  });

  test('the "now running" lane has no date', () => {
    expect($('.date-group-header').last().attr('data-date')).toBeUndefined();
  });
});

describe('pull quotes still split on real headers', () => {
  test('headers with attributes are recognised as group boundaries', () => {
    const html = `<html><section class="card-grid" itemscope>
<h2 class="date-group-header" id="d-${day(0)}" data-date="${day(0)}">Mon</h2>
<div class="date-group" data-count="6">cards</div>
<h2 class="date-group-header" id="d-${day(1)}" data-date="${day(1)}">Tue</h2>
<div class="date-group" data-count="6">cards</div>
</section></html>`;
    expect(injectPullQuotes(html, ['Q'])).toContain('class="pull-quote"');
  });
});

describe('weekend hub day jumps', () => {
  const weekend: HubConfig = {
    slug: 'this-weekend', titleEl: 'Σαββατοκύριακο', titleEn: 'Weekend',
    filter: { type: 'date', value: 'all-events' }, answerCapsuleEl: 'x', answerCapsuleEn: 'x', faqs: [],
  };
  const events = [at('fri', 1), at('sat', 2), at('sat2', 2), at('sun', 3)];

  test('links to each day group present, in order', () => {
    const $ = load(renderHubPage(weekend, events, events, undefined, 'el')!);
    const hrefs = $('nav.day-jumps a').map((_, a) => $(a).attr('href')).get();
    expect(hrefs).toEqual([`#d-${day(1)}`, `#d-${day(2)}`, `#d-${day(3)}`]);
    for (const h of hrefs) expect($(h).length).toBe(1); // every target exists
  });

  test('other hubs do not get day jumps', () => {
    const $ = load(renderHubPage({ ...weekend, slug: 'concerts' }, events, events, undefined, 'el')!);
    expect($('nav.day-jumps').length).toBe(0);
  });
});
