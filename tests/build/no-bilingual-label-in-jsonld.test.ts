// S132': Output-layer regression guard #2.
//
// The enrichment template uses Greek section headers ("Περιγραφή στα Αγγλικά" /
// "Περιγραφή στα Ελληνικά") as bilingual scaffolding labels. These should never
// leak into structured data — JSON-LD `description` fields are consumed by
// search engines and AI crawlers, and the Greek labels are not part of the
// natural-language description.
//
// On 2026-05-11, 467/5762 built event pages contained "Περιγραφή στα Αγγλικά"
// somewhere in HTML, but in every sampled case it was a <p class="edp-lang-notice">
// element in the body, NOT inside a JSON-LD block. The body-element issue is
// tracked separately in docs/known-issues.md; this test guards against the
// label migrating into JSON-LD on any future enrichment-pipeline change.
//
// Skipped when dist/events/ has not been built — run `bun run src/generate-site.ts`
// first to populate dist/.

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const DIST_EVENTS = join(import.meta.dir, "..", "..", "dist", "events");

const SAMPLE_SLUGS = [
  "86438986-bolivar-royksopp-dj-set-i-fri-june-5",
  "c3fe4ec6-gazarte-telenova-live-in-athens",
  "9454cac8-christmas-theater-this-is-michael-tribute-show-michael-jackson-15-christmas-th",
];

const BANNED_LABELS = ["Περιγραφή στα Αγγλικά", "Περιγραφή στα Ελληνικά"];

function extractJsonLdBlobs(html: string): string[] {
  const pattern = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blobs: string[] = [];
  for (const m of html.matchAll(pattern)) {
    blobs.push(m[1]);
  }
  return blobs;
}

describe("output-layer: bilingual scaffolding labels never appear inside JSON-LD (S132')", () => {
  if (!existsSync(DIST_EVENTS)) {
    test.skip("dist/events/ not built — skip (run `bun run src/generate-site.ts` first)", () => {});
    return;
  }

  for (const slug of SAMPLE_SLUGS) {
    const htmlPath = join(DIST_EVENTS, slug, "index.html");
    if (!existsSync(htmlPath)) {
      test.skip(`${slug} not in current dist — skip`, () => {});
      continue;
    }
    test(`${slug} JSON-LD blocks contain no bilingual scaffolding labels`, () => {
      const html = readFileSync(htmlPath, "utf-8");
      const blobs = extractJsonLdBlobs(html);
      for (const blob of blobs) {
        for (const label of BANNED_LABELS) {
          expect(blob.includes(label)).toBe(false);
        }
      }
    });
  }
});
