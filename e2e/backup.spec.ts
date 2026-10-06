import { expect, test, type Page } from "@playwright/test";

async function openTrade(page: Page, symbol: string, price: string) {
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill(symbol);
  await page.getByLabel("Entry price").fill(price);
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(symbol);
}

test("export a backup, change the journal, restore it, and undo from the safety snapshot", async ({ page }, testInfo) => {
  await openTrade(page, "NQZ6", "18000");

  await page.goto("/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^trading-journal-\d{4}-\d{2}-\d{2}-\d{4}\.tjbackup$/);
  const backupPath = testInfo.outputPath("journal.tjbackup");
  await download.saveAs(backupPath);

  await openTrade(page, "ESZ6", "5000");

  await page.goto("/settings");
  await page.getByLabel("Backup file to restore").setInputFiles(backupPath);
  const dialog = page.getByRole("dialog", { name: "Replace your journal with this backup?" });
  await expect(dialog).toContainText("1 trades");
  await expect(dialog).toContainText("Your current journal (2 trades) will be replaced entirely.");
  // The app reloads once the restore is committed.
  await Promise.all([page.waitForEvent("load"), dialog.getByRole("button", { name: "Restore backup" }).click()]);
  await page.goto("/trades");
  await expect(page.getByRole("link", { name: /NQZ6/ }).first()).toBeVisible();
  await expect(page.getByText("ESZ6")).toHaveCount(0);

  // The restore can be undone from the snapshot taken just before it.
  await page.goto("/settings");
  const snapshots = page.getByRole("list", { name: "Snapshots" });
  const safety = snapshots.getByRole("listitem").filter({ hasText: "Before restore · 2 trades" });
  await safety.getByRole("button", { name: "Restore" }).click();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("dialog").getByRole("button", { name: "Restore backup" }).click(),
  ]);
  await page.goto("/trades");
  await expect(page.getByRole("link", { name: /ESZ6/ }).first()).toBeVisible();
});

test("a file that isn't a backup is refused without changing anything", async ({ page }, testInfo) => {
  const bogus = testInfo.outputPath("notes.tjbackup");
  await (await import("node:fs/promises")).writeFile(bogus, "hello");
  await page.goto("/settings");
  await page.getByLabel("Backup file to restore").setInputFiles(bogus);
  await expect(page.getByRole("alert").filter({ hasText: "Nothing was changed." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("reminders show as dismissible banners and on quick entry", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Add reminder" }).click();
  await page.getByLabel("Custom reminder message").fill("Check the economic calendar");
  await page.getByLabel("Custom reminder time").fill("00:00");
  const days = page.getByRole("group", { name: "Days for Custom reminder" });
  await days.getByLabel("Sat").check();
  await days.getByLabel("Sun").check();
  await page.getByRole("button", { name: "Save reminders" }).click();
  await expect(page.getByText("Reminders saved.")).toBeVisible();

  await page.goto("/");
  const banner = page.getByRole("region", { name: "Reminders" });
  await expect(banner.getByText("Check the economic calendar")).toBeVisible();
  await banner.getByRole("button", { name: "Dismiss reminder: Check the economic calendar" }).click();
  await expect(page.getByText("Check the economic calendar")).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(4_000); // past the first reminder check
  await expect(page.getByText("Check the economic calendar")).toHaveCount(0);

  await page.goto("/trades/new");
  await expect(page.getByText("does this match your forecast")).toBeVisible();
});

test("new forecasts start from the forecast defaults", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Confidence").selectOption("HIGH");
  await page.getByLabel("Condition tags").fill("Trending, FOMC");
  await page.getByRole("button", { name: "Save forecast defaults" }).click();
  await expect(page.getByText("Forecast defaults saved.")).toBeVisible();

  await page.goto("/forecasts");
  await page.getByRole("button", { name: "Create today's forecast" }).click();
  await expect(page.getByLabel("Confidence", { exact: true })).toHaveValue("HIGH");
});
