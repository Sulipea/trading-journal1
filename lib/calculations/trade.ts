/**
 * Per-trade financial calculations (spec §9).
 *
 * Pure and deterministic: no storage access, no clock, no LLM.
 */
import type { ContractSpec } from "@/lib/domain/instruments";
import type { Direction, TradeEventType } from "@/lib/domain/types";
import { roundMoney } from "./money";

export interface Fill {
  type: TradeEventType;
  price: number;
  quantity: number;
  timestamp: string;
}

export class FillSequenceError extends Error {
  override name = "FillSequenceError";
}

function directionSign(direction: Direction): 1 | -1 {
  return direction === "LONG" ? 1 : -1;
}

/**
 * Initial planned risk in dollars: |entry - stop| × point value × contracts.
 * This defines 1R and never changes after the trade is opened.
 * Returns `null` when no stop has been planned.
 */
export function plannedRisk(
  spec: ContractSpec,
  plannedEntry: number,
  plannedStop: number | null,
  contracts: number,
): number | null {
  if (plannedStop === null) return null;
  return roundMoney(Math.abs(plannedEntry - plannedStop) * spec.pointValue * contracts);
}

/**
 * Planned reward:risk ratio from entry, stop and target.
 * Returns `null` when stop or target is missing or the stop equals the entry.
 */
export function plannedRewardRisk(
  plannedEntry: number,
  plannedStop: number | null,
  plannedTarget: number | null,
): number | null {
  if (plannedStop === null || plannedTarget === null) return null;
  const risk = Math.abs(plannedEntry - plannedStop);
  if (risk === 0) return null;
  return Math.abs(plannedTarget - plannedEntry) / risk;
}

export interface FillSummary {
  entryQuantity: number;
  exitQuantity: number;
  openQuantity: number;
  /** Volume-weighted average entry price, or `null` with no entries. */
  averageEntry: number | null;
  /** Volume-weighted average exit price, or `null` with no exits. */
  averageExit: number | null;
  /** Realized P&L before fees, in dollars. */
  grossPnl: number;
  fees: number;
  /** Realized P&L after fees, in dollars. */
  netPnl: number;
  /** True once every entered contract has been exited. */
  isFlat: boolean;
}

/**
 * Reconcile all partial entries and exits into realized P&L.
 *
 * Uses average-cost accounting, so once the position is flat the result
 * equals direction × point value × (Σ exit price·qty − Σ entry price·qty).
 *
 * Throws `FillSequenceError` if an exit would close more contracts than are open.
 */
export function summarizeFills(
  fills: readonly Fill[],
  direction: Direction,
  spec: ContractSpec,
  fees: number,
): FillSummary {
  const sign = directionSign(direction);
  // Stable sort: same-timestamp fills keep their recorded order.
  const ordered = [...fills].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let openQuantity = 0;
  let openCostBasis = 0;
  let realizedPoints = 0;
  let entryQuantity = 0;
  let entryNotional = 0;
  let exitQuantity = 0;
  let exitNotional = 0;

  for (const fill of ordered) {
    if (fill.type === "ENTRY") {
      openQuantity += fill.quantity;
      openCostBasis += fill.price * fill.quantity;
      entryQuantity += fill.quantity;
      entryNotional += fill.price * fill.quantity;
      continue;
    }

    if (fill.quantity > openQuantity) {
      throw new FillSequenceError(
        `Exit of ${fill.quantity} at ${fill.timestamp} exceeds open quantity ${openQuantity}`,
      );
    }
    const averageCost = openCostBasis / openQuantity;
    realizedPoints += sign * (fill.price - averageCost) * fill.quantity;
    openQuantity -= fill.quantity;
    openCostBasis = openQuantity === 0 ? 0 : openCostBasis - averageCost * fill.quantity;
    exitQuantity += fill.quantity;
    exitNotional += fill.price * fill.quantity;
  }

  const grossPnl = roundMoney(realizedPoints * spec.pointValue);
  return {
    entryQuantity,
    exitQuantity,
    openQuantity,
    averageEntry: entryQuantity > 0 ? entryNotional / entryQuantity : null,
    averageExit: exitQuantity > 0 ? exitNotional / exitQuantity : null,
    grossPnl,
    fees: roundMoney(fees),
    netPnl: roundMoney(grossPnl - fees),
    isFlat: entryQuantity > 0 && openQuantity === 0,
  };
}

/**
 * R multiple: net P&L divided by the initial planned risk (1R).
 * Returns `null` when no positive planned risk exists.
 */
export function rMultiple(netPnl: number, initialPlannedRisk: number | null): number | null {
  if (initialPlannedRisk === null || initialPlannedRisk <= 0) return null;
  return netPnl / initialPlannedRisk;
}
