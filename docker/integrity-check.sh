#!/bin/bash
# Host-side integrity check around every container run (called by aa-run.sh).
# Runs on the Mac, bash 3.2 compatible, and never parses files the container
# produced except through git after git's own metadata has been verified.
#
# Containers see the code paths read-only (aa-run.sh CODE_MOUNTS), so they
# cannot rewrite scripts the Mac later runs. What a read-only mount cannot
# stop is checked here instead:
#   1. nothing in .git that steers git changed — config, hooks, commondir,
#      info/, worktrees/, alternates, HEAD … (checked before running any git,
#      because git config can make git itself execute commands);
#   2. commits made during the run — on the checked-out branch and on the
#      pipeline-data branch the publish run pushes — touch only data paths
#      (a commit can carry any content without touching the working tree);
#   3. no new file appeared at the repo root (e.g. a planted CLAUDE.md, which
#      agent sessions load as instructions, or .npmrc, which package installs
#      obey);
#   4. nothing was staged for your next commit, no other branch, tag or the
#      stash moved, and nothing but regular files and folders is in the
#      folders runs may write: no symlink (a later Mac-side job could
#      otherwise write through it into $HOME), FIFO (a Mac-side read or copy
#      would hang on it), socket or device file;
#   5. git's object store only grew: every file that was in .git/objects is
#      still there, same size and inode, and any loose object or pack that was
#      written or touched during the run still holds exactly the content its
#      name promises; new loose objects hash to their names and new packs pass
#      `git verify-pack`. (A run with a writable .git could otherwise replace
#      an existing object's bytes, and a later `git stash` or checkout on the
#      Mac would write the planted content into a tracked script.) Objects are
#      immutable and the container never gcs or repacks (aa-run.sh passes
#      gc.auto=0), so a vanished or repacked file is itself an alarm;
#   6. no instruction file for AI agents (CLAUDE.md, AGENTS.md, .cursorrules,
#      a .claude/ folder … any letter case) appeared anywhere in the folders
#      runs may write (existing ones only get a warning at snapshot time);
#   7. git's operation state did not change: no stash reflog entry, no
#      ORIG_HEAD/FETCH_HEAD/MERGE_HEAD/…/AUTO_MERGE, no rebase or sequencer
#      folder (a later `git stash pop`, `git reset --hard ORIG_HEAD` or
#      `git rebase --continue` on the Mac would apply what they point to);
#      every other reflog only grew, by entries for commits the run was
#      allowed to make; remote-tracking refs moved only where the publish
#      run's push moves them (origin/main, origin/pipeline-data, to the local
#      branch tip); and no tracked file outside the data paths changed in the
#      working tree;
#   8. no code, test or package/tool config file (*.ts, *.js, *.sh, *.py …,
#      *.test.*, *_spec.*, package.json, bunfig.toml, tsconfig*.json, .npmrc
#      …, any letter case) appeared in the folders runs may write — in dist/,
#      which holds the site's own .js/.mjs, only tests and package/tool config
#      count — or was committed under data/ (existing ones only get a warning
#      at snapshot time).
#
#   docker/integrity-check.sh snapshot STATE_FILE
#   docker/integrity-check.sh verify   STATE_FILE JOB
#
# On failure: evidence goes to $AA_STATE_DIR/quarantine/<time>/, bad commits
# are moved to a quarantine/<time> branch and HEAD is reset (--mixed: your
# uncommitted edits stay), planted root files are moved into the evidence
# folder, $AA_STATE_DIR/QUARANTINE is written (aa-run.sh then refuses every
# job until you review and delete it), and an alert is sent.
set -u
# Replacement refs (refs/replace/*) make git show substituted content for any
# object; every git command here must see the real objects.
export GIT_NO_REPLACE_OBJECTS=1
# Nothing inherited may point git at another repository or object store.
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
      GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT

# What a pipeline commit may touch (run_deploy's allowlist is a subset).
# Nothing under docs/: the decisions queue is generated into data/ now, and
# no file agents read as documentation may be written by a run.
DATA_PATHS_RE='^data/'
# Root-level entries the pipeline itself creates.
ROOT_RUNTIME_RE='^(\.pipeline-[a-z-]+\.lock|\.pipeline-publish-ready|\.auto-enrich\.lock\.d|temp|tmp|temp-[a-z-]+|dist|logs|node_modules|\.netlify|\.cache)$'

# The folders runs may write (aa-run.sh RW_TOP). node_modules is left out:
# compose.yaml mounts an anonymous volume over it, so no container ever
# writes the Mac's copy.
RW_DIRS="data dist logs temp tmp temp-descriptions temp-briefs temp-research"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${AA_INTEGRITY_REPO:-$(cd "$HERE/.." && pwd)}"  # override for tests only
STATE_DIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}"
MODE="${1:-}"; STATE_FILE="${2:-}"; JOB="${3:-job}"

# Everything in .git that can change what git DOES (config, hooks, commondir,
# info/, worktrees/, modules/, objects/info/alternates, HEAD …) must be
# byte-identical after a run. Only what an ordinary commit/fetch writes may
# change.
GIT_VOLATILE_RE='^(objects/[0-9a-f]{2}/|objects/pack/|refs/|logs/|index$|index\.lock$|ORIG_HEAD$|FETCH_HEAD$|COMMIT_EDITMSG$|packed-refs$|gc\.log$|AUTO_MERGE$|shallow$)'
hash_git_meta() {  # path + content of every non-volatile file and link in .git
    (cd "$REPO/.git" && find . \( -type f -o -type l \) | sed 's|^\./||' | grep -Ev "$GIT_VOLATILE_RE" | LC_ALL=C sort \
        | while IFS= read -r f; do
              printf '== %s\n' "$f"
              if [ -L "$f" ]; then readlink "$f"; else cat "$f"; fi
          done) | shasum -a 256 | awk '{print $1}'
}

root_entries() {  # sorted top-level names, excluding runtime ones
    (cd "$REPO" && ls -A1 | LC_ALL=C sort | grep -Ev "$ROOT_RUNTIME_RE")
}

