import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const distDir = join(import.meta.dir, "..", "..", "dist");
const cssPath = join(distDir, "styles", "design-system.css");
const distAvailable = existsSync(cssPath);

function findFirstCategoryNavHtml(): string | null {
  if (!existsSync(distDir)) return null;
  const entries = readdirSync(distDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
    const filePath = join(distDir, entry.name);
    const contents = readFileSync(filePath, "utf-8");
    if (/\.category-nav\s*\{/.test(contents)) return contents;
  }
  return null;
}

describe.skipIf(!distAvailable)(".filter-bar-scroll: iOS overscroll/touch guards", () => {
  const css = distAvailable ? readFileSync(cssPath, "utf-8") : "";

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

describe.skipIf(!distAvailable)(".category-nav (inline in built HTML): iOS overscroll/touch guards", () => {
  const html = findFirstCategoryNavHtml();

  const match = html?.match(/\.category-nav\s*\{([^}]*)\}/);
  const body = match?.[1];

  test("a built category page with inline .category-nav rule exists", () => {
    expect(html).not.toBeNull();
    expect(body).toBeDefined();
  });

  test("inline .category-nav declares overscroll-behavior-x: contain", () => {
    expect(body).toMatch(/overscroll-behavior-x:\s*contain/);
  });

  test("inline .category-nav declares touch-action: pan-x", () => {
    expect(body).toMatch(/touch-action:\s*pan-x/);
  });
});
