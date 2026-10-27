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

### M1.2 Live-feed smoke test — done

`mcp/scripts/smoke.ts` sends real JSON-RPC `tools/call` requests through
`handleHttp` to the live feed (`httpFeedSource('https://agentathens.com')`), so
the overlay, the protocol layer and all four tools run as they will in the
Worker. Full output: `evidence/m1.2-smoke.txt`. Excerpt:

```
$ bun run scripts/smoke.ts
today (Athens)   2026-10-27
feed updated     el 2026-10-06T06:02:14.618Z  en 2026-10-06T06:02:14.684Z  (21 days before today)
events           el 569  en-only feed 171  with an en record 171
not ended today  308
per category     {"music":314,"theatre":193,"exhibition":6,"cinema":2,"comedy":4,"dance":0,"festival":10,"performing_arts":2,"education":11,"other":27}
performer total  2  with performer.wikidata 2
search_events    lang en, next 30 days: total 207, returned 3
search_events    lang en, this_weekend 2026-10-31..2026-11-01: total 124
get_event        c6faed28-gagarin-205-… → found, description 56 chars
list_venues      next 30 days: 83 venues; top 5: 26 Μέγαρο Μουσικής Αθηνών, 20 ΚΠΙΣΝ, 5 Olvio, 5 Onassis Stegi, 5 Temple
match_artists    input (from the live feed): ["The Gathering",{"wikidata":"Q687651"},"Autechre",{"wikidata":"Q247237"}]
  any date:     5 matches, unmatched []
    wikidata      Q687651 → 2026-09-24T20:00:00+03:00 The Gathering (NL) live in Greece
    wikidata      Q247237 → 2026-10-03T20:00:00+03:00 AUTECHRE
    name          The Gathering → 2026-09-24T20:00:00+03:00 The Gathering (NL) live in Greece
    name          Autechre → 2026-10-03T20:00:00+03:00 AUTECHRE
    title_mention Autechre → 2026-10-03T20:00:00+03:00 PLISSKËN presents Autechre
  default window 2026-10-27..2027-04-24: 0 matches
smoke: OK — all four tools answered
exit 0
```

The figures the spec asks for:

- **Total events:** 569 in the el feed. 171 of them have an English record.
- **Per category (el):** music 314, theatre 193, other 27, education 11, festival 10, exhibition 6, comedy 4, cinema 2, performing_arts 2, dance 0.
- **Events with `performer.wikidata`:** 2 (The Gathering, Q687651; Autechre, Q247237).
- **`match_artists` with names from the live feed:** see above. The input is the two performer names and QIDs that the feed itself carries. Nothing was invented.

What these numbers mean for the product (open items, not fixed here):

- **The feed is 21 days old.** It was last written on 2026-10-06, which fits the
  container outage noted in the input-pipeline audit. The server reports this in
  `feed_updated` on every result. It cannot make the data fresher.
- **Artist matching has almost nothing to match against.** Only 2 of 569 events
  carry a `performer`, and both shows are already in the past, so
  `match_artists` returns 0 matches in its default (future) window today. The
  title-mention path is the only one that reaches most events. Better coverage
  needs performer data in the pipeline, which is out of scope here (§5).
- **The live data contains duplicate listings.** "AUTECHRE" and "PLISSKËN
  presents Autechre" are two listings at the same venue on the same evening.
  This is a pipeline matter; the server shows what the feed says.

## M2: Exact artist matching

## M3: Event cards (MCP Apps)

## M4: Ready for the directories

## Independent review (§7.4)

## Blockers and owner actions
