import { describe, test, expect } from "bun:test";
import { renderEventDetailPage, renderRelatedEventCard, renderEventDetailScript, generateEventSlug, generateEventSchema, buildEventSchemaObject, buildEventGraphEnvelope } from "../event-page";
import { BASE_URL } from "../../config/site-url";

// S139 stage 1 test helpers — extract entities from @graph envelope.
// Per S138 Section 4.2: assert on entity properties, not @graph shape.
// `findEntity` locates a member by @type or @id; `parseEventFromEnvelope`
// returns the Event entity with @id-references resolved to inline entities
// (minus their @id field) so existing property-assertion tests keep working
// after the envelope migration without per-test rewrites.
function findEntity(envelope: any, by: '@type' | '@id', value: string): any {
  const graph: any[] = envelope?.['@graph'] ?? [];
  return graph.find(m => m?.[by] === value);
}

function parseEventFromEnvelope(envelopeJson: string): any {
  const envelope = JSON.parse(envelopeJson);
  const graph: any[] = envelope['@graph'];
  // Build an @id → entity map for reference resolution.
  const byId = new Map<string, any>();
  for (const m of graph) {
    if (m['@id']) byId.set(m['@id'], m);
  }
  // Recursively replace pure `{"@id": x}` references with the target entity,
  // stripping the resolved entity's own @id so test assertions using strict
  // `toEqual` still match the pre-S139 inline shape.
  const seen = new WeakSet<object>();
  const resolve = (node: any): any => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(resolve);
    if (seen.has(node)) return node;
    seen.add(node);
    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === '@id') {
      const target = byId.get(node['@id']);
      if (target) {
        const { '@id': _omit, ...rest } = target;
        return resolve(rest);
      }
      return node;
    }
    const out: any = {};
    for (const k of keys) out[k] = resolve(node[k]);
    return out;
  };
  // Return the Event entity (member 0 per Q2 ordering) with references resolved.
  return resolve(graph[0]);
}
import {
  sampleConcert,
  sampleConcertWithTicket,
  sampleFreeExhibition,
  sampleTheaterPerformance,
  sampleWorkshop,
} from "../../../tests/fixtures/events";
import type { Event } from "../../types";

// Future date for tests that need upcoming events
const futureStartDate = new Date(Date.now() + 86400000 * 14).toISOString();

// Short description event (no read-more)
const shortDescEvent: Event = {
  ...sampleConcert,
  startDate: futureStartDate,
  fullDescription: undefined,
  description: "A short event description.",
};

// Long fullDescription event (triggers read-more)
const longDescEvent: Event = {
  ...sampleConcert,
  fullDescription: "A".repeat(500),
};

// Event with no ticket URL
const noTicketEvent: Event = {
  ...sampleConcert,
  ticketUrl: undefined,
};

// Event with source URL
const eventWithSourceUrl: Event = {
  ...sampleConcert,
  url: "https://example.com/event",
  source: "example.com",
};

// Event without source URL
const eventWithoutSourceUrl: Event = {
  ...sampleConcert,
  url: undefined,
  source: "manual entry",
};

// Event without coordinates
const eventNoCoords: Event = {
  ...sampleConcert,
  venue: { ...sampleConcert.venue, coordinates: undefined },
};

// Currently-open exhibition for testing
const openExhibition: Event = {
  ...sampleFreeExhibition,
  startDate: new Date(Date.now() - 86400000 * 7).toISOString(),
  endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
};

describe("Event Detail Page — Hero section", () => {
  test("renders edp-hero with type color CSS variable", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain('class="edp-hero"');
    expect(html).toContain("--edp-type-color: var(--color-concert)");
  });

  test("title has edp-title class and itemprop=name", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain('class="edp-title" itemprop="name"');
    expect(html).toContain(sampleConcert.title);
  });

  test("date has itemprop=startDate with correct datetime", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain(`itemprop="startDate" datetime="${sampleConcert.startDate}"`);
  });

  test("type badge renders with correct label", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain('class="edp-type-badge"');
    expect(html).toContain("Συναυλία");
  });

  test("type badge uses light-text class for dark-background types", () => {
    const html = renderEventDetailPage(sampleTheaterPerformance, []);
    // theater is not in LIGHT_TEXT_BADGES, so no light-text class
    expect(html).toContain('class="edp-type-badge"');
  });

  test("CTA renders when ticketUrl exists (upcoming event)", () => {
    const upcomingWithTicket: Event = { ...sampleConcertWithTicket, startDate: futureStartDate };
    const html = renderEventDetailPage(upcomingWithTicket, []);
    expect(html).toContain("edp-cta edp-cta-hero");
    expect(html).toContain(sampleConcertWithTicket.ticketUrl!);
    expect(html).toContain("Αγοράστε εισιτήρια");
  });

  test("CTA absent when no ticketUrl", () => {
    const html = renderEventDetailPage(noTicketEvent, []);
    expect(html).not.toContain('class="edp-cta edp-cta-hero');
  });

  test("exhibition open-now badge when applicable", () => {
    const html = renderEventDetailPage(openExhibition, []);
    expect(html).toContain("edp-open-badge");
    expect(html).toContain("Τώρα ανοιχτή");
  });

  test("no open-now badge for non-exhibition events", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).not.toContain("edp-open-badge");
  });
});

