/**
 * Quality-loop round 1 (builder B) — event-page moves.
 *
 * Synthetic fixtures only; each fixture asserts its own precondition so the
 * test fails loudly if the fixture ever stops exercising the rule.
 */
import { describe, test, expect } from "bun:test";
import {
  renderEventDetailPage,
  renderRelatedEventCard,
  buildEventSchemaObject,
  buildEventGraphEnvelope,
  generateEventSlug,
  selectRelatedEvents,
  resolveEventOgImage,
} from "../event-page";
import { sampleConcert } from "../../../tests/fixtures/events";
import type { Event } from "../../types";

const DAY = 86400000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 19);

const base: Event = {
  ...sampleConcert,
  id: "round1fixture0001",
  startDate: iso(10),
  endDate: undefined,
};

function descriptionSection(html: string): string {
  const m = html.match(/<section class="edp-description[^"]*">([\s\S]*?)<\/section>/);
  if (!m) throw new Error("fixture page has no description section");
  return m[1];
}

function hiddenMetadata(html: string): string {
  const m = html.match(/<div class="sr-only" aria-hidden="true"[^>]*>([\s\S]*?)<\/div>/);
  return m ? m[1] : "";
}

// ── Move 1: markdown tables render as semantic tables ──

const ASPECT_TABLE_DESC = `The night moves through phases. Opening establishes the contract and the room settles into a long, careful listen.

| Aspect | Details |
|--------|---------|
| **Setting** | Black box theater, 60-80 seats |
| **Vibe** | Serious & <b>vulnerable</b> |

If you need conventional narrative, this isn't your show. But if you want to sit in a room where vulnerability becomes art, go.

| Info | Details |
|------|---------|
| **Date** | Saturday, <i>November</i> 15 |
| **Venue** | Half Note Jazz Club |`;

describe("description markdown tables", () => {
  const event: Event = { ...base, fullDescription: ASPECT_TABLE_DESC, fullDescriptionEn: ASPECT_TABLE_DESC };

  test("precondition: fixture carries a markdown table", () => {
    expect(ASPECT_TABLE_DESC).toContain("|--------|");
    expect(ASPECT_TABLE_DESC).toContain("| Info | Details |");
  });

  for (const locale of ["el", "en"] as const) {
    test(`${locale}: visible description has a semantic table and no pipe text`, () => {
      const section = descriptionSection(renderEventDetailPage(event, [], locale));
      expect(section).toContain("<table");
      expect(section).toContain('<th scope="col">Aspect</th>');
      expect(section).toContain('<th scope="col">Details</th>');
      expect(section).toContain('<th scope="row">Setting</th>');
      expect(section).toContain("<td>Black box theater, 60-80 seats</td>");
      expect(section).not.toMatch(/\|\s*-{3,}/);
      expect(section).not.toContain("| **Setting** |");
      expect(section).not.toContain("**");
    });
  }

  test("cell content is escaped, never injected", () => {
    const section = descriptionSection(renderEventDetailPage(event, [], "en"));
    expect(section).toContain("<td>Serious &amp; &lt;b&gt;vulnerable&lt;/b&gt;</td>");
    expect(section).not.toContain("<b>vulnerable</b>");
  });

  test("no content dropped: narrative before and after the table survives", () => {
    const section = descriptionSection(renderEventDetailPage(event, [], "en"));
    expect(section).toContain("The night moves through phases.");
    expect(section).toContain("If you need conventional narrative");
  });

  test("Info table stays out of the visible description and is kept, escaped, as a hidden table", () => {
    const html = renderEventDetailPage(event, [], "en");
    expect(descriptionSection(html)).not.toContain("Half Note Jazz Club</td>");
    const hidden = hiddenMetadata(html);
    expect(hidden).toContain("<table");
    expect(hidden).toContain('<th scope="row">Venue</th>');
    expect(hidden).toContain("<td>Half Note Jazz Club</td>");
    expect(hidden).toContain("&lt;i&gt;November&lt;/i&gt;");
    expect(hidden).not.toMatch(/\|\s*-{3,}/);
  });

  test("GFM table without outer pipes renders as a table too", () => {
    const desc = "A long enough description to count as a full description for the page renderer, padded out.\n\nAspect | Details\n---|---\nSetting | Bauhaus-era concert hall\nVibe | Formal recital";
    expect(desc).toContain("---|---");
    const section = descriptionSection(renderEventDetailPage({ ...base, fullDescriptionEn: desc, fullDescription: desc }, [], "en"));
    expect(section).toContain('<th scope="row">Setting</th><td>Bauhaus-era concert hall</td>');
    expect(section).not.toContain("---|---");
  });

  test("a bare --- rule under a line containing a pipe is not a table", () => {
    const desc = "A long enough description to count as a full description for the page renderer, padded.\n\nPart one | Part two\n---\nMore prose.";
    const section = descriptionSection(renderEventDetailPage({ ...base, fullDescriptionEn: desc, fullDescription: desc }, [], "en"));
    expect(section).not.toContain("<table");
    expect(section).toContain("Part one | Part two");
  });

  test("a pipe line that is not a table (no separator row) stays prose", () => {
    const desc = "A long enough description to count as a full description for the page renderer, padded.\n\n| not a table |";
    const section = descriptionSection(renderEventDetailPage({ ...base, fullDescriptionEn: desc, fullDescription: desc }, [], "en"));
    expect(section).not.toContain("<table");
    expect(section).toContain("| not a table |");
  });
});

