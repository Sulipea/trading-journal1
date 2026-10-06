import type { ForecastContent, Setup } from "@/lib/domain/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/ui/cn";
import {
  BIAS_LABELS,
  CONFIDENCE_LABELS,
  GEX_LABELS,
  LEVEL_TYPE_LABELS,
  PRIORITY_LABELS,
  REACTION_LABELS,
  biasTone,
} from "./labels";

const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

function instrumentsText(roots: readonly string[]): string {
  return roots.length === 0 ? "All instruments" : roots.join(", ");
}

/** Read-only display of one forecast revision. */
export function ForecastContentView({ content, setups }: { content: ForecastContent; setups: readonly Setup[] }) {
  const setupName = (id: string) => setups.find((s) => s.id === id)?.name ?? "Unknown setup";
  const levelById = new Map(content.keyLevels.map((l) => [l.id, l]));

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Bias">
          <span className={cn(pill, biasTone(content.bias))}>{BIAS_LABELS[content.bias]}</span>
        </Item>
        <Item label="Confidence">
          {CONFIDENCE_LABELS[content.confidence]}
          {content.confidenceScore !== null && <span className="text-muted"> · {content.confidenceScore}/100</span>}
        </Item>
        <Item label="GEX">
          {content.gexRegime ? GEX_LABELS[content.gexRegime] : "—"}
          {content.gexValue !== null && <span className="font-mono text-muted"> · {content.gexValue}</span>}
        </Item>
        <Item label="Setups">{content.setupIds.length ? content.setupIds.map(setupName).join(", ") : "—"}</Item>
      </dl>

      <div className="grid gap-4 md:grid-cols-2">
        <TextBlock label="Market conditions" text={content.marketConditions}>
          {content.conditionTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {content.conditionTags.map((t) => (
                <span key={t} className={cn(pill, "bg-surface-muted")}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </TextBlock>
        <TextBlock label="Invalidation" text={content.invalidation} />
      </div>
      {content.notes && <TextBlock label="Notes" text={content.notes} />}

      <section>
        <h3 className="text-sm font-semibold">Scenarios ({content.scenarios.length})</h3>
        {content.scenarios.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No scenarios.</p>
        ) : (
          <ul className="mt-2 grid gap-3 lg:grid-cols-2">
            {content.scenarios.map((s) => (
              <li key={s.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {s.title}
                  {s.confidence && <span className={cn(pill, "bg-surface-muted")}>{CONFIDENCE_LABELS[s.confidence]} confidence</span>}
                </p>
                <dl className="mt-2 space-y-1">
                  <Row label="IF">{s.if || "—"}</Row>
                  <Row label="THEN">{s.then || "—"}</Row>
                  <Row label="INVALIDATION">{s.invalidation || "—"}</Row>
                </dl>
                <p className="mt-2 text-xs text-muted">
                  {instrumentsText(s.instruments)}
                  {s.setupIds.length > 0 && ` · ${s.setupIds.map(setupName).join(", ")}`}
                  {s.levelIds.length > 0 &&
                    ` · levels ${s.levelIds.map((id) => levelById.get(id)?.label || formatPrice(levelById.get(id)?.price ?? null)).join(", ")}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold">Key levels ({content.keyLevels.length})</h3>
        {content.keyLevels.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No key levels.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Price</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Level</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Instruments</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Priority</th>
                  <th scope="col" className="py-1.5 font-medium">Expected</th>
                </tr>
              </thead>
              <tbody>
                {[...content.keyLevels]
                  .sort((a, b) => b.price - a.price)
                  .map((l) => (
                    <tr key={l.id} className="border-t border-border align-top">
                      <td className="py-1.5 pr-3 font-mono tabular-nums">
                        {formatPrice(l.price)}
                        {l.priceTo !== null && `–${formatPrice(l.priceTo)}`}
                      </td>
                      <td className="py-1.5 pr-3">
                        {l.label || "—"} <span className="text-xs text-muted">· {LEVEL_TYPE_LABELS[l.type]}</span>
                      </td>
                      <td className="py-1.5 pr-3 text-muted">{instrumentsText(l.instruments)}</td>
                      <td className="py-1.5 pr-3">{PRIORITY_LABELS[l.priority]}</td>
                      <td className="py-1.5">
                        {l.expectedReaction ? REACTION_LABELS[l.expectedReaction] : "—"}
                        {l.expectedNotes && <span className="block text-xs text-muted">{l.expectedNotes}</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 font-mono text-xs text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function TextBlock({ label, text, children }: { label: string; text: string; children?: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs text-muted">{label}</h3>
      <p className="mt-0.5 text-sm whitespace-pre-wrap">{text || "—"}</p>
      {children}
    </div>
  );
}
