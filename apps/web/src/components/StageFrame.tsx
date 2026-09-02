import { useEffect, useMemo, useRef } from "react";
import type { RendererTreeDocument, StageDocument } from "@agentjourney/contracts";
import type { RendererIntent, RendererPlugin } from "@agentjourney/plugin-sdk";

const BASE_STAGE_CSS = `
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--stage-bg);color:var(--stage-text);font-family:var(--stage-font)}body{padding:24px}.stage{max-width:980px;margin:0 auto}.stage-head{display:flex;align-items:center;gap:12px;padding:4px 2px 22px;border-bottom:1px solid var(--stage-border);margin-bottom:20px}.brand-mark::before{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;font-weight:800}.stage-title{font-size:18px;margin:0;letter-spacing:-.02em}.stage-meta{margin-top:4px;color:var(--stage-muted);font:11px var(--stage-mono)}.thread{display:flex;gap:9px;align-items:center;margin:20px 0 8px;color:var(--stage-muted);font:11px var(--stage-mono);text-transform:uppercase;letter-spacing:.08em}.thread::after{content:"";height:1px;background:var(--stage-border);flex:1}.turn-marker{display:flex;align-items:center;gap:8px;margin:24px 0 5px;color:var(--stage-muted);font:9px var(--stage-mono);text-transform:uppercase;letter-spacing:.1em}.turn-marker::before{content:"";width:18px;height:1px;background:var(--stage-accent)}.activity{position:relative;margin:10px 0;padding:14px 15px;border:1px solid var(--stage-border);border-radius:var(--stage-radius);background:var(--stage-panel);box-shadow:0 8px 24px rgba(0,0,0,.08)}.activity[data-thread]:not([data-thread="main"]){margin-left:28px;border-left-width:3px}.activity[data-kind="human-input"]{background:var(--stage-human)}.activity[data-kind="tool-invocation"],.activity[data-kind="tool-result"]{background:var(--stage-tool)}.activity[data-kind="reasoning"],.activity[data-kind="context-injection"]{background:var(--stage-reason)}.activity[data-kind="diagnostic"],.activity[data-status="failed"]{border-color:#b94a55}.activity-head{display:flex;align-items:center;gap:8px;color:var(--stage-muted);font:10px var(--stage-mono);text-transform:uppercase;letter-spacing:.06em}.activity-kind{color:var(--stage-accent);font-weight:700}.activity-time{margin-left:auto}.activity-text{overflow-wrap:anywhere;line-height:1.58;font-size:13px;margin:10px 0 0}.markdown-line:empty{height:.7em}.markdown-heading{margin:12px 0 5px;font-size:1.05em}.markdown-bullet{padding-left:12px}.markdown-code{overflow:auto;padding:10px;border-radius:6px;background:rgba(0,0,0,.28);white-space:pre;font:11px/1.5 var(--stage-mono)}.activity details,.activity-payload{margin-top:10px}.activity summary{cursor:pointer;color:var(--stage-muted);font-size:11px}.activity-payload pre{max-height:320px;overflow:auto;margin:8px 0 0;padding:10px;border-radius:6px;background:rgba(0,0,0,.22);font:11px/1.5 var(--stage-mono);white-space:pre-wrap}.evidence,.annotate{border:0;background:transparent;color:var(--stage-muted);padding:0;cursor:pointer;font:10px var(--stage-mono)}.evidence{margin-top:10px}.evidence:hover,.annotate:hover{color:var(--stage-accent)}.annotate{font-size:13px;margin-left:2px}.annotate.has-note{color:#fbbf24}.capability{border:1px solid var(--stage-border);padding:2px 5px;border-radius:999px;text-transform:none;letter-spacing:0}.review-note{margin-top:10px;padding:8px 10px;border-left:2px solid #fbbf24;background:rgba(251,191,36,.06);color:var(--stage-muted);font-size:11px;white-space:pre-wrap}mark{background:#facc15;color:#17120a;border-radius:2px;padding:0 1px}.empty{padding:60px 10px;text-align:center;color:var(--stage-muted)}
`;

