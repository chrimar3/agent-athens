/**
 * Scraper fetch guards. URLs that come from scraped pages (athinorama detail
 * links, RA contentUrl, RSS item links, SNFCC pagination) and the redirects
 * of fixed first-party URLs must go through the outbound guard
 * (src/utils/outbound-url.ts); headless-browser pages get request
 * interception that refuses non-http(s) schemes and local/private targets.
 *
 * No network: globalThis.fetch is a recording fake, DNS is mocked, curl is a
 * fake spawn.
 */
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import vm from 'node:vm';
import { join } from 'path';

const PUBLIC_IP = '93.184.216.34';
const DNS: Record<string, string[]> = {
  'www.athinorama.gr': [PUBLIC_IP],
  'ra.co': [PUBLIC_IP],
  'www.snfcc.org': [PUBLIC_IP],
  'feed.example.com': [PUBLIC_IP],
  'rebind.example.com': ['10.0.0.7'],
};
let dnsCalls: string[] = [];
mock.module('node:dns/promises', () => ({
  lookup: async (host: string) => {
    dnsCalls.push(host);
    const a = DNS[host];
    if (!a) throw new Error(`ENOTFOUND ${host}`);
    return a.map(address => ({ address, family: address.includes(':') ? 6 : 4 }));
  },
}));

const {
  quickBlockReason, sameOriginUrl, isRefusedTarget, guardPageRequests, safeCurlTextFollow, OutboundUrlError, assertPublicUrl,
  createHostChecker, BROWSER_KILL_SWITCH_SCRIPT,
} = await import('../../src/utils/outbound-url');
const { fetchWithRetryAthinorama, fetchWithHttp1Fallback, fetchWithCurl } = await import('../../scripts/scrape-all');

const ROOT = join(import.meta.dir, '../..');
type Route = { status?: number; headers?: Record<string, string>; body?: string };
let visited: string[] = [];
let routes: Record<string, Route> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  visited = [];
  routes = {};
  dnsCalls = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    let url = String(input);
    for (let hop = 0; hop < 10; hop++) {
      visited.push(url);
      const r = routes[url];
      if (!r) throw new Error(`fake network: no route for ${url}`);
      const status = r.status ?? 200;
      if (status >= 300 && status < 400 && r.headers?.location && init?.redirect !== 'manual') {
        url = new URL(r.headers.location, url).href;
        continue;
      }
      return new Response(r.body ?? '', { status, headers: r.headers });
    }
    throw new Error('loop');
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });
afterAll(() => { mock.restore(); });

describe('mocked DNS is in effect', () => {
  test('a name resolving to a private address is refused', async () => {
    await expect(assertPublicUrl('https://rebind.example.com/')).rejects.toThrow(/non-public/);
  });
});

describe('sameOriginUrl: scraped hrefs stay on the first-party origin', () => {
  test.each([
    ['/music/guide/x-123/', 'https://www.athinorama.gr/music/guide/x-123/'],
    ['/events/athens/123', 'https://www.athinorama.gr/events/athens/123'],
    // Resolved as a path, "@host" cannot change the host (string concatenation would).
    ['@evil.example/x', 'https://www.athinorama.gr/@evil.example/x'],
  ])('%s is kept', (href, expected) => {
    if (href.startsWith('@')) expect(new URL(`https://www.athinorama.gr${href}`).hostname).toBe('evil.example');
    expect(sameOriginUrl(href, 'https://www.athinorama.gr')).toBe(expected);
  });
  test.each([
    '//evil.example/x', '/\\evil.example/x', 'https://evil.example/', 'javascript:alert(1)',
    'http://www.athinorama.gr/x', 'https://user:pw@www.athinorama.gr/x', '', null,
  ])('%p is refused', href => {
    expect(sameOriginUrl(href as string, 'https://www.athinorama.gr')).toBeNull();
  });
});

describe('quickBlockReason: cheap per-request check', () => {
  test.each([
    'file:///etc/passwd', 'ftp://example.com/', 'chrome://settings', 'http://127.0.0.1:3000/', 'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/', 'http://192.168.1.1/', 'http://0x7f.1/', 'http://localhost:8080/',
    'http://printer.local/', 'http://router/', 'http://nas.home.arpa/', 'https://user:pw@example.com/',
    'ws://127.0.0.1:9222/devtools/browser', 'wss://www.snfcc.org/socket',
  ])('%s is refused', url => expect(quickBlockReason(url)).not.toBeNull());
  test.each([
    'https://www.snfcc.org/ekdiloseis/', 'http://93.184.216.34/', 'data:image/png;base64,AAAA', 'blob:https://www.snfcc.org/x', 'about:blank',
  ])('%s passes', url => expect(quickBlockReason(url)).toBeNull());
});

