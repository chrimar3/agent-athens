import { afterAll, beforeAll, setDefaultTimeout, describe, expect, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { renderSearchOverlay, renderSearchScript } from '../../src/templates/search-overlay';
import { renderSavedEventsScript, renderSavedPageScript } from '../../src/templates/action-bar';
import { join } from 'path';

// Opt-in: uses the installed Chrome, no browser download or external network.
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('discovery in a real browser', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  let requests = 0;
  let failIndex = false;
  const events = Array.from({ length: 27 }, (_, i) => ({
    id: String(i), hasEnglish: i < 26, title: `Music ${i}`, titleN: `music ${i}`, venue: 'Hall', venueN: 'hall', neighborhoodN: '', slug: `music-${i}`, date: '19 Σεπ', startDate: '2026-09-19', thumb: '', price: 'open',
  }));
  beforeAll(async () => {
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/search-index.json') {
        requests++;
        await Bun.sleep(350);
        return failIndex ? new Response('Unavailable', { status: 503 }) : Response.json({ events, venues: [], categories: [], popular: events.slice(0, 2) });
      }
      if (url.pathname === '/scripts/fuse.mjs') return new Response(Bun.file(join(import.meta.dir, '../../node_modules/fuse.js/dist/fuse.mjs')));
      const en = url.pathname.startsWith('/en/');
      const locale = en ? 'en' : 'el';
      return new Response(`<!doctype html><html lang="${locale}"><head><style>[aria-hidden="true"], [hidden] { display: none; }</style></head><body>
        <button class="nav-search-btn">Search</button>${renderSearchOverlay(locale)}
        <div id="saved-events-list"></div><div id="saved-empty">Empty</div>
        ${renderSavedEventsScript()}${renderSavedPageScript(locale)}${renderSearchScript(locale)}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); });
  async function visit(path = '/') {
    requests = 0; failIndex = false;
    await page.goto(new URL(path, server.url).href);
  }
  test('a query typed before the index arrives produces results', async () => {
    await visit();
    await page.click('.nav-search-btn');
    await page.type('.search-input', 'music');
    await page.waitForSelector('.search-group-items a', { timeout: 2000 });
    expect(await page.$$eval('.search-group-items a', els => els.length)).toBe(5);
  });
  test('reopening while loading uses one fetch', async () => {
    await visit();
    await page.click('.nav-search-btn');
    await page.click('.search-close-btn');
    await page.click('.nav-search-btn');
    await page.waitForFunction('document.querySelector(".search-skeleton").style.display === "none"');
    expect(requests).toBe(1);
  });
  test('HTTP failure is announced and can be retried', async () => {
    await visit(); failIndex = true;
    await page.click('.nav-search-btn');
    await page.waitForSelector('.search-retry-btn', { visible: true, timeout: 2000 });
    expect(await page.$eval('[role="status"]', el => el.textContent)).toBeTruthy();
    failIndex = false;
    await page.click('.search-retry-btn');
    await page.type('.search-input', 'music');
    await page.waitForSelector('.search-group-items a', { timeout: 2000 });
  });
  test('all 27 matches are reachable and keyboard navigation ignores hidden popular links', async () => {
    await visit('/?q=music');
    await page.waitForSelector('.search-group-items a', { timeout: 2000 });
    await page.click('.search-see-all');
    expect(await page.$$eval('.search-group-items a', els => els.length)).toBe(27);
    await page.focus('.search-input');
    await page.keyboard.press('ArrowDown');
    expect(await page.$eval('.search-input', el => el.getAttribute('aria-activedescendant'))).toBe('sr-1');
  });
  test('English search keeps event results and saved links in English', async () => {
    await visit('/en/today/?q=music');
    await page.waitForSelector('.search-group-items a', { timeout: 2000 });
    expect(await page.$eval('.search-input', el => el.getAttribute('placeholder'))).toBe('Search events…');
    expect(await page.$eval('.search-group-items a', el => el.getAttribute('href'))).toBe('/en/events/music-0/');
    await page.evaluate("window.__aaSaved.save({eventId:'1',slug:'music-1',title:'Music',hasEnglish:true})");
    expect(await page.$eval('#saved-events-list a', el => el.getAttribute('href'))).toBe('/en/events/music-1/');
    await page.click('.search-see-all');
    expect(await page.$eval('.search-group-items a:last-child', el => el.getAttribute('href'))).toBe('/events/music-26/');
    await page.evaluate("window.__aaSaved.save({eventId:'2',slug:'music-26',title:'Greek only'})");
    expect(await page.$eval('#saved-events-list a', el => el.getAttribute('href'))).toBe('/events/music-26/');
  });
});
