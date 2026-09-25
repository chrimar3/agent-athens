/**
 * Outbound URL guard.
 *
 * Use for every request whose URL (or redirect target) came from scraped
 * pages, newsletters or the events DB: image downloads, detail-page and
 * ticket-URL checks. It
 *   - allows only http: and https: without embedded credentials,
 *   - resolves the host and rejects loopback, private, link-local, CGNAT,
 *     multicast, reserved and cloud-metadata addresses (IPv4 and IPv6,
 *     including IPv4-mapped / NAT64 / 6to4 forms),
 *   - follows redirects manually, re-validating every hop, up to a limit,
 *   - caps response bytes (declared Content-Length and streamed body),
 *   - enforces one timeout across all hops and the body read.
 *
 * Residual risk: fetch() resolves the host again after the check, so a DNS
 * answer that changes between the two lookups is not caught on the fetch()
 * path. The curl path pins the checked address with --resolve.
 */

import { isIP, isIPv4, isIPv6 } from 'node:net';
import { lookup } from 'node:dns/promises';

export type Resolver = (hostname: string) => Promise<string[]>;

export type OutboundErrorCode =
  | 'invalid-url'
  | 'scheme'
  | 'credentials'
  | 'blocked-address'
  | 'dns'
  | 'redirect-limit'
  | 'redirect-invalid'
  | 'too-large'
  | 'timeout'
  | 'network';

export class OutboundUrlError extends Error {
  constructor(public readonly code: OutboundErrorCode, message: string) {
    super(message);
    this.name = 'OutboundUrlError';
  }
}

export const OUTBOUND_DEFAULTS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 15_000,
  maxRedirects: 5,
});

export interface OutboundOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  /** Response body byte cap. Default 5 MiB. */
  maxBytes?: number;
  /** Total time budget across DNS, all redirect hops and the body read. Default 15 s. */
  timeoutMs?: number;
  /** Maximum redirects followed. Default 5. */
  maxRedirects?: number;
  /** When false, a 3xx response is returned as-is instead of followed. Default true. */
  followRedirects?: boolean;
  /** Injected for tests; defaults to the system resolver. */
  resolver?: Resolver;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface SafeResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  /** Final URL after redirects. */
  url: string;
  redirected: boolean;
  body: Uint8Array;
  text(): string;
}

// ---------------------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------------------

/** [network, prefixLength] */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],        // "this network"
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // CGNAT (also some cloud metadata endpoints)
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local (cloud metadata 169.254.169.254)
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // documentation
  ['192.88.99.0', 24],   // 6to4 relay anycast
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // documentation
  ['203.0.113.0', 24],   // documentation
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved + broadcast
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => ((acc << 8) | Number(o)) >>> 0, 0);
}

const BLOCKED_V4_INT = BLOCKED_V4.map(([net, len]) => {
  const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
  return { net: (v4ToInt(net) & mask) >>> 0, mask };
});

function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return BLOCKED_V4_INT.some(({ net, mask }) => ((n & mask) >>> 0) === net);
}

/** Expand an IPv6 literal to 8 16-bit groups, or null if malformed. */
function parseV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isIPv4(tail)) return null;
    const o = tail.split('.').map(Number);
    s = s.slice(0, lastColon + 1) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = [...head, ...rest];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  const fill = 8 - groups.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  return [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...rest].map((g) => parseInt(g, 16));
}

function v4FromGroups(hi: number, lo: number): string {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
}

