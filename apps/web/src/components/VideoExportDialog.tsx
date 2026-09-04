import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Selector } from "@astryxdesign/core/Selector";
import type { ReplayVideoExportOptionsDocument } from "@agentjourney/contracts";

export interface VideoRendererChoice {
  id: string;
  name: string;
  stylePack: boolean;
}

export function VideoExportDialog(props: {
  rendererId: string;
  renderers: VideoRendererChoice[];
  initialStreamMode: ReplayVideoExportOptionsDocument["streamMode"];
  recordedStreamingAvailable: boolean;
  reveal: boolean;
  revisionId: string;
  interpretationId: string;
  onClose: () => void;
  onExport: (options: ReplayVideoExportOptionsDocument) => Promise<void>;
}): React.ReactNode {
  const [exportId] = useState(() => globalThis.crypto?.randomUUID?.() ?? `video-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const [browser, setBrowser] = useState<NonNullable<ReplayVideoExportOptionsDocument["browser"]>>("auto");
  const [quality, setQuality] = useState<ReplayVideoExportOptionsDocument["quality"]>("1080p");
  const [speed, setSpeed] = useState<ReplayVideoExportOptionsDocument["speed"]>(1);
  const [fps, setFps] = useState<ReplayVideoExportOptionsDocument["fps"]>(30);
  const [streamMode, setStreamMode] = useState<ReplayVideoExportOptionsDocument["streamMode"]>(props.initialStreamMode);
  const [promptTyping, setPromptTyping] = useState(true);
  const [typingSpeed, setTypingSpeed] = useState<NonNullable<ReplayVideoExportOptionsDocument["typingSpeed"]>>(1);
  const [rendererId, setRendererId] = useState(props.rendererId);
  const [reveal, setReveal] = useState(props.reveal);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState({ percent: 0, message: "Waiting to start", completed: 0, total: 0 });

  useEffect(() => {
    const events = new EventSource("/api/v1/events", { withCredentials: true });
    const receiveProgress = (event: MessageEvent<string>): void => {
      try {
        const hostEvent = JSON.parse(event.data) as {
          data?: {
            exportId?: string;
            percent?: number;
            message?: string;
            completed?: number;
            total?: number;
            status?: string;
          };
        };
        const update = hostEvent.data;
        if (!update || update.exportId !== exportId) return;
        setProgress((current) => ({
          percent: typeof update.percent === "number" ? update.percent : current.percent,
          message: update.message ?? current.message,
          completed: typeof update.completed === "number" ? update.completed : current.completed,
          total: typeof update.total === "number" ? update.total : current.total
        }));
        if (update.status === "failed" && update.message) setError(update.message);
      } catch {
        // The POST request still reports export errors if progress events are unavailable.
      }
    };
    events.addEventListener("video-export-progress", receiveProgress as EventListener);
    return () => events.close();
  }, [exportId]);

  const submit = async (): Promise<void> => {
    setExporting(true);
    setError(undefined);
    setProgress({ percent: 0, message: "Starting local MP4 export", completed: 0, total: 0 });
    try {
      await props.onExport({
        rendererId,
        exportId,
        browser,
        quality,
        speed,
        fps,
        streamMode,
        promptTyping,
        typingSpeed,
        reveal,
        revisionId: props.revisionId,
        interpretationId: props.interpretationId
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "MP4 export failed");
      setExporting(false);
    }
  };
  const requestClose = (isOpen: boolean): void => {
    if (!isOpen && !exporting) props.onClose();
  };

  return (
    <Dialog
      className="agentjourney-astryx-dialog agentjourney-video-dialog"
      isOpen
      onOpenChange={requestClose}
      purpose="form"
      width={600}
      maxHeight="92dvh"
      padding={0}
    >
      <Layout
        height="auto"
        header={(
          <DialogHeader
            title="Export Replay as MP4"
            subtitle="Local video export"
            {...(!exporting ? { onOpenChange: requestClose } : {})}
          />
        )}
        content={(
          <LayoutContent className="agentjourney-video-fields" padding={4} isScrollable>
            <p className="video-export-copy">
              Renders the source-native Journey Stage locally. MP4 exports contain no audio, accounts, or telemetry.
            </p>
            <Selector
              label="Renderer"
              value={rendererId}
              onChange={setRendererId}
              options={props.renderers.map((renderer) => ({
                value: renderer.id,
                label: `${renderer.name}${renderer.stylePack ? "" : " (HTML only)"}`,
                disabled: !renderer.stylePack
              }))}
              isDisabled={exporting}
              width="100%"
            />
            <Selector
              label="Rendering engine"
              value={browser}
              onChange={(value) => setBrowser(value as NonNullable<ReplayVideoExportOptionsDocument["browser"]>)}
              options={[
                { value: "auto", label: "Auto · Chromium, Chrome, Edge, then WebKit" },
                { value: "chromium", label: "Playwright Chromium" },
                { value: "chrome", label: "Google Chrome" },
                { value: "edge", label: "Microsoft Edge · Stable/Beta/Dev/Canary" },
                { value: "webkit", label: "WebKit · Safari-compatible" }
              ]}
              description="WebKit uses Playwright's Safari-compatible engine; installed Safari itself cannot run headlessly."
              isDisabled={exporting}
              width="100%"
            />
            <Selector
              label="Quality"
              value={quality}
              onChange={(value) => setQuality(value as ReplayVideoExportOptionsDocument["quality"])}
              options={[
                { value: "720p", label: "Standard · 720p" },
                { value: "1080p", label: "High · 1080p" },
                { value: "1440p", label: "Ultra · 1440p" }
              ]}
              isDisabled={exporting}
              width="100%"
            />
            <div className="video-export-row">
              <Selector
                label="Playback speed"
                value={String(speed)}
                onChange={(value) => setSpeed(Number(value) as ReplayVideoExportOptionsDocument["speed"])}
                options={[0.5, 1, 2, 4, 8, 16].map((value) => ({ value: String(value), label: `${value}×` }))}
                isDisabled={exporting}
                width="100%"
              />
              <Selector
                label="Frame rate"
                value={String(fps)}
                onChange={(value) => setFps(Number(value) as ReplayVideoExportOptionsDocument["fps"])}
                options={[
                  { value: "30", label: "30 fps" },
                  { value: "60", label: "60 fps" }
                ]}
                isDisabled={exporting}
                width="100%"
              />
            </div>
            <Selector
              label="Replay content"
              value={streamMode}
              onChange={(value) => setStreamMode(value as ReplayVideoExportOptionsDocument["streamMode"])}
              options={[
                { value: "events", label: "Event steps" },
                { value: "recorded", label: "Recorded stream", disabled: !props.recordedStreamingAvailable },
                { value: "simulated", label: "Simulated TUI stream" }
              ]}
              description="Simulated streaming is permanently labeled in the exported video."
              isDisabled={exporting}
              width="100%"
            />
            <CheckboxInput
              label="Simulate user typing before prompt submission"
              description="Typing is presentation-only and permanently labeled as simulated."
              value={promptTyping}
              onChange={setPromptTyping}
              isDisabled={exporting}
              width="100%"
            />
            {promptTyping && (
              <Selector
                label="Typing speed"
                value={String(typingSpeed)}
                onChange={(value) => setTypingSpeed(Number(value) as NonNullable<ReplayVideoExportOptionsDocument["typingSpeed"]>)}
                options={[
                  { value: "0.5", label: "Slow · 0.5×" },
                  { value: "1", label: "Normal · 1×" },
                  { value: "2", label: "Fast · 2×" },
                  { value: "4", label: "Very fast · 4×" }
                ]}
                isDisabled={exporting}
                width="100%"
              />
            )}
            <CheckboxInput
              label="Export unredacted content"
              value={reveal}
              onChange={setReveal}
              isDisabled={exporting}
              width="100%"
            />
            {reveal && (
              <Banner
                status="warning"
                title="Unredacted export"
                description="The MP4 may contain credentials or private source code."
                collapsible={false}
              />
            )}
            {error && (
              <Banner
                status="error"
                title="MP4 export failed"
                description={error}
                collapsible={false}
              />
            )}
            {exporting && (
              <div className="agentjourney-video-progress">
                <div><span>{progress.message}</span><strong>{progress.percent}%</strong></div>
                <ProgressBar
                  label="MP4 export progress"
                  value={progress.percent}
                  max={100}
                  isLabelHidden
                />
                {progress.total > 0 && <small>{progress.completed}/{progress.total} Replay frames</small>}
              </div>
            )}
          </LayoutContent>
        )}
        footer={(
          <LayoutFooter hasDivider>
            <div className="agentjourney-astryx-actions">
              <Button
                label="Cancel"
                variant="secondary"
                onClick={() => requestClose(false)}
                isDisabled={exporting}
              />
              <Button
                label="Export MP4"
                variant="primary"
                onClick={() => void submit()}
                isLoading={exporting}
                isDisabled={exporting || !rendererId}
              />
            </div>
          </LayoutFooter>
        )}
      />
    </Dialog>
  );
}