describe("Event Detail Page — Description", () => {
  test("short description renders without read-more", () => {
    const html = renderEventDetailPage(shortDescEvent, []);
    expect(html).not.toContain('edp-description is-collapsed');
    expect(html).not.toContain('<button class="edp-read-more"');
  });

  test("long description gets is-collapsed class and read-more button", () => {
    const html = renderEventDetailPage(longDescEvent, []);
    expect(html).toContain("is-collapsed");
    expect(html).toContain("edp-read-more");
    expect(html).toContain("Περισσότερα");
  });

  test("enriched badge renders for fullDescription events", () => {
    const html = renderEventDetailPage(longDescEvent, []);
    expect(html).toContain("edp-enriched-badge");
    expect(html).toContain("AI-enriched content");
  });

  test("no enriched badge for plain description events", () => {
    const html = renderEventDetailPage(shortDescEvent, []);
    expect(html).not.toContain("edp-enriched-badge");
  });

  test("hidden metadata HTML present for enriched events with info table", () => {
    const eventWithInfoTable: Event = {
      ...sampleConcert,
      fullDescription: `A rich narrative about this concert that spans many paragraphs and gives context.

| Info | Details |
|------|---------|
| **Date** | Saturday, November 15, 2025 |
| **Venue** | Half Note Jazz Club |
`,
    };
    const html = renderEventDetailPage(eventWithInfoTable, []);
    expect(html).toContain('class="sr-only"');
  });
});

describe("Event Detail Page — Venue section", () => {
  test("name, address, neighborhood all render", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain("edp-venue-section");
    expect(html).toContain(sampleConcert.venue.name);
    expect(html).toContain(sampleConcert.venue.address);
    expect(html).toContain(sampleConcert.venue.neighborhood!);
  });

  // S132: /neighborhoods/* hubs don't exist, so emitting hrefs to them produces 404s at scale.
  test("no anchor links to non-existent /neighborhoods/* hub", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).not.toContain('href="/neighborhoods/');
  });

  test("Maps link uses coordinates when available", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain("Άνοιγμα στον Χάρτη");
    expect(html).toContain(
      `https://www.google.com/maps?q=${sampleConcert.venue.coordinates!.lat},${sampleConcert.venue.coordinates!.lon}`
    );
  });

  test("Maps link falls back to name search when no coordinates", () => {
    const html = renderEventDetailPage(eventNoCoords, []);
    expect(html).toContain("Άνοιγμα στον Χάρτη");
    expect(html).toContain("google.com/maps/search/");
  });
});

describe("Event Detail Page — Source", () => {
  test("source renders as link when url exists", () => {
    const html = renderEventDetailPage(eventWithSourceUrl, []);
    expect(html).toContain("edp-source");
    expect(html).toContain(`href="${eventWithSourceUrl.url}"`);
    expect(html).toContain(eventWithSourceUrl.source);
  });

  test("source renders as text when no url", () => {
    const html = renderEventDetailPage(eventWithoutSourceUrl, []);
    expect(html).toContain("edp-source");
    expect(html).toContain(eventWithoutSourceUrl.source);
    expect(html).not.toContain('href="undefined"');
  });
});

