# Workflows — Detailed Mechanics

## Git Worktrees

### Setup
```bash
# From main repository
git worktree add ../project-dev feature-branch        # Development
git worktree add ../project-review main                # Code review
git worktree add ../project-analysis main --detach     # Analysis (read-only)
git worktree add ../project-experiments -b experiments  # Spike/prototype

# Management
git worktree list
git worktree remove ../project-dev
git worktree prune  # Clean stale entries
```

### Directory Structure
```
~/projects/
├── myproject/              # Main worktree (primary development)
├── myproject-dev/          # Feature development
├── myproject-review/       # Code review
├── myproject-analysis/     # Read-only analysis (--detach)
└── myproject-experiments/  # Experimental changes
```

### Session Allocation

| Worktree | Purpose | Claude Session Role |
|---|---|---|
| Main/Dev | Active feature development | Write code, implement features |
| Review | Code review and testing | Review PRs, write tests, quality checks |
| Analysis | Codebase queries (detached) | Answer questions, explore code, generate docs |
| Experiments | Spike/prototype | Try approaches without affecting main work |

### Scaling by Priority
- **Speed critical** → 5 worktrees: 2 parallel features, 1 review, 1 analysis, 1 experiments
- **Quality critical** → 3 worktrees: 1 development, 1 continuous review, 1 deep analysis
- **Learning codebase** → 2 worktrees: 1 analysis-heavy exploration, 1 light experiments

### Resource Planning
Each VS Code window + Claude session uses 500MB-1GB. For 5 parallel sessions, allocate 4-5GB additional RAM beyond normal usage.

### VS Code Color-Coding
Each worktree gets distinct title bar colors in `.vscode/settings.json`:
```json
// Development — Blue
{ "workbench.colorCustomizations": { "titleBar.activeBackground": "#1e3a5f", "titleBar.activeForeground": "#ffffff" } }
// Review — Green
{ "workbench.colorCustomizations": { "titleBar.activeBackground": "#1e5f3a", "titleBar.activeForeground": "#ffffff" } }
// Analysis — Purple
{ "workbench.colorCustomizations": { "titleBar.activeBackground": "#3a1e5f", "titleBar.activeForeground": "#ffffff" } }
```

### Automation Script
```bash
#!/bin/bash
PROJECT_NAME="myproject"
BASE_DIR=$(pwd)
git worktree add "../${PROJECT_NAME}-dev" -b feature/current-work
git worktree add "../${PROJECT_NAME}-review" main
git worktree add "../${PROJECT_NAME}-analysis" main --detach
code "$BASE_DIR" "../${PROJECT_NAME}-dev" "../${PROJECT_NAME}-review" "../${PROJECT_NAME}-analysis"
echo "Worktrees created. Use 'git worktree list' to see all."
```

---

## Agent Teams

### Prerequisites
Enable in settings or environment:
```json
// ~/.claude/settings.json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```
Or: `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

### Launching
Tell Claude to create a team with natural language describing roles and task structure:
```
Create an agent team to build the payment integration:
- One teammate on the API layer
- One on the database migrations
- One on frontend components
Each should coordinate on the shared data types.
```

Claude creates a lead (your main session), spawns teammates with their own context windows, assigns tasks, and coordinates.

### Display Modes
- **In-process** (default in non-tmux): All teammates in one terminal. `Shift+Up/Down` to switch.
- **Split panes** (tmux/iTerm2): Each teammate gets its own pane. Preferred for 3+ teammates.
- **Auto** (default): Detects environment. tmux → split panes, otherwise → in-process.

### When Agent Teams vs Subagents
| Need | Use |
|---|---|
| Workers report back to one coordinator | Subagents |
| Workers need to share findings and coordinate | Agent Teams |
| Quick focused delegation | Subagents |
| Research from multiple independent angles | Agent Teams |
| Context preservation in main session | Subagents |
| Cross-layer feature (frontend + backend + tests) | Agent Teams |

### Best Use Cases [PROVEN]
- Research/review from multiple angles simultaneously
- New modules where teammates each own a separate piece
- Debugging with competing hypotheses tested in parallel
- Cross-layer coordination (frontend, backend, tests each owned by different teammate)

### Cautions
- Token-intensive. Coordination overhead. Use when parallel exploration adds genuine value.
- Known limitations around session resumption and shutdown behavior.
- Opus 4.6 improves coordination quality significantly — less "teammates going rogue."

---

## Plan Mode

### Activation
`Shift+Tab` cycles through permission modes during a session. Plan mode = read-only operations + AskUserQuestion for requirements.

### Effective Plan Structure
```
1. Problem Statement: What we're solving
2. Current State Analysis: How code works now
3. Proposed Changes: File-by-file specifics
4. Testing Strategy: How to verify
5. Potential Risks: Edge cases, breaking changes
6. Rollback Plan: If things go wrong
```

### Dual-Claude Review
1. Claude A generates implementation plan
2. Human quick-scans for major issues
3. Claude B (fresh instance) critiques as staff engineer
4. Claude A implements with refinements

Reviewer prompt:
```
Review this plan as a staff engineer. Be skeptical. Find:
- Subtle bugs in the approach
- Missing edge cases
- Performance issues
- Maintainability concerns
- Security vulnerabilities
Don't be nice—be thorough.
```

### Plans Survive Compaction
Structured plans and TODO lists with explicit states (pending/in-progress/completed) persist through compaction better than freeform conversation. Start complex tasks with plan mode and task breakdown to create compaction-resistant artifacts.

---

## CLAUDE.md Templates

### Maximum Effectiveness Template
```markdown
# [Project Name]

