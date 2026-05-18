/**
 * WCAG AA contrast safety net for event-type badges.
 *
 * Enforces that every EventType union member with a corresponding `--color-<type>`
 * declaration in src/styles/design-system.css meets WCAG AA contrast (4.5:1) when
 * paired with the text color it actually renders with at runtime:
 *   - LIGHT_TEXT_BADGES members → paired with #f0f0f0 (light text)
 *   - all other types          → paired with #0d0d0d (the default dark text on bright)
 *
 * FAIL: ratio < 4.5:1 — WCAG AA failure.
 * WARN: ratio ≥ 4.5:1 but < 5.0:1 — palette drift early warning. Surfaces a hex
 *       that is one design tweak away from crossing the AA floor before it does.
 *
 * Background: audit specs/event-type-badge-color-audit-2026-05-14.md found three
 * production AA failures in `LIGHT_TEXT_BADGES` (performance 1.76:1, cinema
 * 2.44:1, screening — non-EventType ghost). Fix Vector A landed 2026-05-18 by
 * emptying the set; this test prevents recurrence and flags drift before the
 * next failure crosses the threshold (theater currently sits at ~4.87:1 — WARN).
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { LIGHT_TEXT_BADGES } from "../page";
import type { EventType } from "../../types";

// ── WCAG 2.x relative-luminance + contrast helpers ──────────────────

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.trim().toUpperCase().replace(/^#/, "");
  if (cleaned.length !== 6) {
    throw new Error(`Unexpected hex length for ${hex} — expected 6 chars after #`);
  }
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg: string, bg: string): number {
  const lFg = relativeLuminance(hexToRgb(fg));
  const lBg = relativeLuminance(hexToRgb(bg));
  const [light, dark] = lFg > lBg ? [lFg, lBg] : [lBg, lFg];
  return (light + 0.05) / (dark + 0.05);
}

// ── CSS color-token extraction ──────────────────────────────────────

const CSS_PATH = join(import.meta.dir, "../../styles/design-system.css");
const cssSource = readFileSync(CSS_PATH, "utf-8");

function extractColorTokens(css: string): Map<string, string> {
  const map = new Map<string, string>();
  // Match `--color-<name>: #<6-hex>;`. Skips rgba()/hsl()/short-hex declarations
  // naturally — type colors are 6-char hex by convention in this codebase.
  const pattern = /--color-([a-z][a-z0-9-]*)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
  for (const match of css.matchAll(pattern)) {
    const cssName = match[1];                  // e.g. "dj-set"
    const eventTypeKey = cssName.replace(/-/g, "_"); // "dj-set" → "dj_set"
    map.set(eventTypeKey, match[2]);
  }
  return map;
}

const cssColorTokens = extractColorTokens(cssSource);

// ── EventType iteration ─────────────────────────────────────────────
// Runtime list of the EventType union (TS erases the type at runtime).
// `satisfies readonly EventType[]` is the compile-time drift guard: if EventType
// changes upstream and this array falls out of sync, tsc fails before the test runs.

const EVENT_TYPES = [
  "concert",
  "dj_set",
  "exhibition",
  "cinema",
  "theater",
  "festival",
  "performance",
  "show",
  "workshop",
  "tech",
  "dance",
  "other",
] as const satisfies readonly EventType[];

const LIGHT_TEXT = "#f0f0f0"; // applied when type ∈ LIGHT_TEXT_BADGES
const DARK_TEXT = "#0d0d0d";  // default (--text-on-bright)

const AA_MIN = 4.5;
const DRIFT_WARN = 5.0;

// ── Tests ───────────────────────────────────────────────────────────

describe("Event-type badge contrast — WCAG AA", () => {
  for (const eventType of EVENT_TYPES) {
    const bg = cssColorTokens.get(eventType);

    if (!bg) {
      // A type may legitimately lack a --color-<type> var during transition
      // (e.g. before its hex is decided). Skip rather than fail.
      test.skip(`${eventType} — no --color-<type> declared, skipping`, () => {});
      continue;
    }

    const isLightText = LIGHT_TEXT_BADGES.has(eventType);
    const textColor = isLightText ? LIGHT_TEXT : DARK_TEXT;
    const ratio = contrastRatio(textColor, bg);
    const pairing = isLightText ? "light text" : "dark text";

    test(`${eventType} (${bg} + ${pairing}) — ${ratio.toFixed(2)}:1 vs AA floor ${AA_MIN}:1`, () => {
      expect(ratio).toBeGreaterThanOrEqual(AA_MIN);

      if (ratio < DRIFT_WARN) {
        console.warn(
          `[badge-contrast] WARN: ${eventType} contrast is ${ratio.toFixed(2)}:1 — passes AA (≥${AA_MIN}) but below drift threshold (${DRIFT_WARN}). Pair: ${bg} bg + ${textColor} text.`
        );
      }
    });
  }
});
