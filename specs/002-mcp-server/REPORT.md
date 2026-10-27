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

### M1.3 Feed contract — done

`mcp/scripts/feed-contract.ts` exports `checkFeedContract(doc)`. These are
**violations**, and the CLI exits 1 on any of them:

- an element for which `toRecord()` returns null;
- a duplicate id, which would break `get_event` lookups;
- a `url` that is not on agentathens.com, which would break attribution (§2.6).

For every field path `toRecord()` reads, it also **counts** how many events
lack it, and flags any field missing on more than 5% of events.
`test/contract.test.ts` pins this on the fixture. The test asserts its own
precondition: 2 of 8 fixture events have no Offer, so there is something to
count. Mutation runs, with the restored file confirmed byte-identical:

```
## mutant: off-site url check removed
(fail) feed contract > duplicate ids and off-site urls are violations
 3 pass
 1 fail
## mutant: duplicate-id check removed
(fail) feed contract > duplicate ids and off-site urls are violations
 3 pass
 1 fail
## restored, byte-identical
```

Live run (full output in `evidence/m1.3-contract.txt`):

```
$ bun run scripts/feed-contract.ts
https://agentathens.com/api/events.json
  elements 569, dateModified 2026-10-06T06:02:14.618Z, violations 0
  * endDate                              123  21.6%
  * location.geo                          33  5.8%
  * offers                               397  69.8%
  * offers.price                         397  69.8%
  * offers.url                           414  72.8%
  * performer                            567  99.6%
https://agentathens.com/api/en/events.json
  elements 171, dateModified 2026-10-06T06:02:14.684Z, violations 0
  * endDate                               48  28.1%
  * offers                               119  69.6%
  * offers.price                         119  69.6%
  * offers.url                           119  69.6%
  * performer                            169  98.8%
feed-contract: OK
exit 0
```

All other fields read by `toRecord()` are missing on 0 events, apart from
`location.geo` in en (1 event, 0.6%). Every element gives a non-null record.
No site change is needed.

What the gaps mean for the tools. These are facts to state in directory
copy, not bugs in the server:

- **`max_price` drops events with no listed price**, which is about 70% of them.
  The schema description already says so.
- **The `neighborhood` filter reaches few events.** In the el feed,
  `location.containedInPlace.name` is "Municipality of Athens" for 490 of 569
  events. Only 79 name an area, such as Kerameikos 24, Mets 19 and Exarchia 17.
- **`endDate` is missing on 21.6% of events.** For theatre, exhibition and
  festival, M0 treats a missing end as ongoing. Other categories end on their
  start day.

### M1.4 Protocol conformance — done

Dev dependencies, in `mcp/package.json` only and pinned exact:
`@modelcontextprotocol/sdk` 1.32.1 and `wrangler` 4.149.0. Both were published
at least two weeks before this run; the newest releases were hours old.
`mcp/bun.lock` is committed. The root `package.json` is untouched.

`bun audit` first reported 4 high and 4 moderate advisories, all in `undici`
7.29.1, which wrangler pulls in through miniflare. Wrangler only ships the fixed
undici (7.30.1) from 4.153.0, published one day before this run. Instead,
`mcp/package.json` overrides undici to 7.30.1, a patch release published 12
days before this run:

```
$ bun audit
No vulnerabilities found
```

`bundle-check` now calls the pinned `wrangler` instead of `bunx wrangler@4`,
which would fetch whatever is newest. The `deploy` script is the owner's and
is left as it was.

`test/sdk-client.test.ts` starts `Bun.serve` on the fixture feed, connects the
official `Client` over `StreamableHTTPClientTransport` (real HTTP), lists the
tools, calls each of the four, and checks that bad arguments return a tool
error. It passed on its first run, so mutation runs are its RED (see
`evidence/m1.4-protocol.txt`):

```
--- mutant 1: initialize answers protocolVersion '1999-01-01'
error: Server's protocol version is not supported: 1999-01-01
 0 pass
--- mutant 2: responses sent as content-type text/plain
error: Streamable HTTP error: Unexpected content type: text/plain
 0 pass
 1 fail
restored-identical
```

Inspector CLI against `PORT=8787 bun run dev`, which serves the live feed:

```
$ npx @modelcontextprotocol/inspector@2.10.1 --cli http://localhost:8787/mcp --transport http --method tools/list
exit 0 — search_events, get_event, list_venues, match_artists (all readOnlyHint=true)
$ … --method tools/call --tool-name search_events --tool-arg when=this_weekend --tool-arg lang=en --tool-arg limit=2
exit 0 — isError=false window={"from":"2026-10-31","to":"2026-11-01","timezone":"Europe/Athens"} total=124 returned=2
```

The inspector printed `EBADENGINE` warnings: it asks for Node ≥ 22.19, and this
Mac has 22.16. Both calls still exited 0.

## M2: Exact artist matching

## M3: Event cards (MCP Apps)

## M4: Ready for the directories

## Independent review (§7.4)

## Blockers and owner actions
