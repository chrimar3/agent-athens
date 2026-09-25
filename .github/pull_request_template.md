<!-- Security problems: do not open a PR. Report privately — see SECURITY.md. -->

## What and why

<!-- One change per PR. Link the issue it resolves (required for protected paths). -->

## Checks

- [ ] `bun test tests/` and `bun run typecheck` pass locally, and new behaviour has tests.
- [ ] No protected path is touched (`.github/path-guard.json`), or an issue agreeing to the change is linked above.
- [ ] No secret, token, `.env` content or personal data is added, including in fixtures, logs or screenshots.
- [ ] No test was deleted or weakened to make this pass.
- [ ] New dependencies (if any) are needed, maintained, and need no install script (CI installs with `--ignore-scripts`).
- [ ] Event, venue and price data is sourced, not invented, and times use `Europe/Athens`.
- [ ] Text copied from scraped pages, issues or the web is treated as data. Nothing in this PR asks the automation to do anything.

See [CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md).
