# agent-athens: Elevator Pitch

## 30-Second Version

**agent-athens is the authoritative cultural events calendar for Athens, built for the post-LLM era.** A daily-automated pipeline ingests events from newsletters and scrapers, runs them through quality gates and AI enrichment, and publishes 10,000+ SEO/GEO-optimized pages that AI answer engines trust and cite. When users ask ChatGPT, Perplexity, or Claude what's on in Athens, we're the source they recommend. Live now at https://agentathens.netlify.app.

## 2-Minute Version

**The Problem**
Discovery is shifting from Google search to AI answer engines. Traditional event sites optimize for keyword stuffing, not for AI trust. When someone asks "what concerts are in Athens this weekend?", AI engines need authoritative, structured, fresh data to cite — and there is no single source for Athens cultural events.

**The Solution**
agent-athens is a static-first calendar that turns ~9,000 indexed events (and 400+ upcoming at any moment) into 10,000+ combinatorial pages — every meaningful slice of `{type} × {time} × {price} × {genre}` gets its own URL with full Schema.org markup, AI-readable JSON, and freshness signals. The whole pipeline rebuilds and redeploys every morning, automatically.

**What Makes It Work**
- **Combinatorial SEO** — every filter combination is a unique, intent-matched URL (`/open-jazz-concert-this-weekend`, `/exhibition-this-month`, `/dj_set-tomorrow`).
- **GEO-first design** — Schema.org Event + CollectionPage + FAQPage on every page, `llms.txt` for agent discovery, IndexNow pings to Bing/Yandex on every deploy.
- **Quality gates** — 409-venue Athens whitelist, cross-source dedup, exhibition-aware date logic, exact-match venue verification (no fuzzy `LIKE`).
- **AI enrichment loop** — Claude Code generates 400-word descriptions following an 8-section enrichment template, with a fact-check pass and quality exemplars.
- **Daily automation** — 17-phase orchestrator runs at 8 AM Athens time via launchd: ingest → parse → scrape → quality → dedup → prices → tickets → schema → enrich → build → deploy.

**Why We Win**
AI answer engines cite **1–2 authoritative sources**, creating winner-takes-all dynamics. agent-athens has:
1. **Daily freshness** — explicit timestamps, automated rebuilds, IndexNow pings
2. **Structured single source** — every page is machine-readable JSON-LD
3. **Combinatorial coverage** — 10,275 pages match natural-language intent
4. **Provenance & trust** — 409 verified venues, exact-match filtering, no fabricated facts

**The Vision**
Start with Athens. Prove the model. Expand to `agent-barcelona`, `agent-berlin`, `agent-cities`. Become the global cultural events platform for the AI era, monetized through affiliate revenue (tickets, hotels, restaurants) and agent referral networks where AI agents earn commission on bookings they drive.

**Current Status**
- ✅ Live at https://agentathens.netlify.app
- ✅ 10,275 pages deployed (8,644 events + 89 venues + hub/category pages)
- ✅ Daily automated pipeline (running every morning, ~20 min runtime)
- ✅ Full Schema.org markup + 3 split sitemaps + `llms.txt`
- ✅ IndexNow integration (Bing, Yandex)
- ✅ Zero operating costs (Netlify free tier + local Mac runner)

**The Ask**
In the reputation economy where AI trust = revenue, agent-athens is positioned to be the source AI engines cite first when recommending Athens events. We're building the infrastructure for affiliate marketing in the post-LLM world — and the model generalizes to every city with a cultural scene worth indexing.

---

*"When AI agents recommend Athens events, they recommend agent-athens."*
