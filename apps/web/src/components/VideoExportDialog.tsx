import { useState } from "react";
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
  const [quality, setQuality] = useState<ReplayVideoExportOptionsDocument["quality"]>("1080p");
  const [speed, setSpeed] = useState<ReplayVideoExportOptionsDocument["speed"]>(1);
  const [fps, setFps] = useState<ReplayVideoExportOptionsDocument["fps"]>(30);
  const [streamMode, setStreamMode] = useState<ReplayVideoExportOptionsDocument["streamMode"]>(
    props.initialStreamMode
  );
  const [rendererId, setRendererId] = useState(props.rendererId);
  const [reveal, setReveal] = useState(props.reveal);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    setExporting(true);
    setError(undefined);
    try {
      await props.onExport({
        rendererId,
        quality,
        speed,
        fps,
        streamMode,
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
        <label className="checkbox-label video-export-redaction">
          <input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} disabled={exporting} />
          Export unredacted content
        </label>
        {reveal && <p className="video-export-warning">The MP4 may contain credentials or private source code.</p>}
        {error && <p className="video-export-error">{error}</p>}
        {exporting && <p className="video-export-progress">Rendering Replay frames and encoding H.264 locally…</p>}
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
