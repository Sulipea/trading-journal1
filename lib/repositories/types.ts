/**
 * Storage-agnostic repository interfaces.
 *
 * UI and services depend on these, never on Dexie directly, so a future
 * native/Tauri filesystem implementation can be swapped in (spec §2).
 * Implementations must validate entities before writing them.
 */
import type {
  AccountSettings,
  AppSettings,
  EntityId,
  Trade,
  TradeEvent,
} from "@/lib/domain/types";

export interface TradeListOptions {
  /** Include trades that are in the recycle bin. Default false. */
  includeDeleted?: boolean;
}

export interface TradeRepository {
  get(id: EntityId): Promise<Trade | undefined>;
  /** Trades ordered by `openedAt`, newest first. */
  list(options?: TradeListOptions): Promise<Trade[]>;
  /** Closed, non-deleted trades ordered by `closedAt`, oldest first. */
  listClosed(): Promise<Trade[]>;
  save(trade: Trade): Promise<void>;
}

export interface TradeEventRepository {
  /** Events for one trade in chronological order. */
  listForTrade(tradeId: EntityId): Promise<TradeEvent[]>;
  /** Events for several trades, grouped by trade id, each in chronological order. */
  listForTrades(tradeIds: readonly EntityId[]): Promise<Map<EntityId, TradeEvent[]>>;
  save(event: TradeEvent): Promise<void>;
}

export interface SettingsRepository {
  /** Returns stored settings, or defaults if none have been saved yet. */
  getAccount(): Promise<AccountSettings>;
  saveAccount(settings: AccountSettings): Promise<void>;
  getApp(): Promise<AppSettings>;
  saveApp(settings: AppSettings): Promise<void>;
}

export interface JournalRepositories {
  trades: TradeRepository;
  tradeEvents: TradeEventRepository;
  settings: SettingsRepository;
}
