import Dexie, { type EntityTable } from "dexie";
import type { BackupMetadata } from "@/lib/domain/types";

export interface SnapshotRecord extends BackupMetadata {
  /** The backup file as JSON text. */
  payload: string;
}

export interface HandleRecord {
  id: string;
  handle: FileSystemDirectoryHandle;
}

/**
 * Local backup snapshots live in their own database so restoring (which
 * replaces the journal) never wipes them.
 */
export class SnapshotsDb extends Dexie {
  snapshots!: EntityTable<SnapshotRecord, "id">;
  handles!: EntityTable<HandleRecord, "id">;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ snapshots: "id, createdAt, kind", handles: "id" });
  }
}
