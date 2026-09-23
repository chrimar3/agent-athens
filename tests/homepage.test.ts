import { describe, test, expect } from 'bun:test';
import { renderHomepageCapsule, renderHubNavGrid, renderTimeChips } from '../src/templates/homepage';
import type { CapsuleStats, HubNavItem } from '../src/templates/homepage';
import { renderPage } from '../src/templates/page';
import { buildPageMetadata } from '../src/utils/urls';
import type { Event } from '../src/types';
import { extractSingleJsonLdBlock, getGraph, findEntityByType } from './helpers/graph-helpers';

const mockStats: CapsuleStats = {
  total: 472,
  today: 35,
  weekend: 120,
  concerts: 85,
  theater: 60,
  open: 140,
  typeCount: 9,
};

const mockHubs: HubNavItem[] = [
  { slug: 'today', titleEl: 'Σήμερα', titleEn: 'Today', path: '/today/', eventCount: 35, type: 'today' },
  { slug: 'this-weekend', titleEl: 'Σαββατοκύριακο', titleEn: 'This Weekend', path: '/this-weekend/', eventCount: 120, type: 'this-weekend' },
  { slug: 'concerts', titleEl: 'Συναυλίες', titleEn: 'Concerts', path: '/concerts/', eventCount: 85, type: 'concert' },
  { slug: 'theatre', titleEl: 'Θέατρο', titleEn: 'Theater', path: '/theatre/', eventCount: 60, type: 'theater' },
  { slug: 'exhibitions', titleEl: 'Εκθέσεις', titleEn: 'Exhibitions', path: '/exhibitions/', eventCount: 50, type: 'exhibition' },
  { slug: 'open', titleEl: 'Ελεύθερη Είσοδος', titleEn: 'Free Entry', path: '/open/', eventCount: 140, type: 'open' },
];

describe('Homepage Answer Capsule', () => {
  test('contains hub-answer-capsule section', () => {
    const html = renderHomepageCapsule(mockStats);
    expect(html).toContain('class="hub-answer-capsule"');
  });

  test('contains live event counts', () => {
    const html = renderHomepageCapsule(mockStats);
    // Phase-2 B3 (2026-07-08): total is ALL upcoming events, so the claim
    // reads "επερχόμενες" — the old "αυτή την εβδομάδα" wording contradicted
    // the this-week hub's own (smaller) count for the same claim.
    expect(html).toContain('472 επερχόμενες πολιτιστικές εκδηλώσεις');
    expect(html).toContain('9 κατηγορίες');
  });

  test('contains stat links with counts', () => {
    const html = renderHomepageCapsule(mockStats);
    expect(html).toContain('Σήμερα (35)');
    expect(html).toContain('Σαββατοκύριακο (120)');
    expect(html).toContain('Συναυλίες (85)');
    expect(html).toContain('Θέατρο (60)');
    expect(html).toContain('Ελεύθερη είσοδος (140)');
  });

  test('uses "Ελεύθερη είσοδος" not "δωρεάν"', () => {
    const html = renderHomepageCapsule(mockStats);
    expect(html).toContain('Ελεύθερη είσοδος');
    expect(html.toLowerCase()).not.toContain('δωρεάν');
  });
});

describe('Homepage Hub Nav Grid', () => {
  test('contains hub-nav-grid with hub cards', () => {
    const html = renderHubNavGrid(mockHubs);
    expect(html).toContain('class="hub-nav-grid"');
    expect(html).toContain('class="hub-card"');
  });

  test('hub cards have dot, title, count, and link', () => {
    const html = renderHubNavGrid(mockHubs);
    expect(html).toContain('class="hub-dot"');
    expect(html).toContain('class="hub-card-title"');
    expect(html).toContain('class="hub-card-count"');
    // Every hub card is an <a> with href
    for (const hub of mockHubs) {
      expect(html).toContain(`href="${hub.path}"`);
      expect(html).toContain(hub.titleEl);
      expect(html).toContain(`${hub.eventCount} εκδηλώσεις`);
    }
  });

  test('hub card links point to valid hub URLs', () => {
    const html = renderHubNavGrid(mockHubs);
    expect(html).toContain('href="/today/"');
    expect(html).toContain('href="/this-weekend/"');
    expect(html).toContain('href="/concerts/"');
    expect(html).toContain('href="/open/"');
  });

  test('returns empty string for empty hub list', () => {
    expect(renderHubNavGrid([])).toBe('');
  });
});

