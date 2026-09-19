import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { join } from 'path';
import { DateTime } from 'luxon';
import { renderHubPage, renderOverflowPage } from '../../src/generators/hub-page';
import { sampleConcert } from '../fixtures/events';
import type { Event, HubConfig } from '../../src/types';

// Real production templates/CSS, isolated Chrome, local fixture responses only.
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('complete English filters and keyboard navigation', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  let fullRequests = 0;
  let failFull = false;
  let invalidFull = false;
  let hangFull = false;
  const config: HubConfig = {
    slug: 'this-week', titleEl: 'Δοκιμή', titleEn: 'Test events',
    filter: { type: 'date', value: 'all-events' },
    answerCapsuleEl: 'Δοκιμαστικές εκδηλώσεις.', answerCapsuleEn: 'Synthetic test events.', faqs: [],
  };
  const events: Event[] = Array.from({ length: 35 }, (_, i) => ({
    ...sampleConcert, id: `browse-${i}`, title: `Test event ${i}`, endDate: undefined,
    startDate: DateTime.now().setZone('Europe/Athens').plus({ days: i < 32 ? 1 : 2 }).toISODate() + 'T20:00:00+03:00',
    fullDescription: 'Synthetic fixture.', fullDescriptionEn: 'Synthetic fixture.',
    type: i < 30 ? 'concert' : 'theater',
    price: i < 30 ? { type: 'with-ticket', amount: 20, currency: 'EUR' } : { type: 'open' },
  }));
  beforeAll(async () => {
    const html = renderHubPage(config, events, events, undefined, 'en');
    const full = renderOverflowPage(config, events, events, 'en');
    const small = renderHubPage(config, events.slice(0, 30), events.slice(0, 30), undefined, 'en');
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/en/this-week/all/') {
        fullRequests++;
        // Headers arrive, but the body never completes until the browser aborts.
        if (hangFull) return new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/html' } });
        await Bun.sleep(200);
        return new Response(failFull ? 'Unavailable' : invalidFull ? html : full, {
          status: failFull ? 503 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname.startsWith('/styles/')) return new Response(Bun.file(join(import.meta.dir, '../../src', url.pathname)));
      if (url.pathname === '/search-index.json') return Response.json({ events: [], venues: [], categories: [], popular: [] });
      if (url.pathname === '/scripts/fuse.mjs') return new Response(Bun.file(join(import.meta.dir, '../../node_modules/fuse.js/dist/fuse.mjs')));
      return new Response(url.pathname === '/en/small/' ? small : html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); });
  async function visit(path = '/en/this-week/') {
    fullRequests = 0; failFull = false; invalidFull = false; hangFull = false;
    await page.setViewport({ width: 1100, height: 900 });
    await page.goto(new URL(path, server.url).href);
  }
  async function select(dim: string, value: string) {
    await page.click(`.filter-pill[data-panel="${dim}"]`);
    await page.click(`[data-filter-dim="${dim}"][data-filter-value="${value}"]`);
  }
  async function waitForCount(count: number) {
    await page.waitForFunction(n => (globalThis as any).document.querySelector('.filter-result-count')?.textContent?.trim() === `${n} events` && !(globalThis as any).document.querySelector('.card-grid')?.hasAttribute('aria-busy'), { timeout: 2500 }, count);
  }
  test('loads beyond the initial 30 once, preserves cards, and resets within English', async () => {
    await visit();
    expect(await page.$$eval('.card-grid .event-card', els => els.length)).toBe(30);
    expect(fullRequests).toBe(0);
    await page.evaluate("window.__originalGrid = document.querySelector('.card-grid'); window.__originalCard = document.querySelector('.card-grid .event-card')");
    await select('type', 'theater');
    await waitForCount(5);
    expect(fullRequests).toBe(1);
    expect(await page.$$eval('.card-grid .event-card', els => els.length)).toBe(35);
    expect(await page.evaluate("window.__originalGrid === document.querySelector('.card-grid') && document.querySelector('.card-grid').contains(window.__originalCard)")).toBe(true);
    expect(await page.$$eval('.card-grid .event-card', els => new Set(els.map(el => el.querySelector('.card-link')?.getAttribute('href'))).size)).toBe(35);
    expect(await page.$$eval('.card-grid .event-card', els => els.filter(el => (el as any).style.display !== 'none').every(el => el.querySelector('.card-link')?.getAttribute('href')?.startsWith('/en/events/')))).toBe(true);
    await select('price', 'with-ticket');
    await waitForCount(0);
    expect(await page.$eval('.filter-empty-state', el => (globalThis as any).getComputedStyle(el).display)).not.toBe('none');
    await select('price', 'with-ticket');
    await waitForCount(5);
    await page.click('.filter-pill[data-panel="type"]');
    await page.click('.filter-reset');
    await waitForCount(35);
    expect(new URL(page.url()).pathname).toBe('/en/this-week/');
    expect(fullRequests).toBe(1);
    expect(await page.$$eval('.date-group', els => els.every(el => (globalThis as any).getComputedStyle(el).display !== 'none'))).toBe(true);
  });
  test('a failed full-list request leaves cards intact, announces failure and retries', async () => {
    await visit(); failFull = true;
    await select('type', 'theater');
    await page.waitForSelector('.filter-retry', { visible: true, timeout: 2500 });
    expect(await page.$eval('.filter-load-status', el => el.getAttribute('role'))).toBe('status');
    expect(await page.$$eval('.card-grid .event-card', els => els.filter(el => (el as any).style.display !== 'none').length)).toBe(30);
    expect(await page.$eval('.filter-empty-state', el => (globalThis as any).getComputedStyle(el).display)).toBe('none');
    failFull = false;
    await page.click('.filter-retry');
    await waitForCount(5);
    expect(fullRequests).toBe(2);
  });
  test('a stalled response body times out, clears busy state, and can retry', async () => {
    await visit(); hangFull = true;
    // Accelerate only the production 15-second request deadline.
    await page.evaluate("var originalTimeout = window.setTimeout; window.setTimeout = function(fn, ms) { return originalTimeout(fn, ms === 15000 ? 100 : ms); }");
    await select('type', 'theater');
    await page.waitForSelector('.filter-retry', { visible: true, timeout: 2500 });
    expect(await page.$eval('.card-grid', el => el.hasAttribute('aria-busy'))).toBe(false);
    expect(await page.$$eval('.card-grid .event-card', els => els.length)).toBe(30);
    hangFull = false;
    await page.evaluate('window.setTimeout = originalTimeout');
    await page.click('.filter-retry');
    await waitForCount(5);
    expect(fullRequests).toBe(2);
  });
  test('an incomplete HTML response is retryable, not a false zero-results state', async () => {
    await visit(); invalidFull = true;
    await select('type', 'theater');
    await page.waitForSelector('.filter-retry', { visible: true, timeout: 2500 });
    expect(await page.$$eval('.card-grid .event-card', els => els.length)).toBe(30);
    invalidFull = false;
    await page.click('.filter-retry');
    await waitForCount(5);
  });
  test('changes during loading share one request and apply the latest selection', async () => {
    await visit();
    await page.evaluate(() => {
      ((globalThis as any).document.querySelector('[data-filter-value="theater"]') as any).click();
      ((globalThis as any).document.querySelector('[data-filter-value="theater"]') as any).click();
    });
    await waitForCount(35);
    expect(fullRequests).toBe(1);
  });
  test('price sort loads the complete corpus and newly loaded save buttons work', async () => {
    await visit();
    await page.click('.filter-pill[data-panel="sort"]');
    await page.click('[data-sort="price"]');
    await waitForCount(35);
    expect(fullRequests).toBe(1);
    expect(await page.$eval('.card-grid .event-card', el => el.getAttribute('data-price-type'))).toBe('open');
    await page.evaluate("document.querySelector('.card-save-btn[data-event-id=\"browse-34\"]').click()");
    expect(await page.$eval('.card-save-btn[data-event-id="browse-34"]', el => el.getAttribute('aria-pressed'))).toBe('true');
    await select('type', 'theater');
    await waitForCount(5);
    await select('price', 'with-ticket');
    await waitForCount(0);
    await page.click('.filter-clear-all');
    await waitForCount(35);
    expect(new URL(page.url()).pathname).toBe('/en/this-week/');
    expect(fullRequests).toBe(1);
  });
  test('a complete initial list filters without fetching an overflow page', async () => {
    await visit('/en/small/');
    await select('type', 'concert');
    await waitForCount(30);
    expect(fullRequests).toBe(0);
  });
  test('closed mobile menu is inert; opening, Tab wrapping and Escape preserve focus', async () => {
    await visit();
    await page.setViewport({ width: 390, height: 844 });
    expect(await page.$eval('.mobile-menu', el => (el as any).inert)).toBe(true);
    await page.focus('.hamburger-btn');
    await page.evaluate("document.querySelector('.mobile-menu-search').focus()");
    expect(await page.$eval('.hamburger-btn', el => (globalThis as any).document.activeElement === el)).toBe(true);
    await page.keyboard.press('Enter');
    expect(await page.$eval('.mobile-menu-close', el => (globalThis as any).document.activeElement === el)).toBe(true);
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    expect(await page.$eval('.mobile-menu li:last-child a', el => (globalThis as any).document.activeElement === el)).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.$eval('.mobile-menu-close', el => (globalThis as any).document.activeElement === el)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.$eval('.hamburger-btn', el => (globalThis as any).document.activeElement === el && el.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(await page.$eval('.mobile-menu', el => (el as any).inert)).toBe(true);
  });
  test('menu Search hands focus to search and restores a visible header control', async () => {
    await visit();
    await page.setViewport({ width: 390, height: 844 });
    await page.focus('.hamburger-btn');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForFunction('document.activeElement === document.querySelector(".search-input")');
    expect(await page.$eval('.mobile-menu', el => (el as any).inert)).toBe(true);
    expect(await page.$eval('.hamburger-btn', el => el.getAttribute('aria-expanded'))).toBe('false');
    await page.keyboard.press('Escape');
    expect(await page.$eval('.nav-search-btn', el => (globalThis as any).document.activeElement === el)).toBe(true);
    expect(await page.$eval('body', el => el.classList.contains('scroll-locked-menu') || el.classList.contains('scroll-locked'))).toBe(false);
  });
});
