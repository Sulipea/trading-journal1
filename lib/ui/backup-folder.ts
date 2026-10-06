"use client";

/**
 * Optional backup folder via the File System Access API (spec §35), where
 * the browser supports it (Chromium-based browsers). The folder handle is
 * stored locally; the browser asks the user to re-grant access when needed.
 */

type PermissionState = "granted" | "denied" | "prompt";

interface PermissionCapableHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
}

type WindowWithPicker = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

export function supportsBackupFolder(): boolean {
  return typeof window !== "undefined" && typeof (window as WindowWithPicker).showDirectoryPicker === "function";
}

/** Ask the user to choose a folder. Must be called from a click. */
export async function chooseBackupFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as WindowWithPicker).showDirectoryPicker;
  if (!picker) throw new Error("This browser can't save backups to a folder. Use Export instead.");
  return picker({ id: "trading-journal-backups", mode: "readwrite" });
}

export async function folderPermission(handle: FileSystemDirectoryHandle, request = false): Promise<PermissionState> {
  const h = handle as PermissionCapableHandle;
  if (typeof h.queryPermission !== "function") return "granted";
  const state = await h.queryPermission({ mode: "readwrite" });
  if (state === "granted" || !request) return state;
  return h.requestPermission({ mode: "readwrite" });
}

export async function writeToFolder(handle: FileSystemDirectoryHandle, fileName: string, text: string): Promise<void> {
  const file = await handle.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Offer a file to the user as a download. */
export function downloadText(fileName: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
