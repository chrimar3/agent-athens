import { describe, expect, test } from 'bun:test';
import { load } from 'cheerio';
import { DateTime } from 'luxon';
import { buildEventSchemaObject, generateEventSchema, renderEventDetailPage } from '../event-page';
import { buildDataFeed } from '../datafeed';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

const date = (days: number) => DateTime.now().setZone('Europe/Athens').plus({ days }).toISODate()!;
const fixture = (overrides: Partial<Event> = {}): Event => ({
  ...sampleConcert,
  id: 'trust123-test', title: 'Trust concert',
  venue: { ...sampleConcert.venue, name: 'Test Venue' },
  startDate: date(7), endDate: undefined,
  fullDescriptionEn: 'An English description of the announced concert.',
  fullDescriptionGr: undefined, fullDescription: 'An English description of the announced concert.',
  ...overrides,
});
const rootUrl = 'https://agentathens.com/events/trust123-test-venue-trust-concert/';
const enUrl = 'https://agentathens.com/en/events/trust123-test-venue-trust-concert/';
const graph = (event: Event, locale: 'el' | 'en' = 'en', cooling = false): any[] =>
  JSON.parse(generateEventSchema(event, locale, undefined, { omitEventNode: cooling }))['@graph'];

describe('Event discovery and provenance', () => {
  test('English breadcrumb and discovery links use generated hubs, with root fallback', () => {
    const $ = load(renderEventDetailPage(fixture(), [], 'en', undefined, new Set(['today', 'concerts'])));
    expect($('.edp-breadcrumb a').map((_, a) => $(a).attr('href')).get()).toEqual(['/en/today/', '/en/concerts/']);
    expect($('.edp-connections a').map((_, a) => $(a).attr('href')).get()).toContain('/en/concerts/');
    expect($('.edp-cornerstone-links a').map((_, a) => $(a).attr('href')).get()).toContain('/this-weekend/');
    expect($('.edp-cornerstone-links a').map((_, a) => $(a).attr('href')).get()).not.toContain('/en/this-weekend/');
    const fallback = load(renderEventDetailPage(fixture(), [], 'en', undefined, new Set()));
    expect(fallback('.edp-breadcrumb a').map((_, a) => fallback(a).attr('href')).get()).toEqual(['/', '/concerts/']);
    const greek = load(renderEventDetailPage(fixture(), [], 'el', undefined, new Set(['today', 'concerts'])));
    expect(greek('.edp-breadcrumb a').map((_, a) => greek(a).attr('href')).get()).toEqual(['/', '/concerts/']);
  });

  test('Event identity matches the actual locale page in flat feed and HTML graph', () => {
    for (const [locale, url] of [['el', rootUrl], ['en', enUrl]] as const) {
      expect(buildEventSchemaObject(fixture(), locale)['@id']).toBe(url + '#event');
      expect(graph(fixture(), locale)[0]['@id']).toBe(url + '#event');
    }
  });

  test('WebPage connects its event, publisher and real source listing', () => {
    const nodes = graph(fixture({ url: 'https://example.com/original?ref=venue' }));
    const page = nodes.find(n => n['@type'] === 'WebPage');
    expect(page).toMatchObject({
      '@id': enUrl + '#webpage', url: enUrl, inLanguage: 'en',
      mainEntity: { '@id': enUrl + '#event' },
      publisher: { '@id': 'https://agentathens.com/#organization' },
      isBasedOn: 'https://example.com/original?ref=venue',
    });
    expect(nodes.at(-1)['@id']).toBe('https://agentathens.com/#organization');
  });

  test('unsafe or absent source URLs never become provenance or clickable source links', () => {
    for (const url of [undefined, 'javascript:alert(1)', 'data:text/html,unsafe', 'https://user:password@example.com/event', 'https://example.com/\nunsafe']) {
      const event = fixture({ url });
      expect(graph(event).find(n => n['@type'] === 'WebPage')?.isBasedOn).toBeUndefined();
      expect(load(renderEventDetailPage(event, [], 'en'))('.edp-source a').length).toBe(0);
    }
  });

  test('cooling pages preserve source attribution without referencing a suppressed Event', () => {
    const nodes = graph(fixture({ startDate: date(-20) }), 'en', true);
    const page = nodes.find(n => n['@type'] === 'WebPage');
    expect(page).toBeDefined();
    expect(page.mainEntity).toBeUndefined();
    expect(nodes.some(n => String(n['@id']).endsWith('#event'))).toBe(false);
  });

  test('English event pages advertise the English feed and omit build-day freshness', () => {
    const $ = load(renderEventDetailPage(fixture(), [], 'en'));
    expect($('link[rel="alternate"][type="application/ld+json"]').attr('href')).toBe('/api/en/events.json');
    expect($('meta[name="date"]').length).toBe(0);
  });
});

