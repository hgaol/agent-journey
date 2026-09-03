import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { builtInStylePacks, rendererForSourceAgent } from "@agentjourney/builtin-renderers";
import type { ActivityDocument, StageDocument } from "@agentjourney/contracts";
import type { RendererIntent } from "@agentjourney/plugin-sdk";
import type { ReplayStreamMode } from "@agentjourney/activity-graph";
import { projectStageDocument } from "@agentjourney/portability";
import { api, saveDownload } from "../api.js";
import { AnnotationDialog } from "../components/AnnotationDialog.js";
import { CoveragePanel } from "../components/CoveragePanel.js";
import { EvidenceInspector } from "../components/EvidenceInspector.js";
import { OverlayEditor } from "../components/OverlayEditor.js";
import { ReplayTimeline } from "../components/ReplayTimeline.js";
import { VideoExportDialog } from "../components/VideoExportDialog.js";
import { StageFrame } from "../components/StageFrame.js";
import { useReplay } from "../hooks/useReplay.js";
import { shortId, sourceLabel } from "../source-brand.js";
import "../terminal-journey.css";

function sourceGlyph(sourceAgent: string): string {
  if (sourceAgent === "claude-code") return "✻";
  if (sourceAgent === "codex-cli") return "›_";
  if (sourceAgent === "pi") return "π";
  if (sourceAgent === "github-copilot-cli") return "◉";
  return ">";
}

function activityLabel(activity: ActivityDocument): string {
  return activity.nativeName ?? activity.kind.replaceAll("-", " ");
}

function displayPayload(activity: ActivityDocument): string {
  if (activity.payload === undefined) return "No structured payload";
  const text = typeof activity.payload === "string"
    ? activity.payload
    : JSON.stringify(activity.payload, null, 2);
  return text.length > 12_000 ? `${text.slice(0, 12_000)}\n…` : text;
}

