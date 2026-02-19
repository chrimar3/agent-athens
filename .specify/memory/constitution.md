# Constitution: agent_athens

> Governing principles for AI-curated cultural events platform development.
> All Claude Code sessions and implementations MUST adhere to these articles.

---

## Article I: Cost & Inference Principles

**1.1** All AI inference operates within Claude Max subscription via Claude Code sessions. **Zero external API calls.**

**1.2** Collection, parsing, site generation, and deployment are fully automated (launchd, no AI required).

**1.3** AI enrichment is human-triggered but AI-executed within Claude Code sessions. Enrichment is an *enhancement*, not a deployment blocker.

**1.4** Events may appear on the site without AI descriptions. Enrichment happens when a Claude Code session is run.

**1.5** When choosing between approaches, prefer the one with zero marginal cost.

**1.6** Batch operations to minimize session frequency — accumulate work, process in single session.

---

## Article II: Technology Foundation

**2.1** Runtime: Bun for all TypeScript/JavaScript execution. No Node.js.

**2.2** Language: TypeScript with strict mode enabled (`"strict": true` in tsconfig.json).

**2.3** Database: SQLite for event storage. Single file at `data/events.db`.

**2.4** Scraping: Python scripts for web crawling. Bun scripts for orchestration and import.

**2.5** Email: IMAP for newsletter ingestion. Gmail App Passwords for authentication.

**2.6** Deployment: Netlify via git push to main. Static files in `dist/`.

**2.7** AI Inference: Claude Code tool_agent only. No external AI APIs (OpenAI, Anthropic API, Google AI, etc.).

**2.8** Automation: macOS launchd for scheduled tasks (not cron). Handles missed jobs when machine wakes from sleep.

---

## Article III: Architecture Patterns

**3.1** Pipeline phases are discrete and independently runnable:
```
Collection → Enrichment → Cleanup → Generation → Deployment
```

**3.2** Each phase produces artifacts that the next phase consumes:
- Collection → `data/events.db` (unenriched events)
- Enrichment → `data/events.db` (enriched events)
- Cleanup → `data/events.db` (current events only)
- Generation → `dist/` (static HTML + JSON)
- Deployment → live site

**3.3** Automated phases (no AI required):
- Email ingestion (IMAP fetch)
- Web scraping (Python scrapers)
- Rule-based HTML parsing (structured sites)
- Database upsert with deduplication
- Past event cleanup
- Static site generation
- Git commit and push

**3.4** Human-triggered phases (Claude Code session):
- AI enrichment (description generation)
- Complex HTML parsing (unstructured sites)
- Architecture decisions
- Debugging and troubleshooting

**3.5** State tracking via JSON files:
- `data/scrape-state.json` — scraper timestamps and counts
- `data/processed-emails.json` — processed email Message-IDs
- `config/orchestrator-config.json` — pipeline configuration

---

## Article IV: Data Standards

**4.1** All events normalize to Schema.org Event format.

**4.2** Event deduplication uses normalized hash of `title + date + venue`:
- Normalization removes quotes (`«»""''`), collapses whitespace, lowercases
- Generic event titles (e.g., "RELEASE ATHENS 2026") are skipped if specific variants exist

**4.3** Event descriptions: 400-600 words (per `docs/MASTER-ENRICHMENT-TEMPLATE.md`):
- Sensory opening, second person ("you"), present tense
- Context with citable facts
- Tribe description (who attends, by character not demographics)
- Details table (Setting/Vibe/Sound/Door)
- Experience arc, Filter ("If you.../If you..."), Good to Know
- No lazy adjectives ("amazing", "incredible", "unique")

**4.4** Dates use ISO 8601 format. Timezone is Europe/Athens (EET/EEST).

**4.5** Events older than 1 day are automatically deleted during site generation.

**4.6** Price classification: "open" (free) or "with-ticket" (paid). No other categories.

**4.7** Event types: concert, exhibition, cinema, theater, performance, workshop.

**4.8** Location filtering: Only events in Attica region (Athens metro area including Piraeus, Kifisia, Glyfada, Marousi). See Article XIII.

---

## Article V: Code Organization

**5.1** Source code in `src/` with clear module boundaries:
```
src/
├── db/           # Database operations
├── ingest/       # Email and scraping ingestion
├── enrichment/   # AI description generation
├── templates/    # HTML generation
├── utils/        # Shared utilities
└── generate-site.ts  # Main site generator
```

**5.2** Scripts in `scripts/` — standalone executables for pipeline phases.

**5.3** Configuration in `config/` — JSON files, no hardcoded values.

**5.4** Data in `data/` — database, parsed events, scrape state.

**5.5** Output in `dist/` — generated static site.

**5.6** Documentation in `docs/` — technical guides and integration docs.

---

## Article VI: Testing Mandate

