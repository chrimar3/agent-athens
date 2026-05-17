// Asserts the 4 EN cornerstones identified as true 404s in the citability audit
// (specs/citability-audit-2026-05-18.md, Item 3) build to dist/.
// Failure mode B: slugs not declared in config/hub-pages.json (or missing answerCapsuleEn).
// Closure: 3 new entries + 1 updated exhibitions entry in config/hub-pages.json.

import { describe, test, expect } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

const DIST = join(import.meta.dir, "..", "..", "dist");
const EN_CORNERSTONES: ReadonlyArray<string> = [
  "tomorrow",
  "this-week",
  "next-month",
  "exhibitions",
];

const distAvailable = existsSync(DIST) && existsSync(join(DIST, "index.html"));

describe.skipIf(!distAvailable)("EN cornerstone presence (S136 audit Item 3)", () => {
  for (const slug of EN_CORNERSTONES) {
    test(`dist/en/${slug}/index.html exists`, () => {
      const path = join(DIST, "en", slug, "index.html");
      expect(existsSync(path)).toBe(true);
    });
  }
});

if (!distAvailable) {
  console.warn(
    `[en-cornerstone-presence] dist/ not found — tests will be skipped. Run \`bun run build\` to populate.`,
  );
}
