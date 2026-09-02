import type { StylePackPlugin } from "@agentjourney/plugin-sdk";

const neutral: StylePackPlugin = {
  manifest: {
    id: "builtin.neutral",
    version: "0.1.0",
    displayName: "AgentJourney",
    interfaceVersion: "1.0.0",
    kind: "style-pack"
  },
  css: `
:root { --stage-bg:#101214; --stage-panel:#171a1e; --stage-border:#2a2f36; --stage-text:#e8eaed; --stage-muted:#9299a2; --stage-accent:#7dd3fc; --stage-human:#172b35; --stage-agent:#171a1e; --stage-tool:#111c24; --stage-reason:#211c2e; --stage-radius:12px; --stage-font:Inter,ui-sans-serif,system-ui,sans-serif; --stage-mono:"SFMono-Regular",Consolas,monospace; }
.brand-mark::before { content:"AJ"; }
`
};

const claude: StylePackPlugin = {
  manifest: {
    id: "builtin.claude-code",
    version: "0.2.0",
    displayName: "Claude Code",
    targetSourceAgent: "claude-code",
    interfaceVersion: "1.0.0",
    kind: "style-pack"
  },
  css: `
:root { --stage-bg:#2b2d32; --stage-panel:#2b2d32; --stage-border:#484a4f; --stage-text:#f1f1f2; --stage-muted:#a4a4a8; --stage-accent:#d98363; --stage-human:#3a3a3a; --stage-agent:#2b2d32; --stage-tool:#2b2d32; --stage-reason:#2b2d32; --stage-radius:0; --stage-font:"SFMono-Regular","Cascadia Mono",Consolas,monospace; --stage-mono:"SFMono-Regular","Cascadia Mono",Consolas,monospace; }
html,body{background:#2b2d32;color:#f1f1f2;font-size:14px}.stage{max-width:none;padding:10px 0 90px}.stage-head{align-items:flex-start;margin:0 14px 30px;padding:0;border:0}.brand-mark{position:relative;width:58px;height:50px;flex:none}.brand-mark::before{content:"";display:block;position:absolute;left:3px;top:1px;width:52px;height:47px;background:#d98363;clip-path:polygon(20% 0,80% 0,80% 13%,100% 13%,100% 64%,84% 64%,84% 100%,70% 100%,70% 73%,59% 73%,59% 100%,43% 100%,43% 73%,30% 73%,30% 100%,16% 100%,16% 64%,0 64%,0 13%,20% 13%)}.brand-mark::after{content:"";position:absolute;left:18px;top:14px;width:5px;height:7px;background:#2b2d32;box-shadow:19px 0 #2b2d32}.stage-title{font-size:15px;letter-spacing:0}.stage-version{font-size:13px}.stage-runtime,.stage-workspace{font-size:12px;line-height:1.35}.stage-session-title,.stage-redaction,.thread,.turn-marker{display:none}.activity{padding:5px 16px 5px 22px;grid-template-columns:18px minmax(0,1fr);font-size:13px}.activity:hover,.activity.selected{background:#ffffff08!important}.activity[data-kind="human-input"]{margin:8px 0 14px;padding:7px 10px 7px 4px;border:0;background:#3a3a3a!important;grid-template-columns:22px minmax(0,1fr)}.activity[data-kind="human-input"] .activity-head{display:none}.activity[data-kind="human-input"] .activity-text{font-size:14px;line-height:1.55}.activity[data-kind="human-input"] .activity-marker{font-size:0;color:#777}.activity[data-kind="human-input"] .activity-marker::after{content:"❯";font-size:15px}.activity[data-kind="agent-output"]{padding-top:9px;padding-bottom:12px}.activity[data-kind="agent-output"] .activity-marker{font-size:0;color:#f7f7f7}.activity[data-kind="agent-output"] .activity-marker::after{content:"●";font-size:12px}.activity[data-kind="agent-output"] .activity-text{font:14px/1.65 var(--stage-mono)}.activity[data-kind="tool-invocation"]{padding-top:7px;padding-bottom:2px}.activity[data-kind="tool-invocation"] .activity-marker{color:#f7f7f7}.activity[data-kind="tool-invocation"] .activity-kind{display:none}.activity[data-kind="tool-invocation"] .native-name{color:#f1f1f2;font-size:13px;text-transform:none}.activity[data-kind="tool-invocation"] .capability{display:none}.activity[data-kind="tool-invocation"] .status{margin-left:5px;color:#999;text-transform:lowercase}.activity[data-status="unknown"] .status{display:none}.activity[data-kind="tool-result"]{padding-top:1px;padding-bottom:7px;color:#a4a4a8}.activity[data-kind="tool-result"] .activity-head{display:none}.activity[data-kind="tool-result"] .activity-marker{color:#a4a4a8}.activity[data-kind="tool-result"] .activity-text{max-height:230px;font:12px/1.5 var(--stage-mono)}.activity[data-kind="reasoning"]{padding-top:4px;padding-bottom:4px;color:#a4a4a8}.activity[data-kind="reasoning"] .activity-head{display:none}.activity[data-kind="reasoning"] .activity-marker{color:#777}.activity[data-kind="reasoning"] details>summary{color:#a4a4a8;font-size:11px}.activity[data-kind="artifact"],.activity[data-kind="context-injection"],.activity[data-kind="state-transition"],.activity[data-kind="usage-observation"]{display:none}.activity-payload,.evidence,.annotate{display:none!important}.review-note{margin-left:0}.markdown-code{margin:8px 0;padding:8px 12px;border-left:2px solid #686a70;background:#23252a}.markdown-bullet{padding-left:0}.markdown-heading{font-size:13px}.activity[data-status="failed"]{color:#ff8f8f}
`
};

