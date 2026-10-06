import { describe, expect, it } from "vitest";
import { niceTicks } from "@/components/charts/scale";

describe("niceTicks", () => {
  it("always covers the data range", () => {
    for (const [min, max] of [
      [24_100, 28_250],
      [0, 388.4],
      [-120, 45],
      [5, 5],
    ] as const) {
      const ticks = niceTicks(min, max);
      expect(ticks[0]!).toBeLessThanOrEqual(min);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(max);
    }
  });
});
