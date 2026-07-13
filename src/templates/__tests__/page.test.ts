// Template tests for page rendering and Schema.org markup
import { describe, test, expect } from "bun:test";
import { renderPage } from "../page";
import { sampleConcert, sampleFreeExhibition, getTodayEvent, getTomorrowEvent } from "../../../tests/fixtures/events";
import type { PageMetadata, Event } from "../../types";

describe("renderPage", () => {
  const sampleMetadata: PageMetadata = {
    title: "Jazz Concerts in Athens",
    description: "Discover live jazz concerts happening in Athens this week",
    keywords: "jazz, concerts, athens, live music, greece",
    url: "jazz-concert-this-week",
    eventCount: 2,
    lastUpdate: "2025-11-01T10:00:00Z",
    filters: {
      type: "concert",
      time: "this-week"
    }
  };

  test("should render valid HTML document", () => {
    const html = renderPage(sampleMetadata, [sampleConcert, sampleFreeExhibition]);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"el\">"); // Greek language
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
  });

  test("should include SEO meta tags", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    // Title
    expect(html).toContain("<title>Jazz Concerts in Athens | agent-athens</title>");

    // Description
    expect(html).toContain('name="description" content="Discover live jazz concerts happening in Athens this week"');

    // Keywords (now bilingual with Greek)
    expect(html).toContain('name="keywords" content="jazz, concerts, athens, live music, greece, Αθήνα, Athens, εκδηλώσεις, events, πολιτισμός, culture"');

    // Canonical URL
    expect(html).toContain('rel="canonical" href="https://agentathens.com/jazz-concert-this-week"');
  });

  test("should include GEO meta tags", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    // Location
    expect(html).toContain('name="geo.region" content="GR-I"');
    expect(html).toContain('name="geo.placename" content="Athens"');
    expect(html).toContain('name="geo.position" content="37.9838;23.7276"');

    // Author
    expect(html).toContain('name="author" content="agent-athens"');

    // Freshness
    expect(html).toContain('name="last-modified"');
  });

  test("should include OpenGraph meta tags", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('property="og:title" content="Jazz Concerts in Athens"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url" content="https://agentathens.com/jazz-concert-this-week"');
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('property="og:locale" content="el_GR"'); // Greek locale
    expect(html).toContain('property="og:site_name" content="agent-athens"');
  });

  // Bug surfaced via D11 sweep 2026-05-12: English hub pages emitted og:url
  // without the /en/ locale prefix while canonical was post-fixed in the hub
  // generator. JSON-LD CollectionPage.url had the same defect. 2026-05-14:
  // GEO Strategist's canonical-to-root decision for Case B partial-coverage
  // state — /en/ pages canonicalize to root counterparts (consolidation move).
  // inLanguage stays locale-correct (page language declaration, separate from
  // canonical SEO posture).
  test("og:url, canonical, and JSON-LD CollectionPage.url all canonicalize to root when locale='en'", () => {
    const html = renderPage(sampleMetadata, [sampleConcert], undefined, undefined, 'en');

    expect(html).toContain('rel="canonical" href="https://agentathens.com/jazz-concert-this-week"');
    expect(html).toContain('property="og:url" content="https://agentathens.com/jazz-concert-this-week"');

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    expect(jsonLdMatch).toBeTruthy();
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;
    expect(jsonLd.url).toBe("https://agentathens.com/jazz-concert-this-week");
    expect(jsonLd.inLanguage).toBe("en");
  });

  test("should include Schema.org JSON-LD", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@context": "https://schema.org"');
    expect(html).toContain('"@type": "CollectionPage"');
  });

  test("should render event count correctly", () => {
    const html = renderPage(sampleMetadata, [sampleConcert, sampleFreeExhibition]);

    // Event count appears in og:description
    expect(html).toContain('content="2 εκδηλώσεις στην Αθήνα"');
  });

  test("should render singular event count", () => {
    const singleEventMetadata = { ...sampleMetadata, eventCount: 1 };
    const html = renderPage(singleEventMetadata, [sampleConcert]);

    // Event count appears in og:description
    expect(html).toContain('content="1 εκδηλώσεις στην Αθήνα"');
  });

  test("should render event grid when events exist", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('class="card-grid"');
    // Post-microdata-strip: card-grid is no longer itemscope'd.
    // JSON-LD ItemList in <script type="application/ld+json"> is authoritative.
    expect(html).not.toContain('itemscope itemtype="https://schema.org/ItemList"');
  });

  test("should render empty state when no events", () => {
    const noEventsMetadata = { ...sampleMetadata, eventCount: 0 };
    const html = renderPage(noEventsMetadata, []);

    // Empty state is now in Greek
    expect(html).toContain("Δεν βρέθηκαν εκδηλώσεις");
    expect(html).toContain("Ελέγξτε ξανά αύριο");
    expect(html).toContain("ενημερώνεται καθημερινά");
  });

  test("should render related pages section", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('class="related-pages"');
    expect(html).toContain("Σχετικές Σελίδες"); // Greek: Related Pages
  });

  test("should include site footer with AI agent callout", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('class="site-footer"');
    expect(html).toContain("Για AI Agents");
    expect(html).toContain("agentathens.com");
    expect(html).toContain("/llms.txt");
  });

  test("should include JSON API alternate link", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('rel="alternate" type="application/json" href="/api/jazz-concert-this-week.json"');
  });

  // Sprint 2 Component A — DataFeed alternate-link is homepage-only
  test("homepage (url='index') includes Schema.org DataFeed alternate-link", () => {
    const homepageMetadata: PageMetadata = { ...sampleMetadata, url: "index" };
    const html = renderPage(homepageMetadata, [sampleConcert]);

    expect(html).toContain('rel="alternate" type="application/ld+json" href="/api/events.json"');
  });

  test("non-homepage (e.g. url='today') does NOT include DataFeed alternate-link", () => {
    const hubMetadata: PageMetadata = { ...sampleMetadata, url: "today" };
    const html = renderPage(hubMetadata, [sampleConcert]);

    expect(html).not.toContain('href="/api/events.json"');
  });

  test("renders site nav header", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('class="site-header"');
    expect(html).toContain('class="site-logo"');
    expect(html).toContain("agent athens");
  });

  test("renders site footer with grid", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('class="site-footer"');
    expect(html).toContain('class="footer-grid"');
  });

  test("nav does not contain removed language toggle", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).not.toContain('class="lang-toggle"');
  });

  test("renders hamburger menu markup", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('class="mobile-menu"');
    expect(html).toContain('class="hamburger-btn"');
  });

  test("should render all event cards", () => {
    const html = renderPage(sampleMetadata, [sampleConcert, sampleFreeExhibition]);

    // Should contain both event titles
    expect(html).toContain(sampleConcert.title);
    expect(html).toContain(sampleFreeExhibition.title);

    // Should contain both venues
    expect(html).toContain(sampleConcert.venue.name);
    expect(html).toContain(sampleFreeExhibition.venue.name);
  });

  test("should include CSS styling", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain("design-system.css");
  });

  test("should set proper viewport meta", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  });

  test("should set proper charset", () => {
    const html = renderPage(sampleMetadata, [sampleConcert]);

    expect(html).toContain('<meta charset="UTF-8">');
  });
});

