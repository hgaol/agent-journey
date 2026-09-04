import { useRef, useState } from "react";
import { zipSync } from "fflate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import type { DiscoveredJourneyDocument } from "@agentjourney/contracts";
import { api } from "../api.js";
import { useConfirmation } from "../hooks/useConfirmation.js";

interface SourceRootEdit {
  sourceAgent: string;
  displayName: string;
  root: string;
  scanPolicy: "manual" | "automatic";
}

function SourceRootDialog(props: {
  edit: SourceRootEdit;
  pending: boolean;
  onClose: () => void;
  onSave: (root: string) => void;
}): React.ReactNode {
  const [root, setRoot] = useState(props.edit.root);
  const requestClose = (isOpen: boolean): void => {
    if (!isOpen && !props.pending) props.onClose();
  };
  return (
    <Dialog className="agentjourney-astryx-dialog" isOpen onOpenChange={requestClose} purpose="form" width={560} padding={0}>
      <form className="agentjourney-astryx-form" onSubmit={(event) => { event.preventDefault(); if (root.trim()) props.onSave(root.trim()); }}>
        <Layout
          height="auto"
          header={<DialogHeader title="Choose Source Root" subtitle={props.edit.displayName} {...(!props.pending ? { onOpenChange: requestClose } : {})} />}
          content={(
            <LayoutContent padding={4}>
              <TextInput
                label="Absolute Source Root path"
                value={root}
                onChange={setRoot}
                description="AgentJourney receives read-only discovery access to this path."
                hasAutoFocus
                width="100%"
              />
            </LayoutContent>
          )}
          footer={(
            <LayoutFooter hasDivider>
              <div className="agentjourney-astryx-actions">
                <Button label="Cancel" variant="secondary" onClick={() => requestClose(false)} isDisabled={props.pending} />
                <Button label="Approve Source Root" variant="primary" type="submit" isLoading={props.pending} isDisabled={props.pending || !root.trim()} />
              </div>
            </LayoutFooter>
          )}
        />
      </form>
    </Dialog>
  );
}

