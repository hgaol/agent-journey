import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { JourneyDetailDocument } from "@agentjourney/contracts";
import { api } from "../api.js";

export function EvidenceInspector(props: {
  journey: JourneyDetailDocument;
  initialActivityId?: string;
  initialEvidenceAnchor?: string;
  onClose: () => void;
}): React.ReactNode {
  const activity = props.journey.stage.activities.find(({ id }) => id === props.initialActivityId);
  const evidenceAnchor = props.initialEvidenceAnchor ?? activity?.evidenceAnchor;
  const initialPath = evidenceAnchor?.split("#")[0];
  const [selectedPath, setSelectedPath] = useState(initialPath ?? props.journey.sourceFiles[0]?.relativePath ?? "");
  const [revealed, setRevealed] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  useEffect(() => {
    if (initialPath) setSelectedPath(initialPath);
  }, [initialPath]);

  const evidence = useQuery({
    queryKey: ["evidence", props.journey.revisionId, selectedPath, revealed],
    queryFn: () => api.readEvidence(props.journey.summary.id, props.journey.revisionId, selectedPath, revealed),
    enabled: Boolean(selectedPath)
  });
  const search = useQuery({
    queryKey: ["evidence-search", props.journey.revisionId, submittedSearch, revealed],
    queryFn: () => api.searchEvidence(props.journey.summary.id, props.journey.revisionId, submittedSearch, revealed),
    enabled: submittedSearch.length > 0
  });
  const lines = useMemo(() => evidence.data?.split(/\r?\n/u) ?? [], [evidence.data]);
  const anchorLine = evidenceAnchor?.match(/#L(\d+)/u)?.[1];
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 16,
    overscan: 25
  });
  useEffect(() => {
    if (anchorLine && lines.length > 0) virtualizer.scrollToIndex(Math.max(0, Number(anchorLine) - 1), { align: "center" });
  }, [anchorLine, lines.length, virtualizer]);

  const toggleReveal = (): void => {
    if (revealed) {
      setRevealed(false);
      setConfirmReveal(false);
      return;
    }
    setConfirmReveal(true);
  };
  const submitSearch = (): void => setSubmittedSearch(searchText.trim());
  const close = (isOpen: boolean): void => {
    if (!isOpen) props.onClose();
  };

  return (
    <Dialog
      className="agentjourney-astryx-dialog agentjourney-evidence-dialog"
      isOpen
      onOpenChange={close}
      purpose="info"
      width="min(1180px, calc(100dvw - 32px))"
      maxHeight="92dvh"
      padding={0}
      aria-label="Source Evidence inspector"
    >
      <Layout
        height="auto"
        header={(
          <DialogHeader
            title="Evidence inspector"
            subtitle="Exact Source Bundle"
            endContent={(
              <div className="evidence-header-actions">
                <span className={revealed ? "unredacted-label" : "redacted-label"}>{revealed ? "Unredacted" : "Secrets masked"}</span>
                <Button label={revealed ? "Mask" : "Reveal"} variant="secondary" size="sm" onClick={toggleReveal} />
              </div>
            )}
            onOpenChange={close}
          />
        )}
        content={(
          <LayoutContent className="agentjourney-evidence-layout" padding={0} isScrollable={false}>
            {confirmReveal && !revealed && (
              <div className="agentjourney-evidence-warning">
                <Banner
                  status="warning"
                  title="Reveal unredacted Source Evidence?"
                  description="The exact Source Bundle may contain credentials or private code."
                  collapsible={false}
                  endContent={(
                    <div className="agentjourney-astryx-inline-actions">
                      <Button label="Cancel" variant="ghost" size="sm" onClick={() => setConfirmReveal(false)} />
                      <Button
                        label="Reveal evidence"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setRevealed(true);
                          setConfirmReveal(false);
                        }}
                      />
                    </div>
                  )}
                />
              </div>
            )}
            <div className="evidence-search">
              <TextInput
                label="Search this Source Bundle"
                isLabelHidden
                value={searchText}
                onChange={setSearchText}
                onEnter={submitSearch}
                hasClear
                placeholder="Search this Source Bundle…"
                width="100%"
              />
              <Button label="Search" variant="secondary" onClick={submitSearch} />
            </div>
            {submittedSearch && (
              <div className="evidence-results">
                <strong>{search.data?.length ?? 0} exact matches</strong>
                {search.data?.slice(0, 30).map((hit, index) => (
                  <button key={`${hit.relativePath}:${hit.line}:${hit.column}:${index}`} onClick={() => setSelectedPath(hit.relativePath)}>
                    <code>{hit.relativePath}:{hit.line}:{hit.column}</code><span>{hit.text}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="evidence-body">
              <aside>
                {props.journey.sourceFiles.map((file) => (
                  <button key={file.relativePath} className={selectedPath === file.relativePath ? "selected" : ""} onClick={() => setSelectedPath(file.relativePath)}>
                    <span>{file.relativePath}</span><small>{formatBytes(file.size)}</small>
                  </button>
                ))}
              </aside>
              <div className="evidence-content">
                <div className="evidence-path"><code>{selectedPath}</code>{anchorLine && selectedPath === initialPath && <span>Activity anchor: line {anchorLine}</span>}</div>
                {evidence.isLoading ? (
                  <div className="loading">Reading evidence…</div>
                ) : evidence.error ? (
                  <Banner status="error" title="Evidence could not be read" description={evidence.error.message} collapsible={false} />
                ) : (
                  <div className="evidence-virtual" ref={scrollRef}>
                    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                      {virtualizer.getVirtualItems().map((item) => (
                        <div
                          key={item.key}
                          ref={virtualizer.measureElement}
                          data-index={item.index}
                          className={`evidence-line ${String(item.index + 1) === anchorLine ? "anchor-line" : ""}`}
                          style={{ position: "absolute", transform: `translateY(${item.start}px)`, width: "100%" }}
                        ><span>{item.index + 1}</span><code>{lines[item.index]}</code></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </LayoutContent>
        )}
      />
    </Dialog>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