describe("renderEventCard (via renderPage)", () => {
  const metadata: PageMetadata = {
    title: "Test",
    description: "Test",
    keywords: "test",
    url: "test",
    eventCount: 1,
    lastUpdate: "2025-11-01T10:00:00Z",
    filters: {}
  };

  test("should render event card with title", () => {
    const eventWithFullDesc = {
      ...sampleConcert,
      fullDescription: "This is a very long description that would be AI-generated. ".repeat(10)
    };

    const html = renderPage(metadata, [eventWithFullDesc]);

    // Card uses new compact structure — title in card-title class
    expect(html).toContain('class="card-title"');
    expect(html).toContain(sampleConcert.title);
  });

  test("should render event card without description (compact card)", () => {
    const eventWithoutFullDesc = {
      ...sampleConcert,
      fullDescription: undefined
    };

    const html = renderPage(metadata, [eventWithoutFullDesc]);

    // Compact card has card-title, no full descriptions on browse page
    expect(html).toContain('class="card-title"');
    expect(html).not.toContain('class="event-full-description"');
    expect(html).not.toContain('class="event-short-description"');
  });

  test("should render card linking to internal event detail page", () => {
    const html = renderPage(metadata, [sampleConcert]);

    // Card links to internal /events/ page, not external URL
    expect(html).toContain('href="/events/');
    expect(html).toContain('class="event-card"');
    expect(html).not.toContain('target="_blank"');
  });

  test("should render open event price correctly", () => {
    const html = renderPage(metadata, [sampleFreeExhibition]);

    expect(html).toContain('class="card-price"');
    expect(html).toContain("Ελεύθερη είσοδος");
  });

  test("should render ticketed event price with amount", () => {
    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('class="card-price"');
    expect(html).toContain(`€${sampleConcert.price.amount}`);
  });

  test("should render event date and time", () => {
    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('<time');
    expect(html).toContain(`datetime="${sampleConcert.startDate}"`);
    expect(html).not.toContain('itemprop="startDate"');
  });

  test("should render venue with visible markup (no microdata post-strip)", () => {
    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('class="card-venue"');
    // Visible venue text intact with Greek neighborhood via displayNeighborhood()
    expect(html).toContain(`${sampleConcert.venue.name} · Μετς`);
    expect(html).not.toContain('itemprop="location"');
    expect(html).not.toContain('itemscope itemtype="https://schema.org/Place"');
    expect(html).not.toContain('itemprop="name"');
  });

  test("should render venue neighborhood if present", () => {
    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain(sampleConcert.venue.neighborhood!);
  });

  test("should render event type badge with Greek label", () => {
    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('class="card-badge"');
    expect(html).toContain("ΣΥΝΑΥΛΙΑ"); // Greek uppercase for "concert"
  });

  test("should render visible price (no microdata Offer markup post-strip)", () => {
    // Use a future-dated event: per S101a-B, past events legitimately
    // omit the Offer block via availabilityForEventStatus omit_offer.
    const futureEvent = getTomorrowEvent();
    const html = renderPage(metadata, [futureEvent]);

    expect(html).toContain('class="card-price"');
    expect(html).toContain(`€${futureEvent.price.amount}`);
    expect(html).not.toContain('itemprop="offers"');
    expect(html).not.toContain('itemscope itemtype="https://schema.org/Offer"');
    expect(html).not.toContain('itemprop="price"');
    expect(html).not.toContain('itemprop="priceCurrency"');
  });

  test("article element has no Schema.org itemtype post-strip", () => {
    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('class="event-card"');
    expect(html).not.toContain(`itemtype="https://schema.org/${sampleConcert['@type']}"`);
    expect(html).not.toContain('itemscope itemtype');
  });

  test("event status carried by JSON-LD only (no microdata meta post-strip)", () => {
    const html = renderPage(metadata, [sampleConcert]);

    expect(html).not.toContain('itemprop="eventStatus"');
    // Status still emitted in JSON-LD itemListElement[].item.eventStatus.
    expect(html).toMatch(/https:\/\/schema\.org\/Event(Scheduled|Completed)/);
  });

  test("renders date group headers", () => {
    const metadata2: PageMetadata = {
      title: "Test",
      description: "Test",
      keywords: "test",
      url: "test",
      eventCount: 2,
      lastUpdate: "2025-11-01T10:00:00Z",
      filters: {}
    };

    const html = renderPage(metadata2, [sampleConcert, sampleFreeExhibition]);

    // Events on different dates produce date-group-header elements
    expect(html).toContain('class="date-group-header"');
  });

  test("card links to internal event detail page", () => {
    const html = renderPage(metadata, [sampleConcert]);

    // All card links point to /events/ prefix
    expect(html).toContain('href="/events/');
    expect(html).toContain('class="event-card"');
  });

  test("renders event type badge with color variable", () => {
    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('style="background: var(--color-concert)"');
    expect(html).toContain('class="card-badge"');
  });
});

