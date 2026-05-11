// S132: After build, only one canonical form should exist per singular/plural hub pair.
// Cannibalization root cause: filter-based hub generator emits /<type>.html, curated
// category generator emits /<plural-slug>.html, both with identical Greek titles.
// Decision: keep the plural (curated category) as canonical, drop the singular.
//
// This is a build-output assertion. It is skipped when dist/ has not been built —
// run `bun run build` (or src/generate-site.ts) first to populate dist/.

import { describe, test, expect } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

const DIST = join(import.meta.dir, "..", "..", "dist");

// Each pair: [deprecatedSingular, canonicalPlural]. Exactly one of each pair must exist.
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["concert", "concerts"],
  ["theater", "theatre"],
  ["exhibition", "exhibitions"],
  ["performance", "performances"],
];

const distAvailable = existsSync(DIST) && existsSync(join(DIST, "index.html"));

describe.skipIf(!distAvailable)("Canonical hub forms (S132)", () => {
  for (const [singular, plural] of PAIRS) {
    test(`exactly one of /${singular}.html or /${plural}.html exists, not both`, () => {
      const singularPath = join(DIST, `${singular}.html`);
      const pluralPath = join(DIST, `${plural}.html`);
      const singularExists = existsSync(singularPath);
      const pluralExists = existsSync(pluralPath);

      // The plural (curated category) is the canonical form.
      expect(pluralExists).toBe(true);
      expect(singularExists).toBe(false);
    });
  }
});

if (!distAvailable) {
  // Surface a single skip so the file isn't silently empty in test output.
  describe("Canonical hub forms (S132)", () => {
    test.skip("dist/ not built — run `bun run build` then re-run this test", () => {});
  });
}
