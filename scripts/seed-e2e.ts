import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { SqliteJourneyArchive } from "@agentjourney/archive";
import {
  claudeCodeAdapter,
  copilotCliAdapter,
  piAdapter
} from "@agentjourney/builtin-adapters";
import type { SourceAdapterPlugin } from "@agentjourney/plugin-sdk";
import { MemorySource } from "@agentjourney/plugin-sdk/testing";
import { fixturePath } from "@agentjourney/test-fixtures";

const dataRoot = path.resolve(".agentjourney/e2e");
await rm(dataRoot, { recursive: true, force: true });
const archive = await SqliteJourneyArchive.open(path.join(dataRoot, "archive"));

async function seed(
  sourceAgent: "pi" | "claude-code" | "github-copilot-cli",
  adapter: SourceAdapterPlugin
): Promise<void> {
  const root = fixturePath(sourceAgent);
  const files: Record<string, Uint8Array> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files[path.relative(root, absolute).split(path.sep).join("/")] = await readFile(absolute);
    }
  };
  await visit(root);
  const source = new MemorySource(files);
  const [candidate] = await adapter.discover(source);
  const interpretation = await adapter.interpret(candidate!, source);
  await archive.commitCapture({
    files: candidate!.relativePaths.map((relativePath) => ({
      relativePath,
      bytes: source.readBytes(relativePath)
    })),
    interpretation
  });
}

await seed("pi", piAdapter);
await seed("claude-code", claudeCodeAdapter);
await seed("github-copilot-cli", copilotCliAdapter);
archive.close();
