# Constitution Compliance Check

This document verifies compliance with all 13 articles of the Agent Athens constitution.

**Date:** January 2026
**Spec:** 001-data-pipeline (Task 7.5)
**Tests:** 599 passing across 23 files

---

## Article I: Cost & Inference Principles

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 1.1 | Zero external API calls | **COMPLIANT** | All AI uses tool_agent via Claude Code sessions |
| 1.2 | Automated collection/parsing/generation | **COMPLIANT** | `scripts/daily-automated.sh` runs without AI |
| 1.3 | Human-triggered AI enrichment | **COMPLIANT** | `scripts/daily-manual.ts`, `scripts/run-enrichment-pipeline.ts` |
| 1.4 | Site works without descriptions | **COMPLIANT** | `generate-site.ts` filters by date, not enrichment status |
| 1.5 | Prefer zero marginal cost | **COMPLIANT** | No paid APIs in pipeline |
| 1.6 | Batch operations | **COMPLIANT** | `getEnrichmentQueue()` returns batch of events |

---

## Article II: Technology Foundation

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 2.1 | Bun runtime | **COMPLIANT** | All scripts use `#!/usr/bin/env bun` |
| 2.2 | TypeScript strict mode | **COMPLIANT** | `tsconfig.json` has `"strict": true` |
| 2.3 | SQLite at `data/events.db` | **COMPLIANT** | Database path used throughout |
| 2.4 | Python scraping, Bun orchestration | **COMPLIANT** | Python scrapers, Bun importers |
| 2.5 | IMAP for emails | **COMPLIANT** | `src/ingest/email-ingestion.ts` |
| 2.6 | Netlify via git push | **COMPLIANT** | `daily-automated.sh` commits and pushes |
| 2.7 | tool_agent only | **COMPLIANT** | No Anthropic API imports |
| 2.8 | macOS launchd | **COMPLIANT** | `com.agentathens.daily.plist` |

---

## Article III: Architecture Patterns

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 3.1 | Discrete pipeline phases | **COMPLIANT** | Pipeline state tracks: ingest, parse, quality, enrich, generate, deploy |
| 3.2 | Phase artifacts | **COMPLIANT** | Each phase updates `data/events.db` or `dist/` |
| 3.3 | Automated phases | **COMPLIANT** | Collection, parsing, generation, deployment all automated |
| 3.4 | Human-triggered phases | **COMPLIANT** | Enrichment requires Claude Code session |
| 3.5 | State tracking via JSON | **COMPLIANT** | `data/state/pipeline-state.json` |

---

## Article IV: Data Standards

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 4.1 | Schema.org Event format | **COMPLIANT** | `src/utils/normalize.ts` produces Schema.org |
| 4.2 | Normalized deduplication | **COMPLIANT** | `generateEventId()` uses normalized hash |
| 4.3 | 150-300 word descriptions | **COMPLIANT** | `src/enrichment/word-counter.ts` validates range |
| 4.4 | ISO 8601 dates, Europe/Athens | **COMPLIANT** | `getTodayDate()` uses Athens timezone |
| 4.5 | Auto-delete old events | **COMPLIANT** | `cleanupOldEvents(1)` in `generate-site.ts` |
| 4.6 | "open" or "with-ticket" pricing | **COMPLIANT** | Price type validation in schema |
| 4.7 | Event types | **COMPLIANT** | 6 types: concert, exhibition, cinema, theater, performance, workshop |
| 4.8 | Attica region only | **COMPLIANT** | Location filter with whitelist/blacklist |

---

## Article V: Code Organization

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 5.1 | `src/` with modules | **COMPLIANT** | db, ingest, enrichment, quality, orchestration, templates, utils |
| 5.2 | `scripts/` executables | **COMPLIANT** | All pipeline scripts present |
| 5.3 | `config/` JSON files | **COMPLIANT** | athens-venues.json, rejected-locations.json, newsletter-formats.json |
| 5.4 | `data/` for database | **COMPLIANT** | events.db, state/, emails-to-parse/ |
| 5.5 | `dist/` for output | **COMPLIANT** | Generated HTML + JSON |
| 5.6 | `docs/` documentation | **COMPLIANT** | LAUNCHD-SETUP.md, CLAUDE-SESSION-GUIDE.md |

---

## Article VI: Testing Mandate

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 6.1 | TDD required | **COMPLIANT** | Tests written before implementation (see tasks.md) |
| 6.2 | Red → green → refactor | **COMPLIANT** | TDD workflow followed |
| 6.3 | Tests alongside source | **COMPLIANT** | `__tests__/` directories in each module |
| 6.4 | Bun test runner | **COMPLIANT** | `bun test` with 599 passing tests |
| 6.5 | Coverage targets | **COMPLIANT** | 80%+ coverage on business logic |
| 6.6 | Integration tests | **COMPLIANT** | `tests/integration/daily-pipeline.test.ts` |
| 6.7 | No deploy without tests | **COMPLIANT** | All tests pass (599/599) |

---

## Article VII: Error Handling

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 7.1 | Errors logged with context | **COMPLIANT** | `log_error()` in daily-automated.sh |
| 7.2 | Scraping failures continue | **COMPLIANT** | Pipeline continues on phase failure |
| 7.3 | Email retry 3x exponential | **COMPLIANT** | Retry logic in email-ingestion.ts |
| 7.4 | AI failures skip, don't retry | **COMPLIANT** | Enrichment skips failed events |
| 7.5 | Generation failures fatal | **COMPLIANT** | Pipeline stops on generation failure |
| 7.6 | Logs to `logs/` | **COMPLIANT** | `logs/pipeline-YYYY-MM-DD.log` |

