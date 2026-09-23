import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { chromeLaunchArgs, chromePath, MAC_CHROME_PATH } from '../chrome-path';

const SCRIPTS = join(import.meta.dir, '../..');

describe('chromePath', () => {
  test('uses PUPPETEER_EXECUTABLE_PATH when set (container)', () => {
    expect(chromePath({ PUPPETEER_EXECUTABLE_PATH: '/usr/local/bin/chromium' })).toBe('/usr/local/bin/chromium');
  });
  test('falls back to macOS Chrome', () => {
    expect(chromePath({})).toBe(MAC_CHROME_PATH);
  });
});

describe('chromeLaunchArgs', () => {
  test('keeps the Chrome sandbox on outside the container', () => {
    expect(chromeLaunchArgs({})).toEqual([]);
    expect(chromeLaunchArgs({ AA_CONTAINER: '0' })).toEqual([]);
  });
  test('disables it only inside the pipeline container', () => {
    expect(chromeLaunchArgs({ AA_CONTAINER: '1' })).toContain('--no-sandbox');
  });
  test('no scraper hard-codes a sandbox-disabling flag', () => {
    const offenders = readdirSync(SCRIPTS)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => readFileSync(join(SCRIPTS, f), 'utf8').includes('--no-sandbox'));
    expect(offenders).toEqual([]);
  });
});
