import Dexie from "dexie";
import type { JournalDb } from "@/lib/db/journal-db";
import { nowIso } from "@/lib/domain/ids";
import {
  ACCOUNT_SETTINGS_ID,
  APP_SETTINGS_ID,
  accountSettingsSchema,
  appSettingsSchema,
  tradeEventSchema,
  tradeSchema,
} from "@/lib/domain/schemas";
import type { AccountSettings, AppSettings, EntityId, TradeEvent } from "@/lib/domain/types";
import type {
  JournalRepositories,
  SettingsRepository,
  TradeEventRepository,
  TradeRepository,
} from "./types";

function byTimestamp(a: TradeEvent, b: TradeEvent): number {
  return a.timestamp.localeCompare(b.timestamp);
}

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
  };
}

function createTradeEventRepository(db: JournalDb): TradeEventRepository {
  return {
    listForTrade: (tradeId) =>
      db.tradeEvents
        .where("[tradeId+timestamp]")
        .between([tradeId, Dexie.minKey], [tradeId, Dexie.maxKey])
        .toArray(),

    async listForTrades(tradeIds) {
      const grouped = new Map<EntityId, TradeEvent[]>(tradeIds.map((id) => [id, []]));
      if (tradeIds.length === 0) return grouped;
      const events = await db.tradeEvents.where("tradeId").anyOf(tradeIds).toArray();
      for (const event of events) grouped.get(event.tradeId)?.push(event);
      for (const list of grouped.values()) list.sort(byTimestamp);
      return grouped;
    },

    async save(event) {
      await db.tradeEvents.put(tradeEventSchema.parse(event));
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
    settings: createSettingsRepository(db),
  };
}
