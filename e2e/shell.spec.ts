import { expect, test } from "@playwright/test";

const SECTIONS = [
  "Trades",
  "Calendar",
  "Forecasts",
  "Setups",
  "Rules",
  "Analytics",
  "Reviews",
  "Settings",
] as const;

test("dashboard loads from an empty local journal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Based on 0 closed trades")).toBeVisible();
  await expect(page.getByText("Starting balance not set")).toBeVisible();
});

test("sidebar navigates to every section", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });

  for (const section of SECTIONS) {
    await nav.getByRole("link", { name: section, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: section })).toBeVisible();
    await expect(nav.getByRole("link", { name: section, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("New Trade is always available", async ({ page }) => {
  await page.goto("/analytics");
  await page.getByRole("link", { name: "New Trade" }).click();
  await expect(page).toHaveURL(/\/trades\/new$/);
  await expect(page.getByRole("heading", { level: 1, name: "New Trade" })).toBeVisible();
});
