import { expect, test, type FrameLocator, type Page } from "@playwright/test";

async function expectNativeChromeDocked(page: Page, stage: FrameLocator): Promise<void> {
  const frameBox = await page.locator("iframe.journey-stage").boundingBox();
  const footerBox = await stage.locator(".stage-native-footer").boundingBox();
  expect(frameBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(Math.abs((frameBox!.y + frameBox!.height) - (footerBox!.y + footerBox!.height))).toBeLessThan(1);
}

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

test("Pi renderer follows its native TUI visual hierarchy", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Read the greeting file.", { exact: true }).click();
  await page.getByLabel("Renderer").selectOption("builtin.pi");
  const stage = page.frameLocator("iframe.journey-stage");
  await expect(stage.locator("body")).toHaveCSS("background-color", "rgb(41, 44, 51)");
  await expect(stage.locator(".brand-mark")).toBeHidden();
  await expect(stage.locator(".stage-title")).toHaveCSS("color", "rgb(149, 189, 183)");
  await expect(stage.locator('.activity[data-kind="human-input"]').first()).toHaveCSS(
    "background-color",
    "rgb(52, 53, 64)"
  );
  await expect(stage.locator('.activity[data-kind="reasoning"] details').first()).toHaveAttribute("open", "");
  await expect(stage.locator('.activity[data-kind="tool-invocation"]').first()).toHaveCSS(
    "background-color",
    "rgb(42, 50, 41)"
  );
  await expect(stage.locator('.activity[data-kind="tool-invocation"][data-native-name="bash"]')).toHaveCSS(
    "background-color",
    "rgb(57, 41, 40)"
  );
  await expect(stage.locator('.activity[data-kind="tool-invocation"][data-native-name="bash"] .tool-timeout')).toHaveText(
    "(timeout 30s)"
  );
  const failedToolResult = stage.locator('.activity[data-kind="tool-result"][data-status="failed"]');
  await expect(failedToolResult).toHaveCSS("background-color", "rgb(57, 41, 40)");
  await expect(failedToolResult.locator(".tool-duration")).toHaveText("Took 1.0s");
  await expect(stage.locator(".markdown-heading")).toHaveCSS("color", "rgb(233, 200, 128)");
  await expect(stage.locator(".markdown-list-marker")).toHaveText("1.");
  await expect(stage.locator(".markdown-list-marker")).toHaveCSS("color", "rgb(149, 189, 183)");
  await expect(stage.locator(".stage-native-composer")).toBeVisible();
  await expect(stage.locator(".stage-native-composer")).toHaveCSS("border-top-color", "rgb(136, 161, 187)");
  await expectNativeChromeDocked(page, stage);
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
  await expect(body).toHaveCSS("background-color", "rgb(41, 44, 51)");
  await expect(human).toHaveCSS("background-color", "rgb(55, 55, 55)");
  await expect(human).toHaveCSS("border-left-width", "0px");
  await expect(artifact).toBeHidden();
  await expect(payload).toBeHidden();
  await expect(toolArgument).toHaveText("src/greeting.ts");
  await expect(toolArgument).toHaveCSS("color", "rgb(178, 185, 244)");
  await expect(page.locator(".terminal-native-path")).toHaveCSS("color", "rgb(141, 184, 232)");
  const assistantActivity = await stage.locator('.activity[data-kind="agent-output"]').first().boundingBox();
  const assistantMarker = await stage.locator('.activity[data-kind="agent-output"] .activity-marker').first().boundingBox();
  const assistantText = await stage.locator('.activity[data-kind="agent-output"] .activity-text').first().boundingBox();
  expect(assistantActivity).not.toBeNull();
  expect(assistantMarker).not.toBeNull();
  expect(assistantText).not.toBeNull();
  expect(assistantText!.x - assistantActivity!.x).toBeLessThan(28);
  const markerCenter = assistantMarker!.y + assistantMarker!.height / 2;
  const textFirstLineCenter = assistantText!.y + assistantText!.height / 2;
  expect(Math.abs(markerCenter - textFirstLineCenter)).toBeLessThan(2);
  await expect(stage.locator('.activity[data-kind="reasoning"]')).toBeHidden();
  await expect(stage.locator(".stage-native-composer")).toBeVisible();
  await expect(stage.locator(".stage-native-footer")).toBeVisible();
  await expectNativeChromeDocked(page, stage);
});

