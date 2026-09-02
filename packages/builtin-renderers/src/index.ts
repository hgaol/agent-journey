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
    version: "0.1.0",
    displayName: "Claude Code",
    targetSourceAgent: "claude-code",
    interfaceVersion: "1.0.0",
    kind: "style-pack"
  },
  css: `
:root { --stage-bg:#171512; --stage-panel:#201d19; --stage-border:#40382f; --stage-text:#eee7dc; --stage-muted:#a99d8d; --stage-accent:#d97757; --stage-human:#29231d; --stage-agent:#1d1a17; --stage-tool:#191f1b; --stage-reason:#25201b; --stage-radius:7px; --stage-font:ui-monospace,"SFMono-Regular",Consolas,monospace; --stage-mono:ui-monospace,"SFMono-Regular",Consolas,monospace; }
.brand-mark::before { content:"C"; color:#171512; background:#d97757; }
.stage-title::after { content:"  Claude Code"; color:var(--stage-muted); font-size:.75em; font-weight:500; }
.activity[data-kind="agent-output"] { border-left:2px solid #d97757; }
.activity[data-kind="human-input"] .activity-kind,.activity[data-kind="agent-output"] .activity-kind,.activity[data-kind="reasoning"] .activity-kind,.activity[data-kind="tool-invocation"] .activity-kind{font-size:0}.activity[data-kind="human-input"] .activity-kind::after{content:"user";font-size:10px}.activity[data-kind="agent-output"] .activity-kind::after{content:"assistant";font-size:10px}.activity[data-kind="reasoning"] .activity-kind::after{content:"thinking";font-size:10px}.activity[data-kind="tool-invocation"] .activity-kind::after{content:"tool use";font-size:10px}
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
