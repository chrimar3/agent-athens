#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Setup script for the Claude Code Custom environment (cloud-Routine spike).
#
# Provisions the toolchain the build+deploy phase needs and proves the seeded
# database opens in-sandbox. Paste/point the environment's "setup script" at
# this file. It is idempotent and read-only against the repo (no writes to
# tracked files).
#
# Scope note: the BUILD+DEPLOY phase needs Bun only. It does NOT need Python
# (live scrapers are Bun/TS; .py is _archive only) and it does NOT need Chrome
# (Puppeteer is a scrape-phase concern). We deliberately skip the Puppeteer
# Chromium download to keep the environment lean — see PUPPETEER_SKIP_DOWNLOAD.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "=== Agent Athens cloud-routine spike — environment setup ==="
echo "PWD: $(pwd)"
uname -a || true

# 1. Bun — install only if the sandbox doesn't already ship it.
if command -v bun >/dev/null 2>&1; then
  echo "[bun] present: $(bun --version)"
else
  echo "[bun] not found — installing (requires bun.sh to be reachable)…"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo "[bun] installed: $(bun --version)"
fi

# 2. Dependencies. Skip the Puppeteer Chromium download — the build+deploy
#    path doesn't render with a browser, and the download is large + would
#    fail anyway without an allowlisted CDN.
echo "[deps] installing (Chromium download skipped)…"
PUPPETEER_SKIP_DOWNLOAD=1 bun install

# 3. Prove bun:sqlite opens the SEEDED database. The DB is force-added on the
#    throwaway spike branch (it is gitignored on main); if it's absent here,
#    the checkout/branch is wrong and the build would silently build nothing.
echo "[db] smoke-testing bun:sqlite against data/events.db…"
if [ ! -f data/events.db ]; then
  echo "[db] ❌ data/events.db is MISSING — are you on the seeded spike branch?" >&2
  echo "[db]    On main the DB is gitignored; the routine must run the spike branch." >&2
  exit 1
fi
bun -e '
  const { Database } = require("bun:sqlite");
  const db = new Database("data/events.db", { readonly: true });
  const { n } = db.query("SELECT COUNT(*) AS n FROM events").get();
  console.log(`[db] ✅ bun:sqlite OK — events table has ${n} rows`);
  db.close();
'

echo "=== setup complete — toolchain ready for filter → build → deploy ==="
