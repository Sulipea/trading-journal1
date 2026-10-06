/**
 * Trade lifecycle and editing rules (spec §6, §8, §14, §15).
 *
 * Every mutation runs in a transaction, records change history and keeps
 * the invariants: fills never exit more than was entered, locked fields on
 * closed trades are only editable after a manual unlock, and a closed trade
 * is always flat and complete.
 */
import { FillSequenceError, summarizeFills } from "@/lib/calculations/trade";
import { newId, nowIso } from "@/lib/domain/ids";
import { CONTRACT_SPECS, parseContractSymbol } from "@/lib/domain/instruments";
import type {
  AppSettings,
  ChangeHistory,
  Direction,
  EntityId,
  PsychologyEntry,
  PsychologyPhase,
  RequirableField,
  Trade,
  TradeEvent,
  TradeEventType,
  TradeScreenshot,
  TrashItem,
} from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { checkCloseReadiness, type CloseReadiness } from "./close-validation";
import { computeTradeMetrics, type TradeMetrics } from "./trade-metrics";

export const TRADE_ENTITY = "trade";

export type TradeErrorCode =
  | "NOT_FOUND"
  | "INVALID_SYMBOL"
  | "LOCKED"
  | "IN_TRASH"
  | "NOT_IN_TRASH"
  | "INVALID_FILLS"
  | "INCOMPLETE"
  | "NOT_CLOSED";

export class TradeServiceError extends Error {
  override name = "TradeServiceError";
  constructor(
    message: string,
    readonly code: TradeErrorCode,
    /** Fields still missing, for `INCOMPLETE`. */
    readonly missing: readonly RequirableField[] = [],
  ) {
    super(message);
  }
}

/** Fields that lock when a trade closes (spec §14). Fills lock too. */
export const LOCKED_FIELDS = [
  "symbol",
  "direction",
  "plannedEntry",
  "plannedStop",
  "plannedTarget",
  "plannedContracts",
  "finalStop",
  "finalTarget",
  "fees",
  "openedAt",
] as const satisfies readonly (keyof Trade)[];

export type EditableTradeFields = Pick<
  Trade,
  | (typeof LOCKED_FIELDS)[number]
  | "session"
  | "marketConditions"
  | "reasoning"
  | "executionNotes"
  | "executionRating"
  | "notes"
>;
export type TradePatch = Partial<EditableTradeFields>;

export interface QuickTradeInput {
  symbol: string;
  direction: Direction;
  entryPrice: number;
  contracts: number;
  /** When the entry was filled. */
  timestamp: string;
}

export interface FillInput {
  type: TradeEventType;
  price: number;
  quantity: number;
  timestamp: string;
  reason: string;
  notes: string;
}

export interface PsychologyInput {
  emotions: string[];
  ratings: Record<string, number>;
  text: string;
}

// ── helpers ──────────────────────────────────────────────────────────────

export function isLocked(trade: Trade): boolean {
  return trade.status === "CLOSED" && !trade.unlocked;
}

function change(trade: Trade, field: string, oldValue: unknown, newValue: unknown, now: string): ChangeHistory {
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    entityType: TRADE_ENTITY,
    entityId: trade.id,
    field,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    changedAt: now,
  };
}

function fillSnapshot(event: TradeEvent) {
  const { type, price, quantity, timestamp, reason, notes } = event;
  return { type, price, quantity, timestamp, reason, notes };
}

/** Marks an open trade as updated (OPEN -> UPDATED) and bumps `updatedAt`. */
function touched(trade: Trade, now: string): Trade {
  return { ...trade, status: trade.status === "OPEN" ? "UPDATED" : trade.status, updatedAt: now };
}

async function loadTrade(repos: JournalRepositories, id: EntityId): Promise<Trade> {
  const trade = await repos.trades.get(id);
  if (!trade) throw new TradeServiceError("Trade not found.", "NOT_FOUND");
  return trade;
}

async function loadActiveTrade(repos: JournalRepositories, id: EntityId): Promise<Trade> {
  const trade = await loadTrade(repos, id);
  if (trade.deletedAt !== null) {
    throw new TradeServiceError("This trade is in the trash. Restore it to edit.", "IN_TRASH");
  }
  return trade;
}

function assertFillsValid(trade: Trade, events: readonly TradeEvent[]): void {
  try {
    const summary = summarizeFills(events, trade.direction, CONTRACT_SPECS[trade.root], trade.fees);
    if (trade.status === "CLOSED" && !summary.isFlat) {
      throw new TradeServiceError(
        "A closed trade must stay flat: total exits must equal total entries.",
        "INVALID_FILLS",
      );
    }
  } catch (error) {
    if (error instanceof FillSequenceError) {
      throw new TradeServiceError(
        "That exit would close more contracts than are open at that time.",
        "INVALID_FILLS",
      );
    }
    throw error;
  }
}

