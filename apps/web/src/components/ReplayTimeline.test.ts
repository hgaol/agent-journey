import { describe, expect, it } from "vitest";
import type { ReplayFrame } from "@agentjourney/activity-graph";
import { activityTimelinePoints, sampleTimelinePoints } from "./ReplayTimeline.js";

function frame(activityId: string, index: number, idleGapCompressed = false): ReplayFrame {
  return {
    activityId,
    threadId: "main",
    index,
    sourceOrder: index,
    displayOffsetMs: index * 45,
    timing: "simulated",
    streamSource: "simulated",
    idleGapCompressed
  };
}

describe("ReplayTimeline", () => {
  it("renders one timeline point per Activity instead of one per stream frame", () => {
    const points = activityTimelinePoints([
      frame("prompt", 0),
      frame("prompt", 1),
      frame("prompt", 2, true),
      frame("answer", 3),
      frame("answer", 4)
    ]);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ firstIndex: 0, lastIndex: 2, frameCount: 3, idleGapCompressed: true });
    expect(points[1]).toMatchObject({ firstIndex: 3, lastIndex: 4, frameCount: 2 });
  });

  it("bounds visual markers while preserving both ends of a large timeline", () => {
    const points = activityTimelinePoints(Array.from({ length: 10_000 }, (_, index) => frame(`a-${index}`, index)));
    const sampled = sampleTimelinePoints(points, 1_200);
    expect(sampled).toHaveLength(1_200);
    expect(sampled[0]?.frame.activityId).toBe("a-0");
    expect(sampled.at(-1)?.frame.activityId).toBe("a-9999");
  });
});
