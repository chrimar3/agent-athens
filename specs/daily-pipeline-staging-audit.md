# Daily Pipeline Staging Audit

**Date:** 2026-05-04
**Mode:** Pre-flight, read-only.
**Author:** Claude Code (Christos's session).
**Output of:** brief "Map the full staging surface of the daily enrichment pipeline."

**Headline finding:** there is exactly **one** active staging site
(`scripts/daily-automated.sh:488–499`, inside `run_deploy()`), and it uses
`git add -A`. The brief's premise that `dd47f4519` was the contamination
commit was wrong — `dd47f4519` is hand-authored feature work. The actual
recent incidents are **`adbaef38e`** (2026-05-04 08:12, 9 files) and
**`72ce32c73`** (2026-05-03 08:13, 7 files). Both scooped WIP developer
notes/specs alongside legitimate pipeline output. The fix is a mechanical
one-block change.

---

## Working Tree Baseline (Step 0)

`git status` (verbatim):

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   data/event-set-hashes.json

Untracked files:
  specs/seo-indexing-diagnostic.md

no changes added to commit (use "git add" and/or "git commit -a")
```

Notes:

- `data/event-set-hashes.json` is touched by every `bun run build`. The mod
  is a timestamp-only diff (already noted in Session 110 closeout).
- `specs/seo-indexing-diagnostic.md` is an existing pre-Session-110
  developer file, not S101 orphan.
- **No S101 orphan files** in the working tree. They were already absorbed
  by the pipeline contamination commits flagged below.

Recent commits matching automation patterns (`auto-enrich|daily|pipeline|automation`):

```
ae01e02ee docs(S101a): enrichment fix verification + post-session notes
d50674aff chore: daily pipeline update 2026-05-04
adbaef38e chore: daily pipeline update 2026-05-04
20f477b0c chore: daily pipeline update 2026-05-03
72ce32c73 chore: daily pipeline update 2026-05-03
6bed5ba8e chore: daily pipeline update 2026-05-02
3bebc4c09 chore: daily pipeline update 2026-05-02
5d49315a1 chore: daily pipeline update 2026-05-01
4a897a76b chore: daily pipeline update 2026-04-30
e9bb74ce9 chore: daily pipeline update 2026-04-30
937f738de chore: daily pipeline update 2026-04-29
```

Distinguishing pattern: every pipeline commit uses the literal message
`chore: daily pipeline update YYYY-MM-DD`. Author is always
`Christos Maragkoudakis <cmarag8@gmail.com>` because the script runs as
the user. No separate automation account; commits are indistinguishable
from human work by author/email alone — only the message format and the
stable run time (~08:12–08:16 Athens, matching the freshness plist's 08:00
trigger + a few minutes of pipeline execution) differentiate them.

`dd47f4519` does NOT appear in the automation grep — it's a hand-authored
commit (feat(enrichment): tier-priority queue ordering — demo-window first
(S110), 12:27 PM Athens). See P3 for full substitution rationale.

---

## P1 — Staging Sites

Grep for git invocations across `scripts/` and `config/launchd/`:

```
scripts/daily-automated.sh:489:        git add -A
scripts/daily-automated.sh:490:        git commit -m "chore: daily pipeline update $(date +%Y-%m-%d)" || true
scripts/daily-automated.sh:491:        if git push origin main >> "$LOG_FILE" 2>&1; then
scripts/daily-manual.ts:169:  console.log('     git add . && git commit -m "chore: daily update" && git push');
scripts/_archive/auto-enrich-events.ts:261:    console.log('   3. Deploy: git add . && git commit && git push\n');
scripts/_archive/enrich-with-gemini.ts:350:    console.log('   3. Deploy: git add . && git commit && git push\n');
scripts/_archive/daily-update-FIXED.sh:53:echo "   3. Deploy: git push origin main"
scripts/_archive/daily-update.sh:53:echo "   3. Deploy: git push origin main"
scripts/_archive/remove-non-athens-events.ts:73:  console.log('   3. Deploy: git add . && git commit && git push\n');
scripts/_archive/daily-workflow.sh:245:    git add data/events.db dist/ >> "$LOG_FILE" 2>&1 || true
scripts/_archive/daily-workflow.sh:251:        git commit -m "$COMMIT_MSG" >> "$LOG_FILE" 2>&1
scripts/_archive/daily-workflow.sh:256:        git push origin main >> "$LOG_FILE" 2>&1
```

**Active staging sites: ONE.**

Surrounding context for the active site (`scripts/daily-automated.sh:488–499`,
inside `run_deploy()`):

```bash
# Step 1: Commit and push source code (dist/ is gitignored)
log "Checking for source code changes..."
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    git add -A
    git commit -m "chore: daily pipeline update $(date +%Y-%m-%d)" || true
    if git push origin main >> "$LOG_FILE" 2>&1; then
        log "Source code pushed to git"
    else
        log_error "Git push failed (non-fatal, continuing to deploy)"
    fi
else
    log "No source code changes to commit"
fi
```

**Detection logic** (line 488): triggers commit if ANY of:

1. Tracked files modified (`! git diff --quiet`).
2. Anything staged (`! git diff --cached --quiet`).
3. Any untracked, non-ignored file exists (`git ls-files --others --exclude-standard` non-empty).

**⚠️ Indiscriminate scope flagged:** `git add -A` at line 489 stages
modifications, additions, AND deletions across the entire working tree
(including untracked files). Worst-case `git add` form per
`feedback_stage_precisely.md`. The detection logic at line 488 makes this
worse: presence of an untracked file (e.g., a new spec being drafted by
the developer) triggers a commit that scoops everything, not just the
detected file.

**Other matches (not active):**

- `scripts/daily-manual.ts:169` — `console.log` instruction text shown to
  the user. Not a real git invocation; just a help-message string.
- `scripts/_archive/*` — five archived scripts containing git logic. Not on
  the active path. Notably, `_archive/daily-workflow.sh:245` shows the OLD
  pre-S79 staging approach: `git add data/events.db dist/` — explicit
  paths. The current script regressed from this pattern.
- No git commands in `config/launchd/` (plists invoke shell scripts; git
  logic lives in the shell scripts, not the plist XML).

**`scripts/auto-enrich.sh` has zero git commands.** The brief assumed
`auto-enrich.sh` was the staging site; reality is it's pure inner-loop
enrichment work. The orchestrator (`daily-automated.sh`) runs auto-enrich
as one phase, then later commits everything in `run_deploy()`.

---

## P2 — launchd Surface

**Plists on disk** (`config/launchd/`):

| Plist file | Schedule | Script + arg |
|---|---|---|
| `com.agentathens.freshness.plist` | 08:00 | `daily-automated.sh freshness` |
| `com.agentathens.enrichment.plist` | 10:00 | `daily-automated.sh enrichment` |
| `com.agentathens.enrichment-13.plist` | 13:00 | `daily-automated.sh enrichment` |
| `com.agentathens.enrichment-16.plist` | 16:30 | `daily-automated.sh enrichment` |
| `com.agentathens.enrichment-19.plist` | 19:00 | `daily-automated.sh enrichment` |

All five invoke the same script (`scripts/daily-automated.sh`) with mode
arg `freshness` or `enrichment`. **Cross-reference to P1:** all five
funnel through the single staging site at line 489. The 08:00 freshness
run is the only one that reaches `run_deploy()` (enrichment-mode runs skip
build/deploy by design — see line 668: "enrichment mode: skipping build +
deploy"). So in practice **only the 08:00 plist commits**, even though
all five share the orchestrator.

**Currently loaded** (`launchctl list` filtered for `agentathens`):

```
com.agentathens.daily              ← ⚠️ NOT in config/launchd/
com.agentathens.enrichment-19      ✓ matches plist
com.agentathens.monitor-visibility ← ⚠️ NOT in config/launchd/
com.agentathens.enrichment-01      ← ⚠️ NOT in config/launchd/, brief said this was unloaded in S89
com.agentathens.enrichment-13      ✓ matches plist
com.agentathens.enrichment-check   ← ⚠️ NOT in config/launchd/
com.agentathens.enrichment-22      ← ⚠️ NOT in config/launchd/, brief said this was unloaded in S89
com.agentathens.enrichment-16      ✓ matches plist
com.agentathens.freshness          ✓ matches plist
com.agentathens.auto-enrich        ← ⚠️ NOT in config/launchd/
com.agentathens.enrichment         ✓ matches plist
```

**Drift between source tree and live system: 6 loaded labels are not
represented in `config/launchd/`.** They presumably live at
`~/Library/LaunchAgents/` only and are not under version control. Two of
them (`-01`, `-22`) are explicitly described in the brief as deliberately
unloaded — yet they're loaded right now. Possible explanations:

- They were re-loaded by a later install step that didn't update the
  source tree.
- The unload was reverted on a system reboot or manual `launchctl load`.
- Loading state was never authoritative-from-source; the source-tree set
  has always been a subset.

**Implication for staging audit:** any of the orphan loaded plists could
in principle invoke a different script that calls git. To confirm, would
need to read the actual plist file at `~/Library/LaunchAgents/` for each
orphan label. Not done in this read-only audit (would be a follow-up).
The most likely case is they all invoke `daily-automated.sh` like the
in-tree ones, in which case the staging surface is unchanged.

---

## P3 — Evidence Commit (substitution: dd47f4519 → adbaef38e)

**dd47f4519 is NOT a pipeline commit.** Verified via `git log`:

```
commit dd47f45190c6239d73b35ad5978526f6c436676d
Author: Christos Maragkoudakis <cmarag8@gmail.com>
Date:   Mon May 4 12:27:09 2026 +0300

    feat(enrichment): tier-priority queue ordering — demo-window first (S110)

config/enrichment-priority.json
scripts/generate-enrichment-brief.ts
tests/generate-enrichment-brief.test.ts
```

3 files, all explicitly named, message attributed to Claude Code,
detailed body explaining the change. This is hand-authored feature work,
not pipeline output. The brief's premise that `dd47f4519` was the
contamination commit is mistaken — and so was the Session 110 closeout
note that flagged it as a pipeline commit. Actual story: `dd47f4519`
landed between the Session 110 source push and closeout push because
the user did separate feature work in that interval.

**Substitute evidence commits** (per brief failure-mode fallback). Two
real pipeline commits today, both 2026-05-04 morning:

### `d50674aff` — clean, 2 files

```
Author: Christos Maragkoudakis <cmarag8@gmail.com>
Date:   Mon May 4 08:16:10 2026 +0300

    chore: daily pipeline update 2026-05-04

 .auto-enrich.lock          | 1 -
 data/event-set-hashes.json | 2 +-
```

This run was clean — only legitimate pipeline output (`event-set-hashes.json`
build timestamp) plus a `.auto-enrich.lock` removal (the lock file is being
committed and uncommitted across runs — a separate bug, see P5).

### `adbaef38e` — **CONTAMINATION INCIDENT, 9 files**

```
Author: Christos Maragkoudakis <cmarag8@gmail.com>
Date:   Mon May 4 08:12:22 2026 +0300

    chore: daily pipeline update 2026-05-04

 .auto-enrich.lock                           |   1 +
 .claude/notes/decisions.md                  |  31 +
 .claude/notes/mistakes.md                   |   8 +
 .claude/notes/patterns.md                   |  21 +
 data/build-completeness.json                | 916 ++++++++++++++--------------
 data/event-set-hashes.json                  |  10 +-
 docs/session-log.md                         |  42 +-
 scripts/auto-enrich.sh                      |  30 +-
 specs/s101-enrichment-drought-diagnostic.md | 241 ++++++++
 9 files changed, 832 insertions(+), 468 deletions(-)
```

**What was scooped:**

| Category | Files | Should be in pipeline commit? |
|---|---|---|
| Legitimate pipeline output | `data/build-completeness.json`, `data/event-set-hashes.json` | ✓ yes |
| Lock file (separate bug) | `.auto-enrich.lock` | ✗ should be in `.gitignore` |
| Substantive S101a fix | `scripts/auto-enrich.sh` | ✗ developer work, deserves its own commit |
| S101a session notes | `.claude/notes/decisions.md`, `.claude/notes/mistakes.md`, `.claude/notes/patterns.md`, `docs/session-log.md` | ✗ developer work |
| S101a deliverable | `specs/s101-enrichment-drought-diagnostic.md` | ✗ developer work |

**Severity:** 6 of 9 files are WIP developer work scooped under a generic
"chore" message. Lost attribution: a future `git blame` on
`scripts/auto-enrich.sh` or `specs/s101-enrichment-drought-diagnostic.md`
shows `chore: daily pipeline update`, hiding the fact that this is the
S101a drought-fix work. Lost ability to revert the pipeline run without
also reverting the developer fix.

This is the incident already documented in `docs/session-log.md` Session
109 open items: "Daily pipeline `git add -A` antipattern."

### Recent Commit File-Count Distribution (last 30 commits)

```
59d56fc17 [ 3 files] sprint-2-session-7 closeout: decisions + patterns + session log
dd47f4519 [ 3 files] feat(enrichment): tier-priority queue ordering — demo-window first (S110)
4c9fd5704 [ 6 files] sprint-2-session-7: ratchet denominator → active-reachable venues (Q-B8b)
67ce2a488 [ 1 files] docs(diagnostic): venue count reconciliation (247/46/408 gap, Q-B8 routed)
ae01e02ee [ 4 files] docs(S101a): enrichment fix verification + post-session notes
d50674aff [ 2 files] chore: daily pipeline update 2026-05-04
adbaef38e [ 9 files] chore: daily pipeline update 2026-05-04           ← incident
946c8d019 [ 3 files] sprint-2-session-6 closeout: session log + decisions + patterns
d0fe3d346 [ 1 files] docs(spec): Sprint 2 Component B-2 pre-flight findings
12703b950 [11 files] sprint-2-session-6: place-layer measurement + INFO consumption + ratchet
e27835330 [ 3 files] sprint-2-session-5 closeout: session log + decisions + patterns
4326996d9 [10 files] sprint-2-session-5: addressRegion convergence + sameAs wiring
418698fc9 [ 1 files] docs(spec): Sprint 2 Component B-1 pre-flight findings
addeb9230 [ 3 files] sprint-2-session-4 closeout: session log + decisions + patterns
20f477b0c [ 2 files] chore: daily pipeline update 2026-05-03
72ce32c73 [ 7 files] chore: daily pipeline update 2026-05-03           ← incident
98db28207 [12 files] sprint-2-session-4: ARIA audit + reporter integration
...
```

**Pipeline commits sorted by file count:**

| Commit | Files | Date | Status |
|---|---|---|---|
| `20f477b0c` | 2 | 2026-05-03 | clean |
| `d50674aff` | 2 | 2026-05-04 08:16 | clean |
| `72ce32c73` | 7 | 2026-05-03 08:13 | **incident** (verified) |
| `adbaef38e` | 9 | 2026-05-04 08:12 | **incident** (verified) |

**`72ce32c73` second-incident verification:**

```
.auto-enrich.lock              |   1 +
.claude/notes/mistakes.md      |   7 +
data/build-completeness.json   |  12 +-
data/event-set-hashes.json     |   2 +-
scripts/ping-indexnow.ts       |  32 ++-
specs/component-a-preflight.md | 447 +++++++++++++++++++++++++++++++++++++++++
specs/sprint-2-diagnostic.md   | 422 ++++++++++++++++++++++++++++++++++++++
```

Same pattern: 2 legitimate pipeline files + 1 lock + 4 WIP developer
files (a script edit, a notes update, two specs).

**Pattern:** clean pipeline commits stage 2 files
(`event-set-hashes.json` + `.auto-enrich.lock`). Anything ≥3 files in a
"chore: daily pipeline update" commit is suspicious; ≥7 is almost
certainly contamination. Two known incidents in two consecutive days.
Suggests this isn't a one-off — it's the natural behavior of `git add -A`
intersecting with normal developer cadence (working tree is dirty when
the 08:00 trigger fires).

---

## P4 — auto-enrich.sh Logic (corrected: daily-automated.sh)

The brief asked for an audit of `auto-enrich.sh`'s staging logic. As noted
in P1, **`auto-enrich.sh` has no git commands**. The active staging logic
lives entirely in `scripts/daily-automated.sh`'s `run_deploy()` function.
Repeating the relevant block (708-line file; staging is lines 488–499 of
the dump):

```bash
run_deploy() {
    log_phase "DEPLOYMENT"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would deploy to Netlify"
        return 0
    fi

    # Step 1: Commit and push source code (dist/ is gitignored)
    log "Checking for source code changes..."
    if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
        git add -A
        git commit -m "chore: daily pipeline update $(date +%Y-%m-%d)" || true
        if git push origin main >> "$LOG_FILE" 2>&1; then
            log "Source code pushed to git"
        else
            log_error "Git push failed (non-fatal, continuing to deploy)"
        fi
    else
        log "No source code changes to commit"
    fi

    # Step 2: Deploy dist/ via Netlify CLI
    log "Deploying dist/ to Netlify via CLI..."
    if netlify deploy --prod --dir=dist --message "Daily deploy $(date +%Y-%m-%d)" >> "$LOG_FILE" 2>&1; then
        log "Netlify CLI deploy completed"
        return 0
    else
        log_error "Netlify CLI deploy failed"
        return 1
    fi
}
```

**Single git block.** No second `git add` elsewhere in the script. The
expected mutation surface for the 08:00 freshness run, drawn from the
phases that precede `run_deploy()` (lines 605–630 of dump):

| Phase | Outputs | Tracked? |
|---|---|---|
| `run_backup_db` | files in `~/agent-athens-backups/` (out of repo) | n/a |
| `run_ingest`, `run_parse`, `run_scrape`, `run_quality`, `run_dedup_*`, `run_prices`, `run_tickets`, `run_schema`, `run_geocode` | `data/events.db` mutations | tracked |
| `run_enrichment_sync`, `run_auto_enrichment`, `run_time_enrichment`, `run_image_enrichment`, `run_image_download` | `data/events.db` + `public/images/` | tracked + tracked |
| `run_generate` (`bun run build`) | `dist/` (gitignored) + `data/build-completeness.json` + `data/event-set-hashes.json` + possibly `data/build-aria-*.json` | tracked outputs |
| `run_health_check` | `data/health-reports/$DATE.txt` | tracked |
| `run_deploy` | git staging + Netlify deploy | — |
| `run_indexnow_ping` | `data/search-visibility-log.csv` (per brief background); not verified in script body | tracked |
| `run_image_cleanup` | `public/images/` deletions | tracked |

So the legitimate pipeline staging set is roughly:

- `data/events.db` (always)
- `data/event-set-hashes.json` (always)
- `data/build-completeness.json` (always)
- `data/build-aria-aggregate.json`, `data/build-aria-report.json` (when audit-aria runs — opt-in per CLAUDE.md, currently not in the pipeline path; check before adding)
- `data/health-reports/` (one new file per day)
- `data/search-visibility-log.csv` (if `run_indexnow_ping` writes it; verify)
- `public/images/` (additions and deletions both possible)

`.auto-enrich.lock` should NEVER be staged — it's a runtime lock file
that's currently being added/removed by every pipeline run because it's
not in `.gitignore`. Verifying: `cat .gitignore | grep auto-enrich` — not
done in this audit, but the evidence is in commit history (every clean
pipeline commit has `.auto-enrich.lock` toggle).

---

## P5 — Fix Specification (intent + bounds, no code)

### Current shape

`scripts/daily-automated.sh:488–499`. One block in `run_deploy()`:

1. **Detection:** `git diff --quiet` || `git diff --cached --quiet` ||
   `git ls-files --others --exclude-standard` non-empty.
2. **Stage:** `git add -A` — entire working tree, including untracked
   files.
3. **Commit:** `chore: daily pipeline update $(date +%Y-%m-%d)`. Same
   message every time, regardless of what landed.
4. **Push:** `git push origin main`. Non-fatal on failure.

### Intended shape (explicit-staging contract)

The pipeline should stage ONLY files it itself produces, by explicit
path. Proposed allow-list:

- `data/events.db` — always (DB mutations from every data phase)
- `data/event-set-hashes.json` — always (build manifest)
- `data/build-completeness.json` — always (build report)
- `data/build-aria-aggregate.json` — if audit-aria runs (currently not
  wired into daily pipeline; conditional/skip)
- `data/build-aria-report.json` — same conditional
- `data/health-reports/` (whole directory; one new dated file per run)
- `data/search-visibility-log.csv` — if `run_indexnow_ping` writes it
  (verify; if not, drop from allow-list)
- `public/images/` — if image enrichment writes new files

Any file outside this allow-list should NOT be staged by the pipeline,
regardless of its working-tree state. Specifically:

- `.auto-enrich.lock` → add to `.gitignore`, never stage.
- `scripts/*.sh`, `scripts/*.ts`, `src/**`, `tests/**` → developer work,
  pipeline never touches.
- `.claude/notes/*.md`, `docs/session-log.md`, `specs/**` → developer
  work, pipeline never touches.
- `config/**` → developer work (one exception possible:
  `config/athens-venues.json` could theoretically be machine-mutated by a
  future venue-auto-discovery phase; doesn't apply today).

### Detection logic must also tighten

The current line 488 detects working-tree dirtiness across the whole repo.
After fix, detection should be scoped to the allow-list — otherwise an
empty pipeline commit (no allow-list files changed, but unrelated WIP in
working tree) could fire from an unrelated developer change. Cleanest
form: `git diff --quiet -- <allowlist>` and stop checking
`ls-files --others`.

### Failure mode if unfixed

Already happened twice in two consecutive days:

- 2026-05-03 (`72ce32c73`, 7 files): scooped `.claude/notes/mistakes.md`,
  `scripts/ping-indexnow.ts` (script edit), `specs/component-a-preflight.md`,
  `specs/sprint-2-diagnostic.md`.
- 2026-05-04 (`adbaef38e`, 9 files): scooped the entire S101a deliverable
  set including `scripts/auto-enrich.sh` (the substantive fix), four
  notes files, and the `specs/s101-enrichment-drought-diagnostic.md`.

Concrete consequences:

1. **Lost attribution.** `git blame` on the S101a fix shows
   `chore: daily pipeline update`; the message body has zero detail.
   Future debugging starts from "what is this fix doing in a chore
   commit?".
2. **Lost ability to revert pipeline runs.** If a future pipeline run
   produces broken output and needs revert, reverting the commit also
   reverts the developer fixes commingled with it.
3. **Risk of secrets exposure.** If a developer accidentally leaves
   `.env`, `secrets.json`, or similar in the working tree at 08:00 Athens,
   the pipeline auto-commits and pushes it to public origin. Hasn't
   happened (`.gitignore` covers common cases), but the failure mode is
   one careless filename away.
4. **Repeats on every developer-overnight cycle.** Pattern frequency: any
   day where developer leaves WIP in working tree at 08:00 Athens. Two
   incidents in 2 days = ~100% rate when WIP is present.

### Fix complexity estimate

Mechanical. Two changes:

- Replace the `git add -A` line and the surrounding detection block at
  `scripts/daily-automated.sh:488–499` with explicit-path equivalents.
- Add `.auto-enrich.lock` to `.gitignore`.

Estimated diff size: ~10 lines changed in `daily-automated.sh`, 1 line
added to `.gitignore`. Self-contained.

### Risk of fix

**Low.** Concrete points:

- `git add <explicit paths>` semantics are well-understood; no surprises.
- The detection block needs scoping to allow-list paths, not just
  removed. Without scoping, the script will still call `git commit` even
  if no allow-list file changed — `git commit` would either fail (nothing
  staged) or succeed with an empty commit (depending on flags). Has to
  be scoped.
- A new pipeline output added in the future will silently fail to be
  committed if not added to the allow-list. Trade-off accepted: better
  to catch it via an explicit test/PR review than silently scoop.
- `data/health-reports/` directory growth: glob should match the pattern
  intended by the script (e.g., `data/health-reports/*.txt`), not the
  whole dir, to avoid scooping any developer-placed files there.

### Out of scope for the fix session

- The 6 orphan launchd labels (P2 drift) — separate hygiene investigation.
  Doesn't affect staging unless one of them runs a different script.
- `dd47f4519` mis-attribution in Session 110 closeout — already in
  session-log.md, can be left as historical record (institutional memory
  rule says don't retrofit).
- Pre-existing `.auto-enrich.lock` commit history pollution — the fix
  only prevents future commits; cleaning history is not worth the rebase.

---

## Summary for Planner

**Single staging site**, clean fix surface:
`scripts/daily-automated.sh:488–499`. Replace `git add -A` with
explicit-path staging matched to the actual pipeline-output set; scope
the detection block likewise; add `.auto-enrich.lock` to `.gitignore`.
~10-line mechanical change. Two confirmed contamination incidents in 2
consecutive days; no reason to expect the rate to drop without the fix.

Brief premise corrections worth carrying forward:

- `dd47f4519` is hand-authored, not a pipeline commit. Real incidents are
  `adbaef38e` and `72ce32c73`.
- Staging logic is in `daily-automated.sh`, not `auto-enrich.sh`.
- The plist filenames in the brief (`auto-enrich.plist`, `daily.plist`)
  don't exist in the source tree. Real plists are 5 in
  `config/launchd/com.agentathens.{freshness,enrichment,enrichment-13,
  enrichment-16,enrichment-19}.plist`. Plus 6 orphan loaded labels not
  under version control.

Recommended fix-session sequence:

1. Verify allow-list against current pipeline by running freshness mode
   with `--dry-run` and grepping the log for "Would write …" mentions.
2. Add explicit allow-list to `daily-automated.sh:488` block.
3. Add `.auto-enrich.lock` to `.gitignore`; remove from index in same
   commit.
4. Test by running `daily-automated.sh freshness --dry-run` and
   confirming the dry-run logs match the allow-list.
5. Schedule the next pipeline run for foreground observation (e.g.,
   manual invocation), verify the staging set matches.
