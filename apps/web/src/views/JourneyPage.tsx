import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { builtInStylePacks, rendererForSourceAgent } from "@agentjourney/builtin-renderers";
import type { ActivityDocument, StageDocument } from "@agentjourney/contracts";
import type { RendererIntent } from "@agentjourney/plugin-sdk";
import type { ReplayStreamMode } from "@agentjourney/activity-graph";
import { api, saveDownload } from "../api.js";
import { AnnotationDialog } from "../components/AnnotationDialog.js";
import { CoveragePanel } from "../components/CoveragePanel.js";
import { EvidenceInspector } from "../components/EvidenceInspector.js";
import { OverlayEditor } from "../components/OverlayEditor.js";
import { ReplayTimeline } from "../components/ReplayTimeline.js";
import { StageFrame, projectStageDocument } from "../components/StageFrame.js";
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
  const replay = useReplay(journey.data?.stage.activities ?? [], streamMode);

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
                : {})
            }
          : {})
      }
    };
  }, [journey.data, replay.frames, replay.index, reveal, selectedActivityId, stageSearch, streamMode, view]);

  const renderer = renderers.find(({ manifest }) => manifest.id === rendererId)
    ?? rendererForSourceAgent(journey.data?.summary.sourceAgent ?? "neutral-fallback");
  const rendererStage = useMemo(
    () => stage ? projectStageDocument(stage) : undefined,
    [stage]
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

  const seekActivity = (activityId: string, replayMode = view === "replay"): void => {
    setSelectedActivityId(activityId);
    if (!replayMode) return;
    const index = replay.frames.findIndex((frame) => frame.activityId === activityId);
    if (index >= 0) replay.setIndex(index);
  };

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
  const selectedActivity = detail.stage.activities.find(({ id }) => id === selectedActivityId)
    ?? (view === "replay"
      ? detail.stage.activities.find(({ id }) => id === currentFrame?.activityId)
      : detail.stage.activities.at(-1));
  const selectedThreadId = selectedActivity?.threadId ?? "main";
  const selectedTurn = detail.stage.turns.find((turn) =>
    selectedActivity ? turn.activityIds.includes(selectedActivity.id) : false
  );
  const selectedRevision = detail.revisions.find(({ id }) => id === detail.revisionId);

  const enterReplay = (): void => {
    setView("replay");
    replay.reset();
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

          <section>
            <h2>THREADS <span>{detail.stage.threads.length}</span></h2>
            {detail.stage.threads.map((thread) => {
              const firstActivity = detail.stage.activities.find(({ threadId }) => threadId === thread.id);
              const count = detail.stage.activities.filter(({ threadId }) => threadId === thread.id).length;
              return (
                <button
                  key={thread.id}
                  className={thread.id === selectedThreadId ? "active" : ""}
                  disabled={!firstActivity}
                  onClick={() => firstActivity && seekActivity(firstActivity.id)}
                >
                  <i>{thread.id === "main" ? "●" : "├"}</i>
                  <span>{thread.label ?? (thread.id === "main" ? "main" : thread.id.replace(/^agent:/u, "agent "))}</span>
                  <small>{count}</small>
                </button>
              );
            })}
          </section>

          <section className="terminal-turn-list">
            <h2>TURNS <span>{detail.stage.turns.length}</span></h2>
            {detail.stage.turns.map((turn, index) => {
              const firstActivityId = turn.activityIds[0];
              return (
                <button
                  key={turn.id}
                  className={turn.id === selectedTurn?.id ? "active" : ""}
                  disabled={!firstActivityId}
                  onClick={() => firstActivityId && seekActivity(firstActivityId)}
                >
                  <i>{turn.boundaryProvenance === "evidenced" ? "◆" : "◇"}</i>
                  <span>turn {index + 1}</span>
                  <small>{turn.activityIds.length}</small>
                </button>
              );
            })}
          </section>

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
            <span>{view === "replay" ? `${streamMode} stream` : "full transcript"}</span>
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
                rendererTree={rendererTree.data}
                fixedHeight
                onIntent={handleIntent}
              />
            )}
          </div>
        </section>

        <aside className="terminal-activity-inspector">
          <section>
            <h2>ACTIVITY</h2>
            {selectedActivity ? (
              <>
                <strong className="terminal-selected-kind">{activityLabel(selectedActivity)}</strong>
                <code className="terminal-anchor">{selectedActivity.evidenceAnchor}</code>
                <dl>
                  <div><dt>kind</dt><dd>{selectedActivity.kind}</dd></div>
                  <div><dt>thread</dt><dd>{selectedActivity.threadId}</dd></div>
                  <div><dt>turn</dt><dd>{selectedTurn?.boundaryProvenance ?? "—"}</dd></div>
                  <div><dt>source order</dt><dd>{selectedActivity.sourceOrder}</dd></div>
                  <div><dt>status</dt><dd>{selectedActivity.status ?? "—"}</dd></div>
                  <div><dt>timestamp</dt><dd>{selectedActivity.timestamp ?? "not evidenced"}</dd></div>
                </dl>
                <div className="terminal-inspector-actions">
                  <button onClick={() => setEvidenceSelection({ activityId: selectedActivity.id })}>evidence</button>
                  <button onClick={() => setAnnotationActivity(selectedActivity)}>annotate</button>
                  <button onClick={() => void navigator.clipboard.writeText(
                    selectedActivity.text ?? JSON.stringify(selectedActivity.payload)
                  )}>copy</button>
                </div>
                <h2>PAYLOAD</h2>
                <pre>{displayPayload(selectedActivity)}</pre>
              </>
            ) : <p>no activity selected</p>}
          </section>

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
                : "Replay evidenced timing"
              : "Some Activities lack evidenced timing. Reinterpret with the latest adapter, step manually, or choose simulated TUI streaming."}
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
          <code>{replayClock(transportFrame?.observedOffsetMs)}</code>
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
            aria-label="Replay speed"
            value={replay.speed}
            onChange={(event) => replay.setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
          <small>
            {transportFrame?.timing === "simulated"
              ? "SIMULATED cadence"
              : transportFrame?.timing === "evidenced"
                ? "evidenced timestamp"
                : "manual step"}
            {transportFrame?.deliveryChunkIndex !== undefined
              ? ` · recorded chunk ${transportFrame.deliveryChunkIndex + 1}`
              : transportFrame?.simulatedTextLength !== undefined
                ? ` · ${transportFrame.simulatedTextLength} characters`
                : ""}
            {transportFrame?.idleGapCompressed ? " · idle compressed" : ""}
          </small>
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
