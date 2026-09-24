import { afterAll, beforeAll, setDefaultTimeout, describe, expect, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateEventTile, precomputeEventTiles, getEventTile, clearEventTileCache } from '../../src/generators/event-tile';
import { renderEventCard } from '../../src/templates/page';
import { sampleConcert } from '../fixtures/events';
import type { Event } from '../../src/types';

// Round-2 move 7: the file-referenced tile must paint exactly what the inline
// tile painted, under the real design-system.css, on the desktop grid card and
// on the 96×128 mobile thumbnail. Two cards on one page — one with the old
// inline SVG, one with the new reference — are screenshotted and compared.
// Opt-in: installed Chrome, local server only, no external network.
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('file-referenced tiles in a real browser', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  let outDir: string;
  let html: string;
  const event: Event = {
    ...sampleConcert,
    id: 'tile-visual-1',
    title: 'Χριστουγεννιάτικη Συναυλία & «Φίλοι»',
    venue: { ...sampleConcert.venue, name: 'Μέγαρο Μουσικής' },
    imageUrl: undefined, imageLocal: undefined, venueImage: undefined,
  };

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'tile-visual-'));
    clearEventTileCache();
    await precomputeEventTiles([event], { outDir });
    const reference = getEventTile(event.id)!;
    const inline = await generateEventTile(event);
    const card = renderEventCard(event);
    // Precondition: the renderer emitted the reference, so swapping it for the
    // inline SVG reproduces the pre-round-2 card exactly.
    if (!card.includes(reference)) throw new Error('card does not contain the tile reference');
    const before = card.replace(reference, inline);
    html = `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles/design-system.css">
      <style>body{margin:0} .cell{width:240px;display:inline-block;vertical-align:top;margin:8px}</style></head><body>
      <div class="cell" id="before">${before}</div><div class="cell" id="after">${card}</div></body></html>`;
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/styles/design-system.css') return new Response(Bun.file(join(import.meta.dir, '../../src/styles/design-system.css')), { headers: { 'Content-Type': 'text/css' } });
      if (url.pathname.startsWith('/tiles/')) return new Response(readFileSync(join(outDir, url.pathname)), { headers: { 'Content-Type': 'image/svg+xml' } });
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); clearEventTileCache(); rmSync(outDir, { recursive: true, force: true }); });

  async function shots(selector: string) {
    await page.goto(server.url.href, { waitUntil: 'networkidle0' });
    // networkidle0 means fetched, not painted: decode the tile file and let
    // two frames pass so the <image> has painted before the screenshot.
    const decoded = await page.evaluate(async () => {
      const w = globalThis as any; // browser context; the project's tsconfig has no DOM lib
      const href = w.document.querySelector('#after svg image').getAttribute('href');
      const img = new w.Image();
      img.src = href;
      await img.decode();
      await new Promise(r => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));
      return img.naturalWidth as number;
    });
    expect(decoded).toBe(200); // precondition: the tile file loaded as an image
    const a = await (await page.$(`#before ${selector}`))!.screenshot();
    const b = await (await page.$(`#after ${selector}`))!.screenshot();
    return { a: Buffer.from(a), b: Buffer.from(b) };
  }

  test('desktop grid card: identical pixels', async () => {
    await page.setViewport({ width: 1024, height: 800, deviceScaleFactor: 2 });
    const { a, b } = await shots('.card-image-wrapper');
    expect(a.length).toBeGreaterThan(1000); // precondition: something was painted
    expect(b.equals(a)).toBe(true);
  });

  test('mobile 96×128 thumbnail: identical pixels', async () => {
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3, isMobile: true });
    const { a, b } = await shots('.card-image-wrapper > svg');
    const size = await page.$eval('#after .card-image-wrapper > svg', el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
    expect(size).toEqual([96, 128]); // precondition: the mobile thumb rule applies
    expect(b.equals(a)).toBe(true);
  });
});
