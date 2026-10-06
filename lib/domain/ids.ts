/** Stable entity identifier (UUID v4). */
export type EntityId = string;

/** ISO-8601 UTC timestamp, e.g. `2026-10-06T14:30:00.000Z`. */
export type IsoTimestamp = string;

export function newId(): EntityId {
  return crypto.randomUUID();
}

export function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}
