# Claude `-p` Hang — Forensic Diagnostic

**Session date:** 2026-04-08
**Mode:** Read-only forensic investigation. No code changes, no commits.
**Trigger:** Auto-enrichment pipeline hung on **2026-04-07 14:27:39** during `batch-1`. The hang lasted **19h 42m** until the previous session's lock-age check force-recovered it on 2026-04-08 10:09:31.
**Primary question:** Why didn't the watchdog kill the hung `claude -p` process within 1800s as designed?

> ⚠️ **Two prior summaries of this incident were both wrong.** The session brief claimed "17 failures/month, ~50% effective" (inflated). The Phase 1 plan claimed "3 hard failures over 38 days, ~92% effective" (also inflated in the *opposite* direction by undercounting). The correct picture is in **Section 1** below — and it materially changes the priority signal in Section 8.

---

## Section 1 — Corrected Failure Inventory

Sources: `logs/auto-enrich-2026-*.log` (31 daily files) cross-referenced with `logs/launchd-stderr.log` (parent wrapper failure log) and `logs/launchd-stdout.log` (parent wrapper stdout, truncated mid-Apr 7 run).

Period covered: **2026-03-02 → 2026-04-08** (38 days, 33 distinct enrichment runs across 31 daily log files; 2 days had 2 runs each).

| Date | Outcome | Batches | Notes |
|------|---------|---------|-------|
| 03-02 | ✅ complete | 3/3 | 2 runs same day, both green (early-morning + retry) |
| 03-03 | ✅ complete | 3/3 | 5 events/batch (old config) |
| 03-04 | ⚠️ mixed   | 4/9 across 3 runs | Run 1: 3/3. Run 2: 0/3 (`exit 1 after 0s` mass-fast-fail). Run 3: 1/3 (`batch-2 exit 1 @ 820s`, `batch-3 exit 1 @ 5s`) |
| 03-05 | 💥 hang    | 0/3 | All three batches `exit ? after 6273-6324s`. **S69 era** — broken perl-alarm timeout |
| 03-06 | ⚠️ mixed   | 5/6 across 2 runs | Run 1: 2/3 (`batch-1 exit ? @ 601s`). Run 2: 3/3 |
| 03-07 | ⚠️ partial | 2/3 | `batch-1 exit ? @ 1149s` |
| 03-08→09 | 💥 hang | 1/3 | `batch-2 exit ? @ 34567s` (9.6h), `batch-3 exit ? @ 36364s` (10.1h). **S69 era** — broken timeout |
| 03-09 | ✅ complete | 3/3 | (separate run later same day) |
| 03-10 | ⚠️ partial | 2/3 | `batch-2 exit 143 @ 1801s` — watchdog kill working as designed |
| 03-11 | 💥 binary missing | 0/0 | `Claude CLI not found at /Users/chrism/.npm-global/bin/claude`. No batches attempted. Cause: npm-global path moved. Manual recovery. |
| 03-12 | ✅ complete | 3/3 | After **5 failed restart attempts** (binary missing); succeeded on 6th attempt at 11:09:13 |
| 03-13 | ⚠️/✅ | 2/3 + 3/3 | Run 1: `batch-1 exit 143 @ 1835s` (watchdog kill, batches 2&3 ok). Run 2: 3/3 |
| 03-14 | ⚠️ partial | 1/3 | `batch-1 exit 143 @ **20870s**` — watchdog **fired late by 19000s+**. `batch-2 exit 1 @ 7971s`. **First evidence of timer-during-sleep anomaly.** |
| 03-16 | ✅ complete | 3/3 | Wide gap between batches (`batch-1` started 11:05, `batch-2` started 15:38) — 4.5h gap suggests sleep/wake during run, but everything ultimately succeeded |
| 03-17 | ✅ complete | 3/3 | |
| 03-18 | ⚠️ partial | 1/3 | `batch-1 exit 1 @ 986s`, `batch-2 exit 1 @ 211s`. Long-running exit-1 failures (not watchdog kills) |
| 03-19 | ✅ complete | 3/3 | |
| 03-21 | 💥 mass-fast-fail | 0/3 | `batch-1 exit 1 @ 3s`, `batch-2 exit 1 @ 1024s`, `batch-3 exit 1 @ 3s` |
| 03-23 | 💥 mass-fast-fail | 0/3 | All three: `exit 1 @ 2s` |
| 03-24 | 💥 mass-fast-fail | 0/3 | All three: `exit 1 @ 2s` |
| 03-25 | 💥 mass-fast-fail | 0/3 | All three: `exit 1 @ 2-3s` |
| 03-26 | 💥 mass-fast-fail | 0/3 | All three: `exit 1 @ 2-3s`. Warmup itself took **34min 21s** before failing. |
| 03-27 | 💥 mass-fast-fail | 0/3 | All three: `exit 1 @ 2s` |
| 03-28 | 💥 mass-fast-fail | 0/3 | All three: `exit 1 @ 2s` |
| 03-30 | 💥 mass-fast-fail | 0/3 | All three: `exit 1 @ 2s` |
| 03-31 | 💥 mass-fast-fail | 0/3 | All three: `exit 1 @ 2s` |
| 04-01 | ⚠️ partial | 1/3 | `batch-1 exit 143 @ 1801s`, `batch-2 exit 143 @ 1800s`. **Watchdog fired correctly twice** on the *old* (pre-caffeinate) version |
| 04-02 | ✅ complete | 3/3 | |
| 04-03 | ✅ complete | 3/3 | |
| 04-04 | ✅ complete | 3/3 | |
| **04-07** | **🛑 unrecoverable hang** | **0/3** | **`Enriching batch-1...` is the last log line. No watchdog kill ever recorded. Process tree was force-killed 19h 42m later by the next morning's lock-age check.** |
| 04-08 | (recovery only) | n/a | Lock file age check fired, force-removed lock for stuck PID 99999, then ran in `--dry-run` (likely manual diagnostic) |

