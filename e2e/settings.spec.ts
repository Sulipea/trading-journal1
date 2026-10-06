import { expect, test } from "@playwright/test";

test("sessions can be renamed, hidden and added, and show up on trades", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Session 1 name").fill("Tokyo");
  await page.locator("li", { has: page.getByLabel("Session 2 name") }).getByRole("button", { name: "Hide" }).click();
  await page.getByRole("button", { name: "Add session" }).click();
  await page.getByLabel("Session 6 name").fill("RTH close");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();

  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("NQZ6");
  await page.getByLabel("Entry price").fill("18000");
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("NQZ6");

  await page.getByText("Market data").click();
  const session = page.getByRole("combobox", { name: /^Session/ });
  await expect(session.locator("option")).toHaveText(["—", "Tokyo", "New York AM", "New York lunch", "New York PM", "RTH close"]);
  await session.selectOption({ label: "RTH close" });
  await page.locator("details", { hasText: "Market conditions" }).getByRole("button", { name: "Save" }).click();
  await expect(page.locator("details", { hasText: "Market conditions" }).getByText("Saved.")).toBeVisible();
});

test("saving the starting balance keeps unsaved preference edits", async ({ page }) => {
  await page.goto("/settings");
  const boxes = page.locator('input[name="requiredFields"]');
  await expect(boxes.first()).toBeVisible();
  for (const box of await boxes.all()) await box.uncheck();
  await page.getByLabel("Starting balance (USD)").fill("10000");
  await page.getByRole("button", { name: "Save balance" }).click();
  await expect(page.getByText("Starting balance saved.")).toBeVisible();
  await expect(page.locator('input[name="requiredFields"]:checked')).toHaveCount(0);
});
