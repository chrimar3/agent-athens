import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  expectedBackingFile,
  validateDistCanonicalParity,
} from '../dist-canonical-parity';

describe('expectedBackingFile — Netlify Pretty URLs derivation', () => {
  test('root path returns index.html', () => {
    expect(expectedBackingFile('/')).toBe('index.html');
    expect(expectedBackingFile('')).toBe('index.html');
  });

  test('trailing-slash path returns PATH/index.html', () => {
    expect(expectedBackingFile('/en/this-weekend/')).toBe('en/this-weekend/index.html');
    expect(expectedBackingFile('/events/foo/')).toBe('events/foo/index.html');
  });

  test('no-trailing-slash path returns PATH.html (flat file)', () => {
    expect(expectedBackingFile('/this-weekend')).toBe('this-weekend.html');
    expect(expectedBackingFile('/today')).toBe('today.html');
  });

  test('leading-slash-stripped path is normalized', () => {
    expect(expectedBackingFile('en/foo/')).toBe('en/foo/index.html');
    expect(expectedBackingFile('foo')).toBe('foo.html');
  });
});

describe('validateDistCanonicalParity — per-URL parity', () => {
  let tmpDist: string;

  beforeEach(() => {
    tmpDist = join(tmpdir(), `parity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDist, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDist, { recursive: true, force: true });
  });

  function writeHtml(relPath: string, canonicalHref: string): void {
    const full = join(tmpDist, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, `<!DOCTYPE html><html><head><link rel="canonical" href="${canonicalHref}"></head><body></body></html>`);
  }

  function writeSitemap(relPath: string, locs: string[]): void {
    const full = join(tmpDist, relPath);
    const entries = locs.map(l => `  <url><loc>${l}</loc></url>`).join('\n');
    writeFileSync(full, `<?xml version="1.0"?><urlset>\n${entries}\n</urlset>`);
  }

  test('EN directory layout with slash canonical PASSES', () => {
    writeHtml('en/this-weekend/index.html', 'https://agentathens.com/en/this-weekend/');
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(1);
  });

  test('EL flat-file layout with no-slash canonical PASSES (parity)', () => {
    writeHtml('this-weekend.html', 'https://agentathens.com/this-weekend');
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(1);
  });

  test('homepage at dist/index.html with bare base URL canonical PASSES', () => {
    writeHtml('index.html', 'https://agentathens.com/');
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(1);
  });

  test('EN directory layout with no-slash canonical FAILS — the bug class', () => {
    writeHtml('en/this-weekend/index.html', 'https://agentathens.com/en/this-weekend');
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].declaredPath).toBe('/en/this-weekend');
    expect(report.failures[0].expectedBackingFile).toBe('en/this-weekend.html');
    expect(report.failures[0].reason).toContain('would 301 to /en/this-weekend/');
  });

  test('EL flat-file layout with slash canonical FAILS (inverse bug)', () => {
    writeHtml('this-weekend.html', 'https://agentathens.com/this-weekend/');
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].reason).toContain('would 301 to /this-weekend');
  });

  test('sitemap <loc> with mismatched form FAILS', () => {
    writeHtml('en/this-weekend/index.html', 'https://agentathens.com/en/this-weekend/');
    writeSitemap('sitemap-editorial.xml', [
      'https://agentathens.com/en/this-weekend',
    ]);
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].source).toBe('sitemap-editorial.xml');
    expect(report.failures[0].declaredPath).toBe('/en/this-weekend');
  });

  test('external URLs in sitemap are skipped (out of scope)', () => {
    writeSitemap('sitemap-editorial.xml', [
      'https://example.com/external',
      'https://other-domain.org/page/',
    ]);
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toEqual([]);
  });

  test('HTML without canonical is skipped (not in scope)', () => {
    writeFileSync(join(tmpDist, 'no-canonical.html'), '<html><body>No canonical here</body></html>');
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(0);
  });

  test('mixed dist: EN-slash + EL-no-slash both pass simultaneously', () => {
    writeHtml('en/today/index.html', 'https://agentathens.com/en/today/');
    writeHtml('today.html', 'https://agentathens.com/today');
    writeSitemap('sitemap-editorial.xml', [
      'https://agentathens.com/en/today/',
      'https://agentathens.com/today',
    ]);
    const report = validateDistCanonicalParity(tmpDist);
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(4);
  });
});
