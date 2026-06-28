# Enrichment-Auth Fire — Diagnostic Record (2026-06-28)

## Root-cause class: (c) CLI version regression — SELF-RESOLVED. Billing REFUTED.
A headless/launchd **credential-resolution regression** in Claude Code, introduced
~**2.1.177** (installed 2026-06-14 19:07) and fixed in **2.1.191** (installed
2026-06-25 13:25). Not a billing/subscription change; not a config defect.

## Evidence
- **Keystone — the discarded stderr, captured.** The pre-check
  (`scripts/auto-enrich.sh:325`) ran `echo ok | claude -p --output-format json
  >/dev/null 2>&1` — stderr discarded, so the literal failure was never logged.
  Re-run with stderr visible (full env, `CLAUDECODE` unset as the script does):
  `"subtype":"success","is_error":false`, exit 0, model responds, **standard tier,
  cost incurs** → billing/subscription **refuted**. The lone stderr line
  (`workspace has not been trusted`, `hasTrustDialogAccepted:false`) is a red
  herring — warns but still succeeds with full credentials.
- **Check-is-lying vs auth-dead fork.** Under a credential-context-stripped env
  (`env -i HOME PATH`), the identical command returns `"Not logged in · Please run
  /login"`, fast-fail ~1s. So the failure mode is **login-context availability**,
  not dead credentials → class (a)/(c), not (b).
- **Two clean version edges** (`logs/auto-enrich-*.log` vs
  `~/.local/share/claude/versions/` mtimes):
  - First fail 2026-06-15 01:02 — first scheduled run after 2.1.177 (Jun 14 19:07).
  - Continuous PASS from 2026-06-25 16:30 — first run after 2.1.191 (Jun 25 13:25).
  A coincidental re-login could explain recovery but not why the break began
  exactly at a version install. Both edges aligning to installs ⇒ (c).
- **Both timing signatures, one root** (durations computed from the logs):
  - Early **HANG** ≈3–8 min (182s, 184s on Jun 15; 486s Jun 20): the CLI stalls
    attempting credential resolution/refresh in the headless context.
  - Later **FAST-FAIL** ≈3–6s (uniform Jun 22–25): steady `Not logged in` once the
    token fully lapsed.
  Same regression, two token-staleness phases — NOT two separate faults. (The
  multi-thousand-second "durations" in a naive scan are awk mispairings: a
  SIGKILLed hung run logs no outcome, so a `Running` line bridges to a later run's
  failure. The script logs `auth check failed` only on a non-zero *return*.)
- **Current state:** healthy on 2.1.195 (this session); launchd PASS for 3 days.

## Premise outcomes
- "Mid-June billing cutoff" — **refuted** (CLI auto-update regression).
- "All daily runs failing / live fire" — **stale, caught by the brief's own Step
  0.2 staleness guard.** Mandatory live re-tabulation revealed recovery 3 days prior
  (Jun 25 16:30). This is a verify-the-premise **CATCH (the guard working as
  designed)**, not a stale-premise failure — do NOT count it toward the
  recurrence/verify-the-premise ledger. The session is a post-mortem, not a live
  firefight; enrichment freshness self-restored, no compounding bleed.
- **Blast radius confirmed:** enrichment is non-fatal to deploys — daily phases
  return 0 non-fatally, and empirically deploys ran Jun 13–15 while auth failed.

## Fix applied (class c/a — implementable, brief-sanctioned latent fix)
`scripts/auto-enrich.sh` pre-check now **persists** stdout+stderr to
`logs/auth-precheck-last.log`, parses the failure `reason`, flags `NOT LOGGED IN`
(→ re-auth) distinctly, and records an **env fingerprint** (`USER`, `CLAUDECODE`).
The fingerprint distinguishes a genuine launchd-context failure (`USER=chrism`)
from a stripped-env reproduction (`USER=<unset>` under `env -i`) — preventing the
observability fix from re-creating the S101/S109 false-"Not logged in" ambiguity
one layer up. **Control flow unchanged: fail iff exit non-zero (0 pass / 1 fail).**
Verified: `bash -n` clean; full-env → PASS; `env -i` → FAIL with `NOT LOGGED IN` +
`USER=<unset>`.

## Surfaced for Christos — NOT applied: version float vs. pin
Auto-update both **caused** (2.1.177) and **fixed** (2.1.191) this within 11 days.
Pinning to a known-good ≥2.1.191 prevents headless-auth regressions but forgoes
security/bugfix updates. Recommendation (Dev Planner, contingent on the deadman
shipping): **float + detect** — leave auto-update on, let the deadman's
enrichment-freshness arm catch a future regression in ~36h instead of 10 days,
rather than pin. Recorded as an open question in `decisions.md`; Christos's call.

## Feeds the deadman (next build)
Enrichment-freshness arm signals: (1) auth pre-check exits non-zero / `Not logged
in` in `logs/auth-precheck-last.log`, AND — more importantly — (2) **`MAX(enriched_at)`
staleness directly.** The upstream auth signal degraded gradually (hang→fast-fail
over days) while the user-visible symptom (no fresh enrichment landing) was the
cleaner trigger. Watch the outcome (`enriched_at` age), not only the precursor.
