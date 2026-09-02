import { useEffect, useMemo, useState } from "react";
import type { ActivityDocument } from "@agentjourney/contracts";
import { deriveReplayFrames, type ReplayStreamMode } from "@agentjourney/activity-graph";

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
  const canAutoPlay = frames.length > 1 && (
    streamMode === "simulated" || frames.every(({ timing }) => timing === "evidenced")
  );

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
    const minimumGap = next?.timing === "simulated" ? 20 : 120;
    const gap = Math.max(
      minimumGap,
      Math.min(5_000, (next!.displayOffsetMs - current!.displayOffsetMs) / speed)
    );
    const timer = window.setTimeout(() => setIndex((value) => value + 1), gap);
    return () => window.clearTimeout(timer);
  }, [canAutoPlay, frames, index, playing, speed]);

  return {
    frames,
    index,
    setIndex,
    playing,
    setPlaying,
    speed,
    setSpeed,
    current: frames[index],
    canAutoPlay,
    streamMode,
    reset: () => { setIndex(0); setPlaying(false); }
  };
}
