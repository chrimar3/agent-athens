# agent-athens Spec-Kit Documents

Spec-Driven Development (SDD) documentation for agent-athens.

---

## Document Structure

```
agent-athens-speckit/
├── README.md                      # This file
├── constitution.md                # Project governance (13 articles)
└── specs/
    └── 001-data-pipeline/
        ├── spec.md                # WHAT: Requirements (Parts A-D)
        ├── plan.md                # HOW: Architecture & technology
        └── tasks.md               # WORK: 40 TDD-ordered tasks
```

---

## The Spec: Data Pipeline & Quality

**One unified spec covering the complete data flow:**

| Part | Scope |
|------|-------|
| **A: Event Collection** | Email ingestion, web scraping, rule-based parsing |
| **B: Data Quality Gates** | Athens location filtering, deduplication |
| **C: Enrichment Workflow** | AI description generation (Claude Code sessions) |
| **D: Automated Deployment** | launchd automation, site generation, Netlify |

**Key architecture:**
- **Fully automated daily:** Collection → Quality gates → Site gen → Deploy
- **Human-triggered periodic:** AI enrichment → Rebuild → Deploy

Events appear on site daily with or without AI descriptions. Enrichment is an enhancement, not a blocker.

---

## Quick Start

### 1. Copy to Your Repository

```bash
# From your agent-athens repo root
mkdir -p .specify/memory specs

cp constitution.md .specify/memory/constitution.md
cp -r specs/001-data-pipeline specs/
```

### 2. Understand the Constitution

Read `.specify/memory/constitution.md` — 13 articles governing:
- Zero external API costs (Claude Max subscription only)
- launchd for automation (catches up after sleep)
- Athens-only events (Attica region)
- Content-focused descriptions (150-300 words)
- TDD required

### 3. Work Through Tasks

`specs/001-data-pipeline/tasks.md` contains 40 tasks across 7 phases (~19.5 hours):

| Phase | Focus |
|-------|-------|
| 1 | Database foundation |
| 2 | Quality gates (location + dedup) |
| 3 | Email ingestion |
| 4 | Email parsing |
| 5 | Enrichment workflow |
| 6 | Orchestration & automation |
| 7 | Integration & docs |

---

## Using in Claude Code

### Session Start

```
You: claude

You: Working on agent-athens. Check constitution at .specify/memory/constitution.md 
     and current spec at specs/001-data-pipeline/
```

### Task Execution

```
You: Let's work on Task 2.1 - Location Filter Test. Create the test file.

[Claude Code creates tests/quality/location-filter.test.ts]

You: Now implement Task 2.2 to make those tests pass.

[Claude Code implements src/quality/location-filter.ts]

You: Run the tests.

[Claude Code: bun test tests/quality/location-filter.test.ts]
```

### Daily Enrichment Session

After automated pipeline runs (launchd at 8 AM):

```
You: Show me events needing enrichment.

[Claude Code: bun run scripts/list-unenriched.ts]

You: Enrich all pending events, then rebuild and deploy.
```

---

## Constitution Summary

| Article | Topic |
|---------|-------|
| I | Cost & inference (Claude Max only) |
| II | Technology (Bun, TypeScript, SQLite, launchd) |
| III | Architecture patterns |
| IV | Data standards (dedup, descriptions, dates) |
| V | Code organization |
| VI | Testing mandate (TDD) |
| VII | Error handling |
| VIII | Security |
| IX | SEO/GEO standards |
| X | Multi-city replicability |
| XI | Git & deployment |
| XII | Claude Code session protocol |
| XIII | Athens location filtering |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Daily automation success | >95% |
| Location filter accuracy | >99% |
| Duplicate rate | <1% |
| Enrichment coverage | >80% |
| External API costs | $0/month |

---

*Generated for agent-athens, 2025-01-20*

---

## Quick Start

### 1. Copy to Your Repository

