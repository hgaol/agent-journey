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
  activities: [{ id: "a", kind: "agent-output", evidenceAnchor: "file#L1", threadId: "main", sourceOrder: 1, text: "<img src=x onerror=bad>" }],
  threads: [{ id: "main" }],
  turns: [{ id: "turn", activityIds: ["a"], boundaryProvenance: "inferred" }],
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
    expect(html).toContain("&lt;img src=x onerror=bad&gt;");
    expect(html).not.toContain("evil.test");
    expect(html).not.toContain("PWNED");
    expect(html).toContain("Presentation redaction enabled");
  });
});
