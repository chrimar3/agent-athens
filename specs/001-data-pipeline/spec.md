# Feature Specification: Data Pipeline & Quality

**Spec ID:** 001-data-pipeline
**Status:** Draft
**Created:** 2025-01-20
**Updated:** 2025-01-20
**Constitution Version:** 1.1

---

## Overview

Build a complete, production-ready data pipeline for agent-athens that collects events from multiple sources, ensures data quality (Athens-only, deduplicated), optionally enriches with AI descriptions, and deploys automatically.

**Key Architecture Decision:** The pipeline splits into two execution modes:
- **Fully automated (launchd):** Collection → Quality gates → Site generation → Deploy
- **Human-triggered (Claude Code):** AI enrichment → Rebuild → Deploy

Events appear on the site daily with or without AI descriptions. Enrichment is an enhancement, not a blocker.

**Business Objective:** Reliable daily updates with clean, Athens-focused event data that AI answer engines trust and cite.

---

## Part A: Event Collection

### User Stories

#### US-A1: Automated Email Collection

As a **system operator**, I want emails to be automatically fetched and parsed without human intervention, so that event collection happens reliably every day.

**Acceptance Criteria:**
- Given launchd triggers at 8:00 AM Athens time, when email ingestion runs, then all unread newsletters are fetched from Gmail INBOX
- Given an email is fetched, when it contains event data, then events are extracted and saved to `data/emails-to-parse/`
- Given an email is processed, when extraction completes, then the email Message-ID is recorded in `data/processed-emails.json`
- Given an email was previously processed, when the script runs again, then that email is skipped
- Given IMAP connection fails after 3 retries, then error is logged and pipeline continues to web scraping

#### US-A2: Rule-Based Email Parsing

As a **system operator**, I want newsletters to be parsed into structured events without AI, so that the automated pipeline runs without human triggering.

**Acceptance Criteria:**
- Given a newsletter in `data/emails-to-parse/`, when the parser runs, then events are extracted based on known newsletter format patterns
- Given a "This is Athens" newsletter, when parsed, then events with title, date, venue, and link are extracted
- Given an unknown newsletter format, when parsing fails, then the email is moved to `data/emails-unparseable/` for manual review
- Given events are extracted, when import runs, then they proceed to quality gates

#### US-A3: Web Scraping Collection

As a **system operator**, I want events scraped from websites to feed into the same pipeline as email events.

**Acceptance Criteria:**
- Given configured scrape sources, when the orchestrator runs, then each source is scraped according to its frequency (daily/weekly)
- Given scraped HTML, when parsed, then events are extracted and proceed to quality gates
- Given a scraper fails, when error occurs, then it's logged and pipeline continues with other sources

---

## Part B: Data Quality Gates

### User Stories

#### US-B1: Athens Location Filtering

As a **system operator**, I want only Athens-area events to enter the database, so that the site maintains its geographic focus.

**Acceptance Criteria:**
- Given an event at "Six D.O.G.S" (verified Athens venue), when import runs, then event is accepted with `location_status = 'verified_athens'`
- Given an event with "Θεσσαλονίκη" in title or venue, when import runs, then event is rejected and logged
- Given an event with "Πτολεμαΐδα" in venue, when import runs, then event is rejected and logged
- Given an event at unknown venue not matching blacklist, when import runs, then event is accepted with `location_status = 'unverified'`
- Given site generation runs, when filtering events, then only `location_status = 'verified_athens'` events appear

#### US-B2: Deduplication

As a **system operator**, I want duplicate events from different sources to be merged, so that the same event doesn't appear twice on the site.

**Acceptance Criteria:**
- Given "«Τρισεύγενη»" from source A and "Τρισεύγενη" from source B (same date/venue), when import runs, then they resolve to one event (quotes normalized)
- Given "PURE SHOW" and "PURE  SHOW" (extra space), when import runs, then they resolve to one event (whitespace normalized)
- Given identical event already exists, when import runs, then existing event is updated (not duplicated)
- Given a generic title "RELEASE ATHENS 2026" and specific "RELEASE ATHENS 2026 / Nick Cave", when both exist, then keep specific, skip generic

