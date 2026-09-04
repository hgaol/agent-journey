import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { saveDownload } from "../api.js";
import "./HtmlExportDialog.css";

export interface HtmlRendererChoice {
  id: string;
  name: string;
  stylePack: boolean;
}

interface GeneratedPresentation {
  blob: Blob;
  fileName: string;
}

export function HtmlExportDialog(props: {
  rendererId: string;
  renderers: HtmlRendererChoice[];
  reveal: boolean;
  onClose: () => void;
  onGenerate: (rendererId: string, reveal: boolean) => Promise<GeneratedPresentation>;
}): React.ReactNode {
  const [rendererId, setRendererId] = useState(props.rendererId);
  const [reveal, setReveal] = useState(props.reveal);
  const [generated, setGenerated] = useState<GeneratedPresentation>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const clearGenerated = (): void => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    setGenerated(undefined);
    setError(undefined);
  };
  const generate = async (): Promise<GeneratedPresentation | undefined> => {
    setGenerating(true);
    setError(undefined);
    try {
      const result = await props.onGenerate(rendererId, reveal);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setGenerated(result);
      setPreviewUrl(URL.createObjectURL(result.blob));
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "HTML export failed");
      return undefined;
    } finally {
      setGenerating(false);
    }
  };
  const download = async (): Promise<void> => {
    const result = generated ?? await generate();
    if (result) saveDownload(result);
  };
  const requestClose = (isOpen: boolean): void => {
    if (!isOpen && !generating) props.onClose();
  };

  return (
    <Dialog
      className="agentjourney-astryx-dialog agentjourney-html-export-dialog"
      isOpen
      onOpenChange={requestClose}
      purpose="form"
      width="min(1180px, calc(100dvw - 32px))"
      maxHeight="94dvh"
      padding={0}
    >
      <Layout
        height="auto"
        header={(
          <DialogHeader
            title="Export interactive HTML"
            subtitle="Self-contained source-native presentation"
            {...(!generating ? { onOpenChange: requestClose } : {})}
          />
        )}
        content={(
          <LayoutContent className="agentjourney-html-export-content" padding={0} isScrollable={false}>
            <aside className="agentjourney-html-export-options">
              <Selector
                label="Renderer"
                value={rendererId}
                onChange={(value) => {
                  setRendererId(value);
                  clearGenerated();
                }}
                options={props.renderers.map((renderer) => ({
                  value: renderer.id,
                  label: `${renderer.name}${renderer.stylePack ? "" : " (plugin code excluded)"}`,
                  disabled: !renderer.stylePack
                }))}
                width="100%"
              />
              <CheckboxInput
                label="Export unredacted content"
                value={reveal}
                onChange={(value) => {
                  setReveal(value);
                  clearGenerated();
                }}
                width="100%"
              />
              {reveal && (
                <Banner
                  status="warning"
                  title="Unredacted export"
                  description="The HTML may contain credentials, private source code, and canonical payloads."
                  collapsible={false}
                />
              )}
              <Banner
                status="info"
                title="Offline and read-only"
                description="Replay runs entirely inside this file. It cannot contact or send prompts to a coding agent."
                collapsible={false}
              />
              {error && <Banner status="error" title="HTML export failed" description={error} collapsible={false} />}
              <Button label="Generate preview" variant="secondary" onClick={() => void generate()} isLoading={generating} isDisabled={generating} width="100%" />
            </aside>
            <section className="agentjourney-html-export-preview" aria-label="Interactive HTML preview">
              {previewUrl ? (
                <iframe
                  title="Interactive HTML export preview"
                  src={previewUrl}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <EmptyState
                  title="Preview not generated"
                  description="Generate the self-contained file to inspect its exact downloadable bytes."
                  isCompact
                />
              )}
            </section>
          </LayoutContent>
        )}
        footer={(
          <LayoutFooter hasDivider>
            <div className="agentjourney-astryx-actions">
              <Button label="Close" variant="secondary" onClick={() => requestClose(false)} isDisabled={generating} />
              <Button label="Download HTML" variant="primary" onClick={() => void download()} isLoading={generating} isDisabled={generating} />
            </div>
          </LayoutFooter>
        )}
      />
    </Dialog>
  );
}
