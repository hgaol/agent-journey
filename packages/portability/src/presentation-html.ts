import type { ActivityDocument, StageDocument } from "@agentjourney/contracts";
import type { RendererPlugin } from "@agentjourney/plugin-sdk";

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

function activityHtml(activity: ActivityDocument, index: number, note?: string): string {
  const payload = activity.payload === undefined
    ? ""
    : `<details><summary>Source detail</summary><pre>${escapeHtml(JSON.stringify(activity.payload, null, 2))}</pre></details>`;
  const capabilities = (activity.toolCapabilities ?? []).map((value) => `<span>${escapeHtml(value)}</span>`).join("");
  return `<article class="activity" data-index="${index}" data-kind="${escapeHtml(activity.kind)}" data-thread="${escapeHtml(activity.threadId)}">
<header><strong>${escapeHtml(activity.kind)}</strong>${activity.nativeName ? `<b>${escapeHtml(activity.nativeName)}</b>` : ""}${capabilities}<time>${escapeHtml(activity.timestamp ?? "")}</time></header>
${activity.text ? `<div class="text">${escapeHtml(activity.text)}</div>` : ""}
${note ? `<aside>${escapeHtml(note)}</aside>` : ""}
${payload}<footer>${escapeHtml(activity.evidenceAnchor)}</footer></article>`;
}

export function renderPresentationHtml(stage: StageDocument, renderer: RendererPlugin): string {
  const annotations = new Map(stage.annotations.map((annotation) => [annotation.evidenceAnchor, annotation]));
  const activities = stage.activities.map((activity, index) => activityHtml(activity, index, annotations.get(activity.evidenceAnchor)?.note)).join("\n");
  const css = safeCss(renderer.css);
  const canAutoReplay = stage.activities.length > 1 && stage.activities.every((activity) => Boolean(activity.timestamp) || Boolean(activity.deliveryTrace?.every((chunk) => chunk.timestamp || chunk.offsetMs !== undefined)));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none';"><title>${escapeHtml(stage.title ?? "AgentJourney presentation")}</title>
<style>
:root{--stage-bg:#101214;--stage-panel:#171a1e;--stage-border:#2a2f36;--stage-text:#e8eaed;--stage-muted:#9299a2;--stage-accent:#7dd3fc;--stage-human:#172b35;--stage-tool:#111c24;--stage-reason:#211c2e;--stage-radius:10px;--stage-font:system-ui,sans-serif;--stage-mono:ui-monospace,monospace}${css}
*{box-sizing:border-box}body{margin:0;background:var(--stage-bg);color:var(--stage-text);font-family:var(--stage-font)}nav{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid var(--stage-border);background:color-mix(in srgb,var(--stage-bg) 92%,transparent)}nav strong{margin-right:auto}nav button,nav select{border:1px solid var(--stage-border);background:var(--stage-panel);color:var(--stage-text);border-radius:6px;padding:6px 9px}nav input[type=range]{width:min(360px,35vw);accent-color:var(--stage-accent)}main{width:min(900px,calc(100% - 30px));margin:40px auto 100px}.intro{margin-bottom:28px}.intro h1{font-size:30px;margin:0}.intro p{color:var(--stage-muted)}.activity{margin:10px 0;padding:14px;border:1px solid var(--stage-border);border-radius:var(--stage-radius);background:var(--stage-panel)}.activity[data-kind=human-input]{background:var(--stage-human)}.activity[data-kind=tool-invocation],.activity[data-kind=tool-result]{background:var(--stage-tool)}.activity[data-kind=reasoning],.activity[data-kind=context-injection]{background:var(--stage-reason)}.activity[data-thread]:not([data-thread=main]){margin-left:28px;border-left:3px solid var(--stage-accent)}.activity header{display:flex;gap:8px;align-items:center;color:var(--stage-muted);font:10px var(--stage-mono);text-transform:uppercase}.activity header strong{color:var(--stage-accent)}.activity header time{margin-left:auto}.activity header span{border:1px solid var(--stage-border);border-radius:999px;padding:2px 5px}.text{margin-top:10px;white-space:pre-wrap;line-height:1.55}.activity pre{white-space:pre-wrap;overflow:auto;background:rgba(0,0,0,.2);padding:10px}.activity aside{margin-top:10px;padding:8px;border-left:2px solid #fbbf24;color:var(--stage-muted)}.activity footer{margin-top:9px;color:var(--stage-muted);font:9px var(--stage-mono)}.warning{color:${stage.presentation.redacted ? "#6ee7b7" : "#fca5a5"};font-size:10px}@media(max-width:600px){nav{flex-wrap:wrap}.activity[data-thread]:not([data-thread=main]){margin-left:12px}}
</style></head><body>
<nav><strong>AgentJourney · ${escapeHtml(renderer.manifest.displayName)}</strong><span class="warning">${stage.presentation.redacted ? "Presentation redaction enabled" : "UNREDACTED EXPORT"}</span><button id="review">Review</button><button id="play"${canAutoReplay ? "" : " disabled title=\"Timing is not fully evidenced; use the slider to step manually\""}>${canAutoReplay ? "Replay" : "Step only"}</button><input id="range" type="range" min="0" max="${Math.max(0, stage.activities.length - 1)}" value="${Math.max(0, stage.activities.length - 1)}"><span id="count">${stage.activities.length}/${stage.activities.length}</span></nav>
<main><section class="intro"><h1>${escapeHtml(stage.title ?? "Untitled Journey")}</h1><p>${escapeHtml(stage.sourceAgent)}${stage.sourceAgentVersion ? ` · ${escapeHtml(stage.sourceAgentVersion)}` : ""} · ${stage.coverageSummary.sourceRecords} source records · ${stage.activities.length} activities</p></section>${activities}</main>
<script>
const items=[...document.querySelectorAll('.activity')],range=document.getElementById('range'),count=document.getElementById('count');let timer;
function reveal(index){items.forEach((item,i)=>item.hidden=i>index);range.value=String(index);count.textContent=(index+1)+'/'+items.length}
document.getElementById('review').onclick=()=>{clearInterval(timer);reveal(items.length-1)};
document.getElementById('play').onclick=()=>{if(document.getElementById('play').disabled)return;clearInterval(timer);let i=0;reveal(i);timer=setInterval(()=>{i+=1;if(i>=items.length){clearInterval(timer);return}reveal(i)},500)};
range.oninput=()=>{clearInterval(timer);reveal(Number(range.value))};
</script></body></html>`;
}
