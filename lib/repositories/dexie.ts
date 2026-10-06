import Dexie from "dexie";
import type { JournalDb } from "@/lib/db/journal-db";
import {
  DEFAULT_PSYCHOLOGY_EMOTIONS,
  DEFAULT_PSYCHOLOGY_RATINGS,
  DEFAULT_REQUIRED_FIELDS,
  DEFAULT_SESSIONS,
} from "@/lib/domain/defaults";
import { compareFills } from "@/lib/domain/fills";
import { newId } from "@/lib/domain/ids";
import {
  ACCOUNT_SETTINGS_ID,
  APP_SETTINGS_ID,
  accountSettingsSchema,
  aiConversationSchema,
  aiMessageSchema,
  aiReviewSchema,
  appSettingsSchema,
  assetSchema,
  changeHistorySchema,
  forecastRevisionSchema,
  forecastSchema,
  forecastTradeLinkSchema,
  levelInteractionSchema,
  marketSnapshotSchema,
  psychologyEntrySchema,
  reviewFindingSchema,
  reviewSchema,
  ruleCheckSchema,
  ruleGroupSchema,
  ruleSchema,
  screenshotAnnotationVersionSchema,
  setupMergeHistorySchema,
  setupRuleSchema,
  setupSchema,
  tradeEventSchema,
  tradeSchema,
  tradeScreenshotSchema,
  trashItemSchema,
} from "@/lib/domain/schemas";
import type { AccountSettings, AppSettings, EntityId, SetupRule, TradeEvent } from "@/lib/domain/types";
import type {
  AIRepository,
  AssetStore,
  ChangeHistoryRepository,
  ForecastRepository,
  JournalRepositories,
  PsychologyRepository,
  ReviewRepository,
  RuleCheckRepository,
  RuleRepository,
  ScreenshotRepository,
  SettingsRepository,
  SetupRepository,
  TradeEventRepository,
  TradeRepository,
  TrashRepository,
} from "./types";

function createTradeRepository(db: JournalDb): TradeRepository {
  return {
    get: (id) => db.trades.get(id),

    async list(options = {}) {
      const trades = await db.trades.orderBy("openedAt").reverse().toArray();
      return options.includeDeleted ? trades : trades.filter((t) => t.deletedAt === null);
    },

    async listClosed() {
      const closed = await db.trades.where("status").equals("CLOSED").sortBy("closedAt");
      return closed.filter((t) => t.deletedAt === null);
    },

    async save(trade) {
      await db.trades.put(tradeSchema.parse(trade));
    },

    async delete(id) {
      await db.trades.delete(id);
    },
  };
}

function createTradeEventRepository(db: JournalDb): TradeEventRepository {
  return {
    get: (id) => db.tradeEvents.get(id),

    async listForTrade(tradeId) {
      const events = await db.tradeEvents
        .where("[tradeId+timestamp]")
        .between([tradeId, Dexie.minKey], [tradeId, Dexie.maxKey])
        .toArray();
      return events.sort(compareFills);
    },

    async listForTrades(tradeIds) {
      const grouped = new Map<EntityId, TradeEvent[]>(tradeIds.map((id) => [id, []]));
      if (tradeIds.length === 0) return grouped;
      const events = await db.tradeEvents.where("tradeId").anyOf(tradeIds).toArray();
      for (const event of events) grouped.get(event.tradeId)?.push(event);
      for (const list of grouped.values()) list.sort(compareFills);
      return grouped;
    },

    async save(event) {
      await db.tradeEvents.put(tradeEventSchema.parse(event));
    },

    async delete(id) {
      await db.tradeEvents.delete(id);
    },

    async deleteForTrade(tradeId) {
      await db.tradeEvents.where("tradeId").equals(tradeId).delete();
    },
  };
}