notify() {  # $1 message. Passed as data, never interpolated into a script.
    if command -v osascript >/dev/null 2>&1; then
        osascript -e 'on run argv' \
            -e 'display notification (item 1 of argv) with title "Agent Athens" subtitle "Integrity check failed" sound name "Basso"' \
            -e 'end run' -- "$1" >/dev/null 2>&1 || true
    fi
    topic="${AGENTATHENS_NTFY_TOPIC:-$(head -1 "$HOME/.config/agentathens/ntfy-topic" 2>/dev/null)}"
    case "$topic" in
        ''|*[!A-Za-z0-9_-]*) ;;
        *) curl -fsS -m 15 -H "Title: Agent Athens integrity check failed" -H "Priority: high" \
               --data-binary "$1" "https://ntfy.sh/$topic" >/dev/null 2>&1 || true ;;
    esac
    # Email (scripts/security-alert.ts, where the pipeline has it). Best
    # effort: bounded by AA_ALERT_TIMEOUT_SEC, and its failure never fails
    # the notification. The message is one argv element, never code.
    if [ -f "$REPO/scripts/security-alert.ts" ] && command -v bun >/dev/null 2>&1; then
        send_email_alert "$1" || true
    fi
}

send_email_alert() {  # $1 message
    local limit="${AA_ALERT_TIMEOUT_SEC:-60}" pid watcher
    case "$limit" in ''|*[!0-9]*) limit=60 ;; esac
    (cd "$REPO" && exec bun run "$REPO/scripts/security-alert.ts" -- "$1") </dev/null >/dev/null 2>&1 &
    pid=$!
    # No GNU timeout on macOS: a watcher stops the sender once the limit passes.
    (n=0
     while [ "$n" -lt "$limit" ] && kill -0 "$pid" 2>/dev/null; do sleep 1; n=$((n + 1)); done
     kill "$pid" 2>/dev/null) </dev/null >/dev/null 2>&1 &
    watcher=$!
    wait "$pid" 2>/dev/null
    kill "$watcher" 2>/dev/null
    return 0
}