test("renders prose around inline Markdown tokens without dropping content", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Inspect greeting module", { exact: true }).click();
  await page.getByLabel("Renderer").selectOption("builtin.claude-code");
  const stage = page.frameLocator("iframe.journey-stage");
  const formattedOutput = stage
    .locator('.activity[data-kind="agent-output"]')
    .filter({ has: stage.locator(".markdown-list-marker") });
  await expect(formattedOutput).toHaveCount(1);
  const renderedText = formattedOutput.locator(".activity-text");
  await expect(renderedText).toContainText("The formal-style update compiled cleanly");
  await expect(renderedText).toContainText("Icons removed");
  await expect(renderedText).toContainText("Links de-emphasized");
  await expect(renderedText).toContainText("Bolder name heading");
  await expect(renderedText).toContainText("Darker section rule");
  await expect(renderedText).toContainText("Verified by rebuilding all three variants");
});

test("GitHub Copilot CLI renderer follows its native colorful TUI hierarchy", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Check the greeting implementation.", { exact: true }).click();
  const stage = page.frameLocator("iframe.journey-stage");
  await expect(stage.locator("body")).toHaveCSS("background-color", "rgb(41, 44, 51)");
  await expect(stage.locator(".stage-native-tabs")).toBeVisible();
  await expect(stage.locator(".stage-native-tabs .active")).toHaveCSS("background-color", "rgb(128, 211, 213)");
  await expect(stage.getByText("Model changed to copilot-test-model", { exact: true })).toBeVisible();
  await expect(stage.locator(".stage-head")).toBeHidden();
  const copilotPrompt = stage.locator('.activity[data-kind="human-input"]').first();
  await expect(copilotPrompt).toHaveCSS("background-color", "rgb(12, 12, 12)");
  await expect(copilotPrompt.locator(".activity-time-full")).toBeHidden();
  await expect(copilotPrompt.locator(".activity-time-clock")).toHaveText(/^\d{1,2}:\d{2}$/u);
  const shell = stage.locator('.activity[data-native-name="shell"]').first();
  await expect(shell.locator(".activity-marker")).toHaveCSS("color", "rgb(248, 241, 174)");
  await expect(shell.locator(".link-token")).toHaveCSS("color", "rgb(128, 211, 213)");
  await expect(stage.locator('.activity[data-kind="agent-output"] .activity-marker').first()).toHaveCSS(
    "color",
    "rgb(174, 76, 163)"
  );
  const copilotToolResults = stage.locator('.activity[data-kind="tool-result"]');
  await expect(copilotToolResults).toHaveCount(2);
  await expect(copilotToolResults.first()).toBeHidden();
  await expect(copilotToolResults.last()).toBeHidden();
  await expect(stage.locator('.activity[data-kind="context-injection"]').first()).toBeHidden();
  await expect(stage.locator(".stage-native-composer")).toBeVisible();
  await expectNativeChromeDocked(page, stage);
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
  const streamingSpeed = page.getByLabel("Streaming speed");
  await expect(streamingSpeed).toBeVisible();
  await streamingSpeed.selectOption("8");
  await expect(streamingSpeed).toHaveValue("8");
  await page.locator(".terminal-play").click();
  await expect(page.locator(".terminal-transport > small")).toContainText("SIMULATED cadence", {
    timeout: 5000
  });
  await expect(page.locator(".terminal-transport > small")).toContainText("stream 8×");
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
