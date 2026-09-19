import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '../..');
let fixture: string;

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'aa-indexnow-discovery-'));
  for (const dir of ['scripts', 'config', 'dist']) mkdirSync(join(fixture, dir));
  copyFileSync(join(ROOT, 'scripts/ping-indexnow.ts'), join(fixture, 'scripts/ping-indexnow.ts'));
  writeFileSync(join(fixture, 'config/indexnow.json'), JSON.stringify({
    indexnow_key: 'test-indexnow-key-00000000',
    indexnow_endpoint: 'https://example.test/indexnow',
    host: 'agentathens.com',
  }));
  writeFileSync(join(fixture, 'config/categories.json'), JSON.stringify({ categories: [{ slug: 'concerts' }] }));
  writeFileSync(join(fixture, 'config/hub-pages.json'), JSON.stringify({
    hubs: [{ slug: 'open' }, { slug: 'nightlife' }, { slug: 'kids' }],
  }));
});

afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function discover(urls: string[]): string[] {
  writeFileSync(join(fixture, 'dist/sitemap-editorial.xml'),
    `<urlset>${urls.map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`);
  for (const name of ['events', 'venues']) writeFileSync(join(fixture, `dist/sitemap-${name}.xml`), '<urlset/>');
  const result = Bun.spawnSync([process.execPath, 'run', 'scripts/ping-indexnow.ts', '--dry-run'], {
    cwd: fixture,
    env: { ...process.env, INDEXNOW_CONFIG: join(fixture, 'config/indexnow.json') },
    stdout: 'pipe', stderr: 'pipe',
  });
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe('');
  return [...result.stdout.toString().matchAll(/^  (https:\/\/\S+)$/gm)].map(match => match[1]);
}

describe('IndexNow discovery from published sitemaps', () => {
  test('includes English time, category and configured hub URLs with their served slash form', () => {
    const urls = [
      'https://agentathens.com/en/today/',
      'https://agentathens.com/en/this-weekend/',
      'https://agentathens.com/en/concerts/',
      'https://agentathens.com/en/open/',
      'https://agentathens.com/en/nightlife/',
    ];
    expect(discover(urls)).toEqual(urls);
  });

  test('submits only sitemap-listed destinations, deduplicating without synthesizing unpublished hubs', () => {
    expect(discover([
      'https://agentathens.com',
      'https://agentathens.com/concerts',
      'https://agentathens.com/en/open/',
      'https://agentathens.com/en/open/',
      'https://agentathens.com/en/events/test-show/',
      'https://agentathens.com/venues/test-venue/',
      'https://agentathens.com/open-concert-today',
    ])).toEqual([
      'https://agentathens.com',
      'https://agentathens.com/concerts',
      'https://agentathens.com/en/open/',
      'https://agentathens.com/en/events/test-show/',
      'https://agentathens.com/venues/test-venue/',
    ]);
  });
});
