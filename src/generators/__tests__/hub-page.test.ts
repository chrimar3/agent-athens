// Hub page tests — structure, schema, filtering, excerpt extraction, editorial content
import { describe, test, expect } from 'bun:test';
import {
  renderHubPage,
  renderOverflowPage,
  getHubEvents,
  extractExcerpt,
  renderComparisonRow,
  renderEventBlock,
  renderFaqSection,
  renderFaqSchema,
  injectPullQuotes,
} from '../hub-page';
import { sampleConcert, sampleFreeExhibition, getTodayEvent } from '../../../tests/fixtures/events';
import { extractSingleJsonLdBlock, getGraph, findEntity, findEntityByType } from '../../../tests/helpers/graph-helpers';
import type { Event, HubConfig, HubFaq } from '../../types';

// --- Test fixtures ---

const testFaqs: HubFaq[] = [
  { questionEl: 'Ερώτηση πρώτη;', answerEl: 'Απάντηση πρώτη με αρκετές λέξεις για να περάσει τα 40 χαρακτήρες σύμφωνα με τα κριτήρια.' },
  { questionEl: 'Ερώτηση δεύτερη;', answerEl: 'Απάντηση δεύτερη με αρκετό κείμενο για να πληρεί τις προϋποθέσεις του σχήματος FAQPage.' },
  { questionEl: 'Ερώτηση τρίτη;', answerEl: 'Απάντηση τρίτη που παρέχει χρήσιμες πληροφορίες για τους χρήστες της πλατφόρμας.' },
  { questionEl: 'Ερώτηση τέταρτη;', answerEl: 'Απάντηση τέταρτη που εξηγεί πώς λειτουργεί η πλατφόρμα και τι προσφέρει.' },
];

const todayHubConfig: HubConfig = {
  slug: 'today',
  titleEl: 'Εκδηλώσεις Σήμερα στην Αθήνα',
  titleEn: 'Events in Athens Today',
  filter: { type: 'date', value: 'today' },
  answerCapsuleEl: 'Σήμερα στην Αθήνα θα βρείτε συναυλίες, εκθέσεις, θεατρικές παραστάσεις.',
  faqs: testFaqs,
  cornerstone: true,
};

const concertsHubConfig: HubConfig = {
  slug: 'concerts',
  titleEl: 'Συναυλίες στην Αθήνα',
  titleEn: 'Concerts in Athens',
  filter: { type: 'event_type', value: 'concert' },
  answerCapsuleEl: 'Η Αθήνα φιλοξενεί ζωντανές συναυλίες κάθε βράδυ.',
  faqs: testFaqs,
  cornerstone: true,
};

const nonCornerstoneHubConfig: HubConfig = {
  slug: 'jazz',
  titleEl: 'Τζαζ στην Αθήνα',
  titleEn: 'Jazz in Athens',
  filter: { type: 'tag', values: ['jazz'] },
  answerCapsuleEl: 'Τζαζ βραδιές σε όλη την Αθήνα.',
  faqs: [],
  cornerstone: false,
};

function makeEvent(overrides: Partial<Event>): Event {
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    id: 'test-event-' + Math.random().toString(36).substring(7),
    title: 'Test Event',
    description: 'A test event',
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
    ...overrides,
  };
}

function makeTodayEvents(count: number): Event[] {
  const today = new Date();
  today.setHours(20, 0, 0, 0);
  return Array.from({ length: count }, (_, i) =>
    makeEvent({
      id: `today-event-${i}`,
      title: `Today Event ${i}`,
      startDate: today.toISOString(),
      type: i % 2 === 0 ? 'concert' : 'exhibition',
    })
  );
}

function makeConcertEvents(count: number): Event[] {
  const future = new Date();
  future.setDate(future.getDate() + 1);
  future.setHours(21, 0, 0, 0);
  return Array.from({ length: count }, (_, i) =>
    makeEvent({
      id: `concert-event-${i}`,
      title: `Concert ${i}`,
      startDate: new Date(future.getTime() + i * 86400000).toISOString(),
      type: 'concert',
    })
  );
}

