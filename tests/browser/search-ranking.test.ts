import { afterAll, beforeAll, setDefaultTimeout, describe, expect, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { renderSearchOverlay, renderSearchScript } from '../../src/templates/search-overlay';
import { join } from 'path';

// Opt-in: uses the installed Chrome, no browser download or external network.
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('search ranking in a real browser', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  // Same title → identical Fuse score. The far-future row comes FIRST in the
  // index so Fuse's stable order alone would rank it first.
  const events = [
    { id: 'far', title: 'Jazz Night', titleN: 'jazz night', venue: 'Hall', venueN: 'hall', neighborhoodN: '', slug: 'far', date: '', startDate: day(210) + 'T21:00:00', hasEnglish: false, thumb: '', price: 'open' },
    { id: 'near', title: 'Jazz Night', titleN: 'jazz night', venue: 'Hall', venueN: 'hall', neighborhoodN: '', slug: 'near', date: '', startDate: day(2) + 'T21:00:00', hasEnglish: false, thumb: '', price: 'open' },
  ];
  beforeAll(async () => {
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/search-index.json') return Response.json({ events, venues: [], categories: [], popular: [] });
      if (url.pathname === '/scripts/fuse.mjs') return new Response(Bun.file(join(import.meta.dir, '../../node_modules/fuse.js/dist/fuse.mjs')));
      return new Response(`<!doctype html><html lang="el"><head><style>[aria-hidden="true"], [hidden] { display: none; }</style></head><body>
        <button class="nav-search-btn">Search</button>${renderSearchOverlay('el')}${renderSearchScript('el')}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); });

  test('equal-relevance results list the sooner event first', async () => {
    await page.goto(new URL('/?q=jazz', server.url).href);
    await page.waitForSelector('.search-group-items a', { timeout: 3000 });
    const hrefs = await page.$$eval('.search-group-items a', els => els.map(el => el.getAttribute('href')));
    expect(hrefs).toEqual(['/events/near/', '/events/far/']);
  });
});
