/**
 * Client search ranking: Fuse relevance first; within a relevance band the
 * sooner event wins. Evaluates the exact JS string shipped in the page.
 */
import { describe, test, expect } from "bun:test";
import { RANK_EVENTS_JS, renderSearchScript } from "../search-overlay";

type Result = { item: { id: string; startDate: string }; score: number };
// Evaluates a module constant (our own source, no external input) — the same
// string the page script embeds.
const rankEvents: (results: Result[]) => Result[] =
  new Function(`${RANK_EVENTS_JS}; return rankEvents;`)();

const r = (id: string, startDate: string, score: number): Result => ({ item: { id, startDate }, score });

describe("rankEvents", () => {
  test("equal relevance: sooner event first regardless of input order", () => {
    const out = rankEvents([r("far", "2027-04-25T21:00:00", 0.02), r("near", "2026-09-23T21:00:00", 0.02)]);
    expect(out.map(x => x.item.id)).toEqual(["near", "far"]);
  });

  test("near-equal relevance (same band) also prefers the sooner event", () => {
    const out = rankEvents([r("far", "2027-04-25", 0.0076), r("near", "2026-10-01", 0.0389)]);
    expect(out.map(x => x.item.id)).toEqual(["near", "far"]);
  });

  test("clearly better relevance still wins over proximity", () => {
    const out = rankEvents([r("near-weak", "2026-09-23", 0.3162), r("far-strong", "2027-01-10", 0.0186)]);
    expect(out.map(x => x.item.id)).toEqual(["far-strong", "near-weak"]);
  });

  test("an already-running event (past start) ranks ahead of later starts", () => {
    const out = rankEvents([r("next-week", "2026-09-29", 0.02), r("running", "2026-06-01", 0.02)]);
    expect(out.map(x => x.item.id)).toEqual(["running", "next-week"]);
  });

  test("full ties keep Fuse's order", () => {
    const out = rankEvents([r("a", "2026-10-01", 0.02), r("b", "2026-10-01", 0.02)]);
    expect(out.map(x => x.item.id)).toEqual(["a", "b"]);
  });

  test("the shipped script ranks event results with it", () => {
    const script = renderSearchScript("el");
    expect(script).toContain(RANK_EVENTS_JS);
    expect(script).toContain("var eventResults = rankEvents(fuseEvents.search(q));");
  });
});
