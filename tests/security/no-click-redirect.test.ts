/**
 * Security loop round 5 — the unused /go/ click redirect is gone.
 *
 * netlify/functions/go.ts was deployed with the site but no template linked to
 * /go/. It let anyone write unauthenticated, unrate-limited records to the
 * Netlify Blobs "clicks" store and bounce visitors through agentathens.com to
 * any page on a list of ticketing and social domains (including user-generated
 * pages). Nothing used it, so it was removed rather than hardened. These pins
 * keep it from coming back unnoticed: a new function needs a deliberate change
 * to this test (netlify/** is a protected path either way).
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|js|html|css|json|txt|xml)$/.test(name)) out.push(p);
  }
  return out;
}

describe('the /go/ click redirect', () => {
  test('netlify/functions/go.ts does not exist and no serverless function is deployed', () => {
    expect(existsSync(join(ROOT, 'netlify', 'functions', 'go.ts'))).toBe(false);
    const fnDir = join(ROOT, 'netlify', 'functions');
    expect(existsSync(fnDir) ? readdirSync(fnDir) : []).toEqual([]);
  });

  test('netlify.toml declares no functions directory and no /go route', () => {
    const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf-8');
    expect(toml).not.toMatch(/^\s*\[functions\]/m);
    expect(toml).not.toMatch(/["']\/go[/"']/);
  });

  test('no template, generator or static file links to /go/', () => {
    const hits = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'static'))]
      .filter((f) => /["'`(]\/go\//.test(readFileSync(f, 'utf-8')));
    expect(hits).toEqual([]);
  });
});
