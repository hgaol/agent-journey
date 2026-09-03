import type { ActivityDocument, InterpretationDocument, TurnDocument } from "@agentjourney/contracts";

export type ReplayStreamMode = "events" | "recorded" | "simulated";

export interface ReplayOptions {
  streamMode?: ReplayStreamMode;
  maximumDisplayedIdleMs?: number;
  stepMs?: number;
  simulatedChunkSize?: number;
  simulatedChunkMs?: number;
  simulateHumanInput?: boolean;
  simulatedInputChunkSize?: number;
  simulatedInputChunkMs?: number;
  simulatedInputSubmitMs?: number;
  sourceOrderStepMs?: number;
}

export interface ReplayFrame {
  activityId: string;
  threadId: string;
  index: number;
  sourceOrder: number;
  observedAt?: string;
  observedOffsetMs?: number;
  displayOffsetMs: number;
  timing: "evidenced" | "source-order" | "step" | "simulated";
  streamSource: "event" | "recorded" | "simulated";
  deliveryChunkIndex?: number;
  simulatedTextLength?: number;
  simulatedInputTextLength?: number;
  inputSubmitted?: boolean;
  idleGapCompressed: boolean;
}

export interface InterpretationComparison {
  unchanged: string[];
  added: string[];
  removed: string[];
  reclassified: Array<{ evidenceAnchor: string; before: string; after: string }>;
}

function relationCreatesPrecedence(relation: string): boolean {
  return ["parent", "caused-by", "result-of", "spawned-by", "replaces"].includes(relation);
}

/**
 * Produces a deterministic display order while respecting every evidenced causal
 * edge that can be resolved. It does not claim that tie-breaks are chronology.
 */
