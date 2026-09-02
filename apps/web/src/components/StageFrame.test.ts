import { describe, expect, it } from "vitest";
import type { StageDocument } from "@agentjourney/contracts";
import { STAGE_SCRIPT, projectStageDocument } from "./StageFrame.js";

function stage(): StageDocument {
  return {
    schemaVersion: "1.0.0",
    journeyId: "journey",
    revisionId: "revision",
    interpretationId: "interpretation",
    sourceAgent: "pi",
    activities: [
      {
        id: "human",
        kind: "human-input",
        evidenceAnchor: "session#L1",
        threadId: "main",
        sourceOrder: 1,
        text: "Prompt"
      },
      {
        id: "agent",
        kind: "agent-output",
        evidenceAnchor: "session#L2",
        threadId: "main",
        sourceOrder: 2,
        text: "Hello world",
        deliveryTrace: [
          { sequence: 0, text: "Hello" },
          { sequence: 1, text: " world" }
        ]
      }
    ],
    threads: [{ id: "main" }],
    turns: [{ id: "turn", activityIds: ["human", "agent"], boundaryProvenance: "inferred" }],
    annotations: [],
    fidelity: {
      contentKinds: ["human-input", "agent-output"],
      timedKinds: [],
      deliveryTraces: true,
      agentThreads: false,
      causalLinks: false,
      terminalStream: false,
      knownGaps: []
    },
    sensitiveFindingCount: 0,
    coverageSummary: { sourceRecords: 2, canonicalActivities: 2, unclassified: 0, malformed: 0 },
    presentation: { redacted: true, view: "review" }
  };
}

describe("projectStageDocument", () => {
  it("keeps the trusted iframe renderer script syntactically valid", () => {
    expect(() => new Function(STAGE_SCRIPT)).not.toThrow();
  });

  it("reveals only recorded Delivery Trace chunks reached by the playhead", () => {
    const input = stage();
    input.presentation = {
      redacted: true,
      view: "replay",
      streamMode: "recorded",
      playheadActivityId: "agent",
      playheadDeliveryChunk: 0
    };
    expect(projectStageDocument(input).activities[1]?.text).toBe("Hello");
  });

  it("reveals an explicitly simulated number of Unicode characters", () => {
    const input = stage();
    input.presentation = {
      redacted: true,
      view: "replay",
      streamMode: "simulated",
      playheadActivityId: "agent",
      playheadSimulatedTextLength: 3
    };
    expect(projectStageDocument(input).activities[1]?.text).toBe("Hel");
  });
});
