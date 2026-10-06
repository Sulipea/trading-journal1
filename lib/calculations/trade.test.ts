import { describe, expect, it } from "vitest";
import { CONTRACT_SPECS } from "@/lib/domain/instruments";
import {
  FillSequenceError,
  actualRisk,
  plannedRewardRisk,
  plannedRisk,
  rMultiple,
  summarizeFills,
  type Fill,
} from "./trade";

const { ES, MES, NQ, MNQ } = CONTRACT_SPECS;

const at = (minute: number) => `2026-10-06T14:${String(minute).padStart(2, "0")}:00.000Z`;
const entry = (price: number, quantity: number, minute: number): Fill => ({
  type: "ENTRY",
  price,
  quantity,
  timestamp: at(minute),
});
const exit = (price: number, quantity: number, minute: number): Fill => ({
  type: "EXIT",
  price,
  quantity,
  timestamp: at(minute),
});

describe("plannedRisk", () => {
  it("is |entry - stop| × point value × contracts", () => {
    expect(plannedRisk(ES, 5000, 4995, 2)).toBe(500);
    expect(plannedRisk(MNQ, 20000, 20012.5, 3)).toBe(75); // short-side stop above entry
  });

  it("is null without a planned stop", () => {
    expect(plannedRisk(ES, 5000, null, 1)).toBeNull();
  });
});

describe("plannedRewardRisk", () => {
  it("divides target distance by stop distance", () => {
    expect(plannedRewardRisk(5000, 4998, 5006)).toBe(3);
    expect(plannedRewardRisk(5000, 5002, 4995)).toBe(2.5);
  });

  it("is null when stop or target is missing or risk is zero", () => {
    expect(plannedRewardRisk(5000, null, 5010)).toBeNull();
    expect(plannedRewardRisk(5000, 4990, null)).toBeNull();
    expect(plannedRewardRisk(5000, 5000, 5010)).toBeNull();
  });
});

describe("summarizeFills", () => {
  it("computes a simple long trade with fees", () => {
    const s = summarizeFills([entry(5000, 1, 0), exit(5010, 1, 5)], "LONG", ES, 4.5);
    expect(s.grossPnl).toBe(500);
    expect(s.fees).toBe(4.5);
    expect(s.netPnl).toBe(495.5);
    expect(s.isFlat).toBe(true);
  });

  it("computes a short trade", () => {
    const s = summarizeFills([entry(18000, 2, 0), exit(17950, 2, 5)], "SHORT", NQ, 0);
    expect(s.grossPnl).toBe(2000);
  });

  it("computes a losing short trade", () => {
    const s = summarizeFills([entry(18000, 1, 0), exit(18010.25, 1, 5)], "SHORT", NQ, 2);
    expect(s.grossPnl).toBe(-205);
    expect(s.netPnl).toBe(-207);
  });

  it("handles partial exits", () => {
    const s = summarizeFills(
      [entry(5000, 3, 0), exit(5004, 1, 1), exit(5008, 2, 2)],
      "LONG",
      MES,
      0,
    );
    expect(s.grossPnl).toBe(100); // (4 + 8 + 8) points × $5
    expect(s.averageEntry).toBe(5000);
    expect(s.averageExit).toBeCloseTo(5006.6667, 4);
    expect(s.isFlat).toBe(true);
  });

  it("handles partial entries, including scaling in after a partial exit", () => {
    const s = summarizeFills(
      [entry(20000, 2, 0), exit(20010, 1, 1), entry(20020, 1, 2), exit(20030, 2, 3)],
      "LONG",
      MNQ,
      0,
    );
    // Σ exits 60070 − Σ entries 60020 = 50 points × $2
    expect(s.grossPnl).toBe(100);
    expect(s.entryQuantity).toBe(3);
    expect(s.exitQuantity).toBe(3);
    expect(s.maxOpenQuantity).toBe(2);
  });

  it("orders fills by timestamp regardless of input order", () => {
    const s = summarizeFills([exit(5010, 1, 5), entry(5000, 1, 0)], "LONG", ES, 0);
    expect(s.grossPnl).toBe(500);
  });

  it("reports realized P&L and open quantity for a partially closed trade", () => {
    const s = summarizeFills([entry(5000, 2, 0), exit(5002, 1, 1)], "LONG", ES, 0);
    expect(s.grossPnl).toBe(100);
    expect(s.openQuantity).toBe(1);
    expect(s.isFlat).toBe(false);
  });

  it("is not flat with no fills", () => {
    const s = summarizeFills([], "LONG", ES, 0);
    expect(s.isFlat).toBe(false);
    expect(s.averageEntry).toBeNull();
    expect(s.grossPnl).toBe(0);
  });

  it("rejects exits larger than the open position", () => {
    expect(() => summarizeFills([entry(5000, 1, 0), exit(5010, 2, 1)], "LONG", ES, 0)).toThrow(
      FillSequenceError,
    );
    expect(() => summarizeFills([exit(5010, 1, 0)], "LONG", ES, 0)).toThrow(FillSequenceError);
  });
});

describe("rMultiple", () => {
  it("divides net P&L by initial planned risk", () => {
    expect(rMultiple(750, 250)).toBe(3);
    expect(rMultiple(-125, 250)).toBe(-0.5);
  });

  it("is null without positive planned risk", () => {
    expect(rMultiple(100, null)).toBeNull();
    expect(rMultiple(100, 0)).toBeNull();
  });
});

describe("actualRisk", () => {
  it("uses the average entry, the stop and the largest position held", () => {
    const fills = summarizeFills(
      [entry(5000, 1, 0), entry(5002, 1, 1), exit(5010, 2, 2)],
      "LONG",
      ES,
      0,
    );
    // average entry 5001, stop 4996 → 5 points × $50 × 2 contracts
    expect(actualRisk(ES, fills, 4996)).toBe(500);
  });

  it("is null without entries or a stop", () => {
    expect(actualRisk(ES, { averageEntry: null, maxOpenQuantity: 0 }, 4990)).toBeNull();
    expect(actualRisk(ES, { averageEntry: 5000, maxOpenQuantity: 1 }, null)).toBeNull();
  });
});