// --- Tests ---

describe('Hub template structure', () => {
  const events = makeTodayEvents(5);
  const allEvents = [...events, ...makeConcertEvents(3)];

  test('Hub HTML contains answer capsule section', () => {
    const html = renderHubPage(todayHubConfig, events, allEvents);
    expect(html).not.toBeNull();
    expect(html!).toContain('class="hub-answer-capsule"');
    expect(html!).toContain(todayHubConfig.answerCapsuleEl);
  });

  test('Hub HTML contains comparison table', () => {
    const html = renderHubPage(todayHubConfig, events, allEvents);
    expect(html!).toContain('class="hub-comparison-table"');
    expect(html!).toContain('<th scope="col">Εκδήλωση</th>');
    expect(html!).toContain('<th scope="col">Χώρος</th>');
    expect(html!).toContain('<th scope="col">Ημερομηνία</th>');
    expect(html!).toContain('<th scope="col">Είσοδος</th>');
  });

  test('Hub HTML contains FAQ section', () => {
    const html = renderHubPage(todayHubConfig, events, allEvents);
    expect(html!).toContain('class="hub-faq"');
    expect(html!).toContain('<details>');
    expect(html!).toContain('<summary>');
  });

  test('Greek hub has no seasonal narrative section (English-only feature)', () => {
    const html = renderHubPage(todayHubConfig, events, allEvents);
    expect(html!).not.toContain('hub-seasonal-narrative');
  });

  test('Hub HTML contains event blocks when enriched events exist', () => {
    const enrichedEvents = makeTodayEvents(5).map((e, i) => ({
      ...e,
      fullDescription: `This is a full description for event ${i}. It has multiple sentences. And even more detail about the event.`,
    }));
    const html = renderHubPage(todayHubConfig, enrichedEvents, enrichedEvents);
    expect(html!).toContain('class="hub-event-blocks"');
    expect(html!).toContain('class="hub-event-excerpt"');
  });

  test('Hub HTML does NOT contain event blocks when no enriched events', () => {
    // Events without fullDescription
    const html = renderHubPage(todayHubConfig, events, allEvents);
    expect(html!).not.toContain('class="hub-event-blocks"');
  });
});

describe('FAQPage schema', () => {
  const events = makeTodayEvents(5);

  test('Hub HTML contains FAQPage JSON-LD', () => {
    const html = renderHubPage(todayHubConfig, events, events);
    expect(html!).toContain('"@type":"FAQPage"');
  });

  test('FAQPage has mainEntity array with Question objects', () => {
    const schema = renderFaqSchema(testFaqs);
    const parsed = JSON.parse(schema.replace(/<\/?script[^>]*>/g, ''));
    expect(parsed['@type']).toBe('FAQPage');
    expect(parsed.mainEntity).toBeArray();
    expect(parsed.mainEntity.length).toBe(4);
    expect(parsed.mainEntity[0]['@type']).toBe('Question');
  });

  test('Each Question has name and acceptedAnswer.text', () => {
    const schema = renderFaqSchema(testFaqs);
    const parsed = JSON.parse(schema.replace(/<\/?script[^>]*>/g, ''));
    for (const q of parsed.mainEntity) {
      expect(q.name).toBeTruthy();
      expect(q.acceptedAnswer).toBeTruthy();
      expect(q.acceptedAnswer['@type']).toBe('Answer');
      expect(q.acceptedAnswer.text).toBeTruthy();
    }
  });

  test('FAQ count matches config', () => {
    const schema = renderFaqSchema(testFaqs);
    const parsed = JSON.parse(schema.replace(/<\/?script[^>]*>/g, ''));
    expect(parsed.mainEntity.length).toBe(testFaqs.length);
  });
});