async function readinessFor(
  repos: JournalRepositories,
  trade: Trade,
  overrides: { events?: readonly TradeEvent[]; psychology?: readonly PsychologyEntry[] } = {},
): Promise<CloseReadiness> {
  const [events, psychology, screenshots, settings] = await Promise.all([
    overrides.events ?? repos.tradeEvents.listForTrade(trade.id),
    overrides.psychology ?? repos.psychology.listForTrade(trade.id),
    repos.screenshots.listForTrade(trade.id),
    repos.settings.getApp(),
  ]);
  return checkCloseReadiness({
    trade,
    events,
    psychology,
    screenshotCount: screenshots.length,
    requiredFields: settings.requiredFields,
  });
}

/** A closed trade must remain complete after any edit (spec §6). */
async function assertStillComplete(
  repos: JournalRepositories,
  trade: Trade,
  overrides?: Parameters<typeof readinessFor>[2],
): Promise<void> {
  if (trade.status !== "CLOSED") return;
  const readiness = await readinessFor(repos, trade, overrides);
  if (readiness.missing.length > 0) {
    throw new TradeServiceError(
      "Closed trades must stay complete. Fill in the required fields or leave them unchanged.",
      "INCOMPLETE",
      readiness.missing,
    );
  }
}

function assertUnlocked(trade: Trade, what: string): void {
  if (isLocked(trade)) {
    throw new TradeServiceError(`${what} is locked on closed trades. Unlock the trade to edit it.`, "LOCKED");
  }
}

// ── creation & fills ─────────────────────────────────────────────────────

/** Quick entry (spec §6): symbol, direction, entry price and contracts only. */
export async function createQuickTrade(
  repos: JournalRepositories,
  input: QuickTradeInput,
  now: string = nowIso(),
): Promise<Trade> {
  const parsed = parseContractSymbol(input.symbol);
  if (!parsed) {
    throw new TradeServiceError(
      "Enter a supported contract symbol, e.g. ESZ6, MESZ6, NQZ6 or MNQZ6.",
      "INVALID_SYMBOL",
    );
  }

  const trade: Trade = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    status: "OPEN",
    symbol: parsed.symbol,
    root: parsed.root,
    direction: input.direction,
    session: null,
    marketConditions: "",
    reasoning: "",
    plannedEntry: input.entryPrice,
    plannedStop: null,
    plannedTarget: null,
    plannedContracts: input.contracts,
    finalStop: null,
    finalTarget: null,
    fees: 0,
    executionNotes: "",
    executionRating: null,
    notes: "",
    openedAt: input.timestamp,
    closedAt: null,
    unlocked: false,
    deletedAt: null,
  };
  const entry: TradeEvent = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    tradeId: trade.id,
    type: "ENTRY",
    price: input.entryPrice,
    quantity: input.contracts,
    timestamp: input.timestamp,
    reason: "Initial entry",
    notes: "",
  };

  await repos.transaction(async () => {
    await repos.trades.save(trade);
    await repos.tradeEvents.save(entry);
  });
  return trade;
}

export async function addFill(
  repos: JournalRepositories,
  tradeId: EntityId,
  input: FillInput,
  now: string = nowIso(),
): Promise<TradeEvent> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    assertUnlocked(trade, "Fills");
    const event: TradeEvent = { id: newId(), createdAt: now, updatedAt: now, tradeId, ...input };
    const events = [...(await repos.tradeEvents.listForTrade(tradeId)), event];
    assertFillsValid(trade, events);

    await repos.tradeEvents.save(event);
    await repos.trades.save(touched(trade, now));
    await repos.changeHistory.add([change(trade, "fill.added", null, fillSnapshot(event), now)]);
    return event;
  });
}

export async function updateFill(
  repos: JournalRepositories,
  eventId: EntityId,
  patch: Partial<FillInput>,
  now: string = nowIso(),
): Promise<TradeEvent> {
  return repos.transaction(async () => {
    const existing = await repos.tradeEvents.get(eventId);
    if (!existing) throw new TradeServiceError("Fill not found.", "NOT_FOUND");
    const trade = await loadActiveTrade(repos, existing.tradeId);
    assertUnlocked(trade, "Fills");

    const updated: TradeEvent = { ...existing, ...patch, updatedAt: now };
    const events = (await repos.tradeEvents.listForTrade(trade.id)).map((e) =>
      e.id === eventId ? updated : e,
    );
    assertFillsValid(trade, events);

    await repos.tradeEvents.save(updated);
    await repos.trades.save(touched(trade, now));
    await repos.changeHistory.add([
      change(trade, "fill.updated", fillSnapshot(existing), fillSnapshot(updated), now),
    ]);
    return updated;
  });
}

