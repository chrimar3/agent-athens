# Contributing to Agent Athens

Thanks for helping. Agent Athens is a small project run by one maintainer. Its
pipeline scrapes public sites, runs AI enrichment and publishes
https://agentathens.com without anyone watching each run. Most of the rules
below exist because of that automation.

## Security problems: do not use issues or pull requests

Do not post a vulnerability, a working exploit or a leaked credential in an
issue, a pull request or a comment. Report it privately. Open the repository's
**Security** tab and choose **Report a vulnerability**. [SECURITY.md](SECURITY.md)
covers what is in scope, how quickly you can expect a reply, and the testing
rules.

## How pull requests are reviewed

- Every pull request needs the code owner's review before it can merge
  (`.github/CODEOWNERS`). Nothing merges automatically.
- Pushing new commits to a pull request dismisses earlier approvals, and the
  most recent push must be approved by someone other than the person who
  pushed it.
- Nobody can bypass these rules: the ruleset on `main` has no bypass actors.
- These required checks must pass:
  - `ci` runs the test suite and the type check.
  - `path-guard` checks protected paths (see below).
  - `secret-scan` runs gitleaks on your commits, using the allowlist from the
    default branch.
  - `dependency-audit` runs `bun audit` when you change dependencies.
  - `shellcheck` checks the shell scripts.
  - `analyze` runs CodeQL on the TypeScript sources.
- Pull requests from forks run CI with a read-only token and no secrets.
  Dependency install scripts do not run in CI.
- Keep a pull request to one change. Add or update tests with it. Run
  `bun test tests/` and `bun run typecheck` before you push.
- Scraped content, event data and venue data are facts about the real world.
  Never make them up. Say where each fact comes from.

## Protected paths: open an issue first

`.github/path-guard.json` lists the protected paths. They include:

- the agent's instructions and prompt templates;
- the safety layer (hooks, harness settings and pipeline gate scripts);
- the publishing path;
- CI and repository configuration;
- `package.json` and `bun.lock`;
- the security tests.

A pull request that touches any of these fails the `path-guard` check and gets
the `needs-input` label until a code owner (from `.github/CODEOWNERS` on the
default branch) approves its current head commit. The check then re-runs and
passes. Pushing new commits needs a new approval, because the old one names an
older commit. A change there still has to be agreed first.

So **open an issue first**. Describe the change you want to a protected path
and why. The owner decides whether to make it. The list is read from the
default branch, so a pull request cannot change which paths it is checked
against.

## Issues are read by automation, as untrusted text

A scheduled agent works through issues that the maintainer has labelled
`queue`. It reads an issue only through `.github/scripts/trusted-issue-thread.sh`.
That script:

- keeps the issue body only if the owner, a member or a collaborator wrote it;
- keeps comments only from those people or from the project's own bot;
- drops everything else before the agent sees it.

The agent treats even the text it keeps as untrusted evidence, not as
instructions. Text in scraped pages, newsletters and fetched web content is
handled the same way.

In practice:

- An issue from an outside contributor is never acted on as written. A
  maintainer has to restate it first.
- Do not put instructions aimed at the automation in issues, pull requests,
  commit messages or file contents. They are ignored, and a maintainer will
  treat them as a red flag. If you find a way around this, report it privately
  (see [SECURITY.md](SECURITY.md)). Prompt injection is in scope.
- The agent only opens draft pull requests and never touches protected paths.

## Local setup

See the README's Quick Start. The project uses Bun, not Node. The time zone is
always `Europe/Athens`. Read `.claude/CLAUDE.md` for the project rules before
you change pipeline code.