describe('Hub @graph envelope (S139)', () => {
  test('Cornerstone hub emits exactly one JSON-LD block as a @graph envelope', () => {
    const events = makeTodayEvents(5);
    const html = renderHubPage(todayHubConfig, events, events);
    const envelope = extractSingleJsonLdBlock(html!);
    expect(envelope['@context']).toBe('https://schema.org');
    expect(Array.isArray(envelope['@graph'])).toBe(true);
  });

  test('Cornerstone @graph members appear in strategist Q2 order', () => {
    const events = makeTodayEvents(5);
    const html = renderHubPage(todayHubConfig, events, events);
    const envelope = extractSingleJsonLdBlock(html!);
    const types = getGraph(envelope).map((m: Record<string, any>) => m['@type']);
    // CollectionPage FIRST, Organization LAST. FAQPage in between (faqs present).
    expect(types[0]).toBe('CollectionPage');
    expect(types[types.length - 1]).toBe('Organization');
    expect(types).toContain('FAQPage');
  });

  test('Cornerstone CollectionPage has #collectionpage @id at hub canonical', () => {
    const events = makeTodayEvents(5);
    const html = renderHubPage(todayHubConfig, events, events);
    const envelope = extractSingleJsonLdBlock(html!);
    const collection = findEntityByType(envelope, 'CollectionPage');
    expect(collection).toBeDefined();
    expect(collection!['@id']).toBe('https://agentathens.com/today#collectionpage');
  });

  test('Cornerstone FAQPage has #faqpage @id at hub canonical', () => {
    const events = makeTodayEvents(5);
    const html = renderHubPage(todayHubConfig, events, events);
    const envelope = extractSingleJsonLdBlock(html!);
    const faq = findEntityByType(envelope, 'FAQPage');
    expect(faq).toBeDefined();
    expect(faq!['@id']).toBe('https://agentathens.com/today#faqpage');
    expect(faq!.mainEntity.length).toBe(testFaqs.length);
  });

  test('Organization is the LAST member and uses the canonical site @id', () => {
    const events = makeTodayEvents(5);
    const html = renderHubPage(todayHubConfig, events, events);
    const envelope = extractSingleJsonLdBlock(html!);
    const graph = getGraph(envelope);
    const last = graph[graph.length - 1];
    expect(last['@type']).toBe('Organization');
    expect(last['@id']).toBe('https://agentathens.com/#organization');
  });

  test('Editor-picks ItemList is absent until S101b wires real picks', () => {
    // S101a infrastructure exists but has no production callers; hub-page
    // passes editorPicks: []. buildEditorPicksItemList returns null on empty,
    // so the ItemList member is omitted from the @graph entirely. When S101b
    // lands and passes a populated picks array, the ItemList will auto-appear.
    const events = makeTodayEvents(5);
    const html = renderHubPage(todayHubConfig, events, events);
    const envelope = extractSingleJsonLdBlock(html!);
    const editorPicks = findEntity(envelope, '@id', 'https://agentathens.com/today#editor-picks');
    expect(editorPicks).toBeUndefined();
  });

  test('Non-cornerstone hub @graph contains only CollectionPage + Organization', () => {
    const events = makeTodayEvents(5);
    const html = renderHubPage(nonCornerstoneHubConfig, events, events);
    const envelope = extractSingleJsonLdBlock(html!);
    const types = getGraph(envelope).map((m: Record<string, any>) => m['@type']);
    expect(types).toEqual(['CollectionPage', 'Organization']);
  });

  test('English-locale hub with no English FAQ translations omits FAQPage', () => {
    // testFaqs has no questionEn/answerEn fields, so renderFaqSchema's locale
    // filter returns []. buildFaqPageMember returns null → FAQPage is dropped
    // from the @graph (no empty FAQPage ships in production).
    const englishHubConfig: HubConfig = {
      ...todayHubConfig,
      answerCapsuleEn: 'Today in Athens: concerts, exhibitions, theater.',
    };
    const events = makeTodayEvents(5);
    const html = renderHubPage(englishHubConfig, events, events, undefined, 'en');
    const envelope = extractSingleJsonLdBlock(html!);
    const faq = findEntityByType(envelope, 'FAQPage');
    expect(faq).toBeUndefined();
  });

  test('Hub canonical URL is locale-aware self (S144 GEO 2026-05-21)', () => {
    // S144 supersedes the 2026-05-14 canonical-to-root posture. /en/ hubs now
    // self-canonical to /en/<slug>; bare-root hubs to <slug>. CollectionPage
    // @id reflects the canonical URL of its page, so el + en variants now have
    // DIFFERENT @id values (each pointing at their own surface).
    //
    // Trailing-slash axis (separate from S144): EN /en/<slug>/ matches Netlify's
    // directory-served form; EL /<slug> matches its flat-file-served form. Per-URL
    // parity, not uniform. See decisions.md.
    const events = makeTodayEvents(5);
    const englishHubConfig: HubConfig = {
      ...todayHubConfig,
      answerCapsuleEn: 'Today in Athens.',
    };
    const elHtml = renderHubPage(todayHubConfig, events, events);
    const enHtml = renderHubPage(englishHubConfig, events, events, undefined, 'en');
    const elEnvelope = extractSingleJsonLdBlock(elHtml!);
    const enEnvelope = extractSingleJsonLdBlock(enHtml!);
    const elId = findEntityByType(elEnvelope, 'CollectionPage')!['@id'];
    const enId = findEntityByType(enEnvelope, 'CollectionPage')!['@id'];
    expect(elId).toContain('/today#collectionpage');
    expect(elId).not.toContain('/en/');
    expect(enId).toContain('/en/today/#collectionpage');
    expect(elId).not.toBe(enId);
  });

  test('EN hub canonical link in HTML emits trailing-slash form', () => {
    // Per-URL parity: EN serves at /en/<slug>/ (directory), so declared canonical
    // must match. EL parity (no-slash) covered separately below.
    const events = makeTodayEvents(5);
    const englishHubConfig: HubConfig = {
      ...todayHubConfig,
      answerCapsuleEn: 'Today in Athens.',
    };
    const enHtml = renderHubPage(englishHubConfig, events, events, undefined, 'en');
    expect(enHtml!).toContain('<link rel="canonical" href="https://agentathens.com/en/today/">');
    expect(enHtml!).toContain('<meta property="og:url" content="https://agentathens.com/en/today/">');
  });

  test('EL hub canonical link stays no-slash (per-URL parity guard)', () => {
    // EL serves at /<slug> (flat file dist/<slug>.html). Declared no-slash
    // must NOT regress to slash form, or we re-introduce the 301-canonical bug
    // on the EL side.
    const events = makeTodayEvents(5);
    const elHtml = renderHubPage(todayHubConfig, events, events);
    expect(elHtml!).toContain('<link rel="canonical" href="https://agentathens.com/today">');
    expect(elHtml!).not.toContain('<link rel="canonical" href="https://agentathens.com/today/">');
  });

  test('Hreflang en + x-default emit trailing-slash; el stays no-slash', () => {
    // Hub-page.ts post-render-injects hreflang for bilingual hubs (Guard 6:
    // 6th URL emitter, hand-rolled, independent of metadata.url). Per-URL parity
    // applies here too — EN slash, EL no-slash.
    const events = makeTodayEvents(5);
    const englishHubConfig: HubConfig = {
      ...todayHubConfig,
      answerCapsuleEn: 'Today in Athens.',
    };
    const enHtml = renderHubPage(englishHubConfig, events, events, undefined, 'en');
    expect(enHtml!).toContain('<link rel="alternate" hreflang="en" href="https://agentathens.com/en/today/">');
    expect(enHtml!).toContain('<link rel="alternate" hreflang="x-default" href="https://agentathens.com/en/today/">');
    expect(enHtml!).toContain('<link rel="alternate" hreflang="el" href="https://agentathens.com/today">');
  });

  test('Overflow page canonical (EN) is trailing-slash form', () => {
    // Pagination convention: overflow canonicalizes to the main hub root URL.
    // That root is /en/<slug>/ (slash) per the served-form rule, so overflow's
    // declared canonical must match — even though overflow itself is noindex,
    // the inline canonical 301-source would violate the build invariant.
    const events = makeTodayEvents(35);  // > HUB_EVENT_LIMIT so overflow triggers
    const englishHubConfig: HubConfig = {
      ...todayHubConfig,
      answerCapsuleEn: 'Today in Athens.',
    };
    const overflowHtml = renderOverflowPage(englishHubConfig, events, events, 'en');
    expect(overflowHtml).toContain('<link rel="canonical" href="https://agentathens.com/en/today/">');
  });
});