export function SourcesPage(): React.ReactNode {
  const client = useQueryClient();
  const confirmation = useConfirmation();
  const showToast = useToast();
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.listSources });
  const [discoveries, setDiscoveries] = useState<Record<string, DiscoveredJourneyDocument[]>>({});
  const [selectedBySource, setSelectedBySource] = useState<Record<string, string[]>>({});
  const [busySource, setBusySource] = useState<string>();
  const [error, setError] = useState<string>();
  const [importAgent, setImportAgent] = useState("claude-code");
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [rootEdit, setRootEdit] = useState<SourceRootEdit>();
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const approve = useMutation({
    mutationFn: ({ sourceAgent, root, scanPolicy = "manual" }: { sourceAgent: string; root: string; scanPolicy?: "manual" | "automatic" }) => api.approveSource(sourceAgent, root, scanPolicy),
    onSuccess: async () => {
      setRootEdit(undefined);
      await client.invalidateQueries({ queryKey: ["sources"] });
      showToast({ body: "Source Root approved", uniqueID: "source-approved" });
    }
  });
  const revoke = useMutation({
    mutationFn: api.revokeSource,
    onSuccess: async (_result, sourceAgent) => {
      setDiscoveries((current) => { const next = { ...current }; delete next[sourceAgent]; return next; });
      await client.invalidateQueries({ queryKey: ["sources"] });
      showToast({ body: "Source Root access revoked", uniqueID: "source-revoked" });
    }
  });
  const rawImport = useMutation({
    mutationFn: ({ sourceAgent, bytes }: { sourceAgent: string; bytes: ArrayBuffer }) => api.importSourceBundle(sourceAgent, bytes),
    onSuccess: async (outcome) => {
      await Promise.all([client.invalidateQueries({ queryKey: ["journeys"] }), client.invalidateQueries({ queryKey: ["pending-evidence"] })]);
      if (outcome.pending.length > 0) setError(`${outcome.pending.length} imported bundle(s) became Pending Evidence.`);
      else showToast({ body: "Native history imported", uniqueID: "raw-imported" });
    },
    onSettled: () => setRawFiles([])
  });
  const capture = useMutation({
    mutationFn: ({ sourceAgent, ids }: { sourceAgent: string; ids: string[] }) => api.capture(sourceAgent, ids),
    onSuccess: async (outcome) => {
      await Promise.all([client.invalidateQueries({ queryKey: ["journeys"] }), client.invalidateQueries({ queryKey: ["pending-evidence"] })]);
      if (outcome.pending.length > 0) setError(`${outcome.pending.length} Source Bundle(s) were preserved as Pending Evidence.`);
      else showToast({ body: "Selected Journeys captured", uniqueID: "journeys-captured" });
    }
  });

  const importFiles = async (selected: FileList | File[] | null): Promise<void> => {
    const files = selected ? Array.from(selected) : [];
    if (!files.length) return;
    setRawFiles(files);
    const entries: Record<string, Uint8Array> = {};
    for (const file of files) {
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
      <div className="source-custody-banner"><Banner status="info" title="Local custody" description="Raw files are copied byte-for-byte into an unencrypted local archive only after you capture them." collapsible={false} /></div>
      {error && <Banner status="error" title="Source operation needs attention" description={error} collapsible={false} />}
      <section className="raw-import-panel">
        <div className="raw-import-copy"><strong>Import native raw files</strong><span>Select one or more source files, or an agent session directory. Exact bytes are preserved before interpretation.</span></div>
        <Selector
          label="Source agent"
          isLabelHidden
          value={importAgent}
          onChange={setImportAgent}
          options={[
            { value: "claude-code", label: "Claude Code" },
            { value: "codex-cli", label: "Codex CLI" },
            { value: "pi", label: "Pi" },
            { value: "github-copilot-cli", label: "GitHub Copilot CLI" }
          ]}
        />
        <FileInput
          label="Native source files"
          isLabelHidden
          value={rawFiles}
          onChange={(value) => void importFiles(Array.isArray(value) ? value : value ? [value] : [])}
          isMultiple
          placeholder="Choose files"
          isLoading={rawImport.isPending}
        />
        <Button label="Choose directory" variant="secondary" onClick={() => directoryInputRef.current?.click()} isDisabled={rawImport.isPending} />
        <input
          ref={directoryInputRef}
          className="visually-hidden-file-input"
          type="file"
          multiple
          {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={(event) => void importFiles(event.currentTarget.files)}
        />
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
          const editRoot = (): void => setRootEdit({
            sourceAgent: source.sourceAgent,
            displayName: source.displayName,
            root: source.approvedRoot ?? source.suggestedRoot,
            scanPolicy: source.scanPolicy
          });
          return (
            <article className="source-card" key={source.sourceAgent}>
              <div className="source-card-main">
                <span className={`source-logo source-${source.sourceAgent}`}>{source.displayName.slice(0, 2)}</span>
                <div className="source-copy">
                  <div className="source-heading"><h2>{source.displayName}</h2><span className={source.available ? "available" : "missing"}>{source.available ? "detected" : "not found"}</span></div>
                  <code>{source.approvedRoot ?? source.suggestedRoot}</code>
                  <small>{source.adapterId} · {source.adapterVersion} · {source.scanPolicy} scan</small>
                </div>
                <div className="source-actions agentjourney-astryx-inline-actions">
                  {!source.approved ? (
                    <>
                      <Button label="Approve suggested" variant="secondary" size="sm" isDisabled={!source.available || approve.isPending} onClick={() => approve.mutate({ sourceAgent: source.sourceAgent, root: source.suggestedRoot })} />
                      <Button label="Choose root" variant="ghost" size="sm" onClick={editRoot} />
                    </>
                  ) : (
                    <>
                      <Button label="Preview scan" variant="secondary" size="sm" isLoading={busySource === source.sourceAgent} onClick={() => void discover(source.sourceAgent)} />
                      <Button label={source.scanPolicy === "manual" ? "Enable auto" : "Use manual"} variant="ghost" size="sm" onClick={() => approve.mutate({ sourceAgent: source.sourceAgent, root: source.approvedRoot!, scanPolicy: source.scanPolicy === "manual" ? "automatic" : "manual" })} />
                      <Button label="Change root" variant="ghost" size="sm" onClick={editRoot} />
                      <Button label="Revoke" variant="destructive" size="sm" onClick={() => void confirmation.confirm({ title: `Revoke access for ${source.displayName}?`, description: "Filesystem access will be removed. Already archived Journeys remain available.", actionLabel: "Revoke access" }).then((confirmed) => { if (confirmed) revoke.mutate(source.sourceAgent); })} />
                    </>
                  )}
                </div>
              </div>
              {found && (
                <div className="discovery-panel">
                  <div><strong>{found.length}</strong> candidate {found.length === 1 ? "Journey" : "Journeys"}<span>{found.reduce((count, item) => count + item.relativePaths.length, 0)} source files · {formatBytes(found.reduce((total, item) => total + (item.byteSize ?? 0), 0))} · {dateRange(found)}</span></div>
                  <div className="capture-scope-actions"><Button label="Select all" variant="ghost" size="sm" onClick={() => setSelectedBySource((current) => ({ ...current, [source.sourceAgent]: found.map(({ nativeSessionId }) => nativeSessionId) }))} /><Button label="Clear" variant="ghost" size="sm" onClick={() => setSelectedBySource((current) => ({ ...current, [source.sourceAgent]: [] }))} /></div>
                  <ul>{found.map((item) => {
                    const sessionDate = item.startedAt ?? item.lastModifiedAt;
                    return (
                      <li className="discovery-candidate" key={item.nativeSessionId}>
                        <CheckboxInput
                          label={item.title ?? "Untitled"}
                          {...(item.workspace ? { description: item.workspace } : {})}
                          value={selected.includes(item.nativeSessionId)}
                          onChange={() => toggleSelection(item.nativeSessionId)}
                          size="sm"
                          width="100%"
                        />
                        <span className="discovery-candidate-facts">
                          {sessionDate ? <time dateTime={sessionDate} title={item.startedAt ? "Session started" : "Source last modified"}>{formatSessionDate(sessionDate)}</time> : <span>date unknown</span>}
                          <span className="discovery-candidate-size">{formatBytes(item.byteSize ?? 0)}</span>
                          {item.turnCountEstimate !== undefined && <span className="discovery-candidate-turns" title="Estimated from source-native human prompts">~{item.turnCountEstimate} {item.turnCountEstimate === 1 ? "turn" : "turns"}</span>}
                          <code title={item.nativeSessionId}>{item.nativeSessionId.slice(0, 12)}</code>
                        </span>
                      </li>
                    );
                  })}</ul>
                  <Button label={`Capture selected (${selected.length})`} variant="primary" isDisabled={capture.isPending || selected.length === 0} isLoading={capture.isPending} onClick={() => capture.mutate({ sourceAgent: source.sourceAgent, ids: selected })} />
                </div>
              )}
            </article>
          );
        })}
      </section>
      {confirmation.element}
      {rootEdit && (
        <SourceRootDialog
          key={`${rootEdit.sourceAgent}:${rootEdit.root}`}
          edit={rootEdit}
          pending={approve.isPending}
          onClose={() => setRootEdit(undefined)}
          onSave={(root) => approve.mutate({ sourceAgent: rootEdit.sourceAgent, root, scanPolicy: rootEdit.scanPolicy })}
        />
      )}
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSessionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "date unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function dateRange(items: DiscoveredJourneyDocument[]): string {
  const dates = items
    .flatMap(({ startedAt, lastModifiedAt }) => {
      const value = startedAt ?? lastModifiedAt;
      return value ? [new Date(value)] : [];
    })
    .filter((date) => !Number.isNaN(date.valueOf()))
    .sort((left, right) => left.valueOf() - right.valueOf());
  if (!dates.length) return "dates unknown";
  const first = dates[0]!.toLocaleDateString();
  const last = dates.at(-1)!.toLocaleDateString();
  return first === last ? first : `${first} – ${last}`;
}
