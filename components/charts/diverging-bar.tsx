import { cn } from "@/lib/ui/cn";

/**
 * A horizontal bar growing left (loss) or right (gain) from a centre
 * baseline, sized relative to `maxAbs`. Position and the signed value label
 * carry the sign, so it never relies on colour alone.
 */
export function DivergingBar({ value, maxAbs, className }: { value: number | null; maxAbs: number; className?: string }) {
  const share = value === null || maxAbs === 0 ? 0 : Math.min(1, Math.abs(value) / maxAbs);
  const gain = (value ?? 0) >= 0;
  return (
    <div aria-hidden className={cn("relative h-3 w-full", className)}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-chart-grid" />
      {share > 0 && (
        <div
          className={cn("absolute inset-y-0", gain ? "left-1/2 rounded-r-[4px] bg-chart-gain" : "right-1/2 rounded-l-[4px] bg-chart-loss")}
          style={{ width: `${share * 50}%` }}
        />
      )}
    </div>
  );
}
