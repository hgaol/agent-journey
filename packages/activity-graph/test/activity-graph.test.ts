import { describe, expect, it } from "vitest";
import type { ActivityDocument, InterpretationDocument } from "@agentjourney/contracts";
import { compareInterpretations, deriveReplayFrames, deriveTurns, linearizeActivityGraph } from "../src/index.js";

function activity(id: string, kind: ActivityDocument["kind"], sourceOrder: number, extra: Partial<ActivityDocument> = {}): ActivityDocument {
  return { id, kind, sourceOrder, evidenceAnchor: `fixture#${id}`, threadId: "main", ...extra };
}

describe("Activity Graph", () => {
  it("respects causal edges ahead of display-order tie breaks", () => {
    const invocation = activity("call", "tool-invocation", 20);
    const result = activity("result", "tool-result", 10, { links: [{ relation: "result-of", targetActivityId: "call" }] });
    expect(linearizeActivityGraph([result, invocation]).map(({ id }) => id)).toEqual(["call", "result"]);
  });

  it("derives evidenced and inferred Turns without changing Activities", () => {
    const activities = [
      activity("human-1", "human-input", 1),
      activity("agent-1", "agent-output", 2),
      activity("human-2", "human-input", 3, { turnId: "native-2" }),
      activity("agent-2", "agent-output", 4, { turnId: "native-2" })
    ];
    const turns = deriveTurns(activities);
    expect(turns.map(({ boundaryProvenance }) => boundaryProvenance).sort()).toEqual(["evidenced", "inferred"]);
    expect(turns.flatMap(({ activityIds }) => activityIds).sort()).toEqual(activities.map(({ id }) => id).sort());
  });

  it("compresses long idle gaps while retaining observed offsets", () => {
    const frames = deriveReplayFrames([
      activity("a", "human-input", 1, { timestamp: "2026-01-01T00:00:00.000Z" }),
      activity("b", "agent-output", 2, { timestamp: "2026-01-01T01:00:00.000Z" })
    ]);
    expect(frames[1]).toMatchObject({ idleGapCompressed: true, displayOffsetMs: 5000, observedOffsetMs: 3_600_000 });
  });

  it("creates one Replay frame per evidenced Delivery Trace chunk", () => {
    const frames = deriveReplayFrames([
      activity("stream", "agent-output", 1, {
        deliveryTrace: [
          { sequence: 0, text: "Hel", offsetMs: 0 },
          { sequence: 1, text: "lo", offsetMs: 100 }
        ]
      })
    ]);
    expect(frames.map(({ deliveryChunkIndex }) => deliveryChunkIndex)).toEqual([0, 1]);
  });

  it("compares interpretations by stable Evidence Anchor", () => {
    const base = {
      schemaVersion: "1.0.0",
      adapter: { id: "fixture", version: "1" },
      journey: { sourceAgent: "pi", nativeSessionId: "session" },
      threads: [{ id: "main" }],
      coverage: { sourceRecordCount: 1, dispositions: [], missing: [] },
      fidelity: { contentKinds: [], timedKinds: [], deliveryTraces: false, agentThreads: false, causalLinks: false, terminalStream: false, knownGaps: [] },
      sourceExtensions: {}
    } satisfies Omit<InterpretationDocument, "activities">;
    const before: InterpretationDocument = { ...base, activities: [activity("a", "agent-output", 1)] };
    const after: InterpretationDocument = {
      ...base,
      activities: [activity("b", "reasoning", 1, { evidenceAnchor: "fixture#a" })]
    };
    expect(compareInterpretations(before, after).reclassified).toHaveLength(1);
  });
});
