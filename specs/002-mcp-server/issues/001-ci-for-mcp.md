# DRAFT ISSUE: run the `mcp/` tests in CI

*Spec 002, M4.3. This is a draft and has not been applied. `.github/**` is a
protected path, so the owner decides whether to open it as an issue and make
the change.*

## Problem

The required `ci` job runs only the files that
`.github/scripts/test-report-check.sh --list` prints, which are test files
under `tests/`, `src/` and `scripts/`. It typechecks only the root
`tsconfig.json`, which includes `src/**` and `tests/**`. Nothing in `mcp/` is
tested or typechecked in CI. A PR could break the MCP server, or the feed shape
it reads, and still pass `ci`.

The feed-shape case matters most. `mcp/test/*` reads fixtures built by the
site's real `buildDataFeed()`, and `mcp/src/feed.ts` imports
`config/lifecycle-presumption.json`. A change to either one can break the
server without touching `mcp/`.

## Proposed change

Add a second job to `.github/workflows/ci.yml`. It uses the same pinned
actions and the same read-only token as the existing job:

```yaml
  mcp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: "1.3.0"
      # Root install: mcp/tsconfig.json takes bun-types from ../node_modules.
      - run: bun install --frozen-lockfile --ignore-scripts
      - run: bun install --frozen-lockfile --ignore-scripts
        working-directory: mcp
      - run: bun test test/
        working-directory: mcp
      - run: bun run typecheck
        working-directory: mcp
      # wrangler --dry-run: bundles the Worker, needs no Cloudflare credentials.
      - run: bun run bundle-check
        working-directory: mcp
      - run: bun audit
        working-directory: mcp
```

Notes for review:

- **No network.** `mcp/test/` uses only fixtures and localhost. The live
  checks, `scripts/smoke.ts` and `scripts/feed-contract.ts`, stay manual or
  belong in `live-site-check.yml`.
- **`bun audit` fails the job on any advisory.** Today it reports none. If
  that is too strict for a required check, make it a separate, non-required
  job. Do not drop it.
- **The browser test (`bun run e2e`) is left out.** It needs Chromium. To add
  it, install Playwright's browser in CI (`npx playwright@1.55.1 install
  --with-deps chromium`) and set `PLAYWRIGHT_CHROMIUM` to that binary. The test
  reads that variable because, locally, it uses the Chromium already cached.
- **Branch ruleset.** Decide whether `mcp` becomes a required check.
  `tests/branch-rules-check.test.ts` and `repo-settings.yml` may need updating
  to match.

## Done when

- A PR that breaks `mcp/test/` fails CI.
- A PR that changes `src/generators/datafeed.ts` in a way the MCP server
  cannot read fails CI.
