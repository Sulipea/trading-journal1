"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button, Field, FormStatus, Input, Select } from "@/components/ui/form";
import { formatMoney, fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { CONTRACT_SPECS, parseContractSymbol, tickValue } from "@/lib/domain/instruments";
import { VIX_DIRECTION_LABELS } from "@/lib/domain/defaults";
import type { Direction, VixDirection } from "@/lib/domain/types";
import { newTradeReminders } from "@/lib/domain/reminders";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { createQuickTrade } from "@/lib/services/trades";
import { cn } from "@/lib/ui/cn";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";

export function QuickEntryForm() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<Direction>("LONG");
  const [newsDay, setNewsDay] = useState<"" | "yes" | "no">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [defaultTime] = useState(() => toDateTimeLocal(new Date().toISOString()));
  const loadReminders = useCallback(
    async (repos: JournalRepositories) => newTradeReminders((await repos.settings.getApp()).reminders),
    [],
  );
  const reminders = useJournalQuery(loadReminders);

  const parsed = symbol ? parseContractSymbol(symbol) : null;
  const spec = parsed ? CONTRACT_SPECS[parsed.root] : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const timestamp = fromDateTimeLocal(String(form.get("time")));
    if (!timestamp) {
      setError("Enter a valid entry time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trade = await createQuickTrade(getRepositories(), {
        symbol,
        direction,
        entryPrice: Number(form.get("entryPrice")),
        contracts: Number(form.get("contracts")),
        timestamp,
        newsDay: newsDay === "" ? null : newsDay === "yes",
        newsEvent: String(form.get("newsEvent") ?? ""),
        vixLevel: String(form.get("vixLevel") ?? "").trim() === "" ? null : Number(form.get("vixLevel")),
        vixDirection: (String(form.get("vixDirection") ?? "") || null) as VixDirection | null,
      });
      router.push(`/trades/${trade.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card className="animate-in max-w-xl">
      <h2 className="text-base font-semibold">Quick entry</h2>
      <p className="mt-1 text-sm text-muted">
        Log the essentials now. Everything else can be completed in the trade workspace before you close it.
      </p>
      {reminders.status === "ready" &&
        reminders.data.map((r) => (
          <p key={r.id} className="mt-3 flex items-start gap-2 rounded-md bg-accent/8 px-3 py-2 text-sm">
            <Bell aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            {r.message}
          </p>
        ))}

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <Field
          label="Contract symbol"
          htmlFor="symbol"
          hint={
            spec
              ? `${spec.name} · ${formatMoney(tickValue(spec))} per tick`
              : "Exact contract, e.g. ESZ6, MESZ6, NQZ6, MNQZ6."
          }
          error={symbol && !parsed ? "Not a supported contract symbol." : null}
        >
          <Input
            id="symbol"
            name="symbol"
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            aria-invalid={Boolean(symbol && !parsed)}
            className="font-mono uppercase"
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Direction</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["LONG", "SHORT"] as const).map((d) => (
              <label
                key={d}
                className={cn(
                  "flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                  direction === d
                    ? d === "LONG"
                      ? "border-positive bg-positive/10 text-positive"
                      : "border-negative bg-negative/10 text-negative"
                    : "border-border text-muted hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="direction"
                  value={d}
                  checked={direction === d}
                  onChange={() => setDirection(d)}
                  className="sr-only"
                />
                {d === "LONG" ? "Long" : "Short"}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Entry price" htmlFor="entryPrice">
            <Input
              id="entryPrice"
              name="entryPrice"
              type="number"
              step={spec?.tickSize ?? 0.25}
              min={0}
              required
              className="font-mono"
            />
          </Field>
          <Field label="Contracts" htmlFor="contracts">
            <Input id="contracts" name="contracts" type="number" step={1} min={1} required defaultValue={1} />
          </Field>
        </div>

        <Field label="Entry time" htmlFor="time" hint="Your computer's local time.">
          <Input id="time" name="time" type="datetime-local" step={1} required defaultValue={defaultTime} />
        </Field>

        <fieldset className="space-y-4">
          <legend className="mb-1.5 text-sm font-medium">
            Market context <span className="font-normal text-muted">(optional)</span>
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <Field label="News day" htmlFor="newsDay">
              <Select id="newsDay" value={newsDay} onChange={(e) => setNewsDay(e.target.value as "" | "yes" | "no")}>
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
            {newsDay === "yes" && (
              <Field label="News event" htmlFor="newsEvent" hint="e.g. CPI, FOMC, NFP">
                <Input id="newsEvent" name="newsEvent" maxLength={60} autoComplete="off" />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="VIX at entry" htmlFor="vixLevel">
              <Input id="vixLevel" name="vixLevel" type="number" min={0} step={0.01} inputMode="decimal" />
            </Field>
            <Field label="VIX direction" htmlFor="vixDirection">
              <Select id="vixDirection" name="vixDirection" defaultValue="">
                <option value="">—</option>
                {(Object.keys(VIX_DIRECTION_LABELS) as VixDirection[]).map((v) => (
                  <option key={v} value={v}>
                    {VIX_DIRECTION_LABELS[v]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </fieldset>

        <div className="flex items-center gap-4 pt-2">
          <Button type="submit" variant="primary" disabled={busy || !parsed}>
            {busy ? "Saving…" : "Open trade"}
          </Button>
          <FormStatus status={error ? { kind: "error", message: error } : null} />
        </div>
      </form>
    </Card>
  );
}
