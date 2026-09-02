import { useEffect, useMemo, useState } from "react";
import type { ActivityDocument } from "@agentjourney/contracts";
import {
  canAutoPlayReplay,
  deriveReplayFrames,
  replayFrameDelay,
  type ReplayStreamMode
} from "@agentjourney/activity-graph";

export function useReplay(
  activities: readonly ActivityDocument[],
  streamMode: ReplayStreamMode = "events"
) {
  const frames = useMemo(
    () => deriveReplayFrames(activities, { streamMode }),
    [activities, streamMode]
  );
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [streamingSpeed, setStreamingSpeed] = useState(1);
  const canAutoPlay = canAutoPlayReplay(frames, streamMode);

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [streamMode]);

  useEffect(() => {
    if (index > Math.max(0, frames.length - 1)) setIndex(Math.max(0, frames.length - 1));
  }, [frames.length, index]);

  useEffect(() => {
    if (!playing || !canAutoPlay || index >= frames.length - 1) {
      if (index >= frames.length - 1) setPlaying(false);
      return;
    }
    const current = frames[index];
    const next = frames[index + 1];
    const gap = replayFrameDelay(current!, next!, {
      timelineSpeed: speed,
      streamingSpeed
    });
    const timer = window.setTimeout(() => setIndex((value) => value + 1), gap);
    return () => window.clearTimeout(timer);
  }, [canAutoPlay, frames, index, playing, speed, streamingSpeed]);

  return {
    frames,
    index,
    setIndex,
    playing,
    setPlaying,
    speed,
    setSpeed,
    streamingSpeed,
    setStreamingSpeed,
    current: frames[index],
    canAutoPlay,
    streamMode,
    reset: () => { setIndex(0); setPlaying(false); }
  };
}