export async function deleteFill(
  repos: JournalRepositories,
  eventId: EntityId,
  now: string = nowIso(),
): Promise<void> {
  await repos.transaction(async () => {
    const existing = await repos.tradeEvents.get(eventId);
    if (!existing) throw new TradeServiceError("Fill not found.", "NOT_FOUND");
    const trade = await loadActiveTrade(repos, existing.tradeId);
    assertUnlocked(trade, "Fills");

    const events = (await repos.tradeEvents.listForTrade(trade.id)).filter((e) => e.id !== eventId);
    if (!events.some((e) => e.type === "ENTRY")) {
      throw new TradeServiceError("A trade must keep at least one entry.", "INVALID_FILLS");
    }
    assertFillsValid(trade, events);

    await repos.tradeEvents.delete(eventId);
    await repos.trades.save(touched(trade, now));
    await repos.changeHistory.add([change(trade, "fill.deleted", fillSnapshot(existing), null, now)]);
  });
}

// ── editing ──────────────────────────────────────────────────────────────

export async function updateTrade(
  repos: JournalRepositories,
  tradeId: EntityId,
  patch: TradePatch,
  now: string = nowIso(),
): Promise<Trade> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);

    const changed = (Object.keys(patch) as (keyof TradePatch)[]).filter(
      (field) => patch[field] !== undefined && patch[field] !== trade[field],
    );
    if (changed.length === 0) return trade;

    const lockedChange = changed.find((f) => (LOCKED_FIELDS as readonly string[]).includes(f));
    if (lockedChange) assertUnlocked(trade, "This field");

    let next: Trade = { ...touched(trade, now) };
    for (const field of changed) next = { ...next, [field]: patch[field] };
    if (patch.symbol !== undefined && patch.symbol !== trade.symbol) {
      const parsed = parseContractSymbol(patch.symbol);
      if (!parsed) {
        throw new TradeServiceError("Enter a supported contract symbol, e.g. ESZ6.", "INVALID_SYMBOL");
      }
      next = { ...next, symbol: parsed.symbol, root: parsed.root };
    }
    if (changed.includes("direction") || changed.includes("symbol")) {
      assertFillsValid(next, await repos.tradeEvents.listForTrade(tradeId));
    }
    await assertStillComplete(repos, next);

    await repos.trades.save(next);
    await repos.changeHistory.add(changed.map((f) => change(trade, f, trade[f], next[f], now)));
    return next;
  });
}

export async function savePsychology(
  repos: JournalRepositories,
  tradeId: EntityId,
  phase: PsychologyPhase,
  input: PsychologyInput,
  now: string = nowIso(),
): Promise<PsychologyEntry> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    const entries = await repos.psychology.listForTrade(tradeId);
    const existing = entries.find((e) => e.phase === phase);

    const entry: PsychologyEntry = existing
      ? { ...existing, ...input, updatedAt: now }
      : { id: newId(), createdAt: now, updatedAt: now, tradeId, phase, ...input };

    const next = touched(trade, now);
    await assertStillComplete(repos, next, {
      psychology: [...entries.filter((e) => e.phase !== phase), entry],
    });

    await repos.psychology.save(entry);
    await repos.trades.save(next);
    await repos.changeHistory.add([
      change(
        trade,
        `psychology.${phase}`,
        existing ? { emotions: existing.emotions, ratings: existing.ratings, text: existing.text } : null,
        input,
        now,
      ),
    ]);
    return entry;
  });
}

// ── lifecycle ────────────────────────────────────────────────────────────

/** Close a flat, complete trade. Close time is the final exit's time. */
export async function closeTrade(
  repos: JournalRepositories,
  tradeId: EntityId,
  now: string = nowIso(),
): Promise<Trade> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    if (trade.status === "CLOSED") return trade;

    const events = await repos.tradeEvents.listForTrade(tradeId);
    const readiness = await readinessFor(repos, trade, { events });
    if (!readiness.canClose) {
      const message = !readiness.positionFlat
        ? "Exit every open contract before closing the trade."
        : "Complete the required fields before closing the trade.";
      throw new TradeServiceError(message, "INCOMPLETE", readiness.missing);
    }

    const finalExit = events.filter((e) => e.type === "EXIT").at(-1)!;
    const closed: Trade = {
      ...trade,
      status: "CLOSED",
      closedAt: finalExit.timestamp,
      unlocked: false,
      updatedAt: now,
    };
    await repos.trades.save(closed);
    await repos.changeHistory.add([change(trade, "status", trade.status, "CLOSED", now)]);
    return closed;
  });
}