function replayClock(milliseconds: number | undefined): string {
  if (milliseconds === undefined || !Number.isFinite(milliseconds)) return "--:--.-";
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = (milliseconds % 60_000) / 1000;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function ReplayRemainingTime(props: {
  plannedRemainingMs: number;
  playing: boolean;
  canAutoPlay: boolean;
}): React.ReactNode {
  const [remainingMs, setRemainingMs] = useState(props.plannedRemainingMs);
  useEffect(() => {
    setRemainingMs(props.plannedRemainingMs);
    if (!props.playing || props.plannedRemainingMs <= 0) return;
    const startedAt = window.performance.now();
    const interval = window.setInterval(() => {
      setRemainingMs(Math.max(0, props.plannedRemainingMs - (window.performance.now() - startedAt)));
    }, 100);
    return () => window.clearInterval(interval);
  }, [props.plannedRemainingMs, props.playing]);
  return (
    <code
      className="terminal-remaining-time"
      data-testid="replay-remaining-time"
      title={props.canAutoPlay
        ? "Estimated remaining time after timeline, streaming, and typing speed settings"
        : "Remaining time is unavailable for manual-only Replay"}
    >{props.canAutoPlay ? `left ${replayClock(remainingMs)}` : "left · manual"}</code>
  );
}

const ThreadRail = memo(function ThreadRail(props: {
  threads: StageDocument["threads"];
  activities: StageDocument["activities"];
  selectedThreadId: string;
  onSeek: (activityId: string) => void;
}): React.ReactNode {
  const summaries = useMemo(() => {
    const result = new Map<string, { firstActivityId?: string; count: number }>();
    for (const activity of props.activities) {
      const summary = result.get(activity.threadId) ?? { count: 0 };
      summary.firstActivityId ??= activity.id;
      summary.count += 1;
      result.set(activity.threadId, summary);
    }
    return result;
  }, [props.activities]);
  return (
    <section>
      <h2>THREADS <span>{props.threads.length}</span></h2>
      {props.threads.map((thread) => {
        const summary = summaries.get(thread.id);
        return (
          <button
            key={thread.id}
            className={thread.id === props.selectedThreadId ? "active" : ""}
            disabled={!summary?.firstActivityId}
            onClick={() => summary?.firstActivityId && props.onSeek(summary.firstActivityId)}
          >
            <i>{thread.id === "main" ? "●" : "├"}</i>
            <span>{thread.label ?? (thread.id === "main" ? "main" : thread.id.replace(/^agent:/u, "agent "))}</span>
            <small>{summary?.count ?? 0}</small>
          </button>
        );
      })}
    </section>
  );
});

const TurnRail = memo(function TurnRail(props: {
  turns: StageDocument["turns"];
  selectedTurnId: string | undefined;
  onSeek: (activityId: string) => void;
}): React.ReactNode {
  return (
    <section className="terminal-turn-list">
      <h2>TURNS <span>{props.turns.length}</span></h2>
      {props.turns.map((turn, index) => {
        const firstActivityId = turn.activityIds[0];
        return (
          <button
            key={turn.id}
            className={turn.id === props.selectedTurnId ? "active" : ""}
            disabled={!firstActivityId}
            onClick={() => firstActivityId && props.onSeek(firstActivityId)}
          >
            <i>{turn.boundaryProvenance === "evidenced" ? "◆" : "◇"}</i>
            <span>turn {index + 1}</span>
            <small>{turn.activityIds.length}</small>
          </button>
        );
      })}
    </section>
  );
});

const ActivityDetails = memo(function ActivityDetails(props: {
  activity: ActivityDocument | undefined;
  turnBoundaryProvenance: string | undefined;
  onEvidence: (activityId: string) => void;
  onAnnotate: (activity: ActivityDocument) => void;
}): React.ReactNode {
  const activity = props.activity;
  return (
    <section>
      <h2>ACTIVITY</h2>
      {activity ? (
        <>
          <strong className="terminal-selected-kind">{activityLabel(activity)}</strong>
          <code className="terminal-anchor">{activity.evidenceAnchor}</code>
          <dl>
            <div><dt>kind</dt><dd>{activity.kind}</dd></div>
            <div><dt>thread</dt><dd>{activity.threadId}</dd></div>
            <div><dt>turn</dt><dd>{props.turnBoundaryProvenance ?? "—"}</dd></div>
            <div><dt>source order</dt><dd>{activity.sourceOrder}</dd></div>
            <div><dt>status</dt><dd>{activity.status ?? "—"}</dd></div>
            <div><dt>timestamp</dt><dd>{activity.timestamp ?? "not evidenced"}</dd></div>
          </dl>
          <div className="terminal-inspector-actions">
            <button onClick={() => props.onEvidence(activity.id)}>evidence</button>
            <button onClick={() => props.onAnnotate(activity)}>annotate</button>
            <button onClick={() => void navigator.clipboard.writeText(
              activity.text ?? JSON.stringify(activity.payload)
            )}>copy</button>
          </div>
          <h2>PAYLOAD</h2>
          <pre>{displayPayload(activity)}</pre>
        </>
      ) : <p>no activity selected</p>}
    </section>
  );
});

export function JourneyPage(): React.ReactNode {
  const { journeyId } = useParams({ from: "/journeys/$journeyId" });
  const navigate = useNavigate();
  const client = useQueryClient();
  const [revisionId, setRevisionId] = useState<string>();
  const [interpretationId, setInterpretationId] = useState<string>();
  const [reveal, setReveal] = useState(false);
  const journey = useQuery({
    queryKey: ["journey", journeyId, revisionId, interpretationId, reveal],
    queryFn: () => api.getJourney(journeyId, { revisionId, interpretationId, reveal })
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const pluginRenderers = useQuery({ queryKey: ["renderer-plugins"], queryFn: api.listRendererPlugins });
  const renderers = useMemo(
    () => [...builtInStylePacks, ...(pluginRenderers.data ?? [])],
    [pluginRenderers.data]
  );
  const [rendererId, setRendererId] = useState<string>();
  const [view, setView] = useState<"review" | "replay">("review");
  const [streamMode, setStreamMode] = useState<ReplayStreamMode>("events");
  const [simulatePromptTyping, setSimulatePromptTyping] = useState(true);
  const [stageSearch, setStageSearch] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState<string>();
  const [evidenceSelection, setEvidenceSelection] = useState<{
    activityId?: string;
    evidenceAnchor?: string;
  }>();
  const [annotationActivity, setAnnotationActivity] = useState<ActivityDocument>();
  const [showOverlay, setShowOverlay] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showVideoExport, setShowVideoExport] = useState(false);
  const replay = useReplay(
    journey.data?.stage.activities ?? [],
    streamMode,
    view === "replay",
    simulatePromptTyping
  );
  const activityById = useMemo(
    () => new Map((journey.data?.stage.activities ?? []).map((activity) => [activity.id, activity])),
    [journey.data?.stage.activities]
  );
  const turnByActivityId = useMemo(() => {
    const result = new Map<string, StageDocument["turns"][number]>();
    for (const turn of journey.data?.stage.turns ?? []) {
      for (const activityId of turn.activityIds) result.set(activityId, turn);
    }
    return result;
  }, [journey.data?.stage.turns]);
  const hasSourceOrderFrames = useMemo(
    () => replay.frames.some(({ timing }) => timing === "source-order"),
    [replay.frames]
  );

  useEffect(() => {
    if (!journey.data || rendererId || pluginRenderers.isLoading) return;
    const sourceRenderer = renderers.find(
      ({ manifest }) => manifest.targetSourceAgent === journey.data?.summary.sourceAgent
    );
    setRendererId(
      journey.data.overlay.rendererId
      ?? sourceRenderer?.manifest.id
      ?? rendererForSourceAgent(journey.data.summary.sourceAgent).manifest.id
    );
  }, [journey.data, pluginRenderers.isLoading, rendererId, renderers]);

  useEffect(() => {
    replay.reset();
    setSelectedActivityId(undefined);
  // Reset only when the selected evidence or interpretation changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionId, interpretationId]);

  useEffect(() => {
    if (view === "replay" && replay.current) setSelectedActivityId(replay.current.activityId);
  }, [replay.current, view]);

  const stage = useMemo<StageDocument | undefined>(() => {
    if (!journey.data) return undefined;
    const playheadFrame = replay.frames[replay.index];
    const inputActivity = playheadFrame?.simulatedInputTextLength !== undefined
      ? activityById.get(playheadFrame.activityId)
      : undefined;
    const simulatedInputDraft = inputActivity?.text !== undefined && playheadFrame?.simulatedInputTextLength !== undefined
      ? {
          activityId: inputActivity.id,
          text: [...inputActivity.text].slice(0, playheadFrame.simulatedInputTextLength).join("")
        }
      : undefined;
    return {
      ...journey.data.stage,
      presentation: {
        redacted: !reveal,
        view,
        streamMode,
        ...(stageSearch.trim() ? { searchQuery: stageSearch.trim() } : {}),
        ...(selectedActivityId ? { selectedActivityId } : {}),
        ...(view === "replay" && playheadFrame
          ? {
              playheadActivityId: playheadFrame.activityId,
              ...(playheadFrame.deliveryChunkIndex !== undefined
                ? { playheadDeliveryChunk: playheadFrame.deliveryChunkIndex }
                : {}),
              ...(playheadFrame.simulatedTextLength !== undefined
                ? { playheadSimulatedTextLength: playheadFrame.simulatedTextLength }
                : {}),
              ...(simulatedInputDraft ? { simulatedInputDraft } : {})
            }
          : {})
      }
    };
  }, [activityById, journey.data, replay.frames, replay.index, reveal, selectedActivityId, stageSearch, streamMode, view]);

  const renderer = renderers.find(({ manifest }) => manifest.id === rendererId)
    ?? rendererForSourceAgent(journey.data?.summary.sourceAgent ?? "neutral-fallback");
  const rendererStage = useMemo(
    () => renderer.executable && stage ? projectStageDocument(stage) : undefined,
    [renderer.executable, stage]
  );
  const rendererTree = useQuery({
    queryKey: [
      "renderer-tree",
      renderer.manifest.id,
      rendererStage?.interpretationId,
      rendererStage?.presentation.view,
      rendererStage?.presentation.playheadActivityId,
      rendererStage?.presentation.playheadDeliveryChunk,
      rendererStage?.presentation.playheadSimulatedTextLength,
      rendererStage?.presentation.streamMode,
      rendererStage?.presentation.searchQuery,
      rendererStage?.presentation.selectedActivityId,
      rendererStage?.presentation.redacted
    ],
    queryFn: () => api.renderPlugin(renderer.manifest.id, rendererStage!),
    enabled: Boolean(renderer.executable && rendererStage),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false
  });

  const comparisonInterpretation = journey.data?.interpretations.find(
    ({ id }) => id !== journey.data?.interpretationId
  );
  const comparisonRevision = comparisonInterpretation
    ? journey.data?.revisionId
    : journey.data?.revisions.find(({ id }) => id !== journey.data?.revisionId)?.id;
  const compare = useQuery({
    queryKey: [
      "journey-comparison",
      journeyId,
      comparisonRevision,
      comparisonInterpretation?.id,
      journey.data?.revisionId,
      journey.data?.interpretationId
    ],
    queryFn: () => api.compareJourney(journeyId, {
      beforeRevisionId: comparisonRevision!,
      ...(comparisonInterpretation
        ? { beforeInterpretationId: comparisonInterpretation.id }
        : {}),
      afterRevisionId: journey.data!.revisionId,
      afterInterpretationId: journey.data!.interpretationId
    }),
    enabled: showComparison && Boolean(comparisonRevision)
  });

  const reinterpret = useMutation({
    mutationFn: () => api.reinterpretJourney(journeyId, journey.data!.revisionId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["journey", journeyId] });
    }
  });

  const deleteJourney = useMutation({
    mutationFn: (exclude: boolean) => api.deleteJourney(journeyId, exclude),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["journeys"] });
      await navigate({ to: "/" });
    }
  });

  const selectRenderer = (id: string): void => {
    setRendererId(id);
    if (journey.data) {
      void api.updateOverlay(journeyId, { rendererId: id }).then(() =>
        client.invalidateQueries({ queryKey: ["journey", journeyId] })
      );
    }
  };

  const seekActivity = useCallback((activityId: string, replayMode = view === "replay"): void => {
    setSelectedActivityId(activityId);
    if (!replayMode) return;
    const index = replay.frames.findIndex((frame) => frame.activityId === activityId);
    if (index >= 0) replay.setIndex(index);
  }, [replay.frames, replay.setIndex, view]);

  const inspectEvidence = useCallback((activityId: string): void => {
    setEvidenceSelection({ activityId });
  }, []);

  const handleIntent = (intent: RendererIntent): void => {
    const activity = journey.data?.stage.activities.find(({ id }) => id === intent.activityId);
    if (!activity) return;
    if (intent.type === "open-evidence") setEvidenceSelection({ activityId: intent.activityId });
    if (intent.type === "annotate-activity") setAnnotationActivity(activity);
    if (intent.type === "seek-activity") seekActivity(intent.activityId);
    if (intent.type === "copy-content") {
      void navigator.clipboard.writeText(activity.text ?? JSON.stringify(activity.payload));
    }
  };

  if (journey.isLoading) {
    return <main className="terminal-route-loading"><span>▋</span> loading Journey…</main>;
  }
  if (journey.error || !journey.data) {
    return <main className="page"><div className="error-banner">{journey.error?.message ?? "Journey not found"}</div></main>;
  }

  const detail = journey.data;
  const maxPlayhead = Math.max(0, replay.frames.length - 1);
  const currentFrame = replay.frames[replay.index];
  const transportFrame = view === "replay" ? currentFrame : replay.frames.at(-1);
  const selectedActivity = (selectedActivityId ? activityById.get(selectedActivityId) : undefined)
    ?? (view === "replay" && currentFrame ? activityById.get(currentFrame.activityId) : detail.stage.activities.at(-1));
  const selectedThreadId = selectedActivity?.threadId ?? "main";
  const selectedTurn = selectedActivity ? turnByActivityId.get(selectedActivity.id) : undefined;
  const selectedRevision = detail.revisions.find(({ id }) => id === detail.revisionId);

  const enterReplay = (): void => {
    setView("replay");
    replay.restart();
    const first = replay.frames[0];
    if (first) setSelectedActivityId(first.activityId);
  };

  const togglePlayback = (): void => {
    if (replay.playing) {
      replay.setPlaying(false);
      return;
    }
    if (replay.index >= maxPlayhead) replay.setIndex(0);
    replay.setPlaying(true);
  };

  return (
    <main
      className="terminal-journey-page"
      data-source-agent={detail.summary.sourceAgent}
      data-testid="terminal-replay-debugger"
    >
      <header className="terminal-session-commandbar">
        <Link to="/" className="terminal-back" title="Back to Journey archive">←</Link>
        <span className="terminal-agent-glyph">{sourceGlyph(detail.summary.sourceAgent)}</span>
        <div className="terminal-session-title">
          <strong>{detail.summary.title ?? "Untitled journey"}</strong>
          <span>{sourceLabel(detail.summary.sourceAgent)} · {detail.interpretation.journey.models?.[0] ?? "model unknown"}</span>
        </div>
        <label className="terminal-search">
          <span>/</span>
          <input
            value={stageSearch}
            onChange={(event) => setStageSearch(event.target.value)}
            placeholder="find in session"
          />
        </label>
        <label className="terminal-inline-select">
          renderer
          <select value={renderer.manifest.id} onChange={(event) => selectRenderer(event.target.value)}>
            {renderers.map((candidate) => (
              <option
                key={`${candidate.manifest.id}:${candidate.manifest.version}`}
                value={candidate.manifest.id}
              >
                {candidate.manifest.displayName}{candidate.builtIn === false ? " · plugin" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className={reveal ? "terminal-mask unsafe" : "terminal-mask"}
          onClick={() => {
            if (reveal || window.confirm("Reveal unredacted Canonical Activity?")) {
              setReveal((value) => !value);
            }
          }}
        >
          {reveal ? "UNREDACTED" : "MASKED"}
        </button>
      </header>

      <div className="terminal-workbench">
        <aside className="terminal-navigation-rail">
          <section className="terminal-rail-summary">
            <span>SESSION</span>
            <strong>{sourceLabel(detail.summary.sourceAgent)}</strong>
            <code>{shortId(detail.summary.nativeSessionId)}</code>
            <small>{detail.summary.workspace ?? "workspace not evidenced"}</small>
          </section>

          <ThreadRail
            threads={detail.stage.threads}
            activities={detail.stage.activities}
            selectedThreadId={selectedThreadId}
            onSeek={seekActivity}
          />

          <TurnRail
            turns={detail.stage.turns}
            selectedTurnId={selectedTurn?.id}
            onSeek={seekActivity}
          />

          <section className="terminal-history-selectors">
            <h2>HISTORY</h2>
            <label>
              revision
              <select
                value={detail.revisionId}
                onChange={(event) => {
                  setRevisionId(event.target.value);
                  setInterpretationId(undefined);
                }}
              >
                {detail.revisions.map((revision, index) => (
                  <option key={revision.id} value={revision.id}>
                    {index === 0 ? "latest · " : ""}{new Date(revision.capturedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              interpretation
              <select
                value={detail.interpretationId}
                onChange={(event) => setInterpretationId(event.target.value)}
              >
                {detail.interpretations.map((interpretation) => (
                  <option key={interpretation.id} value={interpretation.id}>
                    {interpretation.adapterVersion} · {interpretation.provenance}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="terminal-rail-facts">
            <h2>TRACE</h2>
            <dl>
              <div><dt>activities</dt><dd>{detail.stage.activities.length}</dd></div>
              <div><dt>records</dt><dd>{detail.stage.coverageSummary.sourceRecords}</dd></div>
              <div><dt>unclassified</dt><dd>{detail.stage.coverageSummary.unclassified}</dd></div>
              <div><dt>sensitive</dt><dd>{detail.stage.sensitiveFindingCount}</dd></div>
            </dl>
          </section>
        </aside>

        <section className="terminal-session-pane" aria-label="Terminal session replay">
          <header className="terminal-pane-header">
            <span className={replay.playing ? "terminal-live-dot running" : "terminal-live-dot"} />
            <strong>{view === "replay" ? "REPLAY" : "REVIEW"}</strong>
            <code>{detail.summary.workspace ?? "~"}</code>
            <span>{detail.interpretation.journey.gitBranch ?? "no branch"}</span>
            <span>{selectedRevision?.identityConflict ? "⚠ identity conflict" : "source evidence"}</span>
            <span>{view === "replay"
              ? `${streamMode} stream${simulatePromptTyping
                  ? replay.hasSimulatedInputPaste
                    ? " · simulated prompt typing + large-input paste"
                    : " · simulated prompt typing"
                  : ""}`
              : "full transcript"}</span>
          </header>

          {selectedRevision?.identityConflict && (
            <div className="terminal-warning-line">
              ! divergent evidence claims this Native Session Identity
            </div>
          )}
          {showComparison && (
            <div className="terminal-comparison-line">
              <strong>{comparisonInterpretation ? "interpretation diff" : "revision diff"}</strong>
              {compare.isLoading ? <span>comparing…</span> : compare.data ? (
                <>
                  <span className="added">+{compare.data.added.length}</span>
                  <span className="removed">−{compare.data.removed.length}</span>
                  <span>{compare.data.reclassified.length} reclassified</span>
                  <span>{compare.data.unchanged.length} unchanged</span>
                </>
              ) : <span>no comparison</span>}
            </div>
          )}
          {rendererTree.error && (
            <div className="terminal-warning-line">
              ! renderer failed in QuickJS: {rendererTree.error.message}; neutral rendering active
            </div>
          )}
          <div className="terminal-stage-frame">
            {stage && (
              <StageFrame
                document={stage}
                renderer={renderer}
                rendererTree={rendererTree.fetchStatus === "fetching" ? undefined : rendererTree.data}
                fixedHeight
                onIntent={handleIntent}
              />
            )}
          </div>
        </section>

        <aside className="terminal-activity-inspector">
          <ActivityDetails
            activity={selectedActivity}
            turnBoundaryProvenance={selectedTurn?.boundaryProvenance}
            onEvidence={inspectEvidence}
            onAnnotate={setAnnotationActivity}
          />

          <section className="terminal-session-actions">
            <h2>SESSION</h2>
            <button onClick={() => setShowCoverage(true)}>coverage / fidelity</button>
            <button onClick={() => setShowOverlay(true)}>review overlay</button>
            <button
              onClick={() => reinterpret.mutate()}
              disabled={reinterpret.isPending}
            >
              {reinterpret.isPending ? "interpreting…" : "reinterpret"}
            </button>
            {(detail.revisions.length > 1 || detail.interpretations.length > 1) && (
              <button onClick={() => setShowComparison((value) => !value)}>compare history</button>
            )}
            <button
              onClick={() => {
                if (window.confirm(
                  "Export an unencrypted, lossless Journey Package? It may contain credentials and private source code."
                )) {
                  void api.exportJourneyPackage(journeyId).then(saveDownload);
                }
              }}
            >
              export package
            </button>
            <button onClick={() => setShowVideoExport(true)}>
              export mp4
            </button>
            <button
              onClick={() => void api.exportPresentation(
                journeyId,
                renderer.manifest.id,
                {
                  revisionId: detail.revisionId,
                  interpretationId: detail.interpretationId,
                  reveal
                }
              ).then(saveDownload)}
            >
              export html
            </button>
            <details>
              <summary>destructive actions</summary>
              <button
                className="terminal-danger"
                onClick={() => {
                  if (window.confirm("Delete this Journey? A future scan may rediscover it.")) {
                    deleteJourney.mutate(false);
                  }
                }}
              >
                delete only
              </button>
              <button
                className="terminal-danger"
                onClick={() => {
                  if (window.confirm("Delete this Journey and exclude it from future capture?")) {
                    deleteJourney.mutate(true);
                  }
                }}
              >
                delete + exclude
              </button>
            </details>
          </section>
        </aside>
      </div>

      <footer className="terminal-replay-dock">
        <div className="terminal-transport">
          <div className="terminal-mode-switch">
            <button
              className={view === "review" ? "active" : ""}
              onClick={() => {
                setView("review");
                replay.setPlaying(false);
              }}
            >
              REVIEW
            </button>
            <button className={view === "replay" ? "active" : ""} onClick={enterReplay}>
              REPLAY
            </button>
          </div>
          <button
            className="terminal-play"
            disabled={view !== "replay" || !replay.canAutoPlay}
            title={replay.canAutoPlay
              ? streamMode === "simulated"
                ? "Replay with clearly labeled simulated TUI streaming"
                : hasSourceOrderFrames
                  ? "Replay evidenced timestamps; untimed Activities are placed by source order and labeled"
                  : "Replay evidenced timing"
              : "No evidenced timestamps are available. Step manually or choose simulated TUI streaming."}
            onClick={togglePlayback}
          >
            {replay.playing ? "Ⅱ" : "▶"}
          </button>
          <button
            disabled={view !== "replay"}
            onClick={() => replay.setIndex(Math.max(0, replay.index - 1))}
          >
            ‹
          </button>
          <input
            aria-label="Replay playhead"
            type="range"
            min={0}
            max={maxPlayhead}
            value={view === "replay" ? replay.index : maxPlayhead}
            onChange={(event) => {
              setView("replay");
              replay.setPlaying(false);
              replay.setIndex(Number(event.target.value));
            }}
          />
          <button
            disabled={view !== "replay"}
            onClick={() => replay.setIndex(Math.min(maxPlayhead, replay.index + 1))}
          >
            ›
          </button>
          <code title="Observed Replay position">{replayClock(transportFrame?.observedOffsetMs)}</code>
          {view === "replay" && (
            <ReplayRemainingTime
              plannedRemainingMs={replay.plannedRemainingMs}
              playing={replay.playing}
              canAutoPlay={replay.canAutoPlay}
            />
          )}
          <span>{view === "replay" ? replay.index + 1 : replay.frames.length}/{replay.frames.length}</span>
          <select
            aria-label="Content streaming"
            value={streamMode}
            onChange={(event) => {
              setView("replay");
              setStreamMode(event.target.value as ReplayStreamMode);
            }}
          >
            <option value="events">event steps</option>
            <option value="recorded" disabled={!detail.stage.fidelity.deliveryTraces}>
              recorded stream{detail.stage.fidelity.deliveryTraces ? "" : " · unavailable"}
            </option>
            <option value="simulated">simulated TUI stream</option>
          </select>
          <select
            aria-label="Prompt playback"
            value={simulatePromptTyping ? "simulated" : "instant"}
            onChange={(event) => {
              setView("replay");
              setSimulatePromptTyping(event.target.value === "simulated");
            }}
          >
            <option value="instant">prompt · instant</option>
            <option value="simulated">prompt · simulated typing/paste</option>
          </select>
          {simulatePromptTyping && (
            <select
              aria-label="Typing speed"
              value={replay.typingSpeed}
              onChange={(event) => replay.setTypingSpeed(Number(event.target.value))}
            >
              <option value={0.5}>typing · slow</option>
              <option value={1}>typing · normal</option>
              <option value={2}>typing · fast</option>
              <option value={4}>typing · very fast</option>
            </select>
          )}
          {streamMode !== "events" && (
            <select
              aria-label="Streaming speed"
              value={replay.streamingSpeed}
              onChange={(event) => replay.setStreamingSpeed(Number(event.target.value))}
            >
              <option value={0.5}>stream 0.5×</option>
              <option value={1}>stream 1×</option>
              <option value={2}>stream 2×</option>
              <option value={4}>stream 4×</option>
              <option value={8}>stream 8×</option>
              <option value={16}>stream 16×</option>
            </select>
          )}
          <select
            aria-label="Replay speed"
            value={replay.speed}
            onChange={(event) => replay.setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>timeline 0.5×</option>
            <option value={1}>timeline 1×</option>
            <option value={2}>timeline 2×</option>
            <option value={4}>timeline 4×</option>
          </select>
          <small>
            {transportFrame?.simulatedInputPaste
              ? "SIMULATED prompt paste"
              : transportFrame?.timing === "simulated"
                ? "SIMULATED cadence"
              : transportFrame?.timing === "evidenced"
                ? "evidenced timestamp"
                : transportFrame?.timing === "source-order"
                  ? "untimed · source-order placement"
                  : "manual step"}
            {transportFrame?.deliveryChunkIndex !== undefined
              ? ` · recorded chunk ${transportFrame.deliveryChunkIndex + 1}`
              : transportFrame?.simulatedTextLength !== undefined
                ? ` · ${transportFrame.simulatedTextLength} characters`
                : ""}
            {streamMode !== "events" ? ` · stream ${replay.streamingSpeed}×` : ""}
            {simulatePromptTyping
              ? ` · SIMULATED prompt typing ${replay.typingSpeed}×${replay.hasSimulatedInputPaste ? " · large inputs pasted" : ""}`
              : ""}
            {transportFrame?.idleGapCompressed ? " · idle compressed" : ""}
          </small>
          <div className="terminal-native-context">
            <span className="terminal-native-user">local@agentjourney:</span>
            <span className="terminal-native-path">{detail.summary.workspace ?? "~"}</span>
            <span className="terminal-native-branch">({detail.interpretation.journey.gitBranch ?? "no branch"})</span>
            <span className="terminal-native-model">{detail.interpretation.journey.models?.[0] ?? "model unknown"}</span>
          </div>
        </div>
        <ReplayTimeline
          frames={replay.frames}
          activities={detail.stage.activities}
          currentIndex={view === "replay" ? replay.index : maxPlayhead}
          onSeek={(index) => {
            setView("replay");
            replay.setPlaying(false);
            replay.setIndex(index);
          }}
        />
      </footer>

      {evidenceSelection && (
        <EvidenceInspector
          journey={detail}
          {...(evidenceSelection.activityId
            ? { initialActivityId: evidenceSelection.activityId }
            : {})}
          {...(evidenceSelection.evidenceAnchor
            ? { initialEvidenceAnchor: evidenceSelection.evidenceAnchor }
            : {})}
          onClose={() => setEvidenceSelection(undefined)}
        />
      )}
      {annotationActivity && (
        <AnnotationDialog
          journey={detail}
          activity={annotationActivity}
          onClose={() => setAnnotationActivity(undefined)}
        />
      )}
      {showOverlay && (
        <OverlayEditor
          journey={detail}
          projects={projects.data ?? []}
          onClose={() => setShowOverlay(false)}
        />
      )}
      {showVideoExport && (
        <VideoExportDialog
          rendererId={renderer.javascript
            ? rendererForSourceAgent(detail.summary.sourceAgent).manifest.id
            : renderer.manifest.id}
          renderers={renderers.map((candidate) => ({
            id: candidate.manifest.id,
            name: candidate.manifest.displayName,
            stylePack: !candidate.javascript
          }))}
          initialStreamMode={streamMode === "events" && !replay.canAutoPlay ? "simulated" : streamMode}
          recordedStreamingAvailable={detail.stage.fidelity.deliveryTraces}
          reveal={reveal}
          revisionId={detail.revisionId}
          interpretationId={detail.interpretationId}
          onClose={() => setShowVideoExport(false)}
          onExport={async (options) => {
            const result = await api.exportReplayVideo(journeyId, options);
            saveDownload(result);
            setShowVideoExport(false);
          }}
        />
      )}
      {showCoverage && (
        <CoveragePanel
          journey={detail}
          onClose={() => setShowCoverage(false)}
          onOpenEvidence={(evidenceAnchor, activityId) => {
            setShowCoverage(false);
            setEvidenceSelection({
              evidenceAnchor,
              ...(activityId ? { activityId } : {})
            });
          }}
        />
      )}
    </main>
  );
}
