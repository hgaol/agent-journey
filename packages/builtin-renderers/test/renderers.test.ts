import { describe, expect, it } from "vitest";
import { assertRendererConformance } from "@agentjourney/plugin-sdk/testing";
import { builtInStylePacks, rendererForSourceAgent } from "../src/index.js";

describe("built-in Renderer Plugins", () => {
  it("uses the public Renderer conformance contract", () => {
    expect(builtInStylePacks).toHaveLength(5);
    for (const renderer of builtInStylePacks) expect(() => assertRendererConformance(renderer)).not.toThrow();
  });

  it.each(["claude-code", "codex-cli", "pi", "github-copilot-cli"])(
    "selects a source-native default for %s",
    (sourceAgent) => expect(rendererForSourceAgent(sourceAgent).manifest.targetSourceAgent).toBe(sourceAgent)
  );

  it.each([
    ["claude-code", "0.3.0", "--stage-human:#373737", "--stage-accent:#ca7c5e"],
    ["github-copilot-cli", "0.4.0", "--stage-human:#0c0c0c", "--stage-accent:#61d6d6"],
    ["pi", "0.3.0", "--stage-human:#343540", "--stage-accent:#95bdb7"]
  ])("uses screenshot-sampled colors and native hierarchy for %s", (sourceAgent, version, panel, accent) => {
    const renderer = rendererForSourceAgent(sourceAgent);
    expect(renderer.manifest.version).toBe(version);
    expect(renderer.css).toContain("--stage-bg:#292c33");
    expect(renderer.css).toContain(panel);
    expect(renderer.css).toContain(accent);
  });

  it("matches the installed Copilot CLI ANSI palette and tool hierarchy", () => {
    const renderer = rendererForSourceAgent("github-copilot-cli");
    for (const color of ["#61d6d6", "#b4b4b4", "#bc44a7", "#16c60c", "#f9f1a5", "#3b78ff", "#0c0c0c"]) {
      expect(renderer.css).toContain(color);
    }
    expect(renderer.css).toContain(".tool-native-summary{display:flex");
    expect(renderer.css).toContain('content:"Shell"');
    expect(renderer.css).toContain(".stage-native-workspace{display:block");
  });

  it("keeps Pi's native reasoning and tool-state treatments", () => {
    const renderer = rendererForSourceAgent("pi");
    expect(renderer.css).toContain("background:#2a3229!important");
    expect(renderer.css).toContain("background:#392928!important");
    expect(renderer.css).toContain("--stage-expand-reasoning:1");
  });

  it("uses Neutral Fallback for unknown Source Agents", () => {
    expect(rendererForSourceAgent("future-agent").manifest.id).toBe("builtin.neutral");
  });
});