describe('Comparison table', () => {
  test('Table has correct Greek headers with scope="col"', () => {
    const events = makeTodayEvents(5);
    const html = renderHubPage(todayHubConfig, events, events);
    expect(html!).toContain('<th scope="col">Εκδήλωση</th>');
    expect(html!).toContain('<th scope="col">Χώρος</th>');
    expect(html!).toContain('<th scope="col">Ημερομηνία</th>');
    expect(html!).toContain('<th scope="col">Είσοδος</th>');
  });

  test('All 4 table headers have scope="col" for WCAG 2.1', () => {
    const events = makeTodayEvents(5);
    // Use a non-cornerstone hub so the table has exactly 4 columns (cornerstones
    // add a 5th ★ column). The WCAG intent is "every <th> has scope" — column
    // count is incidental to that.
    const html = renderHubPage(nonCornerstoneHubConfig, events, events);
    expect(html!).toContain('<th scope="col">');
    const scopeCount = (html!.match(/scope="col"/g) || []).length;
    expect(scopeCount).toBe(4);
  });

  test('Table rows are limited to 20', () => {
    const manyEvents = makeTodayEvents(25);
    const html = renderHubPage(todayHubConfig, manyEvents, manyEvents);
    const rowCount = (html!.match(/<tr><td>/g) || []).length;
    expect(rowCount).toBeLessThanOrEqual(20);
  });

  test('Each row has event link, venue, date, price', () => {
    const row = renderComparisonRow(sampleConcert);
    expect(row).toContain('<a href="/events/');
    expect(row).toContain(sampleConcert.venue.name);
    expect(row).toContain('€15');
  });

  test('Open entry events show "Ελ. είσοδος"', () => {
    const row = renderComparisonRow(sampleFreeExhibition);
    expect(row).toContain('Ελ. είσοδος');
  });

  // S101a: ★ column on cornerstone hubs only
  test('renderComparisonRow without hasPick emits 4 cells', () => {
    const row = renderComparisonRow(sampleConcert);
    const tdCount = (row.match(/<td/g) || []).length;
    expect(tdCount).toBe(4);
    expect(row).not.toContain('pick-star');
  });

  test('renderComparisonRow with hasPick=true emits 5 cells with ★', () => {
    const row = renderComparisonRow(sampleConcert, 'el', true);
    const tdCount = (row.match(/<td/g) || []).length;
    expect(tdCount).toBe(5);
    expect(row).toContain('<td class="pick-star">★</td>');
  });

  test('Cornerstone hub renders ★ column header with aria-label', () => {
    const cornerstoneToday: HubConfig = { ...todayHubConfig, cornerstone: true };
    const events = makeTodayEvents(5);
    const html = renderHubPage(cornerstoneToday, events, events);
    expect(html!).toContain('aria-label="Επιλογή συντακτικής ομάδας"');
    // Header row contains 5 <th> cells (including ★)
    const headerMatch = html!.match(/<thead><tr>(.*?)<\/tr><\/thead>/s);
    expect(headerMatch).not.toBeNull();
    const thCount = (headerMatch![1].match(/<th /g) || []).length;
    expect(thCount).toBe(5);
  });

  test('Cornerstone English hub uses English aria-label', () => {
    const cornerstoneToday: HubConfig = {
      ...todayHubConfig,
      cornerstone: true,
      answerCapsuleEn: 'Events in Athens today.',
    };
    const events = makeTodayEvents(5);
    const html = renderHubPage(cornerstoneToday, events, events, undefined, 'en');
    expect(html!).toContain('aria-label="Editor\'s pick"');
  });

  test('Non-cornerstone hub does NOT render ★ column header', () => {
    const events = makeTodayEvents(5);
    const html = renderHubPage(nonCornerstoneHubConfig, events, events);
    const headerMatch = html!.match(/<thead><tr>(.*?)<\/tr><\/thead>/s);
    expect(headerMatch).not.toBeNull();
    const thCount = (headerMatch![1].match(/<th /g) || []).length;
    expect(thCount).toBe(4);
    expect(html!).not.toContain('aria-label="Editor\'s pick"');
    expect(html!).not.toContain('Επιλογή συντακτικής ομάδας');
  });
});

