#!/bin/bash
# How old the pipeline image is, for aa-run.sh's staleness check. Runs on the
# Mac (bash 3.2, BSD or GNU date). Prints strict lines and always exits 0 when
# called correctly; a value it cannot determine is printed as "unknown", and
# aa-run.sh treats unknown as too old.
#
#   docker/image-age.sh IMAGE
#     local_days=<n|unknown>     days since this image was built
#     base_days=<n|unknown>      days since the Playwright base image was built
#     base_source=<label|base-inspect|image-info|none>
#     chromium=<version|unknown>   (known only when read from image-info)
#
# Rebuilding the image (image / image-refresh) resets local_days but not
# base_days: Chromium comes from the digest-pinned base, so only moving that
# digest (the Dependabot PR) makes it newer. The base date is taken from, in
# order: the org.agentathens.base-created label (the registry's date, when the
# image build was given it), `docker image inspect` of the base named in the
# org.agentathens.base-image label (when the base is present locally), and the
# image-info file the Dockerfile writes from the base's own file timestamps.
#
# AA_DOCKER overrides the docker command (tests use a stub).
set -u
DOCKER="${AA_DOCKER:-docker}"
IMAGE="${1:-}"
[ -n "$IMAGE" ] || { echo "usage: $0 IMAGE" >&2; exit 2; }

days_since() {  # $1 YYYY-MM-DD (anything longer is cut) → whole days, or nothing
    local d s
    d="$(printf '%s' "$1" | cut -c1-10)"
    printf '%s' "$d" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || return 1
    # GNU `date -d` vs BSD `date -j -f`: pick by OS, as aa-run.sh does.
    if [ "$(uname -s)" = "Darwin" ]; then s="$(date -j -f %Y-%m-%d "$d" +%s 2>/dev/null)" || return 1
    else s="$(date -d "$d" +%s 2>/dev/null)" || return 1; fi
    printf '%s' "$s" | grep -qE '^[0-9]+$' || return 1
    echo $(( ($(date +%s) - s) / 86400 ))
}

label() {  # $1 label name → value ("" when absent)
    local v
    v="$("$DOCKER" image inspect -f "{{index .Config.Labels \"$1\"}}" "$IMAGE" 2>/dev/null)" || return 0
    [ "$v" = "<no value>" ] || printf '%s' "$v"
}

local_days="$(days_since "$("$DOCKER" image inspect -f '{{.Created}}' "$IMAGE" 2>/dev/null)")" || local_days=unknown

base_days=""; base_source=none; chromium=unknown
if base_days="$(days_since "$(label org.agentathens.base-created)")"; then
    base_source=label
else
    base_ref="$(label org.agentathens.base-image)"
    if printf '%s' "$base_ref" | grep -qE '^[A-Za-z0-9][A-Za-z0-9./:@_-]*$' \
        && base_days="$(days_since "$("$DOCKER" image inspect -f '{{.Created}}' "$base_ref" 2>/dev/null)")"; then
        base_source=base-inspect
    else
        base_days=""
    fi
fi
# Otherwise the image-info file (which also names the Chromium version), read
# with a throwaway container that has no network, mounts or capabilities.
if [ -z "$base_days" ]; then
    info="$("$DOCKER" run --rm --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges:true --entrypoint cat "$IMAGE" \
        /usr/local/share/agentathens/image-info 2>/dev/null || true)"
    v="$(printf '%s\n' "$info" | sed -n 's/^chromium_version=\([0-9][0-9.]*\)$/\1/p' | head -1)"
    [ -n "$v" ] && chromium="$v"
    d="$(printf '%s\n' "$info" | sed -n 's/^base_created=\([0-9-]*\)$/\1/p' | head -1)"
    if base_days="$(days_since "$d")"; then base_source=image-info; else base_days=unknown; fi
fi

printf 'local_days=%s\nbase_days=%s\nbase_source=%s\nchromium=%s\n' "$local_days" "$base_days" "$base_source" "$chromium"
