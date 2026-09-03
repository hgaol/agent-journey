import { useEffect, useMemo, useRef } from "react";
import type { RendererTreeDocument, StageDocument } from "@agentjourney/contracts";
import type { RendererIntent, RendererPlugin } from "@agentjourney/plugin-sdk";

const BASE_STAGE_CSS = `
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--stage-bg);color:var(--stage-text);font-family:var(--stage-font)}body{padding:24px}.stage{max-width:980px;margin:0 auto}.stage-head{display:flex;align-items:center;gap:12px;padding:4px 2px 22px;border-bottom:1px solid var(--stage-border);margin-bottom:20px}.brand-mark::before{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;font-weight:800}.stage-title{font-size:18px;margin:0;letter-spacing:-.02em}.stage-meta{margin-top:4px;color:var(--stage-muted);font:11px var(--stage-mono)}.thread{display:flex;gap:9px;align-items:center;margin:20px 0 8px;color:var(--stage-muted);font:11px var(--stage-mono);text-transform:uppercase;letter-spacing:.08em}.thread::after{content:"";height:1px;background:var(--stage-border);flex:1}.turn-marker{display:flex;align-items:center;gap:8px;margin:24px 0 5px;color:var(--stage-muted);font:9px var(--stage-mono);text-transform:uppercase;letter-spacing:.1em}.turn-marker::before{content:"";width:18px;height:1px;background:var(--stage-accent)}.activity{position:relative;margin:10px 0;padding:14px 15px;border:1px solid var(--stage-border);border-radius:var(--stage-radius);background:var(--stage-panel);box-shadow:0 8px 24px rgba(0,0,0,.08)}.activity[data-thread]:not([data-thread="main"]){margin-left:28px;border-left-width:3px}.activity[data-kind="human-input"]{background:var(--stage-human)}.activity[data-kind="tool-invocation"],.activity[data-kind="tool-result"]{background:var(--stage-tool)}.activity[data-kind="reasoning"],.activity[data-kind="context-injection"]{background:var(--stage-reason)}.activity[data-kind="diagnostic"],.activity[data-status="failed"]{border-color:#b94a55}.activity-head{display:flex;align-items:center;gap:8px;color:var(--stage-muted);font:10px var(--stage-mono);text-transform:uppercase;letter-spacing:.06em}.activity-kind{color:var(--stage-accent);font-weight:700}.activity-time{margin-left:auto}.activity-time-clock,.reasoning-native-title{display:none}.activity-text{overflow-wrap:anywhere;line-height:1.58;font-size:13px;margin:10px 0 0}.markdown-line:empty{height:.7em}.markdown-heading{margin:12px 0 5px;font-size:1.05em}.markdown-bullet{display:flex;gap:8px;padding-left:12px}.markdown-list-marker{flex:none}.markdown-code{overflow:auto;padding:10px;border-radius:6px;background:rgba(0,0,0,.28);white-space:pre;font:11px/1.5 var(--stage-mono)}.activity details,.activity-payload{margin-top:10px}.activity summary{cursor:pointer;color:var(--stage-muted);font-size:11px}.activity-payload pre{max-height:320px;overflow:auto;margin:8px 0 0;padding:10px;border-radius:6px;background:rgba(0,0,0,.22);font:11px/1.5 var(--stage-mono);white-space:pre-wrap}.evidence,.annotate{border:0;background:transparent;color:var(--stage-muted);padding:0;cursor:pointer;font:10px var(--stage-mono)}.evidence{margin-top:10px}.evidence:hover,.annotate:hover{color:var(--stage-accent)}.annotate{font-size:13px;margin-left:2px}.annotate.has-note{color:#fbbf24}.capability{border:1px solid var(--stage-border);padding:2px 5px;border-radius:999px;text-transform:none;letter-spacing:0}.tool-timeout,.tool-duration,.tool-native-summary,.stage-native-footer-separator,.stage-native-footer-effort,.stage-native-footer-permission{display:none}.review-note{margin-top:10px;padding:8px 10px;border-left:2px solid #fbbf24;background:rgba(251,191,36,.06);color:var(--stage-muted);font-size:11px;white-space:pre-wrap}mark{background:#facc15;color:#17120a;border-radius:2px;padding:0 1px}.empty{padding:60px 10px;text-align:center;color:var(--stage-muted)}
`;

