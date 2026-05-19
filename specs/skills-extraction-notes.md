# Skills Extraction Notes

> **Pre-execution corrections + findings (2026-05-18, during plan mode):**
>
> A working brief landed proposing five infrastructure steps: diagnose duplicate `claude-code-mastery` skill, move this document to its authoritative home, commit it to the AA repo, symlink it from `~/.claude/notes/`, then clean up the working plan file. Read-only verification (Step 0 + Step 1 of the brief) ran in plan mode and surfaced three premise issues that must be applied before execution proceeds:
>
> 1. **AA repo path** — brief used `/Users/chrism/agent-athens/`. That path does not exist. Canonical path is `/Users/chrism/Project with Claude/AgentAthens/agent-athens/` (per persistent memory, verified by `ls`). All five steps in the brief must substitute the long path. Steps 2–5 would fail at execution otherwise.
> 2. **`claude-code-mastery` duplication is Case B/C, not Case A** — diff between user-scope (`~/.claude/skills/claude-code-mastery/SKILL.md`, 16,058 bytes) and AA-scope (`<AA>/.claude/skills/claude-code-mastery/SKILL.md`, 17,101 bytes) produced 1,616 lines of differences. Captured at `/tmp/claude-code-mastery-diff.txt`. Inspection of the first 60 lines confirms AA-scope is a **later, edited version** (adds "agent teams", "plugins", "context management", "compaction strategy", "session architecture" to triggers; introduces new "Context Management — The First-Class Concern" section; tightens prose throughout). The brief's Case A handler (`rm -rf` the AA-scope copy) would **discard the newer content**. Recommended resolutions, listed for Christos's decision (no auto-action):
>    - **(a) Promote AA-scope → user-scope**: copy AA-scope `SKILL.md` and `references/` over user-scope; delete AA-scope directory. Single source at user-level. Implicit workflow signal: edits happen in AA repo, user-scope is the "published" copy.
>    - **(b) Rename AA-scope to `aa-claude-code-mastery/`**: both skills coexist with distinct `name:` slugs. Avoids name collision at the loader level. Honest about the AA-augmented version being a separate skill.
>    - **(c) Defer entirely**: leave the duplication alone for this session, address in a separate skill-housekeeping session.
> 3. **`~/.claude/notes/` does not exist** — brief's Step 4 `mkdir -p` handles this correctly. Brief's "may already hold institutional-memory files for other projects" caveat is moot; the directory will be created fresh by this session.
>
> **Corrected execution sequence (post-ExitPlanMode):**
>
> - **Step 2** — `cp ~/.claude/plans/skills-extraction-notes-twinkling-willow.md "/Users/chrism/Project with Claude/AgentAthens/agent-athens/specs/skills-extraction-notes.md"` then verify with `diff`.
> - **Step 3** — `cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens" && git add specs/skills-extraction-notes.md && git diff --cached --stat && git commit -m "<as-briefed>"`. Verify staged surface contains only `specs/skills-extraction-notes.md`.
> - **Step 4** — `mkdir -p ~/.claude/notes/ && ln -sf "/Users/chrism/Project with Claude/AgentAthens/agent-athens/specs/skills-extraction-notes.md" ~/.claude/notes/skills-extraction-notes.md`. Verify with `test -L` + `head -5`.
> - **Step 5** (optional cleanup) — `rm ~/.claude/plans/skills-extraction-notes-twinkling-willow.md`. Only after Steps 2–4 verified.
> - **Skill duplication** — held for Christos's decision (a/b/c above). No deletion, no rename, no merge in this session unless explicitly approved.
>
> **Post-session notes to record** (`<AA>/.claude/notes/decisions.md`):
> - This document's authoritative location decision (single source at `<AA>/specs/`, convenience symlink at `~/.claude/notes/`)
> - `claude-code-mastery` resolution outcome (whichever path Christos picks; defer if undecided)
> - Pattern entry candidate (`patterns.md`): "AA repo holds the working copy of skills under active editing; user-scope copies systematically rot." Conditional on observing the pattern more than once.
>
> ---

> **Purpose:** Source-of-truth document for authoring generic Claude Code skills extracted from Agent Athens methodology. Captures pattern, triggers, parameterization, and verification for each candidate **before** any SKILL.md is written. Without this document, extracted skills risk over-specifying (secretly assuming Bun/SQLite/Netlify) or under-specifying (so abstract they never trigger).
>
> **Owner:** Dev Planner. **Status:** Draft 1 + verification pass, pending Christos review. **Consumers:** Future skill-authoring sessions, one per candidate.

