/**
 * Protocol conformance (M1.4): the official MCP SDK client talks to this
 * server over real HTTP, on the synthetic fixture feed.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parseFeed, type FeedSource, type Lang } from '../src/feed';
import { handleHttp } from '../src/mcp';

const snap = Object.fromEntries((['el', 'en'] as Lang[]).map((l) =>
  [l, parseFeed(JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', `events.${l}.json`), 'utf8')), l)]));
const feed: FeedSource = async (l) => snap[l];
const now = () => new Date('2026-11-02T10:00:00Z');

let server: ReturnType<typeof Bun.serve>;
let client: Client;

beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: (req) => handleHttp(req, { feed, now }) });
  client = new Client({ name: 'agent-athens-conformance', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${server.port}/mcp`)));
});
afterAll(async () => {
  await client?.close();
  server?.stop(true);
});

describe('official SDK client', () => {
  test('initialize: server info and instructions', () => {
    expect(client.getServerVersion()?.name).toBe('agent-athens');
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    expect(client.getInstructions()).toContain('url');
  });
  test('lists the four read-only tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['search_events', 'get_event', 'list_venues', 'match_artists']);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });
  test('calls each tool', async () => {
    const s: any = await client.callTool({ name: 'search_events', arguments: { when: 'this_weekend', category: 'music' } });
    expect(s.isError).toBe(false);
    expect(s.structuredContent.events.map((e: any) => e.name)).toEqual(['Rotting Christ', 'Αλκίνοος Ιωαννίδης']);

    const g: any = await client.callTool({ name: 'get_event', arguments: { id: s.structuredContent.events[0].id } });
    expect(g.structuredContent.found).toBe(true);

    const v: any = await client.callTool({ name: 'list_venues', arguments: {} });
    expect(v.structuredContent.venues[0].name).toBe('Gazarte');

    const m: any = await client.callTool({ name: 'match_artists', arguments: { artists: [{ wikidata: 'Q938889' }] } });
    expect(m.structuredContent.matches[0].confidence).toBe('wikidata');
  });
  test('bad arguments come back as a tool error the model can read', async () => {
    const r: any = await client.callTool({ name: 'search_events', arguments: { date_from: 'soon' } });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('YYYY-MM-DD');
  });
});
