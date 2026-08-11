import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { loadQuarantine, filterQuarantined } from '../src/utils/quarantine';

const ROOT = resolve(import.meta.dir, '..');

function qFile(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'aa-quar-'));
  const p = join(dir, 'quarantined-sources.json');
  writeFileSync(p, JSON.stringify(content));
  return p;
}

describe('quarantine registry', () => {
  test('loads entries', () => {
    const q = loadQuarantine(qFile({ sources: { clubber: { since: '2026-08-11', reason: 'captcha' } } }));
    expect(q.sources.clubber.reason).toBe('captcha');
  });

  test('missing file → empty registry (never throws)', () => {
    expect(loadQuarantine('/nonexistent/q.json').sources).toEqual({});
  });

  test('malformed file → empty registry (fail-safe: scraping continues)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-quar-'));
    const p = join(dir, 'q.json');
    writeFileSync(p, 'not json');
    expect(loadQuarantine(p).sources).toEqual({});
  });

  test('filterQuarantined removes quarantined ids and keeps the rest', () => {
    const q = loadQuarantine(qFile({ sources: { clubber: { since: '2026-08-11', reason: 'captcha' } } }));
    expect(filterQuarantined(['athinorama', 'clubber', 'more'], q)).toEqual(['athinorama', 'more']);
  });

  test('empty registry filters nothing', () => {
    const q = loadQuarantine(qFile({ sources: {} }));
    expect(filterQuarantined(['athinorama', 'clubber'], q)).toEqual(['athinorama', 'clubber']);
  });
});

describe('consumers are wired (pins)', () => {
  test('scrape-all consults the quarantine before running sources', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'scrape-all.ts'), 'utf8');
    expect(src).toContain('filterQuarantined(');
  });

  test('deadSourcesSignal excludes already-quarantined sources (no repeat alert spam)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'deadman-watchdog.ts'), 'utf8');
    expect(src).toContain('filterQuarantined(');
  });

  test('seed registry exists and quarantines clubber (captcha-dead since 2026-07-29, S222)', () => {
    const q = loadQuarantine(join(ROOT, 'config', 'quarantined-sources.json'));
    expect(q.sources.clubber).toBeDefined();
  });
});
