/**
 * Outbound URL guard for fetches of URLs that came from scraped or emailed data.
 *
 * No network: every test injects a resolver and a fetch implementation, except
 * the "inside the container" tests, which run the real guard in a child
 * process whose DNS always fails. The fake fetch follows redirects itself
 * unless called with redirect:'manual', like the real fetch, so an unguarded
 * caller would visit the redirect target.
 */
import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import {
  OutboundUrlError,
  assertPublicUrl,
  buildCurlArgs,
  isBlockedAddress,
  proxyMode,
  safeCurlText,
  safeFetch,
  type OutboundErrorCode,
  type Resolver,
} from '../outbound-url';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const PUBLIC_IP = '93.184.216.34';

function resolverFrom(map: Record<string, string[]>): Resolver {
  return async (host: string) => {
    const r = map[host];
    if (!r) throw new Error(`ENOTFOUND ${host}`);
    return r;
  };
}

type Route = { status?: number; headers?: Record<string, string>; body?: string | Uint8Array | ReadableStream<Uint8Array> };

function fakeFetch(routes: Record<string, Route>) {
  const visited: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let url = String(input);
    for (let hop = 0; hop < 20; hop++) {
      visited.push(url);
      const route = routes[url];
      if (!route) throw new Error(`fake network: no route for ${url}`);
      const status = route.status ?? 200;
      const location = route.headers?.location;
      if (status >= 300 && status < 400 && location && init?.redirect !== 'manual') {
        url = new URL(location, url).href;
        continue;
      }
      return new Response(init?.method === 'HEAD' ? null : (route.body as any) ?? '', { status, headers: route.headers });
    }
    throw new Error('fake network: redirect loop');
  }) as typeof fetch;
  return { impl, visited };
}

async function expectOutboundError(p: Promise<unknown>, code: OutboundErrorCode) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(OutboundUrlError);
  expect((err as OutboundUrlError).code).toBe(code);
}

// ---------------------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------------------

