import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import type { ProjectDocument } from "@agentjourney/contracts";
import { api } from "../api.js";
import { useConfirmation } from "../hooks/useConfirmation.js";
import { sourceLabel, shortId } from "../source-brand.js";

type ProjectEdit =
  | { kind: "rename"; project: ProjectDocument }
  | { kind: "merge"; project: ProjectDocument };

function ProjectEditorDialog(props: {
  edit: ProjectEdit;
  projects: ProjectDocument[];
  pending: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onMerge: (targetId: string) => void;
}): React.ReactNode {
  const targets = props.projects.filter(({ id }) => id !== props.edit.project.id);
  const [name, setName] = useState(props.edit.project.name);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const requestClose = (isOpen: boolean): void => {
    if (!isOpen && !props.pending) props.onClose();
  };
  const submit = (): void => {
    if (props.edit.kind === "rename") {
      if (name.trim()) props.onRename(name.trim());
      return;
    }
    if (targetId) props.onMerge(targetId);
  };
  return (
    <Dialog
      className="agentjourney-astryx-dialog"
      isOpen
      onOpenChange={requestClose}
      purpose="form"
      width={480}
      padding={0}
    >
      <form className="agentjourney-astryx-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <Layout
          height="auto"
          header={(
            <DialogHeader
              title={props.edit.kind === "rename" ? "Rename Project" : "Merge Project"}
              subtitle={props.edit.project.name}
              {...(!props.pending ? { onOpenChange: requestClose } : {})}
            />
          )}
          content={(
            <LayoutContent className="agentjourney-astryx-fields" padding={4}>
              {props.edit.kind === "rename" ? (
                <TextInput label="Project name" value={name} onChange={setName} hasAutoFocus width="100%" />
              ) : (
                <Selector
                  label="Merge into"
                  value={targetId}
                  onChange={setTargetId}
                  options={targets.map((project) => ({ value: project.id, label: project.name }))}
                  width="100%"
                />
              )}
            </LayoutContent>
          )}
          footer={(
            <LayoutFooter hasDivider>
              <div className="agentjourney-astryx-actions">
                <Button label="Cancel" variant="secondary" onClick={() => requestClose(false)} isDisabled={props.pending} />
                <Button
                  label={props.edit.kind === "rename" ? "Rename Project" : "Merge Project"}
                  variant="primary"
                  type="submit"
                  isLoading={props.pending}
                  isDisabled={props.pending || (props.edit.kind === "rename" ? !name.trim() : !targetId)}
                />
              </div>
            </LayoutFooter>
          )}
        />
      </form>
    </Dialog>
  );
}