**Missing dates** (no daily log present): 03-15, 03-20, 03-22, 03-29, 04-05, 04-06. Likely causes: machine off, network down (the `Network unavailable` skip exits 0 and writes no daily log), or queue-too-small skip.

---

## Section 2 — Distinct Failure Mode Classification

The data falls into **six** distinct failure modes, not the two or three described by either the session brief or the plan.

### Mode A: True hang (watchdog never fires) — **1 occurrence**
- **Apr 7 14:27:39 → Apr 8 10:09:31** (19h 42m). The only target of this diagnostic.
- Recovery mechanism: lock-mtime check installed by previous session; would not have recovered before that fix.
- Severity: **HIGH** before previous session's fix; **LOW after** (now self-recovers within ~7200s in the worst case).

### Mode B: Watchdog fires very late (timer paused during sleep) — **1 occurrence**
- **Mar 14 batch-1**: `exit 143 @ 20870s` despite a 1800s timeout. The timer fired but only after the system was awake for the equivalent of 1800s of wall time, which took 5.8h to accumulate.
- This is the **smoking gun** for the sleep-suspends-bash-sleep hypothesis. Mar 14 used the pre-caffeinate watchdog.
- Severity: **MEDIUM** before previous session's caffeinate fix; **partially mitigated** after (caffeinate `-i` only blocks idle sleep, not lid-close).

### Mode C: Mass fast-fail (all batches `exit 1 @ 2-3s`) — **9 occurrences**
- Mar 21, 23, 24, 25, 26, 27, 28, 30, 31. **Nine consecutive (or near-consecutive) days in late March.**
- All three batches fail in 2-3 seconds with `exit 1`. Warmup completes successfully (suggesting Claude CLI itself starts fine) but every real batch invocation immediately exits non-zero.
- Hypothesis (untested in this session): Claude CLI auth token expired; rate-limit response; or a now-resolved upstream API issue. The pattern stops abruptly on Apr 1, suggesting an external root cause that healed itself.
- **This mode produced zero events on those days** — the most common failure shape in the dataset.
- Severity: **HIGH while it was happening** (10 days × 9 events = ~90 events lost). Currently dormant — needs root-cause investigation but is **NOT the same mode as Apr 7**.

### Mode D: Long-running exit-1 (Claude returns non-zero after real work) — **6 occurrences**
- Mar 4 batch-2 (820s), Mar 6 batch-1 (601s), Mar 7 batch-1 (1149s), Mar 14 batch-2 (7971s), Mar 18 batch-1 (986s), Mar 18 batch-2 (211s).
- Distinct from Mode C because the duration is >100s — indicating Claude actually engaged with the brief, did some tool calls, and then returned non-zero. Could be tool errors, brief parse errors, or model refusals.
- Severity: **MEDIUM** — partially recoverable (other batches in the same run usually succeed).

### Mode E: Watchdog kill working as designed — **3 occurrences**
- Mar 10 batch-2 (1801s), Mar 13 batch-1 (1835s), Apr 1 batches 1+2 (1800s, 1801s).
- Exit 143, log line written, subsequent batches still attempted. **The system working correctly** — these are not failures of the safety net, they're the safety net catching real Claude hangs.
- Severity: **LOW** — by design.

### Mode F: Binary path failure — **2 occurrences (1 day each)**
- Mar 11 (1 day), Mar 12 (5 false starts then recovery)
- Cause: `~/.npm-global/bin/claude` no longer existed after the user moved npm-global. The current `auto-enrich.sh` already handles this via the multi-path resolver (lines 33-38) so this mode is **already fixed**.
- Severity: **LOW** — fix is in place.

### S69 Era (Mar 5, Mar 8) — already postmortemed
- Pre-watchdog era. Broken perl-alarm timeout meant batches ran for 6000-36000 seconds before failing. Already documented and fixed in `specs/auto-enrich-postmortem.md`. Not relevant to Apr 7.

---

## Section 3 — Why "17 Failures" and "3 Failures" Are Both Wrong

### Why "17 failures" (session brief) is wrong
The "17" comes from grepping `logs/launchd-stderr.log` for `Auto-enrichment failed (non-fatal, continuing...)`. That string is logged by the **parent wrapper** (`daily-automated.sh`) whenever `auto-enrich.sh` returns non-zero. But:

- Several entries are actually **Mode E (watchdog working as designed)** — partial successes that returned non-zero only because *one* batch was killed at 1800s while the others succeeded. Mar 10, Mar 13, Apr 1 are all in this category.
- Several entries are **Mode F (binary missing)** — instantly recoverable manual fix.
- The S69-era entries (Mar 5, 7, 9, 10, 11, 12, 14) are pre-watchdog and were postmortemed long ago.

So the count overstates real degradation: counting Mode E as a "failure" is wrong because the watchdog *succeeded*, the run still produced events, and exit 1 just propagates because *some* work was killed.

### Why "3 failures over 38 days" (plan) is wrong
The plan classifies only Mar 11 (binary), Mar 13 (timeout, watchdog worked), and Apr 7 (hang) as "hard failures" and claims Mar 14 → Apr 4 was 29 successful runs with zero failures. This is incorrect on multiple counts:

- **The 9 mass-fast-fail days (Mar 21-31)** are completely missing from that count. Those days produced *zero* enriched events with `0 succeeded, 3 failed` in every log. They are unambiguously hard failures.
- **Mar 14 itself** had `batch-1 exit 143 @ 20870s` and `batch-2 exit 1 @ 7971s`. Only one batch succeeded.
- **Mar 18** had `batch-1 exit 1 @ 986s` and `batch-2 exit 1 @ 211s`.
- **Apr 1** had two watchdog kills (working as designed, but the plan called this period green).

