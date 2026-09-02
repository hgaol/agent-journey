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

test("Claude Code renderer follows the native TUI visual hierarchy", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Inspect greeting module", { exact: true }).click();
  const stage = page.frameLocator("iframe.journey-stage");
  const body = stage.locator("body");
  const human = stage.locator('.activity[data-kind="human-input"]').first();
  const artifact = stage.locator('.activity[data-kind="artifact"]').first();
  const payload = stage.locator(".activity-payload").first();
  const toolArgument = stage.locator(".tool-argument").first();
  await expect(body).toHaveCSS("background-color", "rgb(43, 45, 50)");
  await expect(human).toHaveCSS("background-color", "rgb(58, 58, 58)");
  await expect(human).toHaveCSS("border-left-width", "0px");
  await expect(artifact).toBeHidden();
  await expect(payload).toBeHidden();
  await expect(toolArgument).toHaveText("src/greeting.ts");
  await expect(toolArgument).toHaveCSS("color", "rgb(189, 199, 255)");
  await expect(page.locator(".terminal-native-path")).toHaveCSS("color", "rgb(141, 184, 232)");
  const assistantActivity = await stage.locator('.activity[data-kind="agent-output"]').first().boundingBox();
  const assistantMarker = await stage.locator('.activity[data-kind="agent-output"] .activity-marker').first().boundingBox();
  const assistantText = await stage.locator('.activity[data-kind="agent-output"] .activity-text').first().boundingBox();
  expect(assistantActivity).not.toBeNull();
  expect(assistantMarker).not.toBeNull();
  expect(assistantText).not.toBeNull();
  expect(assistantText!.x - assistantActivity!.x).toBeLessThan(28);
  const markerCenter = assistantMarker!.y + assistantMarker!.height / 2;
  const textFirstLineCenter = assistantText!.y + 11.5;
  expect(Math.abs(markerCenter - textFirstLineCenter)).toBeLessThan(2);
});

test("GitHub Copilot CLI renderer follows its native colorful TUI hierarchy", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Check the greeting implementation.", { exact: true }).click();
  const stage = page.frameLocator("iframe.journey-stage");
  await expect(stage.locator("body")).toHaveCSS("background-color", "rgb(43, 45, 50)");
  await expect(stage.locator(".stage-native-tabs")).toBeVisible();
  await expect(stage.getByText("Model changed to copilot-test-model", { exact: true })).toBeVisible();
  await expect(stage.locator(".stage-head")).toBeHidden();
  await expect(stage.locator('.activity[data-kind="human-input"]').first()).toHaveCSS(
    "background-color",
    "rgb(8, 9, 10)"
  );
  const shell = stage.locator('.activity[data-native-name="shell"]').first();
  await expect(shell.locator(".activity-marker")).toHaveCSS("color", "rgb(232, 213, 107)");
  await expect(shell.locator(".link-token")).toHaveCSS("color", "rgb(102, 208, 222)");
  await expect(stage.locator('.activity[data-kind="context-injection"]').first()).toBeHidden();
  await expect(stage.locator(".stage-native-composer")).toBeVisible();
});

test("replays Claude Code sessions with untimed control records placed by source order", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Inspect greeting module", { exact: true }).click();
  await page.getByRole("button", { name: "REPLAY", exact: true }).click();
  await expect(page.locator(".terminal-play")).toBeEnabled();
  await expect(page.locator(".terminal-transport > small")).toContainText(
    "untimed · source-order placement"
  );
  await page.locator(".terminal-play").click();
  await expect(page.locator(".terminal-transport > span")).not.toContainText("1/");
});

test("offers clearly labeled simulated TUI streaming when recorded chunks are unavailable", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Read the greeting file.").click();
  const streaming = page.getByLabel("Content streaming");
  await expect(streaming.locator("option[value=recorded]")).toBeDisabled();
  await streaming.selectOption("simulated");
  await expect(page.locator(".terminal-pane-header")).toContainText("simulated stream");
  await page.locator(".terminal-play").click();
  await expect(page.locator(".terminal-transport > small")).toContainText("SIMULATED cadence", {
    timeout: 5000
  });
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
