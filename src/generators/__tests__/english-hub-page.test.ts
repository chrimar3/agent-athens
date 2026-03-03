import { describe, test, expect } from "bun:test";
import {
  renderHubPage,
  renderComparisonRow,
  renderEventBlock,
  renderFaqSection,
  renderFaqSchema,
} from "../hub-page";
import { sampleConcert, sampleFreeExhibition } from "../../../tests/fixtures/events";
import type { Event, HubConfig, HubFaq } from "../../types";

// Future dates for tests
const futureDate1 = new Date(Date.now() + 86400000 * 7).toISOString();
const futureDate2 = new Date(Date.now() + 86400000 * 14).toISOString();
const futureDate3 = new Date(Date.now() + 86400000 * 21).toISOString();

// Sample events for hub tests
const testEvents: Event[] = [
  { ...sampleConcert, id: "event-1", title: "Jazz Night", startDate: futureDate1, fullDescription: "A great jazz concert in Athens.", fullDescriptionEn: "A wonderful jazz evening in the heart of Athens." },
  { ...sampleConcert, id: "event-2", title: "Rock Festival", startDate: futureDate2, fullDescription: "Ένα ροκ φεστιβάλ.", fullDescriptionEn: "An amazing rock festival." },
  { ...sampleFreeExhibition, id: "event-3", title: "Art Exhibition", startDate: futureDate1, endDate: futureDate3, fullDescription: "Μια έκθεση τέχνης." },
  { ...sampleConcert, id: "event-4", title: "Blues Night", startDate: futureDate3, fullDescription: "Βραδιά μπλουζ." },
];

// Bilingual hub config (has answerCapsuleEn)
const bilingualHub: HubConfig = {
  slug: "today",
  titleEl: "Εκδηλώσεις Σήμερα στην Αθήνα",
  titleEn: "Events in Athens Today",
  filter: { type: "date", value: "today" },
  answerCapsuleEl: "Σήμερα στην Αθήνα θα βρείτε συναυλίες, εκθέσεις.",
  answerCapsuleEn: "Today in Athens you'll find concerts and exhibitions.",
  cornerstone: true,
  faqs: [
    {
      questionEl: "Τι γίνεται σήμερα;",
      answerEl: "Πολλές εκδηλώσεις.",
      questionEn: "What's happening today?",
      answerEn: "Many events are happening.",
    },
    {
      questionEl: "Πού μπορώ να πάω;",
      answerEl: "Σε πολλούς χώρους.",
      questionEn: "Where can I go?",
      answerEn: "To many venues across Athens.",
    },
  ],
};

// Bilingual hub with seasonal narrative
const bilingualHubWithSeasonal: HubConfig = {
  ...bilingualHub,
  seasonalNarrativeEn: "March in Athens brings outdoor concerts and gallery openings across the city.",
};

// Greek-only hub config (no answerCapsuleEn)
const greekOnlyHub: HubConfig = {
  slug: "concerts",
  titleEl: "Συναυλίες στην Αθήνα",
  titleEn: "Concerts in Athens",
  filter: { type: "event_type", value: "concert" },
  answerCapsuleEl: "Η Αθήνα φιλοξενεί ζωντανές συναυλίες.",
  faqs: [
    {
      questionEl: "Πού γίνονται συναυλίες;",
      answerEl: "Σε πολλούς χώρους.",
    },
  ],
};

describe("English hub page — HTML lang", () => {
  test('English hub has lang="en"', () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html).not.toBeNull();
    expect(html!).toContain('<html lang="en">');
  });

  test('Greek hub has lang="el"', () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "el");
    expect(html).not.toBeNull();
    expect(html!).toContain('<html lang="el">');
  });

  test("default locale is Greek", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents);
    expect(html).not.toBeNull();
    expect(html!).toContain('<html lang="el">');
  });
});

describe("English hub page — answer capsule", () => {
  test("English hub uses answerCapsuleEn", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).toContain("Today in Athens you'll find concerts");
  });

  test("Greek hub uses answerCapsuleEl", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "el");
    expect(html!).toContain("Σήμερα στην Αθήνα θα βρείτε");
  });
});

describe("English hub page — comparison table headers", () => {
  test("English hub has English table headers", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).toContain(">Event</th>");
    expect(html!).toContain(">Venue</th>");
    expect(html!).toContain(">Date</th>");
    expect(html!).toContain(">Entry</th>");
  });

  test("Greek hub has Greek table headers", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "el");
    expect(html!).toContain(">Εκδήλωση</th>");
    expect(html!).toContain(">Χώρος</th>");
    expect(html!).toContain(">Ημερομηνία</th>");
    expect(html!).toContain(">Είσοδος</th>");
  });
});

describe("English hub page — section headings", () => {
  test("English hub has 'Overview' heading", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).toContain("<h2>Overview</h2>");
  });

  test("English hub has 'In Detail' heading", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).toContain("<h2>In Detail</h2>");
  });

  test("Greek hub has Greek section headings", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "el");
    expect(html!).toContain("<h2>Επισκόπηση</h2>");
    expect(html!).toContain("<h2>Αναλυτικά</h2>");
  });
});

