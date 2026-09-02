import type { ActivityDocument } from "@agentjourney/contracts";
import type { ReplayFrame } from "@agentjourney/activity-graph";

export function ReplayTimeline(props: {
  frames: readonly ReplayFrame[];
  activities: readonly ActivityDocument[];
  currentIndex: number;
  onSeek: (index: number) => void;
}): React.ReactNode {
  const threads = [...new Set(props.frames.map(({ threadId }) => threadId))];
  const maxOffset = Math.max(1, props.frames.at(-1)?.displayOffsetMs ?? 1);
  const activityById = new Map(props.activities.map((activity) => [activity.id, activity]));
  return (
    <div className="replay-timeline" aria-label="Agent Thread replay lanes">
      {threads.map((threadId) => (
        <div className="timeline-lane" key={threadId}>
          <span>{threadId === "main" ? "main" : threadId.replace(/^agent:/u, "↳ ")}</span>
          <div className="timeline-track">
            {props.frames.map((frame, index) => frame.threadId === threadId && (
              <button
                key={`${frame.activityId}:${frame.deliveryChunkIndex ?? "activity"}`}
                className={`${index === props.currentIndex ? "current" : ""} ${frame.idleGapCompressed ? "compressed" : ""}`}
                style={{ left: `${(frame.displayOffsetMs / maxOffset) * 100}%` }}
                title={`${activityById.get(frame.activityId)?.kind ?? "activity"}${frame.deliveryChunkIndex !== undefined ? ` · chunk ${frame.deliveryChunkIndex + 1}` : ""}`}
                onClick={() => props.onSeek(index)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
