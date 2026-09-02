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

  it("uses Neutral Fallback for unknown Source Agents", () => {
    expect(rendererForSourceAgent("future-agent").manifest.id).toBe("builtin.neutral");
  });
});
