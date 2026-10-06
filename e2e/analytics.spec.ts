import { expect, test, type Page } from "@playwright/test";

async function requireNothing(page: Page) {
  await page.goto("/settings");
  const boxes = page.locator('input[name="requiredFields"]');
  await expect(boxes.first()).toBeVisible();
  for (const box of await boxes.all()) await box.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();
  await page.getByLabel("Starting balance (USD)").fill("10000");
  await page.getByRole("button", { name: "Save balance" }).click();
  await expect(page.getByText("Starting balance saved.")).toBeVisible();

  await page.reload();
  await expect(boxes.first()).toBeVisible();
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();
}

/** Open, exit and close a 1-lot ES trade. */
async function closedTrade(page: Page, direction: "Long" | "Short", entry: number, exit: number, emotion?: string) {
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("ESZ6");
  await page.getByText(direction, { exact: true }).click();
  await page.getByLabel("Entry price").fill(String(entry));
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ESZ6");
  if (emotion) {
    await page.getByText("Psychology", { exact: true }).click();
    const before = page.locator("div.rounded-lg", { has: page.getByRole("heading", { name: /Before trade/ }) });
    await before.getByText(emotion, { exact: true }).click();
    await before.getByRole("button", { name: "Save" }).click();
    await expect(before.getByText("Saved.")).toBeVisible();
  }
  const timeline = page.locator("section", { hasText: "Timeline" });
  await timeline.getByLabel("Price").fill(String(exit));
  await timeline.getByRole("button", { name: "Add fill" }).click();
  await page.getByRole("button", { name: "Close trade" }).click();
  await expect(page.getByText("Trade closed.")).toBeVisible();
}

test("analytics, calendar and dashboard reflect closed trades", async ({ page }) => {
  await requireNothing(page);
  await closedTrade(page, "Long", 5000, 5010, "Calm"); // +$500
  await closedTrade(page, "Short", 5000, 5004, "FOMO"); // −$200

  // Analytics: KPIs with sample size, equity chart, breakdowns with drill-down.
  await page.goto("/analytics");
  const kpis = page.getByRole("region", { name: "Key statistics" });
  await expect(kpis.getByText("2 closed trades")).toBeVisible();
  await expect(kpis.getByText("+$300.00")).toBeVisible();
  await expect(kpis.getByText("50.0%")).toBeVisible();
  await expect(page.getByRole("img", { name: /Equity from \$10,000\.00 to \$10,300\.00 over 2 trades/ })).toBeVisible();

  await page.getByLabel("Group by").selectOption("direction");
  const breakdown = page.locator("section", { hasText: "Breakdown" });
  await expect(breakdown.getByRole("rowheader", { name: "Long" })).toBeVisible();
  await breakdown.getByRole("button", { name: "Short" }).click();
  await expect(breakdown.getByText("-$200.00").first()).toBeVisible();

  // Filters narrow everything.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("group", { name: "Direction" }).getByRole("button", { name: "Long" }).click();
  await expect(kpis.getByText("1 closed trade")).toBeVisible();
  await expect(kpis.getByText("+$500.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(kpis.getByText("2 closed trades")).toBeVisible();

  // Psychology and pattern sections are present and honest about sample size.
  await expect(page.locator("section", { hasText: "Most common emotions" }).getByRole("cell", { name: "FOMO" }).first()).toBeVisible();
  await expect(page.getByText(/Pattern detection starts at 20 closed trades in view \(2 now\)/)).toBeVisible();

  // Calendar: today's cell shows the day's P&L; clicking lists the trades.
  await page.goto("/calendar");
  const today = page.getByRole("button", { name: /: \+\$300\.00, 2 trades/ });
  await expect(today).toBeVisible();
  await today.click();
  await expect(page.getByRole("link", { name: "ESZ6" })).toHaveCount(2);

  // Dashboard snapshot.
  await page.goto("/");
  await expect(page.getByText("Performance snapshot")).toBeVisible();
  await expect(page.getByText("$10,300.00")).toBeVisible();
});
