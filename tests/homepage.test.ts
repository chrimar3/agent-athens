import { describe, test, expect } from 'bun:test';
import { renderHomepageCapsule, renderHubNavGrid, renderTerminalCta } from '../src/templates/homepage';
import type { CapsuleStats, HubNavItem } from '../src/templates/homepage';

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
    expect(html).toContain('472 πολιτιστικές εκδηλώσεις');
    expect(html).toContain('9 κατηγορίες');
  });

  test('contains stat links with counts', () => {
    const html = renderHomepageCapsule(mockStats);
    expect(html).toContain('Σήμερα (35)');
    expect(html).toContain('Σαββατοκύριακο (120)');
    expect(html).toContain('Συναυλίες (85)');
    expect(html).toContain('Θέατρο (60)');
    expect(html).toContain('Ελεύθερη Είσοδος (140)');
  });

  test('uses "Ελεύθερη Είσοδος" not "δωρεάν"', () => {
    const html = renderHomepageCapsule(mockStats);
    expect(html).toContain('Ελεύθερη Είσοδος');
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

describe('Homepage Terminal CTA', () => {
  test('contains terminal-cta section', () => {
    const html = renderTerminalCta(mockHubs);
    expect(html).toContain('class="terminal-cta"');
  });

  test('contains category links with counts', () => {
    const html = renderTerminalCta(mockHubs);
    for (const hub of mockHubs) {
      expect(html).toContain(`${hub.titleEl} (${hub.eventCount})`);
      expect(html).toContain(`href="${hub.path}"`);
    }
  });

  test('returns empty string for empty hub list', () => {
    expect(renderTerminalCta([])).toBe('');
  });
});