describe('Event blocks', () => {
  test('Only events with fullDescription appear in event blocks', () => {
    const events = [
      makeEvent({ id: 'no-desc-1', title: 'No Description', startDate: new Date().toISOString() }),
      makeEvent({
        id: 'with-desc-1',
        title: 'With Description',
        startDate: new Date().toISOString(),
        fullDescription: 'This is a full description. It has details.',
      }),
      makeEvent({ id: 'no-desc-2', title: 'Also No Description', startDate: new Date().toISOString() }),
    ];
    const html = renderHubPage(todayHubConfig, events, events);
    expect(html!).toContain('With Description');
    // Event blocks section should exist with the enriched event
    const blockMatches = html!.match(/class="hub-event-block"/g);
    expect(blockMatches?.length).toBe(1);
  });

  test('Max 8 event blocks', () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      makeEvent({
        id: `enriched-${i}`,
        title: `Enriched Event ${i}`,
        startDate: new Date().toISOString(),
        fullDescription: `Full description for event ${i}. It has sentences.`,
      })
    );
    const html = renderHubPage(todayHubConfig, events, events);
    const blockMatches = html!.match(/class="hub-event-block"/g) || [];
    expect(blockMatches.length).toBeLessThanOrEqual(8);
  });

  test('Excerpt is ≤2 sentences', () => {
    const event = makeEvent({
      fullDescription: 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.',
    });
    const block = renderEventBlock(event);
    // Excerpt should contain first 2 sentences, not the third
    expect(block).toContain('First sentence here.');
    expect(block).toContain('Second sentence here.');
    expect(block).not.toContain('Third sentence here.');
  });
});