---

## Context

After ~100 Agent Athens sessions across enrichment, deploy, scheduling, and architectural work, four reusable disciplines have emerged that recur across project contexts but are currently encoded only as ad-hoc reminders, CLAUDE.md prose, and personal habit. The cost of leaving them un-skilled is: every new project re-discovers the same five-defense scheduled-automation pattern, every brief-consuming session re-litigates whether to verify premises, every shotgun-surgery rename leaves stragglers that surface in production weeks later.

This document is the *spec* for four candidate skills — not the skills themselves. Its job is to (a) lock the meta-pattern of each, (b) call out exactly which Agent-Athens-specific content must be stripped before extraction, (c) enumerate the parameterization surface, and (d) define how we'll know each skill earns its keep after it ships. Subsequent sessions author one SKILL.md at a time against this spec.

**Deliverable of this plan:** the document you are reading. No skill authoring this session.

---

## Verification Findings (pre-draft, 2026-05-18)

Before drafting, two `Explore` agents verified the assumptions this document depends on. Findings:

| # | Premise | Result |
|---|---------|--------|
| 1 | `~/.claude/skills/` exists with prior user-level skills | **Confirmed.** Contains `claude-code-mastery/` only — your four candidates 5x the surface area. Watch for trigger-collision once shipped. |
| 2 | Skill frontmatter convention | **Confirmed.** `name: <slug>` + multi-line `description: \|` (no separate `triggers:` field). Triggers embedded in description prose. Plugin skills layer `user-invocable` and `allowed-tools`; user-level skills omit these. |
| 3 | AA `.claude/skills/` exists (Tier A is live, not hypothetical) | **Confirmed.** Contains `claude-code-mastery/` (same as user-level). Tier A directory is real and writable. |
| 4 | Deploy command `netlify deploy --prod --dir=dist`, no auto-deploy on `git push` | **Confirmed.** Located in `package.json` line 10. Patterns log explicitly notes "commit + push" does not deploy. |
| 5 | `MAX_BATCHES=2` in `scripts/auto-enrich.sh` | **Confirmed.** Line 40. |
| 6 | Tier 1 admission union `"open" \| "with-ticket"` | **Stale.** Actual field is `price`, not `admission`, with **three** values: `'open' \| 'with-ticket' \| 'donation'` (`src/types.ts` lines 107–108). Corrected in §Two-Tier Classification below. Exhibition `end_date` field confirmed in `src/db/database.ts`. |
| 7 | Institutional-memory files exist | **Confirmed at corrected path.** Located at `.claude/notes/mistakes.md` (656 lines), `patterns.md` (4,883 lines), `decisions.md` (3,960 lines). Original draft implied repo root — corrected to `.claude/notes/` in §Candidate 3. The 4,883-line `patterns.md` is load-bearing for Candidate 3's "known territory" detector design — see open authoring question there. |

This pre-draft check is itself an instance of Candidate 1 (`pre-brief-verification`) operating on the brief that produced this document. The premise-mismatch in row 6 is exactly the failure mode that skill is designed to prevent.

---

## Two-Tier Classification

**Tier A — project-scoped** (`agent-athens/.claude/skills/`): Skills whose *facts* are Agent-Athens-specific. The meta-pattern transfers but the content doesn't. These ship with the repo, version with the codebase, don't extract.

- `aa-deploy-discipline` — `netlify deploy --prod --dir=dist`, never `git push`
- `aa-tier1-rules` — `price: "open" | "with-ticket" | "donation"` (verified 2026-05-18, three values), exhibition `end_date`, Greek μ.μ./π.μ., `Europe/Athens`
- `aa-enrichment-batch` — Pattern B verbatim, manifest contract, banned-phrases loader, subagent group ceiling
- `aa-geo-schema` — Schema.org rules specific to AA's emitter (Sprint 1/3 closure decisions, microdata expectations)

**Tier B — user-wide** (`~/.claude/skills/`): Methodology distilled from 100+ AA sessions that transfers to any project. **These are the four extractions this document specifies.**

---

## Tier B Candidate 1: `pre-brief-verification`

### Pattern (2 sentences)

Before acting on any brief that prescribes specific edit targets, verify each premise against current state — grep that the target exists, execution-probe that the claimed defect still holds, ground every verification command in observed evidence, not inference. The cost of verification is paid once by the planner; the cost of skipping it is paid by the executor on stale-premise work that returns wrong-surface and burns the session.

### Trigger conditions

