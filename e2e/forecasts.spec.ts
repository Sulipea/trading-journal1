import { expect, test } from "@playwright/test";

test("forecast: draft → finalize → revise → snapshot → link trade → levels → review", async ({ page }) => {
  // Create today's forecast.
  await page.goto("/forecasts");
  await page.getByRole("button", { name: "Create today's forecast" }).click();
  await expect(page.getByText("Edit freely, then finalize.")).toBeVisible();

  await page.getByLabel("Bias", { exact: true }).selectOption("BULLISH");
  await page.getByLabel("Confidence", { exact: true }).selectOption("HIGH");
  await page.getByLabel("GEX regime").selectOption("POSITIVE");
  await page.getByLabel("GEX value").fill("1.5");

  await page.getByRole("button", { name: "Add level" }).click();
  const level = page.getByRole("group", { name: "Key level 1" });
  await level.getByLabel("Price", { exact: true }).fill("5010");
  await level.getByLabel("Label").fill("PDH");
  await level.getByLabel("Type").selectOption("PRIOR_HIGH");
  await level.getByText("ES", { exact: true }).click();
  await level.getByLabel("Expected reaction").selectOption("REJECTION");

  await page.getByRole("button", { name: "Add scenario" }).click();
  const scenario = page.getByRole("group", { name: "Scenario 1" });
  await scenario.getByLabel("Title").fill("Gap fill");
  await scenario.getByLabel("IF").fill("Opens below prior close");
  await scenario.getByLabel("THEN").fill("Fills the gap");
  await scenario.getByLabel("INVALIDATION").fill("Loses overnight low");

  // Finalize saves the editor content first.
  await page.getByRole("button", { name: "Finalize…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Finalize" }).click();
  await expect(page.getByText("Forecast finalized.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Original forecast" })).toBeVisible();
  await expect(page.getByText("Fills the gap")).toBeVisible();

  // Revise with a reason.
  await page.getByRole("button", { name: "Create revision" }).click();
  await page.getByLabel("Bias", { exact: true }).selectOption("NEUTRAL");
  await page.getByLabel("Why did the forecast change?").fill("Weak open");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByText("Revision 1 saved with 1 change.")).toBeVisible();
  const timeline = page.locator("section", { hasText: "Revision timeline" });
  await expect(timeline.getByText("Weak open")).toBeVisible();
  await expect(timeline.getByText("Bias: Bullish → Neutral")).toBeVisible();

  // A snapshot that updates the forecast creates another revision.
  const snapshots = page.locator("section", { hasText: "Market-condition snapshots" });
  await snapshots.getByLabel("Bias now").selectOption("BEARISH");
  await snapshots.getByLabel("Conditions", { exact: true }).fill("Trend day down");
  await snapshots.getByLabel("Update the forecast with these conditions").check();
  await snapshots.getByRole("button", { name: "Add snapshot" }).click();
  await expect(snapshots.getByText("→ created revision 2")).toBeVisible();
  const forecastUrl = page.url();
  // Entry times are recorded to the second; make sure the trade is clearly after revision 2.
  await page.waitForTimeout(1100);

  // Trade linked to the forecast, partially followed.
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("ESZ6");
  await page.getByLabel("Entry price").fill("5000");
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ESZ6");
  const fills = page.locator("section", { hasText: "Timeline" });
  await fills.getByLabel("Price").fill("5010");
  await fills.getByRole("button", { name: "Add fill" }).click();

  await page.getByText("Forecast / context").click();
  await page.getByLabel("Scenario", { exact: true }).selectOption({ label: "Gap fill" });
  await page.getByText("Partially", { exact: true }).click();
  await page.getByLabel("How did it differ?").fill("Entered before the trigger");
  await page.locator("details", { hasText: "Did this trade follow your forecast?" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Partially followed · deviation")).toBeVisible();
  await expect(page.getByText(/Active at entry: revision 2 · Bearish — your long was against it/)).toBeVisible();

  // Back on the forecast: detected level touch, then the end-of-day review.
  await page.goto(forecastUrl);
  const levels = page.locator("section", { hasText: "Key levels — what happened" });
  await expect(levels.getByText("Detected a touch from 1 trade fill.")).toBeVisible();
  await levels.getByLabel("Outcome").selectOption("REJECTION");
  await levels.getByRole("button", { name: "Confirm touch" }).click();
  await expect(levels.getByText("Saved.")).toBeVisible();

  await page.getByLabel("Actual market direction").selectOption("BEARISH");
  await page.getByLabel("Gap fill").selectOption("PLAYED_OUT");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("Review saved.")).toBeVisible();

  const accuracy = page.locator("section", { hasText: "Did the expected market scenario" });
  await expect(accuracy.getByText("✗ Wrong")).toBeVisible();
  await expect(accuracy.getByText("✓ Correct")).toBeVisible();
  await expect(accuracy.getByText("Yes — improved")).toBeVisible();
  const execution = page.locator("section", { hasText: "Did you trade according to the forecast?" });
  await expect(execution.getByText("Entered before the trigger")).toBeVisible();

  // Overview lists it with the deviation.
  await page.goto("/forecasts");
  await expect(page.getByRole("cell", { name: "✓ Correct" })).toBeVisible();
  await expect(page.getByText("(1 deviation)")).toBeVisible();
});