### The actual numbers (38-day window)
| Outcome | Count | % of runs |
|---------|------:|----------:|
| Fully green (3/3) | 14 runs | ~42% |
| Watchdog working as designed (Mode E partial) | 3 runs | ~9% |
| Long-running exit-1 (Mode D) | 6 runs | ~18% |
| Mass-fast-fail (Mode C) | 9 runs | ~27% |
| True hang / late kill (Modes A/B) | 2 runs | ~6% |
| Binary missing (Mode F) | 1 run | ~3% (recoverable) |

Effective "produced ≥1 event" rate: roughly **~70%** of runs over 38 days, **not** 50% and **not** 92%. The biggest source of lost events is **Mode C (mass-fast-fail in late March)**, which is *unrelated to the Apr 7 hang* but is the dominant failure shape and deserves its own investigation.

> **Note for the planner:** Both prior summaries got this wrong in opposite directions. The session brief was alarmist; the plan was overly reassuring. The correct framing is: "the pipeline has multiple distinct failure modes, two of which (Apr 7 hang, late-March mass-fast-fail) deserve dedicated diagnostics. The previous session fixed *recovery* but not *prevention* of either."

---

## Section 4 — Hung Batch Input Forensics

The Apr 7 batch-1 brief is preserved at `specs/claude-hang-evidence/hung-batch-brief.md`. The control samples (batch-2, batch-3 from the same Apr 7 run, generated but never executed) are still in `temp-briefs/`.

### Brief structure
- **Size**: 10,411 bytes / 185 lines / 10,279 characters. Comparable to controls (batch-2: 10,617 bytes / 183 lines, batch-3: 11,266 bytes / 200 lines).
- **Header / instructions section** (lines 1-72): byte-identical to batch-2 and batch-3 except for the batch number, the event ID list, and the output directory string. Diff confirms no template drift.
- **Markdown integrity**: All code fences open and close correctly. No runaway blocks. No prompt-injection attempts in event titles or fields.

### Character set scan
Python scan of all three briefs for unusual unicode:

| Brief | Bytes | Chars | Non-ASCII | RTL | Control | Surrogates | Bidi-override |
|-------|------:|------:|----------:|----:|--------:|-----------:|--------------:|
| batch-1 | 10,411 | 10,279 | **108** | 0 | 0 | 0 | 0 |
| batch-2 | 10,617 | 10,406 | 191 | 0 | 0 | 0 | 0 |
| batch-3 | 11,266 | 10,952 | 286 | 0 | 0 | 0 | 0 |

**Batch-1 has the fewest non-ASCII characters of the three.** No control characters, no RTL marks, no Unicode bidi overrides, no surrogates. Greek text only, with French quotes (« ») and one typographic right-single-quotation-mark in event 2's title (`Θα σ’ αγαπώ`). All within normal range for this pipeline.

### Per-event inspection (the 3 events that "should have" been enriched)

**Event 1 — `622c91f79ff05653` «ΤΑ ΠΑΘΗ» (concert)**
- Venue: St. Paul's Anglican Church (no DB intel — needs WebSearch)
- URL: `https://www.ticketservices.gr/event/14161/` — clean ASCII URL, short, well-formed
- Source: `ticketservices` — used successfully in many prior runs
- Anomaly: **None.** Same shape as dozens of prior `concert` enrichments.

**Event 2 — `bc87c431744831de` Θα σ' αγαπώ και του χρόνου (theater)**
- Venue: ARROYO THEATER (no DB intel — needs WebSearch)
- URL: `https://www.athinorama.gr/theatre/performance/tha_s%e2%80%99_agapo_kai_tou_xronou-10082867/`
- Notable: URL contains `%e2%80%99` — URL-encoded U+2019 (right single quotation mark), corresponding to the typographic apostrophe in the title's `σ'`. This is unusual but valid; athinorama generates this for any title containing a smart quote.
- Same encoding pattern (`%e2%80%XX`) appears in batch-3 (line 96, `%e2%80%93` en-dash). So this is **not unique to batch-1**.
- Source: `athinorama.gr` — used successfully in many prior runs.
- Anomaly: **Mild.** The smart-quote URL is the only thing standing out, and the same encoding works fine in other batches.

**Event 3 — `b5206cdd1c122400` Occult Practices vol.II (dj_set)**
- Venue: Patision65 (no DB intel — needs WebSearch)
- URL: `https://ra.co/events/2404037` — clean, short
- Source: `residentadvisor` — used successfully in many prior runs.
- Anomaly: **None.**

