import { describe, expect, it } from "vitest";
import type { StageDocument } from "@agentjourney/contracts";
import type { RendererPlugin } from "@agentjourney/plugin-sdk";
import { renderPresentationHtml } from "../src/index.js";

const stage: StageDocument = {
  schemaVersion: "1.0.0",
  journeyId: "journey",
  revisionId: "revision",
  interpretationId: "interpretation",
  sourceAgent: "pi",
  title: "<script>bad</script>",
  activities: [
    { id: "prompt", kind: "human-input", evidenceAnchor: "file#L1", threadId: "main", sourceOrder: 1, timestamp: "2026-01-01T00:00:00.000Z", text: "Show the TUI" },
    { id: "a", kind: "agent-output", evidenceAnchor: "file#L2", threadId: "main", sourceOrder: 2, timestamp: "2026-01-01T00:00:01.000Z", text: "<img src=x onerror=bad>" }
  ],
  threads: [{ id: "main" }],
  turns: [{ id: "turn", activityIds: ["prompt", "a"], boundaryProvenance: "inferred" }],
  annotations: [],
  fidelity: { contentKinds: ["agent-output"], timedKinds: [], deliveryTraces: false, agentThreads: false, causalLinks: false, terminalStream: false, knownGaps: [] },
  sensitiveFindingCount: 0,
  coverageSummary: { sourceRecords: 1, canonicalActivities: 1, unclassified: 0, malformed: 0 },
  presentation: { redacted: true, view: "review" }
};
const renderer: RendererPlugin = {
  manifest: { id: "unsafe", version: "1", displayName: "Unsafe", interfaceVersion: "1", kind: "renderer" },
  css: "@import 'https://evil.test/x.css'; .x{background:url(https://evil.test/x)}",
  javascript: "globalThis.PWNED = true"
};

describe("Presentation HTML", () => {
  it("escapes content, strips external CSS, and excludes plugin JavaScript", () => {
    const html = renderPresentationHtml(stage, renderer);
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
    expect(html).toContain("\\u003cimg src=x onerror=bad>");
    expect(html).not.toContain("<img src=x onerror=bad>");
    expect(html).not.toContain("evil.test");
    expect(html).not.toContain("PWNED");
    expect(html).toContain("Presentation redaction enabled");
    expect(html).toContain('id="agentjourney-export-stage"');
    expect(html).toContain("stage-native-composer");
    expect(html).toContain("Simulated TUI stream");
    expect(html).toContain("simulatedInputTextLength");
    expect(html).toContain("connect-src 'none'");
  });
});
