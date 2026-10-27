# Spec 002: Run report

The executor fills this in. Each section gives the status (done / blocked /
not started), the commands it ran with their real output, and open items.

## Setup: where this run starts

`93c0f5076` and branch `claude/mcp-server` did not exist in the local clone or
on `origin` (checked with `git cat-file`, `git ls-remote origin`, and every
worktree). The owner supplied both commits as `git format-patch` files. They
were applied with `git am` on a new branch `claude/mcp-server`, cut from
`origin/main` (`3c8130d5b`), in a separate worktree, so the main checkout's
uncommitted work was not touched:

```
Applying: Add read-only MCP server over the events feed (mcp/)
Applying: Spec 002: autonomous run brief for the MCP server (M1–M4)
3e9a48454 Spec 002: autonomous run brief for the MCP server (M1–M4)
7cdcbe6a9 Add read-only MCP server over the events feed (mcp/)
```

`7cdcbe6a9` has the same content as `93c0f5076`. Its SHA differs because the
parent and committer differ. Everywhere this report says "M0", it means
`7cdcbe6a9`.

## Baseline (§7)

Root, on `3e9a48454` (root code identical to M0). Full list in
`evidence/baseline.txt`.

```
$ bun run typecheck
$ tsc --noEmit
typecheck exit 0

$ bun run test
 5378 pass
 212 skip
 2 fail
Ran 5592 tests across 299 files. [580.44s]

(fail) push-gate — behavior (real blocks extracted from the script, run in fixture repos) > TAMPER: an agent-instruction file is REFUSED even when PIPELINE_ALLOWLIST lists it, naming why
(fail) deadman-watchdog.ts — the database is read through the untrusted-DB reader > a normal database → the same signals as a direct read (enrich age, row count), no refusal
```

Another session ran the same suite in the main checkout at the same time.
Neither failure involves `mcp/`, and neither is investigated here.

`mcp/` on M0: `bun test test/` → 25 pass, 0 fail; `bun run typecheck` → clean.

Scope note: the root `tsconfig.json` includes only `src/**` and `tests/**`, and
`scripts/run-tests.sh` lists only test files under `tests/`, `src/` and
`scripts/`. Nothing in `mcp/` is in the root gate, so changes inside `mcp/`
cannot change the root results. The root gate is still rerun at the end of
each milestone (§7.2).

## M0: MCP server skeleton (done before this run)

- Commit `93c0f5076`: four tools, stateless Streamable HTTP, Worker and Bun entry points.
- On the synthetic fixtures, `cd mcp && bun test test/` gives 25 pass and 0 fail, and `tsc -p mcp` is clean.
- The official SDK client connected to the local server. The wrangler dry-run bundle is 25 KiB.
- Known gap that M1.1 is for: the `en` feed hides Greek-only events.

## M1: Ready to ship

### M1.1 Language coverage — done

Cause, confirmed in `src/generators/datafeed.ts:46`: the en feed keeps an
event only if it has `fullDescriptionEn`.

Fixture: `scripts/make-fixture.ts` gains one synthetic Greek-only event
("Ο Βυσσινόκηπος", with no `fullDescriptionEn`). After regenerating, the el
fixture has 8 events and the en fixture has 7. The 7 existing elements are
byte-identical to before. The test asserts its own precondition: the event is
in el and missing from en.

RED on M0 code with the new test (`evidence/m1.1-red.txt`):

```
Expected to contain: "Ο Βυσσινόκηπος"
Received: [ "Ρωμαίος και Ιουλιέτα" ]
(fail) lang "en" keeps Greek-only events > search_events lang en returns it, with its Greek name
Expected: true
Received: false
(fail) lang "en" keeps Greek-only events > get_event lang en finds it by id
 27 pass
 2 fail
```

Fix: `overlayEnglish(el, en)` in `src/feed.ts` takes every el event, swaps in
the en record when one has the same id, and appends any en-only event so none
is lost. It reports the older of the two `dateModified` values. In
`src/mcp.ts`, `lang: "en"` uses that view. It is cached in a WeakMap keyed on
the cached snapshots, so it is rebuilt only when a feed refreshes.

GREEN:

```
$ bun test test/
 29 pass
 0 fail
$ bun run typecheck
$ tsc --noEmit -p .        (exit 0)
```

## M2: Exact artist matching

## M3: Event cards (MCP Apps)

## M4: Ready for the directories

## Independent review (§7.4)

## Blockers and owner actions
