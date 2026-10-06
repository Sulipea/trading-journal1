import { JournalDb } from "@/lib/db/journal-db";
import { createDexieRepositories } from "./dexie";
import type { JournalRepositories } from "./types";

export type * from "./types";

let repositories: JournalRepositories | null = null;

/**
 * The app's repositories, backed by the browser's IndexedDB.
 * Browser-only: call from effects or event handlers, never during server rendering.
 */
export function getRepositories(): JournalRepositories {
  if (typeof indexedDB === "undefined") {
    throw new Error("Journal storage is only available in the browser");
  }
  repositories ??= createDexieRepositories(new JournalDb());
  return repositories;
}
