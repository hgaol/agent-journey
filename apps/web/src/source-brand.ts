export const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  "codex-cli": "Codex CLI",
  pi: "Pi",
  "github-copilot-cli": "GitHub Copilot CLI"
};

export function sourceLabel(sourceAgent: string): string {
  return SOURCE_LABELS[sourceAgent] ?? sourceAgent;
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
