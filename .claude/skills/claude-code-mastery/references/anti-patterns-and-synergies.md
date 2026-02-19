# Anti-Patterns, Synergies, and Session Architecture

## Failure Modes in Depth

These patterns reliably produce poor results. Knowing them prevents more problems than any workflow pattern solves.

### Context Overload — The Silent Killer
**What happens:** Quality degrades in a cliff pattern, not a slope. At 70% capacity, output holds. Between 70-85%, subtle drift: architectural consistency fades, earlier decisions get forgotten, responses become generic. Past 85%, active degradation: bugs slip through, patterns contradict earlier work.

**Why it's insidious:** You don't notice until results are already poor. Claude doesn't announce "I'm losing track." The signal is in the output quality.

**Recognition signals:**
- Claude makes errors on things it got right earlier in the session
- Responses become increasingly generic or formulaic
- Architectural decisions start contradicting earlier choices
- Claude "forgets" project-specific conventions you established

**Fix:** Monitor context meter actively. Compact at 70% with specific preservation instructions. Externalize stable knowledge to files. Use subagents for context-heavy operations. Build session boundaries into workflow for multi-day projects.

### The "Yes And" Scope Creep
**What happens:** "Implement auth." Then "and also add rate limiting." Then "and logging." Then "and webhook notifications." Each addition sits on accumulated context. By the fourth "and also," Claude is holding together a feature that was never planned as a whole.

**Fix:** Batch related requirements upfront. Or start fresh sessions for genuinely new requirements. A new session with clear scope beats an exhausted session with accumulated drift.

**Recognition:** You're adding requirements mid-implementation. Claude's output quality drops with each addition.

### Over-Specification Trap
**What happens:** "Edit line 34 of user.py, find validate_email, add a regex check using re.match with the pattern..."

**Why it fails:** You're doing Claude's job (badly) and asking Claude to type. You remove its ability to discover actual code location, understand existing patterns, and choose the optimal fix.

**Fix:** Describe the outcome: "Email validation lets through invalid domains—fix it and add tests." Let Claude investigate, discover, and solve.

**Recognition:** Your prompt includes line numbers, specific variable names, or exact code to write.

### Interrupt-Heavy Workflow
**What happens:** Making changes, corrections, or redirections after every Claude response.

**Why it fails:** Prevents completion of logical units. Each interrupt forces context re-evaluation. Like tapping someone's shoulder every 30 seconds while they code.

**Fix:** Let Claude finish coherent chunks. Review at natural boundaries (function complete, test passing, file done), not after every output. Use `Esc` only when Claude is genuinely going in a wrong direction.

### One-Shot Mentality
**What happens:** Expecting perfect code on first response. Getting disappointed when it needs refinement. Restarting from scratch instead of iterating.

**Fix:** Claude Code is designed for iteration. First pass captures structure, refinement hones details. Plan for 2-3 iterations on complex work. This isn't failure — it's the intended workflow.

### Copy-Paste Ping-Pong
**What happens:** Manually copying code between files, terminals, sessions.

**Fix:** Trust Claude's file editing capabilities. Let it read and write files directly. That's the entire point of the agentic architecture.

### Context Starvation
**What happens:** "Fix the bug" with no error output. Claude guesses instead of knowing.

**Fix:** Always include stack trace or error output. Minimal context prompting works when the error itself provides the context (stack trace = location + error type + surrounding code). Without that, Claude is flying blind.

### Ignoring Compaction Timing
**What happens:** Letting auto-compact trigger at 95% capacity. By then, Claude has been producing degraded output for the last 25% of the session.

**Fix:** Manual `/compact` at logical breakpoints. Finish a feature → compact. Complete a test suite → compact. Don't wait for the system to force it.

### Agent Team Overuse
**What happens:** Launching agent teams for tasks a single session or simple subagent could handle. Burning tokens on coordination overhead for work that doesn't benefit from parallel exploration.

**Fix:** Agent teams are for when workers need to communicate with each other. If tasks are independent with clear boundaries, subagents are lighter and cheaper. If the task is simple, don't parallelize at all.

---

## Pattern Synergies — Where Multiplication Lives

Individual patterns add. Combinations multiply. These are the proven multiplicative combinations.

### Parallel Execution + Plan Mode
**How:** Plan in one worktree while implementation proceeds in another. Review plans in analysis worktree. Development worktree executes approved plans.

**What it creates:** Continuous pipeline — plan → review → implement → test — all simultaneous across worktrees. No idle sessions. No waiting.

### CLAUDE.md + Dual-Claude Review
**How:** Reviewer Claude checks against documented conventions. Violations trigger CLAUDE.md updates.

**What it creates:** Self-enforcing quality loop. Reviews catch project-specific violations generic reviews miss. Each violation strengthens the convention documentation.

### Subagents + Context Preservation
**How:** Delegate all research and broad analysis to subagents. Main session receives summaries only.

**What it creates:** Clean primary context focused on decisions and implementation. The investigation work gets done without polluting working memory. Possibly the highest-impact synergy for long sessions.

### TDD + Minimal Prompting
**How:** Write failing tests, then `"Make this pass."` Tests provide automatic verification with clear success criteria.

**What it creates:** Verified implementations with minimal instruction overhead. The test IS the specification. Clear success criteria = focused Claude.

### Interview-Then-Spec + Fresh Session
**How:** First session interviews the user, writes SPEC.md. Second session implements from the spec with clean context.