describe('guardPageRequests: puppeteer request interception', () => {
  type Sent = { session: string; method: string; params?: Record<string, unknown> };
  function fakePage() {
    let handler: ((r: any) => void) | null = null;
    const outcomes: Record<string, string> = {};
    const sent: Sent[] = [];
    const newDocScripts: string[] = [];
    const listeners: Record<string, Record<string, (ev: any) => void>> = {};
    const session = (id: string): any => ({
      async send(method: string, params?: Record<string, unknown>) { sent.push({ session: id, method, params }); return {}; },
      on(event: string, h: (ev: any) => void) { (listeners[id] ??= {})[event] = h; },
      connection: () => ({ session: (sid: string) => session(sid) }),
    });
    const page = {
      interception: false,
      async setRequestInterception(v: boolean) { this.interception = v; },
      on(_e: 'request', h: (r: any) => void) { handler = h; },
      async evaluateOnNewDocument(src: string) { newDocScripts.push(src); },
      async createCDPSession() { return session('page'); },
    };
    const request = (url: string, navigation: boolean) => new Promise<string>(resolve => {
      handler!({
        url: () => url,
        isNavigationRequest: () => navigation,
        abort: async (code?: string) => { outcomes[url] = `abort:${code}`; resolve(outcomes[url]); },
        continue: async () => { outcomes[url] = 'continue'; resolve('continue'); },
      });
    });
    /** Chrome reporting a new worker / iframe held before its first script. */
    const attach = async (parent: string, sessionId: string, type: string) => {
      listeners[parent]['Target.attachedToTarget']({ sessionId, targetInfo: { type, url: 'blob:https://x/1' }, waitingForDebugger: true });
      await new Promise(r => setTimeout(r, 10));
    };
    return { page, request, sent, newDocScripts, attach };
  }

  test('turns interception on and refuses local, private and non-http targets', async () => {
    const { page, request } = fakePage();
    await guardPageRequests(page, { log: () => {} });
    expect(page.interception).toBe(true);
    for (const url of ['file:///etc/passwd', 'http://127.0.0.1:3000/', 'http://169.254.169.254/', 'http://localhost/', 'http://router/', 'ws://127.0.0.1:9222/devtools', 'wss://www.snfcc.org/socket']) {
      expect(await request(url, false)).toBe('abort:blockedbyclient');
      expect(await request(url, true)).toBe('abort:blockedbyclient');
    }
  });

  test('a navigation to a name that resolves to a private address is refused', async () => {
    const { page, request } = fakePage();
    await guardPageRequests(page, { log: () => {} });
    expect(await request('https://rebind.example.com/next/', true)).toBe('abort:blockedbyclient');
  });

  test('a subresource whose host resolves to a private address is refused', async () => {
    DNS['cdn-private.example.com'] = ['192.168.1.10'];
    DNS['cdn-ula.example.com'] = ['fd00::5'];
    DNS['cdn-cgnat.example.com'] = ['100.64.0.9'];
    DNS['cdn-mixed.example.com'] = [PUBLIC_IP, '127.0.0.1'];
    const { page, request } = fakePage();
    await guardPageRequests(page, { log: () => {} });
    for (const url of ['https://rebind.example.com/app.js', 'https://cdn-private.example.com/x.png', 'https://cdn-ula.example.com/api', 'http://cdn-cgnat.example.com/', 'https://cdn-mixed.example.com/x.css']) {
      expect(await request(url, false)).toBe('abort:blockedbyclient');
    }
  });

  test('a subresource whose host cannot be resolved is refused (fail closed)', async () => {
    const { page, request } = fakePage();
    await guardPageRequests(page, { log: () => {} });
    expect(await request('https://cdn.unlisted.example/app.js', false)).toBe('abort:blockedbyclient');
  });

  test('a lookup that hangs is refused after the time limit', async () => {
    const { page, request } = fakePage();
    const logs: string[] = [];
    await guardPageRequests(page, { log: m => logs.push(m), hostTimeoutMs: 50, resolver: () => new Promise(() => {}) });
    const started = Date.now();
    expect(await request('https://slow.example.com/x.js', false)).toBe('abort:blockedbyclient');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(logs.join('\n')).toContain('timed out');
  });

  test('public navigations and subresources continue; each host is resolved once per page', async () => {
    const { page, request } = fakePage();
    await guardPageRequests(page, { log: () => {} });
    expect(await request('https://www.snfcc.org/ekdiloseis/page/2/', true)).toBe('continue');
    expect(await request('https://www.snfcc.org/wp-content/app.js', false)).toBe('continue');
    expect(await request('https://www.snfcc.org/wp-content/logo.png', false)).toBe('continue');
    expect(dnsCalls).toEqual(['www.snfcc.org']);
    dnsCalls = [];
    expect(await request('data:image/png;base64,AAAA', false)).toBe('continue');
    expect(dnsCalls).toEqual([]);
    // A second page has its own cache.
    const other = fakePage();
    await guardPageRequests(other.page, { log: () => {} });
    expect(await other.request('https://www.snfcc.org/x.js', false)).toBe('continue');
    expect(dnsCalls).toEqual(['www.snfcc.org']);
  });

  test('WebSockets are switched off in every frame, and in every worker before it starts', async () => {
    const { page, sent, newDocScripts, attach } = fakePage();
    await guardPageRequests(page, { log: () => {} });
    expect(newDocScripts).toEqual([BROWSER_KILL_SWITCH_SCRIPT]);
    expect(sent).toContainEqual({ session: 'page', method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true } });

    await attach('page', 'w1', 'worker');
    const w1 = sent.filter(s => s.session === 'w1').map(s => s.method);
    expect(w1).toEqual(['Target.setAutoAttach', 'Runtime.evaluate', 'Runtime.runIfWaitingForDebugger']);
    expect(sent.find(s => s.session === 'w1' && s.method === 'Runtime.evaluate')!.params).toEqual({ expression: BROWSER_KILL_SWITCH_SCRIPT });

    // A worker started by that worker is held and switched off the same way.
    await attach('w1', 'w2', 'worker');
    expect(sent.filter(s => s.session === 'w2').map(s => s.method)).toEqual(['Target.setAutoAttach', 'Runtime.evaluate', 'Runtime.runIfWaitingForDebugger']);

    // An out-of-process iframe gets the script for every document it loads.
    await attach('page', 'f1', 'iframe');
    expect(sent.filter(s => s.session === 'f1').map(s => s.method)).toEqual(['Target.setAutoAttach', 'Page.addScriptToEvaluateOnNewDocument', 'Runtime.runIfWaitingForDebugger']);
    expect(sent.find(s => s.session === 'f1' && s.method === 'Page.addScriptToEvaluateOnNewDocument')!.params).toEqual({ source: BROWSER_KILL_SWITCH_SCRIPT, runImmediately: true });
  });

  test('the kill switch removes WebSocket, WebTransport, WebRTC, shared workers and window.open for good', async () => {
    const ctx: Record<string, any> = {
      WebSocket: class {}, WebSocketStream: class {}, WebTransport: class {}, SharedWorker: class {},
      RTCPeerConnection: class {}, webkitRTCPeerConnection: class {}, RTCDataChannel: class {},
      open: () => 'popup', DOMException: class extends Error { constructor(m: string, public name: string) { super(m); } },
      ServiceWorkerContainer: class { register() { return 'registered'; } },
    };
    vm.runInNewContext(BROWSER_KILL_SWITCH_SCRIPT, vm.createContext(ctx));
    for (const k of ['WebSocket', 'WebSocketStream', 'WebTransport', 'SharedWorker', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) {
      expect({ k, v: vm.runInContext(`typeof ${k}`, ctx) }).toEqual({ k, v: 'undefined' });
      // A page script cannot put it back.
      vm.runInContext(`try { globalThis.${k} = function () {}; } catch (e) {} try { Object.defineProperty(globalThis, '${k}', { value: function () {} }); } catch (e) {}`, ctx);
      expect({ k, v: vm.runInContext(`typeof ${k}`, ctx) }).toEqual({ k, v: 'undefined' });
    }
    expect(vm.runInContext(`open('http://192.168.1.1/')`, ctx)).toBeNull();
    expect(await vm.runInContext(`new ServiceWorkerContainer().register('/sw.js').then(() => 'registered', e => e.name)`, ctx)).toBe('SecurityError');
  });

  test('in a worker (no window) the WebSocket constructor is removed too', () => {
    const ctx: Record<string, any> = { WebSocket: class {} };
    vm.runInNewContext(BROWSER_KILL_SWITCH_SCRIPT, vm.createContext(ctx));
    expect(vm.runInContext('typeof WebSocket', ctx)).toBe('undefined');
  });
});

