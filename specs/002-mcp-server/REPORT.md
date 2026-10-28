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

### M1.5 Abuse limits — done, with one real bug fixed

`test/limits.test.ts` has one test per case and pins each limit from both
sides: exactly 64 KB is accepted and 64 KB + 1 is refused; a batch of 20 is
answered and 21 is refused; 200 artists are matched and 201 are refused. The
helper asserts that each body is exactly the intended size in UTF-8.

**Bug found and fixed.** M0 compared `text.length`, which counts UTF-16
characters, with the 64 KB limit, and it buffered the whole body first. A
chunked request has no `content-length`, so the header check is skipped. That
lets about 80,000 bytes of Greek text, which is about 40,000 characters, through.

```
Expected: 413
Received: 200
(fail) body size > a streamed body over 64 KB in bytes but not in characters is 413
 7 pass
 1 fail
```

`readCapped()` in `src/mcp.ts` now reads the stream, counts bytes, and cancels
the read as soon as the count passes 64 KB. Result: 8 pass, 0 fail.

The 413, 400 and 200-artist limits already existed in M0, so their tests passed
on the first run. Mutation runs are their RED (`evidence/m1.5-red.txt`): with
the body limit raised to 65 KB, 2 tests fail; with the batch limit at 21, 1
fails; with the artist limit at 201, 1 fails. Both files were restored
byte-identical.

Rate limiting is documented in `mcp/README.md` § Limits as a Cloudflare
dashboard rule. Nothing was built for it.

### M1 gate

`mcp/` gate, run on an export of committed HEAD `bdbf03abf` (after M1.5), so
uncommitted files could not affect it:

```
$ bun test test/
 45 pass
 0 fail
Ran 45 tests across 4 files.
$ tsc --noEmit -p .
typecheck exit 0
$ wrangler deploy --dry-run
Total Upload: 26.77 KiB / gzip: 8.80 KiB        (limit 100 KiB)
$ bun audit
No vulnerabilities found
```

Root gate on `bdbf03abf`:

```
$ bun run typecheck   → typecheck exit 0
$ bun run test
 5379 pass
 212 skip
 1 fail
Ran 5592 tests across 299 files. [531.57s]
(fail) deadman-watchdog.ts — the database is read through the untrusted-DB reader > a normal database → the same signals as a direct read (enrich age, row count), no refusal
```

The failing set is a subset of the baseline. The baseline's push-gate
failure passed on this run, so it looks flaky.

### M1.6 Runs with no stated end — fix added during M4.1 testing

This is not one of the spec's task ids. It is an M1 defect ("correct on the
real feed") that only showed up when the M4.1 example prompts ran against the
live feed. "What theatre is on tonight?" listed "ΕΙΡΗΝΗ περιοδεια" at Θέατρο
Βράχων, a single tour date on 2026-09-01. M0 treated every theatre, exhibition
or festival listing with no `endDate` as running forever. It relied on the
feed dropping old rows, and a feed that is 21 days stale does not drop them.

The site already has a rule for this: `config/lifecycle-presumption.json`,
read by `resolveEffectiveEnd()` in `src/utils/event-lifecycle.ts`. A run with
no end lasts its start + 45 days for theater, 90 for exhibition and 30 for
festival. `mcp/src/feed.ts` now imports that JSON at build time and applies the
same windows. There is one source of truth, and `config/` is only read. Change
outside `mcp/`: none. The Worker bundle includes a copy of the JSON.

```
RED (theatre run starting 2026-11-20, no end, searched on 2027-01-05):
Expected: false
Received: true
(fail) search_events > a run with no stated end lasts the site presumption window, not forever
 29 pass
 1 fail
GREEN: bun test test/ → 60 pass, 0 fail
mutant (theatre with no end treated as ongoing again):
(fail) search_events > a run with no stated end lasts the site presumption window, not forever
 29 pass
 1 fail
restored-identical
```

On the live feed, "theatre, today" fell from 96 to 86 events, and the 2026-09-01
date of "ΕΙΡΗΝΗ" is gone. Limitation: its 2026-09-26 tour stop at Κατράκειο
has no end either, so it stays "on" until 2026-11-10. The site applies the
same rule. The real fix is a stated end in the data, not a stricter rule here.

## M2: Exact artist matching

### M2.1 Spotify IDs from Wikidata — done

