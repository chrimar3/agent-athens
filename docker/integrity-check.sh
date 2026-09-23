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
#      stash moved, and no symlink appeared in the folders runs may write
#      (a later Mac-side job could otherwise write through it into $HOME).
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

# What a pipeline commit may touch (run_deploy's allowlist is a subset).
DATA_PATHS_RE='^(data/|docs/DECISIONS-QUEUE\.md$)'
# Root-level entries the pipeline itself creates.
ROOT_RUNTIME_RE='^(\.pipeline-[a-z-]+\.lock|\.pipeline-publish-ready|\.auto-enrich\.lock\.d|temp|tmp|temp-[a-z-]+|dist|logs|node_modules|\.netlify|\.cache)$'

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
}

quarantine() {  # $1 reason, $2 pre-run HEAD ("" = do not run git), $3 new root entries
    ts="$(date +%Y%m%d-%H%M%S)"
    qdir="$STATE_DIR/quarantine/$ts"
    mkdir -p "$qdir"
    printf '%s\njob=%s\npre_head=%s\n' "$1" "$JOB" "${2:-not-run}" > "$qdir/REASON"
    if [ -n "${3:-}" ]; then
        mkdir -p "$qdir/planted"
        echo "$3" | while read -r f; do [ -n "$f" ] && mv "$REPO/$f" "$qdir/planted/" 2>/dev/null; done
    fi
    if [ -n "${2:-}" ]; then
        (cd "$REPO" || exit
         git log --stat "$2..HEAD" > "$qdir/new-commits.txt" 2>&1
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
    (cd "$REPO" && git diff --cached --binary 2>/dev/null) | shasum -a 256 | awk '{print $1}'
}

# Every ref except the checked-out branch (covered by the commit check),
# pipeline-data (covered below), remote-tracking refs and quarantine branches:
# local branches, tags, the stash, notes and replace refs (refs/replace can
# swap the content git shows for any object) must not move during a run.
other_refs_hash() {
    local current
    current="$(cd "$REPO" && git symbolic-ref -q HEAD || echo DETACHED)"
    (cd "$REPO" && git for-each-ref --format='%(refname) %(objectname)' 2>/dev/null) \
        | grep -vE "^($current|refs/heads/pipeline-data|refs/heads/quarantine/[^ ]*|refs/remotes/[^ ]*) " \
        | shasum -a 256 | awk '{print $1}'
}

# Symlinks in the folders runs may write. A Mac-side job writing a log or
# data file through one would land wherever the link points.
find_rw_symlinks() {
    local d
    for d in data dist logs temp tmp temp-descriptions temp-briefs temp-research; do
        [ -d "$REPO/$d" ] && find "$REPO/$d" -type l 2>/dev/null
    done
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
    done
}

quarantine_pdata() {  # $1 reason, $2 pre-run sha: keep the evidence, roll the branch back, then quarantine
    local ts; ts="$(date +%Y%m%d-%H%M%S)"
    (cd "$REPO" && git branch -f "quarantine/pipeline-data-$ts" refs/heads/pipeline-data >/dev/null 2>&1
     if [ -n "$2" ]; then git update-ref refs/heads/pipeline-data "$2"; else git update-ref -d refs/heads/pipeline-data; fi)
    rm -f "$REPO/.pipeline-publish-ready"   # nothing from this run may be published
    quarantine "$1 (branch rolled back; evidence on quarantine/pipeline-data-$ts)" "" ""
}

case "$MODE" in
    snapshot)
        [ -n "$STATE_FILE" ] || { echo "usage: $0 snapshot STATE_FILE" >&2; exit 2; }
        mkdir -p "$(dirname "$STATE_FILE")"
        head="$(cd "$REPO" && git rev-parse HEAD)" || { echo "integrity-check: git rev-parse HEAD failed in $REPO" >&2; exit 2; }
        pdata="$(cd "$REPO" && git rev-parse -q --verify refs/heads/pipeline-data 2>/dev/null || true)"
        { printf 'head=%s\ngitmeta=%s\npdata=%s\nstaged=%s\nrefs=%s\n' "$head" "$(hash_git_meta)" "$pdata" \
              "$(staged_hash)" "$(other_refs_hash)"
          root_entries | sed 's/^/root=/'; } > "$STATE_FILE"
        ;;
    verify)
        [ -f "$STATE_FILE" ] || { echo "integrity-check: no snapshot at $STATE_FILE" >&2; exit 2; }
        pre_head="$(sed -n 's/^head=//p' "$STATE_FILE")"
        pre_meta="$(sed -n 's/^gitmeta=//p' "$STATE_FILE")"
        [ "$(hash_git_meta)" = "$pre_meta" ] \
            || quarantine ".git metadata (config, hooks, commondir, info/ …) changed during the run (git was not run afterwards; inspect .git by hand)" "" ""
        new_root="$(root_entries | LC_ALL=C comm -13 <(sed -n 's/^root=//p' "$STATE_FILE") -)"
        [ -z "$new_root" ] || quarantine "new file(s) at the repo root: $(echo "$new_root" | tr '\n' ' ')" "$pre_head" "$new_root"
        bad="$(cd "$REPO" && git diff --name-only "$pre_head" HEAD 2>/dev/null | grep -Ev "$DATA_PATHS_RE" || true)"
        [ -z "$bad" ] || quarantine "a commit made during the run changes non-data files: $(echo "$bad" | head -5 | tr '\n' ' ')" "$pre_head" ""
        check_pipeline_data "$(sed -n 's/^pdata=//p' "$STATE_FILE")"
        [ "$(staged_hash)" = "$(sed -n 's/^staged=//p' "$STATE_FILE")" ] \
            || quarantine "changes were staged for your next commit during the run (inspect 'git diff --cached')" "" ""
        [ "$(other_refs_hash)" = "$(sed -n 's/^refs=//p' "$STATE_FILE")" ] \
            || quarantine "a branch, tag, the stash, a note or a replace ref moved during the run (compare 'git for-each-ref')" "" ""
        links="$(find_rw_symlinks)"
        [ -z "$links" ] || quarantine "symlink(s) appeared in folders runs may write: $(echo "$links" | head -5 | tr '\n' ' ')" "" ""
        rm -f "$STATE_FILE"
        echo "integrity-check: PASS ($JOB)"
        ;;
    notify)
        # Reused by aa-run.sh for other alerts (live-site check, backups).
        notify "${2:-Agent Athens alert}"
        ;;
    *) echo "usage: $0 snapshot STATE_FILE | verify STATE_FILE JOB | notify MESSAGE" >&2; exit 2 ;;
esac