## Quick Reference
- Build: `[command]`
- Test: `[command]`
- Run: `[command]`

## Tech Stack
[Key technologies and versions]

## Architecture
[Brief description of patterns and directory structure]

## Code Conventions
- [Convention 1]
- [Convention 2]

## NEVER Do
- [Anti-pattern 1]: [why]

## ALWAYS Do
- [Required pattern 1]

## Common Mistakes & Fixes
| Mistake | Correct Approach |
|---------|------------------|
| [X]     | [Y]              |

## Testing Rules
[Specific testing conventions]

## Compaction Instructions
When compacting, always preserve: full list of modified files, test commands, architectural decisions, and current task state.

## Self-Improvement Rules
When I correct you or you discover something important:
1. Suggest an addition to this CLAUDE.md file
2. Phrase it as a clear, actionable rule with the "why"
3. Keep it concise—one line if possible
```

### Global Configuration (~/.claude/CLAUDE.md)
```markdown
# Global Preferences
- Be concise, skip preamble
- Show code, don't describe
- Ask clarifying questions for ambiguous requests
- Prefer functional patterns
- Include error handling
```

### Notes Directory (Complex Projects)
```
project/
├── CLAUDE.md                    # Main config (100-200 lines max)
├── .claude/
│   ├── notes/
│   │   ├── decisions.md         # Architecture decisions
│   │   ├── patterns.md          # Code patterns learned
│   │   └── mistakes.md          # Known pitfalls
│   ├── commands/                # Custom slash commands
│   ├── agents/                  # Subagent definitions
│   └── skills/                  # Auto-activating skills
```

Reference from main CLAUDE.md with pointers, not inline content:
```markdown
## Extended Documentation
- See `.claude/notes/decisions.md` for architecture decisions
- See `.claude/notes/patterns.md` for established patterns
```

### CLAUDE.md Evolution
```markdown
# Version 1 (verbose, unclear)
"When writing tests, make sure to use our testing patterns
and follow the conventions we've established."

# Version 2 (specific, actionable)
"Tests: describe/it blocks, *.test.ts files,
mock external services, never test implementation details."
```

---

## Context Management Configurations

### Manual Compact with Preservation
```
/compact preserve the auth module decisions, modified file list, and test patterns
```

### Partial Compaction
`Esc + Esc` or `/rewind` → select a message checkpoint → "Summarize from here." Condenses from that point forward while keeping earlier context intact.

### Context Monitoring
Watch the context meter (bottom right of terminal). Check mid-session with `/context`.

**Action thresholds:**
- 70% → Consider compacting at next logical breakpoint
- 85% → Compact now or delegate remaining work to subagent
- 90%+ → Quality cliff. Compact immediately or start fresh session

### Compaction Survival Hook [LOGICAL]
```json
{
  "hooks": {
    "PreCompact": [{
      "hooks": [{
        "type": "command",
        "command": "echo \"$(date): Session backup before compaction\" >> ~/.claude/compaction.log"
      }]
    }]
  }
}
```

---

## Hooks Configuration

Location: `~/.claude/settings.json` (global) or `.claude/settings.json` (project)

### Auto-Approve Read Operations
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Read|Glob|Grep",
      "hooks": [{ "type": "command", "command": "exit 0" }]
    }]
  }
}
```

