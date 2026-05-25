// D11 sweep 2026-05-12 surfaced og:url/canonical drift on English cornerstone
// pages. Initial fix (7966e4455) emitted /en/ self-canonical at template level.
// 2026-05-14: GEO Strategist's canonical-to-root decision for Case B partial-
// coverage state. /en/ pages canonicalize to root counterparts (canonical + og:url
// + JSON-LD url all point to root URL). og:locale:alternate emission removed
// entirely while availableLanguage is single-element. og:locale primary emitted
// locale-correctly at template source.
//
// Rules locked by this verifier:
//   (a) canonical-to-root: for every (root, /en/) pair, all three URL fields
//       (canonical, og:url, JSON-LD `url`) point to the SAME root URL.
//   (b) og:locale:alternate symmetric-absence: not emitted on any page.
//   (c) og:locale primary parity: root pages emit `el_GR`, /en/ pages emit `en_US`.
//
// Coverage: 4 cornerstone hubs + 9 content hubs (13 pairs) + 1 event pair.
//
// Build-output assertion. Skipped when dist/ is not built —
// run `bun run build` first to populate dist/.

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const DIST = join(import.meta.dir, "..", "..", "dist");
const BASE_URL = "https://agentathens.com";

const CORNERSTONE_HUBS = ["this-weekend", "today", "this-month", "open"] as const;
const CONTENT_HUBS = [
  "concerts",
  "theatre",
  "comedy",
  "festivals",
  "classical-music",
  "greek-music",
  "kids",
  "nightlife",
  "with-ticket",
] as const;
const ALL_HUBS = [...CORNERSTONE_HUBS, ...CONTENT_HUBS] as const;

// Event slug with confirmed presence in both `dist/events/<slug>/` and
// `dist/en/events/<slug>/` (verified via Probe 4 in
// specs/en-deployment-state-2026-05-13.md §4).
const EVENT_PAIR_SLUG = "00013a1f--phantom-spell";

const distAvailable = existsSync(DIST) && existsSync(join(DIST, "index.html"));

function extractCanonical(html: string): string | undefined {
  return html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
}

function extractOgUrl(html: string): string | undefined {
  return html.match(/<meta property="og:url" content="([^"]+)">/)?.[1];
}

function extractOgLocale(html: string): string | undefined {
  return html.match(/<meta property="og:locale" content="([^"]+)">/)?.[1];
}

function extractOgLocaleAlternate(html: string): string | undefined {
  return html.match(/<meta property="og:locale:alternate" content="([^"]+)">/)?.[1];
}

// S139: post-envelope migration, the page-canonical entity (Event / CollectionPage)
// lives inside @graph rather than at script-tag top level. Read .url from the
// first @graph member that has a url field. Hub pages without @graph still work
// through the .url top-level fallback (hubs migrate in stage 3).
function extractJsonLdUrl(html: string): string | undefined {
  const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed['@graph'])) {
      const pageCanonical = parsed['@graph'].find((m: any) => typeof m?.url === 'string');
      return pageCanonical?.url;
    }
    return parsed.url;
  } catch {
    return undefined;
  }
}

// Greek hubs render as flat `dist/<hub>.html` files;
// English hubs render as `dist/en/<hub>/index.html` subdirectories.
// Event pages render as `dist/events/<slug>/index.html` (root) and
// `dist/en/events/<slug>/index.html` (/en/) — both subdirectory shape.
function rootHubPath(hub: string): string {
  return join(DIST, `${hub}.html`);
}
function englishHubPath(hub: string): string {
  return join(DIST, "en", hub, "index.html");
}
function rootEventPath(slug: string): string {
  return join(DIST, "events", slug, "index.html");
}
function englishEventPath(slug: string): string {
  return join(DIST, "en", "events", slug, "index.html");
}

