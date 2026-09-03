import { describe, expect, it } from "vitest";
import type { ActivityDocument, InterpretationDocument } from "@agentjourney/contracts";
import {
  canAutoPlayReplay,
  compareInterpretations,
  deriveReplayFrames,
  deriveTurns,
  linearizeActivityGraph,
  replayFrameDelay,
  replayRemainingDuration,
  replayRemainingDurations
} from "../src/index.js";

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

  it("autoplays mixed timestamp and source-order frames without claiming inferred timestamps", () => {
    const frames = deriveReplayFrames([
      activity("metadata", "state-transition", 1),
      activity("prompt", "human-input", 2, { timestamp: "2026-01-01T00:00:01.000Z" }),
      activity("output", "agent-output", 3, { timestamp: "2026-01-01T00:00:02.000Z" })
    ]);
    expect(frames.map(({ timing }) => timing)).toEqual(["source-order", "evidenced", "evidenced"]);
    expect(canAutoPlayReplay(frames, "events")).toBe(true);
  });

  it("keeps a fully untimed Replay manual unless simulation is selected", () => {
    const frames = deriveReplayFrames([
      activity("prompt", "human-input", 1),
      activity("output", "agent-output", 2)
    ]);
    expect(frames.every(({ timing }) => timing === "step")).toBe(true);
    expect(canAutoPlayReplay(frames, "events")).toBe(false);
    expect(canAutoPlayReplay(frames, "simulated")).toBe(true);
  });

  it("creates one Replay frame per evidenced Delivery Trace chunk", () => {
    const streamed = activity("stream", "agent-output", 1, {
      text: "Hello",
      deliveryTrace: [
        { sequence: 0, text: "Hel", offsetMs: 0 },
        { sequence: 1, text: "lo", offsetMs: 100 }
      ]
    });
    const eventFrames = deriveReplayFrames([streamed], { streamMode: "events" });
    const recordedFrames = deriveReplayFrames([streamed], { streamMode: "recorded" });
    expect(eventFrames).toHaveLength(1);
    expect(recordedFrames.map(({ deliveryChunkIndex }) => deliveryChunkIndex)).toEqual([0, 1]);
    expect(recordedFrames.every(({ streamSource }) => streamSource === "recorded")).toBe(true);
  });

  it("creates explicitly simulated TUI text frames without labeling them evidenced", () => {
    const frames = deriveReplayFrames(
      [activity("stream", "agent-output", 1, { text: "Hello world" })],
      { streamMode: "simulated", simulatedChunkSize: 3 }
    );
    expect(frames.map(({ simulatedTextLength }) => simulatedTextLength)).toEqual([3, 6, 9, 11]);
    expect(frames.every(({ timing, streamSource }) => timing === "simulated" && streamSource === "simulated")).toBe(true);
  });

  it("configures content-stream speed independently from timeline speed", () => {
    const frames = deriveReplayFrames(
      [activity("stream", "agent-output", 1, { text: "x".repeat(48) })],
      { streamMode: "simulated" }
    );
    const normal = replayFrameDelay(frames[0]!, frames[1]!, {
      timelineSpeed: 1,
      streamingSpeed: 1
    });
    const fast = replayFrameDelay(frames[0]!, frames[1]!, {
      timelineSpeed: 1,
      streamingSpeed: 4
    });
    expect(normal / fast).toBeGreaterThanOrEqual(4);
  });

  it("creates simulated prompt drafts followed by an explicit submitted frame", () => {
    const frames = deriveReplayFrames(
      [
        activity("prompt", "human-input", 1, { text: "Hi", timestamp: "2026-01-01T00:00:00.000Z" }),
        activity("answer", "agent-output", 2, { text: "Hello", timestamp: "2026-01-01T00:00:01.000Z" })
      ],
      { streamMode: "events", simulateHumanInput: true, simulatedInputChunkSize: 1 }
    );
    expect(frames.slice(0, 4).map(({ simulatedInputTextLength, inputSubmitted }) => ({
      simulatedInputTextLength,
      inputSubmitted
    }))).toEqual([
      { simulatedInputTextLength: 0, inputSubmitted: undefined },
      { simulatedInputTextLength: 1, inputSubmitted: undefined },
      { simulatedInputTextLength: 2, inputSubmitted: undefined },
      { simulatedInputTextLength: undefined, inputSubmitted: true }
    ]);
    expect(frames.slice(0, 4).every(({ timing }) => timing === "simulated")).toBe(true);
    expect(canAutoPlayReplay(frames, "events")).toBe(true);
    const promptOnly = deriveReplayFrames(
      [activity("only-prompt", "human-input", 1, { text: "Hi", timestamp: "2026-01-01T00:00:00.000Z" })],
      { streamMode: "events", simulateHumanInput: true }
    );
    expect(canAutoPlayReplay(promptOnly, "events")).toBe(true);
    const normalTypingDelay = replayFrameDelay(promptOnly[0]!, promptOnly[1]!, {
      timelineSpeed: 16,
      streamingSpeed: 16,
      typingSpeed: 1
    });
    const fastTypingDelay = replayFrameDelay(promptOnly[0]!, promptOnly[1]!, {
      timelineSpeed: 16,
      streamingSpeed: 16,
      typingSpeed: 4
    });
    expect(normalTypingDelay).toBe(45);
    expect(fastTypingDelay).toBe(15);
    expect(replayFrameDelay(promptOnly[2]!, promptOnly[3]!, {
      timelineSpeed: 16,
      streamingSpeed: 16,
      typingSpeed: 4
    })).toBeGreaterThanOrEqual(180);
  });

  it("estimates remaining Replay time using timeline, cadence, and first-frame timing", () => {
    const frames = deriveReplayFrames([
      activity("a", "human-input", 1, { timestamp: "2026-01-01T00:00:00.000Z" }),
      activity("b", "agent-output", 2, { timestamp: "2026-01-01T00:00:01.000Z" }),
      activity("c", "agent-output", 3, { timestamp: "2026-01-01T00:00:03.000Z" })
    ]);
    const normal = replayRemainingDuration(frames, 0, {
      timelineSpeed: 1,
      streamingSpeed: 1,
      firstFrameMinimumMs: 400
    });
    const fast = replayRemainingDuration(frames, 0, {
      timelineSpeed: 2,
      streamingSpeed: 1,
      firstFrameMinimumMs: 400
    });
    expect(normal).toBe(3000);
    expect(fast).toBe(1500);
    expect(replayRemainingDurations(frames, { timelineSpeed: 1, streamingSpeed: 1 })).toEqual([3000, 2000, 0]);
    expect(replayRemainingDuration(frames, 2, { timelineSpeed: 1, streamingSpeed: 1 })).toBe(0);
  });

  it("uses a fast sixteen-character default for simulated streaming", () => {
    const frames = deriveReplayFrames(
      [activity("stream", "agent-output", 1, { text: "x".repeat(64) })],
      { streamMode: "simulated" }
    );
    expect(frames).toHaveLength(4);
    expect(frames.at(-1)?.simulatedTextLength).toBe(64);
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
