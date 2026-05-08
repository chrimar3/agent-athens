import { describe, test, expect } from "bun:test";
import { validatePicksItemListPositionContiguous } from "../picks-itemlist-position-contiguous";

describe("validatePicksItemListPositionContiguous", () => {
  test("null itemList passes (conditional-render-skipped)", () => {
    const result = validatePicksItemListPositionContiguous(null);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("undefined itemList passes", () => {
    const result = validatePicksItemListPositionContiguous(undefined);
    expect(result.errors).toEqual([]);
  });

  test("missing itemListElement passes", () => {
    const result = validatePicksItemListPositionContiguous({});
    expect(result.errors).toEqual([]);
  });

  test("empty itemListElement passes", () => {
    const result = validatePicksItemListPositionContiguous({ itemListElement: [] });
    expect(result.errors).toEqual([]);
  });

  test("contiguous [1, 2, 3] passes", () => {
    const result = validatePicksItemListPositionContiguous({
      itemListElement: [
        { position: 1 },
        { position: 2 },
        { position: 3 },
      ],
    });
    expect(result.errors).toEqual([]);
  });

  test("gap [1, 2, 4] fails with rule-named message", () => {
    const result = validatePicksItemListPositionContiguous({
      itemListElement: [
        { position: 1 },
        { position: 2 },
        { position: 4 },
      ],
    });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("picks-itemlist-position-contiguous");
    expect(result.errors[0]).toContain("expected position 3");
  });

  test("duplicate [1, 2, 2] fails", () => {
    const result = validatePicksItemListPositionContiguous({
      itemListElement: [
        { position: 1 },
        { position: 2 },
        { position: 2 },
      ],
    });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("picks-itemlist-position-contiguous");
  });

  test("starts at 0 fails (positions must start at 1)", () => {
    const result = validatePicksItemListPositionContiguous({
      itemListElement: [
        { position: 0 },
        { position: 1 },
      ],
    });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("expected position 1");
  });

  test("out-of-order [3, 1, 2] passes after sort", () => {
    const result = validatePicksItemListPositionContiguous({
      itemListElement: [
        { position: 3 },
        { position: 1 },
        { position: 2 },
      ],
    });
    expect(result.errors).toEqual([]);
  });
});
