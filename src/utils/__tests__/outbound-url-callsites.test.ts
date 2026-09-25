/**
 * Call sites that fetch URLs taken from scraped data must go through the
 * outbound guard (src/utils/outbound-url.ts).
 *
 * No network: globalThis.fetch is replaced by a recording fake for each test
 * (it follows redirects unless called with redirect:'manual', like real
 * fetch), and host resolution is injected.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'node:zlib';
import { downloadImage, MAX_IMAGE_BYTES } from '../../images/download-image';
import { optimizeImage, MAX_INPUT_PIXELS, MAX_INPUT_BYTES } from '../../images/optimize-image';
import { validateUrl } from '../../ticketing/validator';
import { validateEventURLAsync } from '../url-validator';
import type { Resolver } from '../outbound-url';

const PUBLIC_IP = '93.184.216.34';
const resolver: Resolver = async (h) => {
  const map: Record<string, string[]> = {
    'img.example.com': [PUBLIC_IP],
    'www.more.com': [PUBLIC_IP],
    'lan.example.com': ['192.168.1.20'],
  };
  if (!map[h]) throw new Error(`ENOTFOUND ${h}`);
  return map[h];
};

type Route = { status?: number; headers?: Record<string, string>; body?: string | Uint8Array };
let visited: string[] = [];
let routes: Record<string, Route> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  visited = [];
  routes = {};
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
      return new Response(init?.method === 'HEAD' ? null : (r.body as any) ?? '', { status, headers: r.headers });
    }
    throw new Error('loop');
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('downloadImage', () => {
  test('does not contact a loopback image URL', async () => {
    routes['http://127.0.0.1:8080/x.jpg'] = { body: 'x', headers: { 'content-type': 'image/jpeg' } };
    expect(await downloadImage('http://127.0.0.1:8080/x.jpg', 'athinorama', { resolver })).toBeNull();
    expect(visited).toEqual([]);
  });

  test('does not follow a redirect to the metadata address', async () => {
    routes['https://img.example.com/a.jpg'] = { status: 302, headers: { location: 'http://169.254.169.254/latest/' } };
    routes['http://169.254.169.254/latest/'] = { body: 'SECRET', headers: { 'content-type': 'image/jpeg' } };
    expect(await downloadImage('https://img.example.com/a.jpg', 'athinorama', { resolver })).toBeNull();
    expect(visited).toEqual(['https://img.example.com/a.jpg']);
  });

  test('does not contact a host that resolves to a LAN address', async () => {
    routes['http://lan.example.com/a.jpg'] = { body: 'x', headers: { 'content-type': 'image/jpeg' } };
    expect(await downloadImage('http://lan.example.com/a.jpg', 'athinorama', { resolver })).toBeNull();
    expect(visited).toEqual([]);
  });

  test('rejects an image above the byte cap', async () => {
    routes['https://img.example.com/huge.jpg'] = {
      body: 'x',
      headers: { 'content-type': 'image/jpeg', 'content-length': String(MAX_IMAGE_BYTES + 1) },
    };
    expect(await downloadImage('https://img.example.com/huge.jpg', 'athinorama', { resolver })).toBeNull();
  });

  test('downloads a public image', async () => {
    routes['https://img.example.com/ok.jpg'] = { body: 'JPEGDATA', headers: { 'content-type': 'image/jpeg' } };
    const buf = await downloadImage('https://img.example.com/ok.jpg', 'athinorama', { resolver });
    expect(buf?.toString()).toBe('JPEGDATA');
  });
});

describe('validateUrl (ticket URLs)', () => {
  test('does not contact a private ticket URL', async () => {
    routes['http://10.0.0.8/tickets/1'] = { body: '' };
    const r = await validateUrl('http://10.0.0.8/tickets/1', { resolver });
    expect(r.outcome).toBe('expired');
    expect(visited).toEqual([]);
  });

  test('does not follow a redirect to loopback', async () => {
    routes['https://www.more.com/gr-el/tickets/x/'] = { status: 301, headers: { location: 'http://127.0.0.1:9000/admin' } };
    routes['http://127.0.0.1:9000/admin'] = { body: '' };
    const r = await validateUrl('https://www.more.com/gr-el/tickets/x/', { resolver });
    expect(r.outcome).toBe('expired');
    expect(visited).toEqual(['https://www.more.com/gr-el/tickets/x/']);
  });

  test('a public URL with a public redirect still validates', async () => {
    routes['https://www.more.com/gr-el/tickets/x/'] = { status: 301, headers: { location: 'https://www.more.com/gr-el/tickets/music/x/' } };
    routes['https://www.more.com/gr-el/tickets/music/x/'] = { body: '' };
    const r = await validateUrl('https://www.more.com/gr-el/tickets/x/', { resolver });
    expect(r.outcome).toBe('valid');
    expect(r.finalUrl).toBe('https://www.more.com/gr-el/tickets/music/x/');
  });
});

describe('validateEventURLAsync', () => {
  test('does not contact a loopback event URL', async () => {
    routes['http://127.0.0.1/'] = { body: '' };
    const r = await validateEventURLAsync('http://127.0.0.1/', { resolver });
    expect(r.valid).toBe(false);
    expect(visited).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sharp decode limits
// ---------------------------------------------------------------------------

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A tiny PNG whose header claims width x height (decompression-bomb shape). */
function pngClaiming(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(1024))),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

describe('optimizeImage decode limits', () => {
  const outDir = join(import.meta.dir, '../../../data/images');

  test('pixel limit is set well below sharp\'s default', () => {
    expect(MAX_INPUT_PIXELS).toBeLessThanOrEqual(100_000_000);
  });

  test('rejects an image whose header exceeds the pixel limit, before decoding', async () => {
    const side = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 1;
    let err: Error | null = null;
    try {
      await optimizeImage(pngClaiming(side, side), 'test-pixel-bomb');
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message ?? '').toMatch(/pixel limit/i);
    expect(existsSync(join(outDir, 'test-pixel-bomb.webp'))).toBe(false);
  });

  test('rejects an input buffer above the byte cap without calling sharp', async () => {
    const big = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let err: Error | null = null;
    try {
      await optimizeImage(big, 'test-byte-cap');
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message ?? '').toMatch(/byte/i);
    if (existsSync(join(outDir, 'test-byte-cap.webp'))) rmSync(join(outDir, 'test-byte-cap.webp'));
  });
});

// ---------------------------------------------------------------------------
// Detective control: no raw fetch()/curl on scraped URLs in guarded files
// ---------------------------------------------------------------------------

describe('guarded call sites use the outbound guard', () => {
  const ROOT = join(import.meta.dir, '../../..');
  const GUARDED = [
    'src/images/download-image.ts',
    'src/ticketing/validator.ts',
    'src/utils/url-validator.ts',
    'scripts/enrich-images.ts',
    'scripts/enrich-time.ts',
    'scripts/validate-ticket-urls.ts',
    'scripts/extract-ticket-urls.ts',
    'scripts/fix-athinorama-images.ts',
  ];
  for (const rel of GUARDED) {
    test(`${rel} has no direct fetch()/curl spawn`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf-8')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(src).not.toMatch(/(?<![\w.])fetch\(/);
      expect(src).not.toMatch(/['"]curl['"]/);
      expect(src).toContain('outbound-url');
    });
  }
});
