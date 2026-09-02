import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { SqliteJourneyArchive } from "@agentjourney/archive";
import { piAdapter } from "@agentjourney/builtin-adapters";
import { MemorySource } from "@agentjourney/plugin-sdk/testing";
import { fixturePath } from "@agentjourney/test-fixtures";

const dataRoot = path.resolve(".agentjourney/e2e");
await rm(dataRoot, { recursive: true, force: true });
const root = fixturePath("pi");
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
const [candidate] = await piAdapter.discover(source);
const interpretation = await piAdapter.interpret(candidate!, source);
const archive = await SqliteJourneyArchive.open(path.join(dataRoot, "archive"));
await archive.commitCapture({
  files: candidate!.relativePaths.map((relativePath) => ({ relativePath, bytes: source.readBytes(relativePath) })),
  interpretation
});
archive.close();