export const STAGE_SCRIPT = `
let channel;
const labels={"human-input":"You","context-injection":"Context","agent-output":"Agent","reasoning":"Reasoning","tool-invocation":"Tool call","tool-result":"Tool result","approval-request":"Approval requested","approval-decision":"Approval decision","state-transition":"State","usage-observation":"Usage","artifact":"Artifact","diagnostic":"Diagnostic","unclassified":"Unclassified"};
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
function readableTime(value){if(!value)return "";try{return new Date(value).toLocaleString()}catch{return value}}
function appendHighlighted(parent,text,query){if(!query){parent.textContent=text;return}const lower=text.toLocaleLowerCase(),needle=query.toLocaleLowerCase();let cursor=0,index=lower.indexOf(needle);while(index>=0){parent.append(document.createTextNode(text.slice(cursor,index)));parent.append(node("mark",null,text.slice(index,index+query.length)));cursor=index+query.length;index=lower.indexOf(needle,cursor)}parent.append(document.createTextNode(text.slice(cursor)))}
function appendMarkdown(parent,text,query){const lines=String(text).split(/\\r?\\n/);let codeLines=null;for(const line of lines){if(line.startsWith(String.fromCharCode(96,96,96))){if(codeLines===null)codeLines=[];else{const pre=node("pre","markdown-code");const code=node("code");appendHighlighted(code,codeLines.join("\\n"),query);pre.append(code);parent.append(pre);codeLines=null}continue}if(codeLines!==null){codeLines.push(line);continue}const heading=/^(#{1,4})\\s+(.*)$/.exec(line);const bullet=/^[-*]\\s+(.*)$/.exec(line);const element=heading?node("h"+Math.min(6,heading[1].length+2),"markdown-heading"):bullet?node("div","markdown-bullet"):node("div","markdown-line");appendHighlighted(element,(bullet?"• ":"")+(heading?.[2]??bullet?.[1]??line),query);parent.append(element)}if(codeLines!==null){const pre=node("pre","markdown-code");pre.textContent=codeLines.join("\\n");parent.append(pre)}}
const allowedTreeTags=new Set(["div","main","section","article","header","footer","h1","h2","h3","h4","p","span","pre","code","details","summary","ul","ol","li","button","img"]);
function renderTreeNode(value){if(!value||!allowedTreeTags.has(value.tag))return node("div","empty","Invalid renderer node");const element=node(value.tag,value.className,value.text);if(value.title)element.title=value.title;if(value.tag==="img"){const asset=globalThis.agentJourneyAssets?.[value.assetPath];if(asset)element.src=asset;element.alt=value.title||""}if(value.intent){element.tabIndex=0;element.onclick=()=>channel?.postMessage({type:"intent",intent:value.intent})}for(const child of value.children||[])element.append(renderTreeNode(child));return element}
function renderActivity(activity,annotation,query){
  const container=node("article","activity");container.dataset.kind=activity.kind;container.dataset.thread=activity.threadId;if(activity.status)container.dataset.status=activity.status;
  const head=node("div","activity-head");head.append(node("span","activity-kind",labels[activity.kind]||activity.kind));
  if(activity.nativeName)head.append(node("span","native-name",activity.nativeName));
  for(const capability of activity.toolCapabilities||[])head.append(node("span","capability",capability));
  if(activity.status)head.append(node("span","status",activity.status));
  const annotate=node("button","annotate"+(annotation?.note?" has-note":""),annotation?.bookmarked?"★":"☆");annotate.type="button";annotate.title="Bookmark or annotate";annotate.onclick=()=>channel?.postMessage({type:"intent",intent:{type:"annotate-activity",activityId:activity.id}});head.append(annotate);
  if(activity.timestamp)head.append(node("time","activity-time",readableTime(activity.timestamp)));
  container.append(head);
  if(activity.text){const text=node("div","activity-text");appendMarkdown(text,activity.text,query);if(activity.kind==="reasoning"||activity.kind==="context-injection"){const details=node("details","collapsed-activity");details.append(node("summary",null,activity.kind==="reasoning"?"Show reasoning":"Show injected context"),text);if(query&&activity.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))details.open=true;container.append(details)}else container.append(text)}
  if(annotation?.note)container.append(node("div","review-note",annotation.note));
  if(activity.payload!==undefined){const details=node("details","activity-payload");const summary=node("summary",null,"Source detail");const pre=node("pre",null,JSON.stringify(activity.payload,null,2));details.append(summary,pre);container.append(details)}
  const evidence=node("button","evidence",activity.evidenceAnchor);evidence.type="button";evidence.onclick=()=>channel?.postMessage({type:"intent",intent:{type:"open-evidence",activityId:activity.id}});container.append(evidence);
  return container;
}
function render(documentValue,rendererTree){
  const root=document.getElementById("root");root.replaceChildren();
  if(rendererTree?.root){root.append(renderTreeNode(rendererTree.root));requestAnimationFrame(()=>channel?.postMessage({type:"height",height:document.documentElement.scrollHeight}));return}
  const stage=node("main","stage");
  const heading=node("header","stage-head");heading.append(node("span","brand-mark"));const titleWrap=node("div");titleWrap.append(node("h1","stage-title",documentValue.title||"Untitled journey"),node("div","stage-meta",documentValue.sourceAgent+(documentValue.sourceAgentVersion?" · "+documentValue.sourceAgentVersion:"")+(documentValue.presentation.redacted?" · secrets masked":" · unredacted")));heading.append(titleWrap);stage.append(heading);
  let activities=documentValue.activities;
  if(documentValue.presentation.view==="replay"){const index=activities.findIndex(item=>item.id===documentValue.presentation.playheadActivityId);activities=activities.slice(0,index<0?1:index+1);const current=activities[activities.length-1];if(current&&documentValue.presentation.playheadDeliveryChunk!==undefined&&current.deliveryTrace){const chunks=current.deliveryTrace.slice(0,documentValue.presentation.playheadDeliveryChunk+1);activities=[...activities.slice(0,-1),{...current,text:chunks.map(chunk=>chunk.text).join("")}]}}
  if(activities.length===0)stage.append(node("div","empty","No canonical activity in this interpretation."));
  const annotations=new Map((documentValue.annotations||[]).map(item=>[item.evidenceAnchor,item]));const turns=new Map();for(const turn of documentValue.turns||[]){if(turn.activityIds[0])turns.set(turn.activityIds[0],turn)}
  let lastThread;
  for(const activity of activities){const turn=turns.get(activity.id);if(turn)stage.append(node("div","turn-marker",(turn.boundaryProvenance==="evidenced"?"Evidenced":"Inferred")+" turn"));if(activity.threadId!==lastThread){stage.append(node("div","thread",activity.threadId==="main"?"Main journey":activity.threadId));lastThread=activity.threadId}stage.append(renderActivity(activity,annotations.get(activity.evidenceAnchor),documentValue.presentation.searchQuery||""))}
  root.append(stage);requestAnimationFrame(()=>channel?.postMessage({type:"height",height:document.documentElement.scrollHeight}));
}
window.addEventListener("message",event=>{if(event.data?.type!=="agentjourney:init"||!event.ports[0])return;channel=event.ports[0];channel.onmessage=message=>{if(message.data?.type==="render")render(message.data.document,message.data.rendererTree)};channel.start()});
new ResizeObserver(()=>channel?.postMessage({type:"height",height:document.documentElement.scrollHeight})).observe(document.documentElement);
`;