function isBlockedV6(ip: string): boolean {
  const g = parseV6(ip);
  if (!g) return true;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);

  // IPv4-mapped ::ffff:a.b.c.d and NAT64 64:ff9b::a.b.c.d carry an IPv4 target.
  if (zeros(0, 5) && g[5] === 0xffff) return isBlockedV4(v4FromGroups(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isBlockedV4(v4FromGroups(g[6], g[7]));
  // 6to4 2002:aabb:ccdd::/48 embeds an IPv4 address.
  if (g[0] === 0x2002) return isBlockedV4(v4FromGroups(g[1], g[2]));

  // Only global unicast 2000::/3 is public. This excludes ::, ::1, IPv4-compatible,
  // 100::/64 discard, fc00::/7 unique-local (incl. fd00:ec2::254), fe80::/10
  // link-local, fec0::/10 site-local and ff00::/8 multicast.
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && g[1] === 0x0000) return true;            // Teredo 2001::/32
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;            // documentation 2001:db8::/32
  if (g[0] === 0x2001 && (g[1] & 0xfff0) === 0x0010) return true; // ORCHID 2001:10::/28
  return false;
}

/** True when `ip` must not be contacted. Non-IP input is treated as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '');
  const plain = bare.split('%')[0];
  if (isIPv4(plain)) return isBlockedV4(plain);
  if (isIPv6(plain)) return isBlockedV6(bare);
  return true;
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

const systemResolver: Resolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/**
 * Parse and validate a URL, resolve its host, and reject it unless every
 * resolved address is public. Returns the parsed URL and the checked addresses.
 */