quarantine() {  # $1 reason, $2 pre-run HEAD ("" = do not run git), $3 planted paths (relative, one per line) to move out
    ts="$(date +%Y%m%d-%H%M%S)"
    qdir="$STATE_DIR/quarantine/$ts"
    mkdir -p "$qdir"
    printf '%s\njob=%s\npre_head=%s\n' "$1" "$JOB" "${2:-not-run}" > "$qdir/REASON"
    if [ -n "${3:-}" ]; then
        mkdir -p "$qdir/planted"
        # Moved with their path (data/x/CLAUDE.md -> planted/data/x/CLAUDE.md);
        # a path inside an already-moved folder is skipped; nothing outside
        # the repo is ever touched.
        printf '%s\n' "$3" | while IFS= read -r f; do
            case "$f" in ''|/*|..|../*|*/..|*/../*) continue ;; esac
            [ -e "$REPO/$f" ] || [ -L "$REPO/$f" ] || continue
            mkdir -p "$qdir/planted/$(dirname "$f")" && mv "$REPO/$f" "$qdir/planted/$f" 2>/dev/null
        done
    fi
    if [ -n "${2:-}" ]; then
        (cd "$REPO" || exit
         git log --no-ext-diff --no-textconv --stat "$2..HEAD" > "$qdir/new-commits.txt" 2>&1
         if [ "$(git rev-parse HEAD)" != "$2" ]; then
             git branch "quarantine/$ts" HEAD >/dev/null 2>&1
             git reset --mixed -q "$2" >/dev/null 2>&1
         fi)
    fi
    printf 'Quarantined at %s after job "%s": %s\nEvidence: %s\nReview it, then delete this file to resume.\n' \
        "$ts" "$JOB" "$1" "$qdir" > "$STATE_DIR/QUARANTINE"
    echo "integrity-check: FAILED — $1" >&2
    echo "integrity-check: evidence in $qdir; every job is paused until you delete $STATE_DIR/QUARANTINE" >&2
    notify "Job $JOB: $1. All jobs paused. Evidence: $qdir"
    exit 1
}

# What is staged for the owner's next commit (the pipeline itself commits
# through a temporary index, so this must not change during a run).
staged_hash() {
    (cd "$REPO" && git diff --no-ext-diff --no-textconv --cached --binary 2>/dev/null) | shasum -a 256 | awk '{print $1}'
}

# Every ref except the checked-out branch (covered by the commit check),
# pipeline-data (covered below), remote-tracking refs (check_remote_refs) and
# quarantine branches:
# local branches, tags, the stash, notes and replace refs (refs/replace can
# swap the content git shows for any object) must not move during a run.
other_refs_hash() {
    local current
    current="$(cd "$REPO" && git symbolic-ref -q HEAD || echo DETACHED)"
    (cd "$REPO" && git for-each-ref --format='%(refname) %(objectname)' 2>/dev/null) \
        | grep -vE "^($current|refs/heads/pipeline-data|refs/heads/quarantine/[^ ]*|refs/remotes/[^ ]*) " \
        | shasum -a 256 | awk '{print $1}'
}

# Anything but regular files and folders in the folders runs may write. A
# Mac-side job writing a log or data file through a symlink would land
# wherever the link points; a FIFO makes a Mac-side read or copy (the
# database backup, a log reader) block forever; sockets and device files have
# no business there either. `find` only lists them, it never opens one.
find_rw_special() {
    local d
    for d in $RW_DIRS; do
        { [ -d "$REPO/$d" ] || [ -L "$REPO/$d" ]; } && find "$REPO/$d" ! -type f ! -type d 2>/dev/null
    done
}

# ---- 6. Instruction files for AI agents -----------------------------------
# Agent sessions (Claude Code, Codex, Gemini, Cursor, Windsurf, Copilot, VS
# Code) load these as instructions from the folders they work in. -iname:
# the Mac's disk is case-insensitive, so claude.md is CLAUDE.md.
find_instruction_files() {  # sorted relative paths
    local d
    (cd "$REPO" || exit 0
     for d in $RW_DIRS; do
         [ -d "$d" ] || continue
         find "$d" \( -iname CLAUDE.md -o -iname CLAUDE.local.md -o -iname AGENTS.md -o -iname GEMINI.md \
             -o -iname .cursorrules -o -iname .windsurfrules -o -iname copilot-instructions.md -o -iname '*.mdc' \
             -o -iname .claude -o -iname .cursor -o -iname .github -o -iname .vscode \) -print 2>/dev/null
     done) | LC_ALL=C sort
}
# The same names inside a committed path (a commit can add data/CLAUDE.md
# without it ever being in the working tree). For grep -iE.
INSTRUCTION_PATH_RE='(^|/)(claude\.md|claude\.local\.md|agents\.md|gemini\.md|\.cursorrules|\.windsurfrules|copilot-instructions\.md|\.claude|\.cursor|\.github|\.vscode)(/|$)|\.mdc$'

# ---- 8. Planted code, tests and package/tool config ------------------------
# Code on the Mac (bun test, bun run, an agent session, a shell) must come from
# the read-only code paths, never from a folder runs may write: a planted
# data/x.test.ts is picked up by `bun test`, a planted package.json, bunfig.toml,
# tsconfig.json or .npmrc changes how bun/npm resolve and run code started in
# or under that folder, and a planted *.ts/*.sh is one `bun run`/`bash` away.
# -iname: the Mac's disk is case-insensitive. dist/ legitimately holds .js/.mjs
# (src/generate-site.ts copies fuse.mjs to dist/scripts/), so there only test
# files and package/tool config count.
#
# No pipeline output is allowlisted: grepping scripts/, src/ and the shell
# pipeline (round 9) found no run that writes a code, test or package/tool
# config file into data/, logs/, temp*/ or tmp/ — they hold .json, .jsonl,
# .csv, .txt, .md, .html, .ics, .sql, .log, .db and .webp; enrichment's Claude
# sessions may write only under temp-descriptions/ (descriptions, not code).
# If a future output needs one, allowlist it here by exact path.
CODE_TEST_NAMES=(-iname '*.test.*' -o -iname '*_test.*' -o -iname '*.spec.*' -o -iname '*_spec.*')
CODE_CONFIG_NAMES=(-iname package.json -o -iname bunfig.toml -o -iname '.bunfig*' -o -iname 'tsconfig*.json' \
    -o -iname 'jsconfig*.json' -o -iname .npmrc)
CODE_EXEC_NAMES=(-iname '*.ts' -o -iname '*.tsx' -o -iname '*.mts' -o -iname '*.cts' -o -iname '*.js' -o -iname '*.jsx' \
    -o -iname '*.mjs' -o -iname '*.cjs' -o -iname '*.sh' -o -iname '*.py' -o -iname '*.rb' -o -iname '*.command')
CODE_GIT_NAMES=(-iname .git -o -iname .gitattributes -o -iname .gitmodules -o -iname .gitconfig -o -iname .envrc)
find_code_files() {  # sorted relative paths
    local d
    (cd "$REPO" || exit 0
     for d in $RW_DIRS; do
         [ -d "$d" ] || continue
         # Git and shell-hook control files, as files OR folders, everywhere
         # (dist/ included): a planted data/.git with a core.fsmonitor or hook
         # runs as the owner the moment git (a shell prompt, an editor) looks
         # at that folder on the Mac; .envrc runs when direnv enters it.
         # -prune: the contents of a planted .git are moved with it.
         find "$d" \( "${CODE_GIT_NAMES[@]}" \) -print -prune 2>/dev/null
         if [ "$d" = "dist" ]; then
             find "$d" ! -type d \( "${CODE_TEST_NAMES[@]}" -o "${CODE_CONFIG_NAMES[@]}" \) -print 2>/dev/null
         else
             find "$d" ! -type d \( "${CODE_TEST_NAMES[@]}" -o "${CODE_CONFIG_NAMES[@]}" -o "${CODE_EXEC_NAMES[@]}" \) -print 2>/dev/null
         fi
     done) | LC_ALL=C sort
}
# The same names added or changed by a commit (commits may only touch data/,
# where every one of them counts). For grep -iE.
CODE_PATH_RE='(^|/)(\.git|\.gitattributes|\.gitmodules|\.gitconfig|\.envrc)(/|$)|(^|/)(package\.json|bunfig\.toml|\.bunfig[^/]*|tsconfig[^/]*\.json|jsconfig[^/]*\.json|\.npmrc)$|\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|sh|py|rb|command)$|[._](test|spec)\.[^/]*$'

# ---- 7. Git operation state, reflogs, remote-tracking refs, working tree --
# Files that make a later git command on the Mac apply or restore a commit
# they name (`git stash pop`, `git reset --hard ORIG_HEAD`, `git merge
# FETCH_HEAD`, `git rebase --continue`, `git cherry-pick --continue` …). No
# pipeline run writes any of them except ORIG_HEAD (the staging guard's
# `git reset HEAD --`), which may then only name the pre-run or the verified
# post-run HEAD.
GIT_STATE_ITEMS="logs/refs/stash ORIG_HEAD FETCH_HEAD MERGE_HEAD MERGE_MSG MERGE_MODE MERGE_RR CHERRY_PICK_HEAD REVERT_HEAD REBASE_HEAD AUTO_MERGE BISECT_LOG rebase-merge rebase-apply sequencer"
tree_hash() {  # $1 dir: path + content of every file and link under it
    (cd "$1" && find . \( -type f -o -type l \) | LC_ALL=C sort | while IFS= read -r f; do
         printf '== %s\n' "$f"
         if [ -L "$f" ]; then readlink "$f"; else cat "$f"; fi
     done) | shasum -a 256 | awk '{print $1}'
}
git_state_lines() {  # gitstate=<item> <fingerprint> for each item ("-" = absent)
    local item p h
    for item in $GIT_STATE_ITEMS; do
        p="$REPO/.git/$item"
        if [ -L "$p" ]; then h="link:$(readlink "$p")"
        elif [ -d "$p" ]; then h="dir:$(tree_hash "$p")"
        elif [ -e "$p" ]; then h="file:$(shasum -a 256 < "$p" | awk '{print $1}')"
        else h="-"; fi
        printf 'gitstate=%s %s\n' "$item" "$h"
    done
}
changed_git_state() {  # $1 state file: the items whose fingerprint changed
    git_state_lines | LC_ALL=C sort | LC_ALL=C comm -13 <(grep '^gitstate=' "$1" | LC_ALL=C sort) - \
        | sed 's/^gitstate=//; s/ .*//'
}

# Reflogs other than the stash's: size + SHA-256 per file, so verify can
# check that each one only grew.
reflog_lines() {
    (cd "$REPO/.git" 2>/dev/null && [ -d logs ] || exit 0
     find logs -type f ! -path logs/refs/stash | LC_ALL=C sort | while IFS= read -r f; do
         printf 'reflog=%s %s %s\n' "$(wc -c < "$f" | tr -d ' ')" "$(shasum -a 256 < "$f" | awk '{print $1}')" "$f"
     done)
}

# Remote-tracking refs (a symbolic one by its target).
remote_ref_lines() {
    (cd "$REPO" && git for-each-ref --format='%(refname) %(objectname) %(symref)' refs/remotes 2>/dev/null) \
        | awk '{ if ($3 != "") print "remote=" $1 " ->" $3; else print "remote=" $1 " " $2 }' | LC_ALL=C sort
}

# Tracked files outside the data paths whose bytes on disk differ from the
# index, each with a hash of those bytes. `git diff-files` (plumbing: no
# external diff, no textconv, no index write) lists candidates; a candidate
# whose raw bytes (`hash-object --no-filters`: no filter runs) still match
# its index blob is left out. The data paths are excluded by pathspec, so no
# attribute a run could plant under data/ applies to anything read here.
tracked_changes() {
    local f idx cur h
    (cd "$REPO" && git diff-files --name-only -- . ':(exclude)data' 2>/dev/null) \
        | LC_ALL=C sort -u | while IFS= read -r f; do
        [ -n "$f" ] || continue
        idx="$(cd "$REPO" && git ls-files -s -- ":(literal)$f" 2>/dev/null | awk 'NR == 1 {print $2}')"
        if [ -L "$REPO/$f" ]; then h="link:$(readlink "$REPO/$f")"
        elif [ -f "$REPO/$f" ]; then
            cur="$(cd "$REPO" && git hash-object --no-filters -- "$f" 2>/dev/null)"
            [ -n "$idx" ] && [ "$cur" = "$idx" ] && continue
            h="file:$(shasum -a 256 < "$REPO/$f" | awk '{print $1}')"
        elif [ -e "$REPO/$f" ]; then h="other"
        else h="deleted"; fi
        printf 'tracked=%s %s\n' "$h" "$f"
    done
}

check_orig_head() {  # $1 pre-run HEAD. Called once HEAD's new commits are verified.
    local p="$REPO/.git/ORIG_HEAD" v post
    post="$(cd "$REPO" && git rev-parse HEAD 2>/dev/null)"
    if [ -f "$p" ] && [ ! -L "$p" ] && [ "$(wc -l < "$p" | tr -d ' ')" -le 1 ]; then
        v="$(head -1 "$p")"
        { [ "$v" = "$1" ] || [ "$v" = "$post" ]; } && return 0
    fi
    quarantine ".git/ORIG_HEAD was changed during the run to something other than the pre-run or the new HEAD — do not run 'git reset ORIG_HEAD' or 'git merge ORIG_HEAD'; inspect it with 'git log -1 ORIG_HEAD'" "" ""
}

# Remote-tracking refs may only move where the publish run's `git push` moves
# them: refs/remotes/origin/main and refs/remotes/origin/pipeline-data, and
# only to the local branch's current tip (already verified above). Allowed
# moves are recorded in $STATE_DIR/remote-ref-moves.log.
check_remote_refs() {  # $1 state file
    local pre post moves ref old new branch tip bad=""
    pre="$(mktemp)"; post="$(mktemp)"
    sed -n 's/^remote=//p' "$1" > "$pre"
    remote_ref_lines | sed 's/^remote=//' > "$post"
    moves="$(awk 'NR == FNR { p[$1] = $2; next } { q[$1] = $2 }
        END { for (r in p) if (!(r in q)) print r, p[r], "-"
              for (r in q) if (!(r in p) || p[r] != q[r]) print r, ((r in p) ? p[r] : "-"), q[r] }' "$pre" "$post")"
    rm -f "$pre" "$post"
    [ -n "$moves" ] || return 0
    while read -r ref old new; do
        [ -n "$ref" ] || continue
        case "$ref" in
            refs/remotes/origin/main|refs/remotes/origin/pipeline-data) branch="refs/heads/${ref#refs/remotes/origin/}" ;;
            *) bad="$bad$ref "; continue ;;
        esac
        tip="$(cd "$REPO" && git rev-parse -q --verify "$branch" 2>/dev/null || true)"
        if [ -n "$tip" ] && [ "$new" = "$tip" ]; then
            printf '%s job=%s %s %s -> %s (push)\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$JOB" "$ref" "$old" "$new" >> "$STATE_DIR/remote-ref-moves.log"
            echo "integrity-check: recorded $ref $old -> $new (the publish run's push)"
        else
            bad="$bad$ref "
        fi
    done <<EOF
