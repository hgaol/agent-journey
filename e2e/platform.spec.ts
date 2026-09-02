import { expect, test } from "@playwright/test";

test("opening the Vite URL directly completes local authorization", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5173/");
  await expect(page.getByRole("heading", { name: "Revisit how the work unfolded." })).toBeVisible();
  await context.close();
});

test("reviews and re-renders a captured Journey", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Revisit how the work unfolded." })).toBeVisible();
  await expect(page.getByText("Read the greeting file.")).toBeVisible();
  await page.getByText("Read the greeting file.").click();

  await expect(page.getByTestId("terminal-replay-debugger")).toBeVisible();
  await expect(page.locator(".terminal-session-title strong")).toHaveText("Read the greeting file.");
  await expect(page.getByLabel("Terminal session replay")).toBeVisible();
  const stage = page.frameLocator("iframe.journey-stage");
  await expect(stage.getByText("The file contains the greeting constant.", { exact: true })).toBeVisible();
  await expect(page.locator("iframe.journey-stage")).toHaveAttribute("title", "Pi Journey Stage");

  await page.getByLabel("Renderer").selectOption("builtin.codex-cli");
  await expect(page.locator("iframe.journey-stage")).toHaveAttribute("title", "Codex Journey Stage");
  await expect(stage.getByText("The file contains the greeting constant.", { exact: true })).toBeVisible();

  await page.getByLabel("Renderer").selectOption("example.compact-renderer");
  await expect(page.locator("iframe.journey-stage")).toHaveAttribute("title", "Compact Renderer Journey Stage");
  await expect(stage.getByRole("heading", { name: /Custom Journey Stage/u })).toBeVisible();

  await page.getByRole("button", { name: "REPLAY", exact: true }).click();
  await expect(page.getByLabel("Agent Thread replay lanes")).toBeVisible();
  await expect(page.locator(".terminal-pane-header")).toContainText("REPLAY");
  await expect(page.locator(".terminal-transport > span")).toContainText("1/");
  await page.locator(".terminal-play").click();
  await expect(page.locator(".terminal-transport > span")).not.toContainText("1/");
  await page.getByRole("button", { name: "Evidence" }).click();
  await expect(page.getByRole("dialog", { name: "Source Evidence inspector" })).toBeVisible();
  await expect(page.getByText("Exact Source Bundle")).toBeVisible();
});

test("terminal transcript fills the available center pane", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Read the greeting file.").click();
  await page.getByTestId("terminal-replay-debugger").waitFor();
  const pane = await page.getByLabel("Terminal session replay").boundingBox();
  const stage = await page.locator(".terminal-stage-frame").boundingBox();
  expect(pane).not.toBeNull();
  expect(stage).not.toBeNull();
  expect(stage!.height).toBeGreaterThan(pane!.height * 0.75);
  expect(Math.abs((stage!.y + stage!.height) - (pane!.y + pane!.height))).toBeLessThan(2);
});

test("shows source consent and archive operations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sources" }).click();
  await expect(page.getByRole("heading", { name: "Source Roots" })).toBeVisible();
  for (const name of ["Claude Code", "OpenAI Codex CLI", "Pi", "GitHub Copilot CLI"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Archive operations" })).toBeVisible();
  await expect(page.getByText("Journey Package import")).toBeVisible();
  await expect(page.getByText("Local Plugins")).toBeVisible();
});