describe("Event Detail Page — Mobile bar", () => {
  test("renders when ticketUrl exists (upcoming event)", () => {
    const upcomingWithTicket: Event = { ...sampleConcertWithTicket, startDate: futureStartDate };
    const html = renderEventDetailPage(upcomingWithTicket, []);
    expect(html).toContain("edp-mobile-bar");
  });

  test("not rendered when no ticketUrl", () => {
    const html = renderEventDetailPage(noTicketEvent, []);
    expect(html).not.toContain('class="edp-mobile-bar"');
  });

  test("contains title and price text (upcoming event)", () => {
    const upcomingWithTicket: Event = { ...sampleConcertWithTicket, startDate: futureStartDate };
    const html = renderEventDetailPage(upcomingWithTicket, []);
    expect(html).toContain("edp-mobile-bar-title");
    expect(html).toContain(sampleConcertWithTicket.title);
    expect(html).toContain("edp-mobile-bar-price");
  });
});

describe("Event Detail Page — Related events", () => {
  test("card grid present when relatedEvents non-empty", () => {
    const related = [sampleWorkshop, sampleTheaterPerformance];
    const html = renderEventDetailPage(sampleConcert, related);
    expect(html).toContain("edp-related");
    expect(html).toContain("card-grid");
  });

  test("cards use event-card class", () => {
    const related = [sampleWorkshop];
    const html = renderEventDetailPage(sampleConcert, related);
    expect(html).toContain('class="event-card"');
  });

  test("no related section when empty array", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).not.toContain("edp-related");
  });
});

describe("Event Detail Page — Schema.org / SEO", () => {
  test("JSON-LD in head", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@context": "https://schema.org"');
  });

  test("OG meta tags present", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url"');
    expect(html).toContain('property="og:image"');
  });

  test("canonical URL correct", () => {
    const slug = generateEventSlug(sampleConcert);
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain(`<link rel="canonical" href="https://agentathens.com/events/${slug}/"`);
  });

  test("uses SCHEMA_TYPE_MAP for itemtype", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain('itemtype="https://schema.org/MusicEvent"');
  });

  test("exhibition uses ExhibitionEvent schema type", () => {
    const html = renderEventDetailPage(sampleFreeExhibition, []);
    expect(html).toContain('itemtype="https://schema.org/ExhibitionEvent"');
  });
});

describe("renderRelatedEventCard", () => {
  test("produces event-card markup", () => {
    const card = renderRelatedEventCard(sampleConcert);
    expect(card).toContain('class="event-card"');
    expect(card).toContain('class="card-title"');
    expect(card).toContain(sampleConcert.title);
  });

  test("links to correct event detail page", () => {
    const slug = generateEventSlug(sampleConcert);
    const card = renderRelatedEventCard(sampleConcert);
    expect(card).toContain(`href="/events/${slug}/"`);
  });

  test("shows venue with neighborhood", () => {
    const card = renderRelatedEventCard(sampleConcert);
    expect(card).toContain(`${sampleConcert.venue.name} · Μετς`);
  });
});

describe("renderEventDetailScript", () => {
  test("contains read-more toggle logic", () => {
    const script = renderEventDetailScript();
    expect(script).toContain("edp-read-more");
    expect(script).toContain("is-collapsed");
  });

  test("contains IntersectionObserver for mobile bar", () => {
    const script = renderEventDetailScript();
    expect(script).toContain("IntersectionObserver");
    expect(script).toContain("edp-mobile-bar");
  });
});