**6.1** Test-Driven Development is REQUIRED for all new features.

**6.2** Write tests BEFORE implementation (red → green → refactor).

**6.3** Test files live alongside source: `src/module/__tests__/module.test.ts`

**6.4** Test runner: Bun's built-in test runner (`bun test`).

**6.5** Minimum coverage: 80% for business logic, 60% for utilities.

**6.6** Integration tests for:
- Database operations (insert, update, query, delete)
- Email parsing (various newsletter formats)
- Site generation (page count, content validation)

**6.7** No deployment without passing tests.

---

## Article VII: Error Handling

**7.1** All errors are logged with timestamp, context, and stack trace.

**7.2** Scraping failures do not halt pipeline — log and continue to next source.

**7.3** Email ingestion failures retry 3 times with exponential backoff (2s, 4s, 8s).

**7.4** AI enrichment failures skip event and log — do not retry in same session.

**7.5** Site generation failures are fatal — do not deploy partial site.

**7.6** All error logs write to `logs/` with date-stamped filenames.

---

## Article VIII: Security Requirements

**8.1** Secrets in environment variables only. Never in code or config files.

**8.2** `.env` files are gitignored. Use `.env.example` as template.

**8.3** Gmail App Passwords for IMAP — never store main password.

**8.4** No user input accepted — this is a data pipeline, not a web app.

**8.5** Validate all external data before database insertion.

---

## Article IX: SEO/GEO Standards

**9.1** Every page includes Schema.org markup (Event, CollectionPage).

**9.2** URL structure: `/{price}-{genre}-{type}-{time}` (e.g., `/open-jazz-concert-today`).

**9.3** All pages exist even with 0 events — show "no events found" message.

**9.4** Discovery files always generated: `llms.txt`, `robots.txt`, `sitemap.xml`.

**9.5** "Last updated" timestamp on every page for freshness signals.

**9.6** Cross-links between related pages for internal linking.

---

## Article X: Replicability for Multi-City

**10.1** City-specific configuration isolated to:
- `config/city.json` — city name, timezone, coordinates
- `config/sources.json` — city-specific scrape sources
- `config/venues.json` — known venues with coordinates

**10.2** All code is city-agnostic. City name comes from config, not hardcoded.

**10.3** Database schema identical across cities.

**10.4** Templates use city name from config for titles and metadata.

**10.5** Deployment target (Netlify site name) comes from config.

**10.6** To create agent-barcelona: copy repo, update config files, deploy.

---

## Article XI: Git & Deployment

**11.1** Main branch is production. All commits to main trigger Netlify deploy.

**11.2** Feature branches for new development. Merge via PR with passing tests.

**11.3** Commit message format:
```
type: description

- Detail 1
- Detail 2

🤖 Automated daily update (for automated commits)
```

**11.4** Types: feat, fix, chore, docs, test, refactor.

**11.5** `dist/` is committed for Netlify deployment (no build step on Netlify).

**11.6** `data/events.db` is committed to preserve event state.

---

## Article XII: Claude Code Session Protocol

**12.1** Start each session with context: "Working on agent_athens, check constitution at .specify/memory/constitution.md"

**12.2** Before implementing, verify approach aligns with constitution.

**12.3** After implementation, run tests before committing.

**12.4** Document session outcomes in commit messages.

**12.5** If constitution needs amendment, propose change with rationale before implementing.

---

## Article XIII: Athens Location Filtering

**13.1** Only events in the Attica region appear on the site. This includes:
- Central Athens neighborhoods (Monastiraki, Gazi, Exarchia, Kolonaki, Plaka, etc.)
- Greater Athens (Piraeus, Kifisia, Glyfada, Marousi, Nea Smyrni, etc.)
- Attica venues (SNFCC, Technopolis, Olympic Stadium, etc.)

**13.2** Strict venue whitelist approach:
- Verified Athens venues are maintained in `config/athens-venues.json`
- Only events at whitelisted venues appear on site
- New venues require verification before adding to whitelist

**13.3** Location blacklist for auto-rejection:
- Events containing known non-Athens cities (Thessaloniki, Patras, Heraklion, etc.) are auto-rejected
- Blacklist maintained in `config/rejected-locations.json`

**13.4** Unknown venues are flagged for review:
- Events with unrecognized venues get `location_status = 'unverified'`
- Claude Code session reviews flagged events periodically
- Verified venues are added to whitelist

---

## Amendment Log

| Version | Date | Change | Rationale |
|---------|------|--------|-----------|
| 1.0 | 2025-01-20 | Initial constitution | Codify existing patterns + establish principles |
| 1.1 | 2026-02-13 | Article 4.3: 150-300 → 400-600 words | Align with MASTER-ENRICHMENT-TEMPLATE v2.1 |

---

*This constitution governs all development on agent_athens. Amendments require explicit discussion and documentation.*
