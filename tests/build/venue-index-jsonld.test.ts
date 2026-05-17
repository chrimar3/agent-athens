// Asserts that /venues/ index emits a CollectionPage + ItemList of Place items
// per the citability audit (specs/citability-audit-2026-05-18.md, Item 4).
// Closes the registry-index discoverability gap: pre-fix had 0 ld+json blocks.

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const DIST = join(import.meta.dir, "..", "..", "dist");
const VENUES_INDEX = join(DIST, "venues", "index.html");

const distAvailable = existsSync(DIST) && existsSync(VENUES_INDEX);

describe.skipIf(!distAvailable)("/venues/ index JSON-LD emission", () => {
  // Extract the ld+json block content
  function getJsonLdBlocks(html: string): unknown[] {
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    return Array.from(html.matchAll(re)).map((m) => JSON.parse(m[1].trim()));
  }

  // Count rendered venue <li> entries (for cap-vs-numberOfItems sanity)
  function countVenueListItems(html: string): number {
    const re = /<li>\s*<a href="\/venues\/[^"]+\/">/g;
    return Array.from(html.matchAll(re)).length;
  }

  test("emits exactly 1 JSON-LD block", () => {
    const html = readFileSync(VENUES_INDEX, "utf-8");
    const blocks = getJsonLdBlocks(html);
    expect(blocks.length).toBe(1);
  });

  test("block is a valid CollectionPage", () => {
    const html = readFileSync(VENUES_INDEX, "utf-8");
    const [block] = getJsonLdBlocks(html) as Array<Record<string, unknown>>;
    expect(block["@context"]).toBe("https://schema.org");
    expect(block["@type"]).toBe("CollectionPage");
    expect(typeof block.name).toBe("string");
    expect((block.name as string).length).toBeGreaterThan(0);
    expect(block.inLanguage).toBe("el");
    expect(block.url).toContain("/venues/");
  });

  test("mainEntity is an ItemList with positive numberOfItems", () => {
    const html = readFileSync(VENUES_INDEX, "utf-8");
    const [block] = getJsonLdBlocks(html) as Array<Record<string, unknown>>;
    const mainEntity = block.mainEntity as Record<string, unknown>;
    expect(mainEntity["@type"]).toBe("ItemList");
    expect(typeof mainEntity.numberOfItems).toBe("number");
    expect(mainEntity.numberOfItems as number).toBeGreaterThan(0);
  });

  test("numberOfItems matches rendered venue count (truth-in-JSON-LD)", () => {
    const html = readFileSync(VENUES_INDEX, "utf-8");
    const [block] = getJsonLdBlocks(html) as Array<Record<string, unknown>>;
    const mainEntity = block.mainEntity as Record<string, unknown>;
    const renderedCount = countVenueListItems(html);
    expect(mainEntity.numberOfItems).toBe(renderedCount);
  });

  test("itemListElement is capped at 30 entries (HUB_EVENT_LIMIT parity)", () => {
    const html = readFileSync(VENUES_INDEX, "utf-8");
    const [block] = getJsonLdBlocks(html) as Array<Record<string, unknown>>;
    const mainEntity = block.mainEntity as Record<string, unknown>;
    const items = mainEntity.itemListElement as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(30);
  });

  test("each item is a ListItem wrapping a Place with name + url", () => {
    const html = readFileSync(VENUES_INDEX, "utf-8");
    const [block] = getJsonLdBlocks(html) as Array<Record<string, unknown>>;
    const mainEntity = block.mainEntity as Record<string, unknown>;
    const items = mainEntity.itemListElement as Array<Record<string, unknown>>;
    items.forEach((listItem, idx) => {
      expect(listItem["@type"]).toBe("ListItem");
      expect(listItem.position).toBe(idx + 1);
      const place = listItem.item as Record<string, unknown>;
      expect(place["@type"]).toBe("Place");
      expect(typeof place.name).toBe("string");
      expect((place.name as string).length).toBeGreaterThan(0);
      expect(typeof place.url).toBe("string");
      expect(place.url as string).toMatch(/^https:\/\/agentathens\.com\/venues\/[^/]+\/$/);
    });
  });
});

if (!distAvailable) {
  console.warn(
    `[venue-index-jsonld] dist/venues/index.html not found — tests will be skipped. Run \`bun run build\` to populate.`,
  );
}
