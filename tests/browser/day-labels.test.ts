import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { DateTime } from 'luxon';
import { renderPage } from '../../src/templates/page';
import { buildPageMetadata } from '../../src/utils/urls';
import { sampleConcert } from '../fixtures/events';
import type { Event } from '../../src/types';

// "Σήμερα"/"Αύριο" is computed in the browser (Europe/Athens), so a page built
// at 03:00 and served after midnight never calls yesterday "today".
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('relative day labels', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  const day = (offset: number) => DateTime.now().setZone('Europe/Athens').plus({ days: offset }).toISODate()!;
  const at = (id: string, offset: number): Event => ({ ...sampleConcert, id, title: id, startDate: `${day(offset)}T21:00:00`, endDate: undefined });
  const events = [at('today', 0), at('tomorrow', 1), at('later', 4)];

  beforeAll(async () => {
    const el = renderPage(buildPageMetadata({}, 3), events, undefined, undefined, 'el');
    const en = renderPage(buildPageMetadata({}, 3), events, undefined, undefined, 'en');
    const eve = renderPage(buildPageMetadata({}, 1), [{ ...at('dst', 0), startDate: '2027-03-28T21:00:00' }], undefined, undefined, 'el');
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
      const path = new URL(req.url).pathname;
      return new Response(path === '/en/' ? en : path === '/dst/' ? eve : el, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); });

  const headers = () => page.$$eval('.date-group-header[data-date]', els => els.map(e => (e.textContent || '').trim()));

  test('Greek: today and tomorrow are named, later dates untouched', async () => {
    await page.goto(server.url.href);
    const [h0, h1, h2] = await headers();
    expect(h0.startsWith('Σήμερα · ')).toBe(true);
    expect(h1.startsWith('Αύριο · ')).toBe(true);
    expect(h2).not.toMatch(/^(Σήμερα|Αύριο)/);
  });

  test('English uses English words', async () => {
    await page.goto(new URL('/en/', server.url).href);
    const [h0, h1] = await headers();
    expect(h0.startsWith('Today · ')).toBe(true);
    expect(h1.startsWith('Tomorrow · ')).toBe(true);
  });

  test('"tomorrow" is the next calendar day even across the spring clock change', async () => {
    // 23:30 Athens on Sat 27 Mar 2027; clocks go forward at 03:00 on the 28th,
    // so now + 24h lands on the 29th.
    const p2 = await browser.newPage();
    await p2.setRequestInterception(true);
    p2.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
    await p2.evaluateOnNewDocument(() => {
      const T = Date.parse('2027-03-27T21:30:00Z');
      const Real = Date;
      class Frozen extends Real {
        constructor(...args: any[]) { super(...((args.length ? args : [T]) as [])); }
        static now() { return T; }
      }
      (globalThis as any).Date = Frozen;
    });
    await p2.goto(new URL('/dst/', server.url).href);
    expect(await p2.evaluate(() => new Date().toISOString())).toBe('2027-03-27T21:30:00.000Z'); // precondition: clock frozen
    const h = await p2.$eval('.date-group-header[data-date]', e => (e.textContent || '').trim());
    await p2.close();
    expect(h.startsWith('Αύριο · ')).toBe(true);
  });

  test('labels are not applied twice when the script runs again', async () => {
    await page.goto(server.url.href);
    await page.evaluate(() => (globalThis as any).__aaDayLabels?.());
    expect((await headers())[0].match(/Σήμερα/g)?.length).toBe(1);
  });
});
