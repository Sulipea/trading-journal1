import { expect, test, type Page } from "@playwright/test";

async function requireNothing(page: Page) {
  await page.goto("/settings");
  const boxes = page.locator('input[name="requiredFields"]');
  await expect(boxes.first()).toBeVisible();
  for (const box of await boxes.all()) await box.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();
}

async function closedTrade(page: Page, exit: number) {
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("ESZ6");
  await page.getByLabel("Entry price").fill("5000");
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ESZ6");
  const timeline = page.locator("section", { hasText: "Timeline" });
  await timeline.getByLabel("Price").fill(String(exit));
  await timeline.getByRole("button", { name: "Add fill" }).click();
  await page.getByRole("button", { name: "Close trade" }).click();
  await expect(page.getByText("Trade closed.")).toBeVisible();
}

test("weekly review is generated, findings can be starred, and closed trades get a trade review", async ({ page }) => {
  await requireNothing(page);
  await closedTrade(page, 5010); // +$500
  await closedTrade(page, 4996); // −$200

  // The closed trade shows its automatic review.
  const tradeReview = page.locator("section", { hasText: "Trade review" });
  await expect(tradeReview.getByText("Summary", { exact: true })).toBeVisible();
  await expect(tradeReview.getByText(/Long ESZ6, -\$200\.00 net/)).toBeVisible();
  await expect(tradeReview.getByText("Review questions")).toBeVisible();

  // Reviews are created automatically.
  await page.goto("/reviews");
  const weekly = page.getByRole("link", { name: /Week of [\s\S]*\+\$300\.00[\s\S]*2 closed trades/ });
  await expect(weekly).toBeVisible();
  await weekly.click();
  await expect(page.getByRole("heading", { level: 1, name: /Week of/ })).toBeVisible();
  for (const section of ["Performance", "Mistakes & rules", "Psychology", "Forecast accuracy", "Execution", "Setups"]) {
    await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  }
  const summary = page.getByRole("listitem").filter({ hasText: "+$300.00 net over 2 closed trades" });
  await expect(summary.getByText("Data-backed observation")).toBeVisible();
  await summary.getByRole("button", { name: "Show 2 supporting trades" }).click();
  await expect(summary.getByRole("link", { name: "ESZ6" })).toHaveCount(2);

  // Star it; it survives regeneration and shows up elsewhere.
  await summary.getByRole("button", { name: "Mark as important" }).click();
  await expect(summary.getByRole("button", { name: "Unmark as important" })).toBeVisible();
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.getByText("Review regenerated from the latest data.")).toBeVisible();
  await expect(summary.getByRole("button", { name: "Unmark as important" })).toBeVisible();

  await page.getByLabel("Review notes").fill("Cut the loser faster.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved.")).toBeVisible();

  await page.goto("/reviews");
  await page.getByRole("button", { name: /Important findings/ }).click();
  await expect(page.getByText("+$300.00 net over 2 closed trades")).toBeVisible();

  await page.goto("/");
  const findings = page.locator("section", { hasText: "Recent review findings" });
  await expect(findings.getByText("+$300.00 net over 2 closed trades")).toBeVisible();
  await expect(findings.getByLabel("Important")).toBeVisible();
});
