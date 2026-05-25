// S155 (2026-05-25): Bing URL Inspection flagged 2 SEO errors on the cornerstone
// /en/this-weekend/:
//   1. Duplicate H1 — colophon dialog injects <h1 class="colophon-name"> via
//      site-chrome.ts → renderSiteNav, riding into every page. Fix: demote to <h2>
//      in src/templates/colophon.ts:19.
//   2. Title too long — 112 chars total. Fix: drop " | agent-athens" suffix on
//      EN hubs at src/generators/hub-page.ts:402 per GEO ruling (locale-conditional,
//      EN-only; EL keeps suffix pending separate GEO scope).
//
// Rules locked by this verifier:
//   (a) /en/this-weekend/ emits exactly one <h1> tag (semantic-uniqueness).
//   (b) /en/this-weekend/ <title> does NOT contain " | agent-athens" (the strip target).
//   (c) An EDP-side title STILL contains " | agent-athens" (regression guard — strip
//       is hub-scope-only per GEO; the 7 other emitters are out-of-scope pending GEO).
//
// Build-output assertion. Skipped when dist/ is not built — run `bun run build`
// first to populate dist/ (same skip-pattern as og-url-canonical-parity.test.ts).

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const DIST = join(import.meta.dir, "..", "..", "dist");
const EN_THIS_WEEKEND = join(DIST, "en", "this-weekend", "index.html");
const distAvailable = existsSync(DIST) && existsSync(EN_THIS_WEEKEND);

function findFirstEventPage(): string | null {
  const eventsDir = join(DIST, "events");
  if (!existsSync(eventsDir)) return null;
  for (const slug of readdirSync(eventsDir)) {
    const candidate = join(eventsDir, slug, "index.html");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

describe.skipIf(!distAvailable)("S155 SEO regression guards on /en/this-weekend/", () => {
  test("/en/this-weekend/ emits exactly one <h1> tag", () => {
    const html = readFileSync(EN_THIS_WEEKEND, "utf8");
    const matches = html.match(/<h1[\s>]/g) || [];
    expect(matches.length).toBe(1);
  });

  test('/en/this-weekend/ <title> does NOT contain " | agent-athens" suffix', () => {
    const html = readFileSync(EN_THIS_WEEKEND, "utf8");
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![1]).not.toContain(" | agent-athens");
  });

  test("/en/this-weekend/ <title> length is ≤ 100 chars (GEO-accepted EN-only overage)", () => {
    // Post-strip target: ~83 chars (the GEO-locked titleEn literal). 100 is a
    // generous ceiling that allows ~17 chars of margin for any incidental
    // template variation; it primarily catches accidental re-append of suffix.
    const html = readFileSync(EN_THIS_WEEKEND, "utf8");
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    expect(titleMatch![1].length).toBeLessThanOrEqual(100);
  });
});

describe.skipIf(!distAvailable)("S155 hub-scope-only strip — EDP regression guard", () => {
  test('an EDP-side <title> STILL contains " | agent-athens" (strip is hub-only)', () => {
    // GEO ruled hub-scoped. event-page.ts:569 emits its own suffix; the strip
    // must not have cascaded. Pick the first available built event page.
    const eventPage = findFirstEventPage();
    if (!eventPage) {
      // No event pages built yet (e.g. partial build). Skip rather than fail.
      return;
    }
    const html = readFileSync(eventPage, "utf8");
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![1]).toContain(" | agent-athens");
  });
});

if (!distAvailable) {
  describe("S155 SEO regression guards", () => {
    test.skip("dist/ not built — run `bun run build` then re-run this test", () => {});
  });
}
