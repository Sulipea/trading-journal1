import { expect, test, type Page } from "@playwright/test";

async function requireNothing(page: Page) {
  await page.goto("/settings");
  const boxes = page.locator('input[name="requiredFields"]');
  await expect(boxes.first()).toBeVisible();
  for (const box of await boxes.all()) await box.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();
}

async function closedTrade(page: Page) {
  await page.goto("/trades/new");
  await page.getByLabel("Contract symbol").fill("ESZ6");
  await page.getByLabel("Entry price").fill("5000");
  await page.getByRole("button", { name: "Open trade" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ESZ6");
  const timeline = page.locator("section", { hasText: "Timeline" });
  await timeline.getByLabel("Price").fill("5010");
  await timeline.getByRole("button", { name: "Add fill" }).click();
  await page.getByRole("button", { name: "Close trade" }).click();
  await expect(page.getByText("Trade closed.")).toBeVisible();
}

test("without server credentials, AI is explained and everything else works", async ({ page, request }) => {
  const status = await (await request.get("/api/ai")).json();
  test.skip(status.configured, "This machine has AI credentials configured.");
  expect(status).toEqual({ configured: false, provider: null, model: null });
  const post = await request.post("/api/ai", { data: { task: "PATTERNS", context: {} } });
  expect(post.status()).toBe(503);
  expect((await post.json()).code).toBe("NOT_CONFIGURED");

  await page.goto("/settings");
  await expect(page.getByText("Not configured")).toBeVisible();
  await expect(page.getByText(/set ANTHROPIC_API_KEY on the server/)).toBeVisible();

  await requireNothing(page);
  await closedTrade(page);
  await expect(page.locator("section", { hasText: "AI review" }).getByText("AI isn't configured on the server.")).toBeVisible();

  await page.goto("/ask");
  await expect(page.getByText("AI isn't configured on the server.")).toBeVisible();
});

const statement = (label: string, text: string, refs: string[] = [], evidence = "") => ({ label, text, refs, evidence });

test("with AI enabled: automatic post-close review, chat, and failures that don't affect trades", async ({ page }) => {
  let failNext = false;
  const posted: { task: string; images?: unknown[] }[] = [];
  // Stand in for the server: report AI as configured and answer each task.
  await page.route("**/api/ai", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { configured: true, provider: "anthropic", model: "claude-sonnet-5" } });
    }
    const body = route.request().postDataJSON();
    posted.push(body);
    if (failNext) {
      return route.fulfill({ status: 429, json: { ok: false, code: "RATE_LIMITED", error: "The AI provider is busy. Try again shortly." } });
    }
    if (body.task === "TRADE_REVIEW") {
      const sections = ["ruleViolations", "forecastAdherence", "psychology", "execution", "qualityVsOutcome", "similarTrades"];
      return route.fulfill({
        json: {
          ok: true,
          model: "claude-sonnet-5",
          output: {
            summary: [statement("DATA_BACKED_OBSERVATION", "You made +$500 on this long.", ["T0"], "netPnl 500")],
            ...Object.fromEntries(sections.map((s) => [s, []])),
            reviewQuestions: [statement("REVIEW_QUESTION", "What told you to hold to the target?")],
          },
        },
      });
    }
    return route.fulfill({
      json: {
        ok: true,
        model: "claude-sonnet-5",
        output: {
          statements: [
            statement("DATA_BACKED_OBSERVATION", "Your only trade was a winner.", ["T0"], "1 trade, +$500"),
            statement("POSSIBLE_PATTERN", "Unsupported claim with no evidence.", ["T42"], ""),
          ],
        },
      },
    });
  });

  await page.goto("/settings");
  await expect(page.getByText("Available — off")).toBeVisible();
  await page.getByRole("button", { name: "Turn AI on" }).click();
  await expect(page.getByText("AI turned on.")).toBeVisible();

  await requireNothing(page);
  await closedTrade(page);

  // The review runs automatically after close, with no screenshots.
  const aiCard = page.locator("section", { hasText: "AI review" });
  await expect(aiCard.getByText("You made +$500 on this long.")).toBeVisible();
  await expect(aiCard.getByText("Data-backed observation")).toBeVisible();
  await expect(aiCard.getByText("Evidence: netPnl 500")).toBeVisible();
  await expect(aiCard.getByText("T0 (this trade)")).toBeVisible();
  expect(posted[0]).toMatchObject({ task: "TRADE_REVIEW", images: [] });

  // A failed run is recorded and the trade is unaffected.
  failNext = true;
  await aiCard.getByRole("button", { name: "Run a new AI review" }).click();
  await expect(aiCard.getByText(/The AI provider is busy\. Try again shortly\. Your trade is unaffected\./)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Closed");
  failNext = false;

  // Chat: answers are labelled; unsupported claims are downgraded and unknown trades ignored.
  await page.goto("/ask");
  await page.getByLabel("Your question").fill("How am I doing?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Your only trade was a winner.")).toBeVisible();
  await expect(page.getByText("Shown as an interpretation: it cited no trades or figures.")).toBeVisible();
  await expect(page.getByText(/Ignored references to trades that weren't provided: T42/)).toBeVisible();
  await page.getByRole("link", { name: "T0" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ESZ6");
});
