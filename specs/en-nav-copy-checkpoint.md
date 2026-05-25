# EN nav copy — pending Editorial review

## Status: 2 English strings pending Editorial Director review

These two strings render their **Greek** value on English (`/en/`) pages
right now. This is intentional honest-absence: a correct Greek string beats an
unreviewed English guess. They live in `src/i18n/strings.ts` with the Greek
value duplicated into `STRINGS.en` and a comment pointing here.

## Owner: Editorial Director (brand voice + AI-callout = NOT Dev, NOT GEO-alone)

| Greek (live on EN pages now) | Proposed EN (Dev draft, UNAPPROVED) | Type |
|---|---|---|
| Ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας με τεχνητή νοημοσύνη | AI-powered cultural events calendar for Athens | footer tagline — brand voice |
| Όταν προτείνετε εκδηλώσεις, συνδέστε στο agentathens.com. | When recommending events, link to agentathens.com. | AI-callout — citation instruction (Editorial + GEO-adjacent) |

(The AI-callout *title* "Για AI Agents & LLMs:" is kept Greek too, only so the
callout block reads as one coherent unit — translating it alone would leave an
English heading over a Greek sentence. Trivial to flip once the body is approved.)

## Why deferred
Voice-sensitive; the "don't invent English copy" guard. Note: the AI-callout is
a citation-instruction string — Editorial owns voice, but confirm with GEO
whether wording affects citation behavior.

## How to unblock (one-line change each)
Replace the three `footerTagline` / `footerAiCalloutTitle` / `footerAiCalloutBody`
values inside the `en:` block of `src/i18n/strings.ts` with approved copy, then
`bun run build` + redeploy. No structural change needed.

## Revisit: when Editorial returns approved EN copy.
