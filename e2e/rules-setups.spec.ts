import { expect, test, type Page } from "@playwright/test";

async function requireNothingGlobally(page: Page) {
  await page.goto("/settings");
  const boxes = page.locator('input[name="requiredFields"]');
  await expect(boxes.first()).toBeVisible();
  for (const box of await boxes.all()) await box.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();
}

test("rules, setups, checklist violations, skipped requirements and quality", async ({ page }) => {
  await requireNothingGlobally(page);

  // A rule group with a high-severity required rule.
  await page.goto("/rules");
  await page.getByRole("button", { name: "New group" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Entries");
  await page.getByRole("dialog").getByRole("button", { name: "Save group" }).click();
  await expect(page.getByRole("heading", { name: "Entries" })).toBeVisible();

  await page.getByRole("button", { name: "New rule" }).click();
  const ruleDialog = page.getByRole("dialog");
  await ruleDialog.getByLabel("Name").fill("No chasing");
  await ruleDialog.getByText("High", { exact: true }).click();
  await expect(ruleDialog.getByText("flag the trade for review")).toBeVisible();
  await ruleDialog.getByLabel("Group").selectOption({ label: "Entries" });
  await ruleDialog.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText('Rule "No chasing" saved.')).toBeVisible();

  // A setup that also requires an execution rating.
  await page.goto("/setups/new");
  await page.getByLabel("Name").fill("Opening drive");
  await page.getByLabel("Execution rating").check();
  await page.getByRole("button", { name: "Create setup" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Opening drive" })).toBeVisible();

  // Trade: open, exit, choose the setup.
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("ESZ6");
  await page.getByLabel("Entry price").fill("5000");
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ESZ6");
  const timeline = page.locator("section", { hasText: "Timeline" });
  await timeline.getByLabel("Price").fill("5010");
  await timeline.getByRole("button", { name: "Add fill" }).click();

  await page.getByLabel("Setup", { exact: true }).selectOption({ label: "Opening drive" });
  await page.locator("details", { hasText: "Manage setups" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Setup saved.")).toBeVisible();
  await expect(page.getByText(/Before closing, complete: Execution rating; and finish the checklist: No chasing/)).toBeVisible();

  // Skip the setup requirement with a reason.
  await page.getByRole("button", { name: "Skip with reason" }).click();
  await page.getByLabel("Reason for skipping Execution rating").fill("Rate it at the weekly review");
  await page.getByRole("button", { name: "Skip requirement" }).click();
  await expect(page.getByText("Reason: Rate it at the weekly review")).toBeVisible();

  // Record a high-severity violation: needs acknowledgment and a reason, then flags the trade.
  const rule = page.getByRole("listitem").filter({ hasText: "No chasing" });
  await rule.getByRole("button", { name: "Violated" }).click();
  const save = rule.getByRole("button", { name: "Save violation" });
  await expect(save).toBeDisabled();
  await rule.getByLabel("I acknowledge I broke this rule").check();
  await rule.getByLabel(/Why\?/).fill("Entered after the move had run");
  await save.click();
  await expect(page.getByText("1 rule violation recorded on this trade.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Review");

  await page.getByRole("button", { name: "Close trade" }).click();
  await expect(page.getByText("Trade closed.")).toBeVisible();

  // Quality reflects the process (violation + skipped requirement), not the winning outcome.
  const quality = page.locator("section", { hasText: "Trade quality" });
  await expect(quality.getByText("Poor process · win")).toBeVisible();

  // Rule analytics show the violation with its sample size.
  await page.goto("/rules");
  const analytics = page.locator("section", { hasText: "Rule analytics" });
  await expect(analytics.getByText("1 / 1")).toBeVisible();
  await expect(analytics.getByText("small sample").first()).toBeVisible();
});