**What it creates:** Complete feature specification as a file artifact that doesn't consume conversation context. Implementation session starts fresh with maximum working memory. The spec session can be thorough without worrying about context for implementation.

### Worktrees + Self-Improving CLAUDE.md
**How:** Maintain CLAUDE.md in one worktree, development in others. Updates propagate via git sync.

**What it creates:** Central knowledge repository improving all parallel sessions. One correction benefits every worktree after the next sync.

### Plan Mode + Compaction Survival
**How:** Start complex tasks with explicit plan and TODO breakdown in a file. Mark states as work progresses.

**What it creates:** Compaction-resistant project state. Plans and TODO lists with explicit states survive summarization better than freeform conversation. When compaction hits, the structured artifacts preserve task context.

### Agent Teams + Worktrees
**How:** Agent team tackles cross-cutting analysis (review from multiple angles). Worktrees handle independent implementation tracks.

**What it creates:** Parallel exploration for decisions (agent teams) combined with parallel execution for implementation (worktrees). Decision quality × execution speed.

---

## Session Architecture — The Strategic Layer

Session management is the meta-skill. It determines whether all other patterns operate at full effectiveness or fight degraded context.

### The Spec-First Pattern
```
Session 1 (Specification):
  "Interview me about [feature] using AskUserQuestion. 
   Dig into hard parts. Write SPEC.md when done."
  → SPEC.md exists as file artifact
  → /clear

Session 2 (Implementation):
  "Implement the feature described in SPEC.md."
  → Clean context, full working memory
  → Compaction resilience (SPEC.md is always readable from file)
```

### Multi-Day Project Architecture
```
Day 1 AM: Spec session → SPEC.md + PLAN.md with TODO list
Day 1 PM: Implementation session 1 → Work through PLAN.md items → Commit
           /compact at logical breakpoints
Day 2 AM: Implementation session 2 → Fresh context + committed code + PLAN.md
Day 2 PM: Review session (separate worktree) → Quality check accumulated changes
           → Update CLAUDE.md with learnings
Day 3:    Polish session → Remaining items + tests + documentation
```

### Session Handoff Protocol
When ending a session that will continue later:
```
Write a handoff to HANDOFF.md:
- Decisions made and their rationale
- Current implementation state
- Open questions and unresolved issues
- Next steps in priority order
- Files modified with brief descriptions
```

### Context Budget Planning
For projects requiring extended sessions:
- **CLAUDE.md overhead:** ~2000 tokens (keep under this)
- **MCP tools overhead:** Varies. Audit with `/context`. Disable unused servers.
- **Effective working context:** Total window minus CLAUDE.md minus MCP minus system prompt
- **Compaction target:** Trigger at 70% of effective window, not total window
- **Subagent strategy:** Any task requiring reading 10+ files → delegate to subagent

---

## The Complete Power User Workflow

### Setup Phase (Once Per Project)
1. Run `/init` to generate starter CLAUDE.md, then refine to 100-200 lines
2. Create `.claude/notes/` directory for decisions, patterns, mistakes
3. Set up 3-5 git worktrees with color-coded VS Code windows
4. Configure hooks: auto-approve reads, format on write, quality gates
5. Install relevant MCP servers (database, GitHub)
6. Create custom commands for review, deploy, test workflows
7. Install team plugins for standardization (if applicable)

### Feature Development Flow
1. **Spec session:** Interview → SPEC.md → /clear
2. **Analysis worktree:** "Explain how current [system] works" (subagent delegation for broad research)
3. **Development worktree (plan mode):** "Plan the implementation from SPEC.md"
4. **Review worktree:** Dual-Claude review on the plan
5. **Development worktree:** Execute approved plan. Commit at logical boundaries.
6. **Monitor context:** /compact at 70% with preservation instructions
7. **Proof pattern:** "Show behavioral diff between main and feature branch"
8. **Review worktree:** "Grill me on these changes—what would you reject?"
9. **Update CLAUDE.md:** Add corrections as new rules
10. **Commit and merge:** Feature complete with high confidence

### Velocity Indicators
- First-attempt success rate increasing over time
- Corrections per session decreasing as CLAUDE.md matures
- Time from concept to PR reduced by 50%+
- Context compactions needed per feature decreasing
- Manual interventions per session trending down

---

## Experimental Patterns Worth Testing

### Memory Persistence via MCP [EXPERIMENTAL]
Using MCP memory servers to persist context between sessions. Could supplement CLAUDE.md with richer, automatically maintained context.

### Automated CLAUDE.md Generation [LOGICAL]
A dedicated Claude session analyzing commit history, PR discussions, and review comments to auto-generate CLAUDE.md content. Periodically refresh conventions from actual codebase behavior.

### Review-First Development [LOGICAL]
Having Claude review a feature spec before implementation — as if reviewing someone else's design. Catches architectural issues before any code is written.

### Cross-Session Knowledge Transfer [EXPERIMENTAL]
Structured handoff prompts between worktrees. Templates capturing decisions, open questions, and next steps for session handoffs. Combined with git sync for CLAUDE.md propagation.

### Agent Team Specialization [EXPERIMENTAL]
Permanent agent team compositions for recurring workflows: one architect, one implementer, one tester, one reviewer. Reusable team structures for common project patterns.

### Context Backup Hooks [LOGICAL]
PreCompact hooks that automatically save structured session state to `.claude/backups/`. Threshold-based triggers at 30%, 15%, 5% remaining. Recovery from compaction without manual intervention.
