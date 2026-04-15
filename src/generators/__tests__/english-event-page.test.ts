import { describe, test, expect } from "bun:test";
import { renderEventDetailPage, generateEventSlug } from "../event-page";
import { sampleConcert, sampleConcertWithTicket, sampleFreeExhibition } from "../../../tests/fixtures/events";
import type { Event } from "../../types";

// Future date for tests
const futureStartDate = new Date(Date.now() + 86400000 * 14).toISOString();

// Event with English description
const bilingualEvent: Event = {
  ...sampleConcert,
  startDate: futureStartDate,
  fullDescriptionEn: "Experience an unforgettable evening of smooth jazz at Athens' premier jazz venue. This night promises world-class performances in an intimate setting. The Half Note Jazz Club has been a cornerstone of Athens' music scene for decades. Tonight's program includes classic standards and contemporary compositions.",
  fullDescriptionGr: "Ζήστε ένα αξέχαστο βράδυ smooth jazz στο κορυφαίο jazz venue της Αθήνας. Η βραδιά υπόσχεται παγκόσμιας κλάσης παραστάσεις σε μια οικεία ατμόσφαιρα.",
};

// Event without English description (Greek only)
const greekOnlyEvent: Event = {
  ...sampleConcert,
  startDate: futureStartDate,
  fullDescriptionEn: undefined,
  fullDescriptionGr: "Μια ελληνική περιγραφή μόνο.",
};

describe("English event page — HTML lang", () => {
  test('English page has lang="en"', () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain('<html lang="en">');
  });

  test('Greek page has lang="el"', () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'el');
    expect(html).toContain('<html lang="el">');
  });

  test("default locale is Greek", () => {
    const html = renderEventDetailPage(bilingualEvent, []);
    expect(html).toContain('<html lang="el">');
  });
});

describe("English event page — og:locale", () => {
  test("English page has en_US locale", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain('content="en_US"');
  });

  test("Greek page has el_GR locale", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'el');
    expect(html).toContain('content="el_GR"');
  });
});

describe("English event page — canonical URL", () => {
  test("English canonical includes /en/ prefix", () => {
    const slug = generateEventSlug(bilingualEvent);
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain(`href="https://agentathens.com/en/events/${slug}/"`);
  });

  test("Greek canonical has no /en/ prefix", () => {
    const slug = generateEventSlug(bilingualEvent);
    const html = renderEventDetailPage(bilingualEvent, [], 'el');
    expect(html).toContain(`href="https://agentathens.com/events/${slug}/"`);
  });
});

describe("English event page — hreflang tags", () => {
  test("bilingual event has el + en + x-default hreflang", () => {
    const slug = generateEventSlug(bilingualEvent);
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain(`hreflang="el" href="https://agentathens.com/events/${slug}/"`);
    expect(html).toContain(`hreflang="en" href="https://agentathens.com/en/events/${slug}/"`);
    expect(html).toContain(`hreflang="x-default" href="https://agentathens.com/en/events/${slug}/"`);
  });

  test("Greek-only event has only el hreflang", () => {
    const html = renderEventDetailPage(greekOnlyEvent, [], 'el');
    expect(html).toContain('hreflang="el"');
    expect(html).not.toContain('hreflang="en"');
    expect(html).not.toContain('hreflang="x-default"');
  });
});

describe("English event page — description selection", () => {
  test("English page uses fullDescriptionEn", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain("world-class performances");
  });

  test("Greek page uses fullDescriptionGr", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'el');
    expect(html).toContain("παγκόσμιας κλάσης");
  });
});

describe("English event page — UI strings", () => {
  test("English page has English type label", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain('>Concert<');
  });

  test("Greek page has Greek type label", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'el');
    expect(html).toContain('Συναυλία');
  });

  test("English page shows 'Source:' not 'Πηγή:'", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain('Source:');
  });

  test("English page shows English explore section", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain('Explore more');
  });

  test("English page shows English venue maps link", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain('Open in Maps');
  });
});

describe("English event page — past event banner", () => {
  test("English past event shows English banner", () => {
    const pastEvent: Event = { ...bilingualEvent, startDate: '2025-01-01T20:00:00+03:00' };
    const html = renderEventDetailPage(pastEvent, [], 'en');
    expect(html).toContain('This event has ended');
  });
});

describe("English event page — Schema.org inLanguage", () => {
  test("English page schema has inLanguage: en", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'en');
    expect(html).toContain('"inLanguage": "en"');
  });

  test("Greek page schema has inLanguage: el", () => {
    const html = renderEventDetailPage(bilingualEvent, [], 'el');
    expect(html).toContain('"inLanguage": "el"');
  });
});

describe("English event page — read-more button data attributes", () => {
  test("English read-more has English data attributes", () => {
    const longEnEvent: Event = {
      ...bilingualEvent,
      fullDescriptionEn: "A".repeat(500),
    };
    const html = renderEventDetailPage(longEnEvent, [], 'en');
    expect(html).toContain('data-more="Read more ▾"');
    expect(html).toContain('data-less="Read less ▴"');
  });
});

describe("English event page — CTA text", () => {
  test("English CTA shows 'Buy tickets'", () => {
    const withTicket: Event = { ...sampleConcertWithTicket, startDate: futureStartDate, fullDescriptionEn: "English desc for test that is long enough." };
    const html = renderEventDetailPage(withTicket, [], 'en');
    expect(html).toContain('Buy tickets');
  });

  test("English open entry shows 'Free entry'", () => {
    const openExhibition: Event = {
      ...sampleFreeExhibition,
      startDate: new Date(Date.now() - 86400000 * 7).toISOString(),
      endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      fullDescriptionEn: "An English description of the exhibition.",
    };
    const html = renderEventDetailPage(openExhibition, [], 'en');
    expect(html).toContain('Free entry');
  });
});