describe('Hub filtering', () => {
  test('/concerts filter returns only concert events', () => {
    const events = [
      makeEvent({ id: 'c1', type: 'concert', title: 'Concert 1' }),
      makeEvent({ id: 'e1', type: 'exhibition', title: 'Exhibition 1' }),
      makeEvent({ id: 'c2', type: 'concert', title: 'Concert 2' }),
      makeEvent({ id: 't1', type: 'theater', title: 'Theater 1' }),
    ];
    const filtered = getHubEvents(concertsHubConfig, events);
    expect(filtered.length).toBe(2);
    expect(filtered.every(e => e.type === 'concert')).toBe(true);
  });

  test('event_types filter returns matching events', () => {
    const config: HubConfig = {
      slug: 'theater',
      titleEl: 'Θέατρο στην Αθήνα',
      titleEn: 'Theater in Athens',
      filter: { type: 'event_types', values: ['theater', 'performance'] },
      answerCapsuleEl: 'Test capsule',
      faqs: testFaqs,
    };
    const events = [
      makeEvent({ type: 'theater' }),
      makeEvent({ type: 'performance' }),
      makeEvent({ type: 'concert' }),
    ];
    const filtered = getHubEvents(config, events);
    expect(filtered.length).toBe(2);
    expect(filtered.every(e => e.type === 'theater' || e.type === 'performance')).toBe(true);
  });

  test('tag filter returns events with matching tags (case-insensitive)', () => {
    const config: HubConfig = {
      slug: 'kids',
      titleEl: 'Παιδιά στην Αθήνα',
      titleEn: 'Kids in Athens',
      filter: { type: 'tag', values: ['Child-friendly', 'Family-friendly'] },
      answerCapsuleEl: 'Test capsule',
      faqs: testFaqs,
    };
    const events = [
      makeEvent({ tags: ['child-friendly', 'Jazz'] }),
      makeEvent({ tags: ['Rock'] }),
      makeEvent({ tags: ['Family-Friendly', 'Outdoor'] }),
    ];
    const filtered = getHubEvents(config, events);
    expect(filtered.length).toBe(2);
  });

  test('tag filter handles events with no tags', () => {
    const config: HubConfig = {
      slug: 'kids',
      titleEl: 'Παιδιά',
      titleEn: 'Kids',
      filter: { type: 'tag', values: ['Child-friendly'] },
      answerCapsuleEl: 'Test',
      faqs: testFaqs,
    };
    const events = [
      makeEvent({ tags: [] }),
      makeEvent({ tags: ['child-friendly'] }),
    ];
    const filtered = getHubEvents(config, events);
    expect(filtered.length).toBe(1);
  });

  test('price_type filter returns matching events', () => {
    const config: HubConfig = {
      slug: 'open',
      titleEl: 'Ελεύθερη Είσοδος',
      titleEn: 'Open Entry',
      filter: { type: 'price_type', value: 'open' },
      answerCapsuleEl: 'Test capsule',
      faqs: testFaqs,
    };
    const events = [
      makeEvent({ price: { type: 'open' } }),
      makeEvent({ price: { type: 'with-ticket', amount: 15 } }),
      makeEvent({ price: { type: 'open' } }),
    ];
    const filtered = getHubEvents(config, events);
    expect(filtered.length).toBe(2);
    expect(filtered.every(e => e.price.type === 'open')).toBe(true);
  });

  test('/today filter uses date filtering', () => {
    const today = new Date();
    today.setHours(20, 0, 0, 0);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(20, 0, 0, 0);

    const events = [
      makeEvent({ id: 'td1', title: 'Today Event', startDate: today.toISOString() }),
      makeEvent({ id: 'tm1', title: 'Tomorrow Event', startDate: tomorrow.toISOString() }),
    ];
    const filtered = getHubEvents(todayHubConfig, events);
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe('Today Event');
  });
});

