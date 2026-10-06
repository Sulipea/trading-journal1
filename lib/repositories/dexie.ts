import Dexie from "dexie";
import type { JournalDb } from "@/lib/db/journal-db";
import {
  DEFAULT_PSYCHOLOGY_EMOTIONS,
  DEFAULT_PSYCHOLOGY_RATINGS,
  DEFAULT_REQUIRED_FIELDS,
} from "@/lib/domain/defaults";
import { compareFills } from "@/lib/domain/fills";
import { newId, nowIso } from "@/lib/domain/ids";
import {
  ACCOUNT_SETTINGS_ID,
  APP_SETTINGS_ID,
  accountSettingsSchema,
  appSettingsSchema,
  assetSchema,
  changeHistorySchema,
  psychologyEntrySchema,
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
  AssetStore,
  ChangeHistoryRepository,
  JournalRepositories,
  PsychologyRepository,
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

function defaultAccountSettings(): AccountSettings {
  const now = nowIso();
  return { id: ACCOUNT_SETTINGS_ID, createdAt: now, updatedAt: now, startingBalance: 0 };
}

function defaultAppSettings(): AppSettings {
  const now = nowIso();
  return {
    id: APP_SETTINGS_ID,
    createdAt: now,
    updatedAt: now,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    aiStatus: "NOT_CONFIGURED",
    requiredFields: [...DEFAULT_REQUIRED_FIELDS],
    psychologyEmotions: [...DEFAULT_PSYCHOLOGY_EMOTIONS],
    psychologyRatings: [...DEFAULT_PSYCHOLOGY_RATINGS],
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
    changeHistory: createChangeHistoryRepository(db),
    trash: createTrashRepository(db),
    settings: createSettingsRepository(db),
    transaction: (work) => db.transaction("rw", db.tables, work),
  };
}
