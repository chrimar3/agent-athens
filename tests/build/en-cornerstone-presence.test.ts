// Guards the S136 audit Item 3 closure (specs/citability-audit-2026-05-18.md):
// the 4 EN cornerstones that were true 404s must stay DECLARED — failure mode B
// was slugs missing from config/hub-pages.json or lacking answerCapsuleEn.
//
// 2026-07-18 (stale-artifact sweep follow-up): the old form asserted raw disk
// presence, which conflated the config regression with legitimate DATA-GATED
// absence (an EN hub only generates with ≥3 eligible events). It "passed" for
// a month via a stale /en/exhibitions/ dir from Jun 12 that the sweep now
// removes — a frozen zombie page is not presence. The honest pin:
//   1. every cornerstone is declared in config with answerCapsuleEn
//      (the actual S136 closure — catches failure mode B), and
//   2. if the dir exists on disk it is a real page (index.html), never a husk.
// Presence-on-disk itself is owned by the data gate + the sweep, by design.

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..");
const DIST = join(ROOT, "dist");
const EN_CORNERSTONES: ReadonlyArray<string> = [
  "tomorrow",
  "this-week",
  "next-month",
  "exhibitions",
];

const hubs: Array<{ slug: string; answerCapsuleEn?: string }> = JSON.parse(
  readFileSync(join(ROOT, "config", "hub-pages.json"), "utf-8"),
).hubs;

describe("EN cornerstone declaration (S136 audit Item 3, failure mode B)", () => {
  for (const slug of EN_CORNERSTONES) {
    test(`config declares ${slug} with answerCapsuleEn`, () => {
      const hub = hubs.find((h) => h.slug === slug);
      expect(hub).toBeDefined();
      expect(Boolean(hub!.answerCapsuleEn)).toBe(true);
    });
  }
});

const distAvailable = existsSync(DIST) && existsSync(join(DIST, "index.html"));

describe.skipIf(!distAvailable)("EN cornerstone dirs are pages, not husks", () => {
  for (const slug of EN_CORNERSTONES) {
    test(`dist/en/${slug}/ if present contains index.html`, () => {
      const dir = join(DIST, "en", slug);
      if (!existsSync(dir)) return; // data-gated absence is legitimate
      expect(existsSync(join(dir, "index.html"))).toBe(true);
    });
  }
});

if (!distAvailable) {
  console.warn(
    `[en-cornerstone-presence] dist/ not found — dist-state tests skipped. Run \`bun run build\` to populate.`,
  );
}