const TERMINAL_STAGE_CSS = `
html,body{background:var(--stage-bg);font-family:var(--stage-mono);scrollbar-color:var(--stage-border) var(--stage-bg)}body{padding:0}.stage{max-width:980px;margin:0 auto;padding:18px 12px 100px}.stage-native-tabs,.stage-native-pi-help,.stage-native-workspace,.stage-native-composer,.stage-native-footer{display:none}.stage-head{padding:4px 8px 16px;margin-bottom:12px;border-bottom:1px solid var(--stage-border)}.brand-mark::before{width:28px;height:28px;border-radius:2px}.stage-heading-copy{display:grid;gap:2px;min-width:0;flex:1}.stage-product-line{display:flex;align-items:baseline;gap:7px}.stage-title{font-size:13px}.stage-version,.stage-runtime,.stage-workspace,.stage-session-title,.stage-redaction{color:var(--stage-muted);font-size:9px}.stage-workspace,.stage-session-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stage-session-title{opacity:.75}.stage-redaction{margin-left:auto}.thread{margin:17px 8px 7px;font-size:8px}.turn-marker{margin:18px 8px 3px;font-size:8px}.activity{display:grid;grid-template-columns:20px minmax(0,1fr);column-gap:4px;margin:0;padding:6px 9px;border:0;border-radius:0;background:transparent!important;box-shadow:none;cursor:default}.activity:hover,.activity.selected{background:color-mix(in srgb,var(--stage-accent) 7%,transparent)!important}.activity[data-thread]:not([data-thread="main"]){margin-left:22px;border-left:1px solid var(--stage-border)}.activity[data-kind="human-input"]{grid-template-columns:20px minmax(0,1fr);margin:12px 7px 10px;padding:11px 12px;border-left:2px solid var(--stage-accent);background:var(--stage-human)!important}.activity[data-kind="agent-output"]{padding-top:9px;padding-bottom:12px}.activity[data-kind="tool-result"]{color:var(--stage-muted);padding-top:2px;padding-bottom:5px}.activity[data-kind="state-transition"],.activity[data-kind="usage-observation"]{opacity:.72;font-size:10px}.activity[data-kind="diagnostic"],.activity[data-status="failed"]{color:#fca5a5}.activity-marker{grid-row:1 / span 5;color:var(--stage-accent);font-weight:800;line-height:17px}.activity-head{grid-column:2;min-height:16px;font-size:8px;letter-spacing:.05em}.activity[data-kind="agent-output"] .activity-head{display:none}.activity-time{opacity:.65}.activity-text,.collapsed-activity,.activity-payload,.review-note,.evidence,.tool-argument{grid-column:2}.activity-text{margin:2px 0 0;font-family:var(--stage-font);font-size:12px;line-height:1.55}.activity[data-kind="human-input"] .activity-text{font-family:var(--stage-mono);font-size:11px}.activity[data-kind="tool-result"] .activity-text{font-family:var(--stage-mono);font-size:10px;max-height:150px;overflow:hidden}.markdown-heading{font-family:var(--stage-font)}.markdown-code{border-left:1px solid var(--stage-border);border-radius:0;background:rgba(0,0,0,.18)}.tool-argument{margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--stage-muted);font:10px/1.45 var(--stage-mono)}.activity details,.activity-payload{margin-top:3px}.activity summary{font-size:9px}.activity-payload pre{max-height:220px;border-left:1px solid var(--stage-border);border-radius:0;font-size:9px}.capability{padding:1px 4px}.annotate{font-size:10px}.evidence{margin-top:4px;font-size:8px;opacity:0}.activity:hover>.evidence,.evidence:focus{opacity:.8}.review-note{font-size:9px}mark{background:#fde047;color:#111}
`;

