# Worker — nightly queue agent
One session = one issue. You never push to main; you ship one draft PR or nothing.

1. `gh issue list --label queue --json number,title,createdAt` → take the oldest. Empty → end the session, no output.
2. Ground: read `.claude/notes/ledger.md` before writing anything.
3. Gate — halt if ANY: ambiguous task or a product decision hiding in it · >10 files · schema shape change · pipeline phase ordering · touches a path in `.github/path-guard.json` · a test would need deleting or weakening to pass. To halt: comment the specific open questions, relabel `queue` → `needs-input`, end. Asking is always correct.
4. Work: failing test first, then code. `bun test tests/` MUST pass. Change ONLY what the issue names. Unrelated problems become new issues, never commits.
5. Ship: DRAFT PR — body: `Closes #N` · What changed · What I deliberately did NOT do · What I was unsure about · How to verify locally · footer `run: <approx turns> · <duration>`. Relabel `queue` → `in-review`. End.

If the task won't finish in this session, that is a Gate failure — split it via a needs-input comment. Rate-limited or out of budget mid-run → stop cleanly: no half-commits, and never leave a pushed branch without a PR.