// ── Move 2: language of parts ──

const ENGLISH_PROSE = "An evening of smooth jazz with a quartet that has played together for a decade, in a room built for listening. ".repeat(2);
const GREEK_PROSE = "Μια βραδιά τζαζ με ένα κουαρτέτο που παίζει μαζί εδώ και μια δεκαετία, σε μια αίθουσα φτιαγμένη για ακρόαση. ".repeat(2);

describe("description language tagging", () => {
  test("precondition: fixtures are long enough to render as full descriptions", () => {
    expect(ENGLISH_PROSE.length).toBeGreaterThan(100);
    expect(GREEK_PROSE.length).toBeGreaterThan(100);
  });

  test("Greek page showing English fallback tags the English text lang=en", () => {
    const event: Event = { ...base, hasNativeGreek: false, fullDescription: ENGLISH_PROSE, fullDescriptionEn: ENGLISH_PROSE, fullDescriptionGr: undefined };
    const html = renderEventDetailPage(event, [], "el");
    expect(html).toContain('<html lang="el">');
    const section = descriptionSection(html);
    expect(section).toMatch(/<p lang="en">An evening of smooth jazz/);
    // The Greek notice itself must not be tagged English.
    expect(section).not.toMatch(/lang="en"[^>]*>Περιγραφή στα Αγγλικά/);
  });

  test("Greek page showing Greek text carries no lang override", () => {
    const event: Event = { ...base, hasNativeGreek: true, fullDescriptionGr: GREEK_PROSE, fullDescription: GREEK_PROSE };
    const section = descriptionSection(renderEventDetailPage(event, [], "el"));
    expect(section).toContain("Μια βραδιά τζαζ");
    expect(section).not.toMatch(/<(p|table) lang=/);
  });

  test("English page showing Greek text tags it lang=el", () => {
    const event: Event = { ...base, fullDescriptionEn: undefined, fullDescription: undefined, description: GREEK_PROSE };
    const html = renderEventDetailPage(event, [], "en");
    expect(html).toContain('<html lang="en">');
    expect(descriptionSection(html)).toMatch(/<p lang="el">Μια βραδιά τζαζ/);
  });

  test("English page showing English text carries no lang override", () => {
    const event: Event = { ...base, fullDescriptionEn: ENGLISH_PROSE };
    const section = descriptionSection(renderEventDetailPage(event, [], "en"));
    expect(section).not.toMatch(/<p lang=/);
  });

  test("the English 'AI-enriched content' badge is tagged lang=en on Greek pages", () => {
    const event: Event = { ...base, hasNativeGreek: true, fullDescriptionGr: GREEK_PROSE, fullDescription: GREEK_PROSE };
    expect(renderEventDetailPage(event, [], "el")).toContain('<div class="edp-enriched-badge" lang="en">AI-enriched content</div>');
    expect(renderEventDetailPage({ ...base, fullDescriptionEn: ENGLISH_PROSE }, [], "en")).toContain('<div class="edp-enriched-badge">AI-enriched content</div>');
  });

  test("English-fallback table on a Greek page is tagged lang=en too", () => {
    const event: Event = { ...base, hasNativeGreek: false, fullDescription: ASPECT_TABLE_DESC, fullDescriptionEn: ASPECT_TABLE_DESC };
    const section = descriptionSection(renderEventDetailPage(event, [], "el"));
    expect(section).toContain('<table lang="en"');
  });
});

// ── Move 3: structured-data hygiene ──

