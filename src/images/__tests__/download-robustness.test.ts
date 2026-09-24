/**
 * Round-2 move 9 — image downloader robustness.
 *
 * Evidence (logs/pipeline-2026-09-23.log): every run failed 118/118 — 106
 * clubber.gr rows (a QUARANTINED source whose image URLs answer text/html) and
 * 7 cometogether JPEG/PNG files served as `application/octet-stream`.
 *
 * All network traffic here goes to a local Bun.serve on 127.0.0.1 — no
 * external requests. Fixtures are synthetic byte strings whose magic numbers
 * are asserted before use so a fixture cannot silently stop being an image.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import type { TCPSocketListener } from 'bun';
import { downloadImage, sniffImageType } from '../download-image';
import {
  isQuarantinedRowSource,
  excludeQuarantinedRows,
} from '../quarantine-filter';
import type { QuarantineRegistry } from '../../utils/quarantine';

// ─── Synthetic byte fixtures ─────────────────────────────

const bytes = (...xs: number[]) => Uint8Array.from(xs);
const ascii = (s: string) => Array.from(s, c => c.charCodeAt(0));
const pad = (head: number[], n = 64) => Uint8Array.from([...head, ...new Array(Math.max(0, n - head.length)).fill(0)]);

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...ascii('JFIF')]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = pad(ascii('GIF89a'));
const WEBP = pad([...ascii('RIFF'), 0x24, 0x00, 0x00, 0x00, ...ascii('WEBPVP8 ')]);
// ISO-BMFF: [size=0x1c]['ftyp'][major 'avif'][minor 0]['mif1']['miaf']
const AVIF = pad([0x00, 0x00, 0x00, 0x1c, ...ascii('ftyp'), ...ascii('avif'), 0, 0, 0, 0, ...ascii('mif1'), ...ascii('miaf')]);
// HEIC shares the ftyp box but is not a browser image format — must not pass.
const HEIC = pad([0x00, 0x00, 0x00, 0x18, ...ascii('ftyp'), ...ascii('heic'), 0, 0, 0, 0, ...ascii('mif1')]);
const HTML = new TextEncoder().encode('<!DOCTYPE html><html><head><title>sgcaptcha</title></head><body></body></html>');

describe('fixture preconditions', () => {
  test('each image fixture carries its format signature; HTML does not', () => {
    expect([...JPEG.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect([...PNG.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(String.fromCharCode(...GIF.slice(0, 6))).toBe('GIF89a');
    expect(String.fromCharCode(...WEBP.slice(8, 12))).toBe('WEBP');
    expect(String.fromCharCode(...AVIF.slice(4, 12))).toBe('ftypavif');
    expect(String.fromCharCode(...HTML.slice(0, 9))).toBe('<!DOCTYPE');
  });
});

// ─── Magic-byte sniffing ─────────────────────────────────

describe('sniffImageType', () => {
  test('recognizes JPEG, PNG, GIF, WebP and AVIF', () => {
    expect(sniffImageType(JPEG)).toBe('jpeg');
    expect(sniffImageType(PNG)).toBe('png');
    expect(sniffImageType(GIF)).toBe('gif');
    expect(sniffImageType(WEBP)).toBe('webp');
    expect(sniffImageType(AVIF)).toBe('avif');
  });

  test('rejects HTML, HEIC, RIFF-non-WebP, empty and truncated input', () => {
    expect(sniffImageType(HTML)).toBeNull();
    expect(sniffImageType(HEIC)).toBeNull();
    expect(sniffImageType(pad([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
  });
});

// ─── downloadImage against a local server ────────────────

describe('downloadImage content-type handling', () => {
  // Bun.serve always stamps a content-type on a byte body, so it cannot model
  // a server that sends none. A raw socket writes the response by hand.
  let server: TCPSocketListener<undefined>;
  const routes: Record<string, { body: Uint8Array; type: string | null }> = {
    '/octet.jpg': { body: JPEG, type: 'application/octet-stream' },
    '/octet.png': { body: PNG, type: 'application/octet-stream' },
    '/binary.webp': { body: WEBP, type: 'binary/octet-stream' },
    '/untyped.gif': { body: GIF, type: null },
    '/octet.avif': { body: AVIF, type: 'application/octet-stream' },
    '/octet-html': { body: HTML, type: 'application/octet-stream' },
    '/untyped-html': { body: HTML, type: null },
    '/html': { body: HTML, type: 'text/html; charset=UTF-8' },
    '/html-with-jpeg-bytes': { body: JPEG, type: 'text/html' },
    '/image.jpg': { body: JPEG, type: 'image/jpeg' },
  };

  beforeAll(() => {
    server = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        data(sock, chunk) {
          const path = new TextDecoder().decode(chunk).split(' ')[1] ?? '';
          const route = routes[path];
          const body = route ? route.body : new TextEncoder().encode('nope');
          const lines = [route ? 'HTTP/1.1 200 OK' : 'HTTP/1.1 404 Not Found', `Content-Length: ${body.length}`, 'Connection: close'];
          if (route?.type) lines.push(`Content-Type: ${route.type}`);
          sock.write(lines.join('\r\n') + '\r\n\r\n');
          sock.write(body);
          sock.end();
        },
      },
    });
  });
  afterAll(() => server?.stop(true));

  const url = (p: string) => `http://127.0.0.1:${server.port}${p}`;

  test('precondition: untyped routes send no content-type, typed ones do', async () => {
    expect((await fetch(url('/untyped.gif'))).headers.get('content-type')).toBeNull();
    expect((await fetch(url('/octet.jpg'))).headers.get('content-type')).toBe('application/octet-stream');
  });

  test('octet-stream / missing type is accepted when the bytes are an image', async () => {
    for (const p of ['/octet.jpg', '/octet.png', '/binary.webp', '/untyped.gif', '/octet.avif']) {
      const buf = await downloadImage(url(p), 'cometogether');
      expect(buf).not.toBeNull();
      expect(buf!.length).toBe(routes[p].body.length);
    }
  });

  test('HTML is rejected whatever the declared type', async () => {
    for (const p of ['/octet-html', '/untyped-html', '/html', '/html-with-jpeg-bytes']) {
      expect(await downloadImage(url(p), 'clubber.gr')).toBeNull();
    }
  });

  test('a declared image/* response is still accepted', async () => {
    expect(await downloadImage(url('/image.jpg'), 'athinorama')).not.toBeNull();
  });
});

// ─── Quarantine ──────────────────────────────────────────

describe('quarantined sources are not queued', () => {
  // Registry keys are scraper ids (config/quarantined-sources.json uses
  // "clubber"); DB rows carry the stored source ("clubber.gr").
  const registry: QuarantineRegistry = {
    sources: { clubber: { since: '2026-08-11', reason: 'test' }, ra: { since: '2026-08-11', reason: 'test' } },
  };
  const rows = [
    { id: 'a', image_url: 'https://www.clubber.gr/x.jpg', source: 'clubber.gr' },
    { id: 'b', image_url: 'https://images.cometogether.live/y.jpg', source: 'cometogether' },
    { id: 'c', image_url: 'https://ra.co/z.jpg', source: 'residentadvisor' },
    { id: 'd', image_url: 'https://www.athinorama.gr/w.jpg', source: 'athinorama.gr' },
  ];

  test('precondition: fixture mixes quarantined and live sources', () => {
    expect(rows.some(r => r.source === 'clubber.gr')).toBe(true);
    expect(rows.some(r => r.source === 'cometogether')).toBe(true);
  });

  test('row sources map onto scraper-id registry keys', () => {
    expect(isQuarantinedRowSource('clubber.gr', registry)).toBe(true);
    expect(isQuarantinedRowSource('clubber', registry)).toBe(true);
    expect(isQuarantinedRowSource('residentadvisor', registry)).toBe(true);
    expect(isQuarantinedRowSource('cometogether', registry)).toBe(false);
    expect(isQuarantinedRowSource('athinorama.gr', registry)).toBe(false);
    // Prefix lookalikes are not the same source.
    expect(isQuarantinedRowSource('clubberish.gr', registry)).toBe(false);
  });

  test('excludeQuarantinedRows drops only quarantined rows, order kept', () => {
    expect(excludeQuarantinedRows(rows, registry).map(r => r.id)).toEqual(['b', 'd']);
  });

  test('empty registry (missing/malformed config) quarantines nothing', () => {
    expect(excludeQuarantinedRows(rows, { sources: {} }).map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

// ─── Pipeline guard: a quarantined row never reaches the network ─────────────

describe('processEventImage skips quarantined sources', () => {
  test('no fetch, no DB write, null result', async () => {
    const { Database } = await import('bun:sqlite');
    const { processEventImage } = await import('../image-pipeline');
    const db = new Database(':memory:');
    db.run('CREATE TABLE events (id TEXT PRIMARY KEY, image_local TEXT, updated_at TEXT)');
    db.run("INSERT INTO events (id) VALUES ('q1')");
    const registry: QuarantineRegistry = { sources: { clubber: { since: '2026-08-11', reason: 'test' } } };

    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response('x'); }) as unknown as typeof fetch;
    try {
      const result = await processEventImage('q1', 'https://www.clubber.gr/x.jpg', 'clubber.gr', db, { quarantine: registry });
      expect(result).toBeNull();
      expect(calls).toBe(0);
      // Control: the same call for a live source does reach fetch.
      await processEventImage('q1', 'https://images.cometogether.live/y.jpg', 'cometogether', db, { quarantine: registry });
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
    const row = db.prepare('SELECT image_local FROM events WHERE id = ?').get('q1') as { image_local: string | null };
    expect(row.image_local).toBeNull();
    db.close();
  });
});
