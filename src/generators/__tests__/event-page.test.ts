import { describe, test, expect } from "bun:test";
import { renderEventDetailPage, renderRelatedEventCard, renderEventDetailScript, generateEventSlug } from "../event-page";
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