const codex: StylePackPlugin = {
  manifest: {
    id: "builtin.codex-cli",
    version: "0.1.0",
    displayName: "Codex",
    targetSourceAgent: "codex-cli",
    interfaceVersion: "1.0.0",
    kind: "style-pack"
  },
  css: `
:root { --stage-bg:#090b0b; --stage-panel:#111414; --stage-border:#29302e; --stage-text:#f1f5f3; --stage-muted:#8e9b96; --stage-accent:#10b981; --stage-human:#10211b; --stage-agent:#111414; --stage-tool:#0e1916; --stage-reason:#151b19; --stage-radius:3px; --stage-font:ui-monospace,"SFMono-Regular",Consolas,monospace; --stage-mono:ui-monospace,"SFMono-Regular",Consolas,monospace; }
.brand-mark::before { content:">_"; color:#10b981; border:1px solid #10b981; }
.stage-title::after { content:" / Codex"; color:var(--stage-accent); font-size:.72em; }
.activity { box-shadow:none; }
.activity[data-kind="tool-invocation"],.activity[data-kind="tool-result"] { border-color:#255b49; }
.activity[data-kind="agent-output"] .activity-kind,.activity[data-kind="tool-invocation"] .activity-kind{font-size:0}.activity[data-kind="agent-output"] .activity-kind::after{content:"codex";font-size:10px}.activity[data-kind="tool-invocation"] .activity-kind::after{content:"command";font-size:10px}
`
};

const pi: StylePackPlugin = {
  manifest: {
    id: "builtin.pi",
    version: "0.1.0",
    displayName: "Pi",
    targetSourceAgent: "pi",
    interfaceVersion: "1.0.0",
    kind: "style-pack"
  },
  css: `
:root { --stage-bg:#10101a; --stage-panel:#18182a; --stage-border:#33335b; --stage-text:#efefff; --stage-muted:#9c9ac2; --stage-accent:#a78bfa; --stage-human:#1c2440; --stage-agent:#18182a; --stage-tool:#121e2b; --stage-reason:#241d38; --stage-radius:10px; --stage-font:ui-monospace,"SFMono-Regular",Consolas,monospace; --stage-mono:ui-monospace,"SFMono-Regular",Consolas,monospace; }
.brand-mark::before { content:"π"; color:#fff; background:linear-gradient(135deg,#7c3aed,#2563eb); }
.stage-title::after { content:" · pi"; color:#a78bfa; font-size:.75em; }
.activity[data-kind="reasoning"] { border-style:dashed; }
.activity[data-kind="agent-output"] .activity-kind,.activity[data-kind="reasoning"] .activity-kind{font-size:0}.activity[data-kind="agent-output"] .activity-kind::after{content:"assistant";font-size:10px}.activity[data-kind="reasoning"] .activity-kind::after{content:"thinking";font-size:10px}
`
};

const copilot: StylePackPlugin = {
  manifest: {
    id: "builtin.github-copilot-cli",
    version: "0.1.0",
    displayName: "GitHub Copilot CLI",
    targetSourceAgent: "github-copilot-cli",
    interfaceVersion: "1.0.0",
    kind: "style-pack"
  },
  css: `
:root { --stage-bg:#0d1117; --stage-panel:#161b22; --stage-border:#30363d; --stage-text:#f0f6fc; --stage-muted:#8b949e; --stage-accent:#a371f7; --stage-human:#17233b; --stage-agent:#161b22; --stage-tool:#13201a; --stage-reason:#211a33; --stage-radius:6px; --stage-font:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; --stage-mono:"SFMono-Regular",Consolas,monospace; }
.brand-mark::before { content:"<>"; color:#fff; background:linear-gradient(135deg,#8957e5,#388bfd); }
.stage-title::after { content:" · GitHub Copilot"; color:#bc8cff; font-size:.72em; }
.activity[data-kind="tool-invocation"] { border-left:3px solid #3fb950; }
.activity[data-kind="agent-output"] .activity-kind,.activity[data-kind="tool-invocation"] .activity-kind{font-size:0}.activity[data-kind="agent-output"] .activity-kind::after{content:"GitHub Copilot";font-size:10px}.activity[data-kind="tool-invocation"] .activity-kind::after{content:"used tool";font-size:10px}
`
};

export const builtInStylePacks = [neutral, claude, codex, pi, copilot] as const;

export function rendererForSourceAgent(sourceAgent: string): StylePackPlugin {
  return builtInStylePacks.find(({ manifest }) => manifest.targetSourceAgent === sourceAgent) ?? neutral;
}

export function rendererById(id: string): StylePackPlugin | undefined {
  return builtInStylePacks.find(({ manifest }) => manifest.id === id);
}