describe('Truthful DataFeed discovery', () => {
  test('noindex lifecycle rows are excluded while just-passed events and running exhibitions remain', () => {
    const feed = buildDataFeed([
      fixture({ title: 'Upcoming' }),
      fixture({ title: 'Just passed', startDate: date(-10) }),
      fixture({ title: 'Cooling', startDate: date(-20) }),
      fixture({ title: 'Archived', startDate: date(-60) }),
      fixture({ title: 'Running exhibition', type: 'exhibition', startDate: date(-90), endDate: date(10) }),
    ]);
    expect(feed.dataFeedElement.map(e => e.name)).toEqual(['Upcoming', 'Just passed', 'Running exhibition']);
  });

  test('English feed never advertises nonexistent English event pages', () => {
    const feed = buildDataFeed([fixture(), fixture({ id: 'noenglish', fullDescriptionEn: undefined })], 'en');
    expect(feed.dataFeedElement).toHaveLength(1);
    expect(feed.dataFeedElement[0]).toMatchObject({ url: enUrl, inLanguage: 'en' });
  });

  test('Greek-root feed labels its selected English enrichment honestly', () => {
    const entry = buildDataFeed([fixture()]).dataFeedElement[0];
    expect(entry).toMatchObject({ url: rootUrl, inLanguage: 'en', description: 'An English description of the announced concert.' });
  });

  test('schema and feed retain the legacy prose actually displayed by the Greek page', () => {
    const legacy = 'The legacy English description still displayed on this root-language event page. '.repeat(2);
    const event = fixture({ fullDescriptionGr: legacy, hasNativeGreek: false });
    const $ = load(renderEventDetailPage(event, [], 'el'));
    expect($('.edp-description').text()).toContain(legacy.trim());
    expect(buildDataFeed([event]).dataFeedElement[0].description).toBe(legacy);
    expect(buildDataFeed([event]).dataFeedElement[0].inLanguage).toBeUndefined();
  });

  test('native Greek enrichment retains its language even when English enrichment also exists', () => {
    const entry = buildDataFeed([fixture({ fullDescriptionGr: 'Ελληνική περιγραφή της συναυλίας.', hasNativeGreek: true })]).dataFeedElement[0];
    expect(entry).toMatchObject({ inLanguage: 'el', description: 'Ελληνική περιγραφή της συναυλίας.' });
  });

  test('derived record language cannot certify unlabelled legacy or raw prose', () => {
    const known = fixture({ fullDescriptionEn: undefined, language: 'gr' });
    expect(buildEventSchemaObject(known).inLanguage).toBeUndefined();
    expect(buildEventSchemaObject({ ...known, language: '' }).inLanguage).toBeUndefined();
    const rawGreek = fixture({ fullDescription: undefined, fullDescriptionEn: undefined, description: 'Ελληνική περιγραφή από την πρωτογενή πηγή.', language: 'en' });
    expect(buildEventSchemaObject(rawGreek).inLanguage).toBeUndefined();
  });
});