describe('extractExcerpt utility', () => {
  test('Returns first 2 sentences', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const excerpt = extractExcerpt(text);
    expect(excerpt).toBe('First sentence. Second sentence.');
  });

  test('Handles Greek text with periods', () => {
    const text = 'Πρώτη πρόταση στα ελληνικά. Δεύτερη πρόταση εδώ. Τρίτη πρόταση.';
    const excerpt = extractExcerpt(text);
    expect(excerpt).toContain('Πρώτη πρόταση');
    expect(excerpt).toContain('Δεύτερη πρόταση');
    expect(excerpt).not.toContain('Τρίτη πρόταση');
  });

  test('Does not break mid-sentence', () => {
    const text = 'This is a complete sentence. And another one.';
    const excerpt = extractExcerpt(text);
    expect(excerpt).toBe('This is a complete sentence. And another one.');
  });

  test('Handles text with no periods — returns full text', () => {
    const text = 'This text has no sentence endings at all';
    const excerpt = extractExcerpt(text);
    expect(excerpt).toBe(text);
  });

  test('Handles empty string', () => {
    expect(extractExcerpt('')).toBe('');
  });

  test('Handles single sentence', () => {
    const text = 'Just one sentence here.';
    const excerpt = extractExcerpt(text);
    expect(excerpt).toBe('Just one sentence here.');
  });
});

describe('Minimum threshold', () => {
  test('Hub with <3 events returns null', () => {
    const events = makeTodayEvents(2);
    const html = renderHubPage(todayHubConfig, events, events);
    expect(html).toBeNull();
  });

  test('Hub with exactly 3 events renders', () => {
    const events = makeTodayEvents(3);
    const html = renderHubPage(todayHubConfig, events, events);
    expect(html).not.toBeNull();
  });
});