function createPsychologyRepository(db: JournalDb): PsychologyRepository {
  return {
    listForTrade: (tradeId) => db.psychologyEntries.where("tradeId").equals(tradeId).toArray(),
    listAll: () => db.psychologyEntries.toArray(),

    async save(entry) {
      await db.psychologyEntries.put(psychologyEntrySchema.parse(entry));
    },

    async deleteForTrade(tradeId) {
      await db.psychologyEntries.where("tradeId").equals(tradeId).delete();
    },
  };
}

function createScreenshotRepository(db: JournalDb): ScreenshotRepository {
  return {
    get: (id) => db.screenshots.get(id),

    listForTrade: (tradeId) => db.screenshots.where("tradeId").equals(tradeId).sortBy("createdAt"),

    async save(screenshot) {
      await db.screenshots.put(tradeScreenshotSchema.parse(screenshot));
    },

    async delete(id) {
      await db.screenshots.delete(id);
    },

    listVersions: (screenshotId) =>
      db.annotationVersions.where("screenshotId").equals(screenshotId).sortBy("createdAt"),

    async saveVersion(version) {
      await db.annotationVersions.put(screenshotAnnotationVersionSchema.parse(version));
    },

    async deleteVersionsForScreenshot(screenshotId) {
      await db.annotationVersions.where("screenshotId").equals(screenshotId).delete();
    },
  };
}

function createAssetStore(db: JournalDb): AssetStore {
  return {
    get: (id) => db.assets.get(id),

    async put(asset) {
      await db.assets.put(assetSchema.parse(asset));
    },

    async delete(ids) {
      await db.assets.bulkDelete([...ids]);
    },
  };
}

function createSetupRepository(db: JournalDb): SetupRepository {
  return {
    get: (id) => db.setups.get(id),
    list: () => db.setups.orderBy("name").toArray(),

    async save(setup) {
      await db.setups.put(setupSchema.parse(setup));
    },

    async delete(id) {
      await db.setups.delete(id);
      await db.setupRules.where("setupId").equals(id).delete();
    },

    listRules: (setupId) => db.setupRules.where("setupId").equals(setupId).sortBy("order"),
    listAllRuleLinks: () => db.setupRules.toArray(),

    async replaceRules(setupId, ruleIds, now) {
      await db.setupRules.where("setupId").equals(setupId).delete();
      const links: SetupRule[] = ruleIds.map((ruleId, order) =>
        setupRuleSchema.parse({ id: newId(), createdAt: now, updatedAt: now, setupId, ruleId, order }),
      );
      await db.setupRules.bulkAdd(links);
    },

    async deleteRuleLinksForRule(ruleId) {
      await db.setupRules.where("ruleId").equals(ruleId).delete();
    },

    listMergeHistory: () => db.setupMergeHistory.toArray(),

    async addMergeHistory(entry) {
      await db.setupMergeHistory.add(setupMergeHistorySchema.parse(entry));
    },
  };
}

function createRuleRepository(db: JournalDb): RuleRepository {
  return {
    get: (id) => db.rules.get(id),

    async list() {
      const rules = await db.rules.toArray();
      return rules.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    },

    async save(rule) {
      await db.rules.put(ruleSchema.parse(rule));
    },

    async delete(id) {
      await db.rules.delete(id);
    },

    async listGroups() {
      const groups = await db.ruleGroups.toArray();
      return groups.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    },

    async saveGroup(group) {
      await db.ruleGroups.put(ruleGroupSchema.parse(group));
    },

    async deleteGroup(id) {
      await db.ruleGroups.delete(id);
    },
  };
}

function createRuleCheckRepository(db: JournalDb): RuleCheckRepository {
  return {
    listForTrade: (tradeId) => db.ruleChecks.where("tradeId").equals(tradeId).toArray(),
    listAll: () => db.ruleChecks.toArray(),
    countForRule: (ruleId) => db.ruleChecks.where("ruleId").equals(ruleId).count(),

    async save(check) {
      await db.ruleChecks.put(ruleCheckSchema.parse(check));
    },

    async delete(id) {
      await db.ruleChecks.delete(id);
    },

    async deleteForTrade(tradeId) {
      await db.ruleChecks.where("tradeId").equals(tradeId).delete();
    },
  };
}

