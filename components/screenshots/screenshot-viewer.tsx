"use client";

import {
  ArrowUpRight,
  Hand,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, FormStatus, Input, Select } from "@/components/ui/form";
import type { AnnotationShape, TradeScreenshot } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { deleteScreenshot, saveAnnotationVersion, updateCaption } from "@/lib/services/screenshots";
import { useAsset } from "@/lib/ui/use-asset-url";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { cn } from "@/lib/ui/cn";
import { AnnotationLayer } from "./annotation-layer";

type Tool = "pan" | "pen" | "rect" | "arrow" | "text";
const TOOLS: { tool: Tool; label: string; icon: typeof Hand }[] = [
  { tool: "pan", label: "Pan", icon: Hand },
  { tool: "pen", label: "Pen", icon: Pencil },
  { tool: "rect", label: "Rectangle", icon: Square },
  { tool: "arrow", label: "Arrow", icon: ArrowUpRight },
  { tool: "text", label: "Text", icon: Type },
];
const COLORS = [
  { value: "#ff4d5e", name: "Red" },
  { value: "#3ecf8e", name: "Green" },
  { value: "#ffd23f", name: "Yellow" },
  { value: "#4d8dff", name: "Blue" },
  { value: "#ffffff", name: "White" },
];
const STAGES = ["Pre-trade", "Entry", "Management", "Exit", "Review"];
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface View {
  scale: number;
  x: number;
  y: number;
}

