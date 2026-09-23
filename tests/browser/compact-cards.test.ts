import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { join } from 'path';
import { DateTime } from 'luxon';
import { renderHubPage } from '../../src/generators/hub-page';
import { sampleConcert } from '../fixtures/events';
import type { Event, HubConfig } from '../../src/types';

// Real hub template + design-system.css in isolated Chrome. Phones get compact
// rows (live 2026-09-22: one portrait card ≈ 560px, a 32-event hub ≈ 25,700px);
// desktop keeps the portrait grid.
describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('compact event rows on phones', () => {
  setDefaultTimeout(30000);
  let browser: Browser;
  let page: Page;
  let server: ReturnType<typeof Bun.serve>;
  const config: HubConfig = {
    slug: 'this-week', titleEl: 'Δοκιμή', titleEn: 'Test',
    filter: { type: 'date', value: 'all-events' },
    answerCapsuleEl: 'Δοκιμή.', answerCapsuleEn: 'Test.', faqs: [],
  };
  const events: Event[] = Array.from({ length: 6 }, (_, i) => ({
    ...sampleConcert, id: `row-${i}`, title: `Row event ${i} with a reasonably long title to wrap`, venue: { ...sampleConcert.venue, name: 'Δημοτικό Κηποθέατρο Παπάγου · Παπάγου' },
    startDate: DateTime.now().setZone('Europe/Athens').plus({ days: 1 }).toISODate() + 'T21:00:00',
    imageUrl: '/img.svg',
  }));

  beforeAll(async () => {
    const html = renderHubPage(config, events, events, undefined, 'el')!;
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith('/styles/')) return new Response(Bun.file(join(import.meta.dir, '../../src', url.pathname)));
      if (url.pathname === '/img.svg') return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#335"/></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
      if (url.pathname === '/event/') return new Response('<title>event</title>', { headers: { 'Content-Type': 'text/html' } });
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } });
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith(server.url.origin) ? req.continue() : req.abort());
  });
  afterAll(async () => { await browser?.close(); server?.stop(true); });

  const box = (sel: string) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

  test('phone: each event is a compact row with a separate 44px save target', async () => {
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(server.url.href);
    const card = await box('.card-grid .event-card');
    expect(card.h).toBeLessThan(220); // portrait card was ~587px
    const save = await box('.card-grid .event-card .card-save-btn');
    expect(save.w).toBeGreaterThanOrEqual(44);
    expect(save.h).toBeGreaterThanOrEqual(44);
    const thumb = await box('.card-grid .event-card .card-image');
    expect(thumb.w).toBeLessThan(120);
    expect(save.x).toBeGreaterThanOrEqual(thumb.x + thumb.w); // save sits beside, not on, the thumbnail
  });

  test('phone: the category badge sits on the thumbnail even when the text runs taller', async () => {
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(server.url.href);
    const body = await box('.card-grid .event-card .card-body');
    const thumb = await box('.card-grid .event-card .card-image');
    expect(body.h).toBeGreaterThan(thumb.h); // precondition: the row is taller than the image
    const badge = await box('.card-grid .event-card .card-badge');
    expect(badge.y + badge.h).toBeLessThanOrEqual(thumb.y + thumb.h);
    expect(badge.y).toBeGreaterThanOrEqual(thumb.y);
  });

  test('phone: a tap on the thumbnail still reaches the card link', async () => {
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(server.url.href);
    await page.$eval('.card-grid .event-card', el => (el as any).scrollIntoView({ block: 'center' }));
    const thumb = await box('.card-grid .event-card .card-image');
    const hit = await page.evaluate(([x, y]) => {
      const el = (globalThis as any).document.elementFromPoint(x, y);
      return el?.closest('a')?.className || el?.tagName;
    }, [thumb.x + thumb.w / 2, thumb.y + thumb.h / 2]);
    expect(hit).toBe('card-link');
  });

  test('phone: on a hub with the real weekend intro, the first event starts inside the first screen', async () => {
    const weekend: HubConfig = {
      ...config, slug: 'this-weekend', titleEl: 'Εκδηλώσεις στην Αθήνα Αυτό το Σαββατοκύριακο',
      // Real config/hub-pages.json capsule (233 chars, 2026-09-22).
      answerCapsuleEl: 'Αυτό το Σαββατοκύριακο στην Αθήνα περιλαμβάνει ζωντανές συναυλίες, εκθέσεις τέχνης, θεατρικές παραστάσεις και πολιτιστικές δράσεις. Από μουσικές σκηνές στο Μετς και Εξάρχεια ως γκαλερί στο Κολωνάκι, υπάρχουν επιλογές για κάθε γούστο.',
    };
    // Like the real weekend: three days, mixed types and prices (day jumps + full filter bar).
    const mixed: Event[] = events.map((e, i) => ({
      ...e, type: i % 2 ? 'theater' : 'concert',
      price: i % 3 ? { type: 'with-ticket', amount: 20, currency: 'EUR' } : { type: 'open' },
      startDate: DateTime.now().setZone('Europe/Athens').plus({ days: 1 + (i % 3) }).toISODate() + 'T21:00:00',
    }));
    const html = renderHubPage(weekend, mixed, mixed, undefined, 'el')!;
    const p2 = await browser.newPage();
    await p2.setRequestInterception(true);
    p2.on('request', req => {
      const u = new URL(req.url());
      if (u.origin !== server.url.origin) return req.abort();
      if (u.pathname === '/weekend/') return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      req.continue();
    });
    await p2.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await p2.goto(new URL('/weekend/', server.url).href);
    expect(await p2.$$eval('nav.day-jumps a', els => els.length)).toBe(3); // precondition: realistic chrome above the list
    const top = await p2.$eval('.card-grid .event-card', el => el.getBoundingClientRect().top);
    const capsuleText = await p2.$eval('.answer-capsule-text', el => el.textContent || '');
    await p2.close();
    expect(capsuleText).toContain('υπάρχουν επιλογές για κάθε γούστο'); // intro stays in the page for extraction
    expect(top).toBeLessThan(812);
  });

  test('desktop keeps the portrait grid', async () => {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(server.url.href);
    const card = await box('.card-grid .event-card');
    expect(card.h).toBeGreaterThan(300);
  });
});
