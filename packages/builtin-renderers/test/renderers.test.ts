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
    ["claude-code", "0.4.0", "--stage-human:#3a3a3a", "--stage-accent:#d78787"],
    ["codex-cli", "0.2.0", "--stage-human:#292c33", "--stage-accent:#00cdcd"],
    ["github-copilot-cli", "0.4.1", "--stage-human:#0c0c0c", "--stage-accent:#61d6d6"],
    ["pi", "0.4.1", "--stage-human:#343541", "--stage-accent:#8abeb7"]
  ])("uses captured native colors and hierarchy for %s", (sourceAgent, version, panel, accent) => {
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
    expect(renderer.css).toContain(':not(:has(.collapsed-activity)){display:none}');
  });

  it("matches the installed Claude Code mascot, prompt, and editor treatments", () => {
    const renderer = rendererForSourceAgent("claude-code");
    expect(renderer.css).toContain("▐▛███▛█");
    expect(renderer.css).toContain("--stage-muted:#949494");
    expect(renderer.css).toContain("--stage-border:#808080");
    expect(renderer.css).toContain("color:#afd7ff");
  });

  it("matches the installed Codex card, transcript, and status treatments", () => {
    const renderer = rendererForSourceAgent("codex-cli");
    expect(renderer.css).toContain('content:">_"');
    expect(renderer.css).toContain('content:"›"');
    expect(renderer.css).toContain('content:"Searched the web for"');
    expect(renderer.css).toContain("color:#f6e2b7");
    expect(renderer.css).toContain("color:#abdfa7");
  });

  it("keeps Pi's native reasoning and tool-state treatments", () => {
    const renderer = rendererForSourceAgent("pi");
    expect(renderer.css).toContain("background:#283228!important");
    expect(renderer.css).toContain("background:#3c2828!important");
    expect(renderer.css).toContain("--stage-expand-reasoning:1");
    expect(renderer.css).toContain('data-thinking-level="medium"');
    expect(renderer.css).toContain("border-color:#81a2be");
    expect(renderer.css).toContain("height:38px;margin:auto 0 0 2.5px");
    expect(renderer.css).toContain("width:8.5px;height:18.5px;margin-left:0");
  });

  it("uses Neutral Fallback for unknown Source Agents", () => {
    expect(rendererForSourceAgent("future-agent").manifest.id).toBe("builtin.neutral");
  });
});
