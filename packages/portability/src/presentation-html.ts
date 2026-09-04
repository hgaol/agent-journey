import {
  canAutoPlayReplay,
  deriveReplayFrames,
  type ReplayFrame,
  type ReplayStreamMode
} from "@agentjourney/activity-graph";
import type { StageDocument } from "@agentjourney/contracts";
import type { RendererPlugin } from "@agentjourney/plugin-sdk";
import { buildStageSource } from "./interactive-stage.js";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeCss(css: string): string {
  return css
    .replace(/@import[^;]+;/giu, "")
    .replace(/url\s*\([^)]*\)/giu, "none")
    .replace(/expression\s*\([^)]*\)/giu, "")
    .replaceAll("</style", "<\\/style");
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

interface ExportReplayPlan {
  frames: ReplayFrame[];
  canAutoPlay: boolean;
}

function replayPlans(stage: StageDocument): Record<string, ExportReplayPlan> {
  const plans: Record<string, ExportReplayPlan> = {};
  for (const streamMode of ["events", "recorded", "simulated"] satisfies ReplayStreamMode[]) {
    for (const simulateHumanInput of [false, true]) {
      const frames = deriveReplayFrames(stage.activities, { streamMode, simulateHumanInput });
      plans[`${streamMode}:${simulateHumanInput ? "typed" : "instant"}`] = {
        frames,
        canAutoPlay: canAutoPlayReplay(frames, streamMode)
      };
    }
  }
  return plans;
}

