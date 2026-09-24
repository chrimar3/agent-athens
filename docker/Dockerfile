# Agent Athens pipeline image — runs the scheduled jobs (scrape, enrich, build,
# deploy, measurement) inside a container instead of directly on the Mac, so a
# hostile scraped page, email or prompt-injected enrichment session can reach
# only the project folder and the tokens the pipeline needs — not the home
# directory, keychain, SSH keys, browser profiles or other projects.
#
# Build and run through docker/aa-run.sh (see docker/README.md).
#
# Base: Microsoft's Playwright image — Ubuntu 24.04 + Node 24 + a Chromium
# build and its system libraries, published for both amd64 and arm64 (Apple
# Silicon). Pinned by digest; bump tag and digest together. Chromium only gets
# newer when this digest moves (Dependabot proposes it): aa-run.sh refuses runs
# that load outside content once the base is older than 60 days, measured from
# the label and image-info below, not from when this image was built.
ARG BASE_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27

# --- egress: the pipeline's only way out (compose service `egress`) --------
# Squid (HTTP/HTTPS forward proxy) and socat (the TCP relay email ingest uses
# for IMAP, pinned to one public address) from Ubuntu on the same pinned base:
# no second image to pin or keep fresh (Dependabot bumps one digest), shared
# layers on disk, and `apt-get upgrade` on every rebuild like the pipeline
# stage. Squid's configuration is docker/egress/squid.conf, mounted read-only
# by compose; docker/egress/start.sh runs both. Runs as the unprivileged
# `proxy` user (ports 3128 and 9993 need no capability).
FROM ${BASE_IMAGE} AS egress
RUN rm -f /etc/apt/sources.list.d/nodesource* \
 && apt-get update \
 && apt-get -y -o Dpkg::Options::=--force-confold upgrade --no-install-recommends \
 && apt-get install -y --no-install-recommends squid socat \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* \
 && /usr/sbin/squid -v | head -1 && socat -V | grep -m1 'socat version'
COPY docker/egress/start.sh /usr/local/bin/aa-egress-start
RUN chmod 0755 /usr/local/bin/aa-egress-start \
 && bash /usr/local/bin/aa-egress-start --check-ip 8.8.8.8 \
 && ! bash /usr/local/bin/aa-egress-start --check-ip 192.168.1.1
USER proxy
ENTRYPOINT ["/usr/local/bin/aa-egress-start"]

# --- pipeline: the job image (compose services pipeline*; the default target)
FROM ${BASE_IMAGE} AS pipeline
ARG BASE_IMAGE
# The base's own creation time as the registry reports it. Optional: supplied
# by `docker/aa-run.sh image` (--build-arg AA_BASE_CREATED=...) when it has the
# base locally; docker/image-age.sh falls back to the image-info file below.
ARG AA_BASE_CREATED=""
LABEL org.agentathens.base-image="${BASE_IMAGE}" \
      org.agentathens.base-created="${AA_BASE_CREATED}"

# Record, before anything below touches the system, when the base was built
# and which Chromium it ships. A LABEL cannot hold a value computed by RUN, so
# both go to /usr/local/share/agentathens/image-info (docker/image-age.sh reads
# it on the Mac). The newest of the base's dpkg database and /ms-playwright
# timestamps is the base's build time: image layers keep file mtimes.
RUN set -eu; t=0; \
    for p in /var/lib/dpkg/status /ms-playwright; do \
        m="$(stat -c %Y "$p")"; if [ "$m" -gt "$t" ]; then t="$m"; fi; \
    done; \
    chrome="$(ls -d /ms-playwright/chromium-*/chrome-linux*/chrome | head -1)"; \
    v="$("$chrome" --version | grep -oE '[0-9]+(\.[0-9]+){1,3}' | head -1)"; \
    [ -n "$v" ]; \
    mkdir -p /usr/local/share/agentathens; \
    printf 'base_created=%s\nchromium_version=%s\n' "$(date -u -d "@$t" +%Y-%m-%d)" "$v" \
        > /usr/local/share/agentathens/image-info; \
    cat /usr/local/share/agentathens/image-info

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Europe/Athens \
    LANG=C.UTF-8 \
    AA_CONTAINER=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium \
    DISABLE_AUTOUPDATER=1 \
    NETLIFY_TELEMETRY_DISABLED=1

# Tools the pipeline scripts call: jq + sqlite3 (daily-automated.sh, deploy
# gate), gh (git push credential helper, yield canary), unzip (bun), tzdata.
# The nodesource list is dropped: Node comes pinned with the base image.
# `apt-get upgrade` gives the Ubuntu system libraries (the ones Chromium links
# to) their security fixes on every rebuild; the weekly image-refresh rebuilds
# without cache, so this layer is redone. Chromium itself is not an apt
# package: only a newer base digest updates it.
RUN rm -f /etc/apt/sources.list.d/nodesource* \
 && apt-get update \
 && apt-get -y -o Dpkg::Options::=--force-confold upgrade --no-install-recommends \
 && apt-get install -y --no-install-recommends jq sqlite3 gh unzip tzdata \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Pinned CLIs: bun (runtime), netlify (deploy), claude (auto-enrich `claude -p`).
