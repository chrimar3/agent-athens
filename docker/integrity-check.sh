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
#      (a later Mac-side job could otherwise write through it into $HOME);
#   5. git's object store only grew: every file that was in .git/objects is
#      still there, same size and inode, and any loose object or pack that was
#      written or touched during the run still holds exactly the content its
#      name promises; new loose objects hash to their names and new packs pass
#      `git verify-pack`. (A run with a writable .git could otherwise replace
#      an existing object's bytes, and a later `git stash` or checkout on the
#      Mac would write the planted content into a tracked script.) Objects are
#      immutable and the container never gcs or repacks (aa-run.sh passes
#      gc.auto=0), so a vanished or repacked file is itself an alarm.
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
          root_entries | sed 's/^/root=/'
          # Taken before the inventory: anything written from this second on is checked.
          printf 'objstamp=%s\n' "$(date +%s)"
          obj_inventory; } > "$STATE_FILE"
        ;;
    verify)
        [ -f "$STATE_FILE" ] || { echo "integrity-check: no snapshot at $STATE_FILE" >&2; exit 2; }
        pre_head="$(sed -n 's/^head=//p' "$STATE_FILE")"
        pre_meta="$(sed -n 's/^gitmeta=//p' "$STATE_FILE")"
        [ "$(hash_git_meta)" = "$pre_meta" ] \
            || quarantine ".git metadata (config, hooks, commondir, info/ …) changed during the run (git was not run afterwards; inspect .git by hand)" "" ""
        check_objects "$STATE_FILE"
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
