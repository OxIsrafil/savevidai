import type { RangeKey } from "./api";
import { RANGE_DAYS } from "./range";

/** Relative change, or null when there is nothing to compare with. Verbatim from the premium store. */
export function change(current: number, previous: number | null | undefined): number | null {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** The second half of a delta's title: "Compared with {compareLabel(range)}". */
export function compareLabel(range: RangeKey): string {
  if (range === "today") return "yesterday at this time";
  return `the ${RANGE_DAYS[range]} days before`;
}
