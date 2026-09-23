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
# Silicon). Pinned by digest; bump tag and digest together.
ARG BASE_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
FROM ${BASE_IMAGE}

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
RUN rm -f /etc/apt/sources.list.d/nodesource* \
 && apt-get update \
 && apt-get install -y --no-install-recommends jq sqlite3 gh unzip tzdata \
 && rm -rf /var/lib/apt/lists/*

# Pinned CLIs: bun (runtime), netlify (deploy), claude (auto-enrich `claude -p`).
# `npm ci` installs exactly docker/cli/package-lock.json and verifies every
# tarball's integrity hash. Bump versions there (npm install --package-lock-only).
COPY docker/cli/package.json docker/cli/package-lock.json /opt/aa-cli/
RUN npm ci --prefix /opt/aa-cli --no-fund --no-audit \
 && ln -s /opt/aa-cli/node_modules/.bin/bun /opt/aa-cli/node_modules/.bin/bunx \
          /opt/aa-cli/node_modules/.bin/netlify /opt/aa-cli/node_modules/.bin/claude /usr/local/bin/ \
 && npm cache clean --force \
 && bun --version && netlify --version && claude --version

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

# Linux dependencies of the project. The repo is bind-mounted over /workspace at
# run time; compose mounts a fresh anonymous volume at /workspace/node_modules
# that Docker fills from this layer, so the Mac's own (darwin) node_modules are
# never used or touched.
WORKDIR /workspace
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts \
 && chown -R pwuser:pwuser /workspace

USER pwuser
ENV HOME=/home/pwuser
ENTRYPOINT ["/usr/local/bin/aa-entrypoint"]
CMD ["help"]
