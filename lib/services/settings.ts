import { nowIso } from "@/lib/domain/ids";
import type { AppSettings, RequirableField } from "@/lib/domain/types";
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
    updatedAt: now,
  };
  await repos.settings.saveApp(next);
  return next;
}
