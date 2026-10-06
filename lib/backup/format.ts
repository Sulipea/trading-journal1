/**
 * Portable backup file format (spec §35): journal data, schema version,
 * metadata, optional screenshot assets and a SHA-256 checksum.
 */
import { z } from "zod";

export const BACKUP_FORMAT = "trading-journal-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = ".tjbackup";

/** How an image asset is stored inside a backup file. */
export const encodedAssetSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  mimeType: z.string().min(1),
  /** Base64, no data: prefix. */
  data: z.string(),
});
export type EncodedAsset = z.infer<typeof encodedAssetSchema>;

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  /** IndexedDB schema version the data was written with. */
  schemaVersion: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  includesAssets: z.boolean(),
  /** Rows per table, for display before restoring. */
  counts: z.record(z.string(), z.number().int().nonnegative()),
  tables: z.record(z.string(), z.array(z.unknown())),
  /** SHA-256 of the canonical JSON of { schemaVersion, includesAssets, tables }. */
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

/** JSON with object keys sorted, so the same data always produces the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function backupChecksum(file: Pick<BackupFile, "schemaVersion" | "includesAssets" | "tables">): Promise<string> {
  return sha256Hex(canonicalJson({ schemaVersion: file.schemaVersion, includesAssets: file.includesAssets, tables: file.tables }));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class BackupError extends Error {
  override name = "BackupError";
  constructor(
    message: string,
    /** Specific problems found while validating, for display. */
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}
