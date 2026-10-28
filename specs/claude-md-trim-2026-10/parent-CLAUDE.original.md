# How we work — all projects in this folder

*Inherited by every project below this directory. **Method only — no stack assumptions.** Each project's own `CLAUDE.md` adds its domain, commands and invariants, and wins on any conflict.*

*Do not add a framework, language, or tool to this file. The previous file here declared React/Vite/Postgres for a folder containing none of them, and every project inherited instructions that were false. If a rule is not true for **every** project below, it belongs in that project's own `CLAUDE.md`.*

## The loop

**UNDERSTAND → PLAN → RED → GREEN → VERIFY → REVIEW → SHIP**

A phase ends because a **gate** passed, not because work happened. Skipping to implementation is the default failure; resist it.

- **UNDERSTAND** — read the code before changing it. Verify the premise of the task: briefs, tickets, and your own earlier notes are routinely wrong, and building on a false premise is the most expensive mistake available.
- **PLAN** — for anything structural, agree the design before code exists. Use plan mode.
- **RED / GREEN** — see TDD below.
- **VERIFY** — exercise the change end to end. Tests passing ≠ the feature works.
- **REVIEW** — an independent pass, adversarial where the stakes are real.
- **SHIP** — update the record to the truth.

## TDD — `superpowers:test-driven-development`

**The Iron Law: no production code without a failing test first.** Write the test, run it, **watch it fail**, then write the minimum code to pass.

*If you didn't watch it fail, you don't know that it tests the right thing.* A test written after the code, or one that passed on its first run, may assert nothing at all. "Skip TDD just this once" is rationalisation.

### A green suite is not evidence that an invariant is guarded

To claim a rule is pinned, **break it on purpose**: comment out the guard, run the tests, confirm one **fails**, then restore the file and confirm the tree is clean. If the mutant survives, the rule is unguarded — the code is correct today, and nothing will stop the next change from breaking it.

**Retrofitted pins** — where the implementation already exists and you are adding the test that should always have guarded it — will pass on the first run and pin nothing. There, **the mutation run is the RED.** Never fake a failure to satisfy the letter of the law; never skip the mutation because the suite is green.

### Fixtures must not go vacuous

A test written against live/production data can assert nothing if that data happens not to contain the case — and it will pass forever, guard deleted or not. Prefer **synthetic fixtures**, and **assert the fixture's own precondition** so it fails loudly if it ever stops exercising the rule.

## Verification — `superpowers:verification-before-completion`

**No completion claims without fresh verification evidence.** Claiming work is done without checking is dishonesty, not efficiency.

If you cannot name the command you ran and the output you read, you are not done. Report failures plainly, with the output. Never round away a discrepancy. Never report a green result you did not observe.

**The failure mode to guard against is confident completion** — a passing suite, a plausible summary, a ticked box. Every gate exists to make "done" *falsifiable* rather than merely asserted.

## Agentic workflow

- **Route work to a specialist agent** where one exists. Project agents in `.claude/agents/` carry that project's domain; a generic agent does not.
- **In a Workflow, spawn by `agentType`** rather than re-describing the agent in the prompt — that is what carries its charter and skills into the subagent. Note this only resolves when Claude Code was **launched from that project's own directory**; otherwise it silently falls back to a generic agent and looks like it worked.
- **A subagent starts fresh.** It sees none of your conversation. Give it the full context and the falsifying question.
- **Fan out on genuinely independent work — never on shared files.** One owner per file at a time, or you get a lost update.
- **Always pair a builder with an adversarial verifier.** Prompt the verifier to *refute*, and have it default to "refuted" when uncertain. A self-reporting builder will ship its own mistakes.
- **Batch independent tool calls** into one message.
- **State the goal and the gate, not the keystrokes.** Prescribing steps wastes the planning and quietly moves the correctness risk back onto you.

Useful skills: `superpowers:brainstorming` (before creative work) · `writing-plans` / `executing-plans` · `subagent-driven-development` · `systematic-debugging` (before proposing a fix) · `requesting-code-review` · `using-git-worktrees` (isolate concurrent writers).

## Keep the record honest

- **Write a status or a count only where it is COMPUTED.** Every hardcoded copy is a future lie — it goes stale, often within the same session that falsified it, and then actively misinforms.
- **Never trust a ticked box, a status line, or a count you did not verify** — including one you wrote yourself.
- **Negative existence claims need an exhaustive search**, not one partial read. If code loads its rules from config, grep the config, not just the source.
- Comments state constraints the code cannot show — not what the next line does, and not why your change is correct.

## Git

- **Never `git add -A`.** Stage by path.
- **Commit and push only when asked.** If on the default branch, branch first.
- Before deleting or overwriting something you did not create, look at it. If what you find contradicts how it was described, say so instead of proceeding.

## Communicating

Lead with the outcome. Say what happened, then the detail. Complete sentences, terms spelled out — being readable matters more than being terse. Surface bad news early and plainly; a problem reported late is worth much less than one reported now.