```bash
# From your agent-athens repo root
mkdir -p .specify/memory
mkdir -p specs

cp /path/to/constitution.md .specify/memory/constitution.md
cp -r /path/to/specs/* specs/
```

### 2. Understand the Constitution

Read `.specify/memory/constitution.md` first. It defines:
- Zero API cost mandate (subscription only)
- Technology stack (Bun, TypeScript, SQLite)
- Architecture patterns
- Testing requirements
- Multi-city replicability

**Every Claude Code session should reference this document.**

### 3. Review the Feature Specification

Read `specs/001-email-enrichment-pipeline/spec.md`:
- User stories with acceptance criteria
- Functional requirements
- Constraints and assumptions
- Success metrics

### 4. Review the Technical Plan

Read `specs/001-email-enrichment-pipeline/plan.md`:
- Architecture diagrams
- Technology decisions
- Data model extensions
- API contracts
- Error handling strategy

### 5. Execute Tasks

Work through `specs/001-email-enrichment-pipeline/tasks.md`:
- TDD-ordered (tests before implementation)
- 29 tasks across 6 phases
- ~14.5 hours estimated
- Parallelization marked with `[P]`

---

## Using in Claude Code

### Session Start

```
You: claude
Claude Code: Ready.

You: I'm working on agent-athens. Check the constitution at .specify/memory/constitution.md and the current feature at specs/001-email-enrichment-pipeline/
```

### Working on Tasks

```
You: Let's start Task 1.1 - Migration Test Setup. Create the test file.

[Claude Code creates tests/db/migrations.test.ts]

You: Now implement Task 1.2 to make those tests pass.

[Claude Code creates migration and updates database.ts]

You: Run the tests.

[Claude Code: bun test tests/db/migrations.test.ts]
```

### Context Management

After completing a phase:

```
You: /clear

You: Continue with Phase 2 - Email Ingestion. Reference the constitution and tasks.md.
```

### Daily Pipeline

After automated collection runs (cron at 8 AM):

```
You: Run the daily enrichment session. Process all pending events, generate site, and deploy.
```

---

## Key Principles

### From Constitution

1. **Zero API Costs** — All AI via Claude Code tool_agent
2. **Automated + Manual Split** — Collection automated, enrichment human-triggered
3. **TDD Required** — Tests before implementation
4. **Single City, Replicable** — Athens-focused, but architecture supports other cities

### From Spec-Kit Methodology

1. **Specification First** — Define WHAT before HOW
2. **Phase Gates** — Complete each phase before moving on
3. **Explicit Contracts** — APIs and data models documented
4. **Traceable Tasks** — Every task ties to requirements

---

## Confidence Markers

| Marker | Meaning |
|--------|---------|
| **[DOCUMENTED]** | From GitHub spec-kit docs or your existing code |
| **[PROVEN]** | Community-validated approach |
| **[LOGICAL]** | Reasonable extension of documented patterns |
| **[EXPERIMENTAL]** | Untested, proceed with caution |

These documents primarily use **[DOCUMENTED]** (from your existing README/codebase) and **[LOGICAL]** (extensions that follow SDD principles).

---

## Amendment Process

If you need to change the constitution:

1. Propose the change with rationale
2. Update the Amendment Log at the bottom
3. Increment version number
4. Communicate to team (if applicable)

---

## Next Steps

1. ✅ Constitution created
2. ✅ Feature 001 specified (email ingestion + enrichment)
3. ⬜ Copy documents to repo
4. ⬜ Run database migration (Task 1.2)
5. ⬜ Work through tasks in order
6. ⬜ Deploy completed feature

---

## Questions?

If something in these documents is unclear or conflicts with your vision:

1. The spec can be updated before implementation
2. The plan can be revised if better approaches emerge
3. Tasks can be reordered if dependencies change

**The documents serve the project, not the other way around.**

---

*Generated by spec-kit navigation for agent-athens, 2025-01-20*
