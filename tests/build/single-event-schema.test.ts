// S132': Output-layer regression guard #1.
//
// Every built event page should emit exactly one <script type="application/ld+json">
// block whose @type is in the Event family (per SCHEMA_TYPE_MAP). The original
// brief reported dual emission on every event page; the S132' diagnostic found
// only single emission in current dist/, but the property must keep holding.
//
// If a future emitter is added (alternate language, hreflang, etc.) and emits
// a second Event-typed block, this test catches it before deploy. The internal
// validator (src/validators/schema-completeness.ts) gained the same check in
// S132' for build-time visibility; this output-layer assertion is the
// belt-and-suspenders complement.
//
// Skipped when dist/events/ has not been built — run `bun run src/generate-site.ts`
// first to populate dist/.

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { SCHEMA_TYPE_MAP } from "../../src/enrichment/quality-gates";

const DIST_EVENTS = join(import.meta.dir, "..", "..", "dist", "events");
const VALID_EVENT_TYPES: Set<string> = new Set(Object.values(SCHEMA_TYPE_MAP));

// Stable sample: the 3 pages GSC inspection flagged in S131 + 3 more spanning
// different EventTypes for breadth. If any of these are not present in a given
// build, that page is skipped silently (handles dist churn from sitemap edits).
const SAMPLE_SLUGS = [
  "86438986-bolivar-royksopp-dj-set-i-fri-june-5",
  "c3fe4ec6-gazarte-telenova-live-in-athens",
  "9454cac8-christmas-theater-this-is-michael-tribute-show-michael-jackson-15-christmas-th",
];

function extractAllJsonLd(html: string): Array<Record<string, unknown>> {
  const pattern = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const out: Array<Record<string, unknown>> = [];
  for (const m of html.matchAll(pattern)) {
    try { out.push(JSON.parse(m[1])); } catch { /* skip unparseable */ }
  }
  return out;
}

// S139: post-envelope migration, the Event entity lives inside @graph rather
// than at script-tag top level. Flatten any @graph envelopes before counting.
function flattenGraph(blocks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const block of blocks) {
    const graph = (block as any)["@graph"];
    if (Array.isArray(graph)) {
      for (const m of graph) {
        if (m && typeof m === "object") out.push(m as Record<string, unknown>);
      }
    } else {
      out.push(block);
    }
  }
  return out;
}

function countEventBlocks(html: string): number {
  return flattenGraph(extractAllJsonLd(html)).filter(b => {
    const t = b["@type"];
    return typeof t === "string" && VALID_EVENT_TYPES.has(t);
  }).length;
}

describe("output-layer: single Event JSON-LD per event page (S132')", () => {
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
    test(`${slug} emits exactly one Event-typed JSON-LD block`, () => {
      const html = readFileSync(htmlPath, "utf-8");
      expect(countEventBlocks(html)).toBe(1);
    });
  }
});
