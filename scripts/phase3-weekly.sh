#!/usr/bin/env bash
# Phase-3 weekly routine (2026-07-19) — launchd: com.agentathens.phase3-weekly
# Sundays 09:47 Athens (after the 08:00 daily pipeline).
#
# Two layers, deliberately separable:
#   Layer 1 (deterministic, no Claude): run the measurement scripts — Perplexity
#     probe, Class-4 console pull, T1 index diagnostic — and COMMIT results to
#     the benchmark branch + heartbeat PHASE3-LOG.md. Plain API keys, cannot hit
#     the headless-Claude auth-regression class. Data always lands.
#   Layer 2 (judgment): auth-precheck (auto-enrich.sh pattern, S101/S109), then
#     a headless `claude -p` session in the Phase-3 worktree that reads the
#     fresh measurements, writes the P-verdicts, and works the queue under the
#     standing law. Watchdog-killed after MAX_SESSION_SECONDS.
#
# Layer-2 failure NEVER blocks layer 1 (it runs after). A missing weekly
# heartbeat line in PHASE3-LOG.md is the operator's signal something is wrong.
# Smoke mode: PHASE3_SMOKE=1 (or flag file /tmp/phase3-smoke) verifies
# prerequisites end-to-end through launchd without probing or spawning Claude.
set -uo pipefail

BASELINE_WT="/Users/chrism/Project with Claude/AgentAthens/agent-athens-visibility-baseline"
BENCH="$BASELINE_WT/benchmark/visibility-baseline-20260708"
# *_OVERRIDE are test seams (tests/phase3-weekly-guard.test.ts), like
# LOG_DIR_OVERRIDE in auto-enrich.sh. launchd never sets them.
PHASE3_WT="${PHASE3_WT_OVERRIDE:-/Users/chrism/Project with Claude/AgentAthens/agent-athens-phase3}"
MAIN_REPO="/Users/chrism/Project with Claude/AgentAthens/agent-athens"
# Host-only log folder (security loop round 4): pipeline containers can write
# $MAIN_REPO/logs, so a symlink planted there would make this host job
# truncate or append into any file the owner can write.
LOG_DIR="${PHASE3_LOG_DIR_OVERRIDE:-${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/logs}"
RUN_LOG="$LOG_DIR/phase3-weekly.log"
CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
[ -x "$CLAUDE_BIN" ] || CLAUDE_BIN="$(command -v claude || echo /usr/local/bin/claude)"
MAX_SESSION_SECONDS=10800  # 3h watchdog for layer 2

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$RUN_LOG"; }

mkdir -p "$LOG_DIR" 2>/dev/null || true
# Refuse to write through a symlink, even in the host-only folder.
for f in "$LOG_DIR" "$RUN_LOG" "$LOG_DIR/phase3-auth-precheck-last.log"; do
  if [ -L "$f" ]; then
    echo "[phase3-weekly] REFUSED — $f is a symlink; something planted it. Inspect it, delete it, then rerun bash scripts/phase3-weekly.sh." >&2
    exit 1
  fi
done
# The session and the self-test must see the same hook profile: the
# unattended one. The enrichment profile (stricter) is never this script's.
unset AA_ENRICHMENT_SESSION

