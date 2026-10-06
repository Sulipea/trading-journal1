"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ScreenshotViewer } from "@/components/screenshots/screenshot-viewer";
import { FormStatus } from "@/components/ui/form";
import type { TradeScreenshot } from "@/lib/domain/types";
import { getRepositories } from "@/lib/repositories";
import { addScreenshot } from "@/lib/services/screenshots";
import { prepareImage } from "@/lib/ui/images";
import { useAsset } from "@/lib/ui/use-asset-url";
import { errorMessage } from "@/lib/ui/use-journal";
import { cn } from "@/lib/ui/cn";
import { useWorkspace } from "./context";
import { Section } from "./section";

function Thumbnail({ screenshot, onOpen }: { screenshot: TradeScreenshot; onOpen: () => void }) {
  const asset = useAsset(screenshot.thumbnailAssetId);
  const url = asset.url;
  const name = screenshot.caption || screenshot.fileName || "Screenshot";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group block w-full overflow-hidden rounded-lg border border-border bg-surface-muted text-left focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="block aspect-video overflow-hidden">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable
            <img src={url} alt={name} className="size-full object-cover transition group-hover:scale-[1.03]" />
          ) : (
            <span
              className={cn(
                "flex size-full items-center justify-center px-2 text-center text-xs text-muted",
                asset.status === "loading" && "animate-pulse",
              )}
            >
              {asset.status === "missing" ? "Image not available" : null}
            </span>
          )}
        </span>
        <span className="block truncate px-2.5 py-1.5 text-xs text-muted">{name}</span>
      </button>
    </li>
  );
}

export function ScreenshotsSection({ number }: { number: number }) {
  const { ws, required, readOnly, reload } = useWorkspace();
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const missing = ws.trade.status !== "CLOSED" && ws.readiness.missing.includes("screenshot");
  const open = ws.screenshots.find((s) => s.id === openId) ?? null;

  async function addFiles(files: readonly (File | Blob)[]) {
    if (files.length === 0 || readOnly) return;
    setBusy(true);
    setStatus(null);
    try {
      for (const file of files) {
        await addScreenshot(getRepositories(), ws.trade.id, await prepareImage(file));
      }
      setStatus({ kind: "saved", message: `${files.length} screenshot${files.length === 1 ? "" : "s"} added.` });
      reload();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  // Paste an image anywhere on the trade page (but not into text fields).
  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });
  useEffect(() => {
    if (readOnly) return;
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const images = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      event.preventDefault();
      void addFilesRef.current(images);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [readOnly]);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void addFiles([...event.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  }

  return (
    <Section number={number} title="Screenshots / chart analysis" incomplete={missing}>
      <div className="space-y-4">
        {required.has("screenshot") && (
          <p className={cn("text-xs", missing ? "text-negative" : "text-muted")}>
            At least one screenshot is required to close.
          </p>
        )}

        {ws.screenshots.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {ws.screenshots.map((s) => (
              <Thumbnail key={s.id} screenshot={s} onOpen={() => setOpenId(s.id)} />
            ))}
          </ul>
        )}

        {!readOnly && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition",
              dragging ? "border-accent bg-accent/8" : "border-border",
            )}
          >
            <ImagePlus aria-hidden className="size-6 text-muted" />
            <p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Choose images
              </button>
              , drag them here, or paste with Ctrl+V.
            </p>
            <p className="text-xs text-muted">PNG, JPEG, WebP or GIF. Stored only in this browser.</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Add screenshots"
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
        )}
        {busy && <p className="text-sm text-muted">Adding…</p>}
        <FormStatus status={status} />
      </div>

      {open && (
        <ScreenshotViewer
          key={open.id}
          screenshot={open}
          canEdit={!readOnly}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}
    </Section>
  );
}
