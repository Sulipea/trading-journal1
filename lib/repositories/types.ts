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
  Asset,
  ChangeHistory,
  EntityId,
  PsychologyEntry,
  ScreenshotAnnotationVersion,
  Trade,
  TradeEvent,
  TradeScreenshot,
  TrashItem,
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
  delete(id: EntityId): Promise<void>;
}

export interface TradeEventRepository {
  get(id: EntityId): Promise<TradeEvent | undefined>;
  /** Events for one trade in chronological order. */
  listForTrade(tradeId: EntityId): Promise<TradeEvent[]>;
  /** Events for several trades, grouped by trade id, each in chronological order. */
  listForTrades(tradeIds: readonly EntityId[]): Promise<Map<EntityId, TradeEvent[]>>;
  save(event: TradeEvent): Promise<void>;
  delete(id: EntityId): Promise<void>;
  deleteForTrade(tradeId: EntityId): Promise<void>;
}

export interface PsychologyRepository {
  listForTrade(tradeId: EntityId): Promise<PsychologyEntry[]>;
  save(entry: PsychologyEntry): Promise<void>;
  deleteForTrade(tradeId: EntityId): Promise<void>;
}

export interface ScreenshotRepository {
  get(id: EntityId): Promise<TradeScreenshot | undefined>;
  /** Screenshots for a trade, oldest first. */
  listForTrade(tradeId: EntityId): Promise<TradeScreenshot[]>;
  save(screenshot: TradeScreenshot): Promise<void>;
  delete(id: EntityId): Promise<void>;
  /** Annotation versions for a screenshot, oldest first. */
  listVersions(screenshotId: EntityId): Promise<ScreenshotAnnotationVersion[]>;
  saveVersion(version: ScreenshotAnnotationVersion): Promise<void>;
  deleteVersionsForScreenshot(screenshotId: EntityId): Promise<void>;
}

/** Local binary storage for images. Kept separate so it can move to OPFS later. */
export interface AssetStore {
  get(id: EntityId): Promise<Asset | undefined>;
  put(asset: Asset): Promise<void>;
  delete(ids: readonly EntityId[]): Promise<void>;
}

export interface ChangeHistoryRepository {
  add(entries: readonly ChangeHistory[]): Promise<void>;
  /** Changes for one entity, newest first. */
  listForEntity(entityType: string, entityId: EntityId): Promise<ChangeHistory[]>;
  deleteForEntity(entityType: string, entityId: EntityId): Promise<void>;
}

export interface TrashRepository {
  /** Trash items, most recently deleted first. */
  list(): Promise<TrashItem[]>;
  save(item: TrashItem): Promise<void>;
  deleteForEntity(entityId: EntityId): Promise<void>;
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
  psychology: PsychologyRepository;
  screenshots: ScreenshotRepository;
  assets: AssetStore;
  changeHistory: ChangeHistoryRepository;
  trash: TrashRepository;
  settings: SettingsRepository;
  /**
   * Run `work` atomically: either every write inside it is stored or none is.
   * Only await repository calls inside `work`.
   */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
