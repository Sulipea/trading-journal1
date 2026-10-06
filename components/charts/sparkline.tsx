"use client";

import { linear } from "./scale";
import { useWidth } from "./use-width";

/** A small trend line with an end dot. Decorative: callers state the values in text. */
export function Sparkline({ values, height = 40 }: { values: readonly number[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = linear([0, values.length - 1], [4, Math.max(4, width - 4)]);
  const y = linear([min, max === min ? min + 1 : max], [height - 4, 4]);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  return (
    <div ref={ref} aria-hidden>
      {width > 0 && (
        <svg width={width} height={height}>
          <path d={d} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r={4} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}
