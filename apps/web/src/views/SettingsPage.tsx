import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { sourceLabel, shortId } from "../source-brand.js";

export function SettingsPage(): React.ReactNode {
  const client = useQueryClient();
  const pending = useQuery({ queryKey: ["pending-evidence"], queryFn: api.listPendingEvidence });
  const exclusions = useQuery({ queryKey: ["capture-exclusions"], queryFn: api.listCaptureExclusions });
  const retention = useQuery({ queryKey: ["retention"], queryFn: api.getRetention });
  const plugins = useQuery({ queryKey: ["plugins"], queryFn: api.listPlugins });
  const pluginDiagnostics = useQuery({ queryKey: ["plugin-diagnostics"], queryFn: api.listPluginDiagnostics });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const [keepLast, setKeepLast] = useState("");
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof api.verifyArchive>>>();

  const retry = useMutation({ mutationFn: api.retryPendingEvidence, onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["pending-evidence"] }), client.invalidateQueries({ queryKey: ["journeys"] })]);
  }});
  const removePending = useMutation({ mutationFn: api.deletePendingEvidence, onSuccess: () => client.invalidateQueries({ queryKey: ["pending-evidence"] }) });
  const removeExclusion = useMutation({ mutationFn: ({ sourceAgent, nativeSessionId }: { sourceAgent: string; nativeSessionId: string }) => api.removeCaptureExclusion(sourceAgent, nativeSessionId), onSuccess: () => client.invalidateQueries({ queryKey: ["capture-exclusions"] }) });
  const saveRetention = useMutation({ mutationFn: () => api.setRetention(keepLast ? Number(keepLast) : undefined), onSuccess: () => client.invalidateQueries({ queryKey: ["retention"] }) });
  const applyRetention = useMutation({ mutationFn: api.applyRetention, onSuccess: async () => { await client.invalidateQueries({ queryKey: ["journeys"] }); } });
  const verify = useMutation({ mutationFn: api.verifyArchive, onSuccess: setVerification });
  const repair = useMutation({ mutationFn: api.repairArchive, onSuccess: setVerification });
  const rotateAuth = useMutation({ mutationFn: api.rotateLocalAuth });
  const automaticScan = useMutation({ mutationFn: api.runAutomaticScan, onSuccess: () => client.invalidateQueries({ queryKey: ["journeys"] }) });
  const renameProject = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.renameProject(id, name), onSuccess: () => client.invalidateQueries({ queryKey: ["projects"] }) });
  const mergeProject = useMutation({ mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) => api.mergeProjects(sourceId, targetId), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["projects"] }), client.invalidateQueries({ queryKey: ["journeys"] })]); } });
  const deleteProject = useMutation({ mutationFn: api.deleteProject, onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["projects"] }), client.invalidateQueries({ queryKey: ["journeys"] })]); } });
  const importPackage = useMutation({
    mutationFn: api.importJourneyPackage,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["journeys"] }),
        client.invalidateQueries({ queryKey: ["projects"] })
      ]);
    }
  });
  const installPlugin = useMutation({
    mutationFn: api.installPlugin,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["plugins"] }),
        client.invalidateQueries({ queryKey: ["renderer-plugins"] })
      ]);
    }
  });
  const selectPluginFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const document = JSON.parse(await file.text()) as { manifest?: { type?: string; id?: string; displayName?: string } };
      const manifest = document.manifest;
      if (!manifest?.id || !manifest.type) throw new Error("missing manifest");
      const warning = manifest.type === "source-adapter"
        ? `Install Source Adapter “${manifest.displayName ?? manifest.id}”? It will run in the restricted adapter sandbox and still requires a separately approved Source Root.`
        : `Install Renderer “${manifest.displayName ?? manifest.id}”? It will receive only the selected redacted Stage Document inside an opaque-origin iframe.`;
      if (window.confirm(warning)) installPlugin.mutate(document);
    } catch {
      window.alert("The selected file is not a valid JSON plugin package.");
    }
  };
  const selectJourneyPackage = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    if (!window.confirm("Import this unencrypted Journey Package? Its exact Source Evidence may contain credentials or private code.")) return;
    importPackage.mutate(await file.arrayBuffer());
  };

  return (
    <main className="page settings-page">
      <p className="eyebrow">Local platform</p><h1>Archive operations</h1><p className="lede narrow">Manage failed evidence, exclusions, explicit retention, and archive integrity. No content leaves this machine.</p>

      <section className="settings-section"><div className="settings-section-head"><div><h2>Local authorization</h2><p>Rotate the per-installation loopback secret and invalidate other browser sessions.</p></div><button className="secondary-button" onClick={() => { if (window.confirm("Rotate the local authorization secret? Other AgentJourney browser sessions will be signed out.")) rotateAuth.mutate(); }}>{rotateAuth.isPending ? "Rotating…" : "Rotate secret"}</button></div>{rotateAuth.isSuccess && <div className="verification good"><strong>Local secret rotated</strong><span>This browser received the replacement session.</span></div>}</section>

      <section className="settings-section"><div className="settings-section-head"><div><h2>Archive verification</h2><p>Hash every content object and validate every stored Interpretation.</p></div><div><button className="secondary-button" onClick={() => verify.mutate()} disabled={verify.isPending}>{verify.isPending ? "Verifying…" : "Verify"}</button><button className="secondary-button" onClick={() => repair.mutate()} disabled={repair.isPending}>Repair indexes/orphans</button></div></div>
        {verification && <div className={verification.issues.length ? "verification bad" : "verification good"}><strong>{verification.issues.length ? `${verification.issues.length} issue(s)` : "Archive verified"}</strong><span>{verification.checkedObjects} objects · {verification.checkedInterpretations} interpretations</span>{verification.issues.map((issue) => <p key={`${issue.kind}:${issue.message}`}>{issue.kind}: {issue.message}</p>)}</div>}
      </section>

      <section className="settings-section"><div className="settings-section-head"><div><h2>Journey Package import</h2><p>Import a checksummed, data-only .agentjourney package. Imported Interpretations retain external provenance.</p></div><label className="plugin-file-button">Choose package<input type="file" accept=".agentjourney,application/vnd.agentjourney+zip" onChange={(event) => void selectJourneyPackage(event.currentTarget.files?.[0])} /></label></div>
        {importPackage.error && <div className="error-banner">{importPackage.error.message}</div>}
        {importPackage.data && <div className="verification good"><strong>Package imported</strong><span>{importPackage.data.journeyIds.length} Journeys · {importPackage.data.revisions} revisions · {importPackage.data.interpretations} interpretations</span></div>}
      </section>

      <section className="settings-section"><div className="settings-section-head"><div><h2>Local Plugins</h2><p>Install an inert, integrity-checked .agentjourney-plugin package. Source Adapter plugins become active after restarting the host.</p></div><label className="plugin-file-button">Install package<input type="file" accept=".agentjourney-plugin,application/json" onChange={(event) => void selectPluginFile(event.currentTarget.files?.[0])} /></label></div>
        {installPlugin.error && <div className="error-banner">{installPlugin.error.message}</div>}
        <div className="settings-list">{plugins.data?.map((plugin) => <div key={`${plugin.manifest.id}:${plugin.manifest.version}`}><div><strong>{plugin.manifest.displayName}</strong><small>{plugin.manifest.type} · {plugin.manifest.id}@{plugin.manifest.version}{plugin.development ? " · development directory" : ""}</small></div><code>{plugin.integrity.slice(0, 22)}…</code></div>)}</div>
        {!plugins.data?.length && <p className="muted-copy">No third-party plugins installed.</p>}
        {pluginDiagnostics.data?.map((diagnostic) => <div className="error-banner" key={diagnostic.filePath}><strong>Plugin disabled</strong><br />{diagnostic.filePath}<br />{diagnostic.message}</div>)}
      </section>

      <section className="settings-section"><div className="settings-section-head"><div><h2>Automatic Scan Policies</h2><p>Run one batched Capture Cycle for roots explicitly configured as automatic.</p></div><button className="secondary-button" onClick={() => automaticScan.mutate()} disabled={automaticScan.isPending}>{automaticScan.isPending ? "Scanning…" : "Run automatic cycle"}</button></div></section>

      <section className="settings-section"><h2>Projects <span>{projects.data?.length ?? 0}</span></h2><p className="muted-copy">Rename Projects here, reassign a Journey to split it, or delete a Project to leave its Journeys unassigned.</p>
        <div className="settings-list">{projects.data?.map((project) => <div key={project.id}><div><strong>{project.name}</strong><small>{project.journeyCount} Journeys</small></div><button className="secondary-button" onClick={() => { const name = window.prompt("New Project name", project.name); if (name?.trim()) renameProject.mutate({ id: project.id, name }); }}>Rename</button>{(projects.data?.length ?? 0) > 1 && <button className="secondary-button" onClick={() => { const targetName = window.prompt("Merge into which Project?", projects.data?.find(({ id }) => id !== project.id)?.name); const target = projects.data?.find(({ name }) => name === targetName); if (target) mergeProject.mutate({ sourceId: project.id, targetId: target.id }); }}>Merge</button>}<button className="danger-button" onClick={() => { if (window.confirm(`Delete Project “${project.name}”? Journeys will become unassigned.`)) deleteProject.mutate(project.id); }}>Delete</button></div>)}</div>
      </section>

      <section className="settings-section"><div className="settings-section-head"><div><h2>Retention Policy</h2><p>All revisions are retained unless you explicitly configure and apply this destructive policy.</p></div></div>
        <div className="retention-row"><label>Keep newest revisions per Journey<input type="number" min={1} value={keepLast} onChange={(event) => setKeepLast(event.target.value)} placeholder={String(retention.data?.keepLastRevisions ?? "retain all")} /></label><button className="secondary-button" onClick={() => saveRetention.mutate()}>Save policy</button><button className="danger-button" disabled={!retention.data?.keepLastRevisions} onClick={() => { if (window.confirm("Permanently delete revisions outside the Retention Policy?")) applyRetention.mutate(); }}>Apply now</button></div>
        {applyRetention.data && <small>{applyRetention.data.deletedRevisions} revisions deleted.</small>}
      </section>

      <section className="settings-section"><h2>Pending Evidence <span>{pending.data?.length ?? 0}</span></h2>
        {pending.data?.length ? <div className="settings-list">{pending.data.map((item) => <div key={item.id}><div><strong>{sourceLabel(item.sourceAgent)} · {shortId(item.nativeSessionId)}</strong><p>{item.error}</p><small>{item.fileCount} files · {new Date(item.createdAt).toLocaleString()}</small></div><button className="secondary-button" onClick={() => retry.mutate(item.id)}>Retry</button><button className="danger-button" onClick={() => removePending.mutate(item.id)}>Delete</button></div>)}</div> : <p className="muted-copy">No failed interpretations are waiting.</p>}
      </section>

      <section className="settings-section"><h2>Capture Exclusions <span>{exclusions.data?.length ?? 0}</span></h2>
        {exclusions.data?.length ? <div className="settings-list">{exclusions.data.map((item) => <div key={`${item.sourceAgent}:${item.nativeSessionId}`}><div><strong>{sourceLabel(item.sourceAgent)} · {shortId(item.nativeSessionId)}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div><button className="secondary-button" onClick={() => removeExclusion.mutate(item)}>Allow rediscovery</button></div>)}</div> : <p className="muted-copy">No native sessions are excluded.</p>}
      </section>
    </main>
  );
}