describe("Schema.org JSON-LD generation (via renderPage)", () => {
  const metadata: PageMetadata = {
    title: "Test Events",
    description: "Test description",
    keywords: "test",
    url: "test",
    eventCount: 2,
    lastUpdate: "2025-11-01T10:00:00Z",
    filters: {}
  };

  test("should generate valid JSON-LD", () => {
    const html = renderPage(metadata, [sampleConcert]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    expect(jsonLdMatch).toBeTruthy();

    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;
    expect(jsonLd["@context"]).toBe("https://schema.org");
  });

  test("should set CollectionPage as @type", () => {
    const html = renderPage(metadata, [sampleConcert]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    expect(jsonLd["@type"]).toBe("CollectionPage");
  });

  test("should include page metadata", () => {
    const html = renderPage(metadata, [sampleConcert]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    expect(jsonLd.name).toContain("Test Events");
    expect(jsonLd.description).toBeTruthy();
    expect(jsonLd.url).toBe("https://agentathens.com/test");
    expect(jsonLd.inLanguage).toBe("el"); // Greek language
  });

  test("should include Athens location in 'about'", () => {
    const html = renderPage(metadata, [sampleConcert]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    expect(jsonLd.about).toBeDefined();
    expect(jsonLd.about["@type"]).toBe("Place");
    expect(jsonLd.about.name).toBe("Athens");
    expect(jsonLd.about.address.addressCountry).toBe("GR");
    expect(jsonLd.about.address.addressLocality).toBe("Athens");
  });

  test("should include ItemList with events", () => {
    const html = renderPage(metadata, [sampleConcert, sampleFreeExhibition]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    expect(jsonLd.mainEntity).toBeDefined();
    expect(jsonLd.mainEntity["@type"]).toBe("ItemList");
    expect(jsonLd.mainEntity.numberOfItems).toBe(2);
    expect(jsonLd.mainEntity.itemListElement).toHaveLength(2);
  });

  test("should include event details in itemListElement", () => {
    const html = renderPage(metadata, [sampleConcert]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    const firstEvent = jsonLd.mainEntity.itemListElement[0];

    expect(firstEvent["@type"]).toBe("ListItem");
    expect(firstEvent.position).toBe(1);
    expect(firstEvent.item["@type"]).toBe(sampleConcert["@type"]);
    expect(firstEvent.item.name).toBe(sampleConcert.title);
    expect(firstEvent.item.startDate).toBe(sampleConcert.startDate);
  });

  test("should include venue information in Schema.org", () => {
    const html = renderPage(metadata, [sampleConcert]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    const firstEvent = jsonLd.mainEntity.itemListElement[0].item;

    expect(firstEvent.location).toBeDefined();
    // Venue type is derived from VENUE_TYPE_MAP (e.g. MusicEvent → MusicVenue)
    expect(firstEvent.location["@type"]).toBe("MusicVenue");
    expect(firstEvent.location.name).toBe(sampleConcert.venue.name);
    // Address is now a PostalAddress object
    expect(firstEvent.location.address["@type"]).toBe("PostalAddress");
    // Phase-2 B4 (2026-07-08): config-first — Half Note is whitelisted, so the
    // curated config address is emitted, not the fixture's scraped variant.
    expect(firstEvent.location.address.streetAddress).toBe("17 Trivonianou Street, Athens 116 36");
  });

  test("should include offer/price information", () => {
    // Use future-dated event: per S101a-B, past events emit no offers block.
    const futureEvent = getTomorrowEvent();
    const html = renderPage(metadata, [futureEvent]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    const firstEvent = jsonLd.mainEntity.itemListElement[0].item;

    expect(firstEvent.offers).toBeDefined();
    expect(firstEvent.offers["@type"]).toBe("Offer");
    expect(firstEvent.offers.price).toBe(futureEvent.price.amount!.toString());
    expect(firstEvent.offers.priceCurrency).toBe("EUR");
    expect(firstEvent.isAccessibleForFree).toBe(false);
  });

  test("should handle free events with price 0", () => {
    // Future-dated free event: past free events also omit offers per S101a-B.
    const futureFreeEvent: Event = {
      ...getTomorrowEvent(),
      price: { type: 'open' },
    };
    const html = renderPage(metadata, [futureFreeEvent]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    const firstEvent = jsonLd.mainEntity.itemListElement[0].item;

    expect(firstEvent.offers.price).toBe("0");
    expect(firstEvent.isAccessibleForFree).toBe(true);
  });

  test("should include publication dates", () => {
    const html = renderPage(metadata, [sampleConcert]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;

    expect(jsonLd.datePublished).toBe(metadata.lastUpdate);
    expect(jsonLd.dateModified).toBe(metadata.lastUpdate);
  });
});

describe("Related pages rendering (via renderPage)", () => {
  test("should render related links for type filter", () => {
    const metadata: PageMetadata = {
      title: "Test",
      description: "Test",
      keywords: "test",
      url: "test",
      eventCount: 1,
      lastUpdate: "2025-11-01T10:00:00Z",
      filters: { type: "concert", time: "this-week" }
    };

    const html = renderPage(metadata, [sampleConcert]);

    // Related links use Greek text and new URL terminology
    expect(html).toContain('href="/concert">');
    expect(html).toContain('href="/open-concert">');
  });

  test("should render 'This week' link when not already filtered by week", () => {
    const metadata: PageMetadata = {
      title: "Test",
      description: "Test",
      keywords: "test",
      url: "test",
      eventCount: 1,
      lastUpdate: "2025-11-01T10:00:00Z",
      filters: { time: "today" }
    };

    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('href="/this-week">Εκδηλώσεις αυτής της εβδομάδας</a>');
  });

  test("should not render 'This week' link when already filtered by week", () => {
    const metadata: PageMetadata = {
      title: "Test",
      description: "Test",
      keywords: "test",
      url: "test",
      eventCount: 1,
      lastUpdate: "2025-11-01T10:00:00Z",
      filters: { time: "this-week" }
    };

    const html = renderPage(metadata, [sampleConcert]);

    expect(html).not.toContain('href="/this-week">Εκδηλώσεις αυτής της εβδομάδας</a>');
  });

  test("should render 'Open events' link when not filtered by price", () => {
    const metadata: PageMetadata = {
      title: "Test",
      description: "Test",
      keywords: "test",
      url: "test",
      eventCount: 1,
      lastUpdate: "2025-11-01T10:00:00Z",
      filters: {}
    };

    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('href="/open">Ελεύθερη είσοδος εκδηλώσεις</a>');
  });

  test("should always include 'All events' link", () => {
    const metadata: PageMetadata = {
      title: "Test",
      description: "Test",
      keywords: "test",
      url: "test",
      eventCount: 1,
      lastUpdate: "2025-11-01T10:00:00Z",
      filters: {}
    };

    const html = renderPage(metadata, [sampleConcert]);

    expect(html).toContain('href="/">Όλες οι εκδηλώσεις</a>');
  });
});

describe("Site chrome accessibility (via renderPage)", () => {
  const metadata: PageMetadata = {
    title: "Test",
    description: "Test",
    keywords: "test",
    url: "test",
    eventCount: 1,
    lastUpdate: "2025-11-01T10:00:00Z",
    filters: {}
  };

  test("skip-link is present", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('class="skip-link"');
  });

  test("skip-link targets main-content", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('href="#main-content"');
  });

  test("skip-link has Greek text", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain("Μετάβαση στο περιεχόμενο");
  });

  test("main content has id", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('id="main-content"');
  });

  test("main content has tabindex for skip-link focus", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('tabindex="-1"');
  });

  test("header has role=banner", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('role="banner"');
  });

  test("footer has role=contentinfo", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('role="contentinfo"');
  });

  test("footer has E-E-A-T links", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('href="/about/"');
    expect(html).toContain('href="/editorial/"');
    expect(html).toContain('href="/corrections/"');
  });

  test("search button has aria-label", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('aria-label="Αναζήτηση"');
  });

  test("hamburger has aria-expanded", () => {
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('aria-expanded="false"');
  });
});

// ── Hub JSON-LD Offer.availability — post-microdata-strip ───────────────
//
// Microdata price/availability tests retired with the strip (2026-05-25).
// The remaining JSON-LD invariant: Offer.availability uses
// availabilityForEventStatus(), not hardcoded InStock — past events omit
// the offers block, future events get availability from the helper.
describe("Hub JSON-LD Offer.availability via availabilityForEventStatus", () => {
  const metadata: PageMetadata = {
    title: "Test", description: "Test", keywords: "test",
    url: "test", eventCount: 1, lastUpdate: "2025-11-01T10:00:00Z", filters: {}
  };

  test("past event omits offers block; future event carries availability from helper", () => {
    // Past event in hub JSON-LD: per helper, omit_offer kicks in → no offers block
    const html = renderPage(metadata, [sampleConcert]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;
    const firstItem = jsonLd.mainEntity.itemListElement[0].item;

    // Past event → no offers block at all (helper returned omit_offer)
    expect(firstItem.offers).toBeUndefined();

    // Future event → offers present with availability emitted by helper
    const futureHtml = renderPage(metadata, [getTomorrowEvent()]);
    const futureMatch = futureHtml.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    const futureParsed = JSON.parse(futureMatch![1]);
    const futureJsonLd = futureParsed['@graph'] ? futureParsed['@graph'][0] : futureParsed;
    const futureItem = futureJsonLd.mainEntity.itemListElement[0].item;

    expect(futureItem.offers).toBeDefined();
    expect(futureItem.offers.availability).toBe("https://schema.org/InStock");
  });
});

// ── Post-strip invariant: zero hub-card microdata anywhere ──────────────
describe("Post-microdata-strip: hub HTML carries zero itemscope/itemprop", () => {
  const metadata: PageMetadata = {
    title: "Test", description: "Test", keywords: "test",
    url: "test", eventCount: 2, lastUpdate: "2025-11-01T10:00:00Z", filters: {}
  };

  test("rendered hub HTML contains no itemscope and no itemprop", () => {
    const html = renderPage(metadata, [sampleConcert, sampleFreeExhibition, getTomorrowEvent()]);

    // Belt-and-braces: any microdata residue across past+future, ticketed+open events.
    expect(html).not.toMatch(/itemscope/);
    expect(html).not.toMatch(/itemprop=/);
  });
});

// ── Hub ItemList JSON-LD items carry image (post-strip image-add) ───────
describe("Hub ItemList JSON-LD items carry image field", () => {
  const metadata: PageMetadata = {
    title: "Test", description: "Test", keywords: "test",
    url: "test", eventCount: 1, lastUpdate: "2025-11-01T10:00:00Z", filters: {}
  };

  test("each itemListElement[].item has a non-empty absolute-URL image", () => {
    const html = renderPage(metadata, [sampleConcert, sampleFreeExhibition]);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    // Phase-2 B3 (2026-07-08): fall-through pages now emit the same @graph
    // envelope as hubs (CollectionPage → BreadcrumbList → Organization);
    // unwrap to the CollectionPage member, keeping @context reachable.
    const parsed = JSON.parse(jsonLdMatch![1]);
    const jsonLd = parsed['@graph'] ? { '@context': parsed['@context'], ...parsed['@graph'][0] } : parsed;
    const items = jsonLd.mainEntity.itemListElement;

    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(typeof li.item.image).toBe('string');
      expect(li.item.image.length).toBeGreaterThan(0);
      // Absolute URL — either http(s):// or BASE_URL-prefixed path
      expect(li.item.image).toMatch(/^https?:\/\//);
    }
  });
});
