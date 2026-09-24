import { afterAll, beforeAll, setDefaultTimeout, describe, expect, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { renderSearchOverlay, renderSearchScript } from '../../src/templates/search-overlay';
import { generateSearchIndex } from '../../src/generators/search-index';
import { sampleConcert } from '../fixtures/events';
import type { Event } from '../../src/types';

// Round-2 move 8 end to end: the real generator writes the index, the real
// page script loads it with the real Fuse build, and a Latin query typed into
// the overlay lists the Greek-named event. Opt-in: installed Chrome, local
// server only, no external network.
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('Greeklish search in a real browser', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  let outDir: string;
  let indexJson: string;
  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const ev = (id: string, title: string, venue: string, offset: number): Event => ({
    ...sampleConcert, id, title, startDate: `${day(offset)}T21:00:00+03:00`,
    venue: { ...sampleConcert.venue, name: venue },
  });
  const events = [
    ev('decoy', 'Techno Marathon', 'Bios', 1),
    ev('kyttaro-gig', 'PHANTOM SPELL', 'Κύτταρο', 3),
    ev('mousiki', 'Ηλεκτρονική Μουσική στην Ταράτσα', 'Six D.O.G.S', 4),
  ];

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'greeklish-browser-'));
    generateSearchIndex(events, outDir);
    indexJson = readFileSync(join(outDir, 'search-index.json'), 'utf-8');
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/search-index.json') return new Response(indexJson, { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname === '/scripts/fuse.mjs') return new Response(Bun.file(join(import.meta.dir, '../../node_modules/fuse.js/dist/fuse.mjs')));
      return new Response(`<!doctype html><html lang="el"><head><meta charset="utf-8"><style>[aria-hidden="true"], [hidden] { display: none; }</style></head><body>
        <button class="nav-search-btn">Search</button>${renderSearchOverlay('el')}${renderSearchScript('el')}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); rmSync(outDir, { recursive: true, force: true }); });

  const eventHrefs = async (q: string) => {
    await page.goto(new URL(`/?q=${encodeURIComponent(q)}`, server.url).href);
    await page.waitForSelector('[data-group="events"] .search-group-items a', { timeout: 3000 });
    return page.$$eval('[data-group="events"] .search-group-items a', els => els.map(el => el.getAttribute('href')));
  };

  test('precondition: the generated index carries the Latin key', () => {
    expect(JSON.parse(indexJson).events.find((e: any) => e.id === 'kyttaro-gig').venueL).toBeTruthy();
  });

  test('"kyttaro" lists the Κύτταρο event', async () => {
    const hrefs = await eventHrefs('kyttaro');
    expect(hrefs[0]).toContain('/events/');
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]).toBe(`/events/${JSON.parse(indexJson).events.find((e: any) => e.id === 'kyttaro-gig').slug}/`);
  });

  test('"mousiki" lists the μουσική event, and "κυτταρο" still works', async () => {
    const slugOf = (id: string) => `/events/${JSON.parse(indexJson).events.find((e: any) => e.id === id).slug}/`;
    expect(await eventHrefs('mousiki')).toEqual([slugOf('mousiki')]);
    expect(await eventHrefs('κυτταρο')).toEqual([slugOf('kyttaro-gig')]);
  });
});