export function SettingsPage(): React.ReactNode {
  const client = useQueryClient();
  const confirmation = useConfirmation();
  const showToast = useToast();
  const pending = useQuery({ queryKey: ["pending-evidence"], queryFn: api.listPendingEvidence });
  const exclusions = useQuery({ queryKey: ["capture-exclusions"], queryFn: api.listCaptureExclusions });
  const retention = useQuery({ queryKey: ["retention"], queryFn: api.getRetention });
  const plugins = useQuery({ queryKey: ["plugins"], queryFn: api.listPlugins });
  const pluginDiagnostics = useQuery({ queryKey: ["plugin-diagnostics"], queryFn: api.listPluginDiagnostics });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const [keepLast, setKeepLast] = useState<number | null>(null);
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof api.verifyArchive>>>();
  const [journeyPackageFile, setJourneyPackageFile] = useState<File | null>(null);
  const [pluginFile, setPluginFile] = useState<File | null>(null);
  const [projectEdit, setProjectEdit] = useState<ProjectEdit>();

  useEffect(() => {
    if (retention.data) setKeepLast(retention.data.keepLastRevisions ?? null);
  }, [retention.data]);

  const retry = useMutation({
    mutationFn: api.retryPendingEvidence,
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["pending-evidence"] }), client.invalidateQueries({ queryKey: ["journeys"] })]);
      showToast({ body: "Pending Evidence interpreted", uniqueID: "pending-retried" });
    }
  });
  const removePending = useMutation({
    mutationFn: api.deletePendingEvidence,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["pending-evidence"] });
      showToast({ body: "Pending Evidence deleted", uniqueID: "pending-deleted" });
    }
  });
  const removeExclusion = useMutation({
    mutationFn: ({ sourceAgent, nativeSessionId }: { sourceAgent: string; nativeSessionId: string }) => api.removeCaptureExclusion(sourceAgent, nativeSessionId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["capture-exclusions"] });
      showToast({ body: "Rediscovery allowed", uniqueID: "exclusion-removed" });
    }
  });
  const saveRetention = useMutation({
    mutationFn: () => api.setRetention(keepLast ?? undefined),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["retention"] });
      showToast({ body: "Retention Policy saved", uniqueID: "retention-saved" });
    }
  });
  const applyRetention = useMutation({
    mutationFn: api.applyRetention,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["journeys"] });
      showToast({ body: "Retention Policy applied", uniqueID: "retention-applied" });
    }
  });
  const verify = useMutation({ mutationFn: api.verifyArchive, onSuccess: setVerification });
  const repair = useMutation({ mutationFn: api.repairArchive, onSuccess: setVerification });
  const rotateAuth = useMutation({
    mutationFn: api.rotateLocalAuth,
    onSuccess: () => showToast({ body: "Local authorization secret rotated", uniqueID: "auth-rotated" })
  });
  const automaticScan = useMutation({
    mutationFn: api.runAutomaticScan,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["journeys"] });
      showToast({ body: "Automatic Capture Cycle complete", uniqueID: "automatic-scan" });
    }
  });
  const renameProject = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameProject(id, name),
    onSuccess: async () => {
      setProjectEdit(undefined);
      await client.invalidateQueries({ queryKey: ["projects"] });
      showToast({ body: "Project renamed", uniqueID: "project-renamed" });
    }
  });
  const mergeProject = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) => api.mergeProjects(sourceId, targetId),
    onSuccess: async () => {
      setProjectEdit(undefined);
      await Promise.all([client.invalidateQueries({ queryKey: ["projects"] }), client.invalidateQueries({ queryKey: ["journeys"] })]);
      showToast({ body: "Projects merged", uniqueID: "project-merged" });
    }
  });
  const deleteProject = useMutation({
    mutationFn: api.deleteProject,
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["projects"] }), client.invalidateQueries({ queryKey: ["journeys"] })]);
      showToast({ body: "Project deleted", uniqueID: "project-deleted" });
    }
  });
  const importPackage = useMutation({
    mutationFn: api.importJourneyPackage,
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["journeys"] }), client.invalidateQueries({ queryKey: ["projects"] })]);
      showToast({ body: "Journey Package imported", uniqueID: "package-imported" });
    },
    onSettled: () => setJourneyPackageFile(null)
  });
  const installPlugin = useMutation({
    mutationFn: api.installPlugin,
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["plugins"] }), client.invalidateQueries({ queryKey: ["renderer-plugins"] })]);
      showToast({ body: "Plugin installed", uniqueID: "plugin-installed" });
    },
    onSettled: () => setPluginFile(null)
  });

  const selectPluginFile = async (value: File | File[] | null): Promise<void> => {
    const file = Array.isArray(value) ? value[0] : value;
    setPluginFile(file ?? null);
    if (!file) return;
    try {
      const document = JSON.parse(await file.text()) as { manifest?: { type?: string; id?: string; displayName?: string } };
      const manifest = document.manifest;
      if (!manifest?.id || !manifest.type) throw new Error("missing manifest");
      const description = manifest.type === "source-adapter"
        ? `Source Adapter “${manifest.displayName ?? manifest.id}” will run in the restricted adapter sandbox and still requires a separately approved Source Root.`
        : `Renderer “${manifest.displayName ?? manifest.id}” will receive only the selected redacted Stage Document inside an opaque-origin iframe.`;
      const confirmed = await confirmation.confirm({
        title: `Install ${manifest.type === "source-adapter" ? "Source Adapter" : "Renderer"}?`,
        description,
        actionLabel: "Install plugin",
        actionVariant: "primary"
      });
      if (confirmed) installPlugin.mutate(document);
      else setPluginFile(null);
    } catch {
      setPluginFile(null);
      showToast({ body: "The selected file is not a valid JSON plugin package.", type: "error", uniqueID: "invalid-plugin" });
    }
  };
  const selectJourneyPackage = async (value: File | File[] | null): Promise<void> => {
    const file = Array.isArray(value) ? value[0] : value;
    setJourneyPackageFile(file ?? null);
    if (!file) return;
    const confirmed = await confirmation.confirm({
      title: "Import this unencrypted Journey Package?",
      description: "Its exact Source Evidence may contain credentials or private code.",
      actionLabel: "Import package",
      actionVariant: "primary"
    });
    if (confirmed) importPackage.mutate(await file.arrayBuffer());
    else setJourneyPackageFile(null);
  };

  return (
    <main className="page settings-page">
      <p className="eyebrow">Local platform</p><h1>Archive operations</h1><p className="lede narrow">Manage failed evidence, exclusions, explicit retention, and archive integrity. No content leaves this machine.</p>

      <section className="settings-section">
        <div className="settings-section-head"><div><h2>Local authorization</h2><p>Rotate the per-installation loopback secret and invalidate other browser sessions.</p></div><Button label="Rotate secret" variant="secondary" isLoading={rotateAuth.isPending} onClick={() => void confirmation.confirm({ title: "Rotate the local authorization secret?", description: "Other AgentJourney browser sessions will be signed out.", actionLabel: "Rotate secret" }).then((confirmed) => { if (confirmed) rotateAuth.mutate(); })} /></div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head"><div><h2>Archive verification</h2><p>Hash every content object and validate every stored Interpretation.</p></div><div className="agentjourney-astryx-inline-actions"><Button label="Verify" variant="secondary" isLoading={verify.isPending} onClick={() => verify.mutate()} /><Button label="Repair indexes/orphans" variant="secondary" isLoading={repair.isPending} onClick={() => repair.mutate()} /></div></div>
        {verification && <Banner className="agentjourney-astryx-banner" status={verification.issues.length ? "error" : "success"} title={verification.issues.length ? `${verification.issues.length} archive issue(s)` : "Archive verified"} description={`${verification.checkedObjects} objects · ${verification.checkedInterpretations} interpretations`} collapsible={false}>{verification.issues.map((issue) => <p key={`${issue.kind}:${issue.message}`}>{issue.kind}: {issue.message}</p>)}</Banner>}
      </section>

      <section className="settings-section">
        <div className="settings-section-head"><div><h2>Journey Package import</h2><p>Import a checksummed, data-only .agentjourney package. Imported Interpretations retain external provenance.</p></div><div className="settings-section-control"><FileInput label="Journey Package" isLabelHidden value={journeyPackageFile} onChange={(value) => void selectJourneyPackage(value)} accept=".agentjourney,application/vnd.agentjourney+zip" placeholder="Choose package" isLoading={importPackage.isPending} /></div></div>
        {importPackage.error && <Banner className="agentjourney-astryx-banner" status="error" title="Package import failed" description={importPackage.error.message} collapsible={false} />}
        {importPackage.data && <Banner className="agentjourney-astryx-banner" status="success" title="Package imported" description={`${importPackage.data.journeyIds.length} Journeys · ${importPackage.data.revisions} revisions · ${importPackage.data.interpretations} interpretations`} collapsible={false} />}
      </section>

      <section className="settings-section">
        <div className="settings-section-head"><div><h2>Local Plugins</h2><p>Install an inert, integrity-checked .agentjourney-plugin package. Source Adapter plugins become active after restarting the host.</p></div><div className="settings-section-control"><FileInput label="Plugin package" isLabelHidden value={pluginFile} onChange={(value) => void selectPluginFile(value)} accept=".agentjourney-plugin,application/json" placeholder="Install package" isLoading={installPlugin.isPending} /></div></div>
        {installPlugin.error && <Banner className="agentjourney-astryx-banner" status="error" title="Plugin installation failed" description={installPlugin.error.message} collapsible={false} />}
        <div className="settings-list">{plugins.data?.map((plugin) => <div key={`${plugin.manifest.id}:${plugin.manifest.version}`}><div><strong>{plugin.manifest.displayName}</strong><small>{plugin.manifest.type} · {plugin.manifest.id}@{plugin.manifest.version}{plugin.development ? " · development directory" : ""}</small></div><code>{plugin.integrity.slice(0, 22)}…</code></div>)}</div>
        {!plugins.data?.length && <p className="muted-copy">No third-party plugins installed.</p>}
        {pluginDiagnostics.data?.map((diagnostic) => <Banner className="agentjourney-astryx-banner" status="error" title="Plugin disabled" description={`${diagnostic.filePath}: ${diagnostic.message}`} collapsible={false} key={diagnostic.filePath} />)}
      </section>

      <section className="settings-section"><div className="settings-section-head"><div><h2>Automatic Scan Policies</h2><p>Run one batched Capture Cycle for roots explicitly configured as automatic.</p></div><Button label="Run automatic cycle" variant="secondary" isLoading={automaticScan.isPending} onClick={() => automaticScan.mutate()} /></div></section>

      <section className="settings-section"><h2>Projects <span>{projects.data?.length ?? 0}</span></h2><p className="muted-copy">Rename Projects here, reassign a Journey to split it, or delete a Project to leave its Journeys unassigned.</p>
        <div className="settings-list">{projects.data?.map((project) => <div key={project.id}><div><strong>{project.name}</strong><small>{project.journeyCount} Journeys</small></div><Button label="Rename" variant="secondary" size="sm" onClick={() => setProjectEdit({ kind: "rename", project })} />{(projects.data?.length ?? 0) > 1 && <Button label="Merge" variant="secondary" size="sm" onClick={() => setProjectEdit({ kind: "merge", project })} />}<Button label="Delete" variant="destructive" size="sm" onClick={() => void confirmation.confirm({ title: `Delete Project “${project.name}”?`, description: "Journeys in this Project will become unassigned.", actionLabel: "Delete Project" }).then((confirmed) => { if (confirmed) deleteProject.mutate(project.id); })} /></div>)}</div>
      </section>

      <section className="settings-section"><div className="settings-section-head"><div><h2>Retention Policy</h2><p>All revisions are retained unless you explicitly configure and apply this destructive policy.</p></div></div>
        <div className="retention-row"><NumberInput label="Keep newest revisions per Journey" value={keepLast} onChange={setKeepLast} min={1} step={1} isIntegerOnly hasClear isWheelEnabled={false} placeholder="Retain all" width={280} /><Button label="Save policy" variant="secondary" onClick={() => saveRetention.mutate()} isLoading={saveRetention.isPending} /><Button label="Apply now" variant="destructive" isDisabled={!retention.data?.keepLastRevisions} isLoading={applyRetention.isPending} onClick={() => void confirmation.confirm({ title: "Apply the Retention Policy?", description: "Revisions outside the policy will be permanently deleted from the local archive.", actionLabel: "Delete old revisions" }).then((confirmed) => { if (confirmed) applyRetention.mutate(); })} /></div>
        {applyRetention.data && <Banner className="agentjourney-astryx-banner" status="success" title="Retention applied" description={`${applyRetention.data.deletedRevisions} revisions deleted.`} collapsible={false} />}
      </section>

      <section className="settings-section"><h2>Pending Evidence <span>{pending.data?.length ?? 0}</span></h2>
        {pending.data?.length ? <div className="settings-list">{pending.data.map((item) => <div key={item.id}><div><strong>{sourceLabel(item.sourceAgent)} · {shortId(item.nativeSessionId)}</strong><p>{item.error}</p><small>{item.fileCount} files · {new Date(item.createdAt).toLocaleString()}</small></div><Button label="Retry" variant="secondary" size="sm" onClick={() => retry.mutate(item.id)} isLoading={retry.isPending} /><Button label="Delete" variant="destructive" size="sm" onClick={() => void confirmation.confirm({ title: "Delete Pending Evidence?", description: "The preserved Source Bundle will be permanently removed before it can be interpreted.", actionLabel: "Delete evidence" }).then((confirmed) => { if (confirmed) removePending.mutate(item.id); })} /></div>)}</div> : <p className="muted-copy">No failed interpretations are waiting.</p>}
      </section>

      <section className="settings-section"><h2>Capture Exclusions <span>{exclusions.data?.length ?? 0}</span></h2>
        {exclusions.data?.length ? <div className="settings-list">{exclusions.data.map((item) => <div key={`${item.sourceAgent}:${item.nativeSessionId}`}><div><strong>{sourceLabel(item.sourceAgent)} · {shortId(item.nativeSessionId)}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div><Button label="Allow rediscovery" variant="secondary" size="sm" onClick={() => removeExclusion.mutate(item)} /></div>)}</div> : <p className="muted-copy">No native sessions are excluded.</p>}
      </section>

      {confirmation.element}
      {projectEdit && (
        <ProjectEditorDialog
          key={`${projectEdit.kind}:${projectEdit.project.id}`}
          edit={projectEdit}
          projects={projects.data ?? []}
          pending={renameProject.isPending || mergeProject.isPending}
          onClose={() => setProjectEdit(undefined)}
          onRename={(name) => renameProject.mutate({ id: projectEdit.project.id, name })}
          onMerge={(targetId) => mergeProject.mutate({ sourceId: projectEdit.project.id, targetId })}
        />
      )}
    </main>
  );
}