describe("English hub page — FAQ section", () => {
  test("English FAQ heading is 'Frequently Asked Questions'", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).toContain("<h2>Frequently Asked Questions</h2>");
  });

  test("English FAQ uses English Q&A text", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).toContain("What's happening today?");
    expect(html!).toContain("Many events are happening.");
  });

  test("Greek FAQ uses Greek Q&A text", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "el");
    expect(html!).toContain("Τι γίνεται σήμερα;");
    expect(html!).toContain("Πολλές εκδηλώσεις.");
  });
});

describe("English hub page — FAQ schema", () => {
  test("English FAQ schema uses English text", () => {
    const faqsWithEn: HubFaq[] = [
      { questionEl: "Ελληνικά;", answerEl: "Ναι.", questionEn: "English?", answerEn: "Yes." },
    ];
    const schema = renderFaqSchema(faqsWithEn, "en");
    expect(schema).toContain('"name":"English?"');
    expect(schema).toContain('"text":"Yes."');
    expect(schema).not.toContain("Ελληνικά");
  });

  test("Greek FAQ schema uses Greek text", () => {
    const faqsWithEn: HubFaq[] = [
      { questionEl: "Ελληνικά;", answerEl: "Ναι.", questionEn: "English?", answerEn: "Yes." },
    ];
    const schema = renderFaqSchema(faqsWithEn, "el");
    expect(schema).toContain('"name":"Ελληνικά;"');
    expect(schema).not.toContain('"name":"English?"');
  });
});

describe("English hub page — hreflang", () => {
  test("bilingual hub emits el + en + x-default hreflang", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).toContain('hreflang="el" href="https://agentathens.netlify.app/today"');
    expect(html!).toContain('hreflang="en" href="https://agentathens.netlify.app/en/today"');
    expect(html!).toContain('hreflang="x-default" href="https://agentathens.netlify.app/en/today"');
  });

  test("Greek version of bilingual hub also has hreflang", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "el");
    expect(html!).toContain('hreflang="el"');
    expect(html!).toContain('hreflang="en"');
    expect(html!).toContain('hreflang="x-default"');
  });

  test("hub without answerCapsuleEn has no English hreflang", () => {
    const html = renderHubPage(greekOnlyHub, testEvents, testEvents, undefined, "el");
    expect(html!).not.toContain('hreflang="en"');
    expect(html!).not.toContain('hreflang="x-default"');
  });
});

describe("English hub page — gate rule", () => {
  test("hub without answerCapsuleEn returns null for English", () => {
    const html = renderHubPage(greekOnlyHub, testEvents, testEvents, undefined, "en");
    expect(html).toBeNull();
  });

  test("hub with answerCapsuleEn generates for English", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html).not.toBeNull();
  });
});

describe("English hub page — price cells", () => {
  test("English comparison row shows 'Free' for open events", () => {
    const freeEvent: Event = { ...sampleFreeExhibition, startDate: futureDate1, endDate: futureDate3 };
    const row = renderComparisonRow(freeEvent, "en");
    expect(row).toContain("Free");
    expect(row).not.toContain("Ελ. είσοδος");
  });

  test("Greek comparison row shows 'Ελ. είσοδος' for open events", () => {
    const freeEvent: Event = { ...sampleFreeExhibition, startDate: futureDate1, endDate: futureDate3 };
    const row = renderComparisonRow(freeEvent, "el");
    expect(row).toContain("Ελ. είσοδος");
  });
});

describe("English hub page — event block links", () => {
  test("English event block links to /en/events/", () => {
    const event: Event = { ...sampleConcert, startDate: futureDate1, fullDescriptionEn: "English description for test." };
    const block = renderEventBlock(event, "en");
    expect(block).toContain('href="/en/events/');
  });

  test("Greek event block links to /events/", () => {
    const event: Event = { ...sampleConcert, startDate: futureDate1 };
    const block = renderEventBlock(event, "el");
    expect(block).toContain('href="/events/');
    expect(block).not.toContain('href="/en/');
  });
});

describe("English hub page — stats badge", () => {
  test("English hub shows 'events' in stats", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).toContain(`${testEvents.length} events`);
  });

  test("Greek hub shows 'εκδηλώσεις' in stats", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "el");
    expect(html!).toContain(`${testEvents.length} εκδηλώσεις`);
  });
});

describe("English hub page — seasonal narrative", () => {
  test("English hub with seasonalNarrativeEn renders 'What to Expect' section", () => {
    const html = renderHubPage(bilingualHubWithSeasonal, testEvents, testEvents, undefined, "en");
    expect(html!).toContain('<h2>What to Expect</h2>');
    expect(html!).toContain('class="hub-seasonal-narrative"');
    expect(html!).toContain("March in Athens brings outdoor concerts");
  });

  test("English hub without seasonalNarrativeEn has no seasonal section", () => {
    const html = renderHubPage(bilingualHub, testEvents, testEvents, undefined, "en");
    expect(html!).not.toContain('hub-seasonal-narrative');
    expect(html!).not.toContain('What to Expect');
  });

  test("Greek hub never shows seasonal narrative even when field exists", () => {
    const html = renderHubPage(bilingualHubWithSeasonal, testEvents, testEvents, undefined, "el");
    expect(html!).not.toContain('hub-seasonal-narrative');
    expect(html!).not.toContain('What to Expect');
  });
});