describe('isBlockedAddress', () => {
  const blocked = [
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.10',
    '169.254.169.254', '169.254.0.1', '100.64.0.1', '100.127.255.255', '0.0.0.0', '192.0.0.192',
    '198.18.0.1', '224.0.0.1', '255.255.255.255', '240.0.0.1',
    '::', '::1', 'fe80::1', 'fe80::1%lo0', 'fc00::1', 'fd00:ec2::254', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2002:7f00:1::',
    '2001:db8::1', '2001::1', '::127.0.0.1', '100::1',
  ];
  const allowed = ['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808'];

  for (const ip of blocked) test(`blocks ${ip}`, () => expect(isBlockedAddress(ip)).toBe(true));
  for (const ip of allowed) test(`allows ${ip}`, () => expect(isBlockedAddress(ip)).toBe(false));

  test('non-IP input is treated as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

describe('assertPublicUrl', () => {
  const resolver = resolverFrom({
    'www.example.com': [PUBLIC_IP],
    'localhost': ['127.0.0.1'],
    'internal.example.com': ['10.0.0.5'],
    'mixed.example.com': [PUBLIC_IP, '192.168.0.10'],
    'metadata.google.internal': ['169.254.169.254'],
  });

  test('accepts a public https URL', async () => {
    const r = await assertPublicUrl('https://www.example.com/a?b=1', { resolver });
    expect(r.url.href).toBe('https://www.example.com/a?b=1');
    expect(r.addresses).toEqual([PUBLIC_IP]);
  });

  for (const bad of ['file:///etc/passwd', 'ftp://www.example.com/', 'javascript:alert(1)', 'data:text/html,x', 'gopher://www.example.com/']) {
    test(`rejects non-http(s) scheme: ${bad.split(':')[0]}`, () => expectOutboundError(assertPublicUrl(bad, { resolver }), 'scheme'));
  }

  test('rejects embedded credentials', () =>
    expectOutboundError(assertPublicUrl('https://user:pass@www.example.com/', { resolver }), 'credentials'));

  test('rejects garbage', () => expectOutboundError(assertPublicUrl('not a url', { resolver }), 'invalid-url'));

  for (const bad of [
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://10.1.2.3:8080/',
    'http://localhost:3000/',
    'http://internal.example.com/',
    'http://metadata.google.internal/computeMetadata/v1/',
  ]) {
    test(`rejects private/loopback/metadata target ${bad}`, () =>
      expectOutboundError(assertPublicUrl(bad, { resolver }), 'blocked-address'));
  }

  test('rejects a host where any resolved address is private', () =>
    expectOutboundError(assertPublicUrl('https://mixed.example.com/', { resolver }), 'blocked-address'));

  test('rejects a host that does not resolve', () =>
    expectOutboundError(assertPublicUrl('https://nx.example.com/', { resolver }), 'dns'));
});

// ---------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------

describe('safeFetch', () => {
  const resolver = resolverFrom({
    'www.example.com': [PUBLIC_IP],
    'cdn.example.com': ['93.184.216.35'],
    'rebind.example.com': ['10.0.0.1'],
  });

  test('fetches a public URL and returns body and final URL', async () => {
    const { impl } = fakeFetch({ 'https://www.example.com/': { body: 'hello' } });
    const r = await safeFetch('https://www.example.com/', { resolver, fetchImpl: impl });
    expect(r.status).toBe(200);
    expect(r.text()).toBe('hello');
    expect(r.url).toBe('https://www.example.com/');
    expect(r.redirected).toBe(false);
  });

  test('does not contact a loopback URL at all', async () => {
    const { impl, visited } = fakeFetch({ 'http://127.0.0.1/': { body: 'admin' } });
    await expectOutboundError(safeFetch('http://127.0.0.1/', { resolver, fetchImpl: impl }), 'blocked-address');
    expect(visited).toEqual([]);
  });

  test('does not contact the metadata endpoint', async () => {
    const { impl, visited } = fakeFetch({ 'http://169.254.169.254/': { body: 'creds' } });
    await expectOutboundError(safeFetch('http://169.254.169.254/', { resolver, fetchImpl: impl }), 'blocked-address');
    expect(visited).toEqual([]);
  });

  test('does not contact IPv6 loopback', async () => {
    const { impl, visited } = fakeFetch({ 'http://[::1]/': { body: 'x' } });
    await expectOutboundError(safeFetch('http://[::1]/', { resolver, fetchImpl: impl }), 'blocked-address');
    expect(visited).toEqual([]);
  });

  test('follows a redirect to another public host, re-validating the hop', async () => {
    const { impl, visited } = fakeFetch({
      'https://www.example.com/img': { status: 302, headers: { location: 'https://cdn.example.com/i.jpg' } },
      'https://cdn.example.com/i.jpg': { body: 'IMG', headers: { 'content-type': 'image/jpeg' } },
    });
    const r = await safeFetch('https://www.example.com/img', { resolver, fetchImpl: impl });
    expect(r.text()).toBe('IMG');
    expect(r.url).toBe('https://cdn.example.com/i.jpg');
    expect(r.redirected).toBe(true);
    expect(visited).toEqual(['https://www.example.com/img', 'https://cdn.example.com/i.jpg']);
  });

  test('resolves a relative Location against the current URL', async () => {
    const { impl } = fakeFetch({
      'https://www.example.com/a/b': { status: 301, headers: { location: '../c' } },
      'https://www.example.com/c': { body: 'C' },
    });
    const r = await safeFetch('https://www.example.com/a/b', { resolver, fetchImpl: impl });
    expect(r.url).toBe('https://www.example.com/c');
  });

  test('does not follow a redirect to a private IP', async () => {
    const { impl, visited } = fakeFetch({
      'https://www.example.com/x': { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } },
      'http://169.254.169.254/latest/meta-data/': { body: 'SECRET' },
    });
    await expectOutboundError(safeFetch('https://www.example.com/x', { resolver, fetchImpl: impl }), 'blocked-address');
    expect(visited).toEqual(['https://www.example.com/x']);
  });

  test('does not follow a redirect to a host that resolves privately', async () => {
    const { impl, visited } = fakeFetch({
      'https://www.example.com/x': { status: 307, headers: { location: 'http://rebind.example.com/' } },
      'http://rebind.example.com/': { body: 'LAN' },
    });
    await expectOutboundError(safeFetch('https://www.example.com/x', { resolver, fetchImpl: impl }), 'blocked-address');
    expect(visited).toEqual(['https://www.example.com/x']);
  });

  test('does not follow a redirect to a non-http scheme', async () => {
    const { impl } = fakeFetch({
      'https://www.example.com/x': { status: 302, headers: { location: 'file:///etc/passwd' } },
    });
    await expectOutboundError(safeFetch('https://www.example.com/x', { resolver, fetchImpl: impl }), 'scheme');
  });

  test('limits the number of redirects', async () => {
    const routes: Record<string, Route> = {};
    for (let i = 0; i < 10; i++) {
      routes[`https://www.example.com/${i}`] = { status: 302, headers: { location: `https://www.example.com/${i + 1}` } };
    }
    const { impl, visited } = fakeFetch(routes);
    await expectOutboundError(safeFetch('https://www.example.com/0', { resolver, fetchImpl: impl, maxRedirects: 3 }), 'redirect-limit');
    expect(visited.length).toBe(4);
  });

  test('followRedirects:false returns the 3xx response without following', async () => {
    const { impl, visited } = fakeFetch({
      'https://www.example.com/x': { status: 301, headers: { location: 'https://www.example.com/' } },
      'https://www.example.com/': { body: 'home' },
    });
    const r = await safeFetch('https://www.example.com/x', { resolver, fetchImpl: impl, method: 'HEAD', followRedirects: false });
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('https://www.example.com/');
    expect(visited).toEqual(['https://www.example.com/x']);
  });

  test('rejects a declared Content-Length above the byte cap', async () => {
    const { impl } = fakeFetch({ 'https://www.example.com/big': { body: 'x', headers: { 'content-length': String(50 * 1024 * 1024) } } });
    await expectOutboundError(safeFetch('https://www.example.com/big', { resolver, fetchImpl: impl, maxBytes: 1024 }), 'too-large');
  });

  test('stops reading a streamed body that exceeds the byte cap', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 1000) { controller.close(); return; }
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const { impl } = fakeFetch({ 'https://www.example.com/stream': { body: stream } });
    await expectOutboundError(safeFetch('https://www.example.com/stream', { resolver, fetchImpl: impl, maxBytes: 4096 }), 'too-large');
    expect(pulled).toBeLessThan(20);
  });

  test('times out a hung request', async () => {
    const hang = (async (_u: any, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as typeof fetch;
    await expectOutboundError(safeFetch('https://www.example.com/', { resolver, fetchImpl: hang, timeoutMs: 30 }), 'timeout');
  });

  test('always calls fetch with redirect:manual', async () => {
    const seen: Array<RequestInit['redirect']> = [];
    const impl = (async (_u: any, init?: RequestInit) => {
      seen.push(init?.redirect);
      return new Response('ok');
    }) as typeof fetch;
    await safeFetch('https://www.example.com/', { resolver, fetchImpl: impl });
    expect(seen).toEqual(['manual']);
  });
});

// ---------------------------------------------------------------------------
// curl path
// ---------------------------------------------------------------------------

describe('curl path', () => {
  const resolver = resolverFrom({ 'www.more.com': [PUBLIC_IP], 'evil.example.com': ['127.0.0.1'] });

  test('buildCurlArgs pins the validated address, restricts protocols, never follows redirects', () => {
    const args = buildCurlArgs(new URL('https://www.more.com/gr-el/tickets/x/'), PUBLIC_IP, { maxBytes: 2048, timeoutMs: 15000 });
    expect(args[0]).toBe('curl');
    expect(args).not.toContain('-L');
    expect(args).not.toContain('--location');
    expect(args.join(' ')).toContain(`--resolve www.more.com:443:${PUBLIC_IP}`);
    expect(args.join(' ')).toContain('--proto =http,https');
    expect(args.join(' ')).toContain('--max-redirs 0');
    expect(args.join(' ')).toContain('--max-filesize 2048');
    expect(args.join(' ')).toContain('--max-time 15');
    expect(args[args.length - 1]).toBe('https://www.more.com/gr-el/tickets/x/');
    // "--" separates options from the URL so a URL can never be read as a flag
    expect(args[args.length - 2]).toBe('--');
  });

  test('buildCurlArgs brackets a pinned IPv6 address', () => {
    const args = buildCurlArgs(new URL('http://www.more.com/'), '2606:4700::1111');
    expect(args.join(' ')).toContain('--resolve www.more.com:80:[2606:4700::1111]');
  });

  test('safeCurlText never spawns curl for a private target', async () => {
    let spawned = 0;
    const spawn = () => {
      spawned++;
      return { stdout: new Response('x').body!, exited: Promise.resolve(0), kill() {} };
    };
    await expectOutboundError(safeCurlText('http://evil.example.com/', { resolver, spawn }), 'blocked-address');
    expect(spawned).toBe(0);
  });

  test('safeCurlText stops reading output above the byte cap', async () => {
    let killed = false;
    const spawn = () => ({
      stdout: new Response('y'.repeat(10_000)).body!,
      exited: Promise.resolve(0),
      kill() { killed = true; },
    });
    await expectOutboundError(safeCurlText('https://www.more.com/', { resolver, spawn, maxBytes: 100 }), 'too-large');
    expect(killed).toBe(true);
  });

  test('safeCurlText returns text for a public target', async () => {
    const spawn = () => ({ stdout: new Response('<html>ok</html>').body!, exited: Promise.resolve(0), kill() {} });
    expect(await safeCurlText('https://www.more.com/', { resolver, spawn })).toBe('<html>ok</html>');
  });
});

// ---------------------------------------------------------------------------
// Inside the container (proxy mode, owner decision 2026-10-26, issue O1)
// ---------------------------------------------------------------------------

// The real guard, run in a child process where every node:dns lookup fails
// with ESERVFAIL, as on the sealed network. Every other test in this file
// injects a resolver, which is how the 19-day outage got past them.
const CONTAINER_ENV = { AA_CONTAINER: '1', HTTPS_PROXY: 'http://egress:3128' };
const PROBE = join(import.meta.dir, 'fixtures', 'guard-under-container-dns.ts');

type ProbeCase = { kind: 'assert' | 'hostCheck' | 'curl'; input: string } | { kind: 'fetch'; input: string; routes: Record<string, { status: number; location?: string }> };

function underContainerDns(env: Record<string, string>, cases: ProbeCase[]): { lookups: number; results: any[] } {
  const r = Bun.spawnSync([process.execPath, 'run', PROBE, JSON.stringify(cases)], {
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (r.exitCode !== 0) throw new Error(`probe exited ${r.exitCode}: ${r.stderr.toString()}`);
  return JSON.parse(r.stdout.toString().trim().split('\n').pop()!);
}

describe('proxyMode', () => {
  test('is on only with AA_CONTAINER=1 and an HTTPS proxy', () => {
    expect(proxyMode({ AA_CONTAINER: '1', HTTPS_PROXY: 'http://egress:3128' })).toBe(true);
    expect(proxyMode({ AA_CONTAINER: '1', https_proxy: 'http://egress:3128' })).toBe(true);
    expect(proxyMode({ HTTPS_PROXY: 'http://egress:3128' })).toBe(false);
    expect(proxyMode({ AA_CONTAINER: '1' })).toBe(false);
    expect(proxyMode({ AA_CONTAINER: '1', HTTPS_PROXY: '' })).toBe(false);
    expect(proxyMode({ AA_CONTAINER: 'true', HTTPS_PROXY: 'http://egress:3128' })).toBe(false);
  });
});

describe('inside the container: the guard leaves DNS to the egress proxy', () => {
  test('a public name passes without any DNS lookup', () => {
    const out = underContainerDns(CONTAINER_ENV, [{ kind: 'assert', input: 'https://www.halfnote.gr/' }]);
    expect(out.results[0]).toEqual({ ok: true, href: 'https://www.halfnote.gr/', addresses: [] });
    expect(out.lookups).toBe(0);
  });

  test('every DNS-free refusal still holds, with the same codes', () => {
    const cases: Array<[string, OutboundErrorCode]> = [
      ['http://127.0.0.1/', 'blocked-address'],
      ['http://[::1]/', 'blocked-address'],
      ['http://[::ffff:127.0.0.1]/', 'blocked-address'],
      ['http://169.254.169.254/latest/meta-data/', 'blocked-address'],
      ['http://10.1.2.3:8080/', 'blocked-address'],
      ['http://0x7f000001/', 'blocked-address'],
      ['http://localhost:3000/', 'blocked-address'],
      ['http://foo.internal/', 'blocked-address'],
      ['http://host.docker.internal/', 'blocked-address'],
      ['http://printer.local/', 'blocked-address'],
      ['http://nas.home.arpa/', 'blocked-address'],
      ['http://router.lan/', 'blocked-address'],
      ['http://egress:3128/', 'blocked-address'],
      ['http://user:pw@www.halfnote.gr/', 'credentials'],
      ['file:///etc/passwd', 'scheme'],
      ['not a url', 'invalid-url'],
    ];
    const out = underContainerDns(CONTAINER_ENV, cases.map(([input]) => ({ kind: 'assert', input })));
    expect(out.results.map((r) => r.code)).toEqual(cases.map(([, code]) => code));
    expect(out.lookups).toBe(0);
  });

  test('the browser host check passes a public name and refuses a local one, without DNS', () => {
    const out = underContainerDns(CONTAINER_ENV, [
      { kind: 'hostCheck', input: 'https://www.snfcc.org/el/events' },
      { kind: 'hostCheck', input: 'http://169.254.169.254/' },
      { kind: 'hostCheck', input: 'http://metadata.google.internal/' },
    ]);
    expect(out.results[0].reason).toBeNull();
    expect(out.results[1].reason).toMatch(/non-public|local/);
    expect(out.results[2].reason).toMatch(/local/);
    expect(out.lookups).toBe(0);
  });

  test('curl goes through the proxy: no --resolve pin', () => {
    const out = underContainerDns(CONTAINER_ENV, [{ kind: 'curl', input: 'https://www.more.com/gr-el/' }]);
    expect(out.results[0].ok).toBe(true);
    expect(out.results[0].args).not.toContain('--resolve');
    expect(out.results[0].args.join(' ')).not.toContain('undefined');
    expect(out.results[0].args.slice(-2)).toEqual(['--', 'https://www.more.com/gr-el/']);
    expect(out.lookups).toBe(0);
  });

  test('every redirect hop is still checked: a redirect to the metadata address is not followed', () => {
    const out = underContainerDns(CONTAINER_ENV, [{
      kind: 'fetch',
      input: 'https://www.halfnote.gr/',
      routes: { 'https://www.halfnote.gr/': { status: 302, location: 'http://169.254.169.254/latest/meta-data/' } },
    }]);
    expect(out.results[0].code).toBe('blocked-address');
    expect(out.results[0].visited).toEqual(['https://www.halfnote.gr/']);
  });

  test('a redirect to a local-only name is not followed either', () => {
    const out = underContainerDns(CONTAINER_ENV, [{
      kind: 'fetch',
      input: 'https://www.halfnote.gr/',
      routes: { 'https://www.halfnote.gr/': { status: 301, location: 'http://host.docker.internal:8080/' } },
    }]);
    expect(out.results[0].code).toBe('blocked-address');
    expect(out.results[0].visited).toEqual(['https://www.halfnote.gr/']);
  });
});

describe('outside proxy mode nothing changes', () => {
  for (const [label, env] of [
    ['no AA_CONTAINER', { HTTPS_PROXY: 'http://egress:3128' }],
    ['no proxy variable', { AA_CONTAINER: '1' }],
  ] as const) {
    test(`${label}: the guard resolves the host, and ESERVFAIL is still a dns error`, () => {
      const out = underContainerDns(env, [{ kind: 'assert', input: 'https://www.halfnote.gr/' }]);
      expect(out.results[0].code).toBe('dns');
      expect(out.results[0].message).toContain('ESERVFAIL');
      expect(out.lookups).toBe(1);
    });
  }

  test('an injected resolver is always used, even in proxy mode (tests run inside the container too)', async () => {
    const saved = { AA_CONTAINER: process.env.AA_CONTAINER, HTTPS_PROXY: process.env.HTTPS_PROXY };
    process.env.AA_CONTAINER = '1';
    process.env.HTTPS_PROXY = 'http://egress:3128';
    try {
      let calls = 0;
      const resolver: Resolver = async () => { calls++; return ['10.0.0.5']; };
      await expectOutboundError(assertPublicUrl('https://internal.example.com/', { resolver }), 'blocked-address');
      expect(calls).toBe(1);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  test('buildCurlArgs still pins a checked address, and omits --resolve only when given none', () => {
    expect(buildCurlArgs(new URL('https://www.more.com/'), '1.2.3.4').join(' ')).toContain('--resolve www.more.com:443:1.2.3.4');
    expect(buildCurlArgs(new URL('https://www.more.com/'), '')).not.toContain('--resolve');
  });
});
