# Agent Athens MCP server

A read-only [MCP](https://modelcontextprotocol.io) server over the public feed
(`/api/events.json`, `/api/en/events.json`). One server works in Claude,
ChatGPT and Gemini: each of them speaks MCP over Streamable HTTP.

It runs as its own Netlify site (`mcp.agentathens.com`, base directory
`mcp/`), **not** as part of the main agentathens.com site. The main site stays
static files plus headers, with no functions (pinned by
`tests/security/no-click-redirect.test.ts`). The server only reads the public
feed, the same JSON any crawler gets, so it needs no secrets and no database
access.

The code is web-standard `Request` → `Response` with no runtime dependencies,
so it has three thin entry points: `netlify/functions/mcp.mts` (production),
`src/worker.ts` (Cloudflare Workers, an alternative host) and `src/dev.ts`
(local, Bun).

## Tools

| Tool | What it does |
|---|---|
| `search_events` | Filters by `when` (today, tomorrow, this_weekend, next_7_days, next_30_days) or `date_from`/`date_to`, `category`, `neighborhood`, `venue`, `open_only`, `max_price`, free-text `query`. Results are paged. |
| `get_event` | One event with its full description, looked up by `id` or by its agentathens.com URL. |
| `list_venues` | Venues with events in the next 30 days, busiest first. |
| `match_artists` | Takes artists the user likes (names, or `{name, wikidata, spotify_id}`) and returns upcoming events. It matches by Spotify artist ID first (resolved to a Wikidata QID through `data/performer-ids.json`), then by Wikidata QID, then by name across Greek and Latin spellings, then by a mention in the title, which is flagged. |

In hosts that support [MCP Apps](https://github.com/modelcontextprotocol/ext-apps)
(stable spec 2026-01-26), `search_events` and `match_artists` results show as
cards with "Agent Athens page" and "Tickets" buttons. The view is one
self-contained HTML file (`src/ui/events.html`), served as the resource
`ui://agent-athens/events.html`. Event images load only from agentathens.com;
other hosts get a placeholder, so no third party sees the viewer. Hosts without
Apps support get the same text and `structuredContent` as before.

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
bun run bundle-check:netlify    # esbuild-bundles the Netlify function and makes one MCP call through the bundle
bun run bundle-check            # the same for the Cloudflare Worker (wrangler --dry-run)
bun run build:ui                # after editing src/ui/events.html: regenerates src/ui/events-html.ts
FEED_FILE=test/fixtures/events.en.json bun run dev   # http://localhost:8787/mcp
bun run dev                     # same, against the live site's feed
bun run fixture                 # rebuild fixtures with the real DataFeed builder
bun run scripts/smoke.ts        # all four tools against the live feed: counts and samples
bun run scripts/feed-contract.ts   # does the live feed still have the shape toRecord() reads?
bun run scripts/examples.ts     # the directory kit's example prompts against the live feed
bun run scripts/fetch-spotify-ids.ts   # refresh data/performer-ids.json from Wikidata (build time only)
bun run e2e                     # the card view in Chromium inside a stub MCP Apps host, plus axe
```

`bun run e2e` uses Playwright with the Chromium build already in the
Playwright cache; it never downloads a browser. Point `PLAYWRIGHT_CHROMIUM` at
another Chrome or Chromium binary if that cache is missing.

`lang: "en"` is the Greek feed with each English record laid over it, because
`/api/en/events.json` only lists events that have an English description.
Greek-only events therefore still appear in English results, under their Greek
name.

The fixtures are synthetic events run through `src/generators/datafeed.ts`, so
the tests break if the feed's shape changes. The repo's CI does not run these
tests yet, because adding them would change a protected path (`.github/**`);
that needs an issue.

## Deploy (Netlify)

A second Netlify site, separate from the main one, built from this repository:

1. In Netlify: **Add new project → Import an existing project → GitHub →
   `chrimar3/agent-athens`**.
2. Set **Base directory** to `mcp`. Leave the build command empty;
   `mcp/netlify.toml` sets the publish directory (`public`) and the function
   bundler. Choose the branch to deploy, `main` once PR #40 is merged.
3. Deploy. The site answers at `https://<project>.netlify.app/mcp`. Check it:
   `npx @modelcontextprotocol/inspector@2.10.1 --cli https://<project>.netlify.app/mcp --transport http --method tools/list`.
4. **Domain management → Add a domain → `mcp.agentathens.com`.** The domain's
   DNS is already on Netlify, so the record and the HTTPS certificate are set
   up there.

The per-IP rate limit (§ Limits) ships in the function's own `config`; there is
nothing to set in the dashboard. Pushes that touch only the main site rebuild
this site too. In the project's build settings you can skip those builds with
an ignore command that checks for changes under `mcp/` and
`config/lifecycle-presumption.json`, which the function bundles.

**Alternative host: Cloudflare Workers.** `bunx wrangler@4 login && bun run
deploy` gives `https://agent-athens-mcp.<account>.workers.dev/mcp`. A
Cloudflare custom domain such as `mcp.agentathens.com` only works when the
domain's DNS is on Cloudflare; today it is on Netlify.

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

**Rate limiting** is Netlify's, set in the function's `config.rateLimit`: 300
requests per 60 seconds per IP address. Netlify answers HTTP 429 above that,
and may take up to 10 seconds to start blocking a client. Assistants call
remote connectors from their own servers, so one IP can carry many users. The
limit is generous so that it stops scripts, not conversations. Tune it from
real traffic. On Cloudflare there is no equivalent in code; use a WAF
rate-limiting rule there.
