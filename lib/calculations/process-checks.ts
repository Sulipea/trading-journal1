/**
 * Process checks derived from what the trade data shows, not from what was
 * ticked. Deterministic: the same trade always gives the same flags. These
 * count as rule violations alongside the manual checklist.
 */
import type { Direction, PsychologyPhase, RuleSeverity } from "@/lib/domain/types";
import { formatMoney, formatPrice, formatR } from "@/lib/format";

export type AutoViolationKind = "NO_STOP_AT_ENTRY" | "LOSS_BEYOND_PLANNED_RISK" | "EXIT_BEYOND_STOP" | "ENTRY_OUTSIDE_ZONE";

export interface AutoViolation {
  kind: AutoViolationKind;
  severity: RuleSeverity;
  /** What the data shows, e.g. "Lost 2.88R ($1,150.00) against $400.00 planned". */
  detail: string;
}

export const AUTO_VIOLATION_LABELS: Readonly<Record<AutoViolationKind, string>> = {
  NO_STOP_AT_ENTRY: "No stop attached at entry",
  LOSS_BEYOND_PLANNED_RISK: "Loss bigger than planned risk",
  EXIT_BEYOND_STOP: "Held past the planned stop",
  ENTRY_OUTSIDE_ZONE: "Entry outside the planned zone",
};

export const AUTO_VIOLATION_SEVERITY: Readonly<Record<AutoViolationKind, RuleSeverity>> = {
  NO_STOP_AT_ENTRY: "HIGH",
  LOSS_BEYOND_PLANNED_RISK: "HIGH",
  EXIT_BEYOND_STOP: "HIGH",
  ENTRY_OUTSIDE_ZONE: "MEDIUM",
};

/** A loss counts as beyond plan once it exceeds planned risk by more than this (slippage, fees). */
export const LOSS_TOLERANCE_R = 1.1;
/** Exits this many ticks past the planned stop are treated as stop slippage, not holding past it. */
export const STOP_SLIPPAGE_TICKS = 2;

export interface PriceZone {
  low: number;
  high: number;
  label: string;
}

export interface ProcessCheckInput {
  direction: Direction;
  tickSize: number;
  /** null = not recorded, so not judged. */
  stopAtEntry: boolean | null;
  plannedStop: number | null;
  /** 1R in dollars. */
  plannedRisk: number | null;
  /** Only once flat. Uses the manual R when one is entered. */
  rMultiple: number | null;
  /** Only once flat. */
  netPnl: number | null;
  averageEntry: number | null;
  exitPrices: readonly number[];
  /** Entry zones of the linked forecast scenario, if any. */
  zones: readonly PriceZone[];
}

export function detectAutoViolations(input: ProcessCheckInput): AutoViolation[] {
  const found: AutoViolation[] = [];
  const add = (kind: AutoViolationKind, detail: string) => found.push({ kind, severity: AUTO_VIOLATION_SEVERITY[kind], detail });

  if (input.stopAtEntry === false) add("NO_STOP_AT_ENTRY", "Recorded as entered without a stop order attached.");

  if (input.rMultiple !== null && input.rMultiple < -LOSS_TOLERANCE_R) {
    const dollars =
      input.netPnl !== null && input.plannedRisk !== null
        ? ` (${formatMoney(-input.netPnl)} against ${formatMoney(input.plannedRisk)} planned)`
        : "";
    add("LOSS_BEYOND_PLANNED_RISK", `Lost ${formatR(input.rMultiple).replace("-", "")}${dollars}.`);
  }

  if (input.plannedStop !== null && input.exitPrices.length > 0) {
    const slack = STOP_SLIPPAGE_TICKS * input.tickSize;
    const worst = input.direction === "LONG" ? Math.min(...input.exitPrices) : Math.max(...input.exitPrices);
    const beyond = input.direction === "LONG" ? worst < input.plannedStop - slack : worst > input.plannedStop + slack;
    if (beyond) add("EXIT_BEYOND_STOP", `Exited at ${formatPrice(worst)}, past the planned stop at ${formatPrice(input.plannedStop)}.`);
  }

  if (input.averageEntry !== null && input.zones.length > 0) {
    const entry = input.averageEntry;
    const inside = input.zones.some((z) => entry >= z.low - input.tickSize && entry <= z.high + input.tickSize);
    if (!inside) {
      const zones = input.zones.map((z) => `${formatPrice(z.low)}–${formatPrice(z.high)}`).join(", ");
      add("ENTRY_OUTSIDE_ZONE", `Entered at ${formatPrice(entry)}, outside the planned zone ${zones}.`);
    }
  }
  return found;
}

/** Emotions that contradict a top discipline rating. */
export const UNDISCIPLINED_EMOTIONS = ["revenge", "fomo"] as const;
/** Discipline ratings at or above this conflict with those emotions. */
export const HIGH_DISCIPLINE = 5;

/**
 * "Discipline 5" recorded on the same trade as Revenge or FOMO. Doesn't change
 * the score (it's self-reported either way) but is shown so it can be looked at.
 */
export function disciplineConflict(
  entries: readonly { phase: PsychologyPhase; emotions: readonly string[]; ratings: Readonly<Record<string, number>> }[],
): string | null {
  const emotions = [
    ...new Set(
      entries.flatMap((e) => e.emotions).filter((e) => (UNDISCIPLINED_EMOTIONS as readonly string[]).includes(e.trim().toLowerCase())),
    ),
  ];
  if (emotions.length === 0) return null;
  const high = entries.some((e) =>
    Object.entries(e.ratings).some(([name, value]) => name.trim().toLowerCase() === "discipline" && value >= HIGH_DISCIPLINE),
  );
  if (!high) return null;
  return `Discipline rated ${HIGH_DISCIPLINE} on a trade where ${emotions.join(" and ")} ${emotions.length > 1 ? "were" : "was"} recorded.`;
}