describe("Event Detail Page — Past event lifecycle", () => {
  test('Past event shows "event passed" banner', () => {
    const pastEvent: Event = { ...sampleConcert, startDate: '2025-01-01T20:00:00+03:00' };
    const html = renderEventDetailPage(pastEvent, []);
    expect(html).toContain('event-passed-banner');
    expect(html).toContain('Αυτή η εκδήλωση έχει ολοκληρωθεί');
  });

  test('Upcoming event does NOT show banner', () => {
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString();
    const futureEvent: Event = { ...sampleConcert, startDate: futureDate };
    const html = renderEventDetailPage(futureEvent, []);
    expect(html).not.toContain('event-passed-banner');
  });

  test('Running exhibition does NOT show banner', () => {
    const runningExhibition: Event = {
      ...sampleFreeExhibition,
      startDate: new Date(Date.now() - 86400000 * 7).toISOString(),
      endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    };
    const html = renderEventDetailPage(runningExhibition, []);
    expect(html).not.toContain('event-passed-banner');
  });

  test('Past event has noindex meta', () => {
    const pastEvent: Event = { ...sampleConcert, startDate: '2025-01-01T20:00:00+03:00' };
    const html = renderEventDetailPage(pastEvent, []);
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  test('Upcoming event has no noindex meta', () => {
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString();
    const futureEvent: Event = { ...sampleConcert, startDate: futureDate };
    const html = renderEventDetailPage(futureEvent, []);
    expect(html).not.toContain('name="robots" content="noindex"');
  });

  test('Past event hides ticket CTA', () => {
    const pastEvent: Event = { ...sampleConcertWithTicket, startDate: '2025-01-01T20:00:00+03:00' };
    const html = renderEventDetailPage(pastEvent, []);
    expect(html).not.toContain('class="edp-cta edp-cta-hero');
  });

  test('Past event hides mobile sticky bar', () => {
    const pastEvent: Event = { ...sampleConcertWithTicket, startDate: '2025-01-01T20:00:00+03:00' };
    const html = renderEventDetailPage(pastEvent, []);
    expect(html).not.toContain('class="edp-mobile-bar"');
  });
});

describe("Event Detail Page — GEO source order", () => {
  test("practical block appears before description in HTML", () => {
    const html = renderEventDetailPage(longDescEvent, []);
    const practicalPos = html.indexOf('event-practical');
    const descriptionPos = html.indexOf('edp-description');
    expect(practicalPos).toBeGreaterThan(-1);
    expect(descriptionPos).toBeGreaterThan(-1);
    expect(practicalPos).toBeLessThan(descriptionPos);
  });

  test("description appears before venue section", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    const descPos = html.indexOf('edp-description');
    const venuePos = html.indexOf('edp-venue-section');
    expect(descPos).toBeLessThan(venuePos);
  });
});

describe("Event Detail Page — Inline CTA", () => {
  test("inline CTA rendered for upcoming event with ticket URL", () => {
    const upcomingWithTicket: Event = { ...sampleConcertWithTicket, startDate: futureStartDate };
    const html = renderEventDetailPage(upcomingWithTicket, []);
    expect(html).toContain('edp-inline-cta');
  });

  test("inline CTA hidden for past events", () => {
    const pastEvent: Event = { ...sampleConcertWithTicket, startDate: '2025-01-01T20:00:00+03:00' };
    const html = renderEventDetailPage(pastEvent, []);
    expect(html).not.toContain('edp-inline-cta');
  });

  test("open-entry events show 'Ελεύθερη είσοδος' text (not link)", () => {
    const html = renderEventDetailPage(openExhibition, []);
    expect(html).toContain('edp-open-entry');
    expect(html).toContain('Ελεύθερη είσοδος');
  });
});

describe("Event Detail Page — data-past attribute", () => {
  test("past event has data-past='true' on article", () => {
    const pastEvent: Event = { ...sampleConcert, startDate: '2025-01-01T20:00:00+03:00' };
    const html = renderEventDetailPage(pastEvent, []);
    expect(html).toContain('data-past="true"');
  });

  test("upcoming event has no data-past attribute", () => {
    const futureEvent: Event = { ...sampleConcert, startDate: futureStartDate };
    const html = renderEventDetailPage(futureEvent, []);
    expect(html).not.toContain('data-past=');
  });
});

describe("Event Detail Page — CTA uses accent-primary (not type color)", () => {
  test("hero CTA has no light-text modifier", () => {
    const upcomingWithTicket: Event = { ...sampleConcertWithTicket, startDate: futureStartDate };
    const html = renderEventDetailPage(upcomingWithTicket, []);
    expect(html).not.toContain('edp-cta--light-text');
  });
});

describe("Event Detail Page — No inline styles", () => {
  test("no <style> block in the page (all CSS in design-system.css)", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    // The only <style> allowed is from the practical-block (which has its own)
    // The event page itself should NOT add a <style> block
    const headSection = html.split('</head>')[0];
    expect(headSection).not.toContain('<style>');
  });
});

describe("Event Detail Page — Calendar (.ics) export button", () => {
  test("renders calendar button inside action bar", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain('class="edp-calendar-btn"');
    expect(html).toContain('data-calendar-event');
  });

  test("data-event-start carries ISO date with Athens offset", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain(`data-event-start="${sampleConcert.startDate}"`);
  });

  test("data-event-type carries valid event type", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain(`data-event-type="${sampleConcert.type}"`);
  });

  test("exhibition fixture produces non-empty data-event-end", () => {
    const html = renderEventDetailPage(openExhibition, []);
    // endDate is set on openExhibition fixture above
    expect(html).toMatch(/data-event-end="\d{4}-\d{2}-\d{2}T/);
  });

  test("event without endDate produces empty data-event-end", () => {
    const noEndEvent: Event = { ...sampleConcert, endDate: undefined };
    const html = renderEventDetailPage(noEndEvent, []);
    expect(html).toContain('data-event-end=""');
  });

  test("calendar script is appended to page", () => {
    const html = renderEventDetailPage(sampleConcert, []);
    expect(html).toContain('[data-calendar-event]');
    expect(html).toContain('BEGIN:VCALENDAR');
  });

  test("button has accessible label from i18n", () => {
    const html = renderEventDetailPage(sampleConcert, [], 'el');
    expect(html).toContain('aria-label="Ημερολόγιο"');
    const enHtml = renderEventDetailPage(sampleConcert, [], 'en');
    expect(enHtml).toContain('aria-label="Calendar"');
  });
});

