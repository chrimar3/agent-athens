/**
 * The enforced script CSP (dist/_headers) in a real browser.
 *
 * Builds the real site from the hostile fixture database
 * (tests/security/helpers/hostile-site.ts), serves dist/ with the headers
 * from dist/_headers applied, and opens every page type in Chromium:
 *   - no securitypolicyviolation event and no CSP console error on any page;
 *   - no payload ran (no dialog, no uncaught error);
 *   - the delegated image fallback hides broken card images;
 *   - the GA bootstrap ran and the gtag loader was not blocked;
 *   - search, save, the saved page and share still work;
 *   - a probe page proves the policy is enforced (an unlisted inline script
 *     and an inline handler are blocked), so "no violations" is not vacuous;
 *   - a second probe loads another container from the GA host (gtm.js), which
 *     the exact-path script-src must block, and gtag's own /gtag/destination
 *     script, which it must allow.
 *
 * Run: AA_BROWSER_TESTS=1 CHROME_PATH=/path/to/chrome bun test tests/browser/csp-enforced.test.ts
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join, normalize } from 'path';
import { buildHostileSite, type HostileSite } from '../security/helpers/hostile-site';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) headers[m[1]] = m[2];
  }
  return headers;
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.xml': 'application/xml' };

describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('enforced script CSP in Chromium', () => {
  setDefaultTimeout(60_000);
  let site: HostileSite;
  let server: ReturnType<typeof Bun.serve>;
  let browser: Browser;
  let csp: string;
  const report: Record<string, { violations: string[]; errors: string[] }> = {};

  beforeAll(async () => {
    site = buildHostileSite();
    if (site.exitCode !== 0) throw new Error(`fixture build failed:\n${site.output.slice(-2000)}`);
    const headers = parseHeaders(readFileSync(join(site.dist, '_headers'), 'utf-8'));
    csp = headers['Content-Security-Policy'];
    const probe = '<!doctype html><html><head><script>window.__probeInline = true;</script></head><body><img src="/missing.png" onerror="window.__probeHandler = true"><a id="js" href="javascript:window.__probeHref = true">x</a></body></html>';
    const gtmProbe = '<!doctype html><html><head><script src="https://www.googletagmanager.com/gtm.js?id=GTM-EVIL"></script><script src="https://www.googletagmanager.com/gtag/destination?id=AW-1&l=dataLayer&cx=c"></script></head><body></body></html>';
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(req) {
        const path = decodeURIComponent(new URL(req.url).pathname);
        if (path === '/__csp-probe.html') return new Response(probe, { headers: { ...headers, 'Content-Type': 'text/html' } });
        if (path === '/__csp-gtm-probe.html') return new Response(gtmProbe, { headers: { ...headers, 'Content-Type': 'text/html' } });
        let file = normalize(join(site.dist, path));
        if (!file.startsWith(site.dist)) return new Response('no', { status: 403 });
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
        else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
        if (!existsSync(file)) return new Response(readFileSync(join(site.dist, '404.html')), { status: 404, headers: { ...headers, 'Content-Type': 'text/html' } });
        const ext = file.slice(file.lastIndexOf('.'));
        return new Response(readFileSync(file), { headers: { ...headers, 'Content-Type': TYPES[ext] ?? 'application/octet-stream' } });
      },
    });
    const args = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
    browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args });
    await browser.defaultBrowserContext().overridePermissions(server.url.origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  }, 240_000);

  afterAll(async () => {
    await browser?.close();
    server?.stop(true);
    if (site?.root) rmSync(site.root, { recursive: true, force: true });
    console.log(`[csp-browser] policy: ${csp}`);
    console.log(`[csp-browser] ${JSON.stringify(report)}`);
  });

  const entries = new WeakMap<Page, { violations: string[]; errors: string[] }>();

  async function open(path: string, key = path): Promise<Page> {
    const page = await browser.newPage();
    const entry = (report[key] = { violations: [] as string[], errors: [] as string[] });
    entries.set(page, entry);
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.origin === server.url.origin) return req.continue();
      // The GA loader host is allowed by script-src; answer with a stub so no traffic leaves the sandbox.
      if (url.hostname === 'www.googletagmanager.com') return req.respond({ status: 200, contentType: 'text/javascript', body: `window.__gtagLoaded = true; (window.__gtmPaths = window.__gtmPaths || []).push(${JSON.stringify(url.pathname)});` });
      return req.abort('failed'); // hotlinked images and fonts fail, exercising the image fallback
    });
    page.on('console', msg => { if (/Content Security Policy/i.test(msg.text())) entry.violations.push(`console: ${msg.text().slice(0, 200)}`); });
    page.on('pageerror', err => entry.errors.push(String(err).slice(0, 200)));
    page.on('dialog', async d => { entry.errors.push(`dialog: ${d.message()}`); await d.dismiss(); });
    await page.evaluateOnNewDocument(() => {
      (globalThis as any).__csp = [];
      (globalThis as any).document.addEventListener('securitypolicyviolation', (e: any) => (globalThis as any).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`));
    });
    await page.goto(new URL(path, server.url).href, { waitUntil: 'networkidle0' });
    return page;
  }

  /** CSP violations seen on this page so far (events + console), accumulated across navigations. */
  async function violations(page: Page): Promise<string[]> {
    const entry = entries.get(page)!;
    const fromEvents = await page.evaluate(() => (globalThis as any).__csp as string[]);
    for (const v of fromEvents) if (!entry.violations.includes(v)) entry.violations.push(v);
    return entry.violations;
  }

  const firstDir = (dir: string) => readdirSync(join(site.dist, dir)).find(d => existsSync(join(site.dist, dir, d, 'index.html')))!;

  test('the policy is enforced: an unlisted inline script, an inline handler and a javascript: link are blocked', async () => {
    const page = await open('/__csp-probe.html');
    await page.click('#js');
    await new Promise(r => setTimeout(r, 200));
    const ran = await page.evaluate(() => [(globalThis as any).__probeInline === true, (globalThis as any).__probeHandler === true, (globalThis as any).__probeHref === true]);
    expect(ran).toEqual([false, false, false]);
    const v = await violations(page);
    expect(v.filter(x => /script-src/.test(x)).length).toBeGreaterThanOrEqual(2);
    await page.close();
  });

  test('the GA host is allowed by exact path only: another container (gtm.js) is blocked, /gtag/destination runs', async () => {
    const page = await open('/__csp-gtm-probe.html');
    const ran = await page.evaluate(() => (globalThis as any).__gtmPaths ?? []);
    expect(ran).toEqual(['/gtag/destination']);
    const v = await violations(page);
    expect(v.some(x => /script-src/.test(x) && /gtm\.js/.test(x))).toBe(true);
    await page.close();
  });

  for (const [label, path] of [
    ['homepage', '/'],
    ['English hub', '/en/this-weekend/'],
    ['Greek hub', '/this-weekend.html'],
    ['event page', () => `/events/${firstDir('events')}/`],
    ['English event page', () => `/en/events/${firstDir('en/events')}/`],
    ['venue page', () => `/venues/${firstDir('venues')}/`],
    ['saved page', '/saved/'],
    ['tonight', '/tonight.html'],
    ['colophon', '/en/colophon/'],
    ['404', '/no-such-page/'],
  ] as const) {
    test(`${label}: no CSP violation, no payload ran, GA bootstrap ran`, async () => {
      const p = typeof path === 'function' ? path() : path;
      const page = await open(p);
      expect(await violations(page)).toEqual([]);
      expect(report[p].errors).toEqual([]);
      const ga = await page.evaluate(() => ({ dataLayer: Array.isArray((globalThis as any).dataLayer) && (globalThis as any).dataLayer.length >= 2, loader: (globalThis as any).__gtagLoaded === true }));
      if (p !== '/tonight.html') expect(ga).toEqual({ dataLayer: true, loader: true });
      await page.close();
    });
  }

  test('image fallback: broken card images are hidden and their placeholder shown', async () => {
    const page = await open('/en/this-weekend/', 'image-fallback');
    const state = await page.$$eval('img[data-img-fallback]', imgs => imgs.map(img => ({
      src: img.getAttribute('src'),
      hidden: (globalThis as any).getComputedStyle(img).display === 'none',
      placeholderShown: img.nextElementSibling ? (globalThis as any).getComputedStyle(img.nextElementSibling).display !== 'none' : false,
    })));
    const broken = state.filter(s => /^https?:\/\/(?!127\.0\.0\.1)/.test(s.src ?? ''));
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.every(s => s.hidden && s.placeholderShown)).toBe(true);
    expect(await violations(page)).toEqual([]);
    await page.close();
  });

  test('tonight.html renders cards from the JSON feed with only http(s) or site-relative links', async () => {
    const page = await open('/tonight.html', 'tonight-cards');
    await page.waitForFunction(() => (globalThis as any).document.querySelectorAll('#grid .event-card').length > 0 || !(globalThis as any).document.getElementById('empty').hidden, { timeout: 10_000 });
    const links = await page.$$eval('#grid a[href], #grid img[src]', els => els.map(e => e.getAttribute('href') ?? e.getAttribute('src') ?? ''));
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter(h => !/^(?:https?:\/\/|\/(?!\/)|#$)/.test(h))).toEqual([]);
    expect(await violations(page)).toEqual([]);
    await page.close();
  });

  test('search: the overlay loads the index and Fuse and shows results', async () => {
    const page = await open('/en/this-weekend/', 'search');
    await page.click('.nav-search-btn');
    await page.type('.search-input', 'Hostile');
    await page.waitForSelector('.search-result-item', { timeout: 10_000 });
    const count = await page.$$eval('.search-result-item', els => els.length);
    expect(count).toBeGreaterThan(0);
    expect(await violations(page)).toEqual([]);
    await page.close();
  });

  test('save and share on an event page; the saved page lists the event', async () => {
    const slug = firstDir('events');
    const page = await open(`/events/${slug}/`, 'save-share-saved');
    await page.click('[data-save-event]');
    expect(await page.$eval('[data-save-event]', b => b.getAttribute('aria-pressed'))).toBe('true');
    await page.click('.edp-share-btn');
    await page.waitForSelector('.aa-toast', { timeout: 5_000 });
    expect(await violations(page)).toEqual([]);
    await page.goto(new URL('/saved/', server.url).href, { waitUntil: 'networkidle0' });
    const saved = await page.$$eval('a[href*="/events/"]', els => els.map(e => e.getAttribute('href')));
    expect(saved.some(h => h?.includes(slug))).toBe(true);
    expect(await violations(page)).toEqual([]);
    await page.close();
  });
});
