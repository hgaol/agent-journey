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

  await expect(page.getByRole("heading", { name: "Read the greeting file." })).toBeVisible();
  const stage = page.frameLocator("iframe.journey-stage");
  await expect(stage.getByText("The file contains the greeting constant.", { exact: true })).toBeVisible();
  await expect(page.locator("iframe.journey-stage")).toHaveAttribute("title", "Pi Journey Stage");

  await page.getByLabel("Renderer").selectOption("builtin.codex-cli");
  await expect(page.locator("iframe.journey-stage")).toHaveAttribute("title", "Codex Journey Stage");
  await expect(stage.getByText("The file contains the greeting constant.", { exact: true })).toBeVisible();

  await page.getByLabel("Renderer").selectOption("example.compact-renderer");
  await expect(page.locator("iframe.journey-stage")).toHaveAttribute("title", "Compact Renderer Journey Stage");
  await expect(stage.getByRole("heading", { name: /Custom Journey Stage/u })).toBeVisible();

  await page.getByRole("button", { name: "Replay" }).click();
  await expect(page.getByLabel("Agent Thread replay lanes")).toBeVisible();
  await page.getByRole("button", { name: "Evidence" }).click();
  await expect(page.getByRole("dialog", { name: "Source Evidence inspector" })).toBeVisible();
  await expect(page.getByText("Exact Source Bundle")).toBeVisible();
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