- Brief or session plan that names specific edit targets: file paths, function names, table columns, config keys, emission strings
- Brief contains current-state claims of the form "X doesn't emit Y" / "Z is silent" / "W is missing" / "X is partially shipped"
- Brief defers work based on absence-of-X or partial-state-of-X
- Brief consumes an inventory item captured in a previous session (cross-session staleness risk; rule: re-verify at consumption time, not capture time)
- Phrase signals: "fix X in Y", "the broken Z", "this needs", "the missing", "we still don't have"

### Agent-Athens specifics to strip

- References to specific AA projects (GEO Strategist, Editorial Director, Enrichment Writer, etc.) → replace with neutral "upstream brief author"
- May 8 bilingual-subset historical example → replace with abstract example (e.g., "feature X was assumed dormant; execution-probe showed it was live")
- "Pre-S135" recurrence ledger reference → drop, or replace with generic "track verification-failure recurrences"
- Pattern A / Pattern B as named references → describe the pattern without the AA-internal label
- Specific AA file paths (`src/utils/...`, `specs/audit-2026-05-12.md`) → replace with neutral placeholders

### Parameterization surface

- **Search roots** (default: auto-detect from project structure — `src/`, `lib/`, `app/`, `internal/`)
- **Build artifact dir** (default: auto-detect — `dist/`, `build/`, `out/`, `_site/`, `target/`)
- **Verification command templates** with language-agnostic placeholders for the grep/probe/query
- **Cross-session staleness threshold** (default: re-verify any item captured >24h ago at consumption time)

### Verification (does this skill earn its keep?)

Track a recurrence ledger per-project: count of verify-the-premise failures (wrong edit surface, stale premise, unrunnable verification command). Skill is working if the count plateaus or drops after introduction. If it climbs, the skill needs trigger-tuning or escalation beyond skill-level (planner-side enforcement).

### Open authoring questions

- Should the skill block execution until verification completes, or just surface findings? (Lean: surface findings as a structured report; let the executor halt itself if findings are red.)
- How does the skill handle briefs where the executor *cannot* verify a premise (e.g., requires external service access)? Need explicit escape valve.

---

## Tier B Candidate 2: `shotgun-surgery-protocol`

### Pattern (2 sentences)

When changing a value, type, or term that appears across multiple files and layers, enumerate every location first via grep across source + tests + config + docs, modify the complete set in a single pass, then verify zero stragglers in the build artifact and run the full test suite. Partial migration is worse than no migration — a half-renamed enum is a latent bug across every code path that touches it.

### Trigger conditions

- Task language: "rename", "deprecate", "change term", "migrate field", "replace X with Y", "switch from X to Y", "remove the old"
- Touching enum values, type aliases, union types, discriminator strings
- Removing or renaming feature flags
- Changing strings that appear in templates, validation, tests, error messages, docs, user-facing UI
- API surface changes (parameter rename, response field rename)

### Agent-Athens specifics to strip

- Specific price-term migration example ("Δωρεάν" → "Ελεύθερη είσοδος") → replace with generic enum-rename example
- Specific Greek-language strings
- Hardcoded file inventory ("types.ts, 2 categorizers, config JSON, filter-bar, enrichment types, 6 test files") → describe the *categories* of locations to check, not the specific files
- AA's specific event-type / price-type unions → use abstract "discriminated union" examples

### Parameterization surface

- **Search roots** (default: project-detected)
- **Build/output dir for verification grep** (default: project-detected)
- **File extensions to search** (default: language-detected — `*.ts`, `*.js`, `*.py`, `*.rs`, `*.go`, etc.)
- **Categories to include** (default: source + tests + config + docs + templates; user can narrow)
- **Stragglers tolerated in build artifact** (default: 0 — if the term is intentionally kept in changelog/migration notes, allowlist explicitly)

### Verification (does this skill earn its keep?)

- `grep -rn '<old-term>' <build-output>/` returns 0 (or only allowlisted matches)
- Full test suite passes
- Type-check passes (for typed languages)
- Optional follow-up: search for *related* stragglers — UI text variants, plural forms, translations, log lines, telemetry event names

### Open authoring questions

- Should the skill propose the grep query, or run it directly? (Lean: propose, let executor run, surface results — skill stays advisory.)
- How aggressive should "related stragglers" search be? Risk of false-positive noise. Start conservative.

---

## Tier B Candidate 3: `post-session-institutional-memory`

### Pattern (2 sentences)

Every session ends by writing to three append-only files — bugs found, patterns discovered, decisions made — with date-stamped entries and no retroactive compression of older entries. If you find yourself solving the same problem a third time, the documentation is the bug, not the code.

