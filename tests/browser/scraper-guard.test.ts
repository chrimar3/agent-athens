/**
 * The scraper request guard (guardPageRequests) in a real Chromium.
 *
 * Chrome maps every *.test host to a local server (--host-resolver-rules);
 * the guard's own resolver is a stub that says public.test / other.test are
 * public and private.test is 10.0.0.1. The hostile page then tries:
 *   - an image on private.test (blocked by the DNS check, never reaches the server),
 *   - WebSockets from the page, a blob worker, a nested worker and a
 *     cross-site iframe (request interception never sees them: the kill
 *     switch must stop every one),
 *   - a popup (window.open).
 * An image on public.test must still load, and an unguarded page must reach
 * the WebSocket endpoint, so "no hits" is not vacuous.
 *
 * Run: AA_BROWSER_TESTS=1 CHROME_PATH=/path/to/chrome bun test tests/browser/scraper-guard.test.ts
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import puppeteer, { type Browser } from 'puppeteer-core';
import { guardPageRequests } from '../../src/utils/outbound-url';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DNS: Record<string, string[]> = {
  'public.test': ['93.184.216.34'],
  'other.test': ['93.184.216.35'],
  'private.test': ['10.0.0.1'],
};

describe.skipIf(process.env.AA_BROWSER_TESTS !== '1')('scraper request guard in Chromium', () => {
  setDefaultTimeout(60_000);
  let server: ReturnType<typeof Bun.serve>;
  let browser: Browser;
  const hits: string[] = [];

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(req, srv) {
        const u = new URL(req.url);
        hits.push(`${u.hostname}${u.pathname}`);
        const P = server.port;
        const ws = (tag: string) => `try { new WebSocket('ws://public.test:${P}/ws-${tag}'); } catch (e) {}`;
        const blobWorker = (body: string) => `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(body)}], { type: 'text/javascript' })))`;
        const html = (body: string) => new Response(`<!doctype html><html><body>${body}</body></html>`, { headers: { 'content-type': 'text/html' } });
        if (u.pathname.startsWith('/ws')) return srv.upgrade(req, { data: undefined }) ? undefined : new Response('no', { status: 400 });
        if (u.pathname === '/frame') return html(`<script>${ws('iframe')} try { ${blobWorker(ws('iframe-worker'))}; } catch (e) {}</script>`);
        if (u.pathname === '/') {
          return html(`<img src="http://private.test:${P}/img-private"><img src="http://public.test:${P}/img-public">
            <iframe src="http://other.test:${P}/frame"></iframe>
            <script>
              ${ws('page')}
              try { ${blobWorker(ws('worker'))}; } catch (e) {}
              try { ${blobWorker(`${blobWorker(ws('nested-worker'))}`)}; } catch (e) {}
              try { window.open('http://public.test:${P}/popup'); } catch (e) {}
              try { const f = document.body.appendChild(document.createElement('iframe')); new f.contentWindow.WebSocket('ws://public.test:${P}/ws-blank-iframe'); } catch (e) {}
            </script>`);
        }
        return new Response('x');
      },
      websocket: { message() {}, open(s) { s.send('hi'); } },
    });
    // --no-proxy-server: an inherited proxy setting would carry WebSockets elsewhere.
    const args = ['--host-resolver-rules=MAP *.test 127.0.0.1', '--no-proxy-server'];
    if (process.getuid?.() === 0) args.push('--no-sandbox');
    browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.stop(true);
  });

  test('no private-host resource, WebSocket or popup reaches the network; public resources still load', async () => {
    const page = await browser.newPage();
    const blocked: string[] = [];
    await guardPageRequests(page, { log: m => blocked.push(m), resolver: async h => { const a = DNS[h]; if (!a) throw new Error(`ENOTFOUND ${h}`); return a; } });
    await page.goto(`http://public.test:${server.port}/`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    await page.close();

    expect(hits).toContain('public.test/img-public');
    expect(hits).toContain('other.test/frame');
    expect(hits.filter(h => /img-private|\/ws|popup/.test(h))).toEqual([]);
    expect(blocked.join('\n')).toContain('private.test');
  });

  test('control: without the guard the same page does reach the WebSocket endpoint and the private host', async () => {
    hits.length = 0;
    const page = await browser.newPage();
    await page.goto(`http://public.test:${server.port}/`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
    await page.close();
    expect(hits).toContain('public.test/ws-page');
    expect(hits).toContain('public.test/ws-worker');
    expect(hits).toContain('private.test/img-private');
  });
});
