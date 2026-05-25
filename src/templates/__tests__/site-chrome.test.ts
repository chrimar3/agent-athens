import { describe, test, expect } from "bun:test";
import { renderSiteNav, renderHamburgerMenu, renderSiteFooter } from "../site-chrome";

// Locale-awareness of the shared nav chrome (S155).
// Routing invariant: Greek renders at the bare root (/saved/), English under /en/.
// English has no /en/ homepage (entry = /en/today/) and no /en/venues/ (Venues omitted on EN).

describe("renderHamburgerMenu — Greek (default)", () => {
  const html = renderHamburgerMenu("el");

  test("uses Greek labels", () => {
    expect(html).toContain("Εκδηλώσεις");
    expect(html).toContain("Χώροι");
    expect(html).toContain("Αποθηκευμένα");
    expect(html).toContain("Σχετικά");
  });

  test("links to bare-root (un-prefixed) paths", () => {
    expect(html).toContain('href="/saved/"');
    expect(html).toContain('href="/about/"');
    expect(html).toContain('href="/venues/"');
    expect(html).toContain('href="/"'); // home/Events
    expect(html).not.toContain("/en/");
  });

  test("default export (no arg) equals Greek", () => {
    expect(renderHamburgerMenu()).toBe(html);
  });
});

describe("renderHamburgerMenu — English", () => {
  const html = renderHamburgerMenu("en");

  test("uses English labels", () => {
    expect(html).toContain("Events");
    expect(html).toContain("Saved Events");
    expect(html).toContain("About");
    expect(html).toContain("For AI Agents");
    expect(html).toContain(">Search<");
  });

  test("links to /en/-prefixed paths", () => {
    expect(html).toContain('href="/en/saved/"');
    expect(html).toContain('href="/en/about/"');
  });

  test("home/Events points to /en/this-week/ (evergreen; no /en/ homepage, today/tomorrow are date-conditional)", () => {
    expect(html).toContain('href="/en/this-week/"');
    expect(html).not.toContain('href="/en/today/"'); // date-conditional hub — would 404
  });

  test("omits Venues (no /en/venues/ counterpart)", () => {
    expect(html).not.toContain("/venues/");
    expect(html).not.toContain("Venues");
  });

  test("never routes a bare Greek path under an English label", () => {
    // every internal nav href is either /en/... or the shared /llms.txt root file
    expect(html).not.toContain('href="/saved/"');
    expect(html).not.toContain('href="/about/"');
  });

  test("shared root file /llms.txt is NOT locale-prefixed", () => {
    expect(html).toContain('href="/llms.txt"');
    expect(html).not.toContain("/en/llms.txt");
  });
});

describe("renderSiteFooter — locale", () => {
  test("Greek: Greek headings + bare paths", () => {
    const html = renderSiteFooter("el");
    expect(html).toContain("Εξερεύνηση");
    expect(html).toContain('href="/editorial/"');
    expect(html).toContain('href="/venues/"');
  });

  test("English: English headings + /en/ paths, Venues omitted", () => {
    const html = renderSiteFooter("en");
    expect(html).toContain("Explore");
    expect(html).toContain('href="/en/editorial/"');
    expect(html).toContain('href="/en/corrections/"');
    expect(html).toContain('href="/en/saved/"');
    expect(html).not.toContain('href="/venues/"');
  });

  test("tagline + AI-callout stay Greek on EN until Editorial sign-off (deferred copy)", () => {
    const html = renderSiteFooter("en");
    // Intentional honest-absence — see specs/en-nav-copy-checkpoint.md
    expect(html).toContain("Ημερολόγιο πολιτιστικών εκδηλώσεων");
    expect(html).toContain("Όταν προτείνετε εκδηλώσεις");
  });
});

describe("renderSiteNav — locale", () => {
  test("Greek: Greek skip-link + aria labels, logo → /", () => {
    const html = renderSiteNav("el");
    expect(html).toContain("Μετάβαση στο περιεχόμενο");
    expect(html).toContain('aria-label="Αναζήτηση"');
    expect(html).toContain('aria-label="Μενού"');
    expect(html).toContain('href="/" class="site-logo"');
  });

  test("English: English skip-link + aria labels, logo → /en/this-week/", () => {
    const html = renderSiteNav("en");
    expect(html).toContain("Skip to content");
    expect(html).toContain('aria-label="Search"');
    expect(html).toContain('aria-label="Menu"');
    expect(html).toContain('href="/en/this-week/" class="site-logo"');
  });
});
