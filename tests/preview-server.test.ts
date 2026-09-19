import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createPreviewHandler } from '../src/serve';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'aa-preview-')); dirs.push(dir);
  mkdirSync(join(dir, 'events/music'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<h1>Home</h1>');
  writeFileSync(join(dir, 'events/music/index.html'), '<h1>Music</h1>');
  writeFileSync(join(dir, 'concerts.html'), '<h1>Concerts</h1>');
  writeFileSync(join(dir, '404.html'), '<h1>Missing</h1>');
  writeFileSync(join(dir, '.secret'), 'private');
  return { dir, handle: createPreviewHandler(dir) };
}
test('preview resolves clean static routes and assets', async () => {
  const { handle } = fixture();
  for (const [path, title] of [['/', 'Home'], ['/events/music/', 'Music'], ['/concerts', 'Concerts']]) {
    const response = await handle(new Request('http://localhost' + path));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(title);
    expect(response.headers.get('content-type')).toContain('text/html');
  }
});
test('missing pages remain real 404s; HEAD has no body; writes are refused', async () => {
  const { handle } = fixture();
  const response = await handle(new Request('http://localhost/missing'));
  expect(response.status).toBe(404);
  expect(await response.text()).toContain('Missing');
  expect(await (await handle(new Request('http://localhost/', { method: 'HEAD' }))).text()).toBe('');
  expect((await handle(new Request('http://localhost/', { method: 'POST' }))).status).toBe(405);
});
test('preview confines decoded paths and symlinks to the selected build', async () => {
  const { dir, handle } = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'aa-outside-')); dirs.push(outside);
  writeFileSync(join(outside, 'secret.txt'), 'private');
  symlinkSync(join(outside, 'secret.txt'), join(dir, 'escape.txt'));
  for (const path of ['/.secret', '/%2e%2e%2fsecret.txt', '/escape.txt', '/%00', '/%ZZ']) {
    const response = await handle(new Request('http://localhost' + path));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.text()).not.toContain('private');
  }
});