$moves
EOF
    [ -z "$bad" ] || quarantine "remote-tracking ref(s) moved, appeared or vanished during the run: $bad— do not merge, rebase onto or check them out; compare with 'git ls-remote origin' and fix with 'git fetch origin'" "" ""
}

# Every reflog except the stash's may only grow, by entries whose new value
# is a commit this run was allowed to make (or the pre-run tips); a reflog
# may only appear for HEAD, the checked-out branch, pipeline-data and the two
# remote-tracking refs a push moves. A forged entry would otherwise be picked
# up by `git reset --hard HEAD@{1}`, `git checkout -` or `git reflog`.
reflog_allowed_oids() {  # $1 pre-run HEAD, $2 pre-run pipeline-data ("" if none)
    local pd
    (cd "$REPO" || exit 0
     printf '%s\n' "$1" "$2" "$(git rev-parse HEAD 2>/dev/null)" \
         "$(git rev-parse -q --verify refs/heads/main 2>/dev/null)"
     git rev-list "$1..HEAD" 2>/dev/null
     pd="$(git rev-parse -q --verify refs/heads/pipeline-data 2>/dev/null || true)"
     if [ -n "$pd" ]; then
         printf '%s\n' "$pd"
         if [ -n "$2" ]; then git rev-list "$2..$pd" 2>/dev/null; fi
     fi
     printf '%s\n' 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000000000000000000000000000
    ) | grep -E '^[0-9a-f]{40}([0-9a-f]{24})?$' | LC_ALL=C sort -u
}

