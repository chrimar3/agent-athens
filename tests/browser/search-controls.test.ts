import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { join } from 'path';
import { renderSearchOverlay, renderSearchScript } from '../../src/templates/search-overlay';

// Round-1 builder B (real Chrome screenshot): three "×" at the right of the
// search box — Chrome's native search cancel button, the site's clear button,
// and the absolutely positioned close button sitting on top of the clear one.
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('search box controls', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles/design-system.css"></head>
    <body><button class="nav-search-btn">Search</button>${renderSearchOverlay('el')}${renderSearchScript('el')}</body></html>`;

  beforeAll(async () => {
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith('/styles/')) return new Response(Bun.file(join(import.meta.dir, '../../src', url.pathname)));
      if (url.pathname === '/search-index.json') return Response.json({ events: [], venues: [], categories: [], popular: [] });
      if (url.pathname === '/scripts/fuse.mjs') return new Response(Bun.file(join(import.meta.dir, '../../node_modules/fuse.js/dist/fuse.mjs')));
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); });

  for (const width of [375, 1280]) {
    test(`${width}px: one clear control, not covered by the close button`, async () => {
      await page.setViewport({ width, height: 800 });
      await page.goto(server.url.href);
      await page.click('.nav-search-btn');
      await page.type('.search-input', 'jazz');
      const r = await page.evaluate(() => {
        const d = (globalThis as any).document;
        const box = (s: string) => { const b = d.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
        // getComputedStyle cannot read ::-webkit-search-cancel-button (it
        // returns the input's own style), so read the loaded stylesheet.
        const hidesNative = [...d.styleSheets].some((sh: any) => [...sh.cssRules].some((r: any) =>
          r.selectorText?.includes('.search-input::-webkit-search-cancel-button') && r.style.display === 'none'));
        return { hidesNative, clear: box('.search-clear-btn'), close: box('.search-close-btn') };
      });
      expect(r.clear.w).toBeGreaterThan(0); // precondition: typed text shows the site's clear button
      const overlap = r.clear.l < r.close.r && r.close.l < r.clear.r && r.clear.t < r.close.b && r.close.t < r.clear.b;
      expect(overlap).toBe(false);
      expect(r.hidesNative).toBe(true);
    });
  }
});