export function buildStageSource(renderer: RendererPlugin): string {
  const safeCss = renderer.css.replaceAll("</style", "<\\/style");
  const assets = Object.fromEntries((renderer.assets ?? []).map((asset) => [
    asset.path,
    `data:${asset.mediaType};base64,${asset.base64}`
  ]));
  const assetBootstrap = `globalThis.agentJourneyAssets=Object.freeze(JSON.parse(${JSON.stringify(JSON.stringify(assets).replaceAll("<", "\\u003c"))}));`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none';"><style>${BASE_STAGE_CSS}\n${safeCss}</style></head><body><div id="root"></div><script>${STAGE_SCRIPT}\n${assetBootstrap}<\/script></body></html>`;
}

export function projectStageDocument(documentValue: StageDocument): StageDocument {
  if (documentValue.presentation.view !== "replay") return documentValue;
  const index = documentValue.activities.findIndex(({ id }) => id === documentValue.presentation.playheadActivityId);
  const activities = documentValue.activities.slice(0, index < 0 ? 1 : index + 1);
  const current = activities.at(-1);
  const chunkIndex = documentValue.presentation.playheadDeliveryChunk;
  const projectedActivities = current && chunkIndex !== undefined && current.deliveryTrace
    ? [
        ...activities.slice(0, -1),
        {
          ...current,
          text: current.deliveryTrace.slice(0, chunkIndex + 1).map(({ text }) => text).join("")
        }
      ]
    : activities;
  const visibleIds = new Set(projectedActivities.map(({ id }) => id));
  return {
    ...documentValue,
    activities: projectedActivities,
    turns: documentValue.turns
      .map((turn) => ({ ...turn, activityIds: turn.activityIds.filter((id) => visibleIds.has(id)) }))
      .filter(({ activityIds }) => activityIds.length > 0),
    threads: documentValue.threads.filter((thread) =>
      thread.id === "main" || projectedActivities.some(({ threadId }) => threadId === thread.id)
    )
  };
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
      if (event.data?.type === "height" && iframeRef.current) {
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
      key={props.renderer.manifest.id}
      ref={iframeRef}
      className="journey-stage"
      title={`${props.renderer.manifest.displayName} Journey Stage`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      onLoad={connect}
    />
  );
}