#### US-B3: Venue Review Workflow

As a **system operator**, I want to review events with unknown venues, so that new Athens venues can be verified and added to the whitelist.

**Acceptance Criteria:**
- Given unverified events exist, when I run `bun run scripts/review-venues.ts`, then I see list of events with unknown venues
- Given I verify a venue is in Athens, when I approve it, then venue is added to whitelist and event status updated
- Given I reject a venue as non-Athens, when I reject it, then venue is added to blacklist and event deleted

---

## Part C: Enrichment Workflow

### User Stories

#### US-C1: Enrichment Queue Management

As a **system operator**, I want to see which events need enrichment, so that I can process them efficiently in a Claude Code session.

**Acceptance Criteria:**
- Given the database has events, when I run `bun run scripts/list-unenriched.ts`, then I see count and list of events with `needs_enrichment = true`
- Given events need enrichment, when the list displays, then events are sorted by date (soonest first)
- Given no events need enrichment, when the list displays, then I see "All events enriched ✓"

#### US-C2: AI Description Generation

As a **system operator**, I want to generate AI descriptions for events in a Claude Code session, so that events have rich, citation-worthy content.

**Acceptance Criteria:**
- Given I start a Claude Code session, when I say "enrich all pending events", then Claude Code processes all events with `needs_enrichment = true`
- Given an event is being enriched, when the description is generated, then it follows the content structure (150-300 words, quotable opening)
- Given an event is enriched, when saved, then `needs_enrichment = false` and `enriched_at` timestamp is recorded
- Given enrichment fails for an event, when error occurs, then event is skipped, logged, and processing continues

---

## Part D: Automated Deployment

### User Stories

#### US-D1: Daily Automated Pipeline

As a **system operator**, I want the full pipeline to run daily without my intervention, so that the site stays fresh automatically.

**Acceptance Criteria:**
- Given launchd triggers at 8:00 AM, when the pipeline runs, then: collection → quality gates → site generation → git push executes in sequence
- Given the MacBook was asleep at 8 AM, when it wakes, then launchd catches up and runs the missed job
- Given the pipeline completes, when Netlify receives the push, then the site updates automatically
- Given any phase fails, when error occurs, then it's logged and the pipeline continues where possible

#### US-D2: Post-Enrichment Deployment

As a **system operator**, I want to deploy after an enrichment session, so that AI descriptions go live.

**Acceptance Criteria:**
- Given enrichment completes in Claude Code, when I say "rebuild and deploy", then site regenerates and pushes to Netlify
- Given deployment completes, when the session ends, then commit message includes counts and timestamp

---

## Functional Requirements

### FR-A: Event Collection

- The system SHALL connect to Gmail via IMAP using App Password authentication
- The system SHALL fetch emails from INBOX only
- The system SHALL save raw email content to `data/emails-to-parse/{message-id}.eml`
- The system SHALL track processed emails in `data/processed-emails.json`
- The system SHALL support newsletter format definitions in `config/newsletter-formats.json`
- The system SHALL timeout after 60 seconds per IMAP operation
- The system SHALL retry failed connections 3 times with exponential backoff

### FR-B: Data Quality Gates

- The system SHALL maintain venue whitelist in `config/athens-venues.json`
- The system SHALL maintain location blacklist in `config/rejected-locations.json`
- The system SHALL check location BEFORE inserting into database
- The system SHALL normalize titles for deduplication (remove quotes, collapse spaces, lowercase)
- The system SHALL add `location_status` column with values:
  - `'verified_athens'` — Known Athens venue
  - `'pass_through'` — Not a real venue but allowed on site (e.g., "Πολλαπλοί Χώροι")
  - `'unverified'` — Unknown venue, needs review
  - `'rejected_non_athens'` — Non-Athens location
  - `'problematic'` — Generic/invalid venue entry
- The system SHALL display `verified_athens` and `pass_through` events on site
- The system SHALL auto-merge venue variations to canonical names (e.g., "Gazarte - Ground Stage" → "Gazarte")
- The system SHALL log all rejections with reason

### FR-C: Enrichment Workflow