export async function assertPublicUrl(
  input: string | URL,
  opts: { resolver?: Resolver } = {},
): Promise<{ url: URL; addresses: string[] }> {
  let url: URL;
  try {
    url = new URL(String(input));
  } catch {
    throw new OutboundUrlError('invalid-url', 'not a valid absolute URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundUrlError('scheme', `scheme ${url.protocol} not allowed (http/https only)`);
  }
  if (url.username || url.password) {
    throw new OutboundUrlError('credentials', 'URLs with embedded credentials are not allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host) throw new OutboundUrlError('invalid-url', 'URL has no host');

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    if (host === 'localhost' || host.endsWith('.localhost')) {
      throw new OutboundUrlError('blocked-address', `host ${host} is local`);
    }
    try {
      addresses = await (opts.resolver ?? systemResolver)(host);
    } catch (e) {
      throw new OutboundUrlError('dns', `could not resolve ${host}: ${(e as Error).message}`);
    }
    if (addresses.length === 0) throw new OutboundUrlError('dns', `no addresses for ${host}`);
  }
  const bad = addresses.find((a) => isBlockedAddress(a));
  if (bad !== undefined) {
    throw new OutboundUrlError('blocked-address', `host ${host} resolves to a non-public address`);
  }
  return { url, addresses };
}

// ---------------------------------------------------------------------------
// fetch path
// ---------------------------------------------------------------------------

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new OutboundUrlError('timeout', 'request timed out'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new OutboundUrlError('timeout', 'request timed out'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

async function readCapped(res: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await abortable(reader.read(), signal);
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new OutboundUrlError('too-large', `response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

/**
 * Fetch a URL from untrusted data with SSRF, redirect, size and time limits.
 * Throws OutboundUrlError; never follows a redirect it has not validated.
 */
export async function safeFetch(input: string | URL, opts: OutboundOptions = {}): Promise<SafeResponse> {
  const method = opts.method ?? 'GET';
  const maxBytes = opts.maxBytes ?? OUTBOUND_DEFAULTS.maxBytes;
  const timeoutMs = opts.timeoutMs ?? OUTBOUND_DEFAULTS.timeoutMs;
  const maxRedirects = opts.maxRedirects ?? OUTBOUND_DEFAULTS.maxRedirects;
  const follow = opts.followRedirects ?? true;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;

  let current = String(input);
  let redirects = 0;
  try {
    for (;;) {
      const { url } = await abortable(assertPublicUrl(current, { resolver: opts.resolver }), signal);
      let res: Response;
      try {
        res = await abortable(
          fetchImpl(url.href, { method, headers: opts.headers, redirect: 'manual', signal }),
          signal,
        );
      } catch (e) {
        if (e instanceof OutboundUrlError) throw e;
        if (signal.aborted || (e as Error)?.name === 'AbortError') {
          throw new OutboundUrlError('timeout', 'request timed out');
        }
        throw new OutboundUrlError('network', (e as Error)?.message ?? String(e));
      }

      const location = res.headers.get('location');
      if (follow && REDIRECT_STATUSES.has(res.status) && location) {
        await res.body?.cancel().catch(() => {});
        if (redirects >= maxRedirects) {
          throw new OutboundUrlError('redirect-limit', `more than ${maxRedirects} redirects`);
        }
        redirects++;
        try {
          current = new URL(location, url).href;
        } catch {
          throw new OutboundUrlError('redirect-invalid', 'redirect Location is not a valid URL');
        }
        continue;
      }

      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await res.body?.cancel().catch(() => {});
        throw new OutboundUrlError('too-large', `declared Content-Length ${declared} exceeds ${maxBytes} bytes`);
      }

      const body = method === 'HEAD' ? new Uint8Array(0) : await readCapped(res, maxBytes, signal);
      return {
        status: res.status,
        ok: res.ok,
        headers: res.headers,
        url: url.href,
        redirected: redirects > 0,
        body,
        text: () => new TextDecoder().decode(body),
      };
    }
  } catch (e) {
    if (e instanceof OutboundUrlError) throw e;
    if (signal.aborted) throw new OutboundUrlError('timeout', 'request timed out');
    throw new OutboundUrlError('network', (e as Error)?.message ?? String(e));
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// curl path (for hosts where Bun's fetch has HTTP/2 problems)
// ---------------------------------------------------------------------------

export interface CurlOptions {
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
  /** Write the response status line and headers before the body (curl -D -). Default false. */
  dumpHeaders?: boolean;
}

/**
 * curl argv that connects only to `pinnedAddress` (already validated), speaks
 * only http/https, does not follow redirects, and bounds size and time.
 */
export function buildCurlArgs(url: URL, pinnedAddress: string, opts: CurlOptions = {}): string[] {
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const pinned = isIPv6(pinnedAddress) ? `[${pinnedAddress}]` : pinnedAddress;
  const maxBytes = opts.maxBytes ?? OUTBOUND_DEFAULTS.maxBytes;
  const seconds = Math.max(1, Math.ceil((opts.timeoutMs ?? OUTBOUND_DEFAULTS.timeoutMs) / 1000));
  const args = [
    'curl', '-s', '--http1.1',
    '--proto', '=http,https',
    '--max-redirs', '0',
    '--max-filesize', String(maxBytes),
    '--max-time', String(seconds),
  ];
  if (!isIP(host)) args.push('--resolve', `${host}:${port}:${pinned}`);
  if (opts.dumpHeaders) args.push('-D', '-');
  for (const [k, v] of Object.entries(opts.headers ?? {})) args.push('-H', `${k}: ${v}`);
  args.push('--', url.href);
  return args;
}

export interface SpawnedProcess {
  stdout: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill(): void;
}

/**
 * Fetch a page body with curl after validating the URL. Throws
 * OutboundUrlError on a blocked target, oversize output, timeout or non-zero
 * curl exit.
 */
export async function safeCurlText(
  input: string,
  opts: CurlOptions & { resolver?: Resolver; spawn?: (args: string[]) => SpawnedProcess } = {},
): Promise<string> {
  const { url, addresses } = await assertPublicUrl(input, { resolver: opts.resolver });
  const maxBytes = opts.maxBytes ?? OUTBOUND_DEFAULTS.maxBytes;
  const timeoutMs = opts.timeoutMs ?? OUTBOUND_DEFAULTS.timeoutMs;
  const spawn = opts.spawn ?? ((args: string[]) => Bun.spawn(args, { stdout: 'pipe', stderr: 'ignore' }) as unknown as SpawnedProcess);
  const proc = spawn(buildCurlArgs(url, addresses[0], { ...opts, maxBytes, timeoutMs }));

  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); proc.kill(); }, timeoutMs + 1000);
  try {
    let body: Uint8Array;
    try {
      body = await readCapped(new Response(proc.stdout), maxBytes, controller.signal);
    } catch (e) {
      proc.kill();
      throw e;
    }
    const code = await abortable(proc.exited, controller.signal);
    if (code !== 0) throw new OutboundUrlError('network', `curl exited with code ${code}`);
    return new TextDecoder().decode(body);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Scraper helpers: refused targets, first-party hrefs, curl redirects and
// headless-browser request interception.
// ---------------------------------------------------------------------------

const REFUSED_CODES: ReadonlySet<OutboundErrorCode> = new Set(['invalid-url', 'scheme', 'credentials', 'blocked-address', 'redirect-invalid']);

/** True when the guard refused the target itself: retrying or falling back to curl cannot help. */
export function isRefusedTarget(e: unknown): boolean {
  return e instanceof OutboundUrlError && REFUSED_CODES.has(e.code);
}

/**
 * Resolve an href scraped from a first-party page against that site's fixed
 * origin (e.g. 'https://ra.co'). Returns the absolute URL only when it stays
 * on that origin; null otherwise. Guards against "@evil.example/x",
 * "//evil.example/x", "javascript:..." and absolute off-site links, which
 * plain string concatenation (`${origin}${href}`) turns into another host.
 */
export function sameOriginUrl(href: string | null | undefined, origin: string): string | null {
  if (typeof href !== 'string' || href.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(href.trim(), origin + '/');
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin || url.username || url.password) return null;
  return url.href;
}

/** Host names that never mean a public web site. */
const LOCAL_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.lan', '.home.arpa', '.intranet', '.corp'];
/** Schemes that stay inside the browser process (no network request leaves it). */
const IN_PROCESS_SCHEMES = new Set(['data:', 'blob:', 'about:']);

/**
 * DNS-free check for one browser request URL. Returns why it is refused, or
 * null. http(s) hosts must not be an IP literal in a blocked range,
 * "localhost", a single-label name or a local-only suffix. data:, blob: and
 * about: are allowed (they never leave the browser); every other scheme
 * (file:, ftp:, chrome:, ws:, wss:, ...) is refused. WebSockets never reach
 * request interception at all; guardPageRequests switches them off instead.
 */
export function quickBlockReason(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return 'not a valid absolute URL';
  }
  if (IN_PROCESS_SCHEMES.has(url.protocol)) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return `scheme ${url.protocol} not allowed`;
  if (url.username || url.password) return 'embedded credentials';
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host) return 'no host';
  if (isIP(host)) return isBlockedAddress(host) ? `address ${host} is not public` : null;
  if (host === 'localhost' || !host.includes('.') || LOCAL_SUFFIXES.some(s => host.endsWith(s))) {
    return `host ${host} is local`;
  }
  return null;
}

/** How long a host verdict is reused by one page's guard. */
export const HOST_CHECK_TTL_MS = 60_000;
/** A host lookup that takes longer than this is treated as a refusal. */
export const HOST_CHECK_TIMEOUT_MS = 5_000;

/** Returns why a request URL's host is refused (null = every address public). */
export type HostChecker = (target: string) => Promise<string | null>;

/**
 * DNS check for browser requests, with a per-host cache (one checker per
 * page) and a time limit. Only http(s) URLs are resolved: callers run
 * quickBlockReason first. A lookup error, an empty answer or a timeout is a
 * refusal (fail closed): a resource whose host we cannot classify is not
 * loaded.
 */
export function createHostChecker(
  opts: { resolver?: Resolver; timeoutMs?: number; ttlMs?: number; now?: () => number } = {},
): HostChecker {
  const timeoutMs = opts.timeoutMs ?? HOST_CHECK_TIMEOUT_MS;
  const ttlMs = opts.ttlMs ?? HOST_CHECK_TTL_MS;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; verdict: Promise<string | null> }>();
  return (target: string) => {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return Promise.resolve('not a valid absolute URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.resolve(null);
    const host = url.hostname.toLowerCase();
    const hit = cache.get(host);
    if (hit && now() - hit.at < ttlMs) return hit.verdict;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve(`DNS lookup for ${host} timed out after ${timeoutMs} ms`), timeoutMs);
    });
    const lookup = assertPublicUrl(`${url.protocol}//${url.host}/`, { resolver: opts.resolver }).then(
      () => null,
      (e) => (e as Error).message,
    );
    const verdict = Promise.race([lookup, timeout]).finally(() => clearTimeout(timer));
    cache.set(host, { at: now(), verdict });
    return verdict;
  };
}

/**
 * Runs in every document (all frames) and every worker of a guarded page
 * before any page script. Request interception never sees WebSocket,
 * WebTransport or WebRTC traffic (Chrome's Fetch domain does not carry it),
 * and none of the scrapers needs them, so the constructors are removed:
 * `new WebSocket(...)` throws, from any frame or worker. Shared and service
 * workers run outside the page's reach (their targets are not attached to the
 * page), so they cannot be created. window.open is disabled: a popup is a new
 * page that has no request interception.
 */
export const BROWSER_KILL_SWITCH_SCRIPT = `(() => {
  const g = globalThis;
  const off = (o, k, v) => { try { Object.defineProperty(o, k, { value: v, writable: false, configurable: false, enumerable: false }); } catch (e) {} };
  for (const k of ['WebSocket', 'WebSocketStream', 'WebTransport', 'SharedWorker', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) off(g, k, undefined);
  if (typeof g.open === 'function') off(g, 'open', function open() { return null; });
  try {
    const p = g.ServiceWorkerContainer && g.ServiceWorkerContainer.prototype;
    if (p) off(p, 'register', function register() { return Promise.reject(new DOMException('service workers are blocked by the scraper guard', 'SecurityError')); });
  } catch (e) {}
})();`;

/** The slice of a Puppeteer request the interceptor uses. */
export interface InterceptedRequest {
  url(): string;
  isNavigationRequest(): boolean;
  abort(errorCode?: string): Promise<void>;
  continue(): Promise<void>;
}

/** The slice of a Puppeteer CDP session the guard uses. */
export interface GuardCdpSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, handler: (event: any) => void): unknown;
  connection(): { session(sessionId: string): GuardCdpSession | null } | undefined;
}

/** The slice of a Puppeteer page the interceptor uses. */
export interface InterceptablePage {
  setRequestInterception(value: boolean): Promise<void>;
  on(event: 'request', handler: (request: InterceptedRequest) => void): unknown;
  evaluateOnNewDocument(source: string): Promise<unknown>;
  createCDPSession(): Promise<unknown>;
}

const AUTO_ATTACH = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true } as const;

