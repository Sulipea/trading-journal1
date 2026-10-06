import { describe, expect, it } from "vitest";
import { newId } from "@/lib/domain/ids";
import type { PsychologyEntry } from "@/lib/domain/types";
import { T0, makeEvent, makeTrade } from "@/lib/test/fixtures";
import { checkCloseReadiness, isFieldMissing } from "./close-validation";

const trade = makeTrade({ plannedStop: null, reasoning: "  ", session: "NY_AM" });
const psych = (overrides: Partial<PsychologyEntry>): PsychologyEntry => ({
  id: newId(),
  createdAt: T0,
  updatedAt: T0,
  tradeId: trade.id,
  phase: "BEFORE",
  emotions: [],
  ratings: {},
  text: "",
  ...overrides,
});

describe("isFieldMissing", () => {
  const ctx = { trade, psychology: [psych({ emotions: ["Calm"] }), psych({ phase: "AFTER" })], screenshotCount: 0 };

  it("treats null values and blank text as missing", () => {
    expect(isFieldMissing("plannedStop", ctx)).toBe(true);
    expect(isFieldMissing("reasoning", ctx)).toBe(true);
    expect(isFieldMissing("session", ctx)).toBe(false);
  });

  it("requires a non-empty psychology entry for the phase", () => {
    expect(isFieldMissing("psychologyBefore", ctx)).toBe(false);
    expect(isFieldMissing("psychologyAfter", ctx)).toBe(true); // exists but empty
    expect(isFieldMissing("psychologyDuring", ctx)).toBe(true);
  });

  it("requires a screenshot when configured", () => {
    expect(isFieldMissing("screenshot", ctx)).toBe(true);
    expect(isFieldMissing("screenshot", { ...ctx, screenshotCount: 1 })).toBe(false);
  });
});

describe("checkCloseReadiness", () => {
  it("needs a flat position and no missing fields", () => {
    const entry = makeEvent({ tradeId: trade.id });
    const exit = makeEvent({ tradeId: trade.id, type: "EXIT", timestamp: "2026-10-06T15:00:00.000Z" });
    const base = { trade, psychology: [], screenshotCount: 0 };

    expect(checkCloseReadiness({ ...base, events: [entry], requiredFields: [] })).toMatchObject({
      canClose: false,
      positionFlat: false,
    });
    expect(checkCloseReadiness({ ...base, events: [entry, exit], requiredFields: ["session"] }).canClose).toBe(true);
    expect(
      checkCloseReadiness({ ...base, events: [entry, exit], requiredFields: ["session", "plannedStop"] }).missing,
    ).toEqual(["plannedStop"]);
  });
});
