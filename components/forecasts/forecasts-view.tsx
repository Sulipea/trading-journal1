"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { AlertTriangle, Lock, Plus } from "lucide-react";
import { SampleSize } from "@/components/analytics/group-stats";
import { SignedValue } from "@/components/trades/badges";
import { Card } from "@/components/ui/card";
import { Button, FormStatus, Input, buttonClass } from "@/components/ui/form";
import type { CalibrationGroup, RateGroup } from "@/lib/analytics/forecast";
import { MIN_CALIBRATION_SAMPLE } from "@/lib/analytics/forecast";
import { formatMoney, formatPercent } from "@/lib/format";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { loadForecastsOverview, type ForecastsOverview } from "@/lib/services/forecast-views";
import { createForecast } from "@/lib/services/forecasts";
import { cn } from "@/lib/ui/cn";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import {
  ADHERENCE_LABELS,
  BIAS_LABELS,
  CONFIDENCE_LABELS,
  LEVEL_TYPE_LABELS,
  REACTION_LABELS,
  biasCorrectText,
  biasTone,
  formatTradingDate,
} from "./labels";

export function ForecastsView() {
  const load = useCallback((repos: JournalRepositories) => loadForecastsOverview(repos), []);
  const query = useJournalQuery(load);
  if (query.status === "loading") return <p className="text-sm text-muted">Loading forecasts…</p>;
  if (query.status === "error") {
    return (
      <Card role="alert">
        <p className="font-medium">Forecasts could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{query.error.message}</p>
      </Card>
    );
  }
  return <Overview data={query.data} />;
}