describe("JSON-LD text hygiene", () => {
  const encoded: Event = {
    ...base,
    title: "Ελένη &amp; Σουζάνα &#171;Live&#187;",
    venue: { ...base.venue, name: "&#171;Κάρολος Κουν&#187;" },
    fullDescriptionEn: `<!-- timeliness-expires: 2026-10-01 -->\nRock &amp; roll night with a long description that easily passes the one-hundred character threshold for full text.`,
  };

  test("precondition: fixture title and venue are entity-encoded", () => {
    expect(encoded.title).toContain("&amp;");
    expect(encoded.venue.name).toContain("&#171;");
    expect(encoded.fullDescriptionEn).toContain("<!--");
  });

  test("flat Event entity: name, location.name and description are decoded, comment-free", () => {
    const schema = buildEventSchemaObject(encoded, "en");
    expect(schema.name).toBe("Ελένη & Σουζάνα «Live»");
    expect(schema.location.name).toBe("«Κάρολος Κουν»");
    expect(schema.description).not.toContain("<!--");
    expect(schema.description).not.toContain("timeliness-expires");
    expect(schema.description).toContain("Rock & roll night");
  });

  test("graph envelope carries no literal entities in any name", () => {
    const envelope = buildEventGraphEnvelope(encoded, "en");
    const json = JSON.stringify(envelope);
    expect(json).not.toMatch(/&amp;|&#\d+;|&#x[0-9a-f]+;/i);
  });

  test("slug is NOT changed by decoding (no URL churn)", () => {
    // Slugs derive from the stored title; decoding lives at the emitter only.
    expect(generateEventSlug(encoded)).toContain("amp");
  });
});

describe("JSON-LD description carries no markdown table syntax", () => {
  const event: Event = { ...base, fullDescription: ASPECT_TABLE_DESC, fullDescriptionEn: ASPECT_TABLE_DESC };

  test("tables become 'Key: value' lines; prose is kept", () => {
    const d = buildEventSchemaObject(event, "en").description as string;
    expect(d).not.toMatch(/\|\s*-{3,}/);
    expect(d).not.toContain("| ");
    expect(d).toContain("Setting: Black box theater, 60-80 seats");
    expect(d).toContain("Vibe: Serious & <b>vulnerable</b>");
    expect(d).toContain("The night moves through phases.");
    expect(d).toContain("If you need conventional narrative");
  });

  test("table-free prose is byte-identical", () => {
    const prose = ENGLISH_PROSE;
    expect(buildEventSchemaObject({ ...base, fullDescriptionEn: prose }, "en").description).toBe(prose);
  });
});

describe("og:image resolves to a file the build generates", () => {
  const greekOnly: Event = {
    ...base,
    id: "3c22cba4aaaaaaaa",
    title: "Γιάννης Κότσιρας",
    venue: { ...base.venue, name: "Άλσος" },
    imageLocal: undefined, imageUrl: undefined, venueImage: undefined,
  };

  test("precondition: fixture is imageless and fully Greek", () => {
    expect(greekOnly.imageLocal || greekOnly.imageUrl || greekOnly.venueImage).toBeFalsy();
  });

  test("imageless event og path uses the page slug (the name og-image.ts writes)", () => {
    const expected = `/images/og/events/${generateEventSlug(greekOnly)}.png`;
    expect(resolveEventOgImage(greekOnly)).toBe(expected);
    expect(expected).not.toContain("--.png");
    const html = renderEventDetailPage(greekOnly, [], "el");
    expect(html).toContain(`property="og:image" content="https://agentathens.com${expected}"`);
    expect(buildEventSchemaObject(greekOnly).image).toBe(`https://agentathens.com${expected}`);
  });

  test("events with their own image keep it", () => {
    expect(resolveEventOgImage({ ...greekOnly, imageLocal: "/images/events/x.webp" })).toBe("/images/events/x.webp");
  });
});

// ── Move 5: related rails ──

describe("related rails: upcoming, listable, one per duplicate group", () => {
  const atVenue = (o: Partial<Event>): Event => ({ ...base, venue: { ...base.venue, name: "Universe" }, endDate: undefined, ...o });
  const survivor = atVenue({ id: "autechre-survivor", title: "AUTECHRE", startDate: iso(11) });
  const loser = atVenue({ id: "autechre-loser", title: "PLISSKËN presents Autechre", startDate: iso(11), mergedInto: "autechre-survivor" });
  const other = atVenue({ id: "other-gig", title: "Other gig", startDate: iso(12) });
  const current = atVenue({ id: "current", title: "Current", startDate: iso(5) });

  test("precondition: loser is linked to survivor", () => {
    expect(loser.mergedInto).toBe(survivor.id);
  });

  test("survivor present → its merged loser never appears", () => {
    const ids = selectRelatedEvents([current, survivor, loser, other], current.id).map(e => e.id);
    expect(ids).toContain("autechre-survivor");
    expect(ids).not.toContain("autechre-loser");
  });

  test("the survivor's own page does not recommend its duplicate", () => {
    const ids = selectRelatedEvents([current, survivor, loser, other], survivor.id).map(e => e.id);
    expect(ids).not.toContain("autechre-loser");
    expect(ids).toEqual(["current", "other-gig"]);
  });

  test("a loser's page does not recommend its survivor or sibling losers", () => {
    const sibling = atVenue({ id: "autechre-loser-2", title: "Autechre live", startDate: iso(11), mergedInto: "autechre-survivor" });
    const ids = selectRelatedEvents([current, survivor, loser, sibling, other], loser.id).map(e => e.id);
    expect(ids).not.toContain("autechre-survivor");
    expect(ids).not.toContain("autechre-loser-2");
    expect(ids).toContain("other-gig");
  });

  test("past runs never appear", () => {
    const past = atVenue({ id: "past-run", title: "Past run", startDate: iso(-3) });
    const ids = selectRelatedEvents([current, past, other], current.id).map(e => e.id);
    expect(ids).not.toContain("past-run");
  });
});

describe("renderRelatedEventCard on English pages", () => {
  const card = (o: Partial<Event>) => renderRelatedEventCard({ ...base, ...o }, "en");

  test("neighborhood stays English", () => {
    const html = card({ venue: { ...base.venue, neighborhood: "Psyrri" } });
    expect(html).toContain("Psyrri");
    expect(html).not.toContain("Ψυρρή");
  });

  test("multi-venue placeholder is glossed", () => {
    const html = card({ venue: { ...base.venue, name: "Πολλαπλοί Χώροι", neighborhood: undefined } });
    expect(html).toContain('<span class="card-venue">Multiple venues</span>');
  });

  test("links to the English page when one exists, else the Greek page", () => {
    const withEn = card({ fullDescriptionEn: ENGLISH_PROSE });
    expect(withEn).toContain(`href="/en/events/${generateEventSlug({ ...base })}/"`);
    const withoutEn = card({ fullDescriptionEn: undefined });
    expect(withoutEn).toContain(`href="/events/${generateEventSlug({ ...base })}/"`);
  });

  test("badge, date and price labels are English", () => {
    const html = card({ type: "festival", price: { type: "open" } as any });
    expect(html).toContain(">FESTIVAL<");
    expect(html).toContain("Free entry");
    expect(html).not.toMatch(/Ελεύθερη|ΦΕΣΤΙΒΑΛ|Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Κυριακή/);
  });

  test("Greek page links stay Greek", () => {
    const html = renderRelatedEventCard({ ...base, fullDescriptionEn: ENGLISH_PROSE }, "el");
    expect(html).toContain(`href="/events/`);
    expect(html).not.toContain(`href="/en/events/`);
  });
});

describe('related-card save button speaks the page language', () => {
  test('English page: English label in the HTML itself, before any script runs', async () => {
    const { renderRelatedEventCard } = await import('../event-page');
    const { sampleConcert } = await import('../../../tests/fixtures/events');
    const btn = renderRelatedEventCard(sampleConcert, 'en').match(/<button class="card-save-btn"[^>]*>/)![0];
    expect(btn).toContain('aria-label="Save event"');
    const el = renderRelatedEventCard(sampleConcert, 'el').match(/<button class="card-save-btn"[^>]*>/)![0];
    expect(el).toContain('aria-label="Αποθήκευση εκδήλωσης"');
  });
});

describe('related rail never recommends the current event\'s own twin', () => {
  test('an unmerged same-title exhibition row is excluded; a distinct tour of it is kept', async () => {
    const { selectRelatedEvents } = await import('../event-page');
    const { sampleFreeExhibition } = await import('../../../tests/fixtures/events');
    const { DateTime } = await import('luxon');
    const d = (o: number) => DateTime.now().setZone('Europe/Athens').plus({ days: o }).toISODate()!;
    const exh = (id: string, title: string, start: number) => ({ ...sampleFreeExhibition, id, title, startDate: d(start), endDate: d(60) });
    // Real rows 2026-09-23 at ΚΠΙΣΝ: bcdddbd6 / f4cdd95b share this exact title.
    const current = exh('bcdddbd6', 'Έκθεση φωτογραφίας | Μαζί, Ορατές', -100);
    const twin = exh('f4cdd95b', 'Έκθεση φωτογραφίας | Μαζί, Ορατές', -90);
    const tour = exh('2548c683', 'Mέλη ΚΠΙΣΝ | Ξενάγηση στην έκθεση Untitled (Pride and Contempt) της Barbara Kruger', -14);
    const ids = selectRelatedEvents([current, twin, tour], 'bcdddbd6').map(e => e.id);
    expect(ids).not.toContain('f4cdd95b');
    expect(ids).toContain('2548c683');
  });
});
