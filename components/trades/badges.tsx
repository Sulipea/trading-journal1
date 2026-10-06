import { ArrowDownRight, ArrowUpRight, Lock, LockOpen } from "lucide-react";
import type { Direction, Trade, TradeStatus } from "@/lib/domain/types";
import { cn } from "@/lib/ui/cn";

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

export function DirectionBadge({ direction }: { direction: Direction }) {
  const long = direction === "LONG";
  const Icon = long ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(pill, long ? "bg-positive/12 text-positive" : "bg-negative/12 text-negative")}>
      <Icon aria-hidden className="size-3" />
      {long ? "Long" : "Short"}
    </span>
  );
}

const STATUS_LABELS: Record<TradeStatus, string> = { OPEN: "Open", UPDATED: "Updated", CLOSED: "Closed" };

export function StatusBadge({ status }: { status: TradeStatus }) {
  return (
    <span
      className={cn(
        pill,
        status === "CLOSED" ? "bg-surface-muted text-muted" : "bg-accent/15 text-accent",
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function LockBadge({ trade }: { trade: Trade }) {
  if (trade.status !== "CLOSED") return null;
  return trade.unlocked ? (
    <span className={cn(pill, "bg-negative/12 text-negative")}>
      <LockOpen aria-hidden className="size-3" />
      Unlocked
    </span>
  ) : (
    <span className={cn(pill, "bg-surface-muted text-muted")}>
      <Lock aria-hidden className="size-3" />
      Locked
    </span>
  );
}

/** Money/R value coloured by sign; the sign is always in the text too. */
export function SignedValue({ value, children }: { value: number | null; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        value !== null && value > 0 && "text-positive",
        value !== null && value < 0 && "text-negative",
      )}
    >
      {children}
    </span>
  );
}