/**
 * Attach to every worker and out-of-process iframe the page (or one of its
 * workers/frames) starts, while Chrome holds it before its first script, and
 * install the kill switch there too. Chrome starts a target that several
 * clients wait for only after all of them resumed it, so the switch is in
 * place before the worker's own code runs.
 */
async function guardChildTargets(session: GuardCdpSession, log: (m: string) => void): Promise<void> {
  const onAttached = async (ev: { sessionId: string; targetInfo: { type: string; url?: string } }) => {
    const child = session.connection()?.session(ev.sessionId);
    if (!child) {
      log(`   🛡️ could not attach to ${ev.targetInfo.type} ${String(ev.targetInfo.url ?? '').slice(0, 80)}; its WebSockets are not disabled`);
      return;
    }
    child.on('Target.attachedToTarget', onAttached);
    await child.send('Target.setAutoAttach', { ...AUTO_ATTACH }).catch(() => {});
    if (ev.targetInfo.type === 'iframe' || ev.targetInfo.type === 'page') {
      await child.send('Page.addScriptToEvaluateOnNewDocument', { source: BROWSER_KILL_SWITCH_SCRIPT, runImmediately: true }).catch(() => {});
    } else {
      await child.send('Runtime.evaluate', { expression: BROWSER_KILL_SWITCH_SCRIPT }).catch(() => {});
    }
    await child.send('Runtime.runIfWaitingForDebugger').catch(() => {});
  };
  session.on('Target.attachedToTarget', (ev) => { void onAttached(ev); });
  await session.send('Target.setAutoAttach', { ...AUTO_ATTACH });
}