# `npm ci` installs exactly docker/cli/package-lock.json and verifies every
# tarball's integrity hash. Bump versions there (npm install --package-lock-only).
#
# Install scripts: `--ignore-scripts`, so none of the ~1,000 packages in the
# tree (netlify-cli's dependencies above all) runs code at build time. Only
# the two whose install script the pipeline needs run, explicitly, from
# their own (integrity-checked) package folder, as npm would:
#   bun                        postinstall `node install.js`: puts the native
#                              binary from @oven/bun-linux-* at bin/bun.exe
#   @anthropic-ai/claude-code  postinstall `node install.cjs`: the same for
#                              @anthropic-ai/claude-code-linux-* (bin/claude.exe)
# Skipped on purpose (lockfile `hasInstallScript`): netlify-cli (postinstall
# prints a welcome and sets up shell completion), esbuild (postinstall only
# validates/optimises; its JS API finds @esbuild/linux-* at run time), sharp
# (install only checks for the prebuilt @img/sharp-linux-*, which npm
# installs), unix-dgram (optional native build for hot-shots, which runs
# without it). The script list was taken from the registry metadata for the
# pinned versions; the scripts' bodies could not be read at authoring time,
# so the version checks at the end are what proves bun and claude work.
# A version bump that adds an install script needs a look here.
#
# npm runs as pwuser, not root (setpriv; unpacking tarballs and the two
# scripts never run with root rights); the tree is handed to root afterwards
# in the same layer, so no run-time user can change the CLIs.
COPY docker/cli/package.json docker/cli/package-lock.json /opt/aa-cli/
RUN set -eu; u="$(id -u pwuser)"; g="$(id -g pwuser)"; \
    chown -R "$u:$g" /opt/aa-cli; install -d -o "$u" -g "$g" -m 0700 /tmp/aa-npm-home; \
    asuser() { setpriv --reuid="$u" --regid="$g" --init-groups env HOME=/tmp/aa-npm-home npm_config_cache=/tmp/aa-npm-home/.npm "$@"; }; \
    asuser npm ci --prefix /opt/aa-cli --ignore-scripts --no-fund --no-audit; \
    (cd /opt/aa-cli/node_modules/bun && asuser node install.js); \
    (cd /opt/aa-cli/node_modules/@anthropic-ai/claude-code && asuser node install.cjs); \
    rm -rf /tmp/aa-npm-home; \
    chown -R root:root /opt/aa-cli; \
    ln -s /opt/aa-cli/node_modules/.bin/bun /opt/aa-cli/node_modules/.bin/bunx \
          /opt/aa-cli/node_modules/.bin/netlify /opt/aa-cli/node_modules/.bin/claude /usr/local/bin/; \
    bun --version && netlify --version && claude --version

# Stable Chromium path for puppeteer (scripts/lib/chrome-path.ts reads
# PUPPETEER_EXECUTABLE_PATH). Unused Playwright browsers stay in the base layer.
RUN ln -s "$(ls -d /ms-playwright/chromium-*/chrome-linux*/chrome | head -1)" /usr/local/bin/chromium \
 && /usr/local/bin/chromium --version

# macOS `stat -f` compatibility (scripts/auto-enrich.sh is macOS-only there).
COPY docker/stat-bsd-compat.sh /usr/local/bin/stat
COPY docker/gitconfig /etc/gitconfig
COPY docker/entrypoint.sh /usr/local/bin/aa-entrypoint
COPY docker/doctor.sh /usr/local/bin/aa-doctor
RUN chmod 0755 /usr/local/bin/stat /usr/local/bin/aa-entrypoint /usr/local/bin/aa-doctor \
 && [ "$(/usr/local/bin/stat -f %m /etc/hostname)" = "$(/usr/bin/stat -c %Y /etc/hostname)" ]

# Linux dependencies of the project. At run time /workspace is an empty tmpfs
# that aa-run.sh mounts the repo's top-level entries onto; compose mounts a
# fresh anonymous volume at /workspace/node_modules that Docker fills from
# this layer, so the Mac's own (darwin) node_modules are never used or touched.
WORKDIR /workspace
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts \
 && chown -R pwuser:pwuser /workspace

USER pwuser
ENV HOME=/home/pwuser
ENTRYPOINT ["/usr/local/bin/aa-entrypoint"]
CMD ["help"]
