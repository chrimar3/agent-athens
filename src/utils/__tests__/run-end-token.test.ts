import { describe, test, expect } from "bun:test";
import { parseRunEndDate } from "../run-end-token";

// Greek strings below are test FIXTURE data (samples of real scraped/migrated
// descriptions). The production token list lives in config/parsing-tokens.json;
// src/ never hardcodes it (G5 / S-F2a).

describe("parseRunEndDate", () => {
  test("exact-form description (the 11.6k machine-generated corpus shape)", () => {
    const r = parseRunEndDate("Εως 2026-06-30");
    expect(r).toEqual({ endDate: "2026-06-30", cleanedDescription: null });
  });

  test("prose suffix after token+date is preserved", () => {
    const r = parseRunEndDate("Εως 2026-06-30 με την αρχική διανομή του έργου");
    expect(r?.endDate).toBe("2026-06-30");
    expect(r?.cleanedDescription).toBe("με την αρχική διανομή του έργου");
  });

  test("token mid-string strips the token+date segment, keeps surrounding prose", () => {
    const r = parseRunEndDate("Η παράσταση συνεχίζεται. Εως 2026-09-15 στο θέατρο.");
    expect(r?.endDate).toBe("2026-09-15");
    expect(r?.cleanedDescription).toBe("Η παράσταση συνεχίζεται. στο θέατρο.");
  });

  test("accent variant Έως is recognized (config token list)", () => {
    const r = parseRunEndDate("Έως 2026-07-01");
    expect(r?.endDate).toBe("2026-07-01");
  });

  test("lowercase έως is recognized", () => {
    const r = parseRunEndDate("έως 2026-07-01");
    expect(r?.endDate).toBe("2026-07-01");
  });

  test("non-ISO date after token is a no-op", () => {
    expect(parseRunEndDate("Εως 30/6")).toBeNull();
    expect(parseRunEndDate("Εως τις 30 Ιουνίου")).toBeNull();
  });

  test("invalid calendar date is a no-op", () => {
    expect(parseRunEndDate("Εως 2026-02-31")).toBeNull();
  });

  test("end before start is a no-op when startDate provided", () => {
    expect(parseRunEndDate("Εως 2026-06-01", "2026-06-10")).toBeNull();
  });

  test("end equal to start is accepted", () => {
    const r = parseRunEndDate("Εως 2026-06-10", "2026-06-10");
    expect(r?.endDate).toBe("2026-06-10");
  });

  test("startDate with time component compares date-only", () => {
    const r = parseRunEndDate("Εως 2026-06-30", "2026-06-10T21:30:00");
    expect(r?.endDate).toBe("2026-06-30");
  });

  test("token absent is a no-op", () => {
    expect(parseRunEndDate("Μια κανονική περιγραφή παράστασης")).toBeNull();
    expect(parseRunEndDate("")).toBeNull();
    expect(parseRunEndDate(null)).toBeNull();
    expect(parseRunEndDate(undefined)).toBeNull();
  });

  test("residue under 10 non-whitespace chars collapses to null description", () => {
    const r = parseRunEndDate("Εως 2026-06-30 ...");
    expect(r?.endDate).toBe("2026-06-30");
    expect(r?.cleanedDescription).toBeNull();
  });

  test("token embedded in a longer word does not match", () => {
    expect(parseRunEndDate("Παρέως 2026-06-30")).toBeNull();
  });
});
