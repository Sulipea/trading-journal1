"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Input, Select } from "@/components/ui/form";
import { WEEKDAY_LABELS } from "@/lib/analytics/dataset";
import { DEFAULT_FILTER, NO_SETUP, activeFilterCount, type AnalyticsFilter, type Grade, type TimeRange } from "@/lib/analytics/filters";
import { INSTRUMENT_ROOTS } from "@/lib/domain/instruments";
import type { SessionOption, Setup } from "@/lib/domain/types";
import { cn } from "@/lib/ui/cn";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "WEEK", label: "This week" },
  { value: "MONTH", label: "This month" },
  { value: "YEAR", label: "This year" },
  { value: "ALL", label: "All time" },
  { value: "CUSTOM", label: "Custom" },
];
const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-ring",
        pressed ? "border-accent bg-accent/15 font-medium text-accent" : "border-border text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Time range + dimension filters, in one row above the charts. */
export function FilterBar({
  filter,
  onChange,
  setups,
  sessions,
  emotions,
}: {
  filter: AnalyticsFilter;
  onChange: (filter: AnalyticsFilter) => void;
  setups: readonly Setup[];
  sessions: readonly SessionOption[];
  emotions: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<AnalyticsFilter>) => onChange({ ...filter, ...patch });
  const active = activeFilterCount(filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Time range" className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={filter.range === r.value}
              onClick={() => set({ range: r.value })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring",
                filter.range === r.value ? "bg-surface-muted font-medium" : "text-muted hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {filter.range === "CUSTOM" && (
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="date"
              aria-label="From"
              value={filter.from ?? ""}
              onChange={(e) => set({ from: e.target.value || null })}
              className="w-40"
            />
            <span className="text-muted">to</span>
            <Input type="date" aria-label="To" value={filter.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} className="w-40" />
          </div>
        )}
        <Button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto">
          <SlidersHorizontal aria-hidden className="size-4" />
          Filters{active > 0 && ` (${active})`}
        </Button>
        {active > 0 && (
          <Button variant="ghost" onClick={() => onChange({ ...DEFAULT_FILTER, range: filter.range, from: filter.from, to: filter.to })}>
            <X aria-hidden className="size-4" />
            Clear filters
          </Button>
        )}
      </div>

      {open && (
        <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-3">
          <Group label="Instrument">
            {INSTRUMENT_ROOTS.map((r) => (
              <Chip key={r} pressed={filter.instruments.includes(r)} onClick={() => set({ instruments: toggle(filter.instruments, r) })}>
                {r}
              </Chip>
            ))}
          </Group>
          <Group label="Direction">
            {(["ALL", "LONG", "SHORT"] as const).map((d) => (
              <Chip key={d} pressed={filter.direction === d} onClick={() => set({ direction: d })}>
                {d === "ALL" ? "Both" : d === "LONG" ? "Long" : "Short"}
              </Chip>
            ))}
          </Group>
          <Group label="Rule adherence">
            {(["ALL", "CLEAN", "VIOLATED"] as const).map((r) => (
              <Chip key={r} pressed={filter.ruleAdherence === r} onClick={() => set({ ruleAdherence: r })}>
                {r === "ALL" ? "Any" : r === "CLEAN" ? "No violations" : "With violations"}
              </Chip>
            ))}
          </Group>
          <Group label="Setup">
            {setups.map((s) => (
              <Chip key={s.id} pressed={filter.setupIds.includes(s.id)} onClick={() => set({ setupIds: toggle(filter.setupIds, s.id) })}>
                {s.name}
              </Chip>
            ))}
            <Chip pressed={filter.setupIds.includes(NO_SETUP)} onClick={() => set({ setupIds: toggle(filter.setupIds, NO_SETUP) })}>
              No setup
            </Chip>
          </Group>
          <Group label="Session">
            {sessions.map((s) => (
              <Chip key={s.id} pressed={filter.sessions.includes(s.id)} onClick={() => set({ sessions: toggle(filter.sessions, s.id) })}>
                {s.label}
              </Chip>
            ))}
          </Group>
          <Group label="Day">
            {WEEKDAY_LABELS.map((label, i) => (
              <Chip key={label} pressed={filter.weekdays.includes(i)} onClick={() => set({ weekdays: toggle(filter.weekdays, i) })}>
                {label.slice(0, 3)}
              </Chip>
            ))}
          </Group>
          <Group label="Trade quality">
            {GRADES.map((g) => (
              <Chip key={g} pressed={filter.grades.includes(g)} onClick={() => set({ grades: toggle(filter.grades, g) })}>
                {g}
              </Chip>
            ))}
          </Group>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="filter-emotion">
              Psychology — trades where you felt
            </label>
            <div className="flex flex-wrap gap-1.5">
              {filter.emotions.map((e) => (
                <Chip key={e} pressed onClick={() => set({ emotions: toggle(filter.emotions, e) })}>
                  {e} ×
                </Chip>
              ))}
              <Select
                id="filter-emotion"
                value=""
                onChange={(e) => e.target.value && set({ emotions: toggle(filter.emotions, e.target.value) })}
                className="h-7 w-44 py-0 text-xs"
              >
                <option value="">Add emotion…</option>
                {emotions
                  .filter((e) => !filter.emotions.includes(e))
                  .map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
