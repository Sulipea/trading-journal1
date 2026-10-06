"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button, Field, FormStatus, Input } from "@/components/ui/form";
import { formatMoney, fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { CONTRACT_SPECS, parseContractSymbol, tickValue } from "@/lib/domain/instruments";
import type { Direction } from "@/lib/domain/types";
import { getRepositories } from "@/lib/repositories";
import { createQuickTrade } from "@/lib/services/trades";
import { cn } from "@/lib/ui/cn";
import { errorMessage } from "@/lib/ui/use-journal";

export function QuickEntryForm() {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<Direction>("LONG");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [defaultTime] = useState(() => toDateTimeLocal(new Date().toISOString()));

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
