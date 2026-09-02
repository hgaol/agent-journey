import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { builtInStylePacks, rendererForSourceAgent } from "@agentjourney/builtin-renderers";
import type { ActivityDocument, StageDocument } from "@agentjourney/contracts";
import type { RendererIntent } from "@agentjourney/plugin-sdk";
import { api, saveDownload } from "../api.js";
import { AnnotationDialog } from "../components/AnnotationDialog.js";
import { CoveragePanel } from "../components/CoveragePanel.js";
import { EvidenceInspector } from "../components/EvidenceInspector.js";
import { OverlayEditor } from "../components/OverlayEditor.js";
import { StageFrame, projectStageDocument } from "../components/StageFrame.js";
import { ReplayTimeline } from "../components/ReplayTimeline.js";
import { useReplay } from "../hooks/useReplay.js";
import { shortId, sourceLabel } from "../source-brand.js";

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
  const renderers = useMemo(() => [...builtInStylePacks, ...(pluginRenderers.data ?? [])], [pluginRenderers.data]);
  const [rendererId, setRendererId] = useState<string>();
  const [view, setView] = useState<"review" | "replay">("review");
  const [stageSearch, setStageSearch] = useState("");
  const [evidenceSelection, setEvidenceSelection] = useState<{
    activityId?: string;
    evidenceAnchor?: string;
  }>();
  const [annotationActivity, setAnnotationActivity] = useState<ActivityDocument>();
  const [showOverlay, setShowOverlay] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const replay = useReplay(journey.data?.stage.activities ?? []);

  useEffect(() => {
    if (!journey.data || rendererId || pluginRenderers.isLoading) return;
    const sourceRenderer = renderers.find(({ manifest }) => manifest.targetSourceAgent === journey.data?.summary.sourceAgent);
    setRendererId(journey.data.overlay.rendererId ?? sourceRenderer?.manifest.id ?? rendererForSourceAgent(journey.data.summary.sourceAgent).manifest.id);
  }, [journey.data, pluginRenderers.isLoading, rendererId, renderers]);

  useEffect(() => {
    replay.reset();
  // Reset only when the selected evidence or interpretation changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionId, interpretationId]);

  const stage = useMemo<StageDocument | undefined>(() => {
    if (!journey.data) return undefined;
    const playheadFrame = replay.frames[replay.index];
    return {
      ...journey.data.stage,
      presentation: {
        redacted: !reveal,
        view,
        ...(stageSearch.trim() ? { searchQuery: stageSearch.trim() } : {}),
        ...(view === "replay" && playheadFrame
          ? {
              playheadActivityId: playheadFrame.activityId,
              ...(playheadFrame.deliveryChunkIndex !== undefined
                ? { playheadDeliveryChunk: playheadFrame.deliveryChunkIndex }
                : {})
            }
          : {})
      }
    };
  }, [journey.data, replay.index, reveal, stageSearch, view]);

  const renderer = renderers.find(({ manifest }) => manifest.id === rendererId)
    ?? rendererForSourceAgent(journey.data?.summary.sourceAgent ?? "neutral-fallback");
  const rendererStage = useMemo(() => stage ? projectStageDocument(stage) : undefined, [stage]);
  const rendererTree = useQuery({
    queryKey: [
      "renderer-tree",
      renderer.manifest.id,
      rendererStage?.interpretationId,
      rendererStage?.presentation.view,
      rendererStage?.presentation.playheadActivityId,
      rendererStage?.presentation.playheadDeliveryChunk,
      rendererStage?.presentation.searchQuery,
      rendererStage?.presentation.redacted
    ],
    queryFn: () => api.renderPlugin(renderer.manifest.id, rendererStage!),
    enabled: Boolean(renderer.executable && rendererStage),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false
  });

  const comparisonInterpretation = journey.data?.interpretations.find(({ id }) => id !== journey.data?.interpretationId);
  const comparisonRevision = comparisonInterpretation ? journey.data?.revisionId : journey.data?.revisions.find(({ id }) => id !== journey.data?.revisionId)?.id;
  const compare = useQuery({
    queryKey: ["journey-comparison", journeyId, comparisonRevision, comparisonInterpretation?.id, journey.data?.revisionId, journey.data?.interpretationId],
    queryFn: () => api.compareJourney(journeyId, {
      beforeRevisionId: comparisonRevision!,
      ...(comparisonInterpretation ? { beforeInterpretationId: comparisonInterpretation.id } : {}),
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
    if (journey.data) void api.updateOverlay(journeyId, { rendererId: id }).then(() => client.invalidateQueries({ queryKey: ["journey", journeyId] }));
  };

  const handleIntent = (intent: RendererIntent): void => {
    const activity = journey.data?.stage.activities.find(({ id }) => id === intent.activityId);
    if (!activity) return;
    if (intent.type === "open-evidence") setEvidenceSelection({ activityId: intent.activityId });
    if (intent.type === "annotate-activity") setAnnotationActivity(activity);
    if (intent.type === "seek-activity") {
      const index = replay.frames.findIndex(({ activityId }) => activityId === intent.activityId);
      if (index >= 0) replay.setIndex(index);
    }
    if (intent.type === "copy-content") void navigator.clipboard.writeText(activity.text ?? JSON.stringify(activity.payload));
  };

  if (journey.isLoading) return <main className="page"><div className="loading">Loading Journey…</div></main>;
  if (journey.error || !journey.data) return <main className="page"><div className="error-banner">{journey.error?.message ?? "Journey not found"}</div></main>;

  const detail = journey.data;
  const maxPlayhead = Math.max(0, replay.frames.length - 1);
  const currentFrame = replay.frames[replay.index];

  return (
    <main className="journey-page">
      <aside className="journey-inspector">
        <Link to="/" className="back-link">← Archive</Link>
        <p className="eyebrow">{sourceLabel(detail.summary.sourceAgent)}</p>
        <h1>{detail.summary.title ?? "Untitled journey"}</h1>
        <p className="workspace">{detail.summary.workspace ?? "Workspace not evidenced"}</p>
        <div className="tag-row">{detail.summary.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        {detail.summary.projectName && <div className="project-pill">Project · {detail.summary.projectName}</div>}
        {detail.summary.parentJourneyId && <Link className="lineage-link" to="/journeys/$journeyId" params={{ journeyId: detail.summary.parentJourneyId }}>↖ Parent Journey</Link>}

        {detail.revisions.find(({ id }) => id === detail.revisionId)?.identityConflict && <div className="identity-conflict">This revision diverges from previously archived evidence claiming the same Native Session Identity.</div>}
        <dl className="metadata-list">
          <div><dt>Native session</dt><dd><code>{shortId(detail.summary.nativeSessionId)}</code></dd></div>
          <div><dt>Agent version</dt><dd>{detail.interpretation.journey.sourceAgentVersion ?? "unknown"}</dd></div>
          <div><dt>Model provider</dt><dd>{detail.interpretation.journey.modelProvider ?? "unknown"}</dd></div>
          <div><dt>Model</dt><dd>{detail.interpretation.journey.models?.join(", ") || "unknown"}</dd></div>
          <div><dt>Git branch</dt><dd>{detail.interpretation.journey.gitBranch ?? "unknown"}</dd></div>
          <div><dt>Revision</dt><dd><code>{shortId(detail.revisionId)}</code></dd></div>
          <div><dt>Interpretation</dt><dd><code>{shortId(detail.interpretationId)}</code></dd></div>
          <div><dt>Activities</dt><dd>{detail.stage.activities.length}</dd></div>
          <div><dt>Turns</dt><dd>{detail.stage.turns.length}</dd></div>
          <div><dt>Threads</dt><dd>{detail.stage.threads.length}</dd></div>
          <div><dt>Source records</dt><dd>{detail.stage.coverageSummary.sourceRecords}</dd></div>
          <div><dt>Sensitive findings</dt><dd>{detail.stage.sensitiveFindingCount}</dd></div>
        </dl>

        <button className="fidelity-box" onClick={() => setShowCoverage(true)}>
          <span>Fidelity manifest</span>
          <div>{detail.stage.fidelity.timedKinds.length > 0 ? "Timed" : "Semantic"}</div>
          <small>{detail.stage.fidelity.agentThreads ? "Agent threads" : "Single thread"} · {detail.stage.coverageSummary.unclassified} unclassified</small>
        </button>
        <div className="inspector-actions">
          <button className="secondary-button" onClick={() => setShowOverlay(true)}>Edit overlay</button>
          <button className="secondary-button" onClick={() => {
            const first = detail.stage.activities[0];
            if (first) setEvidenceSelection({ activityId: first.id });
          }}>Evidence</button>
          <button className="secondary-button" onClick={() => reinterpret.mutate()} disabled={reinterpret.isPending}>{reinterpret.isPending ? "Interpreting…" : "Reinterpret"}</button>
          <button className="secondary-button" onClick={() => { if (window.confirm("Export an unencrypted, lossless Journey Package? It may contain credentials and private source code.")) void api.exportJourneyPackage(journeyId).then(saveDownload); }}>Package</button>
          <button className="secondary-button" onClick={() => void api.exportPresentation(journeyId, renderer.manifest.id, { revisionId: detail.revisionId, interpretationId: detail.interpretationId, reveal }).then(saveDownload)}>HTML</button>
          {(detail.revisions.length > 1 || detail.interpretations.length > 1) && <button className="secondary-button" onClick={() => setShowComparison((value) => !value)}>Compare</button>}
          <button className="danger-button" onClick={() => { if (window.confirm("Delete this Journey now? A future scan may rediscover it.")) deleteJourney.mutate(false); }}>Delete only</button>
          <button className="danger-button" onClick={() => { if (window.confirm("Delete this Journey and retain a content-free exclusion to prevent future recapture?")) deleteJourney.mutate(true); }}>Delete + exclude</button>
        </div>
      </aside>

      <section className="journey-workspace">
        <header className="stage-toolbar">
          <div className="segmented">
            <button className={view === "review" ? "selected" : ""} onClick={() => { setView("review"); replay.setPlaying(false); }}>Review</button>
            <button className={view === "replay" ? "selected" : ""} onClick={() => { setView("replay"); replay.reset(); }}>Replay</button>
          </div>
          <label className="compact-select">Revision<select value={detail.revisionId} onChange={(event) => { setRevisionId(event.target.value); setInterpretationId(undefined); }}>{detail.revisions.map((revision, index) => <option key={revision.id} value={revision.id}>{index === 0 ? "Latest · " : ""}{new Date(revision.capturedAt).toLocaleString()} · {String(revision.sourceProvenance?.kind ?? "unknown")} · {revision.observationCount ?? 0} observation(s){revision.identityConflict ? " · ⚠ identity conflict" : ""}</option>)}</select></label>
          <label className="compact-select">Interpretation<select value={detail.interpretationId} onChange={(event) => setInterpretationId(event.target.value)}>{detail.interpretations.map((interpretation) => <option key={interpretation.id} value={interpretation.id}>{interpretation.adapterVersion} · {interpretation.provenance}</option>)}</select></label>
          <input className="stage-search" value={stageSearch} onChange={(event) => setStageSearch(event.target.value)} placeholder="Find in Journey" />
          <label className="renderer-select">Renderer<select value={renderer.manifest.id} onChange={(event) => selectRenderer(event.target.value)}>{renderers.map((pack) => <option key={`${pack.manifest.id}:${pack.manifest.version}`} value={pack.manifest.id}>{pack.manifest.displayName}{pack.builtIn === false ? " · plugin" : ""}</option>)}</select></label>
          <button className={reveal ? "reveal-toggle active" : "reveal-toggle"} onClick={() => { if (reveal || window.confirm("Reveal unredacted Canonical Activity?")) setReveal((value) => !value); }}>{reveal ? "Unredacted" : "Masked"}</button>
        </header>

        {view === "replay" && (
          <div className="replay-console">
            <button disabled={!replay.canAutoPlay} title={replay.canAutoPlay ? "Replay evidenced timing" : "This Interpretation supports manual stepping only"} onClick={() => {
              if (replay.playing) replay.setPlaying(false);
              else {
                if (replay.index >= maxPlayhead) replay.setIndex(0);
                replay.setPlaying(true);
              }
            }}>{replay.canAutoPlay ? (replay.playing ? "Pause" : replay.index >= maxPlayhead ? "Restart" : "Play") : "Step only"}</button>
            <button onClick={() => replay.setIndex(Math.max(0, replay.index - 1))}>←</button>
            <input type="range" min={0} max={maxPlayhead} value={replay.index} onChange={(event) => replay.setIndex(Number(event.target.value))} />
            <span>{replay.index + 1} / {replay.frames.length}</span>
            <button onClick={() => replay.setIndex(Math.min(maxPlayhead, replay.index + 1))}>→</button>
            <select value={replay.speed} onChange={(event) => replay.setSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
            <small>{currentFrame?.timing === "evidenced" ? "evidenced timing" : "manual step timing"}{currentFrame?.idleGapCompressed ? " · idle gap compressed" : ""}</small>
          </div>
        )}
        {view === "replay" && (
          <ReplayTimeline
            frames={replay.frames}
            activities={detail.stage.activities}
            currentIndex={replay.index}
            onSeek={replay.setIndex}
          />
        )}

        {showComparison && (
          <div className="comparison-strip">
            <strong>{comparisonInterpretation ? "Previous → selected Interpretation" : "Previous → selected Revision"}</strong>
            {compare.isLoading ? <span>Comparing…</span> : compare.data ? <><span>+{compare.data.added.length} added</span><span>−{compare.data.removed.length} removed</span><span>{compare.data.reclassified.length} reclassified</span><span>{compare.data.unchanged.length} unchanged</span></> : <span>No comparison</span>}
          </div>
        )}
        {rendererTree.error && <div className="error-banner">Renderer failed in QuickJS: {rendererTree.error.message}. Neutral Stage rendering is shown instead.</div>}
        {stage && <StageFrame document={stage} renderer={renderer} rendererTree={rendererTree.data} onIntent={handleIntent} />}
      </section>

      {evidenceSelection && <EvidenceInspector
        journey={detail}
        {...(evidenceSelection.activityId ? { initialActivityId: evidenceSelection.activityId } : {})}
        {...(evidenceSelection.evidenceAnchor ? { initialEvidenceAnchor: evidenceSelection.evidenceAnchor } : {})}
        onClose={() => setEvidenceSelection(undefined)}
      />}
      {annotationActivity && <AnnotationDialog journey={detail} activity={annotationActivity} onClose={() => setAnnotationActivity(undefined)} />}
      {showOverlay && <OverlayEditor journey={detail} projects={projects.data ?? []} onClose={() => setShowOverlay(false)} />}
      {showCoverage && <CoveragePanel
        journey={detail}
        onClose={() => setShowCoverage(false)}
        onOpenEvidence={(evidenceAnchor, activityId) => {
          setShowCoverage(false);
          setEvidenceSelection({
            evidenceAnchor,
            ...(activityId ? { activityId } : {})
          });
        }}
      />}
    </main>
  );
}
