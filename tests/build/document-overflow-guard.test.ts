import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const cssPath = join(import.meta.dir, "..", "..", "dist", "styles", "design-system.css");
const distAvailable = existsSync(cssPath);

describe.skipIf(!distAvailable)("document-level horizontal-overflow guard", () => {
  const css = distAvailable ? readFileSync(cssPath, "utf-8") : "";

  // Match the html, body rule and capture its body for declaration checks.
  // The leading boundary (start-of-file or close-brace) prevents matching
  // a tail like `.foo html, body { ... }` if someone ever writes one.
  const htmlBodyRule = css.match(
    /(?:^|\})\s*html\s*,\s*body\s*\{([^}]*)\}/
  );

  test("html, body rule exists in built CSS", () => {
    expect(htmlBodyRule).not.toBeNull();
  });

  test("html, body declares overflow-x: clip", () => {
    expect(htmlBodyRule?.[1]).toMatch(/overflow-x:\s*clip/);
  });
});