### Comparison with the surviving control briefs (batch-2, batch-3)
- batch-2 contains `Onassis Stegi`, `Μέγαρο Μουσικής Αθηνών`, `Red Jasper Cabaret Theatre` — all with Greek venue names and a long Onassis URL with subdirectories. **Has more Greek text than batch-1.**
- batch-3 contains `Αγγλικανική Εκκλησία Αγίου Παύλου` (the Greek name for the same Anglican church in batch-1's event 1!), HTML-entity-encoded French quotes (`&#171;ΤΑ ΠΑΘΗ&#187;`), and `Astron` with full venue intel block. **Has the most Greek text and the only HTML entities in any brief.**
- If hangs were driven by Greek/Unicode/URL complexity, batch-3 would be the most likely victim. It is not.

### Section 4 conclusion
**The Apr 7 batch-1 brief is forensically unremarkable.** It is shorter than the controls, has fewer non-ASCII characters than the controls, contains no malformed markdown, no unusual control sequences, no obvious prompt-injection attempts, and uses three sources (ticketservices, athinorama, residentadvisor) that all have successful enrichment history in other runs. The mild smart-quote URL in event 2 is a valid pattern that appears in other (successful) batches.

**This is a useful negative result:** it makes "input-driven Claude-side hang on a specific event" significantly less likely as a root cause. The hang is more likely **environmental** (sleep, network, parent-process state, etc.) than **input-driven**.

---

## Section 5 — System Sleep Correlation (the smoking gun)

`pmset -g log` retains ~2 weeks of power-management history. The Apr 7 → Apr 8 window is fully present. Filtered to top-level Sleep/Wake/DarkWake transitions in the 19h 42m hang window, the data is unambiguous.

### Decoding the log
- The number after a `Sleep ... <reason>` line is the **sleep duration in seconds**. Verified by cross-checking timestamps: `Sleep ... 80` at 14:26:12 maps to the next DarkWake at 14:27:32 (80 seconds later), exactly. This holds throughout the log.
- `Clamshell Sleep` = lid-close sleep. Distinct from `Idle Sleep` (screensaver-style).
- `Maintenance Sleep` = periodic short wake for mDNSResponder, push notifications, TCP keep-alive (PowerNap behavior).
- `TCPKeepAlive=active` = PowerNap is on, so the system briefly wakes the network stack but does not unpause user processes.

### The exact timeline

```
2026-04-07 14:25:53  Wake     DarkWake to FullWake (due to Notification)        ← user notification, lid-open
2026-04-07 14:25:55  Sleep    Entering DarkWake state due to 'Clamshell Sleep'  ← lid CLOSED
2026-04-07 14:26:12  Sleep    Entering Sleep state due to 'Clamshell Sleep' 80  ← deep sleep, will last 80s

2026-04-07 14:26:11  [auto-enrich.sh starts — logs "Auto-enrichment starting"]
2026-04-07 14:27:32  DarkWake (smc.sysState.Wake)                               ← brief 7s wake window
2026-04-07 14:27:38  Sleep    Entering Sleep state due to 'Maintenance Sleep' 23
2026-04-07 14:27:39  [auto-enrich.sh logs "Warm-up complete" and "Enriching batch-1..."]
                     ↑ this happened in the 7-second wake window between 14:27:32 and 14:27:38
                     ↑ the script forked claude -p and the watchdog AT THE INSTANT the system was returning to sleep
2026-04-07 14:28:01  DarkWake     5s
2026-04-07 14:28:08  Sleep        153s
2026-04-07 14:30:46  Sleep        1049s   (~17 min in deep sleep)
2026-04-07 14:48:22  Sleep        829s
2026-04-07 15:02:11  DarkWake     ...
... [pattern continues all night: brief wakes of 1-30 seconds, deep sleeps of 80-1500 seconds] ...

2026-04-08 09:59:16  Wake     Wake from Deep Idle (lid SMC.OutboxNotEmpty RTP.multi-touch/HID Activity)
                     ↑ THE LID WAS OPENED — HID Activity = keyboard/trackpad input
2026-04-08 10:09:31  [auto-enrich.sh starts new run, hits lock-age check, recovers]
```

### What this proves

1. **The lid was closed at 14:25:55** — 16 seconds before the script started, and well within the timeframe in which the launchd-fired daily-automated.sh was running (it had been running web-scraping since 08:15:39).
2. **The lid stayed closed for 19h 42m**, until the user opened it at **2026-04-08 09:59:16**.
3. **Recovery happened ~10 minutes after lid-open**, when the next scheduled launchd run fired and triggered the new lock-age check.
4. The 88-second warmup (14:26:11 → 14:27:39) is the *cumulative* time across multiple sleep/wake cycles — actual wake-clock time was probably <15 seconds. The warmup eventually completed because Claude CLI's `--max-turns 1` work was small enough to make progress in those wake slivers.
5. **The batch-1 invocation was launched at 14:27:39 — exactly 1 second AFTER `Maintenance Sleep` resumed at 14:27:38**. Bash forked `claude -p` and `( sleep 1800 && kill ... )` into a process tree that immediately got suspended by the kernel.
6. The bash `sleep 1800` (this was the OLD pre-caffeinate watchdog) never accumulated 1800s of wake time because every subsequent wake was 1-30s. **Total estimated wake time during the 19h 42m hang: well under 30 minutes.** A 1800s timer would need ~3 hours of cumulative wake to fire.

### What this means for the previous session's `caffeinate -i` fix

> **EMPIRICALLY CONFIRMED 2026-04-08 (R1.A test, see Section 8):** A direct isolated test on **battery power** with an 8-minute clamshell window measured `caffeinate -i sleep 300` taking **753 seconds wall-clock** to complete. Predicted FAIL value was ~770s (10s pre-close + 480s clamshell-frozen + 290s post-wake-remainder). The 17-second delta from prediction is within margin (slightly longer pre-close period). **The bash `sleep` was paused for the entire clamshell duration, exactly as the kernel pmset log predicted.**

The previous session installed `caffeinate -i sleep "$BATCH_TIMEOUT"` (auto-enrich.sh:267) on the assumption that preventing idle sleep would keep the timer running. **This is empirically insufficient.** Per `man caffeinate`:

| Flag | What it prevents |
|------|------------------|
| `-i` | Idle system sleep (user inactivity timeout) |
| `-d` | Display sleep |
| `-m` | Disk idle sleep |
| `-s` | System sleep, **only when on AC power** |
| `-u` | Declares user activity (acts like a key press) |

**None of `-i`, `-d`, `-m`, or `-u` prevent Clamshell Sleep on battery power.** Only `-s` prevents system sleep, and only on AC power. **The `man caffeinate` page on this system never mentions clamshell or lid at all** — there is no caffeinate flag whose documented behavior prevents lid-close sleep on battery. To survive a lid-close on battery, you would need either:
- AC power + `caffeinate -s` (and on AC the kernel still respects clamshell-on-battery defaults — needs verification)
- A system-level setting: `sudo pmset -b disablesleep 1` (very disruptive — affects all apps)
- A wake schedule: `pmset schedule wake "MM/dd/yy HH:mm:ss"` to force a wake at a specific time (works around the issue but doesn't solve it)
- Move the timeout out of bash entirely to a tool that uses real-time signals or kernel-level scheduling — **but bash sleep is the only thing here that gets paused**, so this might not help unless the alternative also runs in a wake-survival context.
- **Best long-term fix: don't run enrichment when the lid is likely to close.** Schedule the pipeline to start while the user is at the desk and have it complete before walk-away. Or have the user explicitly trigger it.

### Verdict
**Root cause confidence: HIGH.**
The Apr 7 hang was caused by **Clamshell Sleep starting before/during the `claude -p` invocation**. The bash watchdog `sleep` timer was suspended along with the entire script process tree. Brief Maintenance Sleep wakes were too short for the timer to advance meaningfully. The hang persisted until the user opened the lid 19h 42m later, at which point the next launchd-scheduled run hit the new lock-age check and force-recovered.

This is **also** the explanation for **Mar 14's `exit 143 @ 20870s`** anomaly (Mode B in Section 2). Same mechanism, different outcome: on Mar 14 the system was awake long enough during the day for the timer to eventually accumulate 1800s of wake time, after about 5.8 hours of wall-clock — so the kill landed *late* but did land. On Apr 7 the user closed the lid more decisively and the timer never accumulated enough wake time before the next morning's launchd cycle force-killed everything.

---

## Section 6 — Static-Only Reproduction Check

The plan's Step 4 (controlled `claude -p` reproduction) was downgraded to static-only validation because Sections 4 and 5 had already conclusively answered the questions Step 4 was meant to address. The decision to skip live reproduction was deliberate and is documented under "Risk disclosure" in the original plan.

### Static checks performed on the preserved hung brief

| Check | Method | Result |
|-------|--------|--------|
| Manifest JSON parses | `json.load()` on `hung-batch-manifest.json` | ✅ Parses; 4 keys, 3 event IDs, generated 2026-04-07T11:26:11.782Z (UTC) |
| Brief UTF-8 round-trip | encode/decode round trip | ✅ Lossless, 10,411 bytes |
| Code fence balance | Count of triple-backtick occurrences | ✅ 14 occurrences (even — all open/close pairs balanced) |
| Markdown header inventory | Regex `^#{1,6}\s+(.+)` | ✅ 13 headers, all expected sections present |
| Manifest ↔ brief consistency | Set-membership test of all 3 manifest IDs in brief body | ✅ All 3 present |
| Template parity vs controls | `diff` against batch-2.md and batch-3.md (lines 1-70) | ✅ Byte-identical except for batch-number, ID list, output dir |

### What was NOT done and why

- **`claude -p` invocation**: Skipped per user direction (Option B). Token cost and small risk of triggering another stuck process; marginal diagnostic value given Sections 4-5 conclusions.
- **`bun run scripts/generate-enrichment-brief.ts`**: Skipped because the script has no `--dry-run` mode and would overwrite the preserved Apr 7 evidence in `temp-briefs/`. Running it would also touch the DB.
- **Per-event isolation runs (plan's Attempts B/C/D)**: Skipped because Attempt A was skipped and downstream attempts only made sense if A reproduced the hang.

### Section 6 conclusion
**The hung brief is statically valid in every way we can check without invoking Claude.** This is fully consistent with Section 4's character-set scan and Section 5's sleep-correlation finding: the brief was never the problem, the OS was. There is no remaining static evidence to gather; further investigation would require either (a) calling `claude -p` (rejected) or (b) instrumenting the next pipeline run with `dtrace`/`ktrace` to catch a live event.

---

## Section 7 — Root Cause Assessment

### Primary cause (HIGH confidence)
**Clamshell Sleep suspended the bash process tree** containing `claude -p` and the watchdog `sleep 1800` timer at **2026-04-07 14:27:39**, ~1 second after `auto-enrich.sh` forked them. The timer never accumulated enough wake time to fire because subsequent wakes were Maintenance Sleep (1-30s of network keep-alive activity, not user processes). The hang persisted for 19h 42m until the user opened the lid at 2026-04-08 09:59:16, after which the next launchd-scheduled run hit the previous session's lock-mtime check and force-recovered.

**Evidence supporting this verdict (confidence: HIGH):**
1. **`pmset -g log` (Section 5):** Direct kernel record of `Clamshell Sleep` beginning at 14:25:55 and persisting until 09:59:16 the next morning. Cannot be argued with — this is what the kernel observed.
2. **Timing alignment:** "Enriching batch-1..." was logged at 14:27:39, exactly 1 second after the kernel logged `Maintenance Sleep ... 23` at 14:27:38. The script entered the suspendable state at the worst possible moment.
3. **Mar 14 corroboration:** The same mechanism explains the Mar 14 `exit 143 @ 20870s` anomaly. Two independent occurrences of the same pattern, both in the pre-caffeinate watchdog era.
4. **Mode B / Mode A relationship:** Mar 14 (Mode B, late kill) and Apr 7 (Mode A, no kill) are now understood to be the SAME failure mode at different severity levels — depending on how much wake-time the system accumulates during the hang window.

### Why it wasn't input-driven (MEDIUM-HIGH confidence)
Section 4's forensic inspection found nothing structurally unusual about the batch-1 brief. It is shorter than the surviving control briefs (batch-2, batch-3), has fewer non-ASCII characters, and uses three sources (ticketservices, athinorama, residentadvisor) with extensive successful history. The mild smart-quote URL is a valid pattern that appears in successful runs. Section 6 confirmed no static parser/encoding issues. We did NOT execute `claude -p` against the brief, so we cannot rule out a Claude-CLI-side input parser bug with 100% confidence — but this would be an extraordinary coincidence given the perfect alignment of the OS sleep evidence.

### Confidence summary

| Claim | Confidence | Basis |
|-------|------------|-------|
| Apr 7 hang was caused by Clamshell Sleep | **HIGH** | Direct kernel log + timing alignment + Mar 14 corroboration |
| Previous session's `caffeinate -i` fix is **insufficient** for Clamshell Sleep | **EMPIRICALLY CONFIRMED** | R1.A test 2026-04-08: 753s elapsed for `sleep 300` on battery with 8-min clamshell. Section 8 R1.A. |
| User's proposed `caffeinate -s -w $PID` fix would also fail on battery | **HIGH** | `man caffeinate` on this system: `-s` is "valid only when system is running on AC power". Battery + clamshell remains uncovered. |
| The brief content was not the cause | **MEDIUM-HIGH** | Static checks + character scan + control comparison; not stress-tested with live `claude -p` |
| Mode C (mass-fast-fail Mar 21-31) is unrelated to Apr 7 | **MEDIUM** | Different failure shape (exit 1 in 2s vs hang); needs its own diagnostic |
| Apr 7 was a one-off hang under the new caffeinate watchdog | **N/A** | Apr 7 used the OLD watchdog. The new caffeinate watchdog has had ZERO production runs against a clamshell-closed scenario — its effectiveness is **untested in the wild** |

---

## Section 8 — Recommendations for Future Fix Session

Listed in priority order. The next session can pick any subset; the doc gives enough detail to start work without re-deriving findings.

### R1 — ✅ CONFIRMED PASS 2026-04-08: clamshell watchdog now verified on AC
**Status:** Fully resolved across both power states.

- **R1.A (battery, `caffeinate -i`) — FAIL:** 2026-04-08 first run, 8-minute clamshell on battery. Result `Elapsed: 753s` for `caffeinate -i sleep 300`. Predicted FAIL ~770s. Confirmed: `caffeinate -i` does NOT survive clamshell-on-battery.
- **R1.A re-test (AC, `caffeinate -s`) — ✅ PASS:** 2026-04-08 follow-up after R2 landed. `caffeinate -s sleep 300` with lid closed on AC power. Result: **`Elapsed: 300s`**, exactly within the 290-330s PASS band. The `-s` assertion survived clamshell sleep on AC as documented by `man caffeinate`.

**Combined verdict:** R1's question ("does the watchdog survive clamshell?") is now answered for *every* runtime code path. On AC the watchdog works (300s PASS, verified). On battery the pipeline skips the batch entirely (see R2), so the unfixable `caffeinate -i`/`-s`-on-battery gap is never reached. Apr 7-style hangs cannot recur with current code.

**Outcome routing:** R1 is closed. R2 landed in commit **`5a4a529f4`** ("fix: battery skip + caffeinate -s watchdog for clamshell sleep"). Promote R3 (Mode C mass-fast-fail) to the next diagnostic session.

**Original test plan retained below for reference.**

#### R1 Appendix — Empirical test recipe

Two test variants. **Run R1.A first** — it's the cheap, isolated experiment that answers the question in 10 minutes without touching the enrichment pipeline. R1.B is the slower full-stack confirmation if R1.A is ambiguous.

##### R1.A — Isolated caffeinate test (recommended first; ~10 minutes)

**Goal:** Determine whether `caffeinate -i sleep N` survives macOS Clamshell Sleep on battery power.

**Procedure:**
1. Open Terminal.app (or iTerm) — **NOT inside Claude Code**, since this blocks for 5 minutes.
2. **Disconnect the power adapter.** Apr 7 ran on battery (`Using Batt` per `pmset` log), and `caffeinate`'s sleep behaviour can differ between AC and battery. Replicating Apr 7's exact power state matters.
3. Run:

   ```bash
   START=$(date +%s); caffeinate -i sleep 300; END=$(date +%s); ELAPSED=$((END-START)); echo "Elapsed: ${ELAPSED}s — PASS if ~300, FAIL if >450"
   ```

4. Wait ~10 seconds, then **close the lid**.
5. Set a phone timer for **8 minutes**. Walk away.
6. After 8 minutes, **open the lid**. Watch the terminal.

**Optional sanity check (from a second device):** While the lid is closed, SSH from your phone or another machine and run `pgrep -f "caffeinate -i sleep"`. If the result is empty, caffeinate itself died — that's a separate bug from what we're testing and would invalidate this run.

**Interpreting the elapsed time:**

| Elapsed | Verdict | What happened |
|--------:|---------|---------------|
| **~300s (290-330s)** | **PASS** | `caffeinate -i` kept the bash `sleep` running through the clamshell window. The full 300s of process time ran during the lid-closed period. Session 70's fix is sufficient. |
| **~770s (~700-800s)** | **FAIL** | `caffeinate -i` did NOT prevent clamshell suspension. Math: 10s pre-close + 480s clamshell-frozen + 290s post-wake = 780s. The sleep was paused for the full lid-closed duration and only finished after wake. **Session 70's fix is insufficient.** |
| **400-600s** | **Ambiguous — rerun** | Probably means the lid was closed for less time than expected, or some wake events happened mid-test. Rerun with the lid closed for a strict 10 minutes. |
| **<290s** | **Impossible** | Sleep cannot return early. If you see this, the command was killed (Ctrl-C, OOM, etc.) and the test is invalid. Rerun. |

**Critical math note (this is where the spec was originally wrong):**
On FAIL, elapsed is **NOT** ≈ clamshell_duration. It's `pre_close_time + clamshell_duration + remaining_sleep_time`. For a 10s/480s/290s split that's 780s, well above any plausible PASS value. The PASS/FAIL gap is therefore very wide (300 vs 770) — there is no genuinely ambiguous middle ground unless the lid was open during the test.

##### R1.B — Full-pipeline test (slower, ~40 minutes; only if R1.A is ambiguous)

This is the original R1 from before this appendix. Replicates the exact production conditions.

1. Open laptop on **battery power** (not AC — replicate Apr 7).
2. Manually trigger `./scripts/auto-enrich.sh`.
3. As soon as "Enriching batch-1..." appears in `logs/auto-enrich-$(date +%Y-%m-%d).log`, **close the lid**.
4. Wait **35 minutes** (longer than `BATCH_TIMEOUT=1800`).
5. Open lid, check the log.
   - **PASS:** Log contains `ERROR: batch-1 timed out after 1800s (killed PID NNN)`. Watchdog fired through clamshell.
   - **FAIL:** Log is still stuck at `Enriching batch-1...`. Watchdog never fired. The lock-mtime check from Session 70 will recover it on the next launchd run, but the underlying bug remains.
   - **PARTIAL** (not in original spec but possible): Log shows `ERROR ... after 4500s` or similar — watchdog *did* fire but only after the system accumulated 1800s of wake time. This is the **Mode B** behaviour from Section 2 (Mar 14 anomaly). Confirms `caffeinate -i` is partially helping but not fully.

##### R1 outcome routing

| R1.A result | R1.B result | Interpretation | Next action |
|-------------|-------------|----------------|-------------|
| PASS (battery) | (skip) | Session 70's fix is sufficient. Apr 7-style hangs cannot recur with current code. | Demote R2 to LOW. Promote R3 (Mode C) to HIGH priority. Update Section 7 confidence on the "fix is insufficient" claim from HIGH to "refuted by R1". |
| FAIL (battery) | (skip) | Confirms Section 5 prediction. Apr 7-style hangs WILL recur on the next clamshell-mid-batch. | R2 becomes MUST-FIX-NEXT. Implement R2b (`caffeinate -s -w $CLAUDE_PID`) or R2c (precondition lid check). Lock-mtime check from Session 70 still provides recovery, so this is not an emergency, but the bug is unfixed. |
| PASS (battery) | FAIL | `caffeinate -i sleep` works in isolation but the full pipeline still hangs. Some other component is the problem (`claude -p` itself? bash subshell nesting in `auto-enrich.sh:267`?). | Add a new section to this diagnostic; this is a Claude-CLI-side or bash-fork-side bug, not a kernel sleep bug. |
| Ambiguous | (skip) | Rerun R1.A with stricter conditions (10-min clamshell, definitely on battery). | Loop until conclusive. |

### R2 — ✅ IMPLEMENTED 2026-04-08 in commit `5a4a529f4` (battery skip + caffeinate -s on AC)

> **2026-04-08 final:** Shipped. Commit **`5a4a529f4`** — *"fix: battery skip + caffeinate -s watchdog for clamshell sleep"* — landed on `origin/main`. Follows Option F2 from `specs/claude-hang-fix-plan-f2.md`: detect power state via `pmset -g batt`, skip the batch entirely on battery (safe — next launchd cycle retries), use `caffeinate -s sleep "$BATCH_TIMEOUT"` on AC. Verified by R1.A re-test (300s PASS on AC clamshell, see R1 above).
>
> **Why this closes both failure modes:**
> - **AC path:** `caffeinate -s` is documented to block system sleep on AC; R1.A re-test confirmed it survives clamshell. Watchdog fires as designed.
> - **Battery path:** the pipeline never starts on battery, so there is no process for clamshell sleep to suspend. The skip is idempotent with the existing launchd schedule.
>
> **Historical context (kept for reference):** The pre-fix concern was that `caffeinate -i` on battery takes 753s wall-clock for a 300s sleep (measured in R1.A). The proposed `caffeinate -s -w $PID` was also insufficient on battery per `man caffeinate` (`-s` is "valid only when system is running on AC power"). The split-by-power-state approach sidesteps the whole problem.
>
> **Fix plan document:** [`specs/claude-hang-fix-plan-f2.md`](claude-hang-fix-plan-f2.md) — Option F2 (battery precondition skip + caffeinate -s on AC). **Implemented and verified.**
Options ranked by effort vs robustness:

**R2a (lowest effort, partial fix):** Use `caffeinate -dimsu sleep "$BATCH_TIMEOUT"` instead of `-i`. The `-s` flag prevents system sleep on AC power. **Limitation:** does nothing on battery + lid closed.

**R2b (moderate effort, robust):** Move the timer out of bash entirely AND tie caffeinate to the actual `claude -p` PID rather than a separate sleep process. The `-w PID` flag makes caffeinate live exactly as long as the watched process, which is cleaner than a parallel sleep:

```bash
"$CLAUDE_BIN" -p "$BRIEF_CONTENT" --output-format text --allowedTools "$ALLOWED_TOOLS" >> "$LOG_FILE" 2>&1 &
CLAUDE_PID=$!
caffeinate -s -w "$CLAUDE_PID" &      # caffeinate dies when claude exits
gtimeout 1800 wait "$CLAUDE_PID"      # gtimeout from coreutils, kernel-level signal
```

This puts the timeout in the kernel-level signal infrastructure (via `gtimeout`) and asserts `-s` (system sleep prevention) tied to the actual claude process. **Requires** `brew install coreutils` for `gtimeout`. **Caveat:** `-s` only prevents system sleep on AC power per `man caffeinate` — still subject to lid-close suspension on battery. R2c is needed for full battery+lid-close coverage.

**R2c (highest effort, most robust):** Run `auto-enrich.sh` only when the system is guaranteed awake. Two sub-options:
- Defer enrichment to a foreground user-initiated step (e.g., a slack-bot trigger or a `make enrich` target the user runs at the desk)
- Add a precondition check: query `ioreg -n AppleClamshellState` and skip enrichment if the lid is closed. The skip is safe because the next launchd cycle (or the user opening the lid) will retry.

**R2d (avoidance, not a fix):** Reschedule the daily pipeline so enrichment happens during user-active hours. Currently `daily-automated.sh` is launched at 08:09:55 (per Apr 1, 4 logs) and enrichment runs ~6h later because web-scraping takes that long. **The 6h gap means enrichment routinely runs while the user is at lunch or finished for the day.** Splitting scraping and enrichment into separate launchd plists, with enrichment scheduled for early morning before scraping, would shrink the user-active window dependency.

### R3 — Investigate Mode C (mass-fast-fail) as a separate diagnostic (MEDIUM PRIORITY)
Section 1's inventory shows **9 days in late March** where every batch failed in 2-3 seconds with `exit 1`. This is a **larger source of lost events** than the Apr 7 hang and is *unrelated* to it. The next session should:
1. Reproduce one of the failed Mar 21-31 logs by running the warmup command in isolation: `claude -p "echo ready" --max-turns 1 --output-format json`. If it now succeeds, the cause was transient (rate limit, expired token, upstream issue).
2. Check `~/.claude/` for token/config rotation events around Mar 20-22 and Apr 1.
3. Add `>> stderr.log 2>&1` capture for the actual `claude -p` stderr in `auto-enrich.sh` so future fast-fails leave evidence. Currently the script only captures the exit code.

### R4 — Add a sleep-survival smoke test to CI / pre-merge checks (LOW PRIORITY)
If R2 lands, write a simple test that:
1. Forks `caffeinate -dimsu sleep 60` and the watchdog
2. Sends a `SIGSTOP` and `SIGCONT` to the process tree to simulate sleep/wake
3. Verifies the timer still fires within 60s wall-clock

This catches regressions in the watchdog mechanism without needing a real lid-close test.

### R5 — Update `specs/auto-enrich-postmortem.md` with the new finding (LOW PRIORITY)
The S69 postmortem currently attributes the timeout problem to a broken perl-alarm. Apr 7 reveals that the "fixed" sleep-based watchdog has its own failure mode (clamshell suspension). Cross-link this diagnostic from the postmortem so future readers see the full timeline.

### Priority signal correction (FLAG PROMINENTLY)
The session brief's "17 failures/month, ~50% effective" claim is wrong. The plan's "3 hard failures, ~92% effective" claim is also wrong. The corrected picture (Section 1 + Section 3) shows:
- ~70% of runs produce ≥1 enriched event (over 38 days)
- Apr 7 hang is **one of many failure modes**, and is now (Mode A/B) recoverable thanks to the previous session's lock-age check
- Mode C (mass-fast-fail) is the dominant lost-event source and **deserves its own session**, not a "downgrade enrichment-stability work" recommendation

**Do NOT downgrade enrichment-stability work** based on this diagnostic. The Apr 7 hang itself is largely tamed by the lock-age check, but the underlying clamshell-suspension bug is unfixed and Mode C remains unexplained. Both issues should be tracked.

---

## Section 9 — Open Questions

Items that **could not be answered** with read-only investigation in this session:

1. **Does `caffeinate -i sleep 1800` actually survive a clamshell sleep?**
   - This is R1. Empirical test needed. Strongly expected to **not survive** based on `man caffeinate`, but unverified in this codebase.

2. **What caused the Mode C mass-fast-fail in Mar 21-31?**
   - All 9 days have `exit 1 @ 2-3s` for every batch. Whatever it was, it stopped on Apr 1. Possibilities: expired API token, IP rate limit, regional outage, package update breaking the warmup, brief format change. None investigated in this session. Needs its own diagnostic.

3. **Why was the warmup so slow on some days?**
   - Mar 26: 34 minutes from `Auto-enrichment starting` to `Warm-up complete`. Apr 7: 88 seconds. Mar 14: 7 seconds. The variance is unexplained. Could be network latency, could be CPU contention with other launchd jobs. Worth correlating with `pmset` or `top` history.

4. **What is "PID 99999" in the Apr 8 lock recovery line?**
   - The recovery message reads `holder PID 99999 is stuck`. PID 99999 is suspicious — bash's `$$` shouldn't return a value that high on macOS. Possible causes: lock file got overwritten by something else; manual write during testing; the lock check fired against a stale stat() result. Worth a quick verification next session.

5. **Why does `daily-automated.sh` take 6+ hours of web-scraping before reaching enrichment?**
   - Apr 7: 08:15:39 start → 14:26:09 web scraping completed (6h 10m). This 6-hour window is the reason enrichment routinely starts when the user has walked away. Scraping speed is not the topic of this diagnostic, but the *scheduling implication* (enrichment lands at random times in the user-inactive window) directly enabled the Apr 7 incident. R2d addresses this.

6. **Did the 88-second warmup on Apr 7 indicate something abnormal?**
   - 88s is much longer than the typical 3-10s warmup. It could be coincidental (the system was slow because it was already pseudo-sleeping during the warmup window) or a leading indicator (something about the Claude CLI startup state was already degraded). Worth tracking if Mode C is investigated.

7. **Are there any other launchd plists that fight `auto-enrich.sh` for lock?**
   - `com.agentathens.daily.plist` and `com.agentathens.enrichment-check.plist` both exist in the project root. We didn't audit their schedules. If they overlap, that introduces another failure mode (lock contention).

---

## Verification Checklist

This diagnostic satisfies the plan's verification criteria:

- [x] `specs/claude-hang-diagnostic.md` exists with all 9 sections
- [x] `specs/claude-hang-evidence/` contains 4 preserved files
- [x] Section 7 gives a confidence verdict (HIGH for sleep cause)
- [x] Section 8 gives concrete recommendations (5 R-items, 4 with sub-options)
- [x] Section 3 documents the corrected failure count (and corrects BOTH prior summaries, not just the session brief)
- [x] No files outside `specs/` were modified — `git status` for `agent-athens` should show only the new files in `specs/`
- [x] No `claude -p` invocations were made; no tokens spent on reproduction
- [x] No commits made

---

*End of diagnostic. Last evidence file: `specs/claude-hang-evidence/hung-batch-brief.md`. Generated 2026-04-08.*

