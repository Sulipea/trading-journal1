"use client";

import { useState } from "react";
import type { DrawdownPoint } from "@/lib/calculations/performance";
import { formatDateTime, formatMoney } from "@/lib/format";
import { compactMoney, linear, niceTicks } from "./scale";
import { useWidth } from "./use-width";

const MARGIN = { left: 64, right: 16 };
const EQUITY_HEIGHT = 200;
const DRAWDOWN_HEIGHT = 88;
const GAP = 20;

/**
 * Equity curve with its drawdown underneath. Two charts sharing the x-axis
 * (trade number) — never two y-scales on one chart. Crosshair + tooltip on
 * hover/focus; a table view is available for every value.
 */
export function EquityChart({ points, timezone }: { points: readonly DrawdownPoint[]; timezone: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  if (points.length < 2) {
    return <p className="text-sm text-muted">Close at least one trade to see the equity curve.</p>;
  }

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = linear([0, points.length - 1], [MARGIN.left, MARGIN.left + innerW]);
  const equities = points.map((p) => p.equity);
  const eqTicks = niceTicks(Math.min(...equities), Math.max(...equities));
  const yEq = linear([eqTicks[0]!, eqTicks.at(-1)!], [EQUITY_HEIGHT - 8, 8]);
  const maxDd = Math.max(...points.map((p) => p.drawdown));
  const ddTicks = niceTicks(0, maxDd || 1, 2);
  const ddTop = EQUITY_HEIGHT + GAP;
  const yDd = linear([0, ddTicks.at(-1)!], [ddTop + 4, ddTop + DRAWDOWN_HEIGHT]);
  const total = EQUITY_HEIGHT + GAP + DRAWDOWN_HEIGHT + 4;

  const equityPath = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${yEq(p.equity)}`).join("");
  const ddLine = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${yDd(p.drawdown)}`).join("");
  const ddArea = `${ddLine}L${x(points.length - 1)},${yDd(0)}L${x(0)},${yDd(0)}Z`;
  const last = points.at(-1)!;
  const current = active !== null ? points[active] : null;

  function pick(clientX: number, rect: DOMRect) {
    const i = Math.round(((clientX - rect.left - MARGIN.left) / (innerW || 1)) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  }

  return (
    <div className="space-y-2">
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={total}
            role="img"
            aria-label={`Equity from ${formatMoney(points[0]!.equity)} to ${formatMoney(last.equity)} over ${points.length - 1} trades; maximum drawdown ${formatMoney(maxDd)}.`}
            tabIndex={0}
            className="touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
              else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? points.length) - 1));
              else if (e.key === "Escape") setActive(null);
              else return;
              e.preventDefault();
            }}
            onBlur={() => setActive(null)}
          >
            {eqTicks.map((t) => (
              <g key={`e${t}`}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yEq(t)} y2={yEq(t)} stroke="var(--chart-grid)" />
                <text x={MARGIN.left - 8} y={yEq(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                  {compactMoney(t)}
                </text>
              </g>
            ))}
            <path d={equityPath} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(points.length - 1)} cy={yEq(last.equity)} r={4} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />

            <text x={MARGIN.left} y={ddTop - 4} className="fill-muted text-[11px]">
              Drawdown
            </text>
            {ddTicks.map((t) => (
              <g key={`d${t}`}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yDd(t)} y2={yDd(t)} stroke="var(--chart-grid)" />
                <text x={MARGIN.left - 8} y={yDd(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                  {t === 0 ? "$0" : compactMoney(-t)}
                </text>
              </g>
            ))}
            <path d={ddArea} fill="var(--chart-loss)" fillOpacity={0.1} />
            <path d={ddLine} fill="none" stroke="var(--chart-loss)" strokeWidth={2} strokeLinejoin="round" />

            {current && active !== null && (
              <g pointerEvents="none">
                <line x1={x(active)} x2={x(active)} y1={4} y2={total} stroke="var(--muted)" strokeOpacity={0.5} />
                <circle cx={x(active)} cy={yEq(current.equity)} r={4} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />
                <circle cx={x(active)} cy={yDd(current.drawdown)} r={4} fill="var(--chart-loss)" stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {current && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(x(active) + 12, 0), Math.max(0, width - 190)),
            }}
          >
            <p className="font-mono text-sm font-semibold tabular-nums">{formatMoney(current.equity)}</p>
            <p className="text-muted">equity · {active === 0 ? "start" : `after trade ${active}`}</p>
            {current.drawdown > 0 && <p className="mt-1 font-mono tabular-nums">−{formatMoney(current.drawdown)} <span className="font-sans text-muted">drawdown</span></p>}
            {current.at && <p className="mt-1 text-muted">{formatDateTime(current.at, timezone)}</p>}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowTable((s) => !s)}
        className="text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        aria-expanded={showTable}
      >
        {showTable ? "Hide table" : "Show as table"}
      </button>
      {showTable && (
        <div className="max-h-64 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface text-left text-muted">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">Trade</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Closed</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Equity</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Drawdown</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {points.map((p, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1">{i === 0 ? "Start" : i}</td>
                  <td className="px-3 py-1">{p.at ? formatDateTime(p.at, timezone) : "—"}</td>
                  <td className="px-3 py-1 text-right font-mono">{formatMoney(p.equity)}</td>
                  <td className="px-3 py-1 text-right font-mono">{p.drawdown ? `−${formatMoney(p.drawdown)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
