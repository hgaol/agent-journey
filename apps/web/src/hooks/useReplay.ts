import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityDocument } from "@agentjourney/contracts";
import {
  canAutoPlayReplay,
  deriveReplayFrames,
  replayFrameDelay,
  type ReplayStreamMode
} from "@agentjourney/activity-graph";

export function useReplay(
  activities: readonly ActivityDocument[],
  streamMode: ReplayStreamMode = "events",
  autoStartOnModeChange = false,
  simulateHumanInput = false
) {
  const frames = useMemo(
    () => deriveReplayFrames(activities, { streamMode, simulateHumanInput }),
    [activities, simulateHumanInput, streamMode]
  );
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [streamingSpeed, setStreamingSpeed] = useState(1);
  const [holdingFirstFrame, setHoldingFirstFrame] = useState(false);
  const canAutoPlay = canAutoPlayReplay(frames, streamMode);
  const replayVariant = `${streamMode}:${simulateHumanInput ? "typed-prompts" : "instant-prompts"}`;
  const previousReplayVariant = useRef(replayVariant);

  useEffect(() => {
    if (previousReplayVariant.current === replayVariant) return;
    previousReplayVariant.current = replayVariant;
    setIndex(0);
    setHoldingFirstFrame(autoStartOnModeChange);
    setPlaying(autoStartOnModeChange && canAutoPlay);
  }, [autoStartOnModeChange, canAutoPlay, replayVariant]);

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
    const replayGap = replayFrameDelay(current!, next!, {
      timelineSpeed: speed,
      streamingSpeed
    });
    const gap = holdingFirstFrame && index === 0 ? Math.max(400, replayGap) : replayGap;
    const timer = window.setTimeout(() => {
      setHoldingFirstFrame(false);
      setIndex((value) => value + 1);
    }, gap);
    return () => window.clearTimeout(timer);
  }, [canAutoPlay, frames, holdingFirstFrame, index, playing, speed, streamingSpeed]);

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
    restart: (autoPlay = canAutoPlay) => {
      setIndex(0);
      setHoldingFirstFrame(true);
      setPlaying(autoPlay && frames.length > 1);
    },
    reset: () => { setIndex(0); setPlaying(false); setHoldingFirstFrame(false); }
  };
}