export function linearizeActivityGraph(activities: readonly ActivityDocument[]): ActivityDocument[] {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const incoming = new Map(activities.map((activity) => [activity.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const activity of activities) {
    for (const link of activity.links ?? []) {
      if (!relationCreatesPrecedence(link.relation) || !byId.has(link.targetActivityId)) continue;
      incoming.set(activity.id, (incoming.get(activity.id) ?? 0) + 1);
      const targets = outgoing.get(link.targetActivityId) ?? [];
      targets.push(activity.id);
      outgoing.set(link.targetActivityId, targets);
    }
  }

  const compare = (left: ActivityDocument, right: ActivityDocument): number =>
    left.sourceOrder - right.sourceOrder || left.threadId.localeCompare(right.threadId) || left.id.localeCompare(right.id);
  const ready = activities.filter(({ id }) => incoming.get(id) === 0).sort(compare);
  const result: ActivityDocument[] = [];

  while (ready.length > 0) {
    const next = ready.shift()!;
    result.push(next);
    for (const targetId of outgoing.get(next.id) ?? []) {
      const remaining = (incoming.get(targetId) ?? 1) - 1;
      incoming.set(targetId, remaining);
      if (remaining === 0) {
        const target = byId.get(targetId);
        if (target) {
          ready.push(target);
          ready.sort(compare);
        }
      }
    }
  }

  if (result.length !== activities.length) {
    const emitted = new Set(result.map(({ id }) => id));
    result.push(...activities.filter(({ id }) => !emitted.has(id)).sort(compare));
  }
  return result;
}

export function deriveTurns(activities: readonly ActivityDocument[]): TurnDocument[] {
  const ordered = linearizeActivityGraph(activities);
  const explicit = new Map<string, ActivityDocument[]>();
  for (const activity of ordered) {
    if (!activity.turnId) continue;
    const values = explicit.get(activity.turnId) ?? [];
    values.push(activity);
    explicit.set(activity.turnId, values);
  }

  const turns: TurnDocument[] = [];
  const explicitlyAssigned = new Set<string>();
  for (const [turnId, values] of explicit) {
    values.forEach(({ id }) => explicitlyAssigned.add(id));
    turns.push(turnFrom(`turn:${turnId}`, values, "evidenced"));
  }

  let current: ActivityDocument[] = [];
  let inferredIndex = 0;
  const flush = (): void => {
    if (current.length === 0) return;
    turns.push(turnFrom(`inferred:${inferredIndex++}`, current, "inferred"));
    current = [];
  };
  for (const activity of ordered) {
    if (explicitlyAssigned.has(activity.id)) continue;
    if (activity.kind === "human-input" && current.some(({ kind }) => kind === "human-input")) flush();
    current.push(activity);
  }
  flush();

  return turns.sort((left, right) => {
    const leftActivity = byActivityId(ordered, left.activityIds[0]);
    const rightActivity = byActivityId(ordered, right.activityIds[0]);
    return (leftActivity?.sourceOrder ?? 0) - (rightActivity?.sourceOrder ?? 0);
  });
}

function turnFrom(
  id: string,
  activities: readonly ActivityDocument[],
  boundaryProvenance: "evidenced" | "inferred"
): TurnDocument {
  const timestamps = activities.flatMap(({ timestamp }) => (timestamp ? [timestamp] : []));
  const startedAt = timestamps[0];
  const endedAt = timestamps.at(-1);
  return {
    id,
    activityIds: activities.map(({ id: activityId }) => activityId),
    boundaryProvenance,
    ...(startedAt ? { startedAt } : {}),
    ...(endedAt ? { endedAt } : {})
  };
}

function byActivityId(activities: readonly ActivityDocument[], id: string | undefined): ActivityDocument | undefined {
  return id ? activities.find((activity) => activity.id === id) : undefined;
}

interface ReplayPoint {
  activity: ActivityDocument;
  activityIndex: number;
  observedAt: string | undefined;
  streamSource: "event" | "recorded" | "simulated";
  offsetMs?: number | undefined;
  deliveryChunkIndex?: number | undefined;
  simulatedTextLength?: number | undefined;
  simulatedInputTextLength?: number | undefined;
  inputSubmitted?: boolean | undefined;
  simulatedStepMs?: number | undefined;
}

export function deriveReplayFrames(
  activities: readonly ActivityDocument[],
  options: ReplayOptions = {}
): ReplayFrame[] {
  const {
    streamMode = "events",
    maximumDisplayedIdleMs = 5_000,
    stepMs = 700,
    simulatedChunkSize = 16,
    simulatedChunkMs = 45,
    simulateHumanInput = false,
    simulatedInputChunkSize = 1,
    simulatedInputChunkMs = 45,
    simulatedInputSubmitMs = 240,
    sourceOrderStepMs = 40
  } = options;
  const ordered = linearizeActivityGraph(activities);
  const points: ReplayPoint[] = ordered.flatMap((activity, activityIndex) => {
    if (streamMode === "recorded" && activity.deliveryTrace?.length) {
      return activity.deliveryTrace.map((chunk, deliveryChunkIndex) => ({
        activity,
        activityIndex,
        deliveryChunkIndex,
        observedAt: chunk.timestamp ?? activity.timestamp,
        offsetMs: chunk.offsetMs,
        streamSource: "recorded" as const
      }));
    }
    const canSimulateInput = simulateHumanInput
      && activity.kind === "human-input"
      && Boolean(activity.text);
    if (canSimulateInput) {
      const characters = [...activity.text!];
      const chunkSize = Math.max(1, Math.floor(simulatedInputChunkSize));
      const drafts: ReplayPoint[] = [{
        activity,
        activityIndex,
        observedAt: activity.timestamp,
        streamSource: "simulated" as const,
        simulatedInputTextLength: 0,
        simulatedStepMs: simulatedInputChunkMs
      }];
      for (let length = chunkSize; length < characters.length; length += chunkSize) {
        drafts.push({
          activity,
          activityIndex,
          observedAt: activity.timestamp,
          streamSource: "simulated" as const,
          simulatedInputTextLength: length,
          simulatedStepMs: simulatedInputChunkMs
        });
      }
      drafts.push({
        activity,
        activityIndex,
        observedAt: activity.timestamp,
        streamSource: "simulated" as const,
        simulatedInputTextLength: characters.length,
        simulatedStepMs: simulatedInputChunkMs
      });
      drafts.push({
        activity,
        activityIndex,
        observedAt: activity.timestamp,
        streamSource: "simulated" as const,
        inputSubmitted: true,
        simulatedStepMs: simulatedInputSubmitMs
      });
      return drafts;
    }
    const canSimulate = streamMode === "simulated"
      && Boolean(activity.text)
      && (activity.kind === "agent-output" || activity.kind === "reasoning");
    if (canSimulate) {
      const characters = [...activity.text!];
      const chunkSize = Math.max(1, Math.floor(simulatedChunkSize));
      const simulated: ReplayPoint[] = [];
      for (let length = chunkSize; length < characters.length; length += chunkSize) {
        simulated.push({
          activity,
          activityIndex,
          observedAt: activity.timestamp,
          streamSource: "simulated",
          simulatedTextLength: length
        });
      }
      simulated.push({
        activity,
        activityIndex,
        observedAt: activity.timestamp,
        streamSource: "simulated",
        simulatedTextLength: characters.length
      });
      return simulated;
    }
    return [{
      activity,
      activityIndex,
      observedAt: activity.timestamp,
      streamSource: "event" as const
    }];
  });
  const observedTimes = points.map(({ observedAt, offsetMs }) => {
    if (observedAt) return Date.parse(observedAt);
    return offsetMs === undefined ? Number.NaN : offsetMs;
  });
  const firstObserved = observedTimes.find(Number.isFinite);
  const hasObservedTimeline = firstObserved !== undefined;
  let displayOffsetMs = 0;
  let previousObserved: number | undefined;

  return points.map((point, frameIndex) => {
    const observed = observedTimes[frameIndex];
    const hasObserved = Number.isFinite(observed);
    let idleGapCompressed = false;
    if (frameIndex > 0) {
      const previousPoint = points[frameIndex - 1];
      if (point.streamSource === "simulated" && previousPoint?.activity.id === point.activity.id) {
        displayOffsetMs += point.simulatedStepMs ?? simulatedChunkMs;
      } else if (!hasObserved && hasObservedTimeline) {
        displayOffsetMs += sourceOrderStepMs;
      } else if (hasObserved && previousObserved !== undefined) {
        const gap = Math.max(0, observed! - previousObserved);
        idleGapCompressed = gap > maximumDisplayedIdleMs;
        displayOffsetMs += Math.min(gap, maximumDisplayedIdleMs);
      } else {
        displayOffsetMs += stepMs;
      }
    }
    if (hasObserved) previousObserved = observed;
    return {
      activityId: point.activity.id,
      threadId: point.activity.threadId,
      index: point.activityIndex,
      sourceOrder: point.activity.sourceOrder,
      streamSource: point.streamSource,
      ...(point.deliveryChunkIndex !== undefined ? { deliveryChunkIndex: point.deliveryChunkIndex } : {}),
      ...(point.simulatedTextLength !== undefined ? { simulatedTextLength: point.simulatedTextLength } : {}),
      ...(point.simulatedInputTextLength !== undefined ? { simulatedInputTextLength: point.simulatedInputTextLength } : {}),
      ...(point.inputSubmitted ? { inputSubmitted: true } : {}),
      ...(hasObserved
        ? {
            ...(point.observedAt ? { observedAt: point.observedAt } : {}),
            observedOffsetMs: observed! - (firstObserved ?? observed!)
          }
        : {}),
      displayOffsetMs,
      timing: point.streamSource === "simulated"
        ? "simulated"
        : hasObserved
          ? "evidenced"
          : hasObservedTimeline
            ? "source-order"
            : "step",
      idleGapCompressed
    };
  });
}

export interface ReplayDelayOptions {
  timelineSpeed: number;
  streamingSpeed: number;
  maximumDelayMs?: number;
}

export function replayFrameDelay(
  current: ReplayFrame,
  next: ReplayFrame,
  options: ReplayDelayOptions
): number {
  const withinContentStream = current.activityId === next.activityId
    && (next.streamSource === "recorded" || next.streamSource === "simulated");
  const selectedSpeed = withinContentStream
    ? options.streamingSpeed
    : options.timelineSpeed;
  const speed = Number.isFinite(selectedSpeed) && selectedSpeed > 0 ? selectedSpeed : 1;
  const minimumDelay = withinContentStream
    ? 4
    : next.timing === "source-order"
      ? 12
      : 16;
  return Math.max(
    minimumDelay,
    Math.min(options.maximumDelayMs ?? 5_000, (next.displayOffsetMs - current.displayOffsetMs) / speed)
  );
}

export function canAutoPlayReplay(
  frames: readonly ReplayFrame[],
  streamMode: ReplayStreamMode
): boolean {
  if (frames.length < 2) return false;
  if (streamMode === "simulated") return true;
  const hasEvidencedTiming = frames.some(({ timing, observedAt }) =>
    timing === "evidenced" || (timing === "simulated" && Boolean(observedAt))
  );
  return hasEvidencedTiming && frames.every(({ timing }) =>
    timing === "evidenced" || timing === "source-order" || timing === "simulated"
  );
}

export function compareInterpretations(
  before: InterpretationDocument,
  after: InterpretationDocument
): InterpretationComparison {
  const beforeByAnchor = new Map(before.activities.map((activity) => [activity.evidenceAnchor, activity]));
  const afterByAnchor = new Map(after.activities.map((activity) => [activity.evidenceAnchor, activity]));
  const unchanged: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const reclassified: InterpretationComparison["reclassified"] = [];

  for (const [anchor, activity] of beforeByAnchor) {
    const next = afterByAnchor.get(anchor);
    if (!next) removed.push(anchor);
    else if (next.kind !== activity.kind) reclassified.push({ evidenceAnchor: anchor, before: activity.kind, after: next.kind });
    else unchanged.push(anchor);
  }
  for (const anchor of afterByAnchor.keys()) if (!beforeByAnchor.has(anchor)) added.push(anchor);
  return { unchanged, added, removed, reclassified };
}
