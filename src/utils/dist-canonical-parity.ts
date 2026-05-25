/**
 * Build-time invariant: declared canonical/sitemap URLs MUST equal their
 * 200-served form on Netlify, per-URL (NOT uniform-slash).
 *
 * Bug class this catches: a page declares `<link rel="canonical">` (or sitemap
 * <loc>) pointing at a URL form that Netlify will 301-redirect away from.
 * Search engines treat that as "canonical points at a redirect" and refuse to
 * index — exactly the failure mode that blocked /en/this-weekend on Bing.
 *
 * Derivation rule (Netlify Pretty URLs, per-URL):
 *   /         -> dist/index.html
 *   /PATH/    -> dist/PATH/index.html
 *   /PATH     -> dist/PATH.html       (NOT PATH/index.html — would 301 to /PATH/)
 *
 * LATENT: both-exist shadowing not detected. If a future page declares /PATH/
 * while both dist/PATH/index.html AND dist/PATH.html exist, Netlify serves the
 * flat file at /PATH (200) and 301s /PATH/ -> /PATH. This validator passes
 * because PATH/index.html exists. Not a current-codebase case — no EN hub has
 * a shadowing flat file — so it's a latent class. See patterns.md.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { BASE_URL } from '../config/site-url';

export interface ParityFailure {
  declaredUrl: string;
  source: string;
  declaredPath: string;
  expectedBackingFile: string;
  reason: string;
}

export interface ParityReport {
  passed: number;
  failures: ParityFailure[];
}

/**
 * Pure function — derive the expected dist/ backing file for a URL path,
 * following Netlify Pretty URLs disambiguation.
 */
export function expectedBackingFile(urlPath: string): string {
  const path = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
  if (path === '') return 'index.html';
  if (path.endsWith('/')) return `${path}index.html`;
  return `${path}.html`;
}

/**
 * Strip BASE_URL prefix from a declared URL. Returns null if the URL is
 * external (not our domain) — those are out of scope for the invariant.
 */
function urlToPath(declaredUrl: string): string | null {
  if (declaredUrl === BASE_URL || declaredUrl === `${BASE_URL}/`) return '/';
  if (!declaredUrl.startsWith(`${BASE_URL}/`)) return null;
  return declaredUrl.slice(BASE_URL.length);
}

/** Recursively walk a directory, yielding full file paths. */
function* walkFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkFiles(full);
    } else {
      yield full;
    }
  }
}

const CANONICAL_RE = /<link\s+rel="canonical"\s+href="([^"]+)"/;
const LOC_RE = /<loc>([^<]+)<\/loc>/g;

function checkDeclaredUrl(
  declaredUrl: string,
  source: string,
  distDir: string,
  failures: ParityFailure[],
): boolean {
  const path = urlToPath(declaredUrl);
  if (path === null) return true;

  const expected = expectedBackingFile(path);
  const expectedFull = join(distDir, expected);
  if (existsSync(expectedFull)) return true;

  const inverse = path.endsWith('/')
    ? `${path.slice(0, -1)}.html`
    : `${path.slice(1)}/index.html`;
  const inverseFull = join(distDir, inverse);
  const foundInverse = existsSync(inverseFull);

  failures.push({
    declaredUrl,
    source: relative(distDir, source) || source,
    declaredPath: path,
    expectedBackingFile: expected,
    reason: foundInverse
      ? `declares ${path} but backing file is ${inverse} — would 301 to ${path.endsWith('/') ? path.slice(0, -1) : path + '/'}`
      : `declares ${path} but neither ${expected} nor ${inverse} exists`,
  });
  return false;
}

/**
 * Walk dist/ and validate every canonical-bearing artifact (HTML <link rel="canonical">
 * and sitemap <loc>). IndexNow inherits from sitemap so is covered transitively.
 *
 * Special files (robots.txt, llms.txt, *.json, *.txt) are excluded by NOT being
 * canonical-bearing — they never enter the loop, so no allowlist is needed.
 */
export function validateDistCanonicalParity(distDir: string): ParityReport {
  const failures: ParityFailure[] = [];
  let passed = 0;

  for (const file of walkFiles(distDir)) {
    if (file.endsWith('.html')) {
      const content = readFileSync(file, 'utf-8');
      const match = CANONICAL_RE.exec(content);
      if (!match) continue;
      if (checkDeclaredUrl(match[1], file, distDir, failures)) passed++;
    } else if (/sitemap-(events|venues|editorial)\.xml$/.test(file)) {
      // Only the page-bearing sitemaps (events/venues/editorial). sitemap-index.xml
      // references other sitemap files, not HTML pages — out of scope by construction.
      const content = readFileSync(file, 'utf-8');
      LOC_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = LOC_RE.exec(content)) !== null) {
        if (checkDeclaredUrl(m[1], file, distDir, failures)) passed++;
      }
    }
  }

  return { passed, failures };
}