check_reflogs() {  # $1 state file, $2 pre-run HEAD, $3 pre-run pipeline-data
    local tmp current f line size pre_size pre_sum bad=""
    current="$(cd "$REPO" && git symbolic-ref -q HEAD || echo DETACHED)"
    tmp="$(mktemp -d "${TMPDIR:-/tmp}/aa-reflog.XXXXXX")" || quarantine "could not create a temporary folder to check the reflogs" "" ""
    reflog_allowed_oids "$2" "$3" > "$tmp/allowed"
    sed -n 's/^reflog=//p' "$1" > "$tmp/pre"
    reflog_lines | sed 's/^reflog=//' > "$tmp/post"
    # A reflog that vanished (nothing in a run deletes one).
    for f in $(awk '{print $3}' "$tmp/pre" | LC_ALL=C comm -23 - <(awk '{print $3}' "$tmp/post")); do
        bad="$bad$f(deleted) "
    done
    [ -z "$(cd "$REPO/.git" 2>/dev/null && find logs ! -type f ! -type d 2>/dev/null)" ] || bad="${bad}logs/(symlink or special file) "
    while read -r size _ f; do
        [ -n "$f" ] || continue
        line="$(awk -v f="$f" '$3 == f {print $1, $2}' "$tmp/pre")"
        if [ -n "$line" ]; then
            pre_size="${line%% *}"; pre_sum="${line#* }"
            if [ "$size" -lt "$pre_size" ] || [ "$(head -c "$pre_size" "$REPO/.git/$f" | shasum -a 256 | awk '{print $1}')" != "$pre_sum" ]; then
                bad="$bad$f(rewritten) "; continue
            fi
            [ "$size" -gt "$pre_size" ] || continue
            tail -c +"$((pre_size + 1))" "$REPO/.git/$f" > "$tmp/new"
        else
            case "$f" in
                logs/HEAD|"logs/$current"|logs/refs/heads/pipeline-data|logs/refs/remotes/origin/main|logs/refs/remotes/origin/pipeline-data) ;;
                *) bad="$bad$f(new) "; continue ;;
            esac
            cat "$REPO/.git/$f" > "$tmp/new"
        fi
        # An entry: "<old> <new> <name> <email> <time> <tz>\t<message>".
        awk -v A="$tmp/allowed" -v F="$f" '
            BEGIN { while ((getline l < A) > 0) ok[l] = 1 }
            { split($0, parts, "\t"); split(parts[1], w, " ")
              if (!(w[2] in ok) || w[1] !~ /^[0-9a-f]+$/) exit 1
              if (F == "logs/HEAD" && parts[2] ~ /^checkout:/) exit 1 }' "$tmp/new" \
            || bad="$bad$f(entry for a commit the run may not make) "
    done < "$tmp/post"
    rm -r "$tmp"
    [ -z "$bad" ] || quarantine "reflog(s) in .git/logs were forged or rewritten during the run: $bad— do not use HEAD@{n}, 'git checkout -' or 'git reflog' entries from this run; inspect .git/logs by hand" "" ""
}

# ---- 5. The object store ------------------------------------------------
# Snapshot: loose objects and .pack files by inode, size, mtime and ctime
# (cheap for any repo size); every other file under .git/objects (.idx, .rev,
# info/ …, all small) by SHA-256 of its content; anything that is neither a
# file nor a folder by path and link target.
#
# Verify, rather than a full `git fsck` (which re-inflates every packed object
# on each run — minutes for a large history — and also fails on unrelated
# pre-existing conditions such as old reflog entries):
#   - a pre-existing file that vanished, or changed size or inode (loose/pack)
#     or content (everything else): quarantine;
#   - a loose object or pack whose mtime or ctime moved, or whose ctime is not
#     older than the snapshot (a write in the snapshot's own second): git
#     "freshens" objects it re-writes by touching them, so check content —
#     a loose object must hash to its name; a pack must still match the
#     checksum recorded in its (unchanged) .idx. ctime cannot be set back, so
#     an in-place overwrite is always checked;
#   - new loose objects must hash to their names; new packs come with their
#     .idx (and .rev) and must pass `git verify-pack`; tmp_* and *.keep files
#     (inert leftovers of an interrupted write) are ignored; anything else new
#     (a multi-pack-index, bitmap, stray file, symlink) is an alarm.
if [ "$(uname -s)" = "Darwin" ]; then OBJ_STAT=(/usr/bin/stat -f '%i %z %m %c %N')
else OBJ_STAT=(stat -c '%i %s %Y %Z %n'); fi
LOOSE_RE='^objects/[0-9a-f]{2}/([0-9a-f]{38}|[0-9a-f]{62})$'
PACK_RE='^objects/pack/pack-[0-9a-f]{40,64}\.(pack|idx|rev)$'

obj_inventory() {  # objstat= / objhash= / objodd= lines for everything under .git/objects
    (cd "$REPO/.git" 2>/dev/null && [ -d objects ] || exit 0
     find objects -type f \( -name '*.pack' -o -path 'objects/[0-9a-f][0-9a-f]/*' \) \
         -exec "${OBJ_STAT[@]}" {} + | sed 's/^/objstat=/'
     find objects -type f ! -name '*.pack' ! -path 'objects/[0-9a-f][0-9a-f]/*' \
         -exec shasum -a 256 {} + | sed 's/^\([0-9a-f]*\)  /objhash=\1 /'
     find objects ! -type d ! -type f | while IFS= read -r f; do
         printf 'objodd=%s -> %s\n' "$f" "$(readlink "$f" 2>/dev/null)"
     done) | LC_ALL=C sort
}

