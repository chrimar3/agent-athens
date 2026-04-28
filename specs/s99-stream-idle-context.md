# S99 Stream-Idle Context — Ground Truth

**Created:** 2026-04-28 (S99 Step 0)
**Purpose:** Forensic baseline + ground-truth verification for the S99 stream-idle wrapper rollout. Captures all Step 0 findings before any code/plist changes land.

## Claude Code version + install mechanism

```
$ claude --version
2.1.121 (Claude Code)

$ which claude
/Users/chrism/.local/bin/claude

$ ls -la /Users/chrism/.local/bin/claude
lrwxr-xr-x@ 1 chrism staff 50 Apr 28 13:29 /Users/chrism/.local/bin/claude -> /Users/chrism/.local/share/claude/versions/2.1.121

$ npm list -g @anthropic-ai/claude-code
/Users/chrism/.npm-global/lib
└── (empty)
```

**Install mechanism:** direct binary download via Anthropic installer. Not npm-global. Not Homebrew. Symlink in `~/.local/bin/` points to versioned directory.

**Target:** v2.1.105 (5-min stream watchdog + non-streaming retry, per Anthropic release notes ~four weeks ago).
**Status:** 16 patches past target. **No upgrade action needed for S99.**

## `--include-partial-messages` flag support

```
$ claude --help | grep -A 1 'include-partial'
  --include-partial-messages    Include partial message chunks as they arrive
                                (only works with --print and --output-format=stream-json)
```

**Verdict:** SUPPORTED. Will be used in the spike wrapper and promoted to `scripts/auto-enrich.sh` if not already present.

## Scripts invoking `claude -p` directly

```
$ grep -rn 'claude -p\|claude --print' scripts/
scripts/daily-automated.sh:9:    # NOTE: AI enrichment runs automatically via claude -p (see auto-enrich.sh).  ← comment
scripts/auto-enrich.sh:6:        # Runs Claude Code CLI (`claude -p`) to enrich events automatically.        ← comment
scripts/auto-enrich.sh:89:       # claude -p with --output-format text (the exact flags we use on line 214)  ← comment
scripts/auto-enrich.sh:214:      [ACTIVE INVOCATION]
scripts/auto-enrich.sh:225:     log "[DRY RUN] Would clean temp-briefs, generate $BATCHES batches, run claude -p on each"  ← comment
scripts/auto-enrich.sh:286-294: [ACTIVE INVOCATION CONTEXT]
scripts/migrate-enrichment-log-observability.ts:11: documentation comment
```

**Single active invoker:** `scripts/auto-enrich.sh`. All other matches are documentation comments.

**Path determination:** Path A (single script) confirmed.

## Plist → script mapping (transitive `claude -p` reach)

| Plist | ProgramArguments | Mode | `claude -p` reach | In S99 scope |
|---|---|---|---|---|
| `com.agentathens.auto-enrich` | `bash auto-enrich.sh` | direct | YES (direct) | ✓ |
| `com.agentathens.daily` | `bash -c daily-automated.sh` | full | YES (transitive via daily-automated.sh:324 → auto-enrich.sh) | ✓ |
| `com.agentathens.enrichment` | `bash -c daily-automated.sh enrichment` | enrichment | YES (transitive) | ✓ |
| `com.agentathens.enrichment-01` | same as above | enrichment | YES (transitive) | ✓ |
| `com.agentathens.enrichment-13` | same as above | enrichment | YES (transitive) | ✓ |
| `com.agentathens.enrichment-16` | same as above | enrichment | YES (transitive) | ✓ |
| `com.agentathens.enrichment-19` | same as above | enrichment | YES (transitive) | ✓ |
| `com.agentathens.enrichment-22` | same as above | enrichment | YES (transitive) | ✓ |
| `com.agentathens.enrichment-check` | `bash daily-enrichment-check.sh` | check | NO | ✗ |
| `com.agentathens.freshness` | `bash -c daily-automated.sh freshness` | freshness | NO (freshness mode runs scrapers/dedup/build/deploy, not enrichment) | ✗ |
| `com.agentathens.monitor-visibility` | `bun run monitor-search-visibility.ts` | monitor | NO | ✗ |

**Total in scope:** 8 plists (3 excluded — explicitly DO NOT touch).
**All 11 currently loaded** (post-S97b reload, all PIDs `-` idle as of S99 Step 0 capture).

## `caffeinate` state in `auto-enrich.sh`

```
$ grep -n 'caffeinate' scripts/auto-enrich.sh
110:#      the previous `caffeinate -s sleep` which was paused by clamshell sleep
118:# R1.A test 2026-04-08 (753s for caffeinate -i sleep 300 on battery+clamshell)
263:# caffeinate was previously used to assert against idle sleep but did NOT
328:#    Previously `caffeinate -s sleep N` was used to survive idle sleep, but
329:#    caffeinate does not prevent lid-close sleep — sleeps of 30 min stretched
331:#    See specs/claude-hang-diagnostic.md for the original caffeinate tests.
```

**State:** NOT in active code. All `caffeinate` references are comments documenting deliberate removal due to lid-close sleep failure.

**S99 decision (per user):** leave removed. The lid-close concern is orthogonal to stream-idle and belongs to a separate session.

## Apr 25-26 stall pattern (referenced for S99 baseline floor)

Source: S97a Phase 1 verified `logs/auto-enrich-2026-04-{16..27}.log`.

| Date | Stream-idle timeout count | Note |
|---|---|---|
| 2026-04-16 | 4 | absorbed |
| 2026-04-17 | 8 | absorbed |
| 2026-04-18 | 7 | absorbed |
| 2026-04-19 | 5 | absorbed |
| 2026-04-20 | 1 | absorbed |
| 2026-04-23 | 3 | absorbed |
| 2026-04-24 | 2 | absorbed |
| 2026-04-25 | 4 | **CASCADE: 0 events enriched** |
| 2026-04-26 | 6 | **CASCADE: 0 events enriched** |
| 2026-04-27 | 0 | clean recovery |

**JSONL files in `~/.claude/projects/...`:** these are interactive Claude Code sessions (event types `last-prompt`, `attachment`); auto-enrich output goes to `logs/auto-enrich-*.log` only. No additional forensic data in `~/.claude/projects/`.

**Pattern matches:** GitHub Issue #25979 (process alive at 0% CPU, mid-thinking-block, `stop_reason: null`).

## Optional: status.claude.com Apr 25-27 incident lookup

Skipped during Step 0 — local logs already establish the #25979 symptom unambiguously. Worth doing as a low-priority follow-up if the watchdog-era observation window (specs/s99-baseline-floor.md) shows unexpected results.

## Outputs feeding into subsequent steps

- Step 1 SKIP: version is past target.
- Step 2 spike: use `--include-partial-messages` (supported), `--output-format stream-json`, `CLAUDE_STREAM_IDLE_TIMEOUT_MS=300000`, `CLAUDE_ENABLE_BYTE_WATCHDOG=1`.
- Step 3 Path A: single-script inline promotion to `scripts/auto-enrich.sh`. No helper extraction.
- Step 4: 8 plists in scope (listed above); 3 explicitly excluded.
- Caffeinate: leave removed.
