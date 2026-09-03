import { useEffect, useMemo, useRef } from "react";
import type { RendererTreeDocument, StageDocument } from "@agentjourney/contracts";
import type { RendererIntent, RendererPlugin } from "@agentjourney/plugin-sdk";
import { buildStageSource, projectStageDocument } from "@agentjourney/portability";

function isRendererIntent(value: unknown): value is RendererIntent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; activityId?: unknown };
  return typeof candidate.activityId === "string" &&
    ["seek-activity", "open-evidence", "copy-content", "annotate-activity"].includes(String(candidate.type));
}

export function StageFrame(props: {
  document: StageDocument;
  renderer: RendererPlugin;
  rendererTree?: RendererTreeDocument | undefined;
  fixedHeight?: boolean | undefined;
  onIntent?: (intent: RendererIntent) => void;
}): React.ReactNode {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const portRef = useRef<MessagePort | null>(null);
  const projectedDocument = useMemo(() => projectStageDocument(props.document), [props.document]);
  const documentRef = useRef(projectedDocument);
  documentRef.current = projectedDocument;
  const srcDoc = useMemo(() => buildStageSource(props.renderer), [props.renderer]);

  useEffect(() => {
    portRef.current?.postMessage({
      type: "render",
      document: projectedDocument,
      ...(props.rendererTree ? { rendererTree: props.rendererTree } : {})
    });
  }, [projectedDocument, props.rendererTree]);
  useEffect(() => () => portRef.current?.close(), [srcDoc]);

  const connect = (): void => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    portRef.current?.close();
    const channel = new MessageChannel();
    portRef.current = channel.port1;
    channel.port1.onmessage = (event: MessageEvent) => {
      if (event.data?.type === "height" && iframeRef.current && !props.fixedHeight) {
        iframeRef.current.style.height = `${Math.max(400, Math.min(Number(event.data.height) || 400, 30_000))}px`;
      }
      if (event.data?.type === "intent" && isRendererIntent(event.data.intent)) {
        props.onIntent?.(event.data.intent);
      }
    };
    channel.port1.start();
    frameWindow.postMessage({ type: "agentjourney:init" }, "*", [channel.port2]);
    channel.port1.postMessage({
      type: "render",
      document: documentRef.current,
      ...(props.rendererTree ? { rendererTree: props.rendererTree } : {})
    });
  };

  return (
    <iframe
      key={`${props.renderer.manifest.id}:${props.document.presentation.view}`}
      ref={iframeRef}
      className={`journey-stage${props.fixedHeight ? " journey-stage-fixed" : ""}`}
      title={`${props.renderer.manifest.displayName} Journey Stage`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      onLoad={connect}
    />
  );
}
