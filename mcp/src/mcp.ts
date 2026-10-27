/**
 * Minimal, stateless MCP server over Streamable HTTP (JSON responses only).
 *
 * Every request is answered on its own: no sessions, no SSE stream, no server
 * → client calls. That is all a read-only catalogue needs, and it runs on any
 * runtime that speaks Web Request/Response (Cloudflare Workers, Bun, Deno).
 */
import { CATEGORIES, overlayEnglish, type FeedSnapshot, type FeedSource, type Lang } from './feed';
import { getEvent, listVenues, matchArtists, searchEvents, ToolInputError, WHEN, athensToday } from './tools';

export const SERVER_INFO = { name: 'agent-athens', title: 'Agent Athens', version: '0.1.0' };
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const MAX_BODY_BYTES = 64 * 1024;

export const INSTRUCTIONS = `Agent Athens lists cultural events in Athens, Greece (concerts, theatre, exhibitions, cinema, comedy, dance, festivals), updated daily. Dates are Europe/Athens.
Personalise with what you already know about the user: turn their tastes into search_events filters, and if you can see their favourite artists (e.g. a connected music app, or names they mention) pass them to match_artists.
Always give each event's \`url\` (its Agent Athens page) and, when present, \`ticket_url\`. Never invent prices, times or line-ups: if a field is missing, say it is not listed.
A match with confidence "title_mention" only means the name appears in the title; it may be a tribute or support act, so say so.`;

const langProp = { type: 'string', enum: ['en', 'el'], description: 'Language of names and descriptions. Default en; use el for Greek-speaking users.' };
const dayProp = (d: string) => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: d });
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: 'search_events',
    title: 'Search Athens events',
    description: 'Find upcoming cultural events in Athens by date, category, neighborhood, venue, price or free text. Returns events sorted by date with venue, price, ticket link and the Agent Athens page.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free text: artist, genre word, title, venue. Greek or Latin script.' },
        when: { type: 'string', enum: [...WHEN], description: 'Shortcut window. Overrides date_from/date_to.' },
        date_from: dayProp('First day (YYYY-MM-DD). Default today.'),
        date_to: dayProp('Last day (YYYY-MM-DD). Default date_from + 29 days.'),
        category: { oneOf: [{ type: 'string', enum: [...CATEGORIES] }, { type: 'array', items: { type: 'string', enum: [...CATEGORIES] } }] },
        neighborhood: { type: 'string', description: 'E.g. Gazi, Kolonaki, Psyrri, Exarchia, Pagrati, Koukaki.' },
        venue: { type: 'string', description: 'Venue name or part of it.' },
        open_only: { type: 'boolean', description: 'Only events with open (free) entry.' },
        max_price: { type: 'number', minimum: 0, description: 'Max ticket price in EUR. Open events are kept; events with no listed price are dropped.' },
        lang: langProp,
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'get_event',
    title: 'Get one event',
    description: 'Full details of one event, including the complete description.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The id from search_events, or an agentathens.com/events/… URL.' }, lang: langProp },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'list_venues',
    title: 'List venues',
    description: 'Venues with events in the next 30 days, busiest first, with their categories.',
    inputSchema: {
      type: 'object',
      properties: {
        neighborhood: { type: 'string' },
        category: { type: 'string', enum: [...CATEGORIES] },
        query: { type: 'string', description: 'Part of the venue name.' },
        lang: langProp,
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'match_artists',
    title: 'Match artists to events',
    description: "Given artists the user likes (e.g. their top artists from a music app, or names they mention), return upcoming Athens events by those artists. Matches by Wikidata ID, then by name across Greek and Latin spellings, then by mention in the title.",
    inputSchema: {
      type: 'object',
      properties: {
        artists: {
          type: 'array', minItems: 1, maxItems: 200,
          items: {
            oneOf: [
              { type: 'string' },
              { type: 'object', properties: { name: { type: 'string' }, wikidata: { type: 'string', pattern: '^Q\\d+$' } }, additionalProperties: false },
            ],
          },
        },
        date_from: dayProp('Default today.'),
        date_to: dayProp('Default date_from + 179 days.'),
        include_title_mentions: { type: 'boolean', default: true },
        lang: langProp,
      },
      required: ['artists'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
] as const;

type JsonRpcId = string | number | null;
interface JsonRpcRequest { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: any }

const rpcError = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: '2.0' as const, id, error: { code, message } });
const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: '2.0' as const, id, result });

export interface ServerDeps { feed: FeedSource; now?: () => Date }

// Keyed on the cached en snapshot, so the overlay is rebuilt only when a feed refreshes.
const englishViews = new WeakMap<FeedSnapshot, { el: FeedSnapshot; view: FeedSnapshot }>();

async function snapshotFor(l: Lang, feed: FeedSource): Promise<FeedSnapshot> {
  if (l === 'el') return feed('el');
  const [el, en] = await Promise.all([feed('el'), feed('en')]);
  const hit = englishViews.get(en);
  if (hit && hit.el === el) return hit.view;
  const view = overlayEnglish(el, en);
  englishViews.set(en, { el, view });
  return view;
}

async function callTool(name: string, args: any, deps: ServerDeps) {
  const today = athensToday(deps.now?.() ?? new Date());
  const l: Lang = args?.lang === 'el' ? 'el' : 'en';
  if (args?.lang != null && args.lang !== 'el' && args.lang !== 'en') throw new ToolInputError('lang must be "en" or "el"');
  const { lang: _l, ...rest } = args ?? {};
  const snap = await snapshotFor(l, deps.feed);
  switch (name) {
    case 'search_events': return searchEvents(snap, rest, today);
    case 'get_event': return getEvent(snap, rest);
    case 'list_venues': return listVenues(snap, rest, today);
    case 'match_artists': return matchArtists(snap, rest, today);
  }
  return undefined;
}

export async function handleRpc(msg: JsonRpcRequest, deps: ServerDeps): Promise<object | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return isNotification ? null : rpcError(id, -32600, 'Invalid Request');
  if (isNotification) return null; // notifications/initialized, cancelled, …: nothing to do

  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return rpcResult(id, {});
    case 'tools/list': return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const out = await callTool(name, msg.params?.arguments ?? {}, deps);
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out, isError: false });
      } catch (err) {
        // Input mistakes and feed outages go back to the model as tool errors it can act on.
        const text = err instanceof ToolInputError ? `Invalid arguments: ${err.message}` : `Agent Athens feed unavailable, try again shortly (${(err as Error).message})`;
        return rpcResult(id, { content: [{ type: 'text', text }], isError: true });
      }
    }
    default: return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, authorization',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

/** HTTP entry: POST /mcp carries JSON-RPC; everything else is small and static. */
export async function handleHttp(req: Request, deps: ServerDeps): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/' && req.method === 'GET') {
    return json({ ...SERVER_INFO, mcp_endpoint: `${url.origin}/mcp`, transport: 'streamable-http', source: 'https://agentathens.com/api/events.json' });
  }
  if (url.pathname !== '/mcp') return json({ error: 'Not found' }, 404);
  // No server-initiated stream: GET (SSE) and DELETE (session end) are not offered.
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS', ...CORS } });

  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return json(rpcError(null, -32600, 'Request too large'), 413);
  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json(rpcError(null, -32600, 'Request too large'), 413);
    body = JSON.parse(text);
  } catch {
    return json(rpcError(null, -32700, 'Parse error'), 400);
  }

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return json(rpcError(null, -32600, 'Invalid batch'), 400);
    const out = (await Promise.all(body.map((m) => handleRpc(m, deps)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handleRpc(body, deps);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
}
