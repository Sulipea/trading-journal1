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