function createForecastRepository(db: JournalDb): ForecastRepository {
  return {
    get: (id) => db.forecasts.get(id),
    getByDate: (date) => db.forecasts.where("date").equals(date).first(),
    list: () => db.forecasts.orderBy("date").reverse().toArray(),

    async save(forecast) {
      await db.forecasts.put(forecastSchema.parse(forecast));
    },

    getRevision: (id) => db.forecastRevisions.get(id),
    listRevisions: (forecastId) =>
      db.forecastRevisions
        .where("[forecastId+number]")
        .between([forecastId, Dexie.minKey], [forecastId, Dexie.maxKey])
        .toArray(),
    listAllRevisions: () => db.forecastRevisions.toArray(),

    async saveRevision(revision) {
      await db.forecastRevisions.put(forecastRevisionSchema.parse(revision));
    },

    listSnapshots: (forecastId) => db.marketSnapshots.where("forecastId").equals(forecastId).sortBy("at"),

    async saveSnapshot(snapshot) {
      await db.marketSnapshots.put(marketSnapshotSchema.parse(snapshot));
    },

    listInteractions: (forecastId) => db.levelInteractions.where("forecastId").equals(forecastId).toArray(),
    listAllInteractions: () => db.levelInteractions.toArray(),

    async saveInteraction(interaction) {
      await db.levelInteractions.put(levelInteractionSchema.parse(interaction));
    },

    getLinkForTrade: (tradeId) => db.forecastTradeLinks.where("tradeId").equals(tradeId).first(),
    listLinks: (forecastId) => db.forecastTradeLinks.where("forecastId").equals(forecastId).toArray(),
    listAllLinks: () => db.forecastTradeLinks.toArray(),

    async saveLink(link) {
      await db.forecastTradeLinks.put(forecastTradeLinkSchema.parse(link));
    },

    async deleteLinkForTrade(tradeId) {
      await db.forecastTradeLinks.where("tradeId").equals(tradeId).delete();
    },
  };
}

function createReviewRepository(db: JournalDb): ReviewRepository {
  return {
    get: (id) => db.reviews.get(id),
    getByPeriod: (kind, periodStart) => db.reviews.where("[kind+periodStart]").equals([kind, periodStart]).first(),
    list: () => db.reviews.orderBy("periodStart").reverse().toArray(),

    async save(review) {
      await db.reviews.put(reviewSchema.parse(review));
    },

    async listFindings(reviewId) {
      const findings = await db.reviewFindings.where("reviewId").equals(reviewId).toArray();
      return findings.sort((a, b) => a.order - b.order);
    },

    listImportantFindings: () => db.reviewFindings.filter((f) => f.important).toArray(),

    async saveFinding(finding) {
      await db.reviewFindings.put(reviewFindingSchema.parse(finding));
    },

    async deleteFindings(ids) {
      await db.reviewFindings.bulkDelete([...ids]);
    },
  };
}

function createAIRepository(db: JournalDb): AIRepository {
  const newestFirst = <T extends { createdAt: string }>(list: T[]) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    async listReviews(targetId) {
      return newestFirst(await db.aiReviews.where("targetId").equals(targetId).toArray());
    },
    async listReviewsByKind(kind) {
      return newestFirst(await db.aiReviews.where("kind").equals(kind).toArray());
    },
    async saveReview(review) {
      await db.aiReviews.put(aiReviewSchema.parse(review));
    },
    async deleteReviewsForTarget(targetId) {
      await db.aiReviews.where("targetId").equals(targetId).delete();
    },
    getConversation: (id) => db.aiConversations.get(id),
    listConversations: () => db.aiConversations.orderBy("updatedAt").reverse().toArray(),
    async saveConversation(conversation) {
      await db.aiConversations.put(aiConversationSchema.parse(conversation));
    },
    async deleteConversation(id) {
      await db.transaction("rw", db.aiConversations, db.aiMessages, async () => {
        await db.aiMessages.where("conversationId").equals(id).delete();
        await db.aiConversations.delete(id);
      });
    },
    async listMessages(conversationId) {
      const messages = await db.aiMessages.where("conversationId").equals(conversationId).toArray();
      return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async saveMessage(message) {
      await db.aiMessages.put(aiMessageSchema.parse(message));
    },
  };
}

