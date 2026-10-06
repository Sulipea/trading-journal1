import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JournalDb } from "@/lib/db/journal-db";
import { newId } from "@/lib/domain/ids";
import { createDexieRepositories } from "@/lib/repositories/dexie";
import type { JournalRepositories } from "@/lib/repositories/types";
import {
  addScreenshot,
  deleteScreenshot,
  saveAnnotationVersion,
  updateCaption,
  type PreparedImage,
} from "./screenshots";
import { TradeServiceError, addFill, closeTrade, createQuickTrade, loadTradeWorkspace } from "./trades";

let db: JournalDb;
let repos: JournalRepositories;

beforeEach(async () => {
  db = new JournalDb(`screenshots-test-${newId()}`);
  repos = createDexieRepositories(db);
  const settings = await repos.settings.getApp();
  await repos.settings.saveApp({ ...settings, requiredFields: [] });
});

afterEach(async () => {
  await db.delete();
});

const image: PreparedImage = {
  fileName: "chart.png",
  mimeType: "image/png",
  width: 1600,
  height: 900,
  blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
  thumbnail: new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
};

async function trade() {
  return createQuickTrade(repos, {
    symbol: "NQZ6",
    direction: "SHORT",
    entryPrice: 18000,
    contracts: 1,
    timestamp: "2026-10-06T14:00:00.000Z",
  });
}

describe("screenshots", () => {
  it("stores the image and thumbnail locally and lists the screenshot", async () => {
    const t = await trade();
    const shot = await addScreenshot(repos, t.id, image);

    const ws = await loadTradeWorkspace(repos, t.id);
    expect(ws.screenshots).toEqual([shot]);
    expect(shot.byteSize).toBe(4);
    expect(await repos.assets.get(shot.assetId)).toBeDefined();
    expect(await repos.assets.get(shot.thumbnailAssetId)).toBeDefined();
    expect(ws.history.map((h) => h.field)).toContain("screenshot.added");
  });

  it("keeps every annotation version", async () => {
    const t = await trade();
    const shot = await addScreenshot(repos, t.id, image);
    await saveAnnotationVersion(repos, shot.id, {
      label: "Entry",
      shapes: [{ kind: "rect", color: "#ff0000", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
    });
    await saveAnnotationVersion(repos, shot.id, {
      label: "Review",
      shapes: [{ kind: "arrow", color: "#00ff00", x1: 0, y1: 0, x2: 0.5, y2: 0.5 }],
    });

    const versions = await repos.screenshots.listVersions(shot.id);
    expect(versions.map((v) => v.label)).toEqual(["Entry", "Review"]);
    expect(versions[0]!.shapes[0]).toMatchObject({ kind: "rect" });
  });

  it("rejects out-of-range annotation coordinates and unnamed versions", async () => {
    const t = await trade();
    const shot = await addScreenshot(repos, t.id, image);
    await expect(
      saveAnnotationVersion(repos, shot.id, {
        label: "Bad",
        shapes: [{ kind: "rect", color: "#ff0000", x: 1.5, y: 0, w: 0.1, h: 0.1 }],
      }),
    ).rejects.toThrow();
    await expect(saveAnnotationVersion(repos, shot.id, { label: " ", shapes: [] })).rejects.toThrow();
  });

  it("can be added and captioned after the trade closes", async () => {
    const t = await trade();
    await addFill(repos, t.id, {
      type: "EXIT",
      price: 17990,
      quantity: 1,
      timestamp: "2026-10-06T14:30:00.000Z",
      reason: "",
      notes: "",
    });
    await closeTrade(repos, t.id);
    const shot = await addScreenshot(repos, t.id, image);
    await updateCaption(repos, shot.id, "Post-trade review");
    expect((await repos.screenshots.get(shot.id))?.caption).toBe("Post-trade review");
  });

  it("deletes a screenshot with its versions and image data", async () => {
    const t = await trade();
    const shot = await addScreenshot(repos, t.id, image);
    await saveAnnotationVersion(repos, shot.id, { label: "Entry", shapes: [] });
    await deleteScreenshot(repos, shot.id);

    expect(await repos.screenshots.listForTrade(t.id)).toEqual([]);
    expect(await repos.screenshots.listVersions(shot.id)).toEqual([]);
    expect(await repos.assets.get(shot.assetId)).toBeUndefined();
  });

  it("won't delete the last screenshot of a closed trade that requires one", async () => {
    const settings = await repos.settings.getApp();
    await repos.settings.saveApp({ ...settings, requiredFields: ["screenshot"] });
    const t = await trade();
    const shot = await addScreenshot(repos, t.id, image);
    await addFill(repos, t.id, {
      type: "EXIT",
      price: 17990,
      quantity: 1,
      timestamp: "2026-10-06T14:30:00.000Z",
      reason: "",
      notes: "",
    });
    await closeTrade(repos, t.id);

    await expect(deleteScreenshot(repos, shot.id)).rejects.toBeInstanceOf(TradeServiceError);
  });
});