# Compare the snapshot's inventory with now. Prints "<KIND> <path>" lines:
# GONE, CHANGED, ODD, NEW, CHECK (see above).
obj_changes() {  # $1 snapshot inventory file, $2 current inventory file, $3 snapshot epoch
    awk -v S="$3" -v PRE="$1" '
        function base(p,  b) { b = p; sub(/.*\//, "", b); return b }
        {
            t = $0; sub(/=.*/, "", t); r = $0; sub(/^[^=]*=/, "", r)
            if (t == "objstat") {
                p = r; sub(/^[^ ]+ [^ ]+ [^ ]+ [^ ]+ /, "", p); split(r, f, " ")
                id = f[1] " " f[2]; tm = f[3] " " f[4]; ct = f[4] + 0
            } else if (t == "objhash") {
                p = r; sub(/^[^ ]+ /, "", p); split(r, f, " "); id = f[1]; tm = ""; ct = 0
            } else { p = r; id = "odd"; tm = ""; ct = 0 }
            if (t != "objodd" && (base(p) ~ /^tmp_/ || base(p) ~ /\.keep$/)) next
            if (FILENAME == PRE) { pid[p] = id; ptm[p] = tm; next }
            seen[p] = 1
            if (!(p in pid)) { print (t == "objodd" ? "ODD " : "NEW ") p; next }
            if (pid[p] != id) { print "CHANGED " p; next }
            if (t == "objstat" && (ptm[p] != tm || ct >= S + 0)) print "CHECK " p
        }
        END { for (p in pid) if (!(p in seen)) print "GONE " p }' "$1" "$2"
}

hex_bytes() { od -An -v -tx1 | tr -d ' \n'; }

# A loose object must hash to its name. It is copied into an empty object
# directory first, so git reads exactly this file (and not a packed copy of
# the same id), then re-hashed from its decompressed content.
loose_ok() {  # $1 objects/xx/yyyy…
    local p="$1" tmp oid t h
    oid="$(printf '%s' "${p#objects/}" | tr -d /)"
    tmp="$(mktemp -d "${TMPDIR:-/tmp}/aa-objcheck.XXXXXX")" || return 1
    mkdir -p "$tmp/$(dirname "${p#objects/}")" && cp "$REPO/.git/$p" "$tmp/${p#objects/}" || { rm -r "$tmp"; return 1; }
    t="$(cd "$REPO" && GIT_OBJECT_DIRECTORY="$tmp" git cat-file -t "$oid" 2>/dev/null)"
    case "$t" in
        blob|tree|commit|tag)
            h="$(cd "$REPO" && GIT_OBJECT_DIRECTORY="$tmp" git cat-file "$t" "$oid" 2>/dev/null \
                | git hash-object --stdin --literally -t "$t" 2>/dev/null)" ;;
        *) h="" ;;
    esac
    rm -r "$tmp"
    [ "$h" = "$oid" ]
}

# A pack whose size and inode are unchanged but whose times moved: git touches
# a pack when it re-writes an object it already holds. Its content is intact
# if its trailing checksum is the hash of the rest of the file and equals the
# pack checksum stored in its .idx (which the content-hash check has already
# shown unchanged). One sequential hash pass, no inflating.
pack_intact() {  # $1 objects/pack/pack-….pack
    local pack="$REPO/.git/$1" idx alg hl size body trailer idxsum
    idx="${pack%.pack}.idx"
    [ -f "$idx" ] || return 1
    if [ "$(cd "$REPO" && git rev-parse --show-object-format 2>/dev/null)" = "sha256" ]; then alg=256; hl=32; else alg=1; hl=20; fi
    size="$(wc -c < "$pack" | tr -d ' ')"
    [ "$size" -gt "$hl" ] || return 1
    body="$(head -c $((size - hl)) "$pack" | shasum -a "$alg" | awk '{print $1}')"
    trailer="$(tail -c "$hl" "$pack" | hex_bytes)"
    idxsum="$(tail -c $((2 * hl)) "$idx" | head -c "$hl" | hex_bytes)"
    [ -n "$body" ] && [ "$body" = "$trailer" ] && [ "$trailer" = "$idxsum" ]
}

OBJ_ADVICE="do not run git stash, checkout, reset or gc until 'git fsck --full' is clean; restore .git/objects from a backup or re-clone"
list5() { printf '%s\n' "$1" | head -5 | tr '\n' ' '; }

check_objects() {  # $1 snapshot state file. Quarantines (without running git reset) on any problem.
    local stamp pre post changes gone changed odd new check p loose="" packs="" other=""
    stamp="$(sed -n 's/^objstamp=//p' "$1")"
    if [ -z "$stamp" ]; then
        echo "integrity-check: WARNING: the snapshot has no object inventory (taken by an older integrity-check.sh); object check skipped this run" >&2
        return 0
    fi
    pre="$(mktemp)"; post="$(mktemp)"
    grep -E '^obj(stat|hash|odd)=' "$1" > "$pre"
    obj_inventory > "$post"
    changes="$(obj_changes "$pre" "$post" "$stamp")"
    rm -f "$pre" "$post"
    gone="$(printf '%s\n' "$changes" | sed -n 's/^GONE //p' | LC_ALL=C sort)"
    changed="$(printf '%s\n' "$changes" | sed -n 's/^CHANGED //p' | LC_ALL=C sort)"
    odd="$(printf '%s\n' "$changes" | sed -n 's/^ODD //p' | LC_ALL=C sort)"
    new="$(printf '%s\n' "$changes" | sed -n 's/^NEW //p' | LC_ALL=C sort)"
    check="$(printf '%s\n' "$changes" | sed -n 's/^CHECK //p' | LC_ALL=C sort)"

    if [ -n "$gone" ]; then
        if printf '%s\n' "$gone" | grep -q '^objects/pack/'; then
            quarantine "git pack file(s) disappeared during the run — the object store was repacked (git gc/repack in the container?) or tampered with: $(list5 "$gone")— $OBJ_ADVICE" "" ""
        fi
        quarantine "existing git object file(s) were deleted during the run (git gc/prune in the container, or tampering): $(list5 "$gone")— $OBJ_ADVICE" "" ""
    fi
    [ -z "$changed" ] || quarantine "existing git object file(s) were rewritten during the run (size, inode or content changed): $(list5 "$changed")— $OBJ_ADVICE" "" ""
    [ -z "$odd" ] || quarantine "symlink(s) or other non-regular files appeared in .git/objects: $(list5 "$odd")— $OBJ_ADVICE" "" ""

    while IFS= read -r p; do
        [ -n "$p" ] || continue
        if printf '%s' "$p" | grep -qE "$LOOSE_RE"; then loose="$loose$p
"
        elif printf '%s' "$p" | grep -qE "$PACK_RE"; then
            case "$p" in *.pack) packs="$packs$p
" ;; esac
            # .idx/.rev only arrive together with their new .pack, and vice versa.
            printf '%s\n' "$new" | grep -qxF "${p%.*}.pack" && printf '%s\n' "$new" | grep -qxF "${p%.*}.idx" \
                || other="$other$p
"
        else other="$other$p
"
        fi
    done <<EOF
$new
EOF
    [ -z "$other" ] || quarantine "unexpected new file(s) in .git/objects (not a loose object or a complete new pack): $(list5 "$other")— $OBJ_ADVICE" "" ""

    while IFS= read -r p; do
        [ -n "$p" ] || continue
        if printf '%s' "$p" | grep -qE "$LOOSE_RE"; then loose="$loose$p
"
        elif printf '%s' "$p" | grep -qE "$PACK_RE"; then
            pack_intact "$p" || quarantine "git pack $p was modified during the run (its content no longer matches the checksum in its .idx) — $OBJ_ADVICE" "" ""
        else
            quarantine "git object file $p was modified during the run — $OBJ_ADVICE" "" ""
        fi
    done <<EOF
$check
EOF
    while IFS= read -r p; do
        [ -n "$p" ] || continue
        loose_ok "$p" || quarantine "git object $(printf '%s' "${p#objects/}" | tr -d /) ($p) does not match its name — its content was replaced or planted during the run — $OBJ_ADVICE" "" ""
    done <<EOF
$loose
EOF
    while IFS= read -r p; do
        [ -n "$p" ] || continue
        (cd "$REPO" && git verify-pack "$REPO/.git/${p%.pack}.idx" >/dev/null 2>&1) \
            || quarantine "new git pack $p fails 'git verify-pack' (an object in it does not match its name, or its index lies) — $OBJ_ADVICE" "" ""
    done <<EOF
$packs
EOF
}

# New commits on refs/heads/pipeline-data (pushed later by the publish run)
# must each be a root or single-parent commit touching only data paths.
check_pipeline_data() {  # $1 pre-run sha of pipeline-data ("" if it did not exist)
    local pre="$1" post range c files
    post="$(cd "$REPO" && git rev-parse -q --verify refs/heads/pipeline-data 2>/dev/null || true)"
    [ -n "$post" ] && [ "$post" != "$pre" ] || return 0
    if [ -n "$pre" ]; then range="$pre..$post"; else range="$post"; fi
    for c in $(cd "$REPO" && git rev-list "$range" 2>/dev/null); do
        if [ "$(cd "$REPO" && git rev-list --parents -n 1 "$c" | wc -w)" -gt 2 ]; then
            quarantine_pdata "pipeline-data commit $c is a merge" "$pre"
        fi
        files="$(cd "$REPO" && git diff-tree --no-commit-id --name-only -r --root "$c" | grep -Ev "$DATA_PATHS_RE" || true)"
        [ -z "$files" ] || quarantine_pdata "pipeline-data commit $c changes non-data files: $(echo "$files" | head -5 | tr '\n' ' ')" "$pre"
        files="$(cd "$REPO" && git diff-tree --no-commit-id --name-only -r --root "$c" | grep -iE "$INSTRUCTION_PATH_RE" || true)"
        [ -z "$files" ] || quarantine_pdata "pipeline-data commit $c adds or changes instruction files for AI agents: $(echo "$files" | head -5 | tr '\n' ' ')" "$pre"
        files="$(cd "$REPO" && git diff-tree --no-commit-id --name-only --diff-filter=d -r --root "$c" | grep -iE "$CODE_PATH_RE" || true)"
        [ -z "$files" ] || quarantine_pdata "pipeline-data commit $c adds or changes code, test or package/tool config files: $(echo "$files" | head -5 | tr '\n' ' ')" "$pre"
    done
}

quarantine_pdata() {  # $1 reason, $2 pre-run sha: keep the evidence, roll the branch back, then quarantine
    local ts; ts="$(date +%Y%m%d-%H%M%S)"
    (cd "$REPO" && git branch -f "quarantine/pipeline-data-$ts" refs/heads/pipeline-data >/dev/null 2>&1
     if [ -n "$2" ]; then git update-ref refs/heads/pipeline-data "$2"; else git update-ref -d refs/heads/pipeline-data; fi)
    rm -f "$REPO/.pipeline-publish-ready"   # nothing from this run may be published
    rm -f "$STATE_DIR/handoff/publish-ready"   # the hand-off copy (AA_PUBLISH_MARKER) too
    quarantine "$1 (branch rolled back; evidence on quarantine/pipeline-data-$ts)" "" ""
}

case "$MODE" in
    snapshot)
        [ -n "$STATE_FILE" ] || { echo "usage: $0 snapshot STATE_FILE" >&2; exit 2; }
        mkdir -p "$(dirname "$STATE_FILE")"
        head="$(cd "$REPO" && git rev-parse HEAD)" || { echo "integrity-check: git rev-parse HEAD failed in $REPO" >&2; exit 2; }
        pdata="$(cd "$REPO" && git rev-parse -q --verify refs/heads/pipeline-data 2>/dev/null || true)"
        instr="$(find_instruction_files)"
        if [ -n "$instr" ]; then
            echo "integrity-check: WARNING: instruction files for AI agents already exist in folders runs may write (not flagged; review them): $(printf '%s\n' "$instr" | head -5 | tr '\n' ' ')" >&2
        fi
        code="$(find_code_files)"
        if [ -n "$code" ]; then
            echo "integrity-check: WARNING: code, test or package/tool config files already exist in folders runs may write (not flagged; review them — nothing on the Mac should run them): $(printf '%s\n' "$code" | head -5 | tr '\n' ' ')" >&2
        fi
        { printf 'head=%s\ngitmeta=%s\npdata=%s\nstaged=%s\nrefs=%s\n' "$head" "$(hash_git_meta)" "$pdata" \
              "$(staged_hash)" "$(other_refs_hash)"
          # Marks a snapshot that carries the checks 6 and 7 below.
          echo "checks=7"
          # Marks a snapshot that carries check 8 (planted code).
          echo "codecheck=1"
          root_entries | sed 's/^/root=/'
          [ -z "$instr" ] || printf '%s\n' "$instr" | sed 's/^/instr=/'
          [ -z "$code" ] || printf '%s\n' "$code" | sed 's/^/code=/'
          git_state_lines
          reflog_lines
          remote_ref_lines
          tracked_changes
          # Taken before the inventory: anything written from this second on is checked.
          printf 'objstamp=%s\n' "$(date +%s)"
          obj_inventory; } > "$STATE_FILE"
        ;;
    verify)
        [ -f "$STATE_FILE" ] || { echo "integrity-check: no snapshot at $STATE_FILE" >&2; exit 2; }
        pre_head="$(sed -n 's/^head=//p' "$STATE_FILE")"
        pre_meta="$(sed -n 's/^gitmeta=//p' "$STATE_FILE")"
        pre_pdata="$(sed -n 's/^pdata=//p' "$STATE_FILE")"
        full=no
        if grep -qx 'checks=7' "$STATE_FILE"; then full=yes
        else echo "integrity-check: WARNING: the snapshot was taken by an older integrity-check.sh; the instruction-file, git-state, reflog, remote-ref and working-tree checks are skipped this run" >&2; fi
        if [ "$full" = yes ]; then
            # Before any git runs: only reading files.
            state_changed="$(changed_git_state "$STATE_FILE")"
            not_orig="$(printf '%s\n' "$state_changed" | grep -vx 'ORIG_HEAD' | grep -v '^$' || true)"
            [ -z "$not_orig" ] || quarantine "git operation state changed during the run: $(list5 "$not_orig")— a later 'git stash pop', 'git merge FETCH_HEAD', 'git rebase/cherry-pick --continue' or 'git reset ORIG_HEAD' on the Mac would apply what the run planted there (git was not run afterwards; inspect .git by hand)" "" ""
        fi
        [ "$(hash_git_meta)" = "$pre_meta" ] \
            || quarantine ".git metadata (config, hooks, commondir, info/ …) changed during the run (git was not run afterwards; inspect .git by hand)" "" ""
        check_objects "$STATE_FILE"
        new_root="$(root_entries | LC_ALL=C comm -13 <(sed -n 's/^root=//p' "$STATE_FILE") -)"
        [ -z "$new_root" ] || quarantine "new file(s) at the repo root: $(echo "$new_root" | tr '\n' ' ')" "$pre_head" "$new_root"
        bad="$(cd "$REPO" && git diff --name-only "$pre_head" HEAD 2>/dev/null | grep -Ev "$DATA_PATHS_RE" || true)"
        [ -z "$bad" ] || quarantine "a commit made during the run changes non-data files: $(echo "$bad" | head -5 | tr '\n' ' ')" "$pre_head" ""
        # Per commit: one commit can add data/CLAUDE.md and the next remove it.
        bad="$(cd "$REPO" && for c in $(git rev-list "$pre_head..HEAD" 2>/dev/null); do
                   git diff-tree --no-commit-id --name-only -r --root -m "$c"; done | grep -iE "$INSTRUCTION_PATH_RE" | LC_ALL=C sort -u || true)"
        [ -z "$bad" ] || quarantine "a commit made during the run adds or changes instruction files for AI agents: $(list5 "$bad")" "$pre_head" ""
        bad="$(cd "$REPO" && for c in $(git rev-list "$pre_head..HEAD" 2>/dev/null); do
                   git diff-tree --no-commit-id --name-only --diff-filter=d -r --root -m "$c"; done | grep -iE "$CODE_PATH_RE" | LC_ALL=C sort -u || true)"
        [ -z "$bad" ] || quarantine "a commit made during the run adds or changes code, test or package/tool config files under data/: $(list5 "$bad")" "$pre_head" ""
        check_pipeline_data "$pre_pdata"
        if [ "$full" = yes ]; then
            new_instr="$(find_instruction_files | LC_ALL=C comm -13 <(sed -n 's/^instr=//p' "$STATE_FILE" | LC_ALL=C sort) -)"
            [ -z "$new_instr" ] || quarantine "instruction file(s) for AI agents appeared in folders runs may write (moved to the evidence folder): $(list5 "$new_instr")" "" "$new_instr"
        fi
        if grep -qx 'codecheck=1' "$STATE_FILE"; then
            new_code="$(find_code_files | LC_ALL=C comm -13 <(sed -n 's/^code=//p' "$STATE_FILE" | LC_ALL=C sort) -)"
            [ -z "$new_code" ] || quarantine "code, test or package/tool config file(s) appeared in folders runs may write (moved to the evidence folder; code the Mac runs comes only from the read-only code paths): $(list5 "$new_code")" "" "$new_code"
        else
            echo "integrity-check: WARNING: the snapshot was taken by an older integrity-check.sh; the planted-code check is skipped this run" >&2
        fi
        if [ "$full" = yes ]; then
            case "$state_changed" in *ORIG_HEAD*) check_orig_head "$pre_head" ;; esac
        fi
        [ "$(staged_hash)" = "$(sed -n 's/^staged=//p' "$STATE_FILE")" ] \
            || quarantine "changes were staged for your next commit during the run (inspect 'git diff --cached')" "" ""
        if [ "$full" = yes ]; then
            changed_tracked="$(tracked_changes | LC_ALL=C sort | LC_ALL=C comm -13 <(grep '^tracked=' "$STATE_FILE" | LC_ALL=C sort) - | sed 's/^tracked=[^ ]* //')"
            [ -z "$changed_tracked" ] || quarantine "tracked file(s) outside the data folders were changed in the working tree during the run: $(list5 "$changed_tracked")— inspect 'git diff' before running or committing anything" "" ""
        fi
        [ "$(other_refs_hash)" = "$(sed -n 's/^refs=//p' "$STATE_FILE")" ] \
            || quarantine "a branch, tag, the stash, a note or a replace ref moved during the run (compare 'git for-each-ref')" "" ""
        if [ "$full" = yes ]; then
            check_remote_refs "$STATE_FILE"
            check_reflogs "$STATE_FILE" "$pre_head" "$pre_pdata"
        fi
        special="$(find_rw_special)"
        [ -z "$special" ] || quarantine "symlink(s) or special file(s) (FIFO, socket, device) appeared in folders runs may write: $(echo "$special" | head -5 | tr '\n' ' ')" "" ""
        rm -f "$STATE_FILE"
        echo "integrity-check: PASS ($JOB)"
        ;;
    notify)
        # Reused by aa-run.sh for other alerts (live-site check, backups).
        notify "${2:-Agent Athens alert}"
        ;;
    *) echo "usage: $0 snapshot STATE_FILE | verify STATE_FILE JOB | notify MESSAGE" >&2; exit 2 ;;
esac
