import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DateTime } from 'luxon';

export interface HashEntry {
  hash: string;
  lastModified: string;
}

export interface ContentHashManifest {
  version: 1;
  generatedAt: string;
  entries: Record<string, HashEntry>;
}

const MANIFEST_PATH = join(import.meta.dir, '../../data/content-hashes.json');

/**
 * Strip volatile content that changes every build regardless of actual content.
 * These patterns inject today's date/time into HTML during generation,
 * so they'd cause every page hash to differ on every build.
 */
export function stripVolatileContent(html: string): string {
  return html
    // <meta name="date" content="2026-03-02">
    .replace(/<meta\s+name="date"\s+content="[^"]*">/g, '')
    // <meta name="last-modified" content="...">
    .replace(/<meta\s+name="last-modified"\s+content="[^"]*">/g, '')
    // <span class="last-update">...</span>
    .replace(/<span\s+class="last-update">[\s\S]*?<\/span>/g, '')
    // "datePublished": "..." in JSON-LD
    .replace(/"datePublished"\s*:\s*"[^"]*"/g, '')
    // "dateModified": "..." in JSON-LD
    .replace(/"dateModified"\s*:\s*"[^"]*"/g, '')
    // "lastUpdate": "..." in JSON API blocks
    .replace(/"lastUpdate"\s*:\s*"[^"]*"/g, '');
}

/**
 * Hash page content after stripping volatile elements.
 * SHA-256 truncated to 16 hex chars (64-bit) — sufficient for change detection.
 */
export function hashContent(html: string): string {
  const stable = stripVolatileContent(html);
  return createHash('sha256').update(stable).digest('hex').substring(0, 16);
}

/**
 * Load the previous content-hash manifest from disk.
 * Returns an empty manifest on first run (bootstrap).
 */
export function loadManifest(path?: string): ContentHashManifest {
  const manifestPath = path ?? MANIFEST_PATH;
  if (!existsSync(manifestPath)) {
    return { version: 1, generatedAt: '', entries: {} };
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

/**
 * Determine the correct lastModified date for a URL.
 * - Hash unchanged → preserve the old date (truthful lastmod)
 * - Hash changed or new URL → today in Europe/Athens timezone
 */
export function resolveLastModified(
  urlPath: string,
  currentHash: string,
  previousManifest: ContentHashManifest
): string {
  const prev = previousManifest.entries[urlPath];
  if (prev && prev.hash === currentHash) {
    return prev.lastModified;
  }
  return DateTime.now().setZone('Europe/Athens').toISODate()!;
}

/**
 * Save the updated manifest to disk.
 */
export function saveManifest(manifest: ContentHashManifest, path?: string): void {
  const manifestPath = path ?? MANIFEST_PATH;
  manifest.generatedAt = DateTime.now().setZone('Europe/Athens').toISO()!;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