export function ScreenshotViewer({
  screenshot,
  canEdit,
  onClose,
  onChanged,
}: {
  screenshot: TradeScreenshot;
  /** False while the trade is in the trash. */
  canEdit: boolean;
  onClose: () => void;
  /** The screenshot list should reload (caption/deletion). */
  onChanged: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const image = useAsset(screenshot.assetId);
  const imageUrl = image.url;

  const loadVersions = useCallback(
    (repos: JournalRepositories) => repos.screenshots.listVersions(screenshot.id),
    [screenshot.id],
  );
  const versionsQuery = useJournalQuery(loadVersions);
  const versions = versionsQuery.status === "ready" ? versionsQuery.data : [];

  const [selected, setSelected] = useState<string | null>(null); // version id, "original", or null = latest
  const activeVersion =
    selected === "original" ? null : (versions.find((v) => v.id === selected) ?? versions.at(-1) ?? null);

  const [annotating, setAnnotating] = useState(false);
  const [draft, setDraft] = useState<AnnotationShape[]>([]);
  const [preview, setPreview] = useState<AnnotationShape | null>(null);
  const [tool, setTool] = useState<Tool>("pan");
  const [color, setColor] = useState(COLORS[0]!.value);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("Entry");
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [base, setBase] = useState({ width: 0, height: 0, left: 0, top: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; view: View } | null>(null);
  const [panning, setPanning] = useState(false);
  const drawStart = useRef<[number, number] | null>(null);

  // Open as a modal on mount.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Fit the image into the stage, and refit on resize.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const { width: cw, height: ch } = stage.getBoundingClientRect();
      const s = Math.min(cw / screenshot.width, ch / screenshot.height, 1) * 0.96;
      const width = screenshot.width * s;
      const height = screenshot.height * s;
      setBase({ width, height, left: (cw - width) / 2, top: (ch - height) / 2 });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [screenshot.width, screenshot.height]);

  const zoomBy = useCallback((factor: number, origin?: { x: number; y: number }) => {
    setView((v) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor));
      const k = scale / v.scale;
      const o = origin ?? { x: 0, y: 0 };
      return { scale, x: o.x - (o.x - v.x) * k, y: o.y - (o.y - v.y) * k };
    });
  }, []);
  const resetView = () => setView({ scale: 1, x: 0, y: 0 });

  function stagePoint(clientX: number, clientY: number) {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left - base.left - base.width / 2, y: clientY - rect.top - base.top - base.height / 2 };
  }

  /** Pointer position as 0–1 image coordinates. */
  function imagePoint(clientX: number, clientY: number): [number, number] {
    const rect = contentRef.current!.getBoundingClientRect();
    return [clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height)];
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, stagePoint(event.clientX, event.clientY));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const activeTool = annotating ? tool : "pan";
    if (activeTool === "pan") {
      drag.current = { startX: event.clientX, startY: event.clientY, view };
      setPanning(true);
      return;
    }
    const p = imagePoint(event.clientX, event.clientY);
    if (activeTool === "text") {
      if (text.trim()) setDraft((d) => [...d, { kind: "text", color, x: p[0], y: p[1], text: text.trim() }]);
      else setStatus({ kind: "error", message: "Type the text first, then click where it goes." });
      return;
    }
    drawStart.current = p;
    if (activeTool === "pen") setPreview({ kind: "pen", color, points: [p, p] });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) {
      const d = drag.current;
      setView({ ...d.view, x: d.view.x + event.clientX - d.startX, y: d.view.y + event.clientY - d.startY });
      return;
    }
    const start = drawStart.current;
    if (!start) return;
    const p = imagePoint(event.clientX, event.clientY);
    if (tool === "pen") {
      setPreview((prev) => {
        if (prev?.kind !== "pen") return prev;
        const last = prev.points.at(-1)!;
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.002) return prev;
        return { ...prev, points: [...prev.points, p] };
      });
    } else if (tool === "rect") {
      setPreview({
        kind: "rect",
        color,
        x: Math.min(start[0], p[0]),
        y: Math.min(start[1], p[1]),
        w: Math.abs(p[0] - start[0]),
        h: Math.abs(p[1] - start[1]),
      });
    } else if (tool === "arrow") {
      setPreview({ kind: "arrow", color, x1: start[0], y1: start[1], x2: p[0], y2: p[1] });
    }
  }

  function onPointerUp() {
    drag.current = null;
    setPanning(false);
    drawStart.current = null;
    if (preview) {
      const tiny =
        (preview.kind === "rect" && (preview.w < 0.003 || preview.h < 0.003)) ||
        (preview.kind === "arrow" && Math.hypot(preview.x2 - preview.x1, preview.y2 - preview.y1) < 0.005);
      if (!tiny) setDraft((d) => [...d, preview]);
      setPreview(null);
    }
  }

  function startAnnotating() {
    setDraft(activeVersion ? [...activeVersion.shapes] : []);
    setTool("pen");
    setStatus(null);
    setAnnotating(true);
  }

  async function saveVersion() {
    try {
      const version = await saveAnnotationVersion(getRepositories(), screenshot.id, { label, shapes: draft });
      setAnnotating(false);
      setSelected(version.id);
      setStatus({ kind: "saved", message: `Saved as new version "${version.label}".` });
      versionsQuery.reload();
      onChanged();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  // Keyboard: +/- zoom, 0 reset, ctrl+z undo while annotating.
  function onKeyDown(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea")) return;
    if (event.key === "+" || event.key === "=") zoomBy(1.25);
    else if (event.key === "-") zoomBy(1 / 1.25);
    else if (event.key === "0") resetView();
    else if (annotating && event.key === "z" && (event.ctrlKey || event.metaKey)) setDraft((d) => d.slice(0, -1));
    else return;
    event.preventDefault();
  }

  const shapes = annotating ? [...draft, ...(preview ? [preview] : [])] : (activeVersion?.shapes ?? []);
  const cursor = annotating && tool !== "pan" ? "cursor-crosshair" : panning ? "cursor-grabbing" : "cursor-grab";

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (annotating) setAnnotating(false);
        else onClose();
      }}
      onKeyDown={onKeyDown}
      aria-label={`Screenshot ${screenshot.caption || screenshot.fileName}`}
      className="m-0 h-dvh max-h-none w-dvw max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/60 px-4 py-2">
          <p className="mr-auto max-w-[30ch] truncate text-sm font-medium" title={screenshot.fileName}>
            {screenshot.caption || screenshot.fileName || "Screenshot"}
          </p>

          {!annotating && (
            <label className="flex items-center gap-2 text-xs text-white/70">
              Version
              <Select
                value={selected ?? activeVersion?.id ?? "original"}
                onChange={(e) => setSelected(e.target.value)}
                className="h-8 w-48 border-white/20 bg-white/10 py-1 text-white"
              >
                <option value="original">Original (no annotations)</option>
                {versions.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    {i + 1}. {v.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <ToolbarButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
              <Minus className="size-4" />
            </ToolbarButton>
            <span className="w-12 text-center font-mono text-xs tabular-nums">{Math.round(view.scale * 100)}%</span>
            <ToolbarButton label="Zoom in" onClick={() => zoomBy(1.25)}>
              <Plus className="size-4" />
            </ToolbarButton>
            <ToolbarButton label="Reset zoom" onClick={resetView}>
              <RotateCcw className="size-4" />
            </ToolbarButton>
          </div>

          {canEdit && !annotating && (
            <>
              <Button variant="primary" onClick={startAnnotating}>
                <Pencil aria-hidden className="size-4" />
                Annotate
              </Button>
              <ToolbarButton label="Delete screenshot" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" />
              </ToolbarButton>
            </>
          )}
          <ToolbarButton label="Close viewer" onClick={onClose}>
            <X className="size-5" />
          </ToolbarButton>
        </div>

        {/* Annotation toolbar */}
        {annotating && (
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-black/60 px-4 py-2 text-sm">
            <div className="flex gap-1" role="radiogroup" aria-label="Tool">
              {TOOLS.map(({ tool: t, label: l, icon: Icon }) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tool === t}
                  aria-label={l}
                  title={l}
                  onClick={() => setTool(t)}
                  className={cn(
                    "rounded-md p-2 focus-visible:outline-2 focus-visible:outline-white",
                    tool === t ? "bg-white text-black" : "hover:bg-white/15",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              ))}
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label="Colour">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={color === c.value}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "size-7 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                    color === c.value ? "border-white" : "border-transparent",
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            {tool === "text" && (
              <Input
                aria-label="Annotation text"
                placeholder="Type text, then click the image"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="h-8 w-60 border-white/20 bg-white/10 py-1 text-white"
              />
            )}
            <ToolbarButton label="Undo" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={draft.length === 0}>
              <Undo2 className="size-4" />
            </ToolbarButton>
            <Button variant="ghost" className="text-white hover:bg-white/15" onClick={() => setDraft([])} disabled={draft.length === 0}>
              Clear
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Input
                aria-label="Version name"
                list="annotation-stages"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 w-36 border-white/20 bg-white/10 py-1 text-white"
              />
              <datalist id="annotation-stages">
                {STAGES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <Button variant="primary" onClick={saveVersion}>
                Save as new version
              </Button>
              <Button variant="ghost" className="text-white hover:bg-white/15" onClick={() => setAnnotating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Image stage */}
        <div
          ref={stageRef}
          className={cn("relative flex-1 touch-none overflow-hidden select-none", cursor)}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {base.width > 0 && (
            <div
              ref={contentRef}
              className="absolute"
              style={{
                left: base.left,
                top: base.top,
                width: base.width,
                height: base.height,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                transformOrigin: "center",
              }}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable
                <img src={imageUrl} alt={screenshot.caption || "Trade screenshot"} draggable={false} className="size-full" />
              ) : (
                <div className="flex size-full items-center justify-center text-sm text-white/60">
                  {image.status === "missing" ? "Image not available — it wasn't included in the restored backup." : "Loading image…"}
                </div>
              )}
              <AnnotationLayer
                shapes={shapes}
                width={screenshot.width}
                height={screenshot.height}
                className="pointer-events-none absolute inset-0 size-full"
              />
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-black/60 px-4 py-2 text-xs text-white/70">
          {canEdit && !annotating ? <CaptionEditor screenshot={screenshot} onSaved={onChanged} /> : null}
          <FormStatus status={status} />
          <span className="ml-auto">
            {screenshot.width}×{screenshot.height} · scroll to zoom, drag to pan · +/−/0 keys
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this screenshot?"
        confirmLabel="Delete screenshot"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteScreenshot(getRepositories(), screenshot.id);
            setConfirmDelete(false);
            onChanged();
            onClose();
          } catch (error) {
            setConfirmDelete(false);
            setStatus({ kind: "error", message: errorMessage(error) });
          }
        }}
      >
        The image and all {versions.length} annotation version{versions.length === 1 ? "" : "s"} will be removed. The
        deletion is recorded in the trade&apos;s change history.
      </ConfirmDialog>
    </dialog>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-2 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}

function CaptionEditor({ screenshot, onSaved }: { screenshot: TradeScreenshot; onSaved: () => void }) {
  const [caption, setCaption] = useState(screenshot.caption);
  const dirty = caption !== screenshot.caption;
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await updateCaption(getRepositories(), screenshot.id, caption.trim());
        onSaved();
      }}
    >
      <Input
        aria-label="Caption"
        placeholder="Add a caption"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        className="h-8 w-72 border-white/20 bg-white/10 py-1 text-white"
      />
      {dirty && (
        <Button type="submit" variant="primary" className="h-8 py-1">
          Save caption
        </Button>
      )}
    </form>
  );
}
