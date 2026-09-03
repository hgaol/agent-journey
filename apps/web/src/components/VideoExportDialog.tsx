import { useEffect, useState } from "react";
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
  const [streamMode, setStreamMode] = useState<ReplayVideoExportOptionsDocument["streamMode"]>(
    props.initialStreamMode
  );
  const [promptTyping, setPromptTyping] = useState(false);
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
        reveal,
        revisionId: props.revisionId,
        interpretationId: props.interpretationId
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "MP4 export failed");
      setExporting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="small-dialog video-export-dialog" role="dialog" aria-modal="true" aria-labelledby="video-export-title">
        <header>
          <div>
            <p className="eyebrow">Local video export</p>
            <h2 id="video-export-title">Export Replay as MP4</h2>
          </div>
          <button className="icon-button" onClick={props.onClose} disabled={exporting} aria-label="Close">×</button>
        </header>
        <p className="video-export-copy">
          Renders the source-native Journey Stage locally. MP4 exports contain no audio, accounts, or telemetry.
        </p>
        <label>
          Renderer
          <select value={rendererId} onChange={(event) => setRendererId(event.target.value)} disabled={exporting}>
            {props.renderers.map((renderer) => (
              <option key={renderer.id} value={renderer.id} disabled={!renderer.stylePack}>
                {renderer.name}{renderer.stylePack ? "" : " (HTML only)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rendering engine
          <select value={browser} onChange={(event) => setBrowser(event.target.value as NonNullable<ReplayVideoExportOptionsDocument["browser"]>)} disabled={exporting}>
            <option value="auto">Auto · Chromium, Chrome, Edge, then WebKit</option>
            <option value="chromium">Playwright Chromium</option>
            <option value="chrome">Google Chrome</option>
            <option value="edge">Microsoft Edge · Stable/Beta/Dev/Canary</option>
            <option value="webkit">WebKit · Safari-compatible</option>
          </select>
          <small>WebKit uses Playwright's Safari-compatible engine; installed Safari itself cannot run headlessly.</small>
        </label>
        <label>
          Quality
          <select value={quality} onChange={(event) => setQuality(event.target.value as ReplayVideoExportOptionsDocument["quality"])} disabled={exporting}>
            <option value="720p">Standard · 720p</option>
            <option value="1080p">High · 1080p</option>
            <option value="1440p">Ultra · 1440p</option>
          </select>
        </label>
        <div className="video-export-row">
          <label>
            Playback speed
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as ReplayVideoExportOptionsDocument["speed"])} disabled={exporting}>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
              <option value={8}>8×</option>
              <option value={16}>16×</option>
            </select>
          </label>
          <label>
            Frame rate
            <select value={fps} onChange={(event) => setFps(Number(event.target.value) as ReplayVideoExportOptionsDocument["fps"])} disabled={exporting}>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </label>
        </div>
        <label>
          Replay content
          <select value={streamMode} onChange={(event) => setStreamMode(event.target.value as ReplayVideoExportOptionsDocument["streamMode"])} disabled={exporting}>
            <option value="events">Event steps</option>
            <option value="recorded" disabled={!props.recordedStreamingAvailable}>Recorded stream</option>
            <option value="simulated">Simulated TUI stream</option>
          </select>
          <small>Simulated streaming is permanently labeled in the exported video.</small>
        </label>
        <label className="checkbox-label video-export-prompt-typing">
          <input type="checkbox" checked={promptTyping} onChange={(event) => setPromptTyping(event.target.checked)} disabled={exporting} />
          Simulate user typing before prompt submission
        </label>
        <small className="video-export-field-note">Typing is presentation-only and permanently labeled as simulated.</small>
        <label className="checkbox-label video-export-redaction">
          <input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} disabled={exporting} />
          Export unredacted content
        </label>
        {reveal && <p className="video-export-warning">The MP4 may contain credentials or private source code.</p>}
        {error && <p className="video-export-error">{error}</p>}
        {exporting && (
          <div
            className="video-export-progress"
            role="progressbar"
            aria-label="MP4 export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div>
              <span>{progress.message}</span>
              <strong>{progress.percent}%</strong>
            </div>
            <i><span style={{ width: `${progress.percent}%` }} /></i>
            {progress.total > 0 && <small>{progress.completed}/{progress.total} Replay frames</small>}
          </div>
        )}
        <footer>
          <button className="secondary-button" onClick={props.onClose} disabled={exporting}>Cancel</button>
          <button className="primary-button" onClick={() => void submit()} disabled={exporting || !rendererId}>
            {exporting ? "Exporting…" : "Export MP4"}
          </button>
        </footer>
      </section>
    </div>
  );
}
