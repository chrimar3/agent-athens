import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const distDir = join(import.meta.dir, "..", "..", "dist");
const cssPath = join(distDir, "styles", "design-system.css");
const distAvailable = existsSync(cssPath);

function collectHtmlFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlFiles(p, out);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

function findInlineCategoryNavItemRule(): { file: string; snippet: string } | null {
  for (const file of collectHtmlFiles(distDir)) {
    const html = readFileSync(file, "utf-8");
    const styleBlocks = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];
    for (const block of styleBlocks) {
      if (/\.category-nav-item\s*[{,.:]/.test(block)) {
        return { file, snippet: block.slice(0, 240) };
      }
    }
  }
  return null;
}

describe.skipIf(!distAvailable)("category-nav readability: extraction + flex/nowrap fix", () => {
  const css = distAvailable ? readFileSync(cssPath, "utf-8") : "";
  const itemMatch = css.match(/\.category-nav-item\s*\{([^}]*)\}/);
  const itemBody = itemMatch?.[1] ?? "";
  const navMatch = css.match(/\.category-nav\s*\{([^}]*)\}/);
  const navBody = navMatch?.[1] ?? "";

  test("1. .category-nav-item rule exists in dist/styles/design-system.css", () => {
    expect(itemMatch).not.toBeNull();
  });

  test("2. .category-nav-item declares flex: 0 0 auto (or shrink/grow:0 equivalent)", () => {
    const hasShorthand = /flex:\s*0\s+0\s+auto/.test(itemBody);
    const hasLonghand = /flex-shrink:\s*0/.test(itemBody) && /flex-grow:\s*0/.test(itemBody);
    expect(hasShorthand || hasLonghand).toBe(true);
  });

  test("3. .category-nav-item declares white-space: nowrap", () => {
    expect(itemBody).toMatch(/white-space:\s*nowrap/);
  });

  test("4. .category-nav-item does NOT declare border-radius: 50% (circle guard)", () => {
    expect(itemBody).not.toMatch(/border-radius:\s*50%/);
  });

  test("5. .category-nav-item does NOT declare aspect-ratio: 1 (square-pill guard)", () => {
    expect(itemBody).not.toMatch(/aspect-ratio:\s*1(\s|;|$)/);
  });

  test("6. .category-nav-item does NOT declare a fixed width/min-width in px (fixed-size guard)", () => {
    expect(itemBody).not.toMatch(/(?:^|[\s;]) ?width:\s*\d+px/);
    expect(itemBody).not.toMatch(/min-width:\s*\d+px/);
  });

  test("7. .category-nav rule still carries Session 1.5 overscroll guards", () => {
    expect(navBody).toMatch(/overscroll-behavior-x:\s*contain/);
    expect(navBody).toMatch(/touch-action:\s*pan-x/);
  });

  test("8. No built HTML page contains an inline <style> block with .category-nav-item rules (extraction completed)", () => {
    const leftover = findInlineCategoryNavItemRule();
    if (leftover) {
      throw new Error(
        `Inline .category-nav-item rule still present in ${leftover.file}:\n${leftover.snippet}`,
      );
    }
    expect(leftover).toBeNull();
  });
});
