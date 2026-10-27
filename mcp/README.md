# Agent Athens MCP server

A read-only [MCP](https://modelcontextprotocol.io) server over the public feed
(`/api/events.json`, `/api/en/events.json`). One server works in Claude,
ChatGPT and Gemini: each of them speaks MCP over Streamable HTTP.

It runs as its own Cloudflare Worker (`mcp.agentathens.com`), **not** on the
Netlify site. The site stays static files plus headers, with no functions
(pinned by `tests/security/no-click-redirect.test.ts`). The Worker only reads
the public feed, the same JSON any crawler gets, so it needs no secrets and no
database access.

## Tools

| Tool | What it does |
|---|---|
| `search_events` | Filters by `when` (today, tomorrow, this_weekend, next_7_days, next_30_days) or `date_from`/`date_to`, `category`, `neighborhood`, `venue`, `open_only`, `max_price`, free-text `query`. Results are paged. |
| `get_event` | One event with its full description, looked up by `id` or by its agentathens.com URL. |
| `list_venues` | Venues with events in the next 30 days, busiest first. |
| `match_artists` | Takes artists the user likes (names or `{name, wikidata}`) and returns upcoming events. It matches by Wikidata QID first, then by name across Greek and Latin spellings, then by a mention in the title, which is flagged. |

Personalisation happens in the assistant: it turns what it knows about the
user (memory, a connected music app) into filters or an artist list. The
server stores nothing about users. Every result carries the event's
Agent Athens `url`, and the server instructions tell the model to link it.

## Run and test

```bash
cd mcp
bun install                     # dev tools only: the MCP SDK client (tests) and wrangler
bun test test/                  # synthetic fixture feed, plus the SDK client over real HTTP
bun run typecheck
bun run bundle-check            # wrangler --dry-run; prints the Worker bundle size
FEED_FILE=test/fixtures/events.en.json bun run dev   # http://localhost:8787/mcp
bun run dev                     # same, against the live site's feed
bun run fixture                 # rebuild fixtures with the real DataFeed builder
bun run scripts/smoke.ts        # all four tools against the live feed: counts and samples
bun run scripts/feed-contract.ts   # does the live feed still have the shape toRecord() reads?
```

`lang: "en"` is the Greek feed with each English record laid over it, because
`/api/en/events.json` only lists events that have an English description.
Greek-only events therefore still appear in English results, under their Greek
name.

The fixtures are synthetic events run through `src/generators/datafeed.ts`, so
the tests break if the feed's shape changes. The repo's CI does not run these
tests yet, because adding them would change a protected path (`.github/**`);
that needs an issue.

## Deploy

```bash
cd mcp
bunx wrangler@4 login
bun run deploy                  # → https://agent-athens-mcp.<account>.workers.dev/mcp
```

For `mcp.agentathens.com`, add the custom-domain route in `wrangler.toml`.
That needs the domain's DNS on Cloudflare, or a CNAME to the Worker.

## Connect it

- **Claude** (web and desktop): go to Settings → Connectors → Add custom connector and enter the `/mcp` URL. For the public directory, submit it through Anthropic's connector directory form.
- **ChatGPT**: turn on developer mode under Settings → Apps → Advanced, then create an app with the `/mcp` URL and no auth. For the public directory, submit it as an app through the OpenAI Apps SDK review.
- **Gemini CLI**: in `~/.gemini/settings.json`, add `{"mcpServers": {"agent-athens": {"httpUrl": "https://mcp.agentathens.com/mcp"}}}`.
- **Quick check**: `npx @modelcontextprotocol/inspector`, using Streamable HTTP and the `/mcp` URL.

## Limits

The server itself refuses:

| Input | Response |
|---|---|
| Body over 64 KB (counted in bytes, with or without a `content-length`) | HTTP 413 |
| JSON-RPC batch of more than 20 messages | HTTP 400 |
| `match_artists` with more than 200 artists | tool error (`isError: true`) |

**Rate limiting is not built into the Worker.** It is a Cloudflare rule, set in
the dashboard before the endpoint goes public: Security → WAF → Rate limiting
rules → Create rule. Match `http.host eq "mcp.agentathens.com" and
http.request.uri.path eq "/mcp"`, count by IP, and block for a short period
when a client goes over the limit. Pick the numbers from real traffic; a
conversation makes a handful of tool calls, so a limit far above that only
stops scripts. The Worker keeps no per-user state, so this rule is the only
place a limit per client can live.