/** Manually unlock (or re-lock) a closed trade's locked fields (spec §14). */
export async function setUnlocked(
  repos: JournalRepositories,
  tradeId: EntityId,
  unlocked: boolean,
  now: string = nowIso(),
): Promise<Trade> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    if (trade.status !== "CLOSED") {
      throw new TradeServiceError("Only closed trades can be locked or unlocked.", "NOT_CLOSED");
    }
    if (trade.unlocked === unlocked) return trade;
    const next: Trade = { ...trade, unlocked, updatedAt: now };
    await repos.trades.save(next);
    await repos.changeHistory.add([change(trade, "unlocked", trade.unlocked, unlocked, now)]);
    return next;
  });
}

// ── trash ────────────────────────────────────────────────────────────────

export async function moveToTrash(
  repos: JournalRepositories,
  tradeId: EntityId,
  now: string = nowIso(),
): Promise<void> {
  await repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    const item: TrashItem = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      entityType: TRADE_ENTITY,
      entityId: tradeId,
      deletedAt: now,
    };
    await repos.trades.save({ ...trade, deletedAt: now, updatedAt: now });
    await repos.trash.save(item);
    await repos.changeHistory.add([change(trade, "deletedAt", null, now, now)]);
  });
}

export async function restoreFromTrash(
  repos: JournalRepositories,
  tradeId: EntityId,
  now: string = nowIso(),
): Promise<void> {
  await repos.transaction(async () => {
    const trade = await loadTrade(repos, tradeId);
    if (trade.deletedAt === null) {
      throw new TradeServiceError("This trade is not in the trash.", "NOT_IN_TRASH");
    }
    await repos.trades.save({ ...trade, deletedAt: null, updatedAt: now });
    await repos.trash.deleteForEntity(tradeId);
    await repos.changeHistory.add([change(trade, "deletedAt", trade.deletedAt, null, now)]);
  });
}

/**
 * Permanently delete a trashed trade and everything attached to it.
 * The UI must obtain a second, explicit confirmation before calling this.
 */
export async function permanentlyDelete(repos: JournalRepositories, tradeId: EntityId): Promise<void> {
  await repos.transaction(async () => {
    const trade = await loadTrade(repos, tradeId);
    if (trade.deletedAt === null) {
      throw new TradeServiceError("Move the trade to the trash before deleting it permanently.", "NOT_IN_TRASH");
    }
    const screenshots = await repos.screenshots.listForTrade(tradeId);
    for (const shot of screenshots) {
      await repos.screenshots.deleteVersionsForScreenshot(shot.id);
      await repos.screenshots.delete(shot.id);
    }
    await repos.assets.delete(screenshots.flatMap((s) => [s.assetId, s.thumbnailAssetId]));
    await repos.tradeEvents.deleteForTrade(tradeId);
    await repos.psychology.deleteForTrade(tradeId);
    await repos.changeHistory.deleteForEntity(TRADE_ENTITY, tradeId);
    await repos.trash.deleteForEntity(tradeId);
    await repos.trades.delete(tradeId);
  });
}

// ── reads ────────────────────────────────────────────────────────────────

export interface TradeWorkspace {
  trade: Trade;
  events: TradeEvent[];
  psychology: PsychologyEntry[];
  screenshots: TradeScreenshot[];
  history: ChangeHistory[];
  settings: AppSettings;
  readiness: CloseReadiness;
  metrics: TradeMetrics;
}

/** Everything the trade workspace shows, loaded in one call. */
export async function loadTradeWorkspace(
  repos: JournalRepositories,
  tradeId: EntityId,
): Promise<TradeWorkspace> {
  const trade = await loadTrade(repos, tradeId);
  const [events, psychology, screenshots, history, settings] = await Promise.all([
    repos.tradeEvents.listForTrade(tradeId),
    repos.psychology.listForTrade(tradeId),
    repos.screenshots.listForTrade(tradeId),
    repos.changeHistory.listForEntity(TRADE_ENTITY, tradeId),
    repos.settings.getApp(),
  ]);
  return {
    trade,
    events,
    psychology,
    screenshots,
    history,
    settings,
    readiness: checkCloseReadiness({
      trade,
      events,
      psychology,
      screenshotCount: screenshots.length,
      requiredFields: settings.requiredFields,
    }),
    metrics: computeTradeMetrics(trade, events),
  };
}

export interface TradeListRow {
  trade: Trade;
  metrics: TradeMetrics;
}

export async function listTradeRows(
  repos: JournalRepositories,
  options: { deleted?: boolean } = {},
): Promise<TradeListRow[]> {
  const all = await repos.trades.list({ includeDeleted: options.deleted });
  const trades = options.deleted ? all.filter((t) => t.deletedAt !== null) : all;
  const events = await repos.tradeEvents.listForTrades(trades.map((t) => t.id));
  return trades.map((trade) => ({ trade, metrics: computeTradeMetrics(trade, events.get(trade.id) ?? []) }));
}
