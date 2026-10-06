/**
 * IndexedDB schema versions.
 *
 * Every schema change appends a new migration here — never edit a shipped
 * one. `upgrade` transforms existing data so no historical information is
 * silently lost. Dexie runs each pending upgrade in order when the database
 * is opened.
 *
 * Index syntax: first key is the primary key; `[a+b]` is a compound index.
 * Only fields that are queried need indexing.
 */
import type Dexie from "dexie";
import type { Transaction } from "dexie";
import {
  DEFAULT_BACKUP_SETTINGS,
  DEFAULT_FORECAST_DEFAULTS,
  DEFAULT_REMINDERS,
  DEFAULT_SESSIONS,
  DEFAULT_PSYCHOLOGY_EMOTIONS,
  DEFAULT_PSYCHOLOGY_RATINGS,
  DEFAULT_REQUIRED_FIELDS,
} from "@/lib/domain/defaults";

interface Migration {
  version: number;
  stores: Record<string, string | null>;
  upgrade?: (tx: Transaction) => Promise<unknown>;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    stores: {
      trades: "id, status, root, openedAt, closedAt, deletedAt",
      tradeEvents: "id, tradeId, [tradeId+timestamp]",
      changeHistory: "id, [entityType+entityId], changedAt",
      trashItems: "id, entityId, deletedAt",
      accountSettings: "id",
      appSettings: "id",
    },
  },
  {
    // Phase 2: full trade sections, psychology, screenshots, required-field settings.
    version: 2,
    stores: {
      psychologyEntries: "id, tradeId, &[tradeId+phase]",
      screenshots: "id, tradeId",
      annotationVersions: "id, screenshotId, tradeId",
      assets: "id",
    },
    upgrade: async (tx) => {
      await tx
        .table("trades")
        .toCollection()
        .modify((trade: Record<string, unknown>) => {
          trade.session ??= null;
          trade.marketConditions ??= "";
          trade.reasoning ??= "";
          trade.executionNotes ??= "";
          trade.executionRating ??= null;
          trade.unlocked ??= false;
        });
      await tx
        .table("appSettings")
        .toCollection()
        .modify((settings: Record<string, unknown>) => {
          settings.requiredFields ??= [...DEFAULT_REQUIRED_FIELDS];
          settings.psychologyEmotions ??= [...DEFAULT_PSYCHOLOGY_EMOTIONS];
          settings.psychologyRatings ??= [...DEFAULT_PSYCHOLOGY_RATINGS];
        });
    },
  },
  {
    // Phase 3: setups, rules, rule groups, checklists and trade setup/review fields.
    version: 3,
    stores: {
      trades: "id, status, root, openedAt, closedAt, deletedAt, setupId",
      setups: "id, name, active",
      setupRules: "id, setupId, ruleId, &[setupId+ruleId]",
      setupMergeHistory: "id, sourceSetupId, targetSetupId",
      rules: "id, groupId, active",
      ruleGroups: "id, parentId",
      ruleChecks: "id, tradeId, ruleId, &[tradeId+ruleId]",
    },
    upgrade: async (tx) => {
      await tx
        .table("trades")
        .toCollection()
        .modify((trade: Record<string, unknown>) => {
          trade.setupId ??= null;
          trade.requirementOverrides ??= [];
          trade.flaggedForReview ??= false;
        });
    },
  },
  {
    // Editable trading sessions in app settings. Existing trades keep their session ids.
    version: 4,
    stores: {},
    upgrade: async (tx) => {
      await tx
        .table("appSettings")
        .toCollection()
        .modify((settings: Record<string, unknown>) => {
          settings.sessions ??= DEFAULT_SESSIONS.map((s) => ({ ...s }));
        });
    },
  },
  {
    // Phase 4: daily forecasts with immutable revisions, snapshots, level interactions and trade links.
    version: 5,
    stores: {
      forecasts: "id, &date, status",
      forecastRevisions: "id, forecastId, &[forecastId+number]",
      marketSnapshots: "id, forecastId, at",
      levelInteractions: "id, forecastId, &[forecastId+levelId]",
      forecastTradeLinks: "id, &tradeId, forecastId",
    },
  },
  {
    // Phase 6: weekly/monthly reviews and their findings.
    version: 6,
    stores: {
      reviews: "id, &[kind+periodStart], periodStart",
      reviewFindings: "id, reviewId",
    },
  },
  {
    // Phase 7: locally stored AI output (reviews, pattern discovery, chat) and the auto-review setting.
    version: 7,
    stores: {
      aiReviews: "id, targetId, kind, createdAt",
      aiConversations: "id, updatedAt",
      aiMessages: "id, conversationId",
    },
    upgrade: async (tx) => {
      await tx
        .table("appSettings")
        .toCollection()
        .modify((settings: Record<string, unknown>) => {
          settings.aiAutoReview ??= true;
        });
    },
  },
  {
    // Phase 8: reminders, forecast defaults and backup settings.
    version: 8,
    stores: {},
    upgrade: async (tx) => {
      await tx
        .table("appSettings")
        .toCollection()
        .modify((settings: Record<string, unknown>) => {
          settings.reminders ??= DEFAULT_REMINDERS.map((r) => ({ ...r, weekdays: [...r.weekdays] }));
          settings.forecastDefaults ??= { ...DEFAULT_FORECAST_DEFAULTS };
          settings.backup ??= { ...DEFAULT_BACKUP_SETTINGS };
        });
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** Declare schema versions on `db`, up to and including `upToVersion`. */
export function applyMigrations(db: Dexie, upToVersion: number = SCHEMA_VERSION): void {
  for (const migration of MIGRATIONS) {
    if (migration.version > upToVersion) break;
    const version = db.version(migration.version).stores(migration.stores);
    if (migration.upgrade) version.upgrade(migration.upgrade);
  }
}