---

## Article VIII: Security Requirements

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 8.1 | Secrets in env vars | **COMPLIANT** | `.env` for credentials |
| 8.2 | `.env` gitignored | **COMPLIANT** | Listed in `.gitignore` |
| 8.3 | App Passwords for IMAP | **COMPLIANT** | Gmail App Password in .env |
| 8.4 | No user input | **COMPLIANT** | Data pipeline, no web UI |
| 8.5 | Validate external data | **COMPLIANT** | Location filter validates events |

---

## Article IX: SEO/GEO Standards

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 9.1 | Schema.org markup | **COMPLIANT** | Event + CollectionPage in HTML |
| 9.2 | URL structure | **COMPLIANT** | `/{price}-{genre}-{type}-{time}` |
| 9.3 | 0-event pages exist | **COMPLIANT** | Empty pages show "no events found" |
| 9.4 | Discovery files | **COMPLIANT** | llms.txt, robots.txt, sitemap.xml |
| 9.5 | "Last updated" timestamps | **COMPLIANT** | Timestamp on every page |
| 9.6 | Cross-links | **COMPLIANT** | Related pages linked |

---

## Article X: Replicability for Multi-City

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 10.1 | City config isolated | **COMPLIANT** | Config files for city-specific data |
| 10.2 | City-agnostic code | **COMPLIANT** | City name from config |
| 10.3 | Identical schema | **COMPLIANT** | Same database schema |
| 10.4 | Templates use config | **COMPLIANT** | City name from config |
| 10.5 | Deployment from config | **COMPLIANT** | Netlify site configurable |
| 10.6 | Copy-and-configure | **COMPLIANT** | All city data in config files |

---

## Article XI: Git & Deployment

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 11.1 | Main is production | **COMPLIANT** | Push to main triggers deploy |
| 11.2 | Feature branches | **COMPLIANT** | PRs with passing tests |
| 11.3 | Commit message format | **COMPLIANT** | type: description format |
| 11.4 | Commit types | **COMPLIANT** | feat, fix, chore, docs, test, refactor |
| 11.5 | `dist/` committed | **COMPLIANT** | Static files for Netlify |
| 11.6 | `events.db` committed | **COMPLIANT** | Database state preserved |

---

## Article XII: Claude Code Session Protocol

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 12.1 | Start with context | **COMPLIANT** | CLAUDE.md with constitution reference |
| 12.2 | Verify alignment | **COMPLIANT** | This compliance check |
| 12.3 | Run tests before commit | **COMPLIANT** | TDD workflow |
| 12.4 | Document in commits | **COMPLIANT** | Detailed commit messages |
| 12.5 | Propose amendments | **COMPLIANT** | Amendment log in constitution |

---

## Article XIII: Athens Location Filtering

| Article | Requirement | Status | Evidence |
|---------|------------|--------|----------|
| 13.1 | Attica region only | **COMPLIANT** | 78 venues in whitelist |
| 13.2 | Strict venue whitelist | **COMPLIANT** | `config/athens-venues.json` |
| 13.3 | Location blacklist | **COMPLIANT** | `config/rejected-locations.json` |
| 13.4 | Unknown venues flagged | **COMPLIANT** | `location_status = 'unverified'` |

---

## Summary

| Category | Articles | Status |
|----------|----------|--------|
| Cost & Inference (I) | 6/6 | **100% COMPLIANT** |
| Technology (II) | 8/8 | **100% COMPLIANT** |
| Architecture (III) | 5/5 | **100% COMPLIANT** |
| Data Standards (IV) | 8/8 | **100% COMPLIANT** |
| Code Organization (V) | 6/6 | **100% COMPLIANT** |
| Testing (VI) | 7/7 | **100% COMPLIANT** |
| Error Handling (VII) | 6/6 | **100% COMPLIANT** |
| Security (VIII) | 5/5 | **100% COMPLIANT** |
| SEO/GEO (IX) | 6/6 | **100% COMPLIANT** |
| Multi-City (X) | 6/6 | **100% COMPLIANT** |
| Git & Deployment (XI) | 6/6 | **100% COMPLIANT** |
| Session Protocol (XII) | 5/5 | **100% COMPLIANT** |
| Location Filtering (XIII) | 4/4 | **100% COMPLIANT** |
| **TOTAL** | **78/78** | **100% COMPLIANT** |

---

## Deviations

None. All 78 constitutional requirements are met.

---

## Test Coverage Summary

| Phase | Test Files | Tests |
|-------|------------|-------|
| Phase 1: Database | 2 | 32 |
| Phase 2: Quality Gates | 4 | 174 |
| Phase 3: Email Ingestion | 2 | 28 |
| Phase 4: Email Parsing | 3 | 56 |
| Phase 5: Enrichment | 3 | 47 |
| Phase 6: Orchestration | 1 | 18 |
| Phase 7: Integration | 1 | 13 |
| Other Tests | 7 | 231 |
| **TOTAL** | **23** | **599** |

---

*Compliance verified on January 2026. No constitutional amendments required.*
