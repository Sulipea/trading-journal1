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
  Forecast,
  ForecastRevision,
  ForecastTradeLink,
  LevelInteraction,
  MarketSnapshot,
  PsychologyEntry,
  Review,
  ReviewFinding,
  ReviewKind,
  Rule,
  RuleCheck,
  RuleGroup,
  ScreenshotAnnotationVersion,
  Setup,
  SetupMergeHistory,
  SetupRule,
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
  /** Every entry in the journal, for analytics. */
  listAll(): Promise<PsychologyEntry[]>;
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

export interface SetupRepository {
  get(id: EntityId): Promise<Setup | undefined>;
  /** All setups, including archived and merged ones, by name. */
  list(): Promise<Setup[]>;
  save(setup: Setup): Promise<void>;
  delete(id: EntityId): Promise<void>;
  /** Checklist links for one setup, in order. */
  listRules(setupId: EntityId): Promise<SetupRule[]>;
  listAllRuleLinks(): Promise<SetupRule[]>;
  /** Replace a setup's checklist with `ruleIds`, in that order. */
  replaceRules(setupId: EntityId, ruleIds: readonly EntityId[], now: string): Promise<void>;
  deleteRuleLinksForRule(ruleId: EntityId): Promise<void>;
  listMergeHistory(): Promise<SetupMergeHistory[]>;
  addMergeHistory(entry: SetupMergeHistory): Promise<void>;
}

export interface RuleRepository {
  get(id: EntityId): Promise<Rule | undefined>;
  /** All rules, including inactive ones, in display order. */
  list(): Promise<Rule[]>;
  save(rule: Rule): Promise<void>;
  delete(id: EntityId): Promise<void>;
  listGroups(): Promise<RuleGroup[]>;
  saveGroup(group: RuleGroup): Promise<void>;
  deleteGroup(id: EntityId): Promise<void>;
}

export interface RuleCheckRepository {
  listForTrade(tradeId: EntityId): Promise<RuleCheck[]>;
  /** Every check in the journal, for analytics. */
  listAll(): Promise<RuleCheck[]>;
  countForRule(ruleId: EntityId): Promise<number>;
  save(check: RuleCheck): Promise<void>;
  delete(id: EntityId): Promise<void>;
  deleteForTrade(tradeId: EntityId): Promise<void>;
}

export interface ForecastRepository {
  get(id: EntityId): Promise<Forecast | undefined>;
  getByDate(date: string): Promise<Forecast | undefined>;
  /** All forecasts, newest day first. */
  list(): Promise<Forecast[]>;
  save(forecast: Forecast): Promise<void>;

  getRevision(id: EntityId): Promise<ForecastRevision | undefined>;
  /** Revisions of one forecast, original first. */
  listRevisions(forecastId: EntityId): Promise<ForecastRevision[]>;
  listAllRevisions(): Promise<ForecastRevision[]>;
  saveRevision(revision: ForecastRevision): Promise<void>;

  /** Snapshots of one forecast's day, in time order. */
  listSnapshots(forecastId: EntityId): Promise<MarketSnapshot[]>;
  saveSnapshot(snapshot: MarketSnapshot): Promise<void>;

  listInteractions(forecastId: EntityId): Promise<LevelInteraction[]>;
  listAllInteractions(): Promise<LevelInteraction[]>;
  saveInteraction(interaction: LevelInteraction): Promise<void>;

  getLinkForTrade(tradeId: EntityId): Promise<ForecastTradeLink | undefined>;
  listLinks(forecastId: EntityId): Promise<ForecastTradeLink[]>;
  listAllLinks(): Promise<ForecastTradeLink[]>;
  saveLink(link: ForecastTradeLink): Promise<void>;
  deleteLinkForTrade(tradeId: EntityId): Promise<void>;
}

export interface ReviewRepository {
  get(id: EntityId): Promise<Review | undefined>;
  getByPeriod(kind: ReviewKind, periodStart: string): Promise<Review | undefined>;
  /** All reviews, newest period first. */
  list(): Promise<Review[]>;
  save(review: Review): Promise<void>;
  listFindings(reviewId: EntityId): Promise<ReviewFinding[]>;
  listImportantFindings(): Promise<ReviewFinding[]>;
  saveFinding(finding: ReviewFinding): Promise<void>;
  deleteFindings(ids: readonly EntityId[]): Promise<void>;
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
  setups: SetupRepository;
  rules: RuleRepository;
  ruleChecks: RuleCheckRepository;
  forecasts: ForecastRepository;
  reviews: ReviewRepository;
  changeHistory: ChangeHistoryRepository;
  trash: TrashRepository;
  settings: SettingsRepository;
  /**
   * Run `work` atomically: either every write inside it is stored or none is.
   * Only await repository calls inside `work`.
   */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
