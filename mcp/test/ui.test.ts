/**
 * M3.1: MCP Apps wiring (spec ext-apps 2026-01-26, see specs/002-mcp-server/REPORT.md M3.0).
 * Pins the tool _meta, resources/list and resources/read output.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFeed, type FeedSource } from '../src/feed';
import { handleHttp } from '../src/mcp';

const el = parseFeed(JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'events.el.json'), 'utf8')), 'el');
const en = parseFeed(JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'events.en.json'), 'utf8')), 'en');
const feed: FeedSource = async (l) => (l === 'el' ? el : en);
const URI = 'ui://agent-athens/events.html';
const MIME = 'text/html;profile=mcp-app';

let n = 0;
async function rpc(method: string, params?: object) {
  const res = await handleHttp(new Request('https://mcp.test/mcp', {
    method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, ...(params ? { params } : {}) }),
  }), { feed, now: () => new Date('2026-11-02T10:00:00Z') });
  return res.json() as Promise<any>;
}

describe('MCP Apps wiring', () => {
  test('initialize declares the resources capability', async () => {
    const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    expect(r.result.capabilities.resources).toEqual({ listChanged: false });
  });
  test('search_events and match_artists link the UI resource; the others do not', async () => {
    const tools = (await rpc('tools/list')).result.tools;
    const meta = Object.fromEntries(tools.map((t: any) => [t.name, t._meta]));
    expect(meta.search_events).toEqual({ ui: { resourceUri: URI } });
    expect(meta.match_artists).toEqual({ ui: { resourceUri: URI } });
    expect(meta.get_event).toBeUndefined();
    expect(meta.list_venues).toBeUndefined();
  });
  test('resources/list lists exactly the one UI resource', async () => {
    const { resources } = (await rpc('resources/list')).result;
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ uri: URI, mimeType: MIME, name: 'events' });
  });
  test('resources/read returns the HTML with its CSP', async () => {
    const { contents } = (await rpc('resources/read', { uri: URI })).result;
    expect(contents).toHaveLength(1);
    const c = contents[0];
    expect(c.uri).toBe(URI);
    expect(c.mimeType).toBe(MIME);
    expect(c.text).toStartWith('<!doctype html>');
    expect(c._meta).toEqual({ ui: { csp: { resourceDomains: ['https://agentathens.com'] }, prefersBorder: false } });
  });
  test('an unknown resource is a JSON-RPC error', async () => {
    const r = await rpc('resources/read', { uri: 'ui://agent-athens/nope.html' });
    expect(r.error.code).toBe(-32002);
  });
  test('tool results keep their text and structuredContent for hosts without Apps', async () => {
    const r = (await rpc('tools/call', { name: 'search_events', arguments: { when: 'this_weekend' } })).result;
    expect(r.content[0].type).toBe('text');
    expect(JSON.parse(r.content[0].text).events.length).toBeGreaterThan(0);
    expect(r.structuredContent.events.length).toBeGreaterThan(0);
  });
});

describe('the HTML is self-contained', () => {
  test('no external scripts, styles, fonts or imports', async () => {
    const html: string = (await rpc('resources/read', { uri: URI })).result.contents[0].text;
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i);
    expect(html).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket/);
  });
  test('the image allow-list in the page equals the declared CSP resourceDomains', async () => {
    const c = (await rpc('resources/read', { uri: URI })).result.contents[0];
    const m = c.text.match(/const IMAGE_ORIGINS = (\[[^\]]*\]);/);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(c._meta.ui.csp.resourceDomains);
  });
});