### Format on Write
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "npx prettier --write \"$FILE_PATH\" 2>/dev/null || true"
      }]
    }]
  }
}
```
**Caution:** Automatic formatting hooks can consume significant context tokens. Consider running formatting between sessions for large projects.

### Quality Gate on Stop
```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "npm run typecheck 2>&1 | head -20; npm test --passWithNoTests 2>&1 | tail -5"
      }]
    }]
  }
}
```

### Audit Logging
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "echo \"$(date): $TOOL_INPUT\" >> ~/.claude/audit.log"
      }]
    }]
  }
}
```

### Agent-Based Hook [DOCUMENTED]
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write",
      "hooks": [{
        "type": "agent",
        "agent": "code-reviewer",
        "timeout": 60
      }]
    }]
  }
}
```
Agent hooks run a subagent with up to 50 tool-use turns. Use for judgment-based automation.

---

## MCP Server Configuration

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "POSTGRES_CONNECTION_STRING": "postgresql://..." }
    }
  }
}
```

**Context optimization:** Disable unused MCP servers with `/mcp` or `@server-name disable` before compacting. MCP tools consume context tokens even when idle.

---

## Custom Commands

```
.claude/commands/
  review.md  → /project:review
  deploy.md  → /project:deploy
  test.md    → /project:test
```

### Command File Format
```markdown
---
description: Comprehensive code review on staged changes
---
Review staged git changes for:
1. Code style against CLAUDE.md conventions
2. Potential bugs and edge cases
3. Missing tests
4. Security concerns
5. Performance implications
Be thorough, not polite. $ARGUMENTS
```

Variables: `$ARGUMENTS` (user input after command), `$FILE` (current file context)

---

## Subagent Definitions

Subagent files in `.claude/agents/`:
```yaml
---
name: code-reviewer
description: Expert code review specialist. Reviews code for quality, security, and maintainability.
tools: Read, Grep, Glob, Bash
model: inherit
---
You are a senior code reviewer ensuring high standards of code quality and security.
Focus on: architectural consistency, edge cases, security vulnerabilities, and maintainability.
Report findings as actionable items with severity (critical/warning/note).
```

---

## Plugins

### Installation
```bash
claude plugin add <plugin-name>
# Or from marketplace
/plugin marketplace
/plugin install <plugin-name>
```

### Creating Team Plugins
Bundle commands, hooks, skills, and metadata into a distributable package. Hooks combine, commands appear in autocomplete, skills activate automatically.

---

## Session Management

### Resume Sessions
```bash
claude --resume          # Interactive session picker
claude --from-pr 123     # Resume linked to PR
/resume                  # Switch sessions within active session
```

Session picker shows: descriptive names, git branch, forked sessions grouped under root. Name sessions descriptively — `R` in picker to rename.

### Session Architecture for Multi-Day Projects
```
Day 1: Spec Session
  → Interview user → Write SPEC.md → /clear

Day 1: Implementation Session 1
  → Implement from SPEC.md → /compact at logical breakpoints → Commit

Day 2: Implementation Session 2
  → Continue from SPEC.md + committed code → Fresh context

Day 2: Review Session (separate worktree)
  → Review accumulated changes → Update CLAUDE.md with learnings
```

---

## Environment Optimization

### Terminal
- **Ghostty** — Synchronized rendering, 24-bit color, unicode support
- **tmux** — Essential for agent teams, long-running processes, session persistence
- `fn×2` on macOS for dictation — 3x faster than typing
- Color-code and name terminal tabs, one per task/worktree

### VS Code
- Claude Code panel pinned right, split view: code left, Claude right
- **GitLens** for code history context
- **Error Lens** for inline errors → quick Claude fixes
- `/statusline` for context usage and git branch monitoring

### CLI Tools
- Install `gh` CLI for GitHub operations (authenticated, avoids rate limits)
- `Ctrl+R` for searchable prompt history
- `Esc` to stop mid-action, `Esc+Esc` or `/rewind` for checkpoint selection