// ─── Offers emission (Sprint 1 Session 3 — Strategist 2026-04-29) ─────

describe("Event Detail Page — offers emission", () => {
  // S139 stage 1: generateEventSchema now returns a @graph envelope. The
  // parse helper extracts the Event entity (member 0) and resolves @id
  // references inline so existing assertions on `schema.offers.seller` etc.
  // continue to work against the resolved entity properties.
  const parse = (event: Event, locale: 'el' | 'en' = 'el') =>
    parseEventFromEnvelope(generateEventSchema(event, locale));

  // Fixture A — past event (EventCompleted): NO offers key
  test("with-ticket past event: omits offers entirely", () => {
    const pastEvent: Event = {
      ...sampleConcertWithTicket,
      startDate: '2025-01-01T20:00:00+03:00',
      endDate: '2025-01-01T23:00:00+03:00',
    };
    const schema = parse(pastEvent);
    expect(schema.eventStatus).toBe('https://schema.org/EventCompleted');
    expect(schema.offers).toBeUndefined();
    expect(schema.isAccessibleForFree).toBe(false);
  });

  // Fixture B — listing_aggregator (athinorama.gr): S134 omits entire Offer
  // (Sprint 1 behavior was emit Offer-without-URL with venue seller; S134 changed
  // this per the 2026-05-11 Unclassifiable-Merchant decision.)
  test("with-ticket future event on listing_aggregator host: NO Offer block (S134)", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.athinorama.gr/music/gig/some-event-12345/',
      venue: {
        ...sampleConcertWithTicket.venue,
        website: 'https://halfnote.gr/',
      },
    };
    const schema = parse(event);
    expect(schema.offers).toBeUndefined();
    expect(schema.isAccessibleForFree).toBe(false);
  });

  // Fixture B variant — venue lacks website: still no Offer
  test("with-ticket on listing_aggregator with venue lacking website: NO Offer block (S134)", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.athinorama.gr/x/y/',
      venue: {
        ...sampleConcertWithTicket.venue,
        website: undefined,
      },
    };
    const schema = parse(event);
    expect(schema.offers).toBeUndefined();
    expect(schema.isAccessibleForFree).toBe(false);
  });

  // Fixture C — known_merchant (more.com): offers.url + Organization seller from host
  test("with-ticket future event on known_merchant host: emits offers.url + Organization seller derived from host", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.more.com/gr-el/music/some-event/',
    };
    const schema = parse(event);
    expect(schema.offers).toBeDefined();
    expect(schema.offers.url).toBe('https://www.more.com/gr-el/music/some-event/');
    expect(schema.offers.availability).toBe('https://schema.org/InStock');
    expect(schema.offers.priceCurrency).toBe('EUR');
    expect(schema.offers.seller).toEqual({
      '@type': 'Organization',
      name: 'More.com',
      url: 'https://more.com/',
    });
  });

  // Venue-direct-only host (halfnote.gr): omits offers.url, venue is seller
  test("with-ticket on venue_direct_only host: omits offers.url, venue is seller", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.halfnote.gr/en/calendar/',
      venue: {
        ...sampleConcertWithTicket.venue,
        website: 'https://halfnote.gr/',
      },
    };
    const schema = parse(event);
    expect(schema.offers.url).toBeUndefined();
    expect(schema.offers.seller.name).toBe(event.venue.name);
  });

  // venue_direct_only seller emits scalar 'Organization' (S134 simplification
  // from Sprint 1's dual-type ['Place', 'Organization']). Strategist's verbatim
  // 2026-05-11 contract used scalar; S134 aligns. Dual-type was a Sprint 1
  // acknowledged-interim detail not preserved in the consolidated rewrite.
  test("venue_direct_only host: seller is scalar 'Organization' (S134 simplification)", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.benaki.org/event/123/',
      venue: {
        ...sampleConcertWithTicket.venue,
        website: 'https://www.benaki.org/',
      },
    };
    const schema = parse(event);
    expect(schema.offers.seller['@type']).toBe('Organization');
    expect(schema.offers.seller.name).toBe(event.venue.name);
    expect(schema.offers.seller.url).toBe('https://www.benaki.org/');
    expect(schema.offers.url).toBeUndefined();
  });

  // Regression-guard: listing_aggregator omits entire Offer in S134 (Sprint 1
  // emitted a scalar-Organization Offer-without-URL; S134 omits the block).
  test("listing_aggregator host: NO Offer block (S134 omission)", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.athinorama.gr/x/y/',
    };
    const schema = parse(event);
    expect(schema.offers).toBeUndefined();
  });

  // Fixture D — unclassified host: S134 omits Offer (Sprint 1 emitted with warn).
  test("with-ticket on unclassified host: NO Offer block + no warn (S134)", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      const event: Event = {
        ...sampleConcertWithTicket,
        startDate: futureStartDate,
        ticketUrl: 'https://example-not-in-config.com/event/123',
      };
      const schema = parse(event);
      expect(schema.offers).toBeUndefined();
      // S134 no longer emits the per-event warning (omission is the intentional path).
      expect(warnings.some(w => w.includes('[offers.url] unclassified'))).toBe(false);
    } finally {
      console.warn = originalWarn;
    }
  });

  // Free events: venue-as-seller per Strategist Q3 Option D (venue is the responsible
  // Organization when there's no merchant). 61 free events post-S3-checkpoint had
  // no seller; this test guards against regression.
  test("free (open) event: venue is the seller (Strategist Q3 Option D principle)", () => {
    const event: Event = {
      ...sampleFreeExhibition,
      startDate: futureStartDate,
      endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      venue: {
        ...sampleFreeExhibition.venue,
        website: 'https://example-venue.gr/',
      },
    };
    const schema = parse(event);
    expect(schema.offers).toBeDefined();
    expect(schema.offers.price).toBe('0');
    expect(schema.offers.url).toMatch(/^https:\/\/agentathens\.com\/events\//);
    expect(schema.offers.seller).toEqual({
      '@type': 'Organization',
      name: event.venue.name,
      url: 'https://example-venue.gr/',
    });
  });

  test("free event without venue website: seller has name only", () => {
    const event: Event = {
      ...sampleFreeExhibition,
      startDate: futureStartDate,
      endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      venue: {
        ...sampleFreeExhibition.venue,
        website: undefined,
      },
    };
    const schema = parse(event);
    expect(schema.offers.seller).toEqual({
      '@type': 'Organization',
      name: event.venue.name,
    });
    expect(schema.offers.seller.url).toBeUndefined();
  });

  // validFrom remains absent (S1 + S3 sanity)
  test("validFrom is never emitted in any offers block", () => {
    const futureWithTicket: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.more.com/x/',
    };
    const schema = parse(futureWithTicket);
    expect(schema.offers?.validFrom).toBeUndefined();
  });

  // ticket_url_resolved fallback (pre-Sprint-2 hygiene, 2026-05-02 forward-looking spec).
  // Resolver populates ticketUrlResolved nightly; emitter prefers it over ticketUrl
  // and feeds the *resolved* URL into classifySource.

  test("offers.url uses ticketUrlResolved when populated and resolved host is known_merchant", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.athinorama.gr/event/x/',  // listing_aggregator
      ticketUrlResolved: 'https://www.viva.gr/tickets/event-y/',  // known_merchant
    };
    const schema = parse(event);
    expect(schema.offers.url).toBe('https://www.viva.gr/tickets/event-y/');
  });

  test("offers.url falls back to ticketUrl when ticketUrlResolved is null and host is known_merchant", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.viva.gr/tickets/event-x/',
      ticketUrlResolved: null,
    };
    const schema = parse(event);
    expect(schema.offers.url).toBe('https://www.viva.gr/tickets/event-x/');
  });

  test("ticketUrlResolved null + ticketUrl listing_aggregator: NO Offer block (S134)", () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.athinorama.gr/event/x/',
      ticketUrlResolved: null,
    };
    const schema = parse(event);
    expect(schema.offers).toBeUndefined();
  });
});

