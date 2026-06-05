import { describe, test, expect } from "bun:test";
import { isStandUpComedy, resolveEventSchemaType, COMEDY_EVENT_TYPE } from "../comedy-format";

// S175 — comedy-format detector. Structured tokens ONLY:
// /\bstand[- ]?up\b/i against title, tags[], genres[], plus an exact-match
// curated venue allow-list (config/standup-venues.json — ships EMPTY: the
// only 'comedy'-named venue, Doryphora Comedy Gig Space, hosts concerts).
// Description text is NEVER consulted (negation trap: 648708ce's description
// says "What follows is not stand-up"). The bare token "comedy" NEVER fires
// (63 theater comedies carry Comedy tags).

describe("isStandUpComedy — structured-token detector", () => {
  test("fires on Stand-up-comedy tag (backfill-supplied signal)", () => {
    expect(isStandUpComedy({
      title: "Kevin Bridges - Here if you need me",
      type: "other",
      tags: ["Comedy", "Stand-up-comedy", "Mainstream"],
    })).toBe(true);
  });

  test("fires on Stand-Up tag variant (pre-tagged corpus row 68930d49)", () => {
    expect(isStandUpComedy({
      title: "Δεν θα πεθάνουμε κιόλας",
      type: "show",
      tags: ["Comedy", "Stand-Up", "Cabaret"],
    })).toBe(true);
  });

  test("fires on 'stand up' token in title (corpus row 074415dc)", () => {
    expect(isStandUpComedy({
      title: "Ξαφνικό stand up στου Φιλοπάππου",
      type: "show",
      tags: [],
    })).toBe(true);
  });

  test("fires on standup (no separator) and Stand-up genre", () => {
    expect(isStandUpComedy({ title: "Standup night", type: "show" })).toBe(true);
    expect(isStandUpComedy({ title: "x", type: "show", genres: ["Stand-up"] })).toBe(true);
  });

  test("bare Comedy tag NEVER fires — Coronet comedic play stays theater (5e9311d5)", () => {
    expect(isStandUpComedy({
      title: "Η Πριγκίπισσα των Αγίων Σαράντα! 2ος Χρόνος",
      type: "theater",
      tags: ["Comedy", "Theater", "Greek-locals", "Seated"],
    })).toBe(false);
  });

  test("description is never consulted — negated 'not stand-up' prose cannot fire (648708ce)", () => {
    expect(isStandUpComedy({
      title: "Το πάρτι της ζωής μου",
      type: "theater",
      tags: ["live-theater", "comedy", "one-person-show"],
      description: "What follows is not stand-up and not quite a play",
      fullDescription: "Eleni Rantou stands alone onstage... it is not stand-up",
    } as any)).toBe(false);
  });

  test("κωμωδία / comedy in title never fires (theater comedies)", () => {
    expect(isStandUpComedy({ title: "Κωμωδία της Γειτονιάς 2", type: "theater" })).toBe(false);
    expect(isStandUpComedy({ title: "The Comedy of Errors", type: "theater" })).toBe(false);
  });

  test("venue allow-list is exact-match and ships empty — Doryphora concerts do NOT fire", () => {
    expect(isStandUpComedy({
      title: "Mary Sunshine",
      type: "concert",
      venue: { name: "Doryphora Comedy Gig Space" },
    })).toBe(false);
  });

  test("token must be word-bounded (no substring bleed)", () => {
    expect(isStandUpComedy({ title: "Understanding Upstanding Citizens", type: "theater" })).toBe(false);
  });
});

describe("resolveEventSchemaType — derivation layered above EventType→@type", () => {
  test("stand-up signal overrides theater → ComedyEvent (Mario Adrion class)", () => {
    expect(resolveEventSchemaType({
      title: "The Superior Comedy Tour - Mario Adrion",
      type: "theater",
      tags: ["comedy", "Stand-up-comedy"],
    })).toBe(COMEDY_EVENT_TYPE);
  });

  test("stand-up signal overrides other → ComedyEvent (Kevin Bridges class)", () => {
    expect(resolveEventSchemaType({
      title: "Kevin Bridges - Here if you need me",
      type: "other",
      tags: ["Stand-up-comedy"],
    })).toBe("ComedyEvent");
  });

  test("no signal → base SCHEMA_TYPE_MAP unchanged", () => {
    expect(resolveEventSchemaType({ title: "Sexy laundry", type: "other", tags: ["Theater", "Comedy"] })).toBe("Event");
    expect(resolveEventSchemaType({ title: "Η Καρυάτιδα!", type: "theater", tags: ["comedy"] })).toBe("TheaterEvent");
    expect(resolveEventSchemaType({ title: "Jazz Night", type: "concert" })).toBe("MusicEvent");
    expect(resolveEventSchemaType({ title: "Έκθεση", type: "exhibition" })).toBe("ExhibitionEvent");
  });

  test("unknown type without signal falls back to generic Event", () => {
    expect(resolveEventSchemaType({ title: "x", type: "mystery" })).toBe("Event");
  });
});