- The system SHALL add `needs_enrichment` boolean column (default: true for new events)
- The system SHALL add `enriched_at` timestamp column
- The system SHALL provide `scripts/list-unenriched.ts` for queue inspection
- The system SHALL use Claude Code tool_agent for description generation
- The system SHALL validate descriptions: 150-300 words, required structure elements
- The system SHALL rate-limit enrichment (2 second pause between events)

### FR-D: Automated Deployment

- The system SHALL provide `scripts/daily-automated.sh` for launchd
- The system SHALL generate site with `bun run build` (no AI required)
- The system SHALL commit and push automatically after generation
- The system SHALL track pipeline state in `data/pipeline-state.json`
- The system SHALL support `--force` flag to re-run regardless of state

---

## Non-Functional Requirements

### Performance

- Email ingestion SHALL complete within 5 minutes for up to 50 emails
- Location filtering SHALL add less than 10ms per event
- Site generation SHALL complete within 30 seconds for up to 500 events

### Reliability

- Pipeline SHALL continue on individual item failures (log and skip)
- State files SHALL be written atomically (write to temp, rename)
- launchd SHALL catch up on missed runs when machine wakes

### Accuracy

- Zero false negatives: No Athens event incorrectly rejected
- Minimal false positives: <1% non-Athens events on site
- No duplicate events on generated site

---

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Event | Cultural event | id, title, date, venue, type, price, description, needs_enrichment, enriched_at, location_status, source |
| ProcessedEmail | Ingested email tracking | message_id, processed_at, event_count, status |
| AthensVenue | Verified Athens venue | canonical_name, variations[], neighborhood |
| RejectedLocation | Non-Athens location | name_greek, name_latin, type |
| PipelineState | Daily run tracking | date, phases_completed, counts, errors |

---

## Data Model

### Event (Extended)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | TEXT | — | Normalized hash of title+date+venue |
| title | TEXT | — | Event title |
| date | TEXT | — | ISO 8601 date |
| venue | TEXT | — | Venue name |
| location_status | TEXT | 'unverified' | verified_athens / unverified / rejected_non_athens |
| needs_enrichment | INTEGER | 1 | 1=needs, 0=done |
| enriched_at | TEXT | null | ISO 8601 timestamp |
| source | TEXT | 'manual' | email / scrape / manual |
| full_description | TEXT | null | AI-generated description |

### Config Files

**config/athens-venues.json** — Whitelist of verified Athens venues with name variations

**config/rejected-locations.json** — Blacklist of non-Athens cities and regions

**config/newsletter-formats.json** — Parsing rules for known newsletters

---

## Constraints

- MUST operate within Claude Max subscription (zero external API calls)
- MUST NOT reject any event from a verified Athens venue
- MUST NOT require internet access for filtering (local JSON files)
- MUST be backwards compatible with existing events
- MUST run on macOS with launchd (MacBook Air)

---

## Assumptions

- Gmail App Password is configured in `.env`
- Newsletter subscriptions are active
- Athens venues can be comprehensively catalogued
- Non-Athens events typically mention their city in title or venue
- MacBook is opened at least once daily (launchd catches up)

---

## Out of Scope

- Multi-city support (Athens only, but architecture supports replication)
- Web UI for event management
- Real-time updates (daily batch only)
- Geocoding or map display
- User authentication

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily automation success | >95% | Days with successful auto-deploy |
| Location filter accuracy | >99% | Athens events correctly classified |
| Duplicate rate | <1% | Duplicate events on live site |
| Enrichment coverage | >80% | Events with AI descriptions |
| Zero external API costs | $0/month | No Anthropic/OpenAI billing |

---

## Open Questions

1. **Initial venue whitelist:** How comprehensive should it be at launch?
   - Recommendation: Extract from current database, research top 50 venues

2. **Unverified event display:** Should unverified events show on site with a flag, or be hidden entirely?
   - Current decision: Hidden (conservative)

3. **Generic title handling:** Auto-skip "RELEASE ATHENS 2026" if specific exists, or manual review?
   - Recommendation: Auto-skip with logging

---

*Specification complete. Ready for plan and tasks.*