describe('FAQ section HTML', () => {
  test('Uses native details/summary elements', () => {
    const html = renderFaqSection(testFaqs);
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>');
    expect(html).toContain('</details>');
  });

  test('FAQ HTML text matches schema text exactly', () => {
    const faqHtml = renderFaqSection(testFaqs);
    const schemaStr = renderFaqSchema(testFaqs);
    const parsed = JSON.parse(schemaStr.replace(/<\/?script[^>]*>/g, ''));

    for (const faq of testFaqs) {
      // HTML contains the question
      expect(faqHtml).toContain(faq.questionEl);
      // Schema contains the same question
      const schemaQ = parsed.mainEntity.find((q: any) => q.name === faq.questionEl);
      expect(schemaQ).toBeTruthy();
      expect(schemaQ.acceptedAnswer.text).toBe(faq.answerEl);
    }
  });
});

// --- Editorial content integration tests ---

describe('Pull quote injection', () => {
  test('injectPullQuotes inserts aside into HTML with enough cards', () => {
    // Simulate card grid with 2 date groups: 6 + 6 = 12 cards
    const html = `<html><section class="card-grid" itemscope>
<h2 class="date-group-header">Monday</h2>
<div class="date-group" data-count="6">cards</div>
<h2 class="date-group-header">Tuesday</h2>
<div class="date-group" data-count="6">cards</div>
</section></html>`;

    const result = injectPullQuotes(html, ['Test quote']);
    expect(result).toContain('class="pull-quote"');
    expect(result).toContain('aria-hidden="true"');
    expect(result).toContain('Test quote');
  });

  test('injectPullQuotes returns unchanged HTML when no quotes', () => {
    const html = '<section class="card-grid"><div class="date-group" data-count="20">cards</div></section>';
    expect(injectPullQuotes(html, [])).toBe(html);
  });

  test('injectPullQuotes returns unchanged HTML when too few cards', () => {
    const html = `<section class="card-grid" itemscope>
<h2 class="date-group-header">Monday</h2>
<div class="date-group" data-count="3">cards</div>
</section>`;
    const result = injectPullQuotes(html, ['Quote']);
    expect(result).not.toContain('pull-quote');
  });

  test('injectPullQuotes inserts multiple quotes at intervals', () => {
    const html = `<section class="card-grid" itemscope>
<h2 class="date-group-header">Day 1</h2>
<div class="date-group" data-count="12">cards</div>
<h2 class="date-group-header">Day 2</h2>
<div class="date-group" data-count="12">cards</div>
<h2 class="date-group-header">Day 3</h2>
<div class="date-group" data-count="5">cards</div>
</section>`;

    const result = injectPullQuotes(html, ['Quote A', 'Quote B']);
    expect(result).toContain('Quote A');
    expect(result).toContain('Quote B');
    const quoteCount = (result.match(/class="pull-quote"/g) || []).length;
    expect(quoteCount).toBe(2);
  });

  test('Concerts hub page includes pull quotes from editorial config', () => {
    const events = makeConcertEvents(15);
    const html = renderHubPage(concertsHubConfig, events, events);
    // config/editorial-content.json has pull quotes for "concerts" hub
    expect(html!).toContain('class="pull-quote"');
  });
});

describe('Section editorial', () => {
  test('Concerts hub shows section editorial in event blocks', () => {
    const events = makeConcertEvents(5).map((e, i) => ({
      ...e,
      fullDescription: `Full description for concert ${i}. With detail sentences.`,
    }));
    const html = renderHubPage(concertsHubConfig, events, events);
    // config/editorial-content.json has section editorial for "concerts"
    expect(html!).toContain('class="section-editorial"');
  });

  test('Hub without editorial config does not render section editorial', () => {
    const events = makeTodayEvents(5).map((e, i) => ({
      ...e,
      fullDescription: `Full description for event ${i}. With detail sentences.`,
    }));
    const html = renderHubPage(todayHubConfig, events, events);
    // "today" hub has no section editorial in config
    expect(html!).not.toContain('class="section-editorial"');
  });

  test('Hub without enriched events skips section editorial entirely', () => {
    const events = makeConcertEvents(5); // no fullDescription
    const html = renderHubPage(concertsHubConfig, events, events);
    // No event blocks section → no section editorial injection point
    expect(html!).not.toContain('class="section-editorial"');
  });
});
