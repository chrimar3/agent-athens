// D11 sweep 2026-05-12 surfaced og:url/canonical drift on English cornerstone
// pages: canonical had /en/ prefix (post-fixed by hub generator regex-replace),
// og:url and JSON-LD CollectionPage.url did not (template-level emission was
// not locale-aware). Root fix applied at template level; this assertion locks
// build-output parity on the four cornerstone hubs in both locales.
//
// Build-output assertion. Skipped when dist/ is not built —
// run `bun run build` (or src/generate-site.ts) first to populate dist/.

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const DIST = join(import.meta.dir, "..", "..", "dist");
const CORNERSTONES = ["this-weekend", "today", "this-month", "open"] as const;

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

function extractJsonLdUrl(html: string): string | undefined {
  const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]).url;
  } catch {
    return undefined;
  }
}

describe.skipIf(!distAvailable)("og:url / canonical / JSON-LD parity on cornerstone hubs", () => {
  for (const hub of CORNERSTONES) {
    test(`English /en/${hub}/ — canonical, og:url, JSON-LD url all match with /en/ prefix`, () => {
      const html = readFileSync(join(DIST, "en", hub, "index.html"), "utf8");
      const canonical = extractCanonical(html);
      const ogUrl = extractOgUrl(html);
      const ogLocale = extractOgLocale(html);
      const jsonLdUrl = extractJsonLdUrl(html);

      expect(canonical).toBeDefined();
      expect(canonical).toContain("/en/");
      expect(ogUrl).toBe(canonical);
      expect(jsonLdUrl).toBe(canonical);
      expect(ogLocale).toBe("en_US");
    });
  }

  // Greek cornerstones are emitted as flat dist/<hub>.html files (not subdirectories)
  // — the English subdirectory shape is en-only. Verified 2026-05-13 against build output.
  for (const hub of CORNERSTONES) {
    test(`Greek /${hub} — canonical, og:url, JSON-LD url all match without /en/ prefix`, () => {
      const html = readFileSync(join(DIST, `${hub}.html`), "utf8");
      const canonical = extractCanonical(html);
      const ogUrl = extractOgUrl(html);
      const ogLocale = extractOgLocale(html);
      const jsonLdUrl = extractJsonLdUrl(html);

      expect(canonical).toBeDefined();
      expect(canonical).not.toContain("/en/");
      expect(ogUrl).toBe(canonical);
      expect(jsonLdUrl).toBe(canonical);
      expect(ogLocale).toBe("el_GR");
    });
  }
});

if (!distAvailable) {
  describe("og:url / canonical / JSON-LD parity on cornerstone hubs", () => {
    test.skip("dist/ not built — run `bun run build` then re-run this test", () => {});
  });
}