/**
 * Guard a headless-browser page so neither the scraper's navigations nor the
 * page's own scripts reach local services. Call it right after newPage(),
 * before the first goto().
 *   - Every intercepted request (documents, scripts, images, XHR/fetch,
 *     EventSource, beacons, worker scripts …) gets quickBlockReason (scheme +
 *     host literal) and then a DNS check of its host (createHostChecker: one
 *     cache per page, 60 s per host, 5 s limit); a host that resolves to a
 *     loopback, private, link-local, CGNAT, ULA or other non-public address,
 *     or that cannot be resolved in time, is aborted.
 *   - WebSocket, WebTransport and WebRTC never pass through request
 *     interception, so they are switched off in every frame and worker
 *     (BROWSER_KILL_SWITCH_SCRIPT); window.open is disabled.
 *
 * Residual risk: Chrome resolves the host again itself, so a DNS answer that
 * changes between the two lookups (rebinding) is not caught.
 */
export async function guardPageRequests(
  page: InterceptablePage,
  opts: { resolver?: Resolver; log?: (message: string) => void; hostTimeoutMs?: number } = {},
): Promise<void> {
  const log = opts.log ?? ((m: string) => console.warn(m));
  const checkHost = createHostChecker({ resolver: opts.resolver, timeoutMs: opts.hostTimeoutMs });
  await page.evaluateOnNewDocument(BROWSER_KILL_SWITCH_SCRIPT);
  await guardChildTargets((await page.createCDPSession()) as GuardCdpSession, log);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    void (async () => {
      const target = request.url();
      let reason = quickBlockReason(target);
      if (!reason && /^https?:/i.test(target)) reason = await checkHost(target);
      if (reason) {
        log(`   🛡️ blocked browser request to ${target.slice(0, 100)} (${reason})`);
        await request.abort('blockedbyclient').catch(() => {});
      } else {
        await request.continue().catch(() => {});
      }
    })();
  });
}

