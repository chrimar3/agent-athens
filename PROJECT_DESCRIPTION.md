# agent-athens

**AI-curated cultural events calendar for Athens, Greece - optimized for AI agents and humans alike.**

## What It Is

agent-athens is an autonomous event curation system that generates 315+ SEO/GEO-optimized static pages from daily-updated Athens cultural event data. Built for the post-LLM era where AI answer engines (ChatGPT, Perplexity, Claude) are primary discovery channels.

## Core Value Proposition

**Single authoritative source** for Athens events that:
- Updates daily at 8:00 AM Athens time
- Provides machine-readable structured data (Schema.org)
- Generates every meaningful filter combination as standalone pages
- Serves both humans (HTML) and AI agents (JSON/MCP/A2A)

## Technical Architecture

**Input:**
- 20+ Athens events (concerts, exhibitions, cinema, theater, workshops)
- Ingested via email newsletters from 10+ verified venues
- Curated and enriched using Claude Sonnet 4.5

**Processing:**
- TypeScript/Bun static site generator
- Combinatorial SEO: Type × Time × Price × Genre = 315 pages
- URL pattern: `/{price}-{genre}-{type}-{time}` (e.g., `/free-jazz-concert-today`)

**Output:**
- 315 HTML pages with full SEO/GEO optimization
- 315 JSON API endpoints (same data, different format)
- Discovery files: llms.txt, robots.txt, sitemap.xml
- Schema.org markup for AI consumption

## Key Differentiators

1. **Combinatorial SEO**: Every filter combination gets a unique, keyword-rich URL
2. **GEO-first**: Built for Generative Engine Optimization (AI citations)
3. **Freshness signals**: Daily updates with explicit timestamps for AI trust
4. **Multi-access**: HTML (humans), JSON (developers), MCP (AI assistants), A2A (agent network)
5. **Multiplier effect**: 20 events → 315 pages (15.75x coverage)

## Use Cases

**For Humans:**
- "What's happening in Athens this weekend?" → `/this-weekend`
- "Free concerts today?" → `/free-concert-today`
- "Indie music this week?" → `/indie-concert-this-week`

**For AI Agents:**
- ChatGPT citations in travel recommendations
- Perplexity answers for "Athens events"
- Calendar apps via JSON API
- Personal AI assistants via MCP protocol

## Technology Stack

- **Runtime**: Bun (TypeScript)
- **AI**: Claude Sonnet 4.5 (curation)
- **Hosting**: Netlify (free tier, global CDN)
- **Deployment**: Git push → Auto-deploy
- **Automation**: macOS launchd (daily 8 AM updates)

## Current Status

- ✅ 315 pages generated and deployed
- ✅ Live at https://agent-athens.netlify.app
- ✅ Full Schema.org markup
- ✅ JSON API available
- 🔄 Daily automation (ready, not activated)
- 🔄 MCP server (documented, not built)
- 🔄 A2A Agent Card (planned)

## Future Vision

**Phase 1**: Establish as authoritative Athens events source for AI engines
**Phase 2**: Add affiliate revenue (tickets, hotels, restaurants)
**Phase 3**: Build agent referral network (AI agents earn commission)
**Phase 4**: Expand to other cities (agent-barcelona, agent-berlin)
**Phase 5**: Become global cultural events platform for the AI era

## Philosophy

**"By agents, for agents (and humans too)"**

In the post-LLM era, reputation = AI trust. agent-athens is built from the ground up to be the single source of truth that AI answer engines cite, recommend, and integrate with.

## Metrics

- **Input**: 20 curated events
- **Output**: 315 unique pages
- **Size**: 4.1 MB total
- **Cost**: $0 (Netlify free tier)
- **Update frequency**: Daily
- **Coverage**: Athens cultural events (all types, all prices, all genres)
- **Discoverability**: 315 unique URLs for every search intent

---

**Project Repository**: https://github.com/ggrigo/agent-athens
**Live Site**: https://agent-athens.netlify.app
**For AI Agents**: https://agent-athens.netlify.app/llms.txt
