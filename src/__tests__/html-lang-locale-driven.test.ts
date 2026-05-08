/**
 * Regression test (S101a-1): catches new hardcoded `<html lang="xx">` values
 * being added to template emissions in src/. Designed to fire at write-time
 * rather than at the next manual audit.
 *
 * Allowlist below covers known single-locale Greek-only generators where
 * lang="el" matches the emitted content language. They are NOT locale-aware
 * templates — they are functions that produce Greek-content pages with no
 * locale parameter. If any of them becomes locale-aware (i.e. starts taking
 * a locale parameter and emitting variable content), remove it from the
 * allowlist so this test catches the now-inconsistent hardcoding.
 *
 * Locale-aware templates (event-page.ts, hub-page.ts, content-page.ts,
 * templates/page.ts) all use `lang="${...}"` and are not matched by the
 * literal-value grep below.
 *
 * Test fixtures and assertions in *.test.ts files are excluded — they are
 * not template emissions, just strings used to test other code.
 */

import { describe, test, expect } from "bun:test";
import { $ } from "bun";

describe("html lang locale-driven (no new hardcoded values in template emissions)", () => {
  test("every hardcoded `<html lang=\"xx\">` in src/ is in the Greek-only-generator allowlist", async () => {
    const allowlist = [
      "src/generate-site.ts",
      "src/generators/venue-page.ts",
    ];

    // Match literal lowercase locale codes only: <html lang="el">, <html lang="en">,
    // etc. Template variables like <html lang="${locale}"> have `$` after the
    // opening quote and don't match [a-z]+.
    const result = await $`grep -rnE '<html lang="[a-z]+"' src/ --include=*.ts --include=*.tsx --include=*.html`
      .nothrow()
      .text();

    const offenders = result
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .filter((line) => !line.includes(".test.ts"))
      .filter((line) => !line.includes(".test.tsx"))
      .filter(
        (line) => !allowlist.some((allowed) => line.startsWith(allowed)),
      );

    expect(offenders).toEqual([]);
  });
});
