/**
 * IndexedDB schema versions.
 *
 * Every schema change adds a new `db.version(n)` block here — never edit a
 * shipped version. Use `.upgrade()` to transform existing data so no
 * historical information is silently lost.
 *
 * Index syntax: first key is the primary key; `[a+b]` is a compound index.
 * Only fields that are queried need indexing.
 */
import type Dexie from "dexie";

export const SCHEMA_VERSION = 1;

export function applyMigrations(db: Dexie): void {
  db.version(1).stores({
    trades: "id, status, root, openedAt, closedAt, deletedAt",
    tradeEvents: "id, tradeId, [tradeId+timestamp]",
    changeHistory: "id, [entityType+entityId], changedAt",
    trashItems: "id, entityId, deletedAt",
    accountSettings: "id",
    appSettings: "id",
  });
}