describe('Homepage @graph envelope (S139)', () => {
  function makeHomepageEvent(id: string): Event {
    return {
      '@context': 'https://schema.org',
      '@type': 'MusicEvent',
      id,
      title: `Homepage Event ${id}`,
      description: 'A homepage test event',
      startDate: new Date().toISOString(),
      type: 'concert',
      genres: [],
      tags: [],
      venue: { name: 'Test Venue', address: 'Athens' },
      price: { type: 'open' },
      source: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      language: 'el',
      hasNativeGreek: false,
      ticketUrlResolved: null,
    } as Event;
  }

  function renderHomepage(): string {
    const events = [makeHomepageEvent('1'), makeHomepageEvent('2')];
    const metadata = buildPageMetadata({}, events.length);
    metadata.pageType = 'homepage';
    return renderPage(metadata, events, undefined, '', 'el', '');
  }

  test('Homepage emits exactly one JSON-LD block as a @graph envelope', () => {
    const envelope = extractSingleJsonLdBlock(renderHomepage());
    expect(envelope['@context']).toBe('https://schema.org');
    expect(Array.isArray(envelope['@graph'])).toBe(true);
  });

  test('Homepage @graph members are [WebSite, CollectionPage, Organization] in that order', () => {
    const envelope = extractSingleJsonLdBlock(renderHomepage());
    const types = getGraph(envelope).map((m: Record<string, any>) => m['@type']);
    expect(types).toEqual(['WebSite', 'CollectionPage', 'Organization']);
  });

  test('WebSite has #website @id, publisher cross-refs Organization @id', () => {
    const envelope = extractSingleJsonLdBlock(renderHomepage());
    const website = findEntityByType(envelope, 'WebSite');
    expect(website).toBeDefined();
    expect(website!['@id']).toBe('https://agentathens.com/#website');
    expect(website!.publisher).toEqual({ '@id': 'https://agentathens.com/#organization' });
  });

  test('WebSite has inLanguage matching Organization knowsLanguage', () => {
    const envelope = extractSingleJsonLdBlock(renderHomepage());
    const website = findEntityByType(envelope, 'WebSite');
    const org = findEntityByType(envelope, 'Organization');
    expect(website!.inLanguage).toEqual(org!.knowsLanguage);
    expect(website!.inLanguage).toEqual(['el', 'en']);
  });

  test('WebSite OMITS potentialAction (no server-side search endpoint exists)', () => {
    const envelope = extractSingleJsonLdBlock(renderHomepage());
    const website = findEntityByType(envelope, 'WebSite');
    expect(website!.potentialAction).toBeUndefined();
  });

  test('CollectionPage has #collectionpage @id at site root', () => {
    const envelope = extractSingleJsonLdBlock(renderHomepage());
    const collection = findEntityByType(envelope, 'CollectionPage');
    expect(collection!['@id']).toBe('https://agentathens.com/#collectionpage');
  });

  test('Organization is the LAST member with canonical site @id', () => {
    const envelope = extractSingleJsonLdBlock(renderHomepage());
    const graph = getGraph(envelope);
    const last = graph[graph.length - 1];
    expect(last['@type']).toBe('Organization');
    expect(last['@id']).toBe('https://agentathens.com/#organization');
  });

  test('No separate Organization <script> block remains alongside the @graph', () => {
    // The pre-S139 homepage emitted two flat blocks (CollectionPage +
    // Organization). Stage 4 collapses them into the single @graph.
    // The full HTML should contain exactly one application/ld+json script.
    const html = renderHomepage();
    const matches = html.match(/<script type="application\/ld\+json">/g);
    expect(matches?.length).toBe(1);
  });
});

describe('Homepage time shortcuts', () => {
  const timeHubs: HubNavItem[] = [
    ...mockHubs,
    { slug: 'tomorrow', titleEl: 'Εκδηλώσεις Αύριο', titleEn: 'Tomorrow', path: '/tomorrow/', eventCount: 4, type: 'tomorrow' },
    { slug: 'this-week', titleEl: 'Αυτή την εβδομάδα', titleEn: 'This week', path: '/this-week/', eventCount: 0, type: 'this-week' },
  ];

  test('links today → tomorrow → weekend in that order, with the hubs\' own counts', () => {
    const html = renderTimeChips(timeHubs);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    expect(hrefs).toEqual(['/today/', '/tomorrow/', '/this-weekend/']);
    expect(html).toContain('35');
    expect(html).toContain('120');
  });

  test('hubs with no events are skipped (this-week has 0 here)', () => {
    expect(renderTimeChips(timeHubs)).not.toContain('/this-week/');
  });

  test('is a labelled navigation landmark', () => {
    expect(renderTimeChips(timeHubs)).toMatch(/<nav[^>]+aria-label="[^"]+"/);
  });

  test('renders nothing when no time hub has events', () => {
    expect(renderTimeChips([])).toBe('');
  });
});