describe.skipIf(!distAvailable)("og:url / canonical / JSON-LD parity — locale-aware self posture (S144 GEO 2026-05-21)", () => {
  // S144 supersedes the 2026-05-14 canonical-to-root decision. /en/ pages now
  // self-canonical to /en/<slug>; bare-root pages self-canonical to bare-root.
  // Closes the cross-locale-canonical regression that excluded /en/ from GSC
  // eligibility. See decisions.md 2026-05-21.
  for (const hub of ALL_HUBS) {
    // Per-URL parity (S153 2026-05-23): EL hubs serve at /<hub> (flat-file
    // dist/<hub>.html), EN hubs serve at /en/<hub>/ (directory
    // dist/en/<hub>/index.html). Declared canonical/og:url/JSON-LD url MUST
    // match each surface's 200-served form per the dist-canonical-parity invariant.
    const rootUrl = `${BASE_URL}/${hub}`;
    const enUrl = `${BASE_URL}/en/${hub}/`;

    test(`Root hub /${hub} — canonical = og:url = JSON-LD url = root URL (self)`, () => {
      const html = readFileSync(rootHubPath(hub), "utf8");
      const canonical = extractCanonical(html);
      const ogUrl = extractOgUrl(html);
      const jsonLdUrl = extractJsonLdUrl(html);

      expect(canonical).toBe(rootUrl);
      expect(ogUrl).toBe(rootUrl);
      expect(jsonLdUrl).toBe(rootUrl);
    });

    test(`English hub /en/${hub}/ — canonical = og:url = JSON-LD url = /en/ URL (self per S144)`, () => {
      const html = readFileSync(englishHubPath(hub), "utf8");
      const canonical = extractCanonical(html);
      const ogUrl = extractOgUrl(html);
      const jsonLdUrl = extractJsonLdUrl(html);

      expect(canonical).toBe(enUrl);
      expect(canonical).toContain("/en/");
      expect(ogUrl).toBe(enUrl);
      expect(jsonLdUrl).toBe(enUrl);
    });
  }

  // /en/ event pair: self-canonical to /en/...
  const eventRootUrl = `${BASE_URL}/events/${EVENT_PAIR_SLUG}/`;
  const eventEnUrl = `${BASE_URL}/en/events/${EVENT_PAIR_SLUG}/`;

  test(`Root event /events/${EVENT_PAIR_SLUG}/ — canonical = og:url = JSON-LD url = root URL (self)`, () => {
    const html = readFileSync(rootEventPath(EVENT_PAIR_SLUG), "utf8");
    const canonical = extractCanonical(html);
    const ogUrl = extractOgUrl(html);
    const jsonLdUrl = extractJsonLdUrl(html);

    expect(canonical).toBe(eventRootUrl);
    expect(ogUrl).toBe(eventRootUrl);
    expect(jsonLdUrl).toBe(eventRootUrl);
  });

  test(`English event /en/events/${EVENT_PAIR_SLUG}/ — canonical = og:url = JSON-LD url = /en/ URL (self per S144)`, () => {
    const html = readFileSync(englishEventPath(EVENT_PAIR_SLUG), "utf8");
    const canonical = extractCanonical(html);
    const ogUrl = extractOgUrl(html);
    const jsonLdUrl = extractJsonLdUrl(html);

    expect(canonical).toBe(eventEnUrl);
    expect(canonical).toContain("/en/");
    expect(ogUrl).toBe(eventEnUrl);
    expect(jsonLdUrl).toBe(eventEnUrl);
  });

  // Rule (b): og:locale:alternate symmetric-absence on all pages
  for (const hub of ALL_HUBS) {
    test(`Root hub /${hub} — no og:locale:alternate emitted`, () => {
      const html = readFileSync(rootHubPath(hub), "utf8");
      expect(extractOgLocaleAlternate(html)).toBeUndefined();
    });

    test(`English hub /en/${hub}/ — no og:locale:alternate emitted`, () => {
      const html = readFileSync(englishHubPath(hub), "utf8");
      expect(extractOgLocaleAlternate(html)).toBeUndefined();
    });
  }

  test(`Root event /events/${EVENT_PAIR_SLUG}/ — no og:locale:alternate emitted`, () => {
    const html = readFileSync(rootEventPath(EVENT_PAIR_SLUG), "utf8");
    expect(extractOgLocaleAlternate(html)).toBeUndefined();
  });

  test(`English event /en/events/${EVENT_PAIR_SLUG}/ — no og:locale:alternate emitted`, () => {
    const html = readFileSync(englishEventPath(EVENT_PAIR_SLUG), "utf8");
    expect(extractOgLocaleAlternate(html)).toBeUndefined();
  });

  // Rule (c): og:locale primary parity
  for (const hub of ALL_HUBS) {
    test(`Root hub /${hub} — og:locale = el_GR`, () => {
      const html = readFileSync(rootHubPath(hub), "utf8");
      expect(extractOgLocale(html)).toBe("el_GR");
    });

    test(`English hub /en/${hub}/ — og:locale = en_US`, () => {
      const html = readFileSync(englishHubPath(hub), "utf8");
      expect(extractOgLocale(html)).toBe("en_US");
    });
  }

  test(`Root event /events/${EVENT_PAIR_SLUG}/ — og:locale = el_GR`, () => {
    const html = readFileSync(rootEventPath(EVENT_PAIR_SLUG), "utf8");
    expect(extractOgLocale(html)).toBe("el_GR");
  });

  test(`English event /en/events/${EVENT_PAIR_SLUG}/ — og:locale = en_US`, () => {
    const html = readFileSync(englishEventPath(EVENT_PAIR_SLUG), "utf8");
    expect(extractOgLocale(html)).toBe("en_US");
  });
});

if (!distAvailable) {
  describe("og:url / canonical / JSON-LD parity — canonical-to-root posture", () => {
    test.skip("dist/ not built — run `bun run build` then re-run this test", () => {});
  });
}
