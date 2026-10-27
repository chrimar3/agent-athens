/**
 * Abuse limits (M1.5): 64 KB bodies, 20-message batches, 200 artists.
 * Each limit is pinned on both sides of the boundary.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFeed, type FeedSource } from '../src/feed';
import { handleHttp } from '../src/mcp';

const en = parseFeed(JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'events.en.json'), 'utf8')), 'en');
const el = parseFeed(JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'events.el.json'), 'utf8')), 'el');
const feed: FeedSource = async (l) => (l === 'en' ? en : el);
const now = () => new Date('2026-11-02T10:00:00Z');
const LIMIT = 64 * 1024;

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  handleHttp(new Request('https://mcp.test/mcp', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } }), { feed, now });

/** A valid tools/call whose JSON is exactly `bytes` long in UTF-8, padded with `pad`. */
function callOfSize(bytes: number, pad: string): string {
  const shell = (q: string) => JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_events', arguments: { query: q } } });
  const room = bytes - Buffer.byteLength(shell(''));
  const unit = Buffer.byteLength(pad);
  const s = shell(pad.repeat(Math.floor(room / unit)) + 'x'.repeat(room % unit));
  expect(Buffer.byteLength(s)).toBe(bytes); // precondition: the size is exact
  return s;
}

/** Same bytes, sent as a stream so no content-length header is set. */
function streamed(s: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(s);
  return new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 8192) c.enqueue(bytes.slice(i, i + 8192)); c.close(); } });
}

describe('body size', () => {
  test('a body of exactly 64 KB is accepted', async () => {
    expect((await post(callOfSize(LIMIT, 'a'))).status).toBe(200);
  });
  test('a body over 64 KB with a content-length is 413', async () => {
    expect((await post(callOfSize(LIMIT + 1, 'a'))).status).toBe(413);
  });
  test('a streamed body over 64 KB (no content-length) is 413', async () => {
    const res = await post(streamed(callOfSize(LIMIT + 1, 'a')));
    expect(res.status).toBe(413);
  });
  test('a streamed body over 64 KB in bytes but not in characters is 413', async () => {
    // 2-byte Greek letters: about 40,000 characters, about 80,000 bytes.
    const s = callOfSize(80_000, 'α');
    expect(s.length).toBeLessThan(LIMIT); // precondition: under the limit if counted in characters
    const res = await post(streamed(s));
    expect(res.status).toBe(413);
  });
});

describe('batch size', () => {
  const batch = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'ping' })));
  test('a batch of 20 is answered', async () => {
    const res = await post(batch(20));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(20);
  });
  test('a batch of 21 is 400', async () => {
    expect((await post(batch(21))).status).toBe(400);
  });
});

describe('artist list size', () => {
  const call = async (n: number) => {
    const artists = Array.from({ length: n }, (_, i) => `Artist ${i}`);
    const res = await post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'match_artists', arguments: { artists } } }));
    return (await res.json()).result;
  };
  test('200 artists are matched', async () => {
    expect((await call(200)).isError).toBe(false);
  });
  test('201 artists are a tool error', async () => {
    const r = await call(201);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('at most 200');
  });
});
