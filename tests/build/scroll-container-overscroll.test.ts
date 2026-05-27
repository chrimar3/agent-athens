import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const distDir = join(import.meta.dir, "..", "..", "dist");
const cssPath = join(distDir, "styles", "design-system.css");
const distAvailable = existsSync(cssPath);
const css = distAvailable ? readFileSync(cssPath, "utf-8") : "";

describe.skipIf(!distAvailable)(".filter-bar-scroll: iOS overscroll/touch guards", () => {
  const match = css.match(/\.filter-bar-scroll\s*\{([^}]*)\}/);
  const body = match?.[1];

  test(".filter-bar-scroll rule present in built CSS", () => {
    expect(body).toBeDefined();
  });

  test(".filter-bar-scroll declares overscroll-behavior-x: contain", () => {
    expect(body).toMatch(/overscroll-behavior-x:\s*contain/);
  });

  test(".filter-bar-scroll declares touch-action: pan-x", () => {
    expect(body).toMatch(/touch-action:\s*pan-x/);
  });
});

describe.skipIf(!distAvailable)(".category-nav: iOS overscroll/touch guards", () => {
  const match = css.match(/\.category-nav\s*\{([^}]*)\}/);
  const body = match?.[1];

  test(".category-nav rule present in built CSS", () => {
    expect(body).toBeDefined();
  });

  test(".category-nav declares overscroll-behavior-x: contain", () => {
    expect(body).toMatch(/overscroll-behavior-x:\s*contain/);
  });

  test(".category-nav declares touch-action: pan-x", () => {
    expect(body).toMatch(/touch-action:\s*pan-x/);
  });
});
