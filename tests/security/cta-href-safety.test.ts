/**
 * CTA hrefs (ticket_url, event url, venue website) come from scraped or
 * AI-supplied data. They must render only as canonical http(s) URLs inside a
 * properly escaped attribute, like every other data-driven link.
 */
import { describe, expect, test } from 'bun:test';
import { load } from 'cheerio';
import { sampleConcert } from '../fixtures/events';
import { renderEventDetailPage } from '../../src/generators/event-page';
import { generatePracticalBlock } from '../../src/generators/practical-block';
import type { Event } from '../../src/types';

const future = (over: Partial<Event>): Event => ({
  ...sampleConcert, startDate: '2099-01-01T21:00:00+02:00', endDate: undefined, ...over,
} as Event);

const QUOTE_BREAKOUT = 'https://www.viva.gr/tickets/x"autofocus/onfocus=alert(1)//';

const ctaAnchors = (html: string) => {
  const $ = load(html);
  return $('a.edp-cta, .event-practical a').toArray().map(el => $(el));
};

describe('event-page CTA href safety', () => {
  test('a quote in ticket_url cannot add attributes to the CTA anchor', () => {
    const html = renderEventDetailPage(future({ ticketUrl: QUOTE_BREAKOUT, ticketUrlStatus: 'ai_discovered' }), [], 'en');
    const $ = load(html);
    expect($('[autofocus], [onfocus]').length).toBe(0);
    for (const a of ctaAnchors(html)) expect(Object.keys(a.attr() ?? {}).some(k => k.startsWith('on'))).toBe(false);
  });

  for (const hostile of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)']) {
    test(`a ${JSON.stringify(hostile.slice(0, 12))} ticket_url never becomes a CTA href`, () => {
      const html = renderEventDetailPage(future({ ticketUrl: hostile, ticketUrlStatus: 'direct' }), [], 'en');
      for (const a of ctaAnchors(html)) expect(String(a.attr('href'))).toMatch(/^https?:\/\//);
      expect(html).not.toMatch(/href="\s*(javascript|data|vbscript):/i);
    });
  }

  test('hostile event.url and venue.website fall back to no CTA, never an unsafe one', () => {
    const html = renderEventDetailPage(future({
      ticketUrl: undefined, ticketUrlStatus: undefined, url: 'javascript:alert(1)',
      venue: { ...sampleConcert.venue, website: 'javascript:alert(2)' },
    }), [], 'en');
    expect(ctaAnchors(html)).toHaveLength(0);
    expect(html).not.toContain('javascript:');
  });

  test('a legitimate ticket URL still renders, in canonical form', () => {
    const html = renderEventDetailPage(future({ ticketUrl: 'https://www.viva.gr/tickets/music/x/?a=1&b=2', ticketUrlStatus: 'direct' }), [], 'en');
    const hrefs = ctaAnchors(html).map(a => a.attr('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toBe('https://www.viva.gr/tickets/music/x/?a=1&b=2');
  });
});

describe('practical-block CTA href safety', () => {
  test('quote breakout in ticket_url is neutralised', () => {
    const $ = load(generatePracticalBlock(future({ ticketUrl: QUOTE_BREAKOUT, ticketUrlStatus: 'direct' }), null, 'en'));
    expect($('[autofocus], [onfocus]').length).toBe(0);
  });

  test('javascript: venue website is not linked', () => {
    const html = generatePracticalBlock(future({ ticketUrl: undefined, url: undefined, venue: { ...sampleConcert.venue, website: 'javascript:alert(1)' } }), null, 'en');
    expect(html).not.toContain('javascript:');
  });
});
