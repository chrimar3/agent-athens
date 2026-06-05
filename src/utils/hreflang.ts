/**
 * S176 — single hreflang emitter for ALL page surfaces.
 *
 * S144 (GEO 2026-05-21) closed hreflang emission until Greek launches as a
 * real published + indexable + quality-gated product: advertising dormant
 * Greek alternates pollutes the crawl signal (Tier-B axis). The drop landed
 * in page.ts/event-page/content-page/sitemap, but hub-page and venue-page
 * kept local emitters — the lagged parallel surface (same scope-drift class
 * the Sprint-3 retrospective named: "page-template metadata + route-state
 * lifecycle + canonical + hreflang, all four move together").
 *
 * This module makes ungated emission structurally impossible: every surface
 * calls renderHreflangLinks(), and HREFLANG_GATE_OPEN is the single
 * reactivation switch. Flipping it requires a GEO Strategist ruling (the
 * S144 predicate: Greek published + indexable + quality-gated) and
 * reactivates every surface together — never piecemeal (S144 Decision 4).
 *
 * Paired validator: checkUngatedHreflang in schema-completeness.ts FAILs the
 * build if any page emits hreflang/x-default while this gate is closed.
 *
 * @see specs/hreflang-sweep-S176.md
 */

/** Single reactivation switch. Flip ONLY per GEO Strategist ruling. */
export const HREFLANG_GATE_OPEN = false;

export interface HreflangAlternates {
  /** Bare-root Greek URL (no-slash, flat-file-served — per-URL parity). */
  el?: string;
  /** /en/ URL (slash, directory-served — per-URL parity). */
  en?: string;
  /** x-default target (convention: the en URL). */
  xDefault?: string;
}

/**
 * Render the hreflang <link> set for a page, or '' while the gate is closed.
 *
 * Surfaces must interpolate this verbatim (or skip injection when '' — see
 * hub-page.ts). Do NOT hand-roll <link rel="alternate"> anywhere else; the
 * paired validator fails the build on ungated emission.
 */
export function renderHreflangLinks(
  alternates: HreflangAlternates,
  opts?: { gateOverrideForTests?: boolean },
): string {
  const gateOpen = opts?.gateOverrideForTests ?? HREFLANG_GATE_OPEN;
  if (!gateOpen) return '';

  const links: string[] = [];
  if (alternates.el) links.push(`<link rel="alternate" hreflang="el" href="${alternates.el}">`);
  if (alternates.en) links.push(`<link rel="alternate" hreflang="en" href="${alternates.en}">`);
  if (alternates.xDefault) links.push(`<link rel="alternate" hreflang="x-default" href="${alternates.xDefault}">`);
  return links.join('\n  ');
}