/**
 * Like safeCurlText, but follows up to `maxRedirects` redirects, validating
 * every hop with assertPublicUrl and pinning each hop's address (curl itself
 * never follows a redirect). Use where a scraper used `curl -L`.
 */
export async function safeCurlTextFollow(
  input: string,
  opts: CurlOptions & { maxRedirects?: number; resolver?: Resolver; spawn?: (args: string[]) => SpawnedProcess } = {},
): Promise<string> {
  const maxRedirects = opts.maxRedirects ?? OUTBOUND_DEFAULTS.maxRedirects;
  let current = input;
  for (let hop = 0; ; hop++) {
    const raw = await safeCurlText(current, { ...opts, dumpHeaders: true });
    const split = raw.search(/\r?\n\r?\n/);
    const head = split >= 0 ? raw.slice(0, split) : raw;
    const body = split >= 0 ? raw.slice(split).replace(/^\r?\n\r?\n/, '') : '';
    const status = Number(/^HTTP\/[\d.]+\s+(\d{3})/.exec(head)?.[1] ?? 0);
    const location = /^location:\s*(.+)$/im.exec(head)?.[1]?.trim();
    if (!REDIRECT_STATUSES.has(status) || !location) return body;
    if (hop >= maxRedirects) throw new OutboundUrlError('redirect-limit', `more than ${maxRedirects} redirects`);
    try {
      current = new URL(location, current).href;
    } catch {
      throw new OutboundUrlError('redirect-invalid', 'redirect Location is not a valid URL');
    }
  }
}

/**
 * safeFetch returning a standard Response (status, headers, buffered body),
 * for call sites written against fetch(): `.text()`, `.json()` and
 * `.arrayBuffer()` keep working. Same guard, caps and redirect re-checks.
 */
export async function safeFetchResponse(input: string | URL, opts: OutboundOptions = {}): Promise<Response> {
  const res = await safeFetch(input, opts);
  return new Response(opts.method === 'HEAD' ? null : res.body, { status: res.status, headers: res.headers });
}
