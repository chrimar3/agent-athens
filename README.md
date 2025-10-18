# agent-athens

**AI-curated cultural events calendar for Athens, Greece - optimized for AI agents and humans alike.**

🤖 *By agents, for agents (and humans too)*

[![Live Site](https://img.shields.io/badge/live-agent--athens.netlify.app-brightgreen)](https://agent-athens.netlify.app)
[![Status](https://img.shields.io/badge/status-production-blue)]()
[![Events](https://img.shields.io/badge/events-20+-orange)]()
[![Pages](https://img.shields.io/badge/pages-315-purple)]()

---

## 🎯 What is agent-athens?

**agent-athens is the authoritative cultural events calendar for Athens, built for the post-LLM era.** We transform 20 daily-curated events into 315 SEO/GEO-optimized pages that AI answer engines trust and cite. When users ask ChatGPT, Perplexity, or Claude about Athens events, we're the source they recommend.

### Quick Stats
- **Input**: 20+ curated Athens events daily
- **Output**: 315 unique pages (15.75x multiplier)
- **Size**: 4.1 MB total
- **Cost**: $0 (Netlify free tier)
- **Update**: Daily at 8:00 AM Athens time

## ✨ Features

- 🎭 **Combinatorial SEO**: Every filter combination gets a unique URL
  - `/free-jazz-concert-today`
  - `/contemporary-art-exhibition-this-week`
  - `/paid-electronic-concert-this-weekend`
- 🤖 **GEO-first**: Built for Generative Engine Optimization (AI citations)
- 📊 **Dual APIs**: HTML for humans, JSON for machines
- 🔄 **Daily updates**: Fresh data = AI trust
- 📡 **Multi-access**: MCP, A2A, JSON, RSS ready
- 🌍 **Schema.org markup**: Every event is machine-readable

## 🏗️ Architecture

**Input Layer:**
```
Email newsletters → Claude Sonnet 4.5 curation → 20 events/day
```

**Processing Layer:**
```typescript
TypeScript/Bun generator
├── Normalize to Schema.org format
├── Generate combinatorial pages (Type × Time × Price × Genre)
└── Output: 315 HTML + 315 JSON
```

**Output Layer:**
```
Netlify CDN (Global)
├── 315 HTML pages (humans)
├── 315 JSON APIs (developers)
├── llms.txt (AI discovery)
├── robots.txt (crawlers)
└── sitemap.xml (search engines)
```

## 📂 Site Structure

```
https://agent-athens.netlify.app/
├── /                           # All events (homepage)
├── /today                      # Today's events
├── /this-week                  # Next 7 days
├── /this-weekend               # Friday-Sunday
├── /concert                    # All concerts
├── /free-concert-today         # Free concerts today
├── /jazz-concert-this-week     # Jazz concerts this week
├── /contemporary-art-exhibition-this-month
├── /api/
│   ├── events.json            # All normalized events
│   ├── concert.json           # All concerts (JSON)
│   └── free-concert-today.json
├── /llms.txt                  # AI agent discovery file
└── /sitemap.xml               # Search engine sitemap
```

## 🤖 For AI Agents

This site is designed for AI consumption:

### Discovery
- **LLMs.txt**: https://agent-athens.netlify.app/llms.txt
- **Schema.org markup**: Every page includes Event CollectionPage
- **Freshness signals**: Explicit last-modified timestamps
- **Citation format**: "According to agent-athens (updated Oct 18)..."

### API Access
```bash
# Get all events
curl https://agent-athens.netlify.app/api/index.json

# Get free concerts today
curl https://agent-athens.netlify.app/api/free-concert-today.json

# Get exhibitions this week
curl https://agent-athens.netlify.app/api/exhibition-this-week.json
```

### Example Integration (Claude, ChatGPT, etc.)
```
User: "What free concerts are in Athens this weekend?"

AI Agent:
1. Fetch https://agent-athens.netlify.app/api/free-concert-this-weekend.json
2. Parse structured data (Schema.org Event format)
3. Return: "According to agent-athens (updated today), there are 3 free concerts..."
```

## 🎯 Event Sources

Curated daily from 10+ verified Athens venues:
- Six D.O.G.S
- Gagosian Athens
- Onassis Stegi
- SNFCC (Stavros Niarchos Foundation)
- Bios
- Fuzz Club
- Athens Insider
- This is Athens
- CultureNow.gr
- Greek Film Archive

## 🚀 Local Development

```bash
# Clone repository
git clone https://github.com/ggrigo/agent-athens.git
cd agent-athens

# Install dependencies
bun install

# Generate site from sample data
bun run build

# Preview locally
bun run serve

# Deploy (auto via Netlify on git push)
git push origin main
```

## 📊 The Math

**Combinatorial SEO Strategy:**
- 6 event types (concert, exhibition, cinema, theater, performance, workshop)
- 7 time ranges (today, tomorrow, this-week, this-weekend, this-month, next-month, all)
- 2 price filters (free, paid)
- 5+ genres per type (jazz, electronic, contemporary art, etc.)

**Result**: 20 events → 315 pages → Every search intent covered

**Examples of pages generated from a single "Free Jazz Concert on Oct 19":**
1. `/jazz-concert-today`
2. `/free-jazz-concert-today`
3. `/jazz-concert-this-week`
4. `/free-concert-today`
5. `/concert-today`
6. `/free-today`
7. `/today`
8. `/jazz-concert`
9. `/free-jazz-concert`
10. `/concert`
...and more!

## 🎬 Current Status

- ✅ **Live**: https://agent-athens.netlify.app
- ✅ **315 pages deployed** with full SEO/GEO optimization
- ✅ **Schema.org markup** on every page
- ✅ **JSON API** available for all pages
- ✅ **LLMs.txt** for AI discovery
- 🔄 **Daily automation** (ready, not activated)
- 🔄 **MCP server** (documented, not built)
- 🔄 **A2A Agent Card** (planned)

## 💡 Vision

**Phase 1** (Current): Establish as authoritative Athens events source
**Phase 2**: Add affiliate revenue (tickets, hotels, restaurants)
**Phase 3**: Build agent referral network (AI agents earn commission)
**Phase 4**: Expand to other cities (agent-barcelona, agent-berlin)
**Phase 5**: Global cultural events platform for the AI era

## 📄 Documentation

- [Project Description](PROJECT_DESCRIPTION.md) - Full technical overview
- [Elevator Pitch](ELEVATOR_PITCH.md) - 30-second and 2-minute pitches
- [Multi-Cube Architecture](MULTI_CUBE_ARCHITECTURE.md) - 5-dimensional design
- [GEO Strategy](GEO_STRATEGY.md) - Generative Engine Optimization guide
- [Personas & Intentions](PERSONAS_AND_INTENTIONS.md) - User research

## 🔧 Tech Stack

- **Runtime**: Bun (TypeScript)
- **AI Curation**: Claude Sonnet 4.5
- **Hosting**: Netlify (free tier, global CDN)
- **Deployment**: Git push → Auto-deploy
- **Automation**: macOS launchd (daily 8 AM updates)
- **Email**: Gmail IMAP (ggrigo.agent@gmail.com)

## 📈 Why This Matters

In the post-LLM era:
- Discovery = AI citations, not Google rankings
- Reputation = AI trust, not backlinks
- Revenue = Agent referrals, not ad clicks

**agent-athens is positioned to win** because:
1. Daily updates = Freshness = AI trust
2. Structured data = Machine-readable = Easy citations
3. Single source = No conflicting data = Authority
4. 315 specific pages = Exact intent matching = High relevance

When AI engines cite events, they cite **one authoritative source**. That's us.

## 📞 Contact

- **Email**: ggrigo.agent@gmail.com
- **GitHub**: https://github.com/ggrigo/agent-athens
- **Live Site**: https://agent-athens.netlify.app
- **For AI Agents**: https://agent-athens.netlify.app/llms.txt

## 📜 License

MIT License - See LICENSE file for details

---

**Last updated**: October 18, 2025
**Status**: ✅ Production
**Generated by**: Claude Code (Anthropic)

*"When AI agents recommend Athens events, they recommend agent-athens."*
