import { describe, expect, it } from "vitest";
import { detectAutoViolations, disciplineConflict, type ProcessCheckInput } from "./process-checks";

// The short from the bug report: entered 7655.75 with a 4-point planned stop
// (2 ES contracts = $400), no stop attached, covered at 7667.25 for −$1,150.
const short: ProcessCheckInput = {
  direction: "SHORT",
  tickSize: 0.25,
  stopAtEntry: false,
  plannedStop: 7659.75,
  plannedRisk: 400,
  rMultiple: -2.875,
  netPnl: -1150,
  averageEntry: 7655.75,
  exitPrices: [7667.25],
  zones: [{ low: 7660, high: 7665, label: "Put support" }],
};

describe("detectAutoViolations", () => {
  it("flags every problem the data shows", () => {
    const found = detectAutoViolations(short);
    expect(found.map((v) => v.kind)).toEqual(["NO_STOP_AT_ENTRY", "LOSS_BEYOND_PLANNED_RISK", "EXIT_BEYOND_STOP", "ENTRY_OUTSIDE_ZONE"]);
    expect(found[1]!.detail).toBe("Lost 2.88R ($1,150.00 against $400.00 planned).");
    expect(found[2]!.detail).toBe("Exited at 7667.25, past the planned stop at 7659.75.");
    expect(found[3]!.detail).toBe("Entered at 7655.75, outside the planned zone 7660.00–7665.00.");
  });

  it("flags nothing for a protected trade stopped out at plan", () => {
    expect(
      detectAutoViolations({ ...short, stopAtEntry: true, rMultiple: -1.05, netPnl: -420, averageEntry: 7662, exitPrices: [7660.25] }),
    ).toEqual([]);
  });

  it("leaves unrecorded or unknowable things unjudged", () => {
    expect(
      detectAutoViolations({ ...short, stopAtEntry: null, rMultiple: null, netPnl: null, plannedStop: null, zones: [] }),
    ).toEqual([]);
  });

  it("allows two ticks of stop slippage, on the correct side for longs", () => {
    const long = { ...short, direction: "LONG" as const, stopAtEntry: true, rMultiple: -1, plannedStop: 7650, zones: [] };
    expect(detectAutoViolations({ ...long, exitPrices: [7649.5] })).toEqual([]);
    expect(detectAutoViolations({ ...long, exitPrices: [7649.25] }).map((v) => v.kind)).toEqual(["EXIT_BEYOND_STOP"]);
  });
});

describe("disciplineConflict", () => {
  it("notes discipline 5 alongside Revenge or FOMO", () => {
    expect(
      disciplineConflict([
        { phase: "BEFORE", emotions: ["Calm"], ratings: { Discipline: 5 } },
        { phase: "AFTER", emotions: ["FOMO", "Revenge"], ratings: { Discipline: 5 } },
      ]),
    ).toBe("Discipline rated 5 on a trade where FOMO and Revenge were recorded.");
  });

  it("is quiet when the rating matches the emotions", () => {
    expect(disciplineConflict([{ phase: "AFTER", emotions: ["Revenge"], ratings: { Discipline: 2 } }])).toBeNull();
    expect(disciplineConflict([{ phase: "AFTER", emotions: ["Calm"], ratings: { Discipline: 5 } }])).toBeNull();
  });
});