describe('createHostChecker', () => {
  test('caches a verdict per host for its lifetime, then asks again', async () => {
    let t = 0;
    const calls: string[] = [];
    const check = createHostChecker({ resolver: async h => { calls.push(h); return [PUBLIC_IP]; }, ttlMs: 1000, now: () => t });
    expect(await check('https://a.example.com/1')).toBeNull();
    expect(await check('https://A.example.com:8443/2')).toBeNull();
    expect(calls).toEqual(['a.example.com']);
    t = 1500;
    expect(await check('https://a.example.com/3')).toBeNull();
    expect(calls).toEqual(['a.example.com', 'a.example.com']);
  });

  test('an empty answer and a resolver error are refusals', async () => {
    expect(await createHostChecker({ resolver: async () => [] })('https://none.example.com/')).toMatch(/no addresses/);
    expect(await createHostChecker({ resolver: async () => { throw new Error('SERVFAIL'); } })('https://err.example.com/')).toMatch(/could not resolve/);
  });
});

describe('safeCurlTextFollow (replaces curl -L)', () => {
  function fakeCurl(responses: Record<string, string>) {
    const calls: string[][] = [];
    const spawn = (args: string[]) => {
      calls.push(args);
      const url = args[args.length - 1];
      const out = responses[url];
      if (out === undefined) throw new Error(`no fake response for ${url}`);
      return {
        stdout: new Response(out).body!,
        exited: Promise.resolve(0),
        kill() {},
      };
    };
    return { calls, spawn };
  }

  test('follows a public redirect, pins each hop, returns the body without headers', async () => {
    const { calls, spawn } = fakeCurl({
      'https://feed.example.com/a': 'HTTP/1.1 301 Moved\r\nLocation: /b\r\n\r\n',
      'https://feed.example.com/b': 'HTTP/1.1 200 OK\r\nContent-Type: text/xml\r\n\r\n<rss/>',
    });
    expect(await safeCurlTextFollow('https://feed.example.com/a', { spawn })).toBe('<rss/>');
    expect(calls.length).toBe(2);
    for (const args of calls) {
      expect(args).toContain('--resolve');
      expect(args).toContain('-D');
      expect(args).not.toContain('-L');
      expect(args[args.indexOf('--max-redirs') + 1]).toBe('0');
    }
  });

  test('a redirect to a private address is refused before curl runs again', async () => {
    const { calls, spawn } = fakeCurl({ 'https://feed.example.com/a': 'HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/latest/\r\n\r\n' });
    const err = await safeCurlTextFollow('https://feed.example.com/a', { spawn }).catch(e => e);
    expect(err).toBeInstanceOf(OutboundUrlError);
    expect(err.code).toBe('blocked-address');
    expect(calls.length).toBe(1);
  });

  test('a redirect to file: is refused', async () => {
    const { spawn } = fakeCurl({ 'https://feed.example.com/a': 'HTTP/1.1 302 Found\r\nLocation: file:///etc/passwd\r\n\r\n' });
    const err = await safeCurlTextFollow('https://feed.example.com/a', { spawn }).catch(e => e);
    expect(isRefusedTarget(err)).toBe(true);
  });

  test('redirect loops stop at the limit', async () => {
    const { spawn } = fakeCurl({ 'https://feed.example.com/a': 'HTTP/1.1 302 Found\r\nLocation: /a\r\n\r\n' });
    const err = await safeCurlTextFollow('https://feed.example.com/a', { spawn, maxRedirects: 3 }).catch(e => e);
    expect(err.code).toBe('redirect-limit');
  });
});

