import { fileURLToPath } from "node:url";
import path from "node:path";

export const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

export function fixturePath(sourceAgent: "claude-code" | "codex-cli" | "pi" | "github-copilot-cli"): string {
  return path.join(fixtureRoot, sourceAgent);
}
