import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const cssPath = join(import.meta.dir, "..", "..", "dist", "styles", "design-system.css");
const distAvailable = existsSync(cssPath);

describe.skipIf(!distAvailable)("homepage hero-picks: iOS overscroll/touch guards", () => {
  const css = distAvailable ? readFileSync(cssPath, "utf-8") : "";

  // Find all .hero-picks { ... } rule bodies, then pick the one whose body
  // contains `flex-direction: row` — that's unique to the mobile override
  // (the base rule at ~line 2013 has `flex-direction: column`). Anchoring on
  // the @media query directly is unreliable because there are multiple
  // @media (max-width: 1024px) blocks in the file.
  const allPicksBlocks = Array.from(
    css.matchAll(/\.hero-picks\s*\{([^}]*)\}/g)
  );
  const mobilePicksBody = allPicksBlocks
    .map((m) => m[1])
    .find((body) => /flex-direction:\s*row/.test(body));

  test("mobile .hero-picks block is present in built CSS", () => {
    expect(mobilePicksBody).toBeDefined();
  });

  test("mobile .hero-picks declares overscroll-behavior-x: contain", () => {
    expect(mobilePicksBody).toMatch(/overscroll-behavior-x:\s*contain/);
  });

  test("mobile .hero-picks declares touch-action: pan-x", () => {
    expect(mobilePicksBody).toMatch(/touch-action:\s*pan-x/);
  });
});
