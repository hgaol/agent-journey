import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@astryxdesign/core/Button";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { JourneySummaryDocument, SearchHitDocument } from "@agentjourney/contracts";
import { api } from "../api.js";
import { EmptyState } from "../components/EmptyState.js";
import { shortId, sourceLabel } from "../source-brand.js";

const ACTIVITY_KINDS = ["human-input", "agent-output", "reasoning", "tool-invocation", "tool-result", "context-injection", "diagnostic", "unclassified"];
const CAPABILITIES = ["shell", "file-read", "file-edit", "search", "web", "delegation", "interaction", "custom"];
type ISODateValue = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function JourneyCard(props: {
  journey: JourneySummaryDocument;
  match?: SearchHitDocument;
}): React.ReactNode {
  const { journey, match } = props;
  return (
    <Link
      to="/journeys/$journeyId"
      params={{ journeyId: journey.id }}
      className={`journey-card${match ? " search-journey-card" : ""}`}
    >
      <div className="card-top">
        <span className={`agent-badge source-${journey.sourceAgent}`}>{sourceLabel(journey.sourceAgent)}</span>
        <time>{new Date(journey.startedAt ?? journey.updatedAt).toLocaleDateString()}</time>
      </div>
      <h2>{journey.title ?? "Untitled journey"}</h2>
      <p className="workspace">{journey.workspace ?? "Workspace not evidenced"}</p>
      {match && (
        <div className="search-card-match">
          <div>
            <strong>{match.matchCount} matching {match.matchCount === 1 ? "Activity" : "Activities"}</strong>
            <span>{formatMatchedKinds(match.matchedKinds)}</span>
          </div>
          <p>{match.text || match.evidenceAnchor}</p>
        </div>
      )}
      {journey.projectName && <span className="card-project">{journey.projectName}</span>}
      <div className="tag-row">{journey.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="card-stats">
        <span>{journey.activityCount} activities</span>
        {journey.unclassifiedCount > 0 && <span className="warning">{journey.unclassifiedCount} unclassified</span>}
        <code>{shortId(journey.nativeSessionId)}</code>
      </div>
    </Link>
  );
}

export function LibraryPage(): React.ReactNode {
  const [query, setQuery] = useState("");
  const [sourceAgent, setSourceAgent] = useState("");
  const [kind, setKind] = useState("");
  const [projectId, setProjectId] = useState("");
  const [capability, setCapability] = useState("");
  const [from, setFrom] = useState<ISODateValue | "">("");
  const [until, setUntil] = useState<ISODateValue | "">("");
  const journeys = useQuery({ queryKey: ["journeys"], queryFn: api.listJourneys });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const searching = query.trim().length > 1 || Boolean(sourceAgent || kind || projectId || capability || from || until);
  const search = useQuery({
    queryKey: ["search", query, sourceAgent, kind, projectId, capability, from, until],
    queryFn: () => api.search({
      query: query.trim() || undefined,
      sourceAgent: sourceAgent || undefined,
      kind: kind || undefined,
      projectId: projectId || undefined,
      capability: capability || undefined,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      until: until ? new Date(`${until}T23:59:59`).toISOString() : undefined
    }),
    enabled: searching
  });
  const journeyById = useMemo(
    () => new Map((journeys.data ?? []).map((journey) => [journey.id, journey])),
    [journeys.data]
  );
  const visibleJourneys = useMemo(() => {
    if (!projectId) return journeys.data;
    return journeys.data?.filter((journey) => journey.projectId === projectId);
  }, [journeys.data, projectId]);
  const matchingJourneys = useMemo(
    () => (search.data ?? []).flatMap((match) => {
      const journey = journeyById.get(match.journeyId);
      return journey ? [{ journey, match }] : [];
    }),
    [journeyById, search.data]
  );
  const matchingJourneyCount = matchingJourneys.length;
  const clearFilters = (): void => {
    setQuery("");
    setSourceAgent("");
    setKind("");
    setProjectId("");
    setCapability("");
    setFrom("");
    setUntil("");
  };

  return (
    <main className="page library-page">
      <section className="hero-row">
        <div><p className="eyebrow">Independent local archive</p><h1>Revisit how the work unfolded.</h1><p className="lede">Search and replay coding-agent histories without changing their evidence.</p></div>
        <div className="library-count"><strong>{journeys.data?.length ?? 0}</strong><span>Journeys</span></div>
      </section>

      <div className="search-box astryx-search-box">
        <TextInput
          label="Search canonical activity"
          isLabelHidden
          value={query}
          onChange={setQuery}
          hasClear
          placeholder="Search canonical activity…"
          width="100%"
        />
      </div>
      <div className="search-filters astryx-search-filters">
        <Selector label="Source" value={sourceAgent} onChange={(value) => setSourceAgent(value ?? "")} placeholder="All agents" hasClear options={[
          { value: "claude-code", label: "Claude Code" },
          { value: "codex-cli", label: "Codex CLI" },
          { value: "pi", label: "Pi" },
          { value: "github-copilot-cli", label: "Copilot CLI" }
        ]} size="sm" />
        <Selector label="Activity" value={kind} onChange={(value) => setKind(value ?? "")} placeholder="All kinds" hasClear options={ACTIVITY_KINDS.map((value) => ({ value, label: value }))} size="sm" />
        <Selector label="Capability" value={capability} onChange={(value) => setCapability(value ?? "")} placeholder="All capabilities" hasClear options={CAPABILITIES.map((value) => ({ value, label: value }))} size="sm" />
        <Selector label="Project" value={projectId} onChange={(value) => setProjectId(value ?? "")} placeholder="All projects" hasClear options={(projects.data ?? []).map((project) => ({ value: project.id, label: project.name }))} size="sm" />
        <DateInput label="From" {...(from ? { value: from } : {})} onChange={(value) => setFrom(value ?? "")} hasClear format="system_date" size="sm" />
        <DateInput label="Until" {...(until ? { value: until } : {})} onChange={(value) => setUntil(value ?? "")} hasClear format="system_date" size="sm" />
        {searching && <Button label="Clear filters" variant="ghost" size="sm" onClick={clearFilters} />}
      </div>

      {searching ? (
        <section className="result-list">
          <div className="section-title"><h2>Search results</h2><span>{matchingJourneyCount} {matchingJourneyCount === 1 ? "Journey" : "Journeys"}</span></div>
          <div className="journey-grid search-journey-grid">
            {matchingJourneys.map(({ journey, match }) => (
              <JourneyCard key={journey.id} journey={journey} match={match} />
            ))}
          </div>
          {!search.isLoading && matchingJourneyCount === 0 && <EmptyState title="No matching Journey" detail="Try fewer filters or a different phrase." />}
        </section>
      ) : journeys.isLoading ? <div className="loading">Loading archive…</div> : visibleJourneys?.length ? (
        <section className="journey-grid">
          {visibleJourneys.map((journey) => <JourneyCard key={journey.id} journey={journey} />)}
        </section>
      ) : (
        <EmptyState title="No Journeys captured yet" detail="Approve a coding-agent Source Root, preview its histories, then choose what to preserve." action={<Link to="/sources" className="primary-button">Configure sources</Link>} />
      )}
    </main>
  );
}

function formatMatchedKinds(kinds: readonly string[]): string {
  const shown = kinds.slice(0, 3).map((kind) => kind.replaceAll("-", " "));
  const remaining = kinds.length - shown.length;
  return `${shown.join(", ")}${remaining > 0 ? ` +${remaining}` : ""}` || "matching content";
}
