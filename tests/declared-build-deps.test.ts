/**
 * The site build copies files straight out of node_modules (e.g. Fuse.js for
 * the search overlay: src/generate-site.ts → dist/scripts/fuse.mjs). A package
 * used that way is never `import`ed, so an "unused dependency" sweep can drop
 * it from package.json (security loop round 1 did exactly that with fuse.js);
 * a clean install — CI, the container image — then breaks the build while any
 * machine with an old node_modules keeps working. Every package the build
 * reads from node_modules must be a declared dependency.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);

function buildSources(): string[] {
  const out = [join(ROOT, 'src', 'generate-site.ts')];
  for (const f of readdirSync(join(ROOT, 'src', 'generators'))) if (f.endsWith('.ts')) out.push(join(ROOT, 'src', 'generators', f));
  return out;
}

describe('packages the site build reads from node_modules are declared', () => {
  test('every node_modules/<pkg>/ path in the build is in package.json', () => {
    const used = new Set<string>();
    for (const file of buildSources()) {
      for (const m of readFileSync(file, 'utf8').matchAll(/node_modules\/((?:@[^/'"`]+\/)?[^/'"`]+)\//g)) used.add(m[1]);
    }
    expect(used.has('fuse.js')).toBe(true); // the known case: search overlay
    expect([...used].filter((p) => !declared.has(p))).toEqual([]);
  });
});
