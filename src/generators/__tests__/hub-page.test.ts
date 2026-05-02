// Hub page tests — structure, schema, filtering, excerpt extraction, editorial content
import { describe, test, expect } from 'bun:test';
import {
  renderHubPage,
  getHubEvents,
  extractExcerpt,
  renderComparisonRow,
  renderEventBlock,
  renderFaqSection,
  renderFaqSchema,
  injectPullQuotes,
} from '../hub-page';
import { sampleConcert, sampleFreeExhibition, getTodayEvent } from '../../../tests/fixtures/events';
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
};

const concertsHubConfig: HubConfig = {
  slug: 'concerts',
  titleEl: 'Συναυλίες στην Αθήνα',
  titleEn: 'Concerts in Athens',
  filter: { type: 'event_type', value: 'concert' },
  answerCapsuleEl: 'Η Αθήνα φιλοξενεί ζωντανές συναυλίες κάθε βράδυ.',
  faqs: testFaqs,
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
    const html = renderHubPage(todayHubConfig, events, events);
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
