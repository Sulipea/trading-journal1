import type { TradeEvent } from "./types";

/**
 * Chronological order for fills. Fills in the same second (common for fast
 * trades) are ordered by when they were recorded, then entries before exits,
 * so the order is always deterministic.
 */
export function compareFills(
  a: Pick<TradeEvent, "timestamp" | "createdAt" | "type">,
  b: Pick<TradeEvent, "timestamp" | "createdAt" | "type">,
): number {
  return (
    a.timestamp.localeCompare(b.timestamp) ||
    a.createdAt.localeCompare(b.createdAt) ||
    (a.type === b.type ? 0 : a.type === "ENTRY" ? -1 : 1)
  );
}
