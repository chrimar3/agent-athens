import { describe, test, expect } from "bun:test";
import { schemaText } from "../schema-text";
import { buildCollectionPageMember } from "../schema-graph-builders";
import { sampleConcert } from "../../../tests/fixtures/events";
import type { Event, PageMetadata } from "../../types";

describe("schemaText", () => {
  test("decodes named and numeric entities", () => {
    expect(schemaText("Ελένη &amp; Σουζάνα &#171;Live&#187; &#x27;x&#x27;")).toBe("Ελένη & Σουζάνα «Live» 'x'");
  });

  test("drops HTML comments (pipeline markers)", () => {
    expect(schemaText("<!-- timeliness-expires: 2026-10-01 -->\nBody text")).toBe("Body text");
    expect(schemaText("A <!-- x --> B")).toBe("A  B");
  });

  test("leaves plain text byte-identical", () => {
    const plain = "Plain text, trailing space ";
    expect(schemaText(plain)).toBe(plain);
  });
});

describe("hub ItemList JSON-LD carries decoded names", () => {
  const encoded: Event = {
    ...sampleConcert,
    title: "Theatre of the No &amp; Friends",
    venue: { ...sampleConcert.venue, name: "&#171;Κάρολος Κουν&#187;" },
    fullDescriptionEn: "<!-- timeliness-expires: 2026-10-01 -->\nA night of noise &amp; light.",
  };

  test("precondition: fixture is entity-encoded", () => {
    expect(encoded.title).toContain("&amp;");
    expect(encoded.venue.name).toContain("&#171;");
  });

  test("item name, location name and description contain no literal entities or comments", () => {
    const member = buildCollectionPageMember({
      events: [encoded],
      metadata: { title: "Test", lastUpdate: "2026-09-22" } as PageMetadata,
      locale: "en",
      url: "https://agentathens.com/test/",
    });
    const item = member.mainEntity.itemListElement[0].item;
    expect(item.name).toBe("Theatre of the No & Friends");
    expect(item.location.name).toBe("«Κάρολος Κουν»");
    expect(item.description).toBe("A night of noise & light.");
  });

  test("item description carries no markdown table syntax", () => {
    const withTable: Event = { ...encoded, fullDescriptionEn: "Intro line.\n\n| Aspect | Details |\n|---|---|\n| **Setting** | Small room |" };
    const member = buildCollectionPageMember({
      events: [withTable],
      metadata: { title: "Test", lastUpdate: "2026-09-22" } as PageMetadata,
      locale: "en",
      url: "https://agentathens.com/test/",
    });
    const item = member.mainEntity.itemListElement[0].item;
    expect(item.description).toBe("Intro line. Setting: Small room");
  });
});
