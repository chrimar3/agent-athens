/**
 * Search index exposes decoded titles (the overlay assigns them via
 * textContent, so an entity in the index is shown literally). Writes to a temp
 * dir only — never dist/.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { generateSearchIndex } from "../search-index";
import { generateEventSlug } from "../event-page";
import { sampleConcert } from "../../../tests/fixtures/events";
import type { Event } from "../../types";

const OUT = mkdtempSync(join(tmpdir(), "search-index-entities-"));
afterAll(() => rmSync(OUT, { recursive: true, force: true }));

const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 19);
const encoded: Event = {
  ...sampleConcert,
  id: "entities-fixture-1",
  title: "&#171;Εαρινό Πάθος&#187; &amp; Πολίτες β&#39; κατηγορίας",
  venue: { ...sampleConcert.venue, name: "&#171;Κάρολος Κουν&#187;" },
  startDate: soon,
  endDate: undefined,
};

describe("search index titles", () => {
  test("precondition: fixture title is entity-encoded", () => {
    expect(encoded.title).toMatch(/&#171;|&amp;|&#39;/);
  });

  test("event and popular records carry decoded titles; slug unchanged", () => {
    generateSearchIndex([encoded], OUT);
    const index = JSON.parse(readFileSync(join(OUT, "search-index.json"), "utf-8"));
    const rec = index.events.find((e: any) => e.id === encoded.id);
    expect(rec.title).toBe("«Εαρινό Πάθος» & Πολίτες β' κατηγορίας");
    expect(rec.titleN).not.toMatch(/&#|&amp;/);
    expect(rec.titleN).toContain("εαρινο παθος");
    expect(rec.slug).toBe(generateEventSlug(encoded));
    expect(rec.venue).toBe("«Κάρολος Κουν»");
    const pop = index.popular.find((p: any) => p.slug === rec.slug);
    expect(pop.title).toBe(rec.title);
    expect(pop.venue).toBe("«Κάρολος Κουν»");
  });
});

describe('search index shows display titles', () => {
  test('double-encoded titles decode fully', async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { generateSearchIndex } = await import('../search-index');
    const { sampleConcert } = await import('../../../tests/fixtures/events');
    const dir = mkdtempSync(join(tmpdir(), 'aa-si-'));
    try {
      generateSearchIndex([{ ...sampleConcert, title: 'CH&amp;#211;RES &amp; CHORDAE' }], dir);
      const idx = JSON.parse(readFileSync(join(dir, 'search-index.json'), 'utf-8'));
      expect(idx.events[0].title).toBe('CHÓRES & CHORDAE');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
