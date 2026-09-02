import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { EmptyState } from "../components/EmptyState.js";
import { shortId, sourceLabel } from "../source-brand.js";

const ACTIVITY_KINDS = ["human-input", "agent-output", "reasoning", "tool-invocation", "tool-result", "context-injection", "diagnostic", "unclassified"];

export function LibraryPage(): React.ReactNode {
  const [query, setQuery] = useState("");
  const [sourceAgent, setSourceAgent] = useState("");
  const [kind, setKind] = useState("");
  const [projectId, setProjectId] = useState("");
  const [capability, setCapability] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
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
  const visibleJourneys = useMemo(() => {
    if (!projectId) return journeys.data;
    return journeys.data?.filter((journey) => journey.projectId === projectId);
  }, [journeys.data, projectId]);

  return (
    <main className="page library-page">
      <section className="hero-row">
        <div><p className="eyebrow">Independent local archive</p><h1>Revisit how the work unfolded.</h1><p className="lede">Search and replay coding-agent histories without changing their evidence.</p></div>
        <div className="library-count"><strong>{journeys.data?.length ?? 0}</strong><span>Journeys</span></div>
      </section>

      <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search canonical activity…" /></label>
      <div className="search-filters">
        <label>Source<select value={sourceAgent} onChange={(event) => setSourceAgent(event.target.value)}><option value="">All agents</option><option value="claude-code">Claude Code</option><option value="codex-cli">Codex CLI</option><option value="pi">Pi</option><option value="github-copilot-cli">Copilot CLI</option></select></label>
        <label>Activity<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">All kinds</option>{ACTIVITY_KINDS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Capability<select value={capability} onChange={(event) => setCapability(event.target.value)}><option value="">All capabilities</option>{["shell", "file-read", "file-edit", "search", "web", "delegation", "interaction", "custom"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Until<input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></label>
        {(query || sourceAgent || kind || projectId || capability || from || until) && <button onClick={() => { setQuery(""); setSourceAgent(""); setKind(""); setProjectId(""); setCapability(""); setFrom(""); setUntil(""); }}>Clear</button>}
      </div>

      {searching ? (
        <section className="result-list">
          <div className="section-title"><h2>Search results</h2><span>{search.data?.length ?? 0} matches</span></div>
          {search.data?.map((hit) => (
            <Link key={`${hit.interpretationId}:${hit.activityId}`} to="/journeys/$journeyId" params={{ journeyId: hit.journeyId }} className="search-hit">
              <div><span className={`source-dot source-${hit.sourceAgent}`} />{sourceLabel(hit.sourceAgent)} · {hit.kind}</div>
              <strong>{hit.title ?? "Untitled journey"}</strong><p>{hit.text || hit.evidenceAnchor}</p>
            </Link>
          ))}
          {!search.isLoading && search.data?.length === 0 && <EmptyState title="No matching activity" detail="Try fewer filters or a different phrase." />}
        </section>
      ) : journeys.isLoading ? <div className="loading">Loading archive…</div> : visibleJourneys?.length ? (
        <section className="journey-grid">
          {visibleJourneys.map((journey) => (
            <Link key={journey.id} to="/journeys/$journeyId" params={{ journeyId: journey.id }} className="journey-card">
              <div className="card-top"><span className={`agent-badge source-${journey.sourceAgent}`}>{sourceLabel(journey.sourceAgent)}</span><time>{new Date(journey.startedAt ?? journey.updatedAt).toLocaleDateString()}</time></div>
              <h2>{journey.title ?? "Untitled journey"}</h2>
              <p className="workspace">{journey.workspace ?? "Workspace not evidenced"}</p>
              {journey.projectName && <span className="card-project">{journey.projectName}</span>}
              <div className="tag-row">{journey.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <div className="card-stats"><span>{journey.activityCount} activities</span>{journey.unclassifiedCount > 0 && <span className="warning">{journey.unclassifiedCount} unclassified</span>}<code>{shortId(journey.nativeSessionId)}</code></div>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState title="No Journeys captured yet" detail="Approve a coding-agent Source Root, preview its histories, then choose what to preserve." action={<Link to="/sources" className="primary-button">Configure sources</Link>} />
      )}
    </main>
  );
}
