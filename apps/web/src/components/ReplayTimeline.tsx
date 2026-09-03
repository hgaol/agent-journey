import { memo, useMemo } from "react";
import type { ActivityDocument } from "@agentjourney/contracts";
import type { ReplayFrame } from "@agentjourney/activity-graph";

export interface ReplayTimelinePoint {
  frame: ReplayFrame;
  firstIndex: number;
  lastIndex: number;
  frameCount: number;
  idleGapCompressed: boolean;
}

export function activityTimelinePoints(frames: readonly ReplayFrame[]): ReplayTimelinePoint[] {
  const points: ReplayTimelinePoint[] = [];
  for (const [index, frame] of frames.entries()) {
    const previous = points.at(-1);
    if (previous?.frame.activityId === frame.activityId && previous.frame.threadId === frame.threadId) {
      previous.lastIndex = index;
      previous.frameCount += 1;
      previous.idleGapCompressed ||= frame.idleGapCompressed;
      continue;
    }
    points.push({
      frame,
      firstIndex: index,
      lastIndex: index,
      frameCount: 1,
      idleGapCompressed: frame.idleGapCompressed
    });
  }
  return points;
}

export function sampleTimelinePoints(
  points: readonly ReplayTimelinePoint[],
  limit: number
): readonly ReplayTimelinePoint[] {
  const boundedLimit = Math.max(1, Math.floor(limit));
  if (points.length <= boundedLimit) return points;
  if (boundedLimit === 1) return [points[0]!];
  return Array.from({ length: boundedLimit }, (_, index) =>
    points[Math.round((index * (points.length - 1)) / (boundedLimit - 1))]!
  );
}

const TimelineMarkers = memo(function TimelineMarkers(props: {
  points: readonly ReplayTimelinePoint[];
  maxOffset: number;
  activityById: ReadonlyMap<string, ActivityDocument>;
  onSeek: (index: number) => void;
}): React.ReactNode {
  return props.points.map((point) => (
    <button
      key={point.frame.activityId}
      className={point.idleGapCompressed ? "compressed" : ""}
      style={{ left: `${(point.frame.displayOffsetMs / props.maxOffset) * 100}%` }}
      title={`${props.activityById.get(point.frame.activityId)?.kind ?? "activity"}${point.frameCount > 1 ? ` · ${point.frameCount} Replay frames` : ""}`}
      onClick={() => props.onSeek(point.firstIndex)}
    />
  ));
});

export const ReplayTimeline = memo(function ReplayTimeline(props: {
  frames: readonly ReplayFrame[];
  activities: readonly ActivityDocument[];
  currentIndex: number;
  onSeek: (index: number) => void;
}): React.ReactNode {
  const points = useMemo(() => activityTimelinePoints(props.frames), [props.frames]);
  const pointsByThread = useMemo(() => {
    const lanes = new Map<string, ReplayTimelinePoint[]>();
    for (const point of points) {
      const lane = lanes.get(point.frame.threadId) ?? [];
      lane.push(point);
      lanes.set(point.frame.threadId, lane);
    }
    const markersPerLane = Math.max(1, Math.floor(1_200 / Math.max(1, lanes.size)));
    return new Map(
      [...lanes].map(([threadId, lane]) => [threadId, sampleTimelinePoints(lane, markersPerLane)])
    );
  }, [points]);
  const maxOffset = Math.max(1, props.frames.at(-1)?.displayOffsetMs ?? 1);
  const currentFrame = props.frames[props.currentIndex];
  const activityById = useMemo(
    () => new Map(props.activities.map((activity) => [activity.id, activity])),
    [props.activities]
  );
  return (
    <div className="replay-timeline" aria-label="Agent Thread replay lanes">
      {[...pointsByThread].map(([threadId, lanePoints]) => (
        <div className="timeline-lane" key={threadId}>
          <span>{threadId === "main" ? "main" : threadId.replace(/^agent:/u, "↳ ")}</span>
          <div className="timeline-track">
            <TimelineMarkers
              points={lanePoints}
              maxOffset={maxOffset}
              activityById={activityById}
              onSeek={props.onSeek}
            />
            {currentFrame?.threadId === threadId && (
              <i
                className="timeline-current"
                style={{ left: `${(currentFrame.displayOffsetMs / maxOffset) * 100}%` }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
});
