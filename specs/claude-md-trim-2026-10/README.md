# Proposal: trim the instruction files and fix the ledger pointer (2026-10-27)

**Status: applied by the owner's instruction on 2026-10-28 and pushed on `claude/input-pipeline-phase1-2` as `4595e48ab`. That commit calls it Session 236; it was renumbered Session 237 when `main`'s own Session 236 (MCP server) was merged in. The parent `CLAUDE.md` is outside this repo and not under version control.** Installed: both drafts, the `.claude/worker.md:6` pointer, and `AGENTS.md` as a symlink. Not applied: the optional pre-check command rewording. The originals git cannot restore are `parent-CLAUDE.original.md` and `AGENTS.original.md` in this folder; the project file's original is in git (`git show HEAD:.claude/CLAUDE.md`). `.claude/CLAUDE.md` and `.claude/worker.md` are protected paths (`.github/path-guard.json`): a PR that touches them fails the `path-guard` check by design and needs the owner's review.

## The problem this fixes

The CLAUDE.md files were not the main cost. The pointer inside them was: "Anything → `.claude/notes/ledger.md` § Mistakes ← START HERE" and "Ground every session in `.claude/notes/ledger.md`". At the time of writing that file is about 189,000 words (Mistakes alone about 49,000). A session either ignores the instruction or spends its context reading history instead of working.

The fix: read the newest Mistakes entries every session, and **search** the rest by area. New Mistakes entries are added at the top, so the newest lessons sit between `# Mistakes` and the first old topical heading, `## Database`:

```bash
sed -n '/^# Mistakes/,/^## Database/p' .claude/notes/ledger.md       # every session
grep -n '^## ' .claude/notes/ledger.md | grep -i venue                  # area work
```

When this was written, the first command returned 93 lines (about 2,240 words). The boundary `## Database` is an old entry, and old entries are never rewritten, so it stays put. The block above it grows as entries are added; if it gets large, that is a decision for the owner, not something to compress silently.

## Files

| Proposed file | Replaces | Words (live → proposed) |
|---|---|---|
| `project-CLAUDE.proposed.md` | `.claude/CLAUDE.md` | 1,072 → 1,119 |
| `parent-CLAUDE.proposed.md` | `../../CLAUDE.md` (`Project with Claude/CLAUDE.md`) | 972 → 497 |

The project file barely changes in size because it is mostly project facts, which are worth keeping. It grows slightly because the ledger section explains how to use the ledger.

### Project file — what changed

- **Ledger pointer** replaced as above. The three reference-table rows (Anything / Code changes / Architecture → ledger sections) are merged into one row pointing at the search instructions.
- **"Claude Code is interactive — no API module"** is reworded as "the coding agent (Claude Code, Codex) IS the AI". It is the only line that differed in wording between `CLAUDE.md` and `AGENTS.md`, so after this change `AGENTS.md` can be the same file (see below).
- **Tone:** "🚨 TIER 1 RULES (These cause bugs — memorize them)" becomes "Rules that have caused bugs here", plus one sentence on why they exist. The rules themselves are unchanged. Recent models follow instructions literally, and alarm-style emphasis tends to make them apply a rule where it doesn't fit.
- **Agent rules:** dropped "Think before coding" and "Goal-driven — restate every task as a passing check" as general method the model already follows (the parent file still covers verification). Kept, in plainer words: shared templates ship site-wide, scripts exit non-zero with a next step, tests always in scope, protected paths, scraped text is evidence.
- **ARIA audit:** two command lines merged into one with `[--full]`.
- **Unchanged:** every rule, the data model, the location filter, all other commands, the after-session logging duties, the institutional-memory rule.

### Parent file — what changed

Kept: the no-stack-assumptions header and the reason for it; the verification standard; test-first; the two earned lessons (mutation run proves a guard; vacuous fixtures); the subagent rules, including the `agentType` gotcha; record honesty; git rules; communicating.

Cut: the UNDERSTAND→SHIP loop diagram and its phase definitions, the "Iron Law" framing and "rationalisation" lecture, "claiming done without checking is dishonesty", "batch independent tool calls" (the harness already says this), and skill-name plugs. These describe how a capable model already works, and the absolute wording invites applying them where they don't fit.

## Other places that point at the ledger (also protected)

- `.claude/worker.md:6` — "Ground: read `.claude/notes/ledger.md` before writing anything." Proposed: "Ground: read the newest entries at the top of `.claude/notes/ledger.md` § Mistakes, then search the ledger by heading for the area you are touching (see `.claude/CLAUDE.md`, 'The ledger — search it, don't read it')."
- `.claude/commands/pre-{scrape,enrich,venue}-check.md` — already name the relevant sections ("especially Venue Matching section"), which is the right shape. Optional: change "Read § Mistakes" to "Search § Mistakes by heading for …" so nobody reads all 49,000 words.

## AGENTS.md — already drifted, and one drift is unsafe

`AGENTS.md` (untracked, created 2026-09-25 for Codex) is a hand-made copy of `.claude/CLAUDE.md` and has already fallen behind. Most importantly, it documents `bun test && git push origin main`. A bare `bun test` also runs test files planted in container-written folders, which is exactly what `tests/security/test-discovery.test.ts` forbids CLAUDE.md from saying. A Codex session following AGENTS.md today would run the unsafe command.

Proposed: once the agent-neutral wording above is live, make `AGENTS.md` point at the one source instead of being a copy:

```bash
ln -sf .claude/CLAUDE.md AGENTS.md
```

Check that the container's integrity check (`docker/integrity-check.sh`) accepts a symlink at the repo root before relying on this. If it doesn't, regenerate the copy with `cp` as a step in the session-start routine instead.

## Decisions left to you (these are brakes, not instructions)

These lines limit autonomy on purpose. The draft keeps them as they are; change them deliberately if you want more autonomy:

1. **"Commit and push only when asked"** (parent file). The main gate between the agent and your history.
2. **Halt when uncertain in unattended runs** (project rule 2). The draft makes explicit what the old wording implied: interactive sessions ask; unattended runs comment on the issue and stop.
3. **Protected paths** (project rule 5). Keeps the agent from editing its own guards. Recommend keeping.
4. **After-session logging** (ledger + session-log every session). This costs real time per session, and it is also what keeps the ledger valuable.

Separately: the most rigid instructions loaded into sessions here come from plugins, not from CLAUDE.md. For example, the superpowers skill says "If there is even a 1% chance a skill might apply… you do not have a choice". If over-constraint is the worry, review the enabled plugins and output styles as well.

## Not changed

The ledger's content. Under the institutional-memory rule, compressing or reorganising it is the owner's decision.

## Verification done

- `tests/security/test-discovery.test.ts` asserts that CLAUDE.md contains `bun run test && git push origin main` and has no line starting `bun test && git push`. Both checks pass against the proposed project file (checked with `grep`; the test itself reads only the live path).
- Every command line from the live file is present in the draft, apart from the two ARIA lines merged into one.
- A list of 38 key facts (rules, filters, types, doc paths, logging formats) was checked by string match; all are present. A list of 12 parent-file lessons was checked the same way; all are present.
- Both ledger commands above were run against the current ledger and returned the expected output.
- Not verified: whether a session actually performs better with the trimmed files. The honest test is to run the same real task with both versions and compare.

## To apply

```bash
cp specs/claude-md-trim-2026-10/project-CLAUDE.proposed.md .claude/CLAUDE.md
cp specs/claude-md-trim-2026-10/parent-CLAUDE.proposed.md ../../CLAUDE.md
bun run test
```
