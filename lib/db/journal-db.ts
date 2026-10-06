import Dexie, { type EntityTable } from "dexie";
import type {
  AccountSettings,
  AppSettings,
  AIConversation,
  AIMessage,
  AIReview,
  Asset,
  ChangeHistory,
  Forecast,
  ForecastRevision,
  ForecastTradeLink,
  LevelInteraction,
  MarketSnapshot,
  PsychologyEntry,
  Review,
  ReviewFinding,
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
import { applyMigrations } from "./migrations";

export const DEFAULT_DB_NAME = "trading-journal";

/** The local journal database. All journal data lives here, in the browser. */
export class JournalDb extends Dexie {
  trades!: EntityTable<Trade, "id">;
  tradeEvents!: EntityTable<TradeEvent, "id">;
  psychologyEntries!: EntityTable<PsychologyEntry, "id">;
  screenshots!: EntityTable<TradeScreenshot, "id">;
  annotationVersions!: EntityTable<ScreenshotAnnotationVersion, "id">;
  assets!: EntityTable<Asset, "id">;
  setups!: EntityTable<Setup, "id">;
  setupRules!: EntityTable<SetupRule, "id">;
  setupMergeHistory!: EntityTable<SetupMergeHistory, "id">;
  rules!: EntityTable<Rule, "id">;
  ruleGroups!: EntityTable<RuleGroup, "id">;
  ruleChecks!: EntityTable<RuleCheck, "id">;
  forecasts!: EntityTable<Forecast, "id">;
  forecastRevisions!: EntityTable<ForecastRevision, "id">;
  marketSnapshots!: EntityTable<MarketSnapshot, "id">;
  levelInteractions!: EntityTable<LevelInteraction, "id">;
  forecastTradeLinks!: EntityTable<ForecastTradeLink, "id">;
  reviews!: EntityTable<Review, "id">;
  reviewFindings!: EntityTable<ReviewFinding, "id">;
  aiReviews!: EntityTable<AIReview, "id">;
  aiConversations!: EntityTable<AIConversation, "id">;
  aiMessages!: EntityTable<AIMessage, "id">;
  changeHistory!: EntityTable<ChangeHistory, "id">;
  trashItems!: EntityTable<TrashItem, "id">;
  accountSettings!: EntityTable<AccountSettings, "id">;
  appSettings!: EntityTable<AppSettings, "id">;

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name);
    applyMigrations(this);
  }
}