describe('scrape-all fetch helpers go through the guard', () => {
  test('athinorama fetch: a private target is never contacted', async () => {
    routes['http://127.0.0.1:8080/x'] = { body: 'secret' };
    expect(await fetchWithRetryAthinorama('http://127.0.0.1:8080/x', 1)).toBeNull();
    expect(visited).toEqual([]);
  });

  test('athinorama fetch: a redirect into the LAN is not followed', async () => {
    routes['https://www.athinorama.gr/music/x/'] = { status: 302, headers: { location: 'http://192.168.1.1/admin' } };
    routes['http://192.168.1.1/admin'] = { body: 'router' };
    expect(await fetchWithRetryAthinorama('https://www.athinorama.gr/music/x/', 1)).toBeNull();
    expect(visited).toEqual(['https://www.athinorama.gr/music/x/']);
  });

  test('athinorama fetch: the first-party page still loads', async () => {
    routes['https://www.athinorama.gr/music/guide'] = { body: '<html>guide</html>' };
    expect(await fetchWithRetryAthinorama('https://www.athinorama.gr/music/guide', 1)).toBe('<html>guide</html>');
  });

  test('HTTP/1.1-fallback fetch: refused targets fail fast without fetch or curl', async () => {
    const r = await fetchWithHttp1Fallback('http://169.254.169.254/latest/meta-data/', { maxRetries: 0 });
    expect(r.ok).toBe(false);
    expect(visited).toEqual([]);
  });

  test('HTTP/1.1-fallback fetch: first-party page loads', async () => {
    routes['https://ra.co/events/1'] = { body: 'ok' };
    const r = await fetchWithHttp1Fallback('https://ra.co/events/1', { maxRetries: 0 });
    expect([r.ok, await r.text()]).toEqual([true, 'ok']);
  });

  test('curl fetch: file: and loopback URLs are refused before spawning curl', async () => {
    const realSpawn = Bun.spawn;
    let spawned = 0;
    (Bun as any).spawn = (...a: any[]) => { spawned++; return (realSpawn as any)(...a); };
    try {
      expect((await fetchWithCurl('file:///etc/passwd')).ok).toBe(false);
      expect((await fetchWithCurl('http://127.0.0.1/')).ok).toBe(false);
      expect(spawned).toBe(0);
    } finally {
      (Bun as any).spawn = realSpawn;
    }
  });
});