export const STAGE_SCRIPT = `
let channel;
const labels={"human-input":"You","context-injection":"Context","agent-output":"Agent","reasoning":"Reasoning","tool-invocation":"Tool call","tool-result":"Tool result","approval-request":"Approval requested","approval-decision":"Approval decision","state-transition":"State","usage-observation":"Usage","artifact":"Artifact","diagnostic":"Diagnostic","unclassified":"Unclassified"};
const productNames={"claude-code":"Claude Code","codex-cli":"OpenAI Codex","pi":"Pi","github-copilot-cli":"GitHub Copilot CLI"};
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
function readableTime(value){if(!value)return "";try{return new Date(value).toLocaleString()}catch{return value}}
function readableClock(value){if(!value)return "";try{return new Date(value).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",hour12:false})}catch{return value}}
function compactWorkspace(value){return String(value||"workspace unknown").replace(/^\\/home\\/[^/]+(?=\\/|$)/u,"~")}
function reasoningLevel(payload){if(!payload||typeof payload!=="object"||Array.isArray(payload))return undefined;const collaboration=payload.collaboration_mode&&typeof payload.collaboration_mode==="object"&&!Array.isArray(payload.collaboration_mode)?payload.collaboration_mode:{};const settings=collaboration.settings&&typeof collaboration.settings==="object"&&!Array.isArray(collaboration.settings)?collaboration.settings:{};return payload.reasoningEffort??payload.thinkingLevel??payload.model_reasoning_effort??settings.reasoning_effort}
function appendHighlighted(parent,text,query){if(!query){parent.append(document.createTextNode(text));return}const lower=text.toLocaleLowerCase(),needle=query.toLocaleLowerCase();let cursor=0,index=lower.indexOf(needle);while(index>=0){parent.append(document.createTextNode(text.slice(cursor,index)));parent.append(node("mark",null,text.slice(index,index+query.length)));cursor=index+query.length;index=lower.indexOf(needle,cursor)}parent.append(document.createTextNode(text.slice(cursor)))}
function appendInline(parent,text,query){const pattern=/(\\x60[^\\x60]+\\x60|\\*\\*[^*]+\\*\\*|https?:\\/\\/[^\\s)]+|\\[[^\\]]+\\]\\([^)]+\\)|(?:\\/[A-Za-z0-9_.@~+:-]+)+(?:[A-Za-z0-9_.@~+:-]+)?|(?:[A-Za-z0-9_.@+-]+\\/)+[A-Za-z0-9_.@+:-]*)/g;let cursor=0;for(const match of String(text).matchAll(pattern)){const index=match.index??0;if(index>cursor)appendHighlighted(parent,String(text).slice(cursor,index),query);const raw=match[0];let shown=raw,className="path-token",tag="span";if(raw.charCodeAt(0)===96){shown=raw.slice(1,-1);className="inline-code";tag="code"}else if(raw.startsWith("**")){shown=raw.slice(2,-2);className="markdown-strong";tag="strong"}else if(raw.startsWith("http://")||raw.startsWith("https://")){className="link-token"}else if(raw.startsWith("[")){shown=raw.slice(1,raw.indexOf("]"));className="link-token"}const token=node(tag,className);appendHighlighted(token,shown,query);parent.append(token);cursor=index+raw.length}if(cursor<String(text).length)appendHighlighted(parent,String(text).slice(cursor),query)}
function appendMarkdown(parent,text,query){const lines=String(text).split(/\\r?\\n/);let codeLines=null;for(const line of lines){if(line.startsWith(String.fromCharCode(96,96,96))){if(codeLines===null)codeLines=[];else{const pre=node("pre","markdown-code");const code=node("code");appendHighlighted(code,codeLines.join("\\n"),query);pre.append(code);parent.append(pre);codeLines=null}continue}if(codeLines!==null){codeLines.push(line);continue}const heading=/^(#{1,4})\\s+(.*)$/.exec(line);const bullet=/^([-*]|\\d+[.)])\\s+(.*)$/.exec(line);const element=heading?node("h"+Math.min(6,heading[1].length+2),"markdown-heading"):bullet?node("div","markdown-bullet"):node("div","markdown-line");if(bullet){element.append(node("span","markdown-list-marker",bullet[1]==="-"||bullet[1]==="*"?"•":bullet[1]));const content=node("span","markdown-list-content");appendInline(content,bullet[2],query);element.append(content)}else appendInline(element,heading?.[2]??line,query);parent.append(element)}if(codeLines!==null){const pre=node("pre","markdown-code");pre.textContent=codeLines.join("\\n");parent.append(pre)}}
const allowedTreeTags=new Set(["div","main","section","article","header","footer","h1","h2","h3","h4","p","span","pre","code","details","summary","ul","ol","li","button","img"]);
function renderTreeNode(value){if(!value||!allowedTreeTags.has(value.tag))return node("div","empty","Invalid renderer node");const element=node(value.tag,value.className,value.text);if(value.title)element.title=value.title;if(value.tag==="img"){const asset=globalThis.agentJourneyAssets?.[value.assetPath];if(asset)element.src=asset;element.alt=value.title||""}if(value.intent){element.tabIndex=0;element.onclick=()=>channel?.postMessage({type:"intent",intent:value.intent})}for(const child of value.children||[])element.append(renderTreeNode(child));return element}
function conciseToolArgument(payload){if(payload===undefined||payload===null)return "";if(typeof payload==="string")return payload.slice(0,260);if(typeof payload!=="object"||Array.isArray(payload))return String(payload).slice(0,260);for(const key of ["command","cmd","file_path","path","pattern","query","url"]){if(typeof payload[key]==="string")return payload[key].slice(0,260)}const text=JSON.stringify(payload);return text==="{}"?"":text.slice(0,260)}
function toolTimeout(payload){if(!payload||typeof payload!=="object"||Array.isArray(payload))return "";const value=payload.timeout;if(typeof value!=="number"&&typeof value!=="string")return "";const shown=String(value).trim();return shown?"(timeout "+shown+(String(Number(shown))===shown?"s":"")+")":""}
function evidencedDuration(start,end){if(!start||!end)return "";const elapsed=Date.parse(end)-Date.parse(start);return Number.isFinite(elapsed)&&elapsed>=0?"Took "+(elapsed/1000).toFixed(1)+"s":""}
function nativeToolElapsed(start,end){if(!start||!end)return "";const elapsed=Date.parse(end)-Date.parse(start);return Number.isFinite(elapsed)&&elapsed>=10000?Math.floor(elapsed/1000)+"s":""}
function nativeToolSummary(activity,result,query){const summary=node("div","tool-native-summary");const payload=activity.payload&&typeof activity.payload==="object"&&!Array.isArray(activity.payload)?activity.payload:{};if(String(activity.nativeName||"").toLocaleLowerCase()==="report_intent"&&typeof payload.intent==="string"){appendHighlighted(summary,'intent: "'+payload.intent+'"',query);if(result){appendHighlighted(summary," "+(String(result.text||"").split(/\\r?\\n/)[0]||"Intent logged"),query)}return summary}if(typeof payload.description==="string"){const description=node("span","tool-description");appendHighlighted(description,payload.description,query);summary.append(description)}if(result?.text){const normalized=String(result.text).replace(/\\r?\\n$/u,"");const count=normalized?normalized.split(/\\r?\\n/u).length:0;if(count){summary.append(node("span","tool-line-count",count+" "+(count===1?"line":"lines")+"…"))}}const elapsed=nativeToolElapsed(activity.timestamp,result?.timestamp);if(elapsed)summary.append(node("span","tool-native-elapsed",elapsed));return summary.childNodes.length?summary:null}
function renderActivity(activity,annotation,query,selectedActivityId,duration,linkedToolResult){
  const container=node("article","activity");container.dataset.kind=activity.kind;container.dataset.thread=activity.threadId;container.dataset.activityId=activity.id;if(activity.nativeName)container.dataset.nativeName=activity.nativeName.toLocaleLowerCase();if(activity.toolCapabilities?.length)container.dataset.capabilities=activity.toolCapabilities.join(" ");if(activity.status)container.dataset.status=activity.status;if(activity.id===selectedActivityId)container.classList.add("selected");
  const markers={"human-input":"❯","agent-output":"◆","reasoning":"∟","context-injection":"∟","tool-invocation":"●","tool-result":"└","approval-request":"?","approval-decision":"✓","state-transition":"·","usage-observation":"·","artifact":"◇","diagnostic":"!","unclassified":"?"};
  container.append(node("span","activity-marker",markers[activity.kind]||"·"));container.tabIndex=0;container.onclick=event=>{if(event.target.closest("button,a,input,summary"))return;channel?.postMessage({type:"intent",intent:{type:"seek-activity",activityId:activity.id}})};
  const head=node("div","activity-head");head.append(node("span","activity-kind",labels[activity.kind]||activity.kind));
  if(activity.nativeName)head.append(node("span","native-name",activity.nativeName));
  for(const capability of activity.toolCapabilities||[])head.append(node("span","capability",capability));
  if(activity.status)head.append(node("span","status",activity.status));
  const annotate=node("button","annotate"+(annotation?.note?" has-note":""),annotation?.bookmarked?"★":"☆");annotate.type="button";annotate.title="Bookmark or annotate";annotate.onclick=event=>{event.stopPropagation();channel?.postMessage({type:"intent",intent:{type:"annotate-activity",activityId:activity.id}})};head.append(annotate);
  if(activity.timestamp){const time=node("time","activity-time");time.append(node("span","activity-time-full",readableTime(activity.timestamp)),node("span","activity-time-clock",readableClock(activity.timestamp)));head.append(time)}
  container.append(head);
  if(activity.text){const collapsible=activity.kind==="reasoning"||activity.kind==="context-injection";let renderedText=activity.text,nativeReasoningTitle="";if(activity.kind==="reasoning"){const lines=String(activity.text).split(/\\r?\\n/);const firstIndex=lines.findIndex(line=>line.trim());const firstLine=firstIndex>=0?lines[firstIndex].trim():"";if(firstLine&&firstLine.length<=120){nativeReasoningTitle=firstLine.replace(/^#{1,4}\\s+/,"").replace(/^\\*\\*(.*)\\*\\*$/,"$1");renderedText=lines.slice(firstIndex+1).join("\\n").replace(/^\\s*\\n/,"")}}const text=node("div","activity-text");if(renderedText)appendMarkdown(text,renderedText,query);if(collapsible){const details=node("details","collapsed-activity");const summary=node("summary");summary.append(node("span","reasoning-generic-label",activity.kind==="reasoning"?"Show reasoning":"Show injected context"));const nativeTitle=node("span","reasoning-native-title");appendHighlighted(nativeTitle,nativeReasoningTitle||"Thinking",query);summary.append(nativeTitle);details.append(summary);if(renderedText)details.append(text);if((query&&activity.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))||getComputedStyle(document.documentElement).getPropertyValue("--stage-expand-reasoning").trim()==="1")details.open=true;container.append(details)}else container.append(text)}
  if(activity.kind==="tool-invocation"){const nativeSummary=nativeToolSummary(activity,linkedToolResult,query);if(nativeSummary)container.append(nativeSummary);const argument=conciseToolArgument(activity.payload);if(argument){const detail=node("div","tool-argument");appendInline(detail,argument,query);const timeout=toolTimeout(activity.payload);if(timeout)detail.append(node("span","tool-timeout",timeout));container.append(detail)}}
  if(duration)container.append(node("div","tool-duration",duration));
  if(annotation?.note)container.append(node("div","review-note",annotation.note));
  if(activity.payload!==undefined){const details=node("details","activity-payload");const summary=node("summary",null,"Source detail");const pre=node("pre",null,JSON.stringify(activity.payload,null,2));details.append(summary,pre);container.append(details)}
  const evidence=node("button","evidence",activity.evidenceAnchor);evidence.type="button";evidence.onclick=event=>{event.stopPropagation();channel?.postMessage({type:"intent",intent:{type:"open-evidence",activityId:activity.id}});};container.append(evidence);
  return container;
}
function render(documentValue,rendererTree){
  const root=document.getElementById("root");root.replaceChildren();
  if(rendererTree?.root){root.append(renderTreeNode(rendererTree.root));requestAnimationFrame(()=>channel?.postMessage({type:"height",height:document.documentElement.scrollHeight}));return}
  const stage=node("main","stage");
  const nativeTabs=node("nav","stage-native-tabs");for(const [index,label] of ["Current","Sessions","Issues","Pull requests","Gists"].entries()){nativeTabs.append(node("span",index===0?"active":"",label))}stage.append(nativeTabs);
  const heading=node("header","stage-head");heading.append(node("span","brand-mark"));const titleWrap=node("div","stage-heading-copy");const productLine=node("div","stage-product-line");productLine.append(node("h1","stage-title",productNames[documentValue.sourceAgent]||documentValue.sourceAgent));if(documentValue.sourceAgentVersion)productLine.append(node("span","stage-version","v"+documentValue.sourceAgentVersion.replace(/^v/,"")));titleWrap.append(productLine);const runtime=documentValue.models?.[0]||documentValue.modelProvider||"";if(runtime)titleWrap.append(node("div","stage-runtime",runtime));if(documentValue.workspace)titleWrap.append(node("div","stage-workspace",compactWorkspace(documentValue.workspace)));if(documentValue.title)titleWrap.append(node("div","stage-session-title",documentValue.title));const piHelp=node("div","stage-native-pi-help");const piHelpLine=node("div","stage-native-pi-help-line");for(const [key,detail] of [["escape"," interrupt · "],["ctrl+c/ctrl+d"," clear/exit · "],["/"," commands · "],["!"," bash · "],["ctrl+o"," more"]]){piHelpLine.append(node("span","stage-native-pi-key",key),document.createTextNode(detail))}piHelp.append(piHelpLine,node("div","stage-native-pi-help-more","Press ctrl+o to show full startup help and loaded resources."));titleWrap.append(piHelp);heading.append(titleWrap);heading.append(node("span","stage-redaction",documentValue.presentation.redacted?"masked":"unredacted"));stage.append(heading);
  let activities=documentValue.activities;
  if(documentValue.presentation.view==="replay"){const index=activities.findIndex(item=>item.id===documentValue.presentation.playheadActivityId);activities=activities.slice(0,index<0?1:index+1);const current=activities[activities.length-1];if(current&&documentValue.presentation.playheadDeliveryChunk!==undefined&&current.deliveryTrace){const chunks=current.deliveryTrace.slice(0,documentValue.presentation.playheadDeliveryChunk+1);activities=[...activities.slice(0,-1),{...current,text:chunks.map(chunk=>chunk.text).join("")}]}}
  const effortValue=[...activities].reverse().map(activity=>reasoningLevel(activity.payload)).find(value=>typeof value==="string");if(effortValue)stage.dataset.thinkingLevel=String(effortValue).toLocaleLowerCase();const permissionValue=[...activities].reverse().map(activity=>activity.payload&&typeof activity.payload==="object"&&!Array.isArray(activity.payload)?activity.payload.permissionMode??activity.payload.approval_policy:undefined).find(value=>typeof value==="string");
  if(activities.length===0)stage.append(node("div","empty","No canonical activity in this interpretation."));
  const annotations=new Map((documentValue.annotations||[]).map(item=>[item.evidenceAnchor,item]));const turns=new Map();for(const turn of documentValue.turns||[]){if(turn.activityIds[0])turns.set(turn.activityIds[0],turn)}
  const activitiesById=new Map(activities.map(activity=>[activity.id,activity]));const toolResultsByInvocation=new Map();for(const result of activities){if(result.kind!=="tool-result")continue;const invocationId=result.links?.find(link=>link.relation==="result-of")?.targetActivityId;if(invocationId&&!toolResultsByInvocation.has(invocationId))toolResultsByInvocation.set(invocationId,result)}let lastThread;
  for(const activity of activities){const turn=turns.get(activity.id);if(turn)stage.append(node("div","turn-marker",(turn.boundaryProvenance==="evidenced"?"Evidenced":"Inferred")+" turn"));if(activity.threadId!==lastThread){stage.append(node("div","thread",activity.threadId==="main"?"Main journey":activity.threadId));lastThread=activity.threadId}const invocationId=activity.kind==="tool-result"?activity.links?.find(link=>link.relation==="result-of")?.targetActivityId:undefined;const invocation=invocationId?activitiesById.get(invocationId):undefined;const duration=evidencedDuration(invocation?.timestamp,activity.timestamp);stage.append(renderActivity(activity,annotations.get(activity.evidenceAnchor),documentValue.presentation.searchQuery||"",documentValue.presentation.selectedActivityId,duration,toolResultsByInvocation.get(activity.id)))}
  stage.append(node("div","stage-native-workspace",compactWorkspace(documentValue.workspace)));const nativeComposer=node("div","stage-native-composer");nativeComposer.append(node("span",null,"❯"),node("i"));stage.append(nativeComposer);const nativeFooter=node("footer","stage-native-footer");const nativeHelp=node("span","stage-native-footer-help");nativeHelp.append(node("strong","stage-native-footer-key","←"),document.createTextNode(" open sidebar · "),node("strong","stage-native-footer-key","/"),document.createTextNode(" commands · "),node("strong","stage-native-footer-key","?"),document.createTextNode(" help · "),node("strong","stage-native-footer-key","tab"),document.createTextNode(" next tab"));const nativeModel=node("span","stage-native-footer-model");nativeModel.append(node("span","stage-native-footer-model-name",documentValue.models?.[0]||"model unknown"));if(effortValue){const effortLabels={xhigh:"Extra High",high:"High",medium:"Medium",low:"Low",minimal:"Minimal",none:"None",max:"Max"};nativeModel.append(node("span","stage-native-footer-separator"," · "),node("span","stage-native-footer-effort",effortLabels[effortValue]||effortValue))}if(documentValue.gitBranch)nativeModel.append(node("span","stage-native-footer-branch"," · "+documentValue.gitBranch));const permissionLabels={"on-request":"Ask for approval",never:"Never ask for approval",untrusted:"Ask for untrusted commands"};const nativePermission=node("span","stage-native-footer-permission");if(permissionValue==="bypassPermissions")nativePermission.append(node("strong","stage-native-footer-permission-mode","›› bypass permissions on"),node("span","stage-native-footer-permission-help"," (shift+tab to cycle) · ← for agents"));else nativePermission.textContent=permissionLabels[permissionValue]||permissionValue||"";nativeFooter.append(nativeHelp,node("span","stage-native-footer-workspace",compactWorkspace(documentValue.workspace)),nativeModel,nativePermission);stage.append(nativeFooter);
  root.append(stage);requestAnimationFrame(()=>{channel?.postMessage({type:"height",height:document.documentElement.scrollHeight});if(documentValue.presentation.view==="replay")window.scrollTo({top:document.documentElement.scrollHeight,behavior:"smooth"})});
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none';"><style>${BASE_STAGE_CSS}\n${TERMINAL_STAGE_CSS}\n${safeCss}</style></head><body><div id="root"></div><script>${STAGE_SCRIPT}\n${assetBootstrap}<\/script></body></html>`;
}

export function projectStageDocument(documentValue: StageDocument): StageDocument {
  if (documentValue.presentation.view !== "replay") return documentValue;
  const index = documentValue.activities.findIndex(({ id }) => id === documentValue.presentation.playheadActivityId);
  const activities = documentValue.activities.slice(0, index < 0 ? 1 : index + 1);
  const current = activities.at(-1);
  const chunkIndex = documentValue.presentation.playheadDeliveryChunk;
  const simulatedTextLength = documentValue.presentation.playheadSimulatedTextLength;
  let projectedActivities = activities;
  if (current && simulatedTextLength !== undefined && current.text !== undefined) {
    projectedActivities = [
      ...activities.slice(0, -1),
      { ...current, text: [...current.text].slice(0, simulatedTextLength).join("") }
    ];
  } else if (current && chunkIndex !== undefined && current.deliveryTrace) {
    projectedActivities = [
      ...activities.slice(0, -1),
      {
        ...current,
        text: current.deliveryTrace.slice(0, chunkIndex + 1).map(({ text }) => text).join("")
      }
    ];
  }
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
      key={props.renderer.manifest.id}
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
