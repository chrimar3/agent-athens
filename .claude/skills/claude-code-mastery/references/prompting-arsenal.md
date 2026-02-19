# Prompting Arsenal

Outcome-focused prompts let Claude use full capabilities. Over-specified instructions remove Claude's ability to find optimal solutions. Every pattern here exists to unlock autonomy, not constrain it.

---

## Quality Gates

### Challenge — "Grill Me"
```
Grill me on these changes and don't make a PR until I pass your test.
```
Inverts human-reviews-AI dynamic. Claude generates adversarial test cases, creates a quality gate before submission.

Variations:
- `"What would make a senior engineer reject this PR?"`
- `"Review as if you didn't write it—what's wrong?"`
- `"Find the bug I'm missing"`

### Proof — "Show Me"
```
Prove to me this works—diff behavior between main and feature branch.
```
Forces concrete demonstration over assertion. Behavioral verification through comparison.

Behavioral diff variant:
```
Create a test that passes on main and fails on this branch
(or vice versa) to prove the behavioral difference.
```

### Staff Engineer Review
```
Review this code as a staff engineer. Focus on architecture decisions,
edge cases, performance, maintainability, security. Don't be nice.
```

---

## Refactoring

### Elegance — "Scrap and Rebuild"
```
Knowing everything you know now, scrap this and implement the elegant solution.
```
"Everything you know now" signals Claude to incorporate constraints learned from failed attempts. Deploy after 2-3 iterations that feel like patching.

### Incremental Cleanup
```
Refactor this in small, safe steps. One change at a time,
verify each works before proceeding.
```

### Re-Planning Reset
```
Stop. We've been going in circles.
1. What are we actually trying to achieve?
2. What have we learned doesn't work?
3. What's a fundamentally different approach?
```
Leverages accumulated failure context while forcing fresh thinking.

---

## Autonomous Fix

### Zero-Context Bug Fix
```
TypeError: Cannot read properties of undefined (reading 'map')
  at UserList.render (UserList.js:23)
Fix
```
Stack trace provides location, error type constrains solution space, Claude reads surrounding code autonomously. Minimal prompt = maximum autonomy.

### Other Minimal Prompts
- `"Fix"` with error pasted
- `"This test is failing"` with output
- `"Make this pass: [test name]"`
- `"Go fix the failing CI tests."`
- `[paste docker logs] "troubleshoot this"`
- `"Debug"` with unexpected output

---

## Specification

### Complete Context for One-Shot
```
Implement [feature]:
- Current behavior: [X]
- Desired behavior: [Y]
- Constraints: [list]
- Success looks like: [verification method]
- Similar code exists in: [reference file]
```

### Negative Space — What NOT to Do
```
Implement X.
Do NOT:
- Change the public API
- Add new dependencies
- Modify the database schema
```
Explicit constraints prevent common derailments. Defining boundaries often matters more than specifying implementation.

### Ambiguity Elimination
```
Before implementing, tell me:
1. What assumptions are you making?
2. What edge cases do you see?
3. What questions do you have?
```

### Interview-Then-Spec [DOCUMENTED]
```
I want to build [feature]. Interview me in detail using AskUserQuestion.
Ask about technical implementation, UI/UX, edge cases, concerns, tradeoffs.
Don't ask obvious questions—dig into the hard parts.
Keep interviewing until we've covered everything, then write SPEC.md.
```
Creates a written artifact for a clean implementation session. Spec-first = clean context for execution.

---

## Delegation

### Subagent Research
```
Use subagents to investigate how our auth system handles token refresh,
and whether we have any existing OAuth utilities I should reuse.
```
Explicit delegation. Subagent explores in separate context, reports summary back. Main context stays clean.

### Parallel Compute
```
[complex request] - use subagents
```
Claude distributes work across subagents for parallel processing.

### Agent Team Launch
```
Create an agent team for this:
- Teammate 1: [role and focus]
- Teammate 2: [role and focus]
- Teammate 3: [role and focus]
They should coordinate on [shared concerns].
```
For when workers need to communicate with each other, not just report back.

---

## Context Management Prompts

### Strategic Compact
```
/compact preserve the auth module decisions, modified files list, test patterns, and current task state
```

### Session Handoff
```
We're about to start a fresh session. Write a handoff document to HANDOFF.md:
- Key decisions made
- Current state of implementation
- Open questions
- Next steps
- Files modified
```

### Plan-First for Compaction Survival
```
Before we start coding, create a detailed plan with a TODO list in PLAN.md.
Mark each item pending/in-progress/completed as we go.
This file is our source of truth across compaction events.
```

---

## Learning

### Visual Explanation
```
Generate an HTML presentation explaining this codebase. Make it visual with diagrams.
```

### Architecture Map
```
Draw an ASCII diagram showing how these components interact.
```

### Spaced Repetition
```
I'll explain my understanding of [concept].
Ask follow-up questions to fill gaps, then summarize what I should review.
```

---

## TDD Integration

### Test-First Implementation
```
Here are the failing tests. Make them pass.
```
Tests provide automatic verification with clear success criteria. The test IS the specification.

### Coverage-Driven
```
Analyze test coverage for [module]. Write tests for uncovered paths,
then fix any bugs the new tests expose.
```

---

## Anti-Pattern Quick Reference

| Don't | Do Instead |
|---|---|
| `"Edit line 34, add null check"` | `"Handle the null case in processData"` |
| `"Use recursion to solve this"` | `"Solve this elegantly"` |
| `"Make this better"` | `"Handle 10x current throughput"` |
| `"Fix the bug"` (no context) | Include stack trace or error output |
| Change direction every response | Let Claude complete logical units |
| Copy-paste code between sessions | Trust file editing capabilities |
| Cram everything into one session | Fresh sessions for distinct phases |
| Wait for auto-compact | `/compact` at 70% with preservation instructions |
