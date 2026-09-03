import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityDocument } from "@agentjourney/contracts";
import {
  canAutoPlayReplay,
  deriveReplayFrames,
  replayFrameDelay,
  replayRemainingDurations,
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
  const [typingSpeed, setTypingSpeed] = useState(1);
  const [holdingFirstFrame, setHoldingFirstFrame] = useState(false);
  const canAutoPlay = canAutoPlayReplay(frames, streamMode);
  const replayVariant = `${streamMode}:${simulateHumanInput ? "typed-prompts" : "instant-prompts"}`;
  const previousReplayVariant = useRef(replayVariant);
  const framePresentedAtRef = useRef<number | undefined>(undefined);
  const expectedIndexRef = useRef<number | undefined>(undefined);
  const scheduleKeyRef = useRef("");

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

  const remainingDurations = useMemo(() => replayRemainingDurations(frames, {
    timelineSpeed: speed,
    streamingSpeed,
    typingSpeed
  }), [frames, speed, streamingSpeed, typingSpeed]);
  const firstFrameAdjustment = holdingFirstFrame && index === 0 && frames.length > 1
    ? Math.max(0, 400 - replayFrameDelay(frames[0]!, frames[1]!, {
        timelineSpeed: speed,
        streamingSpeed,
        typingSpeed
      }))
    : 0;
  const plannedRemainingMs = (remainingDurations[index] ?? 0) + firstFrameAdjustment;

  useEffect(() => {
    if (!playing || !canAutoPlay || index >= frames.length - 1) {
      framePresentedAtRef.current = undefined;
      expectedIndexRef.current = undefined;
      scheduleKeyRef.current = "";
      if (index >= frames.length - 1) setPlaying(false);
      return;
    }
    const delayOptions = { timelineSpeed: speed, streamingSpeed, typingSpeed };
    const scheduleKey = [
      replayVariant,
      speed,
      streamingSpeed,
      typingSpeed,
      frames.length,
      frames[0]?.activityId ?? "",
      frames.at(-1)?.activityId ?? ""
    ].join(":");
    const now = window.performance.now();
    if (
      framePresentedAtRef.current === undefined
      || expectedIndexRef.current !== index
      || scheduleKeyRef.current !== scheduleKey
    ) {
      framePresentedAtRef.current = now;
      expectedIndexRef.current = index;
      scheduleKeyRef.current = scheduleKey;
    }
    const replayGap = replayFrameDelay(frames[index]!, frames[index + 1]!, delayOptions);
    const gap = holdingFirstFrame && index === 0 ? Math.max(400, replayGap) : replayGap;
    const targetTime = framePresentedAtRef.current + gap;
    const timer = window.setTimeout(() => {
      const firedAt = window.performance.now();
      let nextIndex = index + 1;
      let presentedAt = targetTime;
      while (nextIndex < frames.length - 1) {
        const catchUpGap = replayFrameDelay(frames[nextIndex]!, frames[nextIndex + 1]!, delayOptions);
        if (presentedAt + catchUpGap > firedAt) break;
        presentedAt += catchUpGap;
        nextIndex += 1;
      }
      framePresentedAtRef.current = presentedAt;
      expectedIndexRef.current = nextIndex;
      setHoldingFirstFrame(false);
      setIndex(nextIndex);
    }, Math.max(0, targetTime - now));
    return () => window.clearTimeout(timer);
  }, [canAutoPlay, frames, holdingFirstFrame, index, playing, replayVariant, speed, streamingSpeed, typingSpeed]);

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
    typingSpeed,
    setTypingSpeed,
    current: frames[index],
    plannedRemainingMs,
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
