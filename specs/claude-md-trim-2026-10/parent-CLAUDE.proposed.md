# How we work — all projects in this folder

*Inherited by every project below this directory. Method only — no stack assumptions. Each project's own `CLAUDE.md` adds its domain, commands and invariants, and wins on any conflict. If a rule is not true for every project below, it belongs in that project's file, not here. (An earlier version of this file declared a React/Vite/Postgres stack for a folder containing none of them, and every project inherited the false instructions.)*

## Done means verified

Read the code before changing it, and check the premise of the task: briefs, tickets and earlier notes are often wrong. Agree the design first for structural changes. A task is done when you can name the command you ran and the output you read: say what failed, plainly, with the output, and never report a result you did not observe.

## Tests

Write the test first and watch it fail; a test that passes on its first run may assert nothing. Two lessons this folder learned the hard way:

- **A green suite does not prove a rule is guarded.** To claim a rule is pinned, break it on purpose (comment out the guard), confirm a test fails, then restore the file and confirm the tree is clean. When adding a test for code that already exists, this mutation run is the failing step.
- **Fixtures go vacuous.** A test against live data passes forever if the data stops containing the case. Prefer synthetic fixtures, and assert the fixture's own precondition so it fails loudly when it stops exercising the rule.

## Subagents

- A subagent sees none of your conversation: give it the context, the goal and the question that would prove it wrong.
- Prefer a project's own agent in `.claude/agents/`. In a Workflow, spawn it by `agentType` — this resolves only when Claude Code was launched from that project's directory; otherwise it silently falls back to a generic agent.
- Parallelise only independent work, with one owner per file at a time.
- Pair builders with a verifier prompted to refute, defaulting to "refuted" when uncertain.

## Keep the record honest

- Write a status or a count only where it is computed. Hardcoded copies go stale.
- Don't trust a ticked box, status line or count you did not verify, including your own.
- A claim that something does not exist needs an exhaustive search. If code loads rules from config, search the config too.
- Comments state constraints the code cannot show, not what the next line does.

## Git

- Never `git add -A`; stage by path.
- Commit and push only when asked. If on the default branch, branch first.
- Before deleting or overwriting something you did not create, look at it. If it contradicts how it was described, say so instead of proceeding.

## Communicating

Lead with the outcome, then the detail. Complete sentences, terms spelled out. Report bad news early and plainly.
