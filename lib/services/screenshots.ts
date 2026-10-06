/**
 * Trade screenshots and annotation versions (spec §13).
 *
 * Screenshots can be added at any point, including after close. Annotating
 * never overwrites: every save creates a new version, so earlier stages are
 * preserved.
 */
import { newId, nowIso } from "@/lib/domain/ids";
import type {
  AnnotationShape,
  EntityId,
  ScreenshotAnnotationVersion,
  TradeScreenshot,
} from "@/lib/domain/types";
import type { JournalRepositories } from "@/lib/repositories/types";
import { TradeServiceError, assertStillComplete, change, loadActiveTrade } from "./trades";

export interface PreparedImage {
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  blob: Blob;
  thumbnail: Blob;
}

export async function addScreenshot(
  repos: JournalRepositories,
  tradeId: EntityId,
  image: PreparedImage,
  now: string = nowIso(),
): Promise<TradeScreenshot> {
  return repos.transaction(async () => {
    const trade = await loadActiveTrade(repos, tradeId);
    const assetId = newId();
    const thumbnailAssetId = newId();
    const screenshot: TradeScreenshot = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      tradeId,
      fileName: image.fileName,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      byteSize: image.blob.size,
      caption: "",
      assetId,
      thumbnailAssetId,
    };
    await repos.assets.put({ id: assetId, createdAt: now, mimeType: image.mimeType, blob: image.blob });
    await repos.assets.put({
      id: thumbnailAssetId,
      createdAt: now,
      mimeType: image.thumbnail.type || "image/jpeg",
      blob: image.thumbnail,
    });
    await repos.screenshots.save(screenshot);
    await repos.trades.save({ ...trade, updatedAt: now });
    await repos.changeHistory.add([change(trade, "screenshot.added", null, image.fileName || "screenshot", now)]);
    return screenshot;
  });
}

async function loadScreenshot(repos: JournalRepositories, id: EntityId): Promise<TradeScreenshot> {
  const screenshot = await repos.screenshots.get(id);
  if (!screenshot) throw new TradeServiceError("Screenshot not found.", "NOT_FOUND");
  return screenshot;
}

export async function updateCaption(
  repos: JournalRepositories,
  screenshotId: EntityId,
  caption: string,
  now: string = nowIso(),
): Promise<void> {
  await repos.transaction(async () => {
    const screenshot = await loadScreenshot(repos, screenshotId);
    if (screenshot.caption === caption) return;
    const trade = await loadActiveTrade(repos, screenshot.tradeId);
    await repos.screenshots.save({ ...screenshot, caption, updatedAt: now });
    await repos.changeHistory.add([change(trade, "screenshot.caption", screenshot.caption, caption, now)]);
  });
}

/** Save annotations as a new version. Existing versions are never modified. */
export async function saveAnnotationVersion(
  repos: JournalRepositories,
  screenshotId: EntityId,
  input: { label: string; shapes: AnnotationShape[] },
  now: string = nowIso(),
): Promise<ScreenshotAnnotationVersion> {
  return repos.transaction(async () => {
    const screenshot = await loadScreenshot(repos, screenshotId);
    const trade = await loadActiveTrade(repos, screenshot.tradeId);
    const label = input.label.trim();
    if (!label) throw new Error("Give this annotation version a name, e.g. Entry or Review.");
    const version: ScreenshotAnnotationVersion = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      screenshotId,
      tradeId: screenshot.tradeId,
      label,
      shapes: input.shapes,
    };
    await repos.screenshots.saveVersion(version);
    await repos.changeHistory.add([change(trade, "screenshot.annotated", null, label, now)]);
    return version;
  });
}

/** Delete a screenshot with all its versions and image data. */
export async function deleteScreenshot(
  repos: JournalRepositories,
  screenshotId: EntityId,
  now: string = nowIso(),
): Promise<void> {
  await repos.transaction(async () => {
    const screenshot = await loadScreenshot(repos, screenshotId);
    const trade = await loadActiveTrade(repos, screenshot.tradeId);
    const remaining = (await repos.screenshots.listForTrade(trade.id)).length - 1;
    await assertStillComplete(repos, trade, { screenshotCount: remaining });

    await repos.screenshots.deleteVersionsForScreenshot(screenshotId);
    await repos.screenshots.delete(screenshotId);
    await repos.assets.delete([screenshot.assetId, screenshot.thumbnailAssetId]);
    await repos.trades.save({ ...trade, updatedAt: now });
    await repos.changeHistory.add([
      change(trade, "screenshot.deleted", screenshot.fileName || "screenshot", null, now),
    ]);
  });
}
