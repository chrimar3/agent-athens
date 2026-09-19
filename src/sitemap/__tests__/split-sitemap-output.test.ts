import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import type { ContentHashManifest } from '../content-hasher';

const ROOT = resolve(import.meta.dir, '../../..');
let fixture: string;
let generate: typeof import('../generate-sitemaps').generateSplitSitemaps;
const manifest: ContentHashManifest = { version: 1, generatedAt: '', entries: {} };

beforeAll(async () => {
  // Copy the real dependency-light generator so import.meta.dir writes only to
  // this fixture's dist. No mock or production build artifact is involved.
  fixture = mkdtempSync(join(tmpdir(), 'aa-split-sitemap-'));
  for (const path of ['src/sitemap/generate-sitemaps.ts', 'src/utils/write-if-changed.ts', 'src/config/site-url.ts']) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(fixture, path));
  }
  generate = (await import(join(fixture, 'src/sitemap/generate-sitemaps.ts'))).generateSplitSitemaps;
});

afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function emittedUrls(): string[] {
  return ['events', 'venues', 'editorial'].flatMap(bucket => {
    const xml = readFileSync(join(fixture, `dist/sitemap-${bucket}.xml`), 'utf8');
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  });
}

describe('split sitemap output', () => {
  test('writes each published URL once even when multiple generators register it', () => {
    generate(['index', 'index', 'en/today/', 'en/today/', 'venues/test/', 'venues/test/'], manifest);
    expect(emittedUrls()).toEqual([
      'https://agentathens.com/venues/test/',
      'https://agentathens.com',
      'https://agentathens.com/en/today/',
    ]);
  });

  test('reports only emitted URLs after duplicate and dormant-locale exclusions', () => {
    const count = generate([
      'index', 'index', 'events/test/', 'en/events/test/',
      'today', 'en/today/', 'about/', 'en/about/',
    ], manifest, undefined, new Set(['test']), new Set(['today']));
    expect(emittedUrls()).toEqual([
      'https://agentathens.com/en/events/test/',
      'https://agentathens.com',
      'https://agentathens.com/en/today/',
      'https://agentathens.com/en/about/',
    ]);
    expect(count).toBe(4);
  });
});
