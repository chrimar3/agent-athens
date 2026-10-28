/**
 * The Netlify function (netlify/functions/mcp.mts): its route and rate-limit
 * config, and real MCP calls through its default export. fetch is stubbed to
 * serve the SYNTHETIC fixtures, so the test needs no network.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixture = (lang: 'el' | 'en') => readFileSync(join(import.meta.dir, 'fixtures', `events.${lang}.json`), 'utf8');
const realFetch = globalThis.fetch;
const fetched: string[] = [];
let fn: (req: Request) => Promise<Response>;
let config: any;

beforeAll(async () => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    fetched.push(url);
    if (url === 'https://agentathens.com/api/events.json') return new Response(fixture('el'));
    if (url === 'https://agentathens.com/api/en/events.json') return new Response(fixture('en'));
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  const mod = await import('../netlify/functions/mcp.mts');
  fn = mod.default;
  config = mod.config;
});
afterAll(() => { globalThis.fetch = realFetch; });

const post = (body: object) => fn(new Request('https://mcp.agentathens.com/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

describe('Netlify function config', () => {
  test('serves / and /mcp', () => {
    expect(config.path).toEqual(['/', '/mcp']);
  });
  test('limits each client by IP within Netlify\'s documented bounds', () => {
    expect(config.rateLimit.aggregateBy).toEqual(['ip', 'domain']);
    expect(config.rateLimit.windowSize).toBeGreaterThan(0);
    expect(config.rateLimit.windowSize).toBeLessThanOrEqual(180); // Netlify: "Maximum is 180"
    expect(config.rateLimit.windowLimit).toBeGreaterThan(0);
  });
});

describe('Netlify function handler', () => {
  test('initialize answers as the MCP server', async () => {
    const r: any = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json();
    expect(r.result.serverInfo.name).toBe('agent-athens');
  });
  test('a tool call reads both public feeds from agentathens.com and nothing else', async () => {
    const r: any = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_events', arguments: { query: 'Rotting Christ', date_from: '2026-11-01', date_to: '2026-11-30' } } })).json();
    expect(r.result.isError).toBe(false);
    expect(r.result.structuredContent.events[0].name).toBe('Rotting Christ');
    expect([...new Set(fetched)].sort()).toEqual(['https://agentathens.com/api/en/events.json', 'https://agentathens.com/api/events.json']);
  });
  test('GET / describes the server', async () => {
    const r: any = await (await fn(new Request('https://mcp.agentathens.com/'))).json();
    expect(r.mcp_endpoint).toBe('https://mcp.agentathens.com/mcp');
  });
});