`mcp/scripts/fetch-spotify-ids.ts` reads only `performers[*].sameAs` links of
the form `https://www.wikidata.org/wiki/Q…` in `config/performer-sameAs.json`,
which it opens read-only. It sends `SELECT ?item ?spotify WHERE { VALUES ?item
{ … } ?item wdt:P1902 ?spotify . }` to `https://query.wikidata.org/sparql` in
batches of at most 200, with the User-Agent `AgentAthensMCP/0.1
(https://agentathens.com; build-time Spotify artist ID lookup for the Agent
Athens MCP server)`. It refuses any value that is not a 22-character base62
artist ID, and writes `mcp/data/performer-ids.json` as `{ _meta: { source,
query, retrieved_at, qids_queried, count }, byQid: { Q…: { spotify: [...] } } }`.
`count` is computed from `byQid`, and a test pins that.

The real config caches failed lookups as `null`: 341 of its 394 entries. The
first live run crashed on them. The synthetic test config gained a `null`
entry, the test failed for that reason, and then the script was fixed
(`evidence/m2.1-spotify-ids.txt`).

```
$ bun run scripts/fetch-spotify-ids.ts
QIDs queried 50, with a Spotify ID 34, Spotify IDs 34
```

**34 of the 50 QIDs have a Spotify artist ID on Wikidata.** I checked two
against a different Wikidata endpoint, `Special:EntityData`, and both match
the file: Rotting Christ Q938889 → `7FhkwcO8Jd7BRWdllBpXBJ`, and Moby Q14045 →
`3OsRAKCvk37zwYcnzRf5XF`. The data file is committed.

### M2.2 `match_artists` by `spotify_id` — done

Artists may now be `{ name?, wikidata?, spotify_id? }`. A `spotify_id` resolves
through the file to its QIDs. When the event performer's QID is among them, the
match has confidence `"spotify_id"`. Ranking is spotify_id > wikidata > name >
title_mention. An ID the file does not know falls back to the name, so the
server instructions tell the model to send `{name, spotify_id}` together. A
malformed ID is an input error whose message says what an artist ID looks
like.

