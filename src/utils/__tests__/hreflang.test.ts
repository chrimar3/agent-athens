// =============================================================================
// S176 — single hreflang emitter, gate-closed parity with page.ts (S144)
//
// S144 closed hreflang on page.ts/event-page/content-page; hub-page and
// venue-page kept ungated emitters (the lagged parallel surface — the same
// scope-drift class the Sprint-3 retrospective named). This helper makes
// ungated emission structurally impossible: every surface routes through
// renderHreflangLinks, and HREFLANG_GATE_OPEN is the single reactivation
// switch (S144 Decision 4: surfaces reactivate together, never piecemeal).
//
// The assertion is parity with page.ts's gate-closed output (''), NOT
// hardcoded hreflang removal — when the gate opens (Greek published +
// indexable + quality-gated, GEO Strategist ruling required), the same
// helper emits the full alternate set.
//
// @see specs/hreflang-sweep-S176.md
// =============================================================================

import { describe, test, expect } from "bun:test";
import { HREFLANG_GATE_OPEN, renderHreflangLinks } from "../hreflang";

describe("renderHreflangLinks — S176 gate-closed parity", () => {
  test("gate is closed (Greek dormant — flip requires GEO Strategist ruling)", () => {
    expect(HREFLANG_GATE_OPEN).toBe(false);
  });

  test("gate-closed: emits '' regardless of alternates offered (page.ts parity)", () => {
    expect(
      renderHreflangLinks({
        el: "https://agentathens.com/concerts",
        en: "https://agentathens.com/en/concerts/",
        xDefault: "https://agentathens.com/en/concerts/",
      }),
    ).toBe("");
    expect(renderHreflangLinks({ el: "https://agentathens.com/venues/x/" })).toBe("");
    expect(renderHreflangLinks({})).toBe("");
  });

  test("reactivation contract: gate-open emission shape is preserved (not deleted)", () => {
    // Exercise the gate-open branch via the test-only override so the
    // emission logic can't rot while the gate is closed.
    const html = renderHreflangLinks(
      {
        el: "https://agentathens.com/concerts",
        en: "https://agentathens.com/en/concerts/",
        xDefault: "https://agentathens.com/en/concerts/",
      },
      { gateOverrideForTests: true },
    );
    expect(html).toContain('hreflang="el" href="https://agentathens.com/concerts"');
    expect(html).toContain('hreflang="en" href="https://agentathens.com/en/concerts/"');
    expect(html).toContain('hreflang="x-default" href="https://agentathens.com/en/concerts/"');
  });

  test("gate-open: omits alternates not offered (venue passes el only)", () => {
    const html = renderHreflangLinks(
      { el: "https://agentathens.com/venues/gazarte/" },
      { gateOverrideForTests: true },
    );
    expect(html).toContain('hreflang="el"');
    expect(html).not.toContain('hreflang="en"');
    expect(html).not.toContain("x-default");
  });
});
