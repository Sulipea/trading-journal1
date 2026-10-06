import Dexie, { type EntityTable } from "dexie";
import type {
  AccountSettings,
  AppSettings,
  Asset,
  ChangeHistory,
  PsychologyEntry,
  ScreenshotAnnotationVersion,
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
  changeHistory!: EntityTable<ChangeHistory, "id">;
  trashItems!: EntityTable<TrashItem, "id">;
  accountSettings!: EntityTable<AccountSettings, "id">;
  appSettings!: EntityTable<AppSettings, "id">;

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name);
    applyMigrations(this);
  }
}