export function renderPresentationHtml(stage: StageDocument, renderer: RendererPlugin): string {
  const { javascript: _javascript, ...inertRenderer } = renderer;
  const stageSource = buildStageSource({ ...inertRenderer, css: safeCss(renderer.css) });
  const plans = replayPlans(stage);
  const recordedAvailable = stage.fidelity.deliveryTraces;
  const title = stage.title ?? "Untitled Journey";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; media-src 'none'; frame-src 'self' data: blob:; child-src 'self' data: blob:; object-src 'none'; form-action 'none'; base-uri 'none';"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark;--bg:#090b0c;--panel:#101315;--panel2:#171b1e;--line:#293036;--text:#e8ebed;--dim:#89939a;--accent:#8abeb7;--warning:#fbbf24}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--bg);color:var(--text);font:12px/1.4 ui-monospace,"SFMono-Regular",Cascadia Code,Consolas,monospace}body{display:grid;grid-template-rows:44px minmax(0,1fr) auto}.export-head{display:flex;min-width:0;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line);background:var(--panel)}.export-head strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.export-head code{color:var(--accent);font-size:10px}.export-head .spacer{flex:1}.badge{padding:4px 6px;border:1px solid #285a49;border-radius:2px;background:#10231c;color:#6ee7b7;font-size:9px}.badge.unsafe{border-color:#773b43;background:#28161a;color:#fca5a5}.stage-wrap{min-height:0;background:#292c33}.stage-wrap iframe{display:block;width:100%;height:100%;border:0;background:#292c33}.transport{display:flex;min-width:0;align-items:center;gap:6px;overflow-x:auto;padding:8px 10px;border-top:1px solid var(--line);background:var(--panel)}button,select{flex:none;border:1px solid var(--line);border-radius:2px;background:var(--panel2);color:var(--dim);padding:6px 8px;font:inherit}button{cursor:pointer}button:hover:not(:disabled),button.active{border-color:var(--accent);color:var(--text)}button:disabled,select:disabled{opacity:.4;cursor:not-allowed}.transport input[type=range]{min-width:130px;flex:1;accent-color:var(--accent)}.transport output{min-width:72px;color:var(--accent);font-size:10px}.transport small{min-width:180px;color:var(--dim);font-size:9px;text-align:right}.transport label{display:flex;align-items:center;gap:4px;color:var(--dim);font-size:9px}.hidden{display:none!important}@media(max-width:760px){body{grid-template-rows:auto minmax(0,1fr) auto}.export-head{min-height:44px;flex-wrap:wrap;padding:7px 10px}.export-head .spacer{display:none}.transport{flex-wrap:wrap}.transport input[type=range]{order:20;flex-basis:100%}.transport small{min-width:0;flex:1;text-align:left}}
</style></head><body>
<header class="export-head"><code>AgentJourney</code><strong>${escapeHtml(title)}</strong><span class="spacer"></span><span>${escapeHtml(renderer.manifest.displayName)}</span><span class="badge${stage.presentation.redacted ? "" : " unsafe"}">${stage.presentation.redacted ? "Presentation redaction enabled" : "UNREDACTED EXPORT"}</span></header>
<main class="stage-wrap"><iframe id="agentjourney-export-stage" title="${escapeHtml(renderer.manifest.displayName)} Journey Stage" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></main>
<footer class="transport">
<button id="review" class="active">Review</button><button id="replay">Replay</button><button id="pause" disabled>Ⅱ</button>
<input id="range" aria-label="Replay playhead" type="range" min="0" max="0" value="0"><output id="count">Review</output>
<label>content <select id="stream"><option value="events">Event steps</option><option value="recorded"${recordedAvailable ? "" : " disabled"}>Recorded stream${recordedAvailable ? "" : " · unavailable"}</option><option value="simulated">Simulated TUI stream</option></select></label>
<label>prompt <select id="prompt"><option value="instant">Instant</option><option value="typed" selected>Simulated typing/paste</option></select></label>
<label>timeline <select id="timeline-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
<label id="stream-speed-wrap" class="hidden">stream <select id="stream-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option></select></label>
<label id="typing-speed-wrap">typing <select id="typing-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
<small id="fidelity">full Review</small>
</footer>
<script>
const stageDocument=${scriptJson(stage)};
const replayPlans=${scriptJson(plans)};
const stageSource=${scriptJson(stageSource)};
const frame=document.getElementById('agentjourney-export-stage');
const reviewButton=document.getElementById('review'),replayButton=document.getElementById('replay'),pauseButton=document.getElementById('pause'),range=document.getElementById('range'),count=document.getElementById('count'),stream=document.getElementById('stream'),promptMode=document.getElementById('prompt'),timelineSpeed=document.getElementById('timeline-speed'),streamSpeed=document.getElementById('stream-speed'),typingSpeed=document.getElementById('typing-speed'),streamSpeedWrap=document.getElementById('stream-speed-wrap'),typingSpeedWrap=document.getElementById('typing-speed-wrap'),fidelity=document.getElementById('fidelity');
let port,index=0,playing=false,reviewing=true,timer,presentedAt=0,lastFrame;
function key(){return stream.value+':'+promptMode.value}
function plan(){return replayPlans[key()]||{frames:[],canAutoPlay:false}}
function currentFrame(){return plan().frames[index]}
function inputDraft(value){if(value.simulatedInputTextLength===undefined)return undefined;const activity=stageDocument.activities.find(item=>item.id===value.activityId);if(!activity||typeof activity.text!=='string')return undefined;return{activityId:activity.id,text:[...activity.text].slice(0,value.simulatedInputTextLength).join('')}}
function documentAt(value){const draft=inputDraft(value);return{...stageDocument,presentation:{...stageDocument.presentation,view:'replay',streamMode:stream.value,playheadActivityId:value.activityId,...(value.deliveryChunkIndex!==undefined?{playheadDeliveryChunk:value.deliveryChunkIndex}:{}),...(value.simulatedTextLength!==undefined?{playheadSimulatedTextLength:value.simulatedTextLength}:{}),...(draft?{simulatedInputDraft:draft}:{})}}}
function sendDocument(documentValue){lastFrame=undefined;port?.postMessage({type:'render',document:documentValue})}
function streamedText(value){const activity=stageDocument.activities.find(item=>item.id===value.activityId);if(!activity)return'';if(value.simulatedTextLength!==undefined&&typeof activity.text==='string')return[...activity.text].slice(0,value.simulatedTextLength).join('');if(value.deliveryChunkIndex!==undefined&&activity.deliveryTrace)return activity.deliveryTrace.slice(0,value.deliveryChunkIndex+1).map(chunk=>chunk.text).join('');return activity.text||''}
function sendFrame(value){const previous=lastFrame,draft=inputDraft(value);if(previous&&previous.activityId===value.activityId){if(draft&&previous.simulatedInputTextLength!==undefined){port?.postMessage({type:'input-draft',activityId:draft.activityId,text:draft.text});lastFrame=value;return}const response=value.simulatedTextLength!==undefined||value.deliveryChunkIndex!==undefined;const previousResponse=previous.simulatedTextLength!==undefined||previous.deliveryChunkIndex!==undefined;if(response&&previousResponse){port?.postMessage({type:'activity-text',activityId:value.activityId,text:streamedText(value)});lastFrame=value;return}}port?.postMessage({type:'render',document:documentAt(value)});lastFrame=value}
function frameLabel(value){if(!value)return'manual';if(value.simulatedInputPaste)return'SIMULATED prompt paste';if(value.simulatedInputTextLength!==undefined)return'SIMULATED prompt typing';if(value.streamSource==='simulated')return'SIMULATED cadence';if(value.deliveryChunkIndex!==undefined)return'recorded chunk '+(value.deliveryChunkIndex+1);if(value.timing==='evidenced')return'evidenced timestamp';if(value.timing==='source-order')return'untimed · source-order placement';return'manual step'}
function updateControls(){const activePlan=plan(),value=currentFrame();range.max=String(Math.max(0,activePlan.frames.length-1));range.value=String(Math.min(index,Math.max(0,activePlan.frames.length-1)));count.textContent=reviewing?'Review':(activePlan.frames.length?index+1:0)+'/'+activePlan.frames.length;fidelity.textContent=reviewing?'full Review':frameLabel(value);reviewButton.classList.toggle('active',reviewing);replayButton.classList.toggle('active',!reviewing);replayButton.disabled=!activePlan.canAutoPlay;pauseButton.disabled=reviewing||!activePlan.canAutoPlay;pauseButton.textContent=playing?'Ⅱ':'▶';streamSpeedWrap.classList.toggle('hidden',stream.value==='events');typingSpeedWrap.classList.toggle('hidden',promptMode.value==='instant')}
function showReview(){stop();reviewing=true;index=Math.max(0,plan().frames.length-1);sendDocument({...stageDocument,presentation:{...stageDocument.presentation,view:'review',streamMode:stream.value}});updateControls()}
function showFrame(nextIndex){const frames=plan().frames;if(!frames.length)return;reviewing=false;index=Math.max(0,Math.min(nextIndex,frames.length-1));sendFrame(frames[index]);updateControls()}
function delay(current,next){const within=current.activityId===next.activityId&&(next.streamSource==='recorded'||next.streamSource==='simulated');const promptFrame=within&&(next.simulatedInputTextLength!==undefined||next.inputSubmitted===true);const paste=promptFrame&&(current.simulatedInputPaste===true||next.simulatedInputPaste===true);const selected=paste?1:promptFrame?Number(typingSpeed.value):within?Number(streamSpeed.value):Number(timelineSpeed.value);const minimum=next.inputSubmitted?180:promptFrame?15:within?4:next.timing==='source-order'?12:16;return Math.max(minimum,Math.min(5000,(next.displayOffsetMs-current.displayOffsetMs)/(selected>0?selected:1)))}
function stop(){playing=false;clearTimeout(timer);updateControls()}
function schedule(){if(!playing)return;const frames=plan().frames;if(index>=frames.length-1){stop();return}const base=delay(frames[index],frames[index+1]);const gap=index===0?Math.max(400,base):base;const target=presentedAt+gap;timer=setTimeout(()=>{const fired=performance.now();let next=index+1,shownAt=target;while(next<frames.length-1){const catchUp=delay(frames[next],frames[next+1]);if(shownAt+catchUp>fired)break;shownAt+=catchUp;next+=1}presentedAt=shownAt;showFrame(next);schedule()},Math.max(0,target-performance.now()))}
function start(){const activePlan=plan();if(!activePlan.frames.length)return;reviewing=false;index=0;showFrame(0);if(!activePlan.canAutoPlay){playing=false;updateControls();return}playing=true;presentedAt=performance.now();updateControls();schedule()}
function togglePause(){if(reviewing||!plan().canAutoPlay)return;if(playing){stop();return}playing=true;presentedAt=performance.now();updateControls();schedule()}
function resetPlan(){stop();index=0;showReview()}
reviewButton.onclick=showReview;replayButton.onclick=start;pauseButton.onclick=togglePause;range.oninput=()=>{const requestedIndex=Number(range.value);stop();showFrame(requestedIndex)};stream.onchange=resetPlan;promptMode.onchange=resetPlan;timelineSpeed.onchange=()=>{if(playing){presentedAt=performance.now();clearTimeout(timer);schedule()}};streamSpeed.onchange=timelineSpeed.onchange;typingSpeed.onchange=timelineSpeed.onchange;
frame.onload=()=>{const channel=new MessageChannel();port=channel.port1;port.onmessage=event=>{const intent=event.data?.intent;if(event.data?.type==='intent'&&intent?.type==='seek-activity'){const target=plan().frames.findIndex(value=>value.activityId===intent.activityId);if(target>=0){stop();showFrame(target)}}};port.start();frame.contentWindow.postMessage({type:'agentjourney:init'},'*',[channel.port2]);showReview();document.documentElement.dataset.exportReady='true'};
frame.srcdoc=stageSource;
</script></body></html>`;
}
