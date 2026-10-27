/**
 * M3.3: the event-cards view in a real browser, inside a stub MCP Apps host.
 *
 *   bun run e2e                                   # fixture data, no network
 *   EVIDENCE_DIR=../specs/002-mcp-server/evidence LIVE=1 bun run e2e   # + screenshots of a live result
 *
 * The stub host serves the view with the CSP a host builds from the
 * resource's _meta.ui.csp (spec 2026-01-26, lines 275–286), answers
 * ui/initialize, then posts a tools/call result produced by this server.
 * Chromium: the cached Playwright build (no browser download), or
 * PLAYWRIGHT_CHROMIUM=/path/to/chrome.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { chromium, type Browser, type Frame, type Page } from 'playwright';
import { httpFeedSource, parseFeed, type FeedSource } from '../src/feed';
import { handleHttp } from '../src/mcp';

const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM ?? join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1187/chrome-mac/headless_shell');
const AXE = join(import.meta.dir, '..', '..', 'node_modules', 'axe-core', 'axe.min.js');
const fixture = (l: 'el' | 'en') => parseFeed(JSON.parse(readFileSync(join(import.meta.dir, '..', 'test', 'fixtures', `events.${l}.json`), 'utf8')), l);
const fixtureFeed: FeedSource = async (l) => fixture(l);
const NOW = () => new Date('2026-11-02T10:00:00Z');

async function rpc(feed: FeedSource, method: string, params: object, now?: () => Date): Promise<any> {
  const res = await handleHttp(new Request('http://e2e.local/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), { feed, now });
  return (await res.json()).result;
}

// The view and the CSP exactly as resources/read serves them.
const resource = (await rpc(fixtureFeed, 'resources/read', { uri: 'ui://agent-athens/events.html' })).contents[0];
const csp = [
  "default-src 'none'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${resource._meta.ui.csp.resourceDomains.join(' ')}`, "media-src 'self' data:", "connect-src 'none'",
].join('; ');

// Stub host: answers the handshake, records every message, posts the result on initialized.
const HOST = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>stub host</title>
<style>body{margin:0;background:#000} iframe{border:0;width:100%;height:100vh;display:block}</style></head><body>
<iframe id="view" title="Agent Athens events" src="/view"></iframe>
<script>
  window.received = []; // window.result is set by the test before this script runs
  const view = document.getElementById('view');
  window.addEventListener('message', (ev) => {
    if (ev.source !== view.contentWindow) return;
    const m = ev.data; window.received.push(m);
    const reply = (result) => view.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result }, '*');
    if (m.method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostInfo: { name: 'stub-host', version: '0' },
      hostCapabilities: { openLinks: {} }, hostContext: { theme: 'dark', locale: 'en-GB', timeZone: 'Europe/Athens', displayMode: 'inline' } });
    if (m.method === 'ui/open-link') reply({});
    if (m.method === 'ui/notifications/initialized' && window.result)
      view.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: window.result }, '*');
  });
</script></body></html>`;

// 1×1 PNG for agentathens.com images, so no test touches the network.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  if (!existsSync(CHROMIUM)) {
    throw new Error(`Chromium not found at ${CHROMIUM}. Set PLAYWRIGHT_CHROMIUM to a Chrome/Chromium binary; this test does not download browsers.`);
  }
  server = Bun.serve({
    port: 0,
    fetch: (req) => new URL(req.url).pathname === '/view'
      ? new Response(resource.text, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp } })
      : new Response(HOST, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
  });
  browser = await chromium.launch({ executablePath: CHROMIUM });
});
afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

async function show(result: object, width = 1024, height = 900): Promise<{ page: Page; view: Frame; requests: string[] }> {
  const page = await browser.newPage({ viewport: { width, height } });
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  // Offline by default; with LIVE=1, agentathens.com images (the CSP's one host) load for real.
  if (!process.env.LIVE) await page.route('https://agentathens.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route(/^https:\/\/(?!agentathens\.com)/, (route) => route.abort());
  await page.addInitScript((r) => { (window as any).result = r; }, result);
  await page.goto(`http://localhost:${server.port}/`);
  const view = page.frame({ url: /\/view$/ })!;
  await view.waitForSelector('main header, main .empty:not(:has-text("Loading"))');
  return { page, view, requests };
}

const search = (args: object, feed = fixtureFeed, now: (() => Date) | undefined = NOW) => rpc(feed, 'tools/call', { name: 'search_events', arguments: args }, now);

describe('event cards view', () => {
  test('handshake follows the spec: ui/initialize, then ui/notifications/initialized', async () => {
    const { page } = await show(await search({ when: 'this_weekend' }));
    const methods = (await page.evaluate(() => (window as any).received.map((m: any) => m.method))).filter(Boolean);
    expect(methods.slice(0, 2)).toEqual(['ui/initialize', 'ui/notifications/initialized']);
    await page.close();
  });

  test('one event: name, date, venue, price, both buttons', async () => {
    const { page, view } = await show(await search({ query: 'Rotting Christ' }));
    expect(await view.locator('li.card').count()).toBe(1);
    const text = await view.locator('li.card').innerText();
    expect(text).toContain('Rotting Christ');
    expect(text).toContain('Fuzz Club');
    expect(text).toMatch(/€25(\.00)?/);
    expect(await view.getByRole('link', { name: /Agent Athens page/ }).count()).toBe(1);
    expect(await view.getByRole('link', { name: /Tickets/ }).count()).toBe(1);
    await page.close();
  });

  test('zero events: an empty state, no cards', async () => {
    const { page, view } = await show(await search({ query: 'no such event anywhere' }));
    expect(await view.locator('li.card').count()).toBe(0);
    expect(await view.locator('.empty').innerText()).toContain('No events match');
    await page.close();
  });

  test('fifty events render as fifty cards', async () => {
    const base = await search({ limit: 1, query: 'Rotting Christ' });
    const one = base.structuredContent.events[0];
    const fifty = { ...base, structuredContent: { ...base.structuredContent, total: 50, returned: 50,
      events: Array.from({ length: 50 }, (_, i) => ({ ...one, id: `${one.id}-${i}` })) } };
    const { page, view } = await show(fifty);
    expect(await view.locator('li.card').count()).toBe(50);
    await page.close();
  });

  test('missing price and missing image degrade to text and a placeholder', async () => {
    const r = await search({ query: 'Rotting Christ' });
    const e = { ...r.structuredContent.events[0], price: { access: 'with-ticket' } };
    delete e.image;
    delete e.ticket_url;
    const { page, view } = await show({ ...r, structuredContent: { ...r.structuredContent, events: [e] } });
    expect(await view.locator('li.card').innerText()).toContain('Ticket, price not listed');
    expect(await view.locator('li.card img').count()).toBe(0);
    expect(await view.locator('li.card .placeholder').count()).toBe(1);
    expect(await view.getByRole('link', { name: /Tickets/ }).count()).toBe(0);
    await page.close();
  });

  test('a run ending in another year shows that year', async () => {
    const r = await search({ query: 'Rotting Christ' });
    const e = { ...r.structuredContent.events[0], start: '2026-09-01', end: '2027-07-31' };
    const { page, view } = await show({ ...r, structuredContent: { ...r.structuredContent, events: [e] } });
    expect(await view.locator('li.card').innerText()).toContain('2027');
    await page.close();
  });

  test('images from hosts outside the CSP are never requested', async () => {
    const r = await search({ query: 'Rotting Christ' });
    const e = { ...r.structuredContent.events[0], image: 'https://images.example.org/x.jpg' };
    const { page, view, requests } = await show({ ...r, structuredContent: { ...r.structuredContent, events: [e] } });
    expect(await view.locator('li.card .placeholder').count()).toBe(1);
    expect(requests.some((u) => u.includes('images.example.org'))).toBe(false);
    await page.close();
  });

  test('feed text is rendered as text, never as HTML', async () => {
    const r = await search({ query: 'Rotting Christ' });
    const e = { ...r.structuredContent.events[0], name: '<img src=x onerror="window.pwned=1">Hostile' };
    const { page, view } = await show({ ...r, structuredContent: { ...r.structuredContent, events: [e] } });
    expect(await view.locator('li.card h2').innerText()).toContain('<img src=x');
    expect(await view.evaluate(() => (window as any).pwned)).toBeUndefined();
    await page.close();
  });

  test('buttons open links through ui/open-link', async () => {
    const r = await search({ query: 'Rotting Christ' });
    const { page, view } = await show(r);
    await view.getByRole('link', { name: /Agent Athens page/ }).click();
    await view.getByRole('link', { name: /Tickets/ }).click();
    // postMessage is asynchronous: wait for both requests to reach the host.
    await page.waitForFunction(() => (window as any).received.filter((m: any) => m.method === 'ui/open-link').length >= 2, null, { timeout: 5000 });
    const opened = await page.evaluate(() => (window as any).received.filter((m: any) => m.method === 'ui/open-link').map((m: any) => m.params.url));
    expect(opened).toEqual([r.structuredContent.events[0].url, r.structuredContent.events[0].ticket_url]);
    expect(page.url()).toBe(`http://localhost:${server.port}/`); // the view itself did not navigate
    await page.close();
  });

  test('match_artists results show why each event matched', async () => {
    const r = await rpc(fixtureFeed, 'tools/call', { name: 'match_artists', arguments: { artists: ['Dire Straits'] } }, NOW);
    const { page, view } = await show(r);
    expect(await view.locator('.badge').innerText()).toContain('may be a tribute');
    await page.close();
  });

  test('axe: no serious or critical violations (one card and fifty)', async () => {
    const r = await search({ when: 'next_30_days', limit: 50 });
    expect(r.structuredContent.events.length).toBeGreaterThan(1); // precondition: several cards to check
    const { page, view } = await show(r);
    await view.addScriptTag({ content: readFileSync(AXE, 'utf8') });
    const out = await view.evaluate(async () => (await (window as any).axe.run(document, { resultTypes: ['violations'] })).violations
      .map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, where: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? '')) })));
    console.log('axe violations (all impacts):', JSON.stringify(out));
    expect(out.filter((v: any) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await page.close();
  });
});

describe.if(!!process.env.EVIDENCE_DIR)('evidence screenshots', () => {
  test('360 px and 1024 px', async () => {
    const dir = process.env.EVIDENCE_DIR!;
    mkdirSync(dir, { recursive: true });
    const live = !!process.env.LIVE;
    const r = live ? await search({ lang: 'en', when: 'this_weekend', limit: 6 }, httpFeedSource('https://agentathens.com'), () => new Date()) : await search({ limit: 6 });
    for (const w of [360, 1024]) {
      const { page } = await show(r, w);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: join(dir, `m3-cards-${w}.png`), fullPage: true });
      await page.close();
    }
    console.log(`screenshots: ${live ? 'live search_events this_weekend' : 'fixture'} result, ${r.structuredContent.events.length} cards`);
  });

  // Claude's directory wants 3–5 PNGs, at least 1000 px wide, cropped to the app response,
  // each paired with its prompt: one per directory-kit example, at 1200 px.
  test.if(!!process.env.LIVE)('directory carousel, one per example prompt', async () => {
    const { EXAMPLES } = await import('../scripts/examples');
    const live = httpFeedSource('https://agentathens.com');
    const dir = process.env.EVIDENCE_DIR!;
    for (const [i, ex] of EXAMPLES.entries()) {
      const r = await rpc(live, 'tools/call', { name: ex.tool, arguments: { ...ex.args, limit: ex.tool === 'search_events' ? 4 : undefined } }, () => new Date());
      const { page, view } = await show(r, 1200, 4000);
      await page.waitForLoadState('networkidle');
      // The view's own content height, with its padding: an element shot of <main> clips the edges.
      const height = await view.evaluate(() => Math.ceil(document.documentElement.getBoundingClientRect().height));
      await page.screenshot({ path: join(dir, `directory-${i + 1}.png`), clip: { x: 0, y: 0, width: 1200, height } });
      console.log(`directory-${i + 1}.png  "${ex.prompt}"`);
      await page.close();
    }
  });
});
