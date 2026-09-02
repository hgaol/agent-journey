export { claudeCodeAdapter } from "./claude.js";
export { codexCliAdapter } from "./codex.js";
export { piAdapter } from "./pi.js";
export { copilotCliAdapter } from "./copilot.js";

import type { SourceAdapterPlugin } from "@agentjourney/plugin-sdk";
import { claudeCodeAdapter } from "./claude.js";
import { codexCliAdapter } from "./codex.js";
import { piAdapter } from "./pi.js";
import { copilotCliAdapter } from "./copilot.js";

export const builtInAdapters: readonly SourceAdapterPlugin[] = [
  claudeCodeAdapter,
  codexCliAdapter,
  piAdapter,
  copilotCliAdapter
];

export function adapterBySourceAgent(sourceAgent: string): SourceAdapterPlugin | undefined {
  return builtInAdapters.find((adapter) => adapter.manifest.sourceAgent === sourceAgent);
}