describe('scraper sources: no unguarded paths', () => {
  const scrapers = readdirSync(join(ROOT, 'scripts')).filter(f => /^scrape-.*\.ts$/.test(f));
  const src = (f: string) => readFileSync(join(ROOT, 'scripts', f), 'utf-8');

  test('every headless page gets request interception right after it is created', () => {
    for (const f of scrapers) {
      const lines = src(f).split('\n');
      lines.forEach((line, i) => {
        if (/\.newPage\(\)/.test(line)) expect({ f, line: i + 1, next: lines[i + 1].trim() }).toEqual({ f, line: i + 1, next: expect.stringMatching(/^await guardPageRequests\(page\)/) });
      });
    }
  });

  test('no scraper spawns curl directly', () => {
    for (const f of scrapers) expect({ f, rawCurl: /spawn\(\s*\[\s*['"]curl['"]/.test(src(f)) }).toEqual({ f, rawCurl: false });
  });

  test('scrape-all: the only raw fetch() is the fixed RA GraphQL POST, which refuses redirects', () => {
    const code = src('scrape-all.ts').split('\n').filter(l => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
    const calls = [...code.matchAll(/[^\w.]fetch\(([^,)]*)/g)].map(m => m[1].trim());
    expect(calls).toEqual(["'https://ra.co/graphql'"]);
    expect(src('scrape-all.ts')).toMatch(/fetch\('https:\/\/ra\.co\/graphql', \{\s*method: 'POST',\s*redirect: 'error'/);
  });

  test('scraped hrefs that become fetched URLs are origin-checked', () => {
    expect(src('scrape-all.ts')).toMatch(/sameOriginUrl\(eventUrl, 'https:\/\/www\.athinorama\.gr'\)/);
    expect(src('scrape-all.ts')).toMatch(/sameOriginUrl\(e\.contentUrl, 'https:\/\/ra\.co'\)/);
    expect(src('scrape-snfcc.ts')).toMatch(/sameOriginUrl\(nextHref, 'https:\/\/www\.snfcc\.org'\)/);
  });
});