### Trigger conditions

- End-of-session signals: "we're done", "commit and deploy", "wrap up", "ship it", "finalize"
- After fix sessions that revealed a non-trivial bug
- After architectural decisions (choosing one pattern over another, locking an API shape)
- After discovering a pattern that recurs across multiple instances
- Before context-window handoff to a fresh session

### Agent-Athens specifics to strip

- Specific AA file names are actually fine to keep as defaults (`mistakes.md`, `patterns.md`, `decisions.md` at `.claude/notes/` — verified path) — but the *content structure* assumed in each must not encode AA conventions
- Session-log.md format specifics (Plan / What happened / Surprises / Learnings / Open items) — describe the *shape* of a good entry without prescribing AA's exact headers
- "Session N" numbering convention → make optional, projects may prefer dates or git SHAs

### Parameterization surface

- **File names/paths** for the three files (defaults: `mistakes.md`, `patterns.md`, `decisions.md` in `.claude/notes/` or equivalent)
- **Date/ID format** (default: ISO date + optional session identifier)
- **Required fields per entry type** (configurable; sensible defaults supplied)
- **Append-only enforcement** (skill warns if existing entries are modified, not just appended)

### Verification (does this skill earn its keep?)

- All three files updated this session, OR the agent explicitly acknowledged no relevant updates needed (no silent skip)
- Periodic audit (quarterly): "When did each of these files last prevent a mistake or save time?" If no quick answer for any of the three → that file is documentation theater, archive or restructure
- Cross-session check: a bug that appears in `mistakes.md` should not recur in a later session without the skill surfacing the prior entry

### Open authoring questions

- Should the skill *read* the existing files before each session start (for context) or only *write* to them at session end? (Lean: both — read on entry to known territory, write on exit.)
- How does the skill detect "known territory" cheaply without loading the whole institutional-memory corpus into context every session? **Sharpened by verification:** AA's `patterns.md` is 4,883 lines and `decisions.md` is 3,960 lines. Naive "read both on session start" is not free. Candidate approaches: (a) maintain a short auto-generated index (`patterns-index.md`, one line per pattern with anchor link), (b) grep against the corpus on-demand keyed by the user's first prompt, (c) section-anchor convention so the skill loads only the relevant section. Decide during authoring.

---

## Tier B Candidate 4: `scheduled-automation-discipline`

### Pattern (2 sentences)

Any scheduled CLI process — cron, launchd, systemd, Windows Task Scheduler — needs five layered defenses: minimal-PATH inheritance from the scheduler, lock file with mtime guard for stuck-process recovery, watchdog with exit-code capture for timeout enforcement, precise orphan cleanup using PPID and command signature, and testing via the actual scheduler invocation rather than interactive shell. Skipping any one of these creates a failure mode that only surfaces in production, often days or weeks after deploy.

### Trigger conditions

- File extensions / paths: `.plist`, `.service`, `.timer`, crontab edits, scheduled-task XML
- Setting up new scheduled jobs
- Debugging scheduled job failures (especially "works interactively, fails when scheduled")
- Phrase signals: "scheduled task", "cron job", "background job", "scheduled run", "nightly job", "launchd", "systemd timer"
- Adding watchdog / timeout / lock logic to existing automation

### Agent-Athens specifics to strip

- `caffeinate -s` (macOS-specific) → mention as one example of platform-specific power-management defense; generalize to "platform-appropriate wake/lid-close defense"
- `pmset -g log` (macOS-specific) → mention as the macOS forensic tool; provide Linux (`journalctl`) and Windows equivalents
- AA-specific scripts (`auto-enrich.sh`) and AA-specific failure stories (S69 → S69c) → describe the *shape* of the failure, not the specific incident
- launchd-only terminology → write scheduler-agnostic with platform-specific examples in collapsible sections

### Parameterization surface

- **Scheduler type** (auto-detected from file path / extension; supports launchd, systemd, cron, Windows Task Scheduler)
- **CLI being invoked** (any — skill provides defense patterns, not the CLI itself)
- **Lock file path** (sensible platform default)
- **Watchdog timeout** (no default — must be specified per-job; skill surfaces if missing)
- **Orphan cleanup gates** (default: PPID=init/launchd + command signature match + not-interactive)

### Verification (does this skill earn its keep?)

- Test via actual scheduler invocation, not interactive shell — `launchctl start`, `systemctl start --user`, `crontab -e` followed by manual time-trigger, or Windows Task Scheduler "Run" button
- Confirm: process runs to completion, exits cleanly, lock file released, no orphans remain
- Negative test: kill mid-run, verify lock recovers via mtime guard within N hours
- Production: zero "stuck job" incidents per month after introduction