function Overview({ data }: { data: ForecastsOverview }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function create(date: string) {
    setError(null);
    try {
      const forecast = await createForecast(getRepositories(), date);
      router.push(`/forecasts/${forecast.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function onCreateOther(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = String(new FormData(event.currentTarget).get("date") ?? "");
    if (date) void create(date);
  }

  return (
    <div className="animate-in space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Today · {formatTradingDate(data.today)}</h2>
          <p className="text-sm text-muted">
            {data.todayForecast
              ? data.todayForecast.status === "DRAFT"
                ? "Draft in progress — finalize it before the open."
                : "Forecast is final."
              : "No forecast yet for today."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data.todayForecast ? (
            <Link href={`/forecasts/${data.todayForecast.id}`} className={buttonClass("primary")}>
              Open today&apos;s forecast
            </Link>
          ) : (
            <Button variant="primary" onClick={() => create(data.today)}>
              <Plus aria-hidden className="size-4" />
              Create today&apos;s forecast
            </Button>
          )}
          <form onSubmit={onCreateOther} className="flex items-center gap-2">
            <Input type="date" name="date" aria-label="Forecast date" required className="w-40" />
            <Button type="submit">For another day</Button>
          </form>
        </div>
        <FormStatus status={error ? { kind: "error", message: error } : null} />
      </Card>

      {data.items.length > 0 && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Forecasts, newest first</caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Day</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Bias</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Confidence</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Revisions</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Bias call</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Trades</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.forecast.id} className="border-b border-border last:border-0 hover:bg-surface-muted/60">
                  <td className="px-5 py-2.5">
                    <Link href={`/forecasts/${item.forecast.id}`} className="font-medium hover:underline">
                      {formatTradingDate(item.forecast.date)}
                    </Link>
                    <span className="ml-2 text-xs text-muted">
                      {item.forecast.status === "DRAFT" ? "Draft" : ""}
                      {item.locked && <Lock aria-label="Locked" className="ml-1 inline size-3" />}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", biasTone(item.active.content.bias))}>
                      {BIAS_LABELS[item.active.content.bias]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{CONFIDENCE_LABELS[item.active.content.confidence]}</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums">{item.revisionCount}</td>
                  <td className="px-3 py-2.5">{item.accuracy ? biasCorrectText(item.accuracy.finalBiasCorrect) : "Not reviewed"}</td>
                  <td className="px-5 py-2.5">
                    {item.linkedTrades}
                    {item.deviations > 0 && <span className="ml-1 text-xs text-negative">({item.deviations} deviation{item.deviations === 1 ? "" : "s"})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Analytics data={data} />
    </div>
  );
}

function Rate({ group, suffix }: { group: RateGroup; suffix?: string }) {
  return (
    <span>
      <span className="font-mono tabular-nums">{formatPercent(group.rate, 0)}</span>
      {suffix && <span className="text-muted"> {suffix}</span>}
      <span className="ml-1 text-xs text-muted">
        n={group.count}
        {group.smallSample && group.count > 0 && " · small sample"}
      </span>
    </span>
  );
}

const VERDICT_TEXT: Record<NonNullable<CalibrationGroup["verdict"]>, string> = {
  OVERCONFIDENT: "Overconfident",
  UNDERCONFIDENT: "Underconfident",
  CALIBRATED: "Well calibrated",
};

function CalibrationTable({ groups, caption }: { groups: CalibrationGroup[]; caption: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-1 text-left text-xs font-medium text-muted">{caption}</caption>
      <tbody>
        {groups.map((g) => (
          <tr key={g.key} className="border-t border-border">
            <th scope="row" className="py-1.5 text-left font-normal">{g.label}</th>
            <td className="py-1.5">
              <Rate group={g} />
            </td>
            <td className="py-1.5 text-xs text-muted">expected ≈{formatPercent(g.expected, 0)}</td>
            <td
              className={cn(
                "py-1.5 text-right text-xs font-medium",
                g.verdict === "OVERCONFIDENT" && "text-negative",
                g.verdict === "UNDERCONFIDENT" && "text-accent",
                g.verdict === "CALIBRATED" && "text-positive",
              )}
            >
              {g.verdict ? VERDICT_TEXT[g.verdict] : g.count > 0 ? "Need more data" : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Analytics({ data }: { data: ForecastsOverview }) {
  const a = data.analytics;
  const e = data.execution;
  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Forecast accuracy</h2>
            <p className="text-xs text-muted">From {a.reviewedCount} reviewed forecast{a.reviewedCount === 1 ? "" : "s"}.</p>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Bias called correctly</dt>
              <dd><Rate group={a.biasAccuracy} /></dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Triggered scenarios that played out</dt>
              <dd><Rate group={a.scenarioHitRate} /></dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Revisions</dt>
              <dd>
                {a.revisions.improved} improved · {a.revisions.worsened} worsened · {a.revisions.unchanged} unchanged
              </dd>
            </div>
          </dl>
          <CalibrationTable groups={a.calibrationByConfidence} caption="Calibration by forecast confidence" />
          {a.scoreCalibration.count > 0 && (
            <p className="text-sm">
              Numeric confidence averages{" "}
              <span className="font-mono">{Math.round(a.scoreCalibration.meanScore ?? 0)}</span>, actual accuracy{" "}
              <span className="font-mono">{formatPercent(a.scoreCalibration.accuracy, 0)}</span>
              <span className="text-xs text-muted"> (n={a.scoreCalibration.count}{a.scoreCalibration.smallSample ? " · small sample" : ""})</span>
            </p>
          )}
          <CalibrationTable groups={a.calibrationByScenario} caption="Calibration by scenario confidence" />
          <p className="text-xs text-muted">
            Calibration verdicts appear after {MIN_CALIBRATION_SAMPLE} reviewed examples in a group.
          </p>
        </Card>

        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Execution against forecasts</h2>
            <p className="text-xs text-muted">How you traded relative to your forecasts — separate from accuracy.</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {(["YES", "PARTIAL", "NO", "UNPLANNED"] as const).map((k) => (
                <tr key={k} className="border-t border-border">
                  <th scope="row" className="py-1.5 text-left font-normal">{ADHERENCE_LABELS[k]}</th>
                  <td className="py-1.5 text-right">
                    <SignedValue value={e.byAdherence[k].netPnl}>
                      {e.byAdherence[k].count ? formatMoney(e.byAdherence[k].netPnl, { signed: true }) : "—"}
                    </SignedValue>
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    <SampleSize stats={e.byAdherence[k]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">
            Planned{" "}
            <SignedValue value={e.planned.expectancy}>
              {e.planned.expectancy === null ? "—" : formatMoney(e.planned.expectancy, { signed: true })}
            </SignedValue>{" "}
            per trade vs unplanned{" "}
            <SignedValue value={e.unplanned.expectancy}>
              {e.unplanned.expectancy === null ? "—" : formatMoney(e.unplanned.expectancy, { signed: true })}
            </SignedValue>{" "}
            per trade.
          </p>
          {e.unlinked > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-negative">
              <AlertTriangle aria-hidden className="size-3.5" />
              {e.unlinked} closed trade{e.unlinked === 1 ? " isn't" : "s aren't"} linked to a forecast or marked unplanned.
            </p>
          )}
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">Bias accuracy by setup and condition</h2>
          <RateList title="Setups in the forecast" groups={a.accuracyBySetup} />
          <RateList title="Condition tags" groups={a.accuracyByCondition} />
        </Card>
        <Card className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Key levels over time</h2>
            <p className="text-xs text-muted">How price reacted at each level type (final revisions).</p>
          </div>
          {data.levels.length === 0 ? (
            <p className="text-sm text-muted">No key levels yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1.5 font-medium">Type</th>
                  <th scope="col" className="py-1.5 font-medium">Touched</th>
                  <th scope="col" className="py-1.5 font-medium">Outcomes</th>
                  <th scope="col" className="py-1.5 text-right font-medium">As expected</th>
                </tr>
              </thead>
              <tbody>
                {data.levels.map((l) => (
                  <tr key={l.type} className="border-t border-border align-top">
                    <td className="py-1.5">{LEVEL_TYPE_LABELS[l.type]}</td>
                    <td className="py-1.5 font-mono tabular-nums">
                      {l.touched}/{l.levels}
                    </td>
                    <td className="py-1.5 text-xs">
                      {(Object.keys(l.outcomes) as (keyof typeof l.outcomes)[])
                        .filter((k) => l.outcomes[k] > 0)
                        .map((k) => `${REACTION_LABELS[k]} ${l.outcomes[k]}`)
                        .join(" · ") || "—"}
                    </td>
                    <td className="py-1.5 text-right text-xs">
                      {l.expectedJudged ? `${l.expectedMatched}/${l.expectedJudged}` : "—"}
                      {l.smallSample && l.touched > 0 && <span className="block text-muted">small sample</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

function RateList({ title, groups }: { title: string; groups: RateGroup[] }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-muted">{title}</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted">No reviewed forecasts yet.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {groups.map((g) => (
            <li key={g.key} className="flex justify-between gap-3">
              <span className="capitalize">{g.label}</span>
              <Rate group={g} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
