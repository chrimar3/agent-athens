import { describe, expect, test } from 'bun:test';
import { load } from 'cheerio';
import { renderPage } from '../src/templates/page';
import { renderContentPage } from '../src/templates/content-page';
import { renderColophonContent } from '../src/templates/colophon';
import { buildSiteOrganizationGraphMember, ORGANIZATION_SCHEMA } from '../src/utils/schema-geo';
import { sampleConcert } from './fixtures/events';
import type { PageMetadata } from '../src/types';

const metadata: PageMetadata = {
  title: 'Athens this week', description: 'Current cultural events in Athens.', keywords: 'Athens',
  url: 'en/this-week/', eventCount: 1, lastUpdate: '2026-09-18T10:00:00Z', filters: {},
};

describe('published discovery surfaces', () => {
  test('a page without a generated JSON representation advertises no invented endpoint', () => {
    const $ = load(renderPage(metadata, [sampleConcert], undefined, undefined, 'en'));
    expect($('link[rel="alternate"][type="application/json"]').length).toBe(0);
  });
  test('a supplied JSON representation is used literally, independently of the HTML route', () => {
    const $ = load(renderPage({ ...metadata, apiUrl: '/api/categories/concerts.json' } as PageMetadata, [sampleConcert]));
    expect($('link[rel="alternate"][type="application/json"]').attr('href')).toBe('/api/categories/concerts.json');
  });
  test('English browse pages advertise the English event feed', () => {
    const $ = load(renderPage(metadata, [sampleConcert], undefined, undefined, 'en'));
    expect($('link[rel="alternate"][type="application/ld+json"]').attr('href')).toBe('/api/en/events.json');
  });
  test('build day is not presented as the page publication date', () => {
    const $ = load(renderPage(metadata, [sampleConcert]));
    expect($('meta[name="date"]').length).toBe(0);
  });
});

describe('publisher and page identity', () => {
  test('standalone and graph publishers share the same identity and public contact', () => {
    const org = buildSiteOrganizationGraphMember();
    expect(org['@id']).toBe('https://agentathens.com/#organization');
    expect(ORGANIZATION_SCHEMA).toMatchObject(org);
    expect(org.email).toBe('cmarag8@gmail.com');
    expect(org.subjectOf.codeRepository).toBe('https://github.com/chrimar3/agent-athens');
  });
  test('hidden biography follows main content and remains available once', () => {
    const html = renderContentPage('en/about', 'About', '<h1>About Agent Athens</h1>', { locale: 'en' });
    const $ = load(html);
    expect($('#colophon-dialog').length).toBe(1);
    expect(html.indexOf('id="colophon-dialog"')).toBeGreaterThan(html.indexOf('</main>'));
    expect($('button[data-colophon-open]').attr('aria-controls')).toBe('colophon-dialog');
  });
  test('standalone creator page has one H1 while dialog content retains its H2', () => {
    const standalone = renderColophonContent('page' as never);
    expect(load(standalone)('h1').text()).toBe('Christos Maragkoudakis');
    expect(load(renderColophonContent())('h1').length).toBe(0);
  });
});
