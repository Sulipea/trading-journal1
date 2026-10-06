import { newId, nowIso } from "@/lib/domain/ids";
import { backupSettingsSchema, forecastDefaultsSchema, reminderSchema } from "@/lib/domain/schemas";
import type {
  AppSettings,
  BackupSettings,
  ForecastDefaults,
  Reminder,
  RequirableField,
  SessionOption,
} from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function saveStartingBalance(
  repos: JournalRepositories,
  startingBalance: number,
  now: string = nowIso(),
): Promise<void> {
  if (!Number.isFinite(startingBalance)) throw new Error("Enter a valid starting balance.");
  const account = await repos.settings.getAccount();
  await repos.settings.saveAccount({ ...account, startingBalance, updatedAt: now });
}

export interface JournalPreferences {
  timezone: string;
  requiredFields: RequirableField[];
  psychologyEmotions: string[];
  psychologyRatings: string[];
  /** Sessions in display order. New ones have an empty id. */
  sessions: SessionOption[];
}

/**
 * Validate edited sessions. Existing sessions can be renamed or hidden but
 * never dropped, so trades that used them keep a name.
 */
export function cleanSessions(edited: readonly SessionOption[], previous: readonly SessionOption[]): SessionOption[] {
  const result: SessionOption[] = [];
  for (const s of edited) {
    const label = s.label.trim();
    if (!label) {
      if (s.id) throw new Error("Sessions need a name. Hide a session instead of clearing its name.");
      continue; // an empty new row is ignored
    }
    result.push({ id: s.id || newId(), label, active: s.active });
  }
  for (const old of previous) {
    if (!result.some((s) => s.id === old.id)) result.push({ ...old, active: false });
  }
  const seen = new Set<string>();
  for (const s of result.filter((x) => x.active)) {
    const key = s.label.toLowerCase();
    if (seen.has(key)) throw new Error(`There are two sessions called "${s.label}".`);
    seen.add(key);
  }
  return result;
}

/** Trim, drop blanks and remove duplicates (case-insensitive), keeping order. */
export function cleanList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

export async function savePreferences(
  repos: JournalRepositories,
  prefs: JournalPreferences,
  now: string = nowIso(),
): Promise<AppSettings> {
  if (!isValidTimezone(prefs.timezone)) throw new Error(`Unknown timezone "${prefs.timezone}".`);
  const current = await repos.settings.getApp();
  const next: AppSettings = {
    ...current,
    timezone: prefs.timezone,
    requiredFields: [...new Set(prefs.requiredFields)],
    psychologyEmotions: cleanList(prefs.psychologyEmotions),
    psychologyRatings: cleanList(prefs.psychologyRatings),
    sessions: cleanSessions(prefs.sessions, current.sessions),
    updatedAt: now,
  };
  await repos.settings.saveApp(next);
  return next;
}

/** Save reminders (spec §30). New ones may have an empty id. */
export async function saveReminders(repos: JournalRepositories, reminders: readonly Reminder[], now: string = nowIso()) {
  const cleaned = reminders.map((r) =>
    reminderSchema.parse({
      ...r,
      id: r.id || newId(),
      message: r.message.trim(),
      time: r.kind === "NEW_TRADE" ? null : r.time,
      weekdays: [...new Set(r.weekdays)].sort(),
    }),
  );
  for (const r of cleaned) {
    if (r.kind !== "NEW_TRADE" && r.time === null) throw new Error(`"${r.message}" needs a time.`);
  }
  const current = await repos.settings.getApp();
  await repos.settings.saveApp({ ...current, reminders: cleaned, updatedAt: now });
}

export async function saveForecastDefaults(repos: JournalRepositories, defaults: ForecastDefaults, now: string = nowIso()) {
  const current = await repos.settings.getApp();
  const forecastDefaults = forecastDefaultsSchema.parse({ ...defaults, conditionTags: cleanList(defaults.conditionTags) });
  await repos.settings.saveApp({ ...current, forecastDefaults, updatedAt: now });
}

export async function saveBackupSettings(repos: JournalRepositories, backup: BackupSettings, now: string = nowIso()) {
  const current = await repos.settings.getApp();
  await repos.settings.saveApp({ ...current, backup: backupSettingsSchema.parse(backup), updatedAt: now });
}
