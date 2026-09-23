import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { DateTime } from 'luxon';
import { sampleConcert } from '../fixtures/events';
import {
  renderCardSaveButton,
  renderCardSaveScript,
  renderSavedEventsScript,
  renderSavedPageBody,
  renderSavedPageScript,
  saveMetaFor,
} from '../../src/templates/action-bar';
import type { Event } from '../../src/types';

// Real save/saved-page scripts in isolated Chrome; local fixture pages only.
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('saved events carry date, venue and price', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;

  const athensDay = (offset: number) => DateTime.now().setZone('Europe/Athens').plus({ days: offset }).toISODate()!;
  const ev = (id: string, title: string, offset: number, venue: string, price: Event['price']): Event => ({
    ...sampleConcert, id, title, startDate: `${athensDay(offset)}T21:00:00`, endDate: undefined,
    venue: { ...sampleConcert.venue, name: venue }, price,
  });
  const far = ev('far', 'Far Show', 10, 'Floyd', { type: 'with-ticket', amount: 20, currency: 'EUR' });
  const soon = ev('soon', 'Soon Show', 2, 'Gazarte', { type: 'open' });
  const past = ev('past', 'Past Show', -3, 'Romantso', { type: 'with-ticket', amount: 12, currency: 'EUR' });
  const running: Event = { ...ev('running', 'Running Exhibition', -30, 'ΚΠΙΣΝ', { type: 'open' }), type: 'exhibition', startDate: athensDay(-30), endDate: athensDay(10) };

  const shell = (lang: string, body: string, scripts: string) =>
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body>${body}${scripts}</body></html>`;
  const listPage = shell('el',
    [far, soon, past, running].map(e => `<div class="event-card">${renderCardSaveButton(e.id, `${e.id}-slug`, e.title, false, saveMetaFor(e))}</div>`).join(''),
    renderSavedEventsScript() + renderCardSaveScript());
  const savedPage = shell('el', renderSavedPageBody('el'), renderSavedEventsScript() + renderSavedPageScript('el'));

  beforeAll(async () => {
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
      const html = new URL(req.url).pathname === '/saved/' ? savedPage : listPage;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); });

  const go = (path: string) => page.goto(new URL(path, server.url).href);
  const rows = (section: string) => page.$$eval(`${section} .saved-event-item`, els => els.map(el => el.textContent || ''));

  test('upcoming saves list soonest first with venue and price; past saves are separated', async () => {
    await go('/list/');
    await page.evaluate(() => (globalThis as any).localStorage.clear());
    for (const id of ['far', 'soon', 'past']) await page.click(`.card-save-btn[data-event-id="${id}"]`);
    await go('/saved/');
    const upcoming = await rows('#saved-upcoming');
    expect(upcoming.map(t => t.includes('Soon Show') ? 'soon' : t.includes('Far Show') ? 'far' : '?')).toEqual(['soon', 'far']);
    expect(upcoming[0]).toContain('Gazarte');
    expect(upcoming[0]).toContain('Ελεύθερη είσοδος');
    expect(upcoming[1]).toContain('Floyd');
    expect(upcoming[1]).toContain('€20');
    expect(upcoming[1]).toContain('21:00');
    const pastRows = await rows('#saved-past');
    expect(pastRows).toHaveLength(1);
    expect(pastRows[0]).toContain('Past Show');
  });

  test('a save made before details were stored is repaired by visiting any page that lists it', async () => {
    await go('/list/');
    await page.evaluate(() => (globalThis as any).localStorage.setItem('agent-athens-saved',
      JSON.stringify([{ eventId: 'far', title: 'Far Show', slug: 'far-slug', savedAt: '2026-01-01T00:00:00Z' }])));
    await go('/saved/');
    expect((await rows('#saved-upcoming'))[0]).not.toContain('Floyd'); // precondition: legacy row has no venue
    await go('/list/');
    await go('/saved/');
    expect((await rows('#saved-upcoming'))[0]).toContain('Floyd');
  });

  test('an exhibition that opened weeks ago but is still running counts as upcoming', async () => {
    await go('/list/');
    await page.evaluate(() => (globalThis as any).localStorage.clear());
    await page.click('.card-save-btn[data-event-id="running"]');
    await go('/saved/');
    expect((await rows('#saved-upcoming'))[0]).toContain('Running Exhibition');
    expect(await rows('#saved-past')).toHaveLength(0);
  });

  test('a running event shows when it ends, not its months-old opening', async () => {
    await go('/list/');
    await page.evaluate(() => (globalThis as any).localStorage.clear());
    for (const id of ['soon', 'running']) await page.click(`.card-save-btn[data-event-id="${id}"]`);
    await go('/saved/');
    const upcoming = await rows('#saved-upcoming');
    expect(upcoming[0]).toContain('Running Exhibition');
    expect(upcoming[0]).toContain('έως');
    const opened = DateTime.fromISO(athensDay(-30)).setLocale('el').toFormat('d');
    expect(upcoming[0]).not.toMatch(new RegExp(`\\b${opened} `)); // opening day not shown
  });

  test('empty state offers a way back into the calendar', async () => {
    await go('/list/');
    await page.evaluate(() => (globalThis as any).localStorage.clear());
    await go('/saved/');
    const href = await page.$eval('#saved-empty a', a => a.getAttribute('href'));
    expect(href).toBe('/this-weekend/');
    expect(await page.$eval('#saved-empty', el => (globalThis as any).getComputedStyle(el).display)).not.toBe('none');
  });
});