# ---------- guard self-test (security loop round 2) ----------
# The L2 session reads third-party text (Perplexity answers, DB-derived
# diagnostics). Its boundary is the db-guard PreToolUse hook in the Phase-3
# worktree (that worktree's .claude/settings.json wires
# $CLAUDE_PROJECT_DIR/scripts/hooks/db-guard.ts). Before any claude call, run
# THAT hook directly, under the same env the session gets, on known-bad calls
# (must exit 2 exactly: Claude Code treats any other non-zero exit as a
# non-blocking hook error and runs the tool) and known-good calls (must exit 0,
# proving the hook ran rather than crashed), and check the settings route every
# tool to it. Any mismatch skips L2: a skipped judgment session is recoverable,
# an unguarded one over third-party text is not. Mirrors run_guard_selftest in
# scripts/auto-enrich.sh. DB_GUARD_HOOK_OVERRIDE is a test seam.
run_guard_selftest() {
  local hook="${DB_GUARD_HOOK_OVERRIDE:-$PHASE3_WT/scripts/hooks/db-guard.ts}"
  local failures=() probe name expected json rc
  # name|expected-exit|hook-json
  local probes=(
    "bun run outside the repo|2|{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"bun run /tmp/x.ts\"}}"
    "Read ~/.ssh/id_rsa|2|{\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"~/.ssh/id_rsa\"}}"
    "sqlite3 writefile|2|{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"sqlite3 -readonly data/events.db \\\"SELECT writefile('src/x.ts','x')\\\"\"}}"
    "cat of a key file|2|{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"cat ~/.config/agentathens/perplexity-api-key\"}}"
    "WebFetch (no web tools)|2|{\"tool_name\":\"WebFetch\",\"tool_input\":{\"url\":\"https://example.com/\",\"prompt\":\"x\"}}"
    "build (must be allowed)|0|{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"bun run src/generate-site.ts\"}}"
    "Write PHASE3-LOG.md (must be allowed)|0|{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$BENCH/PHASE3-LOG.md\",\"content\":\"x\"}}"
  )
  for probe in "${probes[@]}"; do
    name="${probe%%|*}"
    expected="${probe#*|}"; expected="${expected%%|*}"
    json="${probe#*|*|}"
    rc=0
    printf '%s' "$json" | AA_UNATTENDED_SESSION=phase3 AA_SESSION_EXTRA_ROOTS="$BENCH" bun "$hook" >/dev/null 2>&1 || rc=$?
    [ "$rc" = "$expected" ] || failures+=("$name: expected exit $expected, got $rc")
  done
  # Settings wiring: some PreToolUse entry must run db-guard.ts for every tool
  # (matcher "*", empty, or a regex matching each name below). A matcher that
  # skips Read or WebFetch leaves those calls unguarded.
  if ! AA_SETTINGS_PATH="$PHASE3_WT/.claude/settings.json" bun -e '
    const s = JSON.parse(require("fs").readFileSync(process.env.AA_SETTINGS_PATH, "utf8"));
    const wired = (s.hooks?.PreToolUse ?? []).filter((e) => (e.hooks ?? []).some((h) => String(h.command ?? "").includes("scripts/hooks/db-guard.ts")));
    const covers = (m, t) => m === undefined || m === "" || m === "*" || new RegExp("^(?:" + m + ")$").test(t);
    const tools = ["Bash", "Read", "Glob", "Grep", "Write", "Edit", "MultiEdit", "WebFetch", "WebSearch", "Task", "mcp__any__tool"];
    process.exit(tools.every((t) => wired.some((e) => covers(e.matcher, t))) ? 0 : 1);
  ' >/dev/null 2>&1; then
    failures+=("settings wiring: $PHASE3_WT/.claude/settings.json does not route every tool (matcher \"*\") to scripts/hooks/db-guard.ts")
  fi
  if [ ${#failures[@]} -gt 0 ]; then
    local f
    for f in "${failures[@]}"; do log "Guard self-test FAILED — $f"; done
    log "Guard self-test FAILED: the Phase-3 worktree's db-guard hook ($hook) does not enforce the unattended boundary. L2 skipped before any claude call. Next: bring the Phase-3 worktree's scripts/hooks/db-guard.ts and .claude/settings.json up to main (unattended profile with a Bash allowlist, matcher \"*\"), then run: bash scripts/phase3-weekly.sh --guard-selftest-only"
    return 1
  fi
  log "Guard self-test passed (out-of-repo bun run, key reads, sqlite3 writefile and web tools refused with exit 2; build and log write allowed)"
  return 0
}

log "=== phase3-weekly start ==="

# --guard-selftest-only: run ONLY the guard self-test and exit with its status.
# Placed before smoke mode and layer 1 so it has no side effects.
if [ "${1:-}" = "--guard-selftest-only" ]; then
  run_guard_selftest
  exit $?
fi

# ---------- smoke mode ----------
if [ "${PHASE3_SMOKE:-0}" = "1" ] || [ -f /tmp/phase3-smoke ]; then
  log "SMOKE: verifying prerequisites only"
  ok=1
  for p in "$BENCH/tooling/probe-perplexity.ts" "$BENCH/tooling/class4-console.ts" \
           "$BENCH/tooling/t1-event-index-diag.ts" "$PHASE3_WT/CLAUDE.md" \
           "$HOME/.config/agentathens/perplexity-api-key" \
           "$HOME/.config/agentathens/gcp-kpi-reader.json" \
           "$HOME/.config/agentathens/bing-api-key"; do
    if [ -e "$p" ]; then log "SMOKE ok: $p"; else log "SMOKE MISSING: $p"; ok=0; fi
  done
  command -v bun >/dev/null && log "SMOKE ok: bun $(bun --version)" || { log "SMOKE MISSING: bun"; ok=0; }
  [ -x "$CLAUDE_BIN" ] && log "SMOKE ok: claude bin $CLAUDE_BIN" || { log "SMOKE MISSING: claude bin"; ok=0; }
  log "SMOKE result: $([ $ok = 1 ] && echo PASS || echo FAIL)"
  exit $([ $ok = 1 ] && echo 0 || echo 1)
fi

# ---------- layer 1: deterministic measurement ----------
layer1_status="ok"
cd "$BASELINE_WT" || { log "FATAL: baseline worktree missing"; exit 1; }

log "L1: refreshing DB snapshot for diagnostic"
# data/ is container-writable: a symlink there would make cp copy any file
# the owner can read into the worktree the L2 session reads.
if [ -L "$MAIN_REPO/data/events.db" ]; then
  log "L1: REFUSED to copy $MAIN_REPO/data/events.db — it is a symlink (inspect and delete it)"
  layer1_status="db-copy-refused-symlink"
else
  cp "$MAIN_REPO/data/events.db" "$PHASE3_WT/data/events.db" 2>>"$RUN_LOG" || layer1_status="db-copy-failed"
fi

log "L1: Perplexity probe (20 queries x 3 runs)"
if ! PERPLEXITY_API_KEY="$(cat "$HOME/.config/agentathens/perplexity-api-key")" \
    bun run "$BENCH/tooling/probe-perplexity.ts" --runs 3 >> "$RUN_LOG" 2>&1; then
  layer1_status="probe-failed"; log "L1 WARN: probe failed"
fi

log "L1: Class-4 console pull"
if ! bun run "$BENCH/tooling/class4-console.ts" >> "$RUN_LOG" 2>&1; then
  layer1_status="class4-failed"; log "L1 WARN: class4 pull failed"
fi

log "L1: T1 index diagnostic"
if ! bun run "$BENCH/tooling/t1-event-index-diag.ts" "$PHASE3_WT/data/events.db" 5 >> "$RUN_LOG" 2>&1; then
  layer1_status="${layer1_status};t1diag-failed"; log "L1 WARN: t1 diagnostic failed"
fi

log "L1: heartbeat + commit on benchmark branch"
echo "" >> "$BENCH/PHASE3-LOG.md"
echo "- HEARTBEAT $(date '+%Y-%m-%d %H:%M') weekly routine: layer1=$layer1_status (raw results in probe-runs/$(date '+%Y-%m-%d')/)" >> "$BENCH/PHASE3-LOG.md"
git -C "$BASELINE_WT" add "$BENCH/probe-runs" "$BENCH/PHASE3-LOG.md" 2>>"$RUN_LOG"
git -C "$BASELINE_WT" commit --no-verify --quiet -m "phase3: weekly measurement $(date '+%Y-%m-%d') (layer1=$layer1_status)" 2>>"$RUN_LOG" \
  && log "L1: committed" || log "L1 WARN: nothing to commit or commit failed"

# ---------- layer 2: headless judgment session ----------
if ! run_guard_selftest; then
  echo "- HEARTBEAT-L2 $(date '+%Y-%m-%d %H:%M') judgment session SKIPPED (guard self-test failed; see $RUN_LOG)" >> "$BENCH/PHASE3-LOG.md"
  git -C "$BASELINE_WT" add "$BENCH/PHASE3-LOG.md" && git -C "$BASELINE_WT" commit --no-verify --quiet -m "phase3: weekly L2 skipped (guard self-test)" 2>>"$RUN_LOG"
  exit 1
fi
AUTH_PRECHECK_LOG="$LOG_DIR/phase3-auth-precheck-last.log"
{
  echo "=== auth pre-check $(ts) ==="
  echo "env: USER=${USER:-<unset>} HOME=${HOME:-<unset>}"
  echo "bin=$CLAUDE_BIN version=$("$CLAUDE_BIN" --version 2>/dev/null || echo '?')"
} > "$AUTH_PRECHECK_LOG"
AUTH_OUTPUT="$(echo "ok" | "$CLAUDE_BIN" -p --output-format json 2>&1)"
AUTH_RC=$?
{ echo "exit=$AUTH_RC"; echo "$AUTH_OUTPUT"; } >> "$AUTH_PRECHECK_LOG"
if [ "$AUTH_RC" -ne 0 ]; then
  log "L2 SKIPPED: claude auth pre-check failed rc=$AUTH_RC (see $AUTH_PRECHECK_LOG; if 'Not logged in' with USER set, run claude interactively + /login). Layer-1 data is committed."
  echo "- HEARTBEAT-L2 $(date '+%Y-%m-%d %H:%M') judgment session SKIPPED (auth pre-check rc=$AUTH_RC)" >> "$BENCH/PHASE3-LOG.md"
  git -C "$BASELINE_WT" add "$BENCH/PHASE3-LOG.md" && git -C "$BASELINE_WT" commit --no-verify --quiet -m "phase3: weekly L2 skipped (auth)" 2>>"$RUN_LOG"
  exit 0
fi
log "L2: auth pre-check passed; launching judgment session"

SESSION_LOG="$LOG_DIR/phase3-session-$(date '+%Y%m%d-%H%M').log"
PROMPT='Continue Phase 3 of the agentathens.com visibility loop. You are running UNATTENDED via the weekly launchd routine.

Ground truth: CLAUDE.md in this worktree is the standing law; PHASE3-LOG.md and T2-SURFACE-MAP.md on the benchmark branch (worktree agent-athens-visibility-baseline, benchmark/visibility-baseline-20260708/) carry the loop state. FRESH measurements were committed minutes ago by the deterministic layer (probe-runs/<today>/).

Do, in order: (1) the measurement-verdict step — compare the fresh probe/console/diagnostic against the previous cycle, rule on every open prediction (P1, P2, ...) and record verdicts in PHASE3-LOG.md; (2) work the queue top-down within the law. Unattended constraints: merges to fable-impact ONLY with full gates green (build exit 0, bun test 0 fail, tsc clean); anything ambiguous, operator-owned, or gate-failing gets LOGGED and skipped, never forced; never touch the frozen instrument; never fabricate content; end by committing an updated PHASE3-LOG.md with a session summary + next-session queue.'

# Security loop round 1: this session reads third-party measurement output
# (Perplexity probe results), so it gets an explicit tool list instead of
# "everything acceptEdits allows", and the db-guard unattended profile:
# AA_UNATTENDED_SESSION scopes Read/Glob/Grep/Write to the Phase-3 worktree
# plus the benchmark dir (AA_SESSION_EXTRA_ROOTS, --add-dir), refuses secrets
# (.env*, .git, .netlify, keys, ~/.config) and unknown tools. The hook that
# enforces it is the Phase-3 worktree's own copy, and run_guard_selftest above
# refuses to launch this session unless that copy refuses the bad probes.
# Round 2: no wildcard script grants. `Bash(bun run *)`/`Bash(bun test *)` ran
# any file (bun run /tmp/x.ts), so the session gets exactly the three gates the
# Phase-3 law names (build, full test suite, tsc). No Task (sub-agents would
# multiply the injection surface), no web tools, no git checkout/restore/reset
# (they write single files, e.g. an older scripts/hooks/db-guard.ts, from any
# commit) and no git push/-C/config/remote. Write/Edit/MultiEdit are granted by
# name, so --permission-mode default suffices: acceptEdits would add auto-
# approved filesystem commands (mkdir, mv, cp, rm) the session does not need.
# Residual, by design: the session edits code and then runs the build and test
# suite, and both execute that code on the host. That is only contained by
# running this layer in the container (docker/aa-run.sh) with no secrets
# mounted, an operator step. Pinned by tests/phase3-weekly-guard.test.ts.
PHASE3_ALLOWED_TOOLS="Read,Glob,Grep,Edit,MultiEdit,Write,TodoWrite,Bash(bun run src/generate-site.ts),Bash(bun test),Bash(bunx tsc --noEmit -p .),Bash(git status),Bash(git status *),Bash(git diff),Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git add *),Bash(git commit *),Bash(git merge *),Bash(git switch *),Bash(git branch *),Bash(git rev-parse *),Bash(ls *),Bash(wc *)"
(
  cd "$PHASE3_WT" && AA_UNATTENDED_SESSION=phase3 AA_SESSION_EXTRA_ROOTS="$BENCH" "$CLAUDE_BIN" -p "$PROMPT" --permission-mode default --allowedTools "$PHASE3_ALLOWED_TOOLS" --add-dir "$BENCH" >> "$SESSION_LOG" 2>&1
) &
CLAUDE_PID=$!
( sleep "$MAX_SESSION_SECONDS" && kill -9 "$CLAUDE_PID" 2>/dev/null && echo "[watchdog] killed session after ${MAX_SESSION_SECONDS}s" >> "$SESSION_LOG" ) &
WATCHDOG_PID=$!
wait "$CLAUDE_PID"
SESSION_RC=$?
kill "$WATCHDOG_PID" 2>/dev/null
log "L2: session finished rc=$SESSION_RC (log: $SESSION_LOG)"
log "=== phase3-weekly done ==="
