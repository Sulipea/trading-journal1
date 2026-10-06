/**
 * Storage-level backup and restore for the Dexie journal.
 *
 * Restoring never writes into the live journal until the backup has been
 * fully validated: it is loaded into a temporary database at the backup's
 * own schema version, upgraded through the normal migrations, and every row
 * is checked against the current schemas. Only then is the journal replaced,
 * in one transaction.
 */
import Dexie from "dexie";
import { base64ToBytes, BackupError, bytesToBase64, encodedAssetSchema, type EncodedAsset } from "@/lib/backup/format";
import { newId } from "@/lib/domain/ids";
import type { Asset } from "@/lib/domain/types";
import type { BackupStore, StagedRestore } from "@/lib/repositories/types";
import { JournalDb } from "./journal-db";
import { applyMigrations, SCHEMA_VERSION } from "./migrations";
import { TABLE_SCHEMAS } from "./table-schemas";

const ASSETS = "assets";
const MAX_PROBLEMS = 10;

async function encodeAsset(asset: Asset): Promise<EncodedAsset> {
  return {
    id: asset.id,
    createdAt: asset.createdAt,
    mimeType: asset.mimeType,
    data: bytesToBase64(new Uint8Array(await asset.blob.arrayBuffer())),
  };
}

function decodeAsset(value: unknown): Asset {
  const a = encodedAssetSchema.parse(value);
  return { id: a.id, createdAt: a.createdAt, mimeType: a.mimeType, blob: new Blob([base64ToBytes(a.data)], { type: a.mimeType }) };
}

export function createBackupStore(db: JournalDb): BackupStore {
  return {
    schemaVersion: SCHEMA_VERSION,

    async dump(includeAssets) {
      const tables: Record<string, unknown[]> = {};
      for (const table of db.tables) {
        if (table.name === ASSETS) {
          if (includeAssets) tables[ASSETS] = await Promise.all((await table.toArray()).map((a: Asset) => encodeAsset(a)));
          continue;
        }
        tables[table.name] = await table.toArray();
      }
      return tables;
    },

    async stage(schemaVersion, tables) {
      if (schemaVersion > SCHEMA_VERSION) {
        throw new BackupError("This backup was made by a newer version of the app. Update the app before restoring it.");
      }
      const tmpName = `${db.name}-restore-${newId()}`;
      try {
        // 1. Load the data exactly as it was written, at its own schema version.
        const legacy = new Dexie(tmpName);
        applyMigrations(legacy, schemaVersion);
        await legacy.open();
        const known = new Set(legacy.tables.map((t) => t.name));
        const unknown = Object.keys(tables).filter((name) => !known.has(name));
        if (unknown.length) {
          legacy.close();
          throw new BackupError(`The backup contains unexpected data (${unknown.join(", ")}).`);
        }
        try {
          await legacy.transaction("rw", legacy.tables, async () => {
            for (const [name, rows] of Object.entries(tables)) {
              await legacy.table(name).bulkAdd(name === ASSETS ? rows.map(decodeAsset) : rows);
            }
          });
        } catch (error) {
          legacy.close();
          throw new BackupError("The backup's data couldn't be loaded.", [error instanceof Error ? error.message : String(error)]);
        }
        legacy.close();

        // 2. Upgrade it to the current schema with the normal migrations.
        const staged = new JournalDb(tmpName);
        await staged.open();
        const result: Record<string, unknown[]> = {};
        const counts: Record<string, number> = {};
        const problems: string[] = [];
        for (const table of staged.tables) {
          const rows = await table.toArray();
          result[table.name] = rows;
          counts[table.name] = rows.length;
          // 3. Validate every row against the current schemas.
          const schema = TABLE_SCHEMAS[table.name];
          if (!schema) continue;
          for (const row of rows) {
            if (problems.length >= MAX_PROBLEMS) break;
            const check = schema.safeParse(row);
            if (!check.success) {
              const id = (row as { id?: string }).id ?? "?";
              problems.push(`${table.name} ${id}: ${check.error.issues[0]?.path.join(".") || "row"} — ${check.error.issues[0]?.message}`);
            }
          }
        }
        staged.close();
        if (problems.length) throw new BackupError("The backup failed validation, so nothing was restored.", problems);
        return { tables: result, counts } satisfies StagedRestore;
      } finally {
        await Dexie.delete(tmpName);
      }
    },

    async replaceAll(staged) {
      await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
          const rows = staged.tables[table.name];
          if (rows?.length) await table.bulkAdd(rows);
        }
      });
    },
  };
}
