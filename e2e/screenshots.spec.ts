import { expect, test } from "@playwright/test";

test("add, view and annotate a screenshot", async ({ page }) => {
  // Open a trade.
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("MNQZ6");
  await page.getByLabel("Entry price").fill("20000");
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("MNQZ6");

  // Make a real 800×450 PNG in the browser.
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#123456";
    ctx.fillRect(0, 0, 800, 450);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await page.getByText("Screenshots / chart analysis").click();
  await page.getByLabel("Add screenshots").setInputFiles({
    name: "chart.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect(page.getByText("1 screenshot added.")).toBeVisible();

  // Open the viewer from the thumbnail.
  await page.getByRole("button", { name: "chart.png" }).click();
  const viewer = page.getByRole("dialog", { name: /Screenshot/ });
  await expect(viewer.getByRole("img", { name: "Trade screenshot" })).toBeVisible();

  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(viewer.getByText("125%")).toBeVisible();
  await viewer.getByRole("button", { name: "Reset zoom" }).click();

  // Draw a rectangle and save it as a version.
  await viewer.getByRole("button", { name: "Annotate" }).click();
  await viewer.getByRole("radio", { name: "Rectangle" }).click();
  const box = (await viewer.getByRole("img", { name: "Trade screenshot" }).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();

  await viewer.getByLabel("Version name").fill("Entry");
  await viewer.getByRole("button", { name: "Save as new version" }).click();
  await expect(viewer.getByText('Saved as new version "Entry".')).toBeVisible();
  await expect(viewer.locator("svg rect")).toHaveCount(1);
  await expect(viewer.getByRole("combobox")).toContainText("1. Entry");

  // The original stays available.
  await viewer.getByRole("combobox").selectOption("original");
  await expect(viewer.locator("svg rect")).toHaveCount(0);

  await viewer.getByRole("button", { name: "Close viewer" }).click();
  await expect(viewer).toBeHidden();
});
