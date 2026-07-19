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
PHASE3_WT="/Users/chrism/Project with Claude/AgentAthens/agent-athens-phase3"
MAIN_REPO="/Users/chrism/Project with Claude/AgentAthens/agent-athens"
LOG_DIR="$MAIN_REPO/logs"
RUN_LOG="$LOG_DIR/phase3-weekly.log"
CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
[ -x "$CLAUDE_BIN" ] || CLAUDE_BIN="$(command -v claude || echo /usr/local/bin/claude)"
MAX_SESSION_SECONDS=10800  # 3h watchdog for layer 2

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$RUN_LOG"; }

log "=== phase3-weekly start ==="

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
cp "$MAIN_REPO/data/events.db" "$PHASE3_WT/data/events.db" 2>>"$RUN_LOG" || layer1_status="db-copy-failed"

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

(
  cd "$PHASE3_WT" && "$CLAUDE_BIN" -p "$PROMPT" --permission-mode acceptEdits >> "$SESSION_LOG" 2>&1
) &
CLAUDE_PID=$!
( sleep "$MAX_SESSION_SECONDS" && kill -9 "$CLAUDE_PID" 2>/dev/null && echo "[watchdog] killed session after ${MAX_SESSION_SECONDS}s" >> "$SESSION_LOG" ) &
WATCHDOG_PID=$!
wait "$CLAUDE_PID"
SESSION_RC=$?
kill "$WATCHDOG_PID" 2>/dev/null
log "L2: session finished rc=$SESSION_RC (log: $SESSION_LOG)"
log "=== phase3-weekly done ==="