function createChangeHistoryRepository(db: JournalDb): ChangeHistoryRepository {
  const forEntity = (entityType: string, entityId: EntityId) =>
    db.changeHistory.where("[entityType+entityId]").equals([entityType, entityId]);

  return {
    async add(entries) {
      if (entries.length === 0) return;
      await db.changeHistory.bulkAdd(entries.map((e) => changeHistorySchema.parse(e)));
    },

    async listForEntity(entityType, entityId) {
      const entries = await forEntity(entityType, entityId).sortBy("changedAt");
      return entries.reverse();
    },

    async deleteForEntity(entityType, entityId) {
      await forEntity(entityType, entityId).delete();
    },
  };
}

function createTrashRepository(db: JournalDb): TrashRepository {
  return {
    list: () => db.trashItems.orderBy("deletedAt").reverse().toArray(),

    async save(item) {
      await db.trashItems.put(trashItemSchema.parse(item));
    },

    async deleteForEntity(entityId) {
      await db.trashItems.where("entityId").equals(entityId).delete();
    },
  };
}

/**
 * Timestamp for settings that have never been saved. Fixed, so unsaved
 * defaults look identical on every read (forms keyed on updatedAt don't reset).
 */
const UNSAVED = "1970-01-01T00:00:00.000Z";

function defaultAccountSettings(): AccountSettings {
  const now = UNSAVED;
  return { id: ACCOUNT_SETTINGS_ID, createdAt: now, updatedAt: now, startingBalance: 0 };
}

function defaultAppSettings(): AppSettings {
  const now = UNSAVED;
  return {
    id: APP_SETTINGS_ID,
    createdAt: now,
    updatedAt: now,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    aiStatus: "NOT_CONFIGURED",
    requiredFields: [...DEFAULT_REQUIRED_FIELDS],
    psychologyEmotions: [...DEFAULT_PSYCHOLOGY_EMOTIONS],
    psychologyRatings: [...DEFAULT_PSYCHOLOGY_RATINGS],
    sessions: DEFAULT_SESSIONS.map((s) => ({ ...s })),
    aiAutoReview: true,
  };
}

function createSettingsRepository(db: JournalDb): SettingsRepository {
  return {
    async getAccount() {
      return (await db.accountSettings.get(ACCOUNT_SETTINGS_ID)) ?? defaultAccountSettings();
    },
    async saveAccount(settings) {
      await db.accountSettings.put(accountSettingsSchema.parse(settings));
    },
    async getApp() {
      return (await db.appSettings.get(APP_SETTINGS_ID)) ?? defaultAppSettings();
    },
    async saveApp(settings) {
      await db.appSettings.put(appSettingsSchema.parse(settings));
    },
  };
}

export function createDexieRepositories(db: JournalDb): JournalRepositories {
  return {
    trades: createTradeRepository(db),
    tradeEvents: createTradeEventRepository(db),
    psychology: createPsychologyRepository(db),
    screenshots: createScreenshotRepository(db),
    assets: createAssetStore(db),
    setups: createSetupRepository(db),
    rules: createRuleRepository(db),
    ruleChecks: createRuleCheckRepository(db),
    forecasts: createForecastRepository(db),
    reviews: createReviewRepository(db),
    ai: createAIRepository(db),
    changeHistory: createChangeHistoryRepository(db),
    trash: createTrashRepository(db),
    settings: createSettingsRepository(db),
    transaction: (work) => db.transaction("rw", db.tables, work),
  };
}