### Open authoring questions

- Cross-platform examples bloat the skill body. Should the skill be one file with collapsible platform sections, or three sibling skills (`scheduled-automation-macos`, `-linux`, `-windows`)? (Lean: one file — the *discipline* is shared, only the syntax differs, and Christos's reuse is initially macOS-only.)
- Does the skill assume the user has a watchdog / timeout pattern, or does it provide a reference implementation? (Lean: provide a reference shell snippet for bash watchdog as the canonical pattern, since this is the AA-validated one.)

---

## Trigger-Tuning Notes

Skills don't fire reliably on the first try. The frontmatter `description` field is what Claude pattern-matches against, and getting it specific enough to fire on the right work but generic enough to fire across project contexts is genuinely difficult. **Budget two rounds of tuning per skill.** First version typically either misfires (fires on unrelated tasks) or undertriggers (silent on tasks where it should fire).

**Frontmatter shape (confirmed during verification):** user-level skills use `name: <slug>` + multi-line `description: |` block; no separate `triggers:` field — trigger phrases live inside the description prose. Author all four skills against this shape; resist inventing new fields.

**Tuning protocol:**

1. Author skill with initial trigger description
2. Run on 3 representative sessions across different project contexts
3. Log: did it fire? Should it have? Did it fire when it shouldn't have?
4. Adjust description; repeat once
5. If round 2 still misfires or undertriggers → the *pattern* is wrong, not the trigger — revisit the extraction

**Anti-pattern:** stuffing the description with every conceivable trigger phrase. This produces a skill that fires constantly and gets ignored. Better: 3–5 strong, distinctive phrases plus a clear category description.

**Collision risk:** there is currently one existing user-level skill (`claude-code-mastery`). Adding four candidates 5x the surface area. Watch for multiple-skill-fires on the same prompt during tuning rounds 2–3; if it happens, narrow the descriptions.

---

## Decision Register

Locked-in:
- Two-tier classification (Tier A repo-scoped, Tier B user-wide) is correct as a starting structure.
- Frontmatter shape: `name:` + multi-line `description:`, no `triggers:` field (verified against existing user-level skill).
- Candidate 3 default institutional-memory path is `.claude/notes/` (verified against AA layout), not repo root.

Open:
- **Build order:** one skill end-to-end first, or four in parallel? (Lean: one first — `pre-brief-verification`, highest leverage and clearest verification step. Validate trigger-fires-correctly across two project contexts before scaling.)
- **Skill location:** user-wide `~/.claude/skills/` for all four Tier B skills? Or some at user level and some at project level with symlinks? (Lean: all user-wide for the four candidates; they are by definition project-agnostic.)
- **Naming convention:** `pre-brief-verification` vs `verify-brief-premises` vs `brief-verification-checklist`? Trigger-fire performance may depend on the slug. To be tested.
- **CLAUDE.md migration:** once Tier B skills are live and validated, audit CLAUDE.md for content that can move into skills, reducing the always-loaded token cost. Separate session, not in scope here.

---

## Next Step (Recommended)

Single session, Pattern G shape:

1. Read this document
2. Author `pre-brief-verification` SKILL.md (only)
3. Place at `~/.claude/skills/pre-brief-verification/SKILL.md`
4. Validate: trigger fires correctly on next Agent Athens session that consumes a brief with edit targets
5. Validate: trigger fires correctly on at least one non-Agent-Athens project context
6. Post-session: update this document with trigger-tuning learnings; queue next skill if validation passes

If validation fails: revisit the Pattern section in candidate 1 of this document. The skill body inherits the pattern's correctness — if the pattern is wrong, the skill is unfixable.

---

## Verification of This Plan's Deliverable

This plan's execution is complete when:

- File exists at `/Users/chrism/.claude/plans/skills-extraction-notes-twinkling-willow.md`
- Document contains: Context, Verification Findings, Two-Tier Classification, four Candidate sections, Trigger-Tuning Notes, Decision Register, Next Step
- Tier A example in Two-Tier Classification reflects verified union shape (`price: "open" | "with-ticket" | "donation"`)
- Candidate 3 default path is `.claude/notes/`
- Frontmatter convention note (no `triggers:` field) is captured in Trigger-Tuning Notes

No code is changed, no skills are authored. The next session reads this file and produces `~/.claude/skills/pre-brief-verification/SKILL.md` against it.