Tests (`test/spotify-match.test.ts`) use a synthetic index with one obviously
fake ID (`FixtureSpotifyId000001`). They cover all four confidence levels in
one call and check their order, the ID winning over a non-matching spelling,
the fallback to the name, an unknown ID with no name, and a malformed ID. Two
more tests read real IDs from the committed file. One checks the file is well
formed and that `count` equals its entries. The other sends a real Spotify ID
(Rotting Christ's) through HTTP using the server's default index, and asserts
its precondition that the file has that QID.

```
## RED (M1 code, new test file)
SyntaxError: Export named 'spotifyIndex' not found in module '…/mcp/src/tools.ts'.
## GREEN
$ bun test test/
 59 pass
 0 fail
## mutant: spotify_id ranked last (rank 4)
(fail) match_artists by spotify_id > all four confidence levels, ranked spotify_id > wikidata > name > title_mention
 8 pass
 1 fail
## mutant: spotify_id lookup ignored
 5 pass
 4 fail
restored-identical
```

Bundle with the data file: `Total Upload: 31.19 KiB / gzip: 10.46 KiB`.

**What this buys today is small.** Only 2 live events carry a performer, both
already past (M1.2), so no Spotify ID matches a current event yet. The
mechanism is in place for when the pipeline links more performers.

### M2.3 What the assistants' Spotify integrations expose — done

The note is in `docs/mcp-spotify-integrations.md`, checked 2026-10-27, with
links and page dates. A research subagent gathered the sources. I then
fetched the key primary page (`claude.com/connectors/spotify`) again myself, and
it confirms the tool list: `create_playlist`, `get_currently_playing`,
`search`, `add_to_library`, `fetch_tracks` and `Remove_from_library`.

**Plain answer: neither exposes listening data, as far as primary sources
show.** For ChatGPT, the only claim of access to listening history is
secondary (TechCrunch). OpenAI's own pages returned 403 to automated fetching,
so that claim is marked unverified. The fallback is that the user names
artists, or the assistant passes what it knows. When the assistant has a
Spotify ID, it sends `{name, spotify_id}`.

### M2 gate

The M2 done-when checks:

- **Fixture tests cover all four confidence levels:** yes. One test checks
  `['spotify_id', 'wikidata', 'name', 'title_mention']` in that order.
- **Real number of QIDs with a Spotify ID:** 34 of 50.
- **Data file committed:** `392fecbb1`.

## M3: Event cards (MCP Apps)

### M3.0 Spec strings — done

**Source.** `modelcontextprotocol/ext-apps`, `specification/2026-01-26/apps.mdx`,
whose line 9 reads `**Status:** Stable (2026-01-26)`. It is pinned to tag
`v1.0.0`, commit `298e884ec3f02daba085acdb02042d73bd00b355` ("chore: stable
spec release 2026-01-26 and SDK v1.0.0 (#362)"), and the file has had no
commits since:
<https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/298e884ec3f02daba085acdb02042d73bd00b355/specification/2026-01-26/apps.mdx>
(sha256 `ee452a7d1b9b7fb9…`).

**How it was read.** A research subagent found and downloaded the file. I then
grepped and read the cited lines in that local copy myself. Every string below
was checked against it. The `specification/draft/apps.mdx` file
(`Status: Draft`) was **not** used.

| Item | Exact string | Spec line |
|---|---|---|
| Resource scheme | `ui://` ("URI MUST start with `ui://` scheme") | 267 |
| MIME type | `text/html;profile=mcp-app` ("MUST be") | 240, 268 |
| Tool link | `_meta.ui.resourceUri` (flat `_meta["ui/resourceUri"]` is deprecated) | 326, 347 |
| Capability key | `io.modelcontextprotocol/ui`, sent by the **client** in `capabilities.extensions`, with `mimeTypes` | 40, 1498–1522 |
| CSP fields | `_meta.ui.csp.{connectDomains, resourceDomains, frameDomains, baseUriDomains}` on each `resources/read` content item; also `_meta.ui.prefersBorder`, `domain`, `permissions` | 243–259 |
| Default CSP (no `csp`) | `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none';` | 275–284 |
| Bridge transport | JSON-RPC 2.0 over `window.postMessage` | 413 |
| Handshake | `ui/initialize` (View→Host, params `appCapabilities`, …) then `ui/notifications/initialized` | 485, 507, 512 |
| Tool result | `ui/notifications/tool-result`, params `CallToolResult` | 1145–1153 |
| Tool input | `ui/notifications/tool-input`, params `{ arguments }` | 1106–1118 |
| Open link | `ui/open-link`, params `{ url }`, result `{}`, error code `-32000` | 965–996 |
| Size | `ui/notifications/size-changed`, params `{ width, height }` | 1204–1217 |
| Teardown | `ui/resource-teardown` (Host→View request, answered with `{}`) | 1171 |
| Context | `ui/notifications/host-context-changed`, `Partial<HostContext>` | 1219 |

**Where the spec is loose or inconsistent, and what this server does.** None
of these contradicts spec 002, so the stop condition does not fire.

- **Name of the handshake request.** Line 461's example sends `"initialize"`;
  lines 485, 507, 512 and 756 use `ui/initialize`. The view sends
  `ui/initialize`, as the normative text and the v1.0.0 SDK (`src/app.ts:1126`)
  do. It sends `protocolVersion: "2026-01-26"` and `appInfo`, as the SDK does.
- **Capability check.** "Servers SHOULD check client capabilities before
  registering UI-enabled tools" (line 1556). This server is stateless (§2.1),
  so `tools/list` cannot know what an earlier `initialize` said. It always
  includes `_meta.ui.resourceUri` and always returns the full `content` text
  and `structuredContent`. That follows "Tools MUST return meaningful content
  array even when UI is available" (line 1559) and "host does not support MCP
  Apps → … text-only fallback" (line 389). Hosts without Apps support ignore
  `_meta`.
- **`resources/list`.** Servers MAY omit UI resources from it (line 393), but
  the lifecycle diagram includes them. This server lists its one resource.
- **No server-side extension advertisement** is defined in the spec. The server
  declares only the core `resources` capability.
- **Deprecated flat key** `_meta["ui/resourceUri"]`: not sent, following the
  deprecation notice at line 347.

### M3.1 Resources and tool links — done

`initialize` now declares `resources: { listChanged: false }`. `tools/list`
gives `search_events` and `match_artists` the field
`_meta: { ui: { resourceUri: "ui://agent-athens/events.html" } }`;
`get_event` and `list_venues` have no `_meta`. `resources/list` returns that
one resource. `resources/read` returns `{ contents: [{ uri, mimeType:
"text/html;profile=mcp-app", text: <html>, _meta: { ui: { csp: {
resourceDomains: ["https://agentathens.com"] }, prefersBorder: false } } }] }`.
An unknown URI returns JSON-RPC error `-32002`, the core MCP code for
"resource not found". Tool results are unchanged.

`test/ui.test.ts` pins all of this. It also checks that the HTML loads no
external script, stylesheet, font or `@import`, makes no network calls, and
that its `IMAGE_ORIGINS` constant equals the declared `resourceDomains`.
RED on M2 code (`evidence/m3.1-red.txt`): 1 pass, 7 fail. The one pass is the
text-fallback test, which pins M0 behaviour on purpose. GREEN: `bun test
test/` → 68 pass, 0 fail.

**Why only agentathens.com is in the CSP.** In the live el feed, 416 of 569
images are on agentathens.com. The rest are on athinorama.gr (98), images.ra.co
(37), more.com (8), snfcc.snfccmedia.com (6) and images.cometogether.live (4).
Allowing those hosts would show every viewer's IP address to them, so those
cards get a placeholder instead (§2.4).

### M3.2 The view — done

`mcp/src/ui/events.html` is one file, imported as text
(`with { type: 'text' }`). Bun reads it as a string, and wrangler uploads it
as a Text module with the Worker. The bundle is 47.08 KiB with the HTML. It:

- uses the design-system tokens copied from `src/styles/design-system.css`:
  colours, the Manrope stack falling back to system fonts, the type scale,
  spacing and radii;
- talks to the host only over the spec bridge: `ui/initialize`, then
  `ui/notifications/initialized`; it renders on `ui/notifications/tool-result`,
  opens links through `ui/open-link`, reports `ui/notifications/size-changed`,
  and answers `ui/resource-teardown` and `ping`;
- accepts messages only from `window.parent`;
- builds the DOM with `textContent` only, because feed text is untrusted; it
  renders only `https:` links, and loads an image only when its origin is in
  `IMAGE_ORIGINS`;
- for `match_artists` results, shows why each event matched, flagging
  `title_mention` as "may be a tribute or support act".

**Contrast fix found by axe.** Theatre's category colour `#ef2c46`, used as
12px text on `--bg-elevated`, is 4.45:1, below WCAG AA. The category label now
uses `--text-secondary`, and the category colour moves to a decorative dot.

### M3.3 Verification — done

`mcp/e2e/ui.e2e.ts`, run with `bun run e2e`, uses Playwright 1.55.1 with the
Chromium build already cached (1187, Chrome 140). Each run:

- serves the view with the CSP a host must build from `_meta.ui.csp` (spec
  lines 275–286), inside a stub host page;
- answers `ui/initialize`, then posts a real `tools/call` result produced by
  this server;
- stubs agentathens.com images and blocks every other host, so it needs no
  network.

```
$ bun run e2e
(pass) handshake follows the spec: ui/initialize, then ui/notifications/initialized
(pass) one event: name, date, venue, price, both buttons
(pass) zero events: an empty state, no cards
(pass) fifty events render as fifty cards
(pass) missing price and missing image degrade to text and a placeholder
(pass) images from hosts outside the CSP are never requested
(pass) feed text is rendered as text, never as HTML
(pass) buttons open links through ui/open-link
(pass) match_artists results show why each event matched
(pass) axe: no serious or critical violations (one card and fifty)
axe violations (all impacts): []
 10 pass
 0 fail
```

The first axe run failed:
`color-contrast, serious, 2 nodes: #ef2c46 on #151515 = 4.45 (expected 4.5:1)`.
The M3.2 contrast fix addressed it, and axe now reports **zero violations at
any impact level** (axe-core 4.11.4, already in the root `node_modules` via
`pa11y`).

Mutation runs (`src/ui/events.html` restored byte-identical):

```
--- mutant: event name via innerHTML
(fail) event cards view > feed text is rendered as text, never as HTML
--- mutant: image allow-list bypassed
(fail) event cards view > images from hosts outside the CSP are never requested
```

The innerHTML mutant run also failed the handshake test once. Three clean runs
afterwards each gave 10 pass and 0 fail. **Correction (PR #40):** that was not
noise. It was a real race in the view. It started its `ResizeObserver` before
the handshake, so on a host slower than one frame,
`ui/notifications/size-changed` arrived between `ui/initialize` and
`ui/notifications/initialized`. I made the stub host answer after 150 ms,
which made the failure deterministic (RED), then moved size reporting to after
`initialized`. GREEN: three runs, each 11 pass and 0 fail.

**Screenshots** (`evidence/m3-cards-360.png`, `evidence/m3-cards-1024.png`) were
taken with `EVIDENCE_DIR=… LIVE=1 bun run e2e`, from a live `search_events`
`this_weekend` result: Sat 31 Oct – Sun 1 Nov, "Showing 6 of 109 events". Real
agentathens.com images load. ØTTA's image is on another host, so it shows the
placeholder.

**Playwright and `bun audit`.** Playwright 1.55.0 is the version that matches
the cached Chromium 1187, and it carries a high advisory (GHSA-7mvr-c777-76hp:
browser downloads without certificate checks). Every fixed release expects a
newer Chromium, which would mean downloading browsers. The run therefore pins
**1.55.1** and launches the cached 1187 build with `executablePath`.
`bun audit` → `No vulnerabilities found`.

**Fixes from the directory screenshots** (commit `6d160bba9`, after M4.1
work):

- **Year-ambiguous ranges.** A run ending next July read "Tue, 1 Sept – Sat,
  31 Jul". Dates outside the current Athens year now show the year. The test
  came first: RED `Received: "…Tue, 1 Sept – Sat, 31 Jul…"`, then GREEN.
- **Cropped image text.** Feed images are landscape: 1200×630 share cards and
  1200×515 photos. The portrait thumbnail cut the share cards' text, so the
  image now sits on top of the card at 1200:630.

After both fixes: e2e 11 pass (13 with evidence mode), axe
`violations (all impacts): []`, unit 68 pass, bundle 47.58 KiB.

**Site bug seen in a screenshot, not fixed here.** The site-generated tile image
for "ΕΛΕΩΝΟΡΑ ΖΟΥΓΑΝΕΛΗ "ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ"" shows a double-escaped
`&amp;quot;` in its text. This is pipeline work (`src/generators/event-tile.ts`).

### M2 and M3 gates

Root gate on `8d6038259` (end of M2): `typecheck exit 0`; `5379 pass, 212
skip, 1 fail` — the same baseline deadman-watchdog test.

`mcp/` gate on an export of `75b930d53` (end of M3):

```
$ bun test test/        → 68 pass, 0 fail (7 files)
$ tsc --noEmit -p .     → typecheck exit 0
$ wrangler --dry-run    → Total Upload: 47.38 KiB / gzip: 15.74 KiB (the HTML ships as a Text module)
$ bun run e2e           → 10 pass, 0 fail
$ bun audit             → No vulnerabilities found
```

## M4: Ready for the directories

### M4.1 Directory kit — done (see the precondition)

`specs/002-mcp-server/directory-kit.md` contains:

- name and endpoint;
- short and long descriptions in English and Greek;
- the tool table, generated from `TOOLS` rather than typed;
- the MCP Apps resource and its CSP;
- the data-source and privacy statement;
- a support-contact placeholder;
- the icon and directory requirements (from research, §5–§6);
- five example prompts with real output.

The example prompts are in `mcp/scripts/examples.ts`, so they can be run again;
the output from 2026-10-28 is in `evidence/m4.1-examples.txt`. All five
returned results (`examples: OK`, exit 0): 11, 6, 86 and 5 events, and 1
`title_mention` match.

**Precondition the kit puts first: do not submit on a stale feed.** Running
the examples exposed the M1.6 defect (fixed). They also exposed data-quality
problems that a reviewer would see. These are in the pipeline, not the server:

- the 22-day-old feed;
- the WATER exhibition as one row per day;
- a DJ night typed as theatre.

The kit marks each one next to the example where it appears.

**Directory requirements (kit §6).** A research subagent read the primary
pages. I then fetched the two that matter most myself:
`claude.com/docs/connectors/building/submission` and OpenAI's
`plugins/plugin-guidelines.md`. Findings that need the owner:

- **Ticket links conflict with ChatGPT's listing policy.** It says plugins may
  not "Link directly to a checkout or other transactional page". `ticket_url`
  and the Tickets button point at seller pages. This is a policy decision, and
  the code is unchanged; the options are in kit §6.
- **OpenAI's route is now "plugins"** at platform.openai.com/plugins. It needs
  a terms-of-service URL, a domain-verification token served at
  `/.well-known/openai-apps-challenge` (not built yet, because the token is
  issued at submission), 5 positive and 3 negative test cases, and a video.
- **Anthropic wants 3–5 carousel PNGs**, at least 1000 px wide.
  `EVIDENCE_DIR=… LIVE=1 bun run e2e` now writes `directory-1.png` to
  `directory-5.png` at 1200 px, one per example prompt. They must be retaken
  after the feed is fresh.
- **Icon.** No 512 px square icon exists. The site's `favicon.svg` draws its
  letter as `<text>`. Kit §5 has the export recommendation and the contrast
  check.

### M4.2 Privacy page draft — done

`specs/002-mcp-server/privacy-page-draft.md`, in English with a Greek summary.
It is not published. Each claim was checked against the code:

- `git grep` finds no `console.*` in the request path. The only one is the dev
  server's startup line.
- There is no KV, D1, Cache, cookie or storage use.
- `wrangler.toml` turns on no observability.

The Cloudflare logging paragraph is a placeholder that the owner fills in from
the deployed settings.

### M4.3 Draft issues — done

- `issues/001-ci-for-mcp.md`: adds a pinned, read-only `mcp` CI job (tests,
  typecheck, dry-run bundle, audit), with notes on adding the browser test.
- `issues/002-advertise-mcp-endpoint.md`: adds `llms.txt` and homepage lines,
  in English and Greek, with the generator location. Precondition: the endpoint
  is deployed and the feed is fresh.

Neither change was applied.

## Independent review (§7.4)

A fresh general-purpose subagent, given none of this session's context,
reviewed `git diff 3c8130d5b..876ef0623` against §2, §4 and
`.github/path-guard.json`. It was told to refute each finding before reporting
it, and to back every finding with evidence. It changed no files.

**Verdict: no blockers. 4 should-fix and 9 nits.**

It confirmed as compliant:

- **Protected paths:** 0 of 56 changed files match.
- **Scope:** every file is under `mcp/`, `specs/002-mcp-server/` or `docs/`.
- **Dependencies:** the root `package.json` and `bun.lock` are unchanged. The
  Worker bundle has 8 modules and none comes from `node_modules`.
- **Wikidata data:** it re-ran the SPARQL query for all 34 QIDs, with 0
  mismatches.
- **No storage, logging or tracking** in the code.
- **Tools and links:** all tools are read-only, and every event links to
  agentathens.com.
- **Limits** are unchanged from M0 (the body cap is stricter).
- **Tests:** no test was weakened. Fixtures are labelled. The kit's example
  output matches the evidence file.

| # | Finding | Resolution |
|---|---|---|
| 1 | should-fix: a `null` or `[null]` body crashes the handler; `[1]` and `"x"` get 202 (from M0) | **Fixed.** Tests first (4 RED), then `handleRpc` answers `-32600 Invalid Request` for anything that is not an object |
| 2 | should-fix: `date_from: "2026-99-99"` is reported as "feed unavailable, try again" | **Fixed.** Test first (RED: `Received: "Agent Athens feed unavailable…(Invalid Date)"`). `isDay()` requires a real calendar day; the error is now "Invalid arguments: … must be a real date as YYYY-MM-DD" |
| 3 | should-fix: unguarded `res.json()` in `fetch-spotify-ids.ts`, `examples.ts` and `smoke.ts`; smoke could go over 200 artists | **Fixed.** Each now fails with what failed and what to try next. Smoke caps the artist list at 200. `make-fixture.ts` (M0, dev-only) is left as it is |
| 4 | should-fix, uncertain: M1.6 bundles `config/lifecycle-presumption.json`. Is that against §2.3, "the feed is the only data source"? | **Owner decision, recorded.** It is a rule, not event data, and no output field is invented (`end` stays absent). But it does change which feed events are returned. Drift: editing `config/` does not redeploy the Worker, so **redeploy the Worker after any change to `lifecycle-presumption.json`**. If the owner reads §2.3 strictly, revert `3dca96edc`. The stale-feed problem then comes back until the feed is fresh |
| 5 | nit: `toRecord()` would answer `with-ticket` or venue `''` if the feed omitted those fields | **Guarded.** The feed contract now counts a non-boolean `isAccessibleForFree` or an empty `location.name` as a violation. Live: 0 |
| 6 | nit: the "no tracking parameters" claim is not enforced | **Guarded.** The feed contract counts `utm_*`, `gclid`, `fbclid`, `mc_eid` or `_ga` in `url` or `ticket_url` as a violation. Live: 0 |
| 7 | nit: commit hygiene (M3.1–M3.2 in one commit; `6d160bba9` also adds M4.1 evidence; "M1.6" is not a spec id) | Acknowledged; each commit message says why |
| 8 | nit, uncertain: `postMessage(msg, "*")` | Kept. Hosts serve the view from a sandbox origin the view cannot know in advance. Incoming messages are checked by `ev.source === window.parent`. Outgoing messages carry only public URLs and sizes |
| 9 | nit: the README tool table predates `spotify_id`; ledger entries missing | **Fixed** (README); ledger written in the hand-back commit |
| 10 | nit: untracked probe files | **Owner:** delete `mcp/src/probe-worker.ts` and `mcp/src/ui/probe.html`. This session's permissions refused `rm` and `mv` |
| 11 | nit: `deploy` script is `bunx wrangler@4` (from M0) | **Owner:** consider `wrangler deploy` (the pinned 4.149.0) |
| 12 | nit: a cold isolate can start up to 40 feed fetches for one 20-message batch | Open item: memoise the in-flight fetch per language. The Cloudflare rate-limit rule also bounds it |
| 13 | nit: `axe-core` comes from the root's `pa11y`, not from `mcp/package.json` | Documented in M3.3; acceptable for a dev-only test |

### Final gate, after the review fixes, on `91f367dcc`

`mcp/`, on an export of the commit:

```
$ bun test test/        → 75 pass, 0 fail (7 files)
$ tsc --noEmit -p .     → typecheck exit 0
$ wrangler --dry-run    → Total Upload: 47.87 KiB / gzip: 15.90 KiB
$ bun run e2e           → 11 pass, 0 fail; axe violations (all impacts): []
$ bun audit             → No vulnerabilities found
```

Root:

```
$ bun run typecheck → typecheck exit 0
$ bun run test
 5379 pass
 212 skip
 1 fail
Ran 5592 tests across 299 files. [493.38s]
(fail) deadman-watchdog.ts — the database is read through the untrusted-DB reader > a normal database → the same signals as a direct read (enrich age, row count), no refusal
```

The failing set is a subset of the baseline after every milestone: M1, M2, M3
and final.

## Hosting change: a separate Netlify site (owner decision, 2026-10-28)

**Why.** agentathens.com's DNS is on Netlify (`dig NS` gives
`dns1–4.p09.nsone.net`). A Cloudflare Worker can only take
`mcp.agentathens.com` if the whole domain's DNS moves to Cloudflare. The
owner amended spec §2.2 to "a separate Netlify site, never a function on the
main site". The main site's static-only guarantee and its protected
`netlify.toml` / `netlify/**` are untouched.

**Netlify's documentation, read 2026-10-28:**

| Fact | Page |
|---|---|
| Modern functions: `export default async (req: Request, context) => Response`, plus `export const config` with `path` (a string or an array) | `docs.netlify.com/build/functions/get-started/`, `/optional-configuration/` |
| Rate limiting "in all plans", in the function's `config.rateLimit` (`windowLimit`, `windowSize` "Maximum is 180" seconds, `aggregateBy: ["ip", "domain"]`); answers 429; "cannot be defined in the `netlify.toml`" | `docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/` |
| Synchronous limit 60 s; memory 1024 MB; buffered payload 6 MB; functions directory defaults to `<base directory>/netlify/functions` | `docs.netlify.com/build/functions/configuration/` |
| Runtime: Node.js, by default the build's version, with a fallback of Node 24 | `/optional-configuration/` |
| Bundling of `.html` text imports | not documented, so not relied on |

**What changed:**

- `mcp/netlify/functions/mcp.mts`: the function's default export calls
  `handleHttp`. Its `config` sets `path: ["/", "/mcp"]` and a rate limit of
  300 requests per 60 s per IP.
- `mcp/netlify.toml`: publish directory `public` (sources are not
  published) and `node_bundler = "esbuild"`.
- The view is now the generated module `src/ui/events-html.ts`
  (`bun run build:ui`), imported by both hosts. This removes the text-import
  dependence and the `HTMLBundle` type cast.
- The Cloudflare Worker entry stays as an alternative host.

**Tests, written first:**

- `test/ui-module.test.ts`: RED `Cannot find module '../src/ui/events-html'`.
  Mutant: editing the HTML without regenerating → `0 pass 1 fail`.
- `test/netlify.test.ts`: RED `Cannot find module '../netlify/functions/mcp.mts'`.
  Mutants: a 200 s window → `4 pass 1 fail`; only `/mcp` routed →
  `4 pass 1 fail`.

**Bundle check.** `bun run bundle-check:netlify` bundles the function with
esbuild (Node, ESM), as Netlify's bundler does, then loads the bundle and
makes one MCP call through it:

```
bundled 8 modules into …/.netlify-check/mcp.mjs (46.92 KiB):
  src/normalize.ts
  ../config/lifecycle-presumption.json
  src/feed.ts
  src/tools.ts
  data/performer-ids.json
  src/ui/events-html.ts
  src/mcp.ts
  netlify/functions/mcp.mts
bundle-check:netlify: OK — the bundle answers resources/read (14710 characters of HTML) and exports its config
```

**Not verified until the first deploy:**

- whether Netlify's own build accepts the function: the spec forbids me to run
  `netlify` commands, so the deploy log is the proof;
- whether Netlify bundles `../config/lifecycle-presumption.json`, which sits
  outside the base directory (local esbuild does);
- whether the function runs under Node. It uses only web APIs, but I didn't
  execute it under Node here, because repo scripts run on Bun.

**The rate-limit number is a guess.** 300 requests per minute per IP is
deliberately generous. Assistants call connectors from their own servers, so
one IP carries many users. Tune it from real traffic.

## Blockers and owner actions

**No stop condition fired.** No protected-path change was needed, no check
failed three times, the feed was reachable, and the MCP Apps stable spec
agrees with this document. Finding 4 (bundled config versus §2.3) is the one
place a reviewer read a §2 commitment differently; it is left to the owner.

**Before submitting to the directories:**

1. **Get the feed fresh again.** `/api/events.json` was last written on
   2026-10-06; see the input-pipeline audit.
2. **Deploy as a separate Netlify site** (base directory `mcp`), then add the
   domain `mcp.agentathens.com`. See `mcp/README.md` § Deploy (Netlify). The
   rate limit ships in the function. *(Updated after the hosting change; this
   step originally said Cloudflare.)*
3. **Publish the privacy page** from `privacy-page-draft.md`, after filling in
   the Cloudflare logging paragraph.
4. **Make a 512×512 icon**, with the letter as a path (kit §5).
5. **Decide on ChatGPT's checkout-link rule** versus the Tickets button
   (kit §6).
6. **Retake the carousel screenshots** after step 1:
   `cd mcp && EVIDENCE_DIR=../specs/002-mcp-server/evidence LIVE=1 bun run e2e`.

**Other decisions and housekeeping:**

- **§2.3 reading:** is the bundled `config/lifecycle-presumption.json`
  acceptable? If yes, redeploy the Worker after any change to it.
- **Draft issues:** open `issues/001-ci-for-mcp.md` and
  `issues/002-advertise-mcp-endpoint.md`, or drop them.
- **Untracked probe files:** delete `mcp/src/probe-worker.ts` and
  `mcp/src/ui/probe.html`.
- **Session numbering:** the M0 patch's session-log entry is "Session 233",
  which collides with the main checkout's local S233–S235. This session is
  logged as 236.

**Pipeline items seen through the server.** They are outside spec 002 and not
fixed here:

- performer coverage: 2 of 569 events;
- one row per day for a running exhibition (WATER);
- DJ nights typed as theatre;
- duplicate listings (AUTECHRE);
- the generated tile's double-escaped `&amp;quot;`;
- 86% of events have no neighborhood.

## Summary

| Milestone | Status | Key evidence |
|---|---|---|
| M1 Ready to ship | done (+M1.6) | live smoke and contract OK; SDK test and inspector OK; limits pinned with mutation runs |
| M2 Exact artist matching | done | 34 of 50 QIDs have a Spotify ID; four confidence levels tested; Spotify note in docs |
| M3 Event cards | done | stable spec strings recorded; e2e 11 pass; axe 0 violations; screenshots |
| M4 Directories | done; submission blocked by the stale feed | kit, privacy draft, two draft issues |
| §7.4 review | done | no blockers; should-fix items fixed or recorded |
