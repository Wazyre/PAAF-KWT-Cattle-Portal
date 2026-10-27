// Head-count helpers shared by the declaration action, the backfill script and the exports.
import { LOW_HEAD_THRESHOLD } from "./constants";

// Total declared (chipped) heads across every animal group and location.
export function totalHeads(
  groups: ReadonlyArray<{ locations: ReadonlyArray<{ chippedCount: number }> }>
): number {
  return groups.reduce(
    (sum, g) => sum + g.locations.reduce((s, l) => s + l.chippedCount, 0),
    0
  );
}

export function isLowHeadCount(total: number): boolean {
  return total < LOW_HEAD_THRESHOLD;
}
