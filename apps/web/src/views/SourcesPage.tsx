import { useState } from "react";
import { zipSync } from "fflate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscoveredJourneyDocument } from "@agentjourney/contracts";
import { api } from "../api.js";

export function SourcesPage(): React.ReactNode {
  const client = useQueryClient();
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.listSources });
  const [discoveries, setDiscoveries] = useState<Record<string, DiscoveredJourneyDocument[]>>({});
  const [selectedBySource, setSelectedBySource] = useState<Record<string, string[]>>({});
  const [busySource, setBusySource] = useState<string>();
  const [error, setError] = useState<string>();
  const [importAgent, setImportAgent] = useState("claude-code");

  const approve = useMutation({
    mutationFn: ({ sourceAgent, root, scanPolicy = "manual" }: { sourceAgent: string; root: string; scanPolicy?: "manual" | "automatic" }) => api.approveSource(sourceAgent, root, scanPolicy),
    onSuccess: () => client.invalidateQueries({ queryKey: ["sources"] })
  });
  const revoke = useMutation({
    mutationFn: api.revokeSource,
    onSuccess: async (_result, sourceAgent) => {
      setDiscoveries((current) => { const next = { ...current }; delete next[sourceAgent]; return next; });
      await client.invalidateQueries({ queryKey: ["sources"] });
    }
  });
  const rawImport = useMutation({
    mutationFn: ({ sourceAgent, bytes }: { sourceAgent: string; bytes: ArrayBuffer }) => api.importSourceBundle(sourceAgent, bytes),
    onSuccess: async (outcome) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["journeys"] }),
        client.invalidateQueries({ queryKey: ["pending-evidence"] })
      ]);
      if (outcome.pending.length > 0) setError(`${outcome.pending.length} imported bundle(s) became Pending Evidence.`);
    }
  });
  const capture = useMutation({
    mutationFn: ({ sourceAgent, ids }: { sourceAgent: string; ids: string[] }) => api.capture(sourceAgent, ids),
    onSuccess: async (outcome) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["journeys"] }),
        client.invalidateQueries({ queryKey: ["pending-evidence"] })
      ]);
      if (outcome.pending.length > 0) setError(`${outcome.pending.length} Source Bundle(s) were preserved as Pending Evidence.`);
    }
  });

  const importFiles = async (selected: FileList | null): Promise<void> => {
    if (!selected?.length) return;
    const entries: Record<string, Uint8Array> = {};
    for (const file of Array.from(selected)) {
      const relativePath = file.webkitRelativePath || file.name;
      entries[relativePath.replaceAll("\\", "/")] = new Uint8Array(await file.arrayBuffer());
    }
    const zipped = zipSync(entries, { level: 0 });
    rawImport.mutate({
      sourceAgent: importAgent,
      bytes: zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
    });
  };

  const discover = async (sourceAgent: string): Promise<void> => {
    setBusySource(sourceAgent);
    setError(undefined);
    try {
      const found = await api.discover(sourceAgent);
      setDiscoveries((current) => ({ ...current, [sourceAgent]: found }));
      setSelectedBySource((current) => ({ ...current, [sourceAgent]: [] }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Discovery failed");
    } finally {
      setBusySource(undefined);
    }
  };

  return (
    <main className="page sources-page">
      <p className="eyebrow">Passive capture</p>
      <h1>Source Roots</h1>
      <p className="lede narrow">AgentJourney never launches or modifies an agent. Approving a root permits read-only discovery; manual scan is the default.</p>
      <div className="privacy-note"><strong>Local custody</strong><span>Raw files are copied byte-for-byte into an unencrypted local archive only after you capture them.</span></div>
      {error && <div className="error-banner">{error}</div>}
      <section className="raw-import-panel">
        <div><strong>Import native raw files</strong><span>Select one or more source files, or an agent session directory. Exact bytes are preserved before interpretation.</span></div>
        <select value={importAgent} onChange={(event) => setImportAgent(event.target.value)}><option value="claude-code">Claude Code</option><option value="codex-cli">Codex CLI</option><option value="pi">Pi</option><option value="github-copilot-cli">GitHub Copilot CLI</option></select>
        <label className="plugin-file-button">Choose files<input type="file" multiple onChange={(event) => void importFiles(event.currentTarget.files)} /></label>
        <label className="plugin-file-button">Choose directory<input type="file" multiple {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => void importFiles(event.currentTarget.files)} /></label>
        {rawImport.isPending && <small>Preserving and interpreting files…</small>}
      </section>
      <section className="source-list">
        {sources.data?.map((source) => {
          const found = discoveries[source.sourceAgent];
          const selected = selectedBySource[source.sourceAgent] ?? [];
          const toggleSelection = (nativeSessionId: string): void => {
            setSelectedBySource((current) => {
              const values = current[source.sourceAgent] ?? [];
              return {
                ...current,
                [source.sourceAgent]: values.includes(nativeSessionId)
                  ? values.filter((id) => id !== nativeSessionId)
                  : [...values, nativeSessionId]
              };
            });
          };
          return (
            <article className="source-card" key={source.sourceAgent}>
              <div className="source-card-main">
                <span className={`source-logo source-${source.sourceAgent}`}>{source.displayName.slice(0, 2)}</span>
                <div className="source-copy">
                  <div className="source-heading"><h2>{source.displayName}</h2><span className={source.available ? "available" : "missing"}>{source.available ? "detected" : "not found"}</span></div>
                  <code>{source.approvedRoot ?? source.suggestedRoot}</code>
                  <small>{source.adapterId} · {source.adapterVersion} · {source.scanPolicy} scan</small>
                </div>
                <div className="source-actions">
                  {!source.approved ? (
                    <><button
                      className="secondary-button"
                      disabled={!source.available || approve.isPending}
                      onClick={() => approve.mutate({ sourceAgent: source.sourceAgent, root: source.suggestedRoot })}
                    >Approve suggested</button><button className="policy-button" onClick={() => { const root = window.prompt("Absolute Source Root path", source.suggestedRoot); if (root?.trim()) approve.mutate({ sourceAgent: source.sourceAgent, root: root.trim() }); }}>Choose root</button></>
                  ) : (
                    <><button className="secondary-button" disabled={busySource === source.sourceAgent} onClick={() => void discover(source.sourceAgent)}>
                      {busySource === source.sourceAgent ? "Scanning…" : "Preview scan"}
                    </button><button className="policy-button" onClick={() => approve.mutate({ sourceAgent: source.sourceAgent, root: source.approvedRoot!, scanPolicy: source.scanPolicy === "manual" ? "automatic" : "manual" })}>{source.scanPolicy === "manual" ? "Enable auto" : "Use manual"}</button><button className="policy-button" onClick={() => { const root = window.prompt("Replace approved Source Root", source.approvedRoot); if (root?.trim()) approve.mutate({ sourceAgent: source.sourceAgent, root: root.trim(), scanPolicy: source.scanPolicy }); }}>Change root</button><button className="policy-button danger-text" onClick={() => { if (window.confirm(`Revoke filesystem access for ${source.displayName}? Archived Journeys remain.`)) revoke.mutate(source.sourceAgent); }}>Revoke</button></>
                  )}
                </div>
              </div>
              {found && (
                <div className="discovery-panel">
                  <div><strong>{found.length}</strong> candidate {found.length === 1 ? "Journey" : "Journeys"}<span>{found.reduce((count, item) => count + item.relativePaths.length, 0)} source files · {formatBytes(found.reduce((total, item) => total + (item.byteSize ?? 0), 0))} · {dateRange(found)}</span></div>
                  <div className="capture-scope-actions"><button onClick={() => setSelectedBySource((current) => ({ ...current, [source.sourceAgent]: found.map(({ nativeSessionId }) => nativeSessionId) }))}>Select all</button><button onClick={() => setSelectedBySource((current) => ({ ...current, [source.sourceAgent]: [] }))}>Clear</button></div>
                  <ul>{found.map((item) => <li key={item.nativeSessionId}><label><input type="checkbox" checked={selected.includes(item.nativeSessionId)} onChange={() => toggleSelection(item.nativeSessionId)} /><span>{item.title ?? "Untitled"}</span></label><code>{item.nativeSessionId.slice(0, 12)}</code></li>)}</ul>
                  <button
                    className="primary-button"
                    disabled={capture.isPending || selected.length === 0}
                    onClick={() => capture.mutate({ sourceAgent: source.sourceAgent, ids: selected })}
                  >{capture.isPending ? "Capturing…" : `Capture selected (${selected.length})`}</button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dateRange(items: DiscoveredJourneyDocument[]): string {
  const dates = items.flatMap(({ startedAt }) => startedAt ? [new Date(startedAt)] : []).sort((left, right) => left.valueOf() - right.valueOf());
  if (!dates.length) return "dates unknown";
  const first = dates[0]!.toLocaleDateString();
  const last = dates.at(-1)!.toLocaleDateString();
  return first === last ? first : `${first} – ${last}`;
}
