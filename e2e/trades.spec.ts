import { expect, test, type Page } from "@playwright/test";

/** Only require a planned stop, so the flow stays short. */
async function requireOnlyPlannedStop(page: Page) {
  await page.goto("/settings");
  for (const label of ["Planned target", "Session", "Trade reasoning", "Psychology after trade"]) {
    await page.getByLabel(label, { exact: true }).uncheck();
  }
  await page.getByLabel("Planned stop", { exact: true }).check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();
}

async function openQuickTrade(page: Page) {
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("esz6");
  await expect(page.getByText("E-mini S&P 500 · $12.50 per tick")).toBeVisible();
  await page.getByLabel("Entry price").fill("5000");
  await page.getByLabel("Contracts").fill("2");
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ESZ6");
}

test("quick entry → exit → close validation → close → lock", async ({ page }) => {
  await requireOnlyPlannedStop(page);
  await openQuickTrade(page);

  // Exit the whole position.
  const timeline = page.locator("section", { hasText: "Timeline" });
  await timeline.getByLabel("Price").fill("5010");
  await timeline.getByRole("button", { name: "Add fill" }).click();
  await expect(page.getByText("Position is flat. Before closing, complete: Planned stop.")).toBeVisible();

  // Closing is refused while required fields are missing.
  await page.getByRole("button", { name: "Close trade" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Missing: Planned stop" })).toBeVisible();

  // Complete the risk section.
  const risk = page.locator("details", { hasText: "Planned vs actual" });
  await risk.getByLabel("Planned stop").fill("4995");
  await risk.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Ready to close.")).toBeVisible();

  await page.getByRole("button", { name: "Close trade" }).click();
  await expect(page.getByText("Trade closed.")).toBeVisible();
  await expect(page.getByText("+$1,000.00")).toBeVisible();
  await expect(page.getByText("+2.00R")).toBeVisible();
  await expect(page.getByText("These fields are locked")).toBeVisible();

  // Unlocking makes locked fields editable again.
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("These fields are locked")).toBeHidden();
  await expect(risk.getByLabel("Fees & commissions (USD)")).toBeEnabled();
});

test("trash, restore and permanent delete", async ({ page }) => {
  await openQuickTrade(page);

  await page.getByRole("button", { name: "Move to trash" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to trash" }).click();
  await expect(page).toHaveURL(/\/trades$/);
  await expect(page.getByText("No trades yet.")).toBeVisible();

  await page.getByRole("link", { name: "Trash" }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("ESZ6 restored.")).toBeVisible();
  await expect(page.getByText("The trash is empty.")).toBeVisible();

  await page.goto("/trades");
  await page.getByRole("link", { name: /ESZ6/ }).click();
  await page.getByRole("button", { name: "Move to trash" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to trash" }).click();
  await page.goto("/trades/trash");

  await page.getByRole("button", { name: "Delete permanently" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("This cannot be undone.");
  await dialog.getByRole("button", { name: "Yes, delete forever" }).click();
  await expect(page.getByText("ESZ6 permanently deleted.")).toBeVisible();
  await expect(page.getByText("The trash is empty.")).toBeVisible();
});
