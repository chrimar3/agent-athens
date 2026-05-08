// Editorial picks ItemList position-contiguous validator (S101a-1).
// Date created: 2026-05-08
//
// Validates that the `position` values on a Picks ItemList's
// `itemListElement` array start at 1 and increase by 1 with no gaps and no
// duplicates. This is a structural rule — it operates on the parsed
// ItemList shape regardless of whether the picks are emitted as JSON-LD or
// microdata, so a single registration covers both emission paths.
//
// Pass conditions:
//   - itemList is null/undefined           (conditional-render-skipped)
//   - itemListElement is empty/missing     (no picks to validate)
//   - positions are exactly [1, 2, 3, ...] (contiguous)
//
// Fail conditions:
//   - any gap (e.g. [1, 2, 4])
//   - any duplicate (e.g. [1, 2, 2])
//   - any zero/negative position
//   - any position above the count of elements (implies gap)

interface PickItem {
  position: number;
}

interface PicksItemList {
  itemListElement?: PickItem[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const RULE_NAME = "picks-itemlist-position-contiguous";

export function validatePicksItemListPositionContiguous(
  itemList: PicksItemList | null | undefined,
): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };

  if (!itemList || !itemList.itemListElement || itemList.itemListElement.length === 0) {
    return result;
  }

  const positions = itemList.itemListElement
    .map((item) => item.position)
    .sort((a, b) => a - b);

  for (let i = 0; i < positions.length; i++) {
    const expected = i + 1;
    if (positions[i] !== expected) {
      result.errors.push(
        `${RULE_NAME}: expected position ${expected} at index ${i}, got ${positions[i]} (positions: [${positions.join(", ")}])`,
      );
      return result;
    }
  }

  return result;
}
