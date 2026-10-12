import { expect, test } from "@playwright/test";

test("news day, VIX and manual R: entry, editing, trade list and analytics", async ({ page }) => {
  // Only a planned stop is required to close, to keep the flow short.
  await page.goto("/settings");
  for (const label of ["Planned target", "Session", "Trade reasoning", "Psychology after trade"]) {
    await page.getByLabel(label, { exact: true }).uncheck();
  }
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();

  // Quick entry with market context.
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("ESZ6");
  await page.getByLabel("Entry price").fill("5000");
  await page.getByLabel("News day").selectOption("yes");
  await page.getByLabel("News event").fill("CPI");
  await page.getByLabel("VIX at entry").fill("16.4");
  await page.getByLabel("VIX direction").selectOption("SUPPORTING");
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ESZ6");

  // The values show in the trade's Market data section.
  const market = page.locator("details", { hasText: "Market conditions" });
  await page.getByText("Market data").click();
  await expect(market.getByLabel("News day")).toHaveValue("yes");
  await expect(market.getByLabel("News event")).toHaveValue("CPI");
  await expect(market.getByLabel("VIX at entry")).toHaveValue("16.4");
  await expect(market.getByLabel("VIX direction")).toHaveValue("SUPPORTING");

  // Exit, add a stop, and enter R by hand.
  const timeline = page.locator("section", { hasText: "Timeline" });
  await timeline.getByLabel("Price").fill("5010");
  await timeline.getByRole("button", { name: "Add fill" }).click();
  await expect(page.getByText("Position is flat. Before closing, complete: Planned stop.")).toBeVisible();
  const risk = page.locator("details", { hasText: "Planned vs actual" });
  await risk.getByLabel("Planned stop").fill("4995");
  await risk.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Ready to close.")).toBeVisible();
  await expect(risk.getByText("(+2.00R)")).toBeVisible();
  await risk.getByLabel("Result in R entered manually").fill("1.5");
  await risk.getByRole("button", { name: "Save" }).click();
  await expect(risk.getByText("+1.50R (manual)")).toBeVisible();
  await page.getByRole("button", { name: "Close trade" }).click();
  await expect(page.getByText("Trade closed.")).toBeVisible();

  // Trade list shows the new columns and the manual R.
  await page.goto("/trades");
  const row = page.getByRole("row", { name: /ESZ6/ });
  await expect(row.getByRole("cell", { name: "CPI" })).toBeVisible();
  await expect(row.getByRole("cell", { name: "16.40 · Supporting" })).toBeVisible();
  await expect(row.getByText("+1.50R")).toBeVisible();
  await expect(row.getByText("(manual)")).toBeVisible();

  // Analytics can group and filter by both.
  await page.goto("/analytics");
  await page.getByLabel("Group by").selectOption({ label: "VIX direction" });
  const breakdownRow = page.locator("tbody").getByRole("row", { name: /Supporting/ });
  await expect(breakdownRow).toContainText("100%");
  await expect(breakdownRow).toContainText("+1.50R");
  await page.getByLabel("Group by").selectOption({ label: "News day" });
  await expect(page.locator("tbody").getByRole("row", { name: /News day/ })).toBeVisible();

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("group", { name: "News day" }).getByRole("button", { name: "No news" }).click();
  await expect(page.getByText("No data for this dimension in the trades shown.").or(page.getByText(/No closed trades/))).toBeVisible();
  await page.getByRole("group", { name: "News day" }).getByRole("button", { name: "News day" }).click();
  await page.getByRole("group", { name: "VIX direction" }).getByRole("button", { name: "Supporting" }).click();
  await page.getByLabel("Group by").selectOption({ label: "News day" });
  await expect(page.locator("tbody").getByRole("row", { name: /News day/ })).toContainText("+1.50R");
});
