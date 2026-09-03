import { useEffect, useMemo, useRef } from "react";
import type { RendererTreeDocument, StageDocument } from "@agentjourney/contracts";
import type { RendererIntent, RendererPlugin } from "@agentjourney/plugin-sdk";
import { buildStageSource, projectStageDocument } from "@agentjourney/portability";

function inputDraftProjectionKey(documentValue: StageDocument): string | undefined {
  const draft = documentValue.presentation.simulatedInputDraft;
  if (!draft) return undefined;
  return [
    documentValue.revisionId,
    documentValue.interpretationId,
    documentValue.presentation.view,
    documentValue.presentation.playheadActivityId,
    draft.activityId,
    documentValue.activities.length,
    documentValue.activities.at(-1)?.id ?? "",
    documentValue.presentation.redacted,
    documentValue.presentation.searchQuery ?? "",
    documentValue.presentation.selectedActivityId ?? "",
    documentValue.annotations.length
  ].join("\u0000");
}

function streamedActivityProjectionKey(documentValue: StageDocument): string | undefined {
  const presentation = documentValue.presentation;
  if (
    presentation.playheadSimulatedTextLength === undefined
    && presentation.playheadDeliveryChunk === undefined
  ) return undefined;
  const activity = documentValue.activities.at(-1);
  if (!activity || activity.id !== presentation.playheadActivityId) return undefined;
  return [
    documentValue.revisionId,
    documentValue.interpretationId,
    presentation.view,
    activity.id,
    activity.kind,
    documentValue.activities.length,
    presentation.redacted,
    presentation.searchQuery ?? "",
    presentation.selectedActivityId ?? "",
    documentValue.annotations.length
  ].join("\u0000");
}

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
  const lastInputDraftProjectionRef = useRef<string | undefined>(undefined);
  const lastStreamedActivityProjectionRef = useRef<string | undefined>(undefined);
  const projectedDocument = useMemo(() => projectStageDocument(props.document), [props.document]);
  const documentRef = useRef(projectedDocument);
  documentRef.current = projectedDocument;
  const srcDoc = useMemo(() => buildStageSource(props.renderer), [props.renderer]);

  useEffect(() => {
    const draft = projectedDocument.presentation.simulatedInputDraft;
    const draftProjection = inputDraftProjectionKey(projectedDocument);
    const streamedActivity = projectedDocument.activities.at(-1);
    const streamedActivityProjection = streamedActivityProjectionKey(projectedDocument);
    if (!props.rendererTree && draft && draftProjection === lastInputDraftProjectionRef.current) {
      portRef.current?.postMessage({
        type: "input-draft",
        activityId: draft.activityId,
        text: draft.text
      });
    } else if (
      !props.rendererTree
      && streamedActivity
      && streamedActivityProjection
      && streamedActivityProjection === lastStreamedActivityProjectionRef.current
    ) {
      portRef.current?.postMessage({
        type: "activity-text",
        activityId: streamedActivity.id,
        text: streamedActivity.text ?? ""
      });
    } else {
      portRef.current?.postMessage({
        type: "render",
        document: projectedDocument,
        ...(props.rendererTree ? { rendererTree: props.rendererTree } : {})
      });
    }
    lastInputDraftProjectionRef.current = draftProjection;
    lastStreamedActivityProjectionRef.current = streamedActivityProjection;
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
    lastInputDraftProjectionRef.current = inputDraftProjectionKey(documentRef.current);
    lastStreamedActivityProjectionRef.current = streamedActivityProjectionKey(documentRef.current);
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