// ─── @graph envelope contract (S139 stage 1) ──────────────────────────
// Replaces the prior buildEventSchemaObject/generateEventSchema equivalence
// suite. Post-S139, the two functions intentionally diverge: buildEventSchemaObject
// returns the flat Event entity (preserved contract — DataFeed and the flat
// schema validator continue to consume it directly) while generateEventSchema
// wraps that entity into a single @graph envelope for HTML emission.
//
// Per S138 Section 4.2: tests assert on entity properties, NOT on @graph shape.
describe("Event schema — @graph envelope contract (S139)", () => {
  const fixtures: ReadonlyArray<readonly [string, Event, 'el' | 'en']> = [
    ['concert (el)', sampleConcert, 'el'],
    ['concert (en)', sampleConcert, 'en'],
    ['with-ticket concert', sampleConcertWithTicket, 'el'],
    ['free exhibition', sampleFreeExhibition, 'el'],
    ['theater performance', sampleTheaterPerformance, 'el'],
    ['workshop', sampleWorkshop, 'el'],
  ];

  for (const [label, event, locale] of fixtures) {
    test(`generateEventSchema emits a single @graph envelope for ${label}`, () => {
      const envelope = JSON.parse(generateEventSchema(event, locale));
      expect(envelope['@context']).toBe('https://schema.org');
      expect(Array.isArray(envelope['@graph'])).toBe(true);
      expect(envelope['@graph'].length).toBeGreaterThanOrEqual(2);
    });

    test(`Event entity is first @graph member with @id and no @context for ${label}`, () => {
      const envelope = JSON.parse(generateEventSchema(event, locale));
      const eventEntity = envelope['@graph'][0];
      const flatEvent = buildEventSchemaObject(event, locale);
      expect(eventEntity['@type']).toBe(flatEvent['@type']);
      expect(eventEntity.name).toBe(flatEvent.name);
      expect(eventEntity.startDate).toBe(flatEvent.startDate);
      expect(eventEntity['@id']).toBe(`${BASE_URL}/events/${generateEventSlug(event)}/#event`);
      // @context lives at the envelope root, not on inner members.
      expect(eventEntity['@context']).toBeUndefined();
    });

    test(`site-publisher Organization is last @graph member for ${label}`, () => {
      const envelope = JSON.parse(generateEventSchema(event, locale));
      const graph = envelope['@graph'];
      const last = graph[graph.length - 1];
      expect(last['@type']).toBe('Organization');
      expect(last['@id']).toBe(`${BASE_URL}/#organization`);
    });
  }

  test('venue is materialized as a separate @graph member with @id reference from Event.location when venue has address', () => {
    const envelope = JSON.parse(generateEventSchema(sampleConcert, 'el'));
    const eventEntity = envelope['@graph'][0];
    expect(eventEntity.location['@id']).toMatch(/^https:\/\/agentathens\.com\/venues\/.+\/#venue$/);
    const venueEntity = findEntity(envelope, '@id', eventEntity.location['@id']);
    expect(venueEntity).toBeDefined();
    expect(venueEntity.name).toBe(sampleConcert.venue.name);
    expect(venueEntity.address).toBeDefined();
  });

  test('seller Organization is a separate @graph member with @id when seller URL host is parseable', () => {
    const event: Event = {
      ...sampleConcertWithTicket,
      startDate: futureStartDate,
      ticketUrl: 'https://www.more.com/gr-el/music/x/',
    };
    const envelope = JSON.parse(generateEventSchema(event, 'el'));
    const eventEntity = envelope['@graph'][0];
    expect(eventEntity.offers.seller['@id']).toBe('https://more.com/#organization');
    const sellerOrg = findEntity(envelope, '@id', 'https://more.com/#organization');
    expect(sellerOrg).toBeDefined();
    expect(sellerOrg['@type']).toBe('Organization');
    expect(sellerOrg.name).toBe('More.com');
    expect(sellerOrg.url).toBe('https://more.com/');
  });

  test('buildEventSchemaObject still returns the flat Event entity (DataFeed contract preserved)', () => {
    const flat = buildEventSchemaObject(sampleConcert);
    expect(flat['@context']).toBe('https://schema.org');
    expect(flat['@graph']).toBeUndefined();
    expect(flat['@type']).toBeDefined();
    expect(flat.location.name).toBe(sampleConcert.venue.name);
  });
});

// =====================================================================
// S134 — classifier-gated Offer emission integration tests
// =====================================================================

describe("Event Detail Page — S134 classifier-gated Offer emission", () => {
  const upcomingDate = new Date(Date.now() + 86400000 * 14).toISOString();

  test("with-ticket + known-merchant ticketUrl → Offer block with merchant seller", () => {
    const event: Event = {
      ...sampleConcert,
      startDate: upcomingDate,
      price: { type: "with-ticket", amount: 15, currency: "EUR" },
      ticketUrl: "https://www.viva.gr/tickets/foo",
      ticketUrlResolved: null,
    };
    const schema = buildEventSchemaObject(event);
    expect(schema.offers).toBeDefined();
    expect(schema.offers["@type"]).toBe("Offer");
    expect(schema.offers.seller).toEqual(
      expect.objectContaining({
        "@type": "Organization",
        name: "Viva.gr",
        url: "https://viva.gr/",
      }),
    );
    expect(schema.offers.url).toBe("https://www.viva.gr/tickets/foo");
    expect(schema.isAccessibleForFree).toBe(false);
  });

  test("with-ticket + listing-aggregator ticketUrl → NO Offer block; isAccessibleForFree:false preserved", () => {
    const event: Event = {
      ...sampleConcert,
      startDate: upcomingDate,
      price: { type: "with-ticket", amount: 15, currency: "EUR" },
      ticketUrl: "https://www.athinorama.gr/music/gig/abc/",
      ticketUrlResolved: null,
    };
    const schema = buildEventSchemaObject(event);
    expect(schema.offers).toBeUndefined();
    expect(schema.isAccessibleForFree).toBe(false);
  });

  test("with-ticket + unclassified ticketUrl → NO Offer block (S134 change from Sprint 1 emit-as-is behavior)", () => {
    const event: Event = {
      ...sampleConcert,
      startDate: upcomingDate,
      price: { type: "with-ticket", amount: 15, currency: "EUR" },
      ticketUrl: "https://unknown-host-not-in-config.example/x",
      ticketUrlResolved: null,
    };
    const schema = buildEventSchemaObject(event);
    expect(schema.offers).toBeUndefined();
    expect(schema.isAccessibleForFree).toBe(false);
  });

  test("with-ticket + EventCompleted → no Offer (precedent preserved)", () => {
    const pastDate = new Date(Date.now() - 86400000 * 5).toISOString();
    const event: Event = {
      ...sampleConcert,
      startDate: pastDate,
      endDate: new Date(Date.now() - 86400000 * 5 + 3600000).toISOString(),
      price: { type: "with-ticket", amount: 15, currency: "EUR" },
      ticketUrl: "https://www.viva.gr/tickets/foo",
    };
    const schema = buildEventSchemaObject(event);
    expect(schema.offers).toBeUndefined();
  });

  test("with-ticket + venue_direct_only → Offer with venue seller, no offers.url", () => {
    const event: Event = {
      ...sampleConcert,
      startDate: upcomingDate,
      price: { type: "with-ticket", amount: 15, currency: "EUR" },
      ticketUrl: "https://www.halfnote.gr/en/calendar/",
      ticketUrlResolved: null,
      venue: { ...sampleConcert.venue, name: "Half Note Jazz Club", website: "https://halfnote.gr/" },
    };
    const schema = buildEventSchemaObject(event);
    expect(schema.offers).toBeDefined();
    expect(schema.offers.seller.name).toBe("Half Note Jazz Club");
    expect(schema.offers.url).toBeUndefined();
  });

  test("open event → Offer with venue seller, price 0, self-canonical URL (unchanged)", () => {
    const futureOpenExhibition: Event = {
      ...sampleFreeExhibition,
      startDate: upcomingDate,
      endDate: new Date(Date.now() + 86400000 * 60).toISOString(),
    };
    const schema = buildEventSchemaObject(futureOpenExhibition);
    expect(schema.offers).toBeDefined();
    expect(schema.offers.price).toBe("0");
    expect(schema.isAccessibleForFree).toBe(true);
    expect(schema.offers.seller.name).toBe(futureOpenExhibition.venue.name);
  });

  test("ticketUrlResolved precedence: aggregator raw + merchant resolved → emit with merchant", () => {
    const event: Event = {
      ...sampleConcert,
      startDate: upcomingDate,
      price: { type: "with-ticket", amount: 15, currency: "EUR" },
      ticketUrl: "https://www.athinorama.gr/x",
      ticketUrlResolved: "https://www.viva.gr/y",
    };
    const schema = buildEventSchemaObject(event);
    expect(schema.offers).toBeDefined();
    expect(schema.offers.url).toBe("https://www.viva.gr/y");
    expect(schema.offers.seller.name).toBe("Viva.gr");
  });
});
